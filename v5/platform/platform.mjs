import { createEvent, createId, createMembership, createNotification, createOrganisation, createOrganisationUnit, createPersonalEnvironment, createRole, createRoleAssignment, createUser, createWorkspaceDefinition, createWorkspaceInstance } from '../domain/foundation.mjs';
import { V5_DATABASE_NAME, V5_STORES } from '../persistence/schema.mjs';
import { V5IndexedDbPersistence } from '../persistence/indexeddb.mjs';
import { can, canAccessOwnership } from '../security/authorization.mjs';
import { PERMISSIONS, ROLE_TEMPLATES, STANDARD_WORKSPACES } from '../security/catalog.mjs';
import { createSessionService } from '../security/sessions.mjs';
import { createSharedWorkService } from './shared-work.mjs';
import { createCaptureService } from './capture.mjs';
import { createOfficeService } from './office.mjs';
import { createSchoolService } from './school.mjs';
import { createStudioService } from './studio.mjs';

const permissionCodes = new Set(PERMISSIONS.map(item => item.code));
const safeMetadata = metadata => Object.fromEntries(Object.entries(metadata || {}).filter(([key]) => !/secret|password|token|content/i.test(key)));

export async function createV5Platform(options = {}) {
  const persistence = options.persistence || await V5IndexedDbPersistence.open(options.indexedDB || globalThis.indexedDB, { databaseName: options.databaseName || V5_DATABASE_NAME });
  const context = options.context || {}, sessions = createSessionService(persistence, { ...context, cryptoApi: options.cryptoApi || context.cryptoApi || globalThis.crypto }), sharedWork=createSharedWorkService({persistence,sessions,context}), capture=createCaptureService({persistence,sessions,sharedWork,context}), office=createOfficeService({persistence,sessions,sharedWork,capture,context}), school=createSchoolService({persistence,sessions,sharedWork,capture,context}), studio=createStudioService({persistence,sessions,sharedWork,capture,context});
  const event = (kind, input) => createEvent(kind, { ...input, metadata: safeMetadata(input.metadata) }, context);
  async function actor(token) { const valid = await sessions.validate(token); if (!valid) throw Error('AUTHENTICATION_REQUIRED'); return valid.user; }
  async function permitted(userId, organisationId, permissionCode, unitId = null) { if (!permissionCodes.has(permissionCode) || !await can(persistence, { userId, organisationId, permissionCode, unitId })) throw Error('PERMISSION_DENIED'); }
  async function validateUnitScope(organisationId, unitIds = []) { for (const unitId of unitIds) { const unit = await persistence.get(V5_STORES.organisationUnits, unitId); if (!unit || unit.status !== 'active' || unit.organisationId !== organisationId) throw Error('ROLE_UNIT_SCOPE_INVALID'); } }

  const api = {
    sessions,
    sharedWork,
    capture,
    office,
    school,
    studio,
    async initialize() {
      await persistence.runTransaction([V5_STORES.meta, V5_STORES.workspaceDefinitions], 'readwrite', async tx => {
        const marker = await tx.get(V5_STORES.meta, 'platformFoundation');
        if (marker?.status === 'ready') return;
        for (const item of STANDARD_WORKSPACES) {
          const existing = await tx.getByIndex(V5_STORES.workspaceDefinitions, 'byCode', item.code);
          if (!existing) await tx.add(V5_STORES.workspaceDefinitions, createWorkspaceDefinition({ id: `standard:${item.code}`, ...item }, context));
        }
        await tx.put(V5_STORES.meta, { key: 'platformFoundation', status: 'ready', databaseName: V5_DATABASE_NAME, schemaVersion: 1, standardWorkspaceCodes: STANDARD_WORKSPACES.map(item => item.code) });
      });
      return api;
    },
    async registerUser(input) {
      const user = createUser(input, context), personal = createPersonalEnvironment({ userId: user.id }, context);
      await persistence.runTransaction([V5_STORES.users, V5_STORES.personalEnvironments, V5_STORES.activityEvents, V5_STORES.auditEvents], 'readwrite', async tx => {
        await tx.add(V5_STORES.users, user); await tx.add(V5_STORES.personalEnvironments, personal);
        await tx.add(V5_STORES.activityEvents, event('activity', { eventType: 'personal_environment.created', actorUserId: user.id, entityType: 'personalEnvironment', entityId: personal.id }));
        await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'identity.user_registered', actorUserId: user.id, entityType: 'user', entityId: user.id }));
      });
      return { user, personalEnvironment: personal };
    },
    async getProfile(token) { const user = await actor(token), personalEnvironment = (await persistence.getAll(V5_STORES.personalEnvironments)).find(item => item.userId === user.id); return { user, personalEnvironment }; },
    async listWorkspaceDefinitions() { return (await persistence.getAll(V5_STORES.workspaceDefinitions)).filter(item => item.status === 'active'); },
    async listContexts(token) {
      const user = await actor(token), personal = (await persistence.getAll(V5_STORES.personalEnvironments)).find(item => item.userId === user.id && item.status === 'active'), memberships = (await persistence.getAll(V5_STORES.memberships)).filter(item => item.userId === user.id && item.status === 'active'), organisations = await persistence.getAll(V5_STORES.organisations), units = await persistence.getAll(V5_STORES.organisationUnits), contexts = [];
      if (personal) contexts.push({ key: `personal:${user.id}`, kind: 'personal', label: 'Personal', ownerType: 'personal', ownerId: user.id, organisationId: null, unitId: null });
      for (const membership of memberships) {
        const organisation = organisations.find(item => item.id === membership.organisationId && item.status === 'active'); if (!organisation) continue;
        if (await can(persistence, { userId: user.id, organisationId: organisation.id, permissionCode: 'workspaces.view' })) contexts.push({ key: `organisation:${organisation.id}`, kind: 'organisation', label: organisation.name, ownerType: 'organisation', ownerId: organisation.id, organisationId: organisation.id, unitId: null });
        for (const unit of units.filter(item => item.organisationId === organisation.id && item.status === 'active')) if (await can(persistence, { userId: user.id, organisationId: organisation.id, unitId: unit.id, permissionCode: 'workspaces.view' })) contexts.push({ key: `organisation:${organisation.id}:unit:${unit.id}`, kind: 'organisation', label: organisation.name, detail: unit.name, ownerType: 'organisation', ownerId: organisation.id, organisationId: organisation.id, unitId: unit.id });
      }
      return contexts;
    },
    async getActiveContext(token) { const user = await actor(token), contexts = await api.listContexts(token), preference = await persistence.get(V5_STORES.userPreferences, user.id); return contexts.find(item => item.key === preference?.activeContextKey) || contexts[0] || null; },
    async setActiveContext(token, contextKey) { const user = await actor(token), contexts = await api.listContexts(token), selected = contexts.find(item => item.key === contextKey); if (!selected) throw Error('CONTEXT_ACCESS_DENIED'); await persistence.put(V5_STORES.userPreferences, { userId: user.id, activeContextKey: selected.key, updatedAt: new Date().toISOString() }); return selected; },
    async listAvailableWorkspaces(token, selectedContext) {
      const user = await actor(token), contexts = await api.listContexts(token), activeContext = contexts.find(item => item.key === selectedContext?.key); if (!activeContext) throw Error('CONTEXT_ACCESS_DENIED');
      const definitions = await persistence.getAll(V5_STORES.workspaceDefinitions), instances = await persistence.getAll(V5_STORES.workspaceInstances), output = [];
      for (const workspace of instances) {
        const matches = activeContext.kind === 'personal' ? workspace.ownerType === 'personal' && workspace.ownerId === user.id : workspace.ownerType === 'organisation' && workspace.organisationId === activeContext.organisationId && (!activeContext.unitId || !workspace.unitId || workspace.unitId === activeContext.unitId);
        if (!matches || workspace.status !== 'active' || !await canAccessOwnership(persistence, { userId: user.id, ownerType: workspace.ownerType, ownerId: workspace.ownerId, organisationId: workspace.organisationId, unitId: workspace.unitId, permissionCode: 'workspaces.view' })) continue;
        const definition = definitions.find(item => item.id === workspace.definitionId && item.status === 'active'); if (definition) output.push({ workspace, definition });
      }
      return output;
    },
    async authoriseScopedItem(token, item, permissionCode = 'workspaces.view') { const user = await actor(token); return canAccessOwnership(persistence, { userId: user.id, ownerType: item.ownerType, ownerId: item.ownerId, organisationId: item.organisationId, unitId: item.unitId, permissionCode }); },
    async createOrganisation(token, input) {
      const user = await actor(token), organisation = createOrganisation(input, context), root = createOrganisationUnit({ organisationId: organisation.id, name: input.rootUnitName || 'Head Office', unitType: input.rootUnitType || 'unit' }, context), membership = createMembership({ userId: user.id, organisationId: organisation.id }, context), roles = ROLE_TEMPLATES.map(template => createRole({ ...template, organisationId: organisation.id }, context)), owner = roles.find(role => role.code === 'owner'), assignment = createRoleAssignment({ membershipId: membership.id, organisationId: organisation.id, roleId: owner.id, scopeType: 'organisation' }, context);
      await persistence.runTransaction([V5_STORES.organisations, V5_STORES.organisationUnits, V5_STORES.memberships, V5_STORES.roles, V5_STORES.roleAssignments, V5_STORES.activityEvents, V5_STORES.auditEvents], 'readwrite', async tx => {
        await tx.add(V5_STORES.organisations, organisation); await tx.add(V5_STORES.organisationUnits, root); await tx.add(V5_STORES.memberships, membership); for (const role of roles) await tx.add(V5_STORES.roles, role); await tx.add(V5_STORES.roleAssignments, assignment);
        await tx.add(V5_STORES.activityEvents, event('activity', { eventType: 'organisation.created', actorUserId: user.id, organisationId: organisation.id, unitId: root.id, entityType: 'organisation', entityId: organisation.id }));
        await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'organisation.owner_assigned', actorUserId: user.id, organisationId: organisation.id, entityType: 'roleAssignment', entityId: assignment.id, metadata: { roleCode: 'owner', scopeType: 'organisation' } }));
      });
      return { organisation, rootUnit: root, membership, roles, assignment };
    },
    async createUnit(token, input) {
      const user = await actor(token); await permitted(user.id, input.organisationId, 'units.manage', input.parentUnitId || null);
      if (input.parentUnitId) { const parent = await persistence.get(V5_STORES.organisationUnits, input.parentUnitId); if (!parent || parent.organisationId !== input.organisationId) throw Error('UNIT_PARENT_SCOPE_INVALID'); }
      const unit = createOrganisationUnit(input, context);
      await persistence.runTransaction([V5_STORES.organisationUnits, V5_STORES.activityEvents, V5_STORES.auditEvents], 'readwrite', async tx => { await tx.add(V5_STORES.organisationUnits, unit); await tx.add(V5_STORES.activityEvents, event('activity', { eventType: 'organisation_unit.created', actorUserId: user.id, organisationId: unit.organisationId, unitId: unit.id, entityType: 'organisationUnit', entityId: unit.id })); await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'administration.unit_created', actorUserId: user.id, organisationId: unit.organisationId, unitId: unit.id, entityType: 'organisationUnit', entityId: unit.id })); });
      return unit;
    },
    async addMembership(token, input) {
      const user = await actor(token); await permitted(user.id, input.organisationId, 'memberships.manage', input.unitIds?.[0] || null);
      await validateUnitScope(input.organisationId, input.unitIds);
      const target = await persistence.get(V5_STORES.users, input.userId), role = (await persistence.getAll(V5_STORES.roles)).find(item => item.organisationId === input.organisationId && item.code === input.roleCode && item.status === 'active');
      if (!target || !role) throw Error('MEMBERSHIP_INPUT_INVALID');
      const membership = createMembership(input, context), assignment = createRoleAssignment({ membershipId: membership.id, organisationId: input.organisationId, roleId: role.id, scopeType: input.scopeType || 'organisation', unitIds: input.unitIds || [] }, context);
      await persistence.runTransaction([V5_STORES.memberships, V5_STORES.roleAssignments, V5_STORES.auditEvents], 'readwrite', async tx => { await tx.add(V5_STORES.memberships, membership); await tx.add(V5_STORES.roleAssignments, assignment); await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'membership.role_assigned', actorUserId: user.id, organisationId: input.organisationId, entityType: 'roleAssignment', entityId: assignment.id, metadata: { targetUserId: input.userId, roleCode: role.code, scopeType: assignment.scopeType, unitIds: assignment.unitIds } })); });
      return { membership, assignment };
    },
    async changeRole(token, input) {
      const user = await actor(token); await permitted(user.id, input.organisationId, 'memberships.manage', input.unitIds?.[0] || null);
      await validateUnitScope(input.organisationId, input.unitIds);
      const membership = await persistence.get(V5_STORES.memberships, input.membershipId), role = (await persistence.getAll(V5_STORES.roles)).find(item => item.organisationId === input.organisationId && item.code === input.roleCode && item.status === 'active');
      if (!membership || membership.organisationId !== input.organisationId || !role) throw Error('ROLE_CHANGE_SCOPE_INVALID');
      const replacement = createRoleAssignment({ membershipId: membership.id, organisationId: input.organisationId, roleId: role.id, scopeType: input.scopeType || 'organisation', unitIds: input.unitIds || [] }, context);
      await persistence.runTransaction([V5_STORES.roleAssignments, V5_STORES.auditEvents], 'readwrite', async tx => { for (const prior of await tx.getAllByIndex(V5_STORES.roleAssignments, 'byMembershipId', membership.id)) if (prior.status === 'active') await tx.put(V5_STORES.roleAssignments, { ...prior, status: 'revoked', updatedAt: replacement.createdAt }); await tx.add(V5_STORES.roleAssignments, replacement); await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'membership.role_changed', actorUserId: user.id, organisationId: input.organisationId, entityType: 'roleAssignment', entityId: replacement.id, metadata: { targetUserId: membership.userId, roleCode: role.code, scopeType: replacement.scopeType, unitIds: replacement.unitIds } })); });
      return replacement;
    },
    async registerCustomWorkspace(token, input) {
      const user = await actor(token); await permitted(user.id, input.organisationId, 'workspaces.register_custom', input.unitId || null);
      const definition = createWorkspaceDefinition({ ...input, type: 'custom', organisationId: input.organisationId, registeredByUserId: user.id }, context);
      await persistence.runTransaction([V5_STORES.workspaceDefinitions, V5_STORES.auditEvents], 'readwrite', async tx => { await tx.add(V5_STORES.workspaceDefinitions, definition); await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'workspace.custom_registered', actorUserId: user.id, organisationId: input.organisationId, entityType: 'workspaceDefinition', entityId: definition.id, metadata: { code: definition.code } })); });
      return definition;
    },
    async activateWorkspace(token, input) {
      const user = await actor(token), definition = await persistence.get(V5_STORES.workspaceDefinitions, input.definitionId);
      if (!definition || definition.status !== 'active') throw Error('WORKSPACE_DISABLED_OR_UNKNOWN');
      if (!await canAccessOwnership(persistence, { userId: user.id, ownerType: input.ownerType, ownerId: input.ownerId, organisationId: input.organisationId, unitId: input.unitId, permissionCode: 'workspaces.activate' })) throw Error('WORKSPACE_ACCESS_DENIED');
      if (input.unitId) { const unit = await persistence.get(V5_STORES.organisationUnits, input.unitId); if (!unit || unit.organisationId !== input.organisationId) throw Error('WORKSPACE_UNIT_SCOPE_INVALID'); }
      if (definition.type === 'space' && input.ownerType !== 'personal') throw Error('SPACE_REQUIRES_PERSONAL_OWNER');
      const workspace = createWorkspaceInstance({ ...input, definitionId: definition.id, name: input.name || definition.name, createdByUserId: user.id }, context);
      await persistence.runTransaction([V5_STORES.workspaceInstances, V5_STORES.activityEvents, V5_STORES.auditEvents], 'readwrite', async tx => { await tx.add(V5_STORES.workspaceInstances, workspace); await tx.add(V5_STORES.activityEvents, event('activity', { eventType: 'workspace.activated', actorUserId: user.id, organisationId: workspace.organisationId, unitId: workspace.unitId, entityType: 'workspaceInstance', entityId: workspace.id, metadata: { definitionCode: definition.code } })); await tx.add(V5_STORES.auditEvents, event('audit', { eventType: 'administration.workspace_activated', actorUserId: user.id, organisationId: workspace.organisationId, unitId: workspace.unitId, entityType: 'workspaceInstance', entityId: workspace.id, metadata: { ownerType: workspace.ownerType, definitionCode: definition.code } })); });
      return workspace;
    },
    async getWorkspace(token, workspaceId) { const user = await actor(token), workspace = await persistence.get(V5_STORES.workspaceInstances, workspaceId); if (!workspace || !await canAccessOwnership(persistence, { userId: user.id, ownerType: workspace.ownerType, ownerId: workspace.ownerId, organisationId: workspace.organisationId, unitId: workspace.unitId, permissionCode: 'workspaces.view' })) throw Error('WORKSPACE_ACCESS_DENIED'); return workspace; },
    async recentActivity(token, selectedContext, limit = 8) { const user = await actor(token), contexts = await api.listContexts(token), activeContext = contexts.find(item => item.key === selectedContext?.key); if (!activeContext) throw Error('CONTEXT_ACCESS_DENIED'); return (await persistence.getAll(V5_STORES.activityEvents)).filter(item => activeContext.kind === 'personal' ? item.actorUserId === user.id && item.organisationId === null : item.organisationId === activeContext.organisationId && (!activeContext.unitId || !item.unitId || item.unitId === activeContext.unitId)).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit); },
    async createNotification(token, input) { const user = await actor(token); if (!await canAccessOwnership(persistence, { userId: user.id, ownerType: input.ownerType, ownerId: input.ownerId, organisationId: input.organisationId, unitId: input.unitId, permissionCode: 'organisation.view' })) throw Error('NOTIFICATION_SCOPE_DENIED'); const recipient = await persistence.get(V5_STORES.users, input.recipientUserId); if (!recipient || recipient.status !== 'active') throw Error('NOTIFICATION_RECIPIENT_INVALID'); if (input.organisationId) { const membership = await persistence.runTransaction([V5_STORES.memberships], 'readonly', tx => tx.getByIndex(V5_STORES.memberships, 'byUserAndOrganisation', [recipient.id, input.organisationId])); if (!membership || membership.status !== 'active') throw Error('NOTIFICATION_RECIPIENT_SCOPE_INVALID'); } else if (input.ownerType === 'personal' && input.ownerId !== recipient.id) throw Error('NOTIFICATION_RECIPIENT_SCOPE_INVALID'); const notification = createNotification({ ...input, createdByUserId: user.id }, context); await persistence.add(V5_STORES.notifications, notification); return notification; },
    async listNotifications(token, selectedContext) { const user = await actor(token), contexts = await api.listContexts(token), activeContext = contexts.find(item => item.key === selectedContext?.key); if (!activeContext) throw Error('CONTEXT_ACCESS_DENIED'); const items = (await persistence.getAll(V5_STORES.notifications)).filter(item => item.recipientUserId === user.id && (activeContext.kind === 'personal' ? item.ownerType === 'personal' && item.ownerId === user.id : item.organisationId === activeContext.organisationId && (!activeContext.unitId || !item.unitId || item.unitId === activeContext.unitId))), output = []; for (const item of items) if (await api.authoriseScopedItem(token, item, 'workspaces.view')) output.push(item); return output.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); },
    async markNotificationRead(token, notificationId) { const user = await actor(token), item = await persistence.get(V5_STORES.notifications, notificationId); if (!item || item.recipientUserId !== user.id || !await api.authoriseScopedItem(token, item, 'workspaces.view')) throw Error('NOTIFICATION_ACCESS_DENIED'); if (item.readAt) return item; const updated = { ...item, readAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await persistence.put(V5_STORES.notifications, updated); return updated; },
    can: request => can(persistence, request),
    canAccessOwnership: request => canAccessOwnership(persistence, request),
    close() { persistence.close?.(); }
  };
  await api.initialize();
  return Object.freeze(api);
}
