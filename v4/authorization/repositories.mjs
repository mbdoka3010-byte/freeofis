import { V4_STORES } from '../persistence/schema.mjs';
import {
  createUser,
  createBusinessMembership,
  createRole,
  createPermission,
  createRoleAssignment,
  createApproval,
  createBusinessEvent,
  nowTimestamp
} from '../domain/entities.mjs';
import { PERMISSION_CATALOG, SYSTEM_ROLE_DEFINITIONS } from './catalog.mjs';
import { ScopeValidationError, bootstrapLegacyV3Scope } from '../persistence/repositories.mjs';

export const LEGACY_OWNER_BOOTSTRAP_META_KEY = 'legacyV3OwnerBootstrap';
const APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected', 'cancelled', 'expired']);

async function assertMembershipScope(tx, membershipId, roleId, businessId, operatingUnitIds) {
  const membership = await tx.get(V4_STORES.businessMemberships, membershipId);
  const role = await tx.get(V4_STORES.roles, roleId);
  if (!membership || membership.businessId !== businessId) {
    throw new ScopeValidationError('Role assignment membership scope is invalid.');
  }
  if (!role || role.businessId !== businessId) {
    throw new ScopeValidationError('Role assignment role scope is invalid.');
  }
  for (const unitId of operatingUnitIds) {
    const unit = await tx.get(V4_STORES.operatingUnits, unitId);
    if (!unit || unit.businessId !== businessId) {
      throw new ScopeValidationError('Assigned Operating Unit does not belong to the Business.');
    }
  }
  for (const code of role.permissionCodes) {
    if (!await tx.get(V4_STORES.permissions, code)) {
      throw new ScopeValidationError(`Role references missing permission ${code}.`);
    }
  }
  return { membership, role };
}

export function createAuthorizationRepositories(persistence) {
  return Object.freeze({
    getUser: id => persistence.get(V4_STORES.users, id),
    getMembership: id => persistence.get(V4_STORES.businessMemberships, id),
    getRole: id => persistence.get(V4_STORES.roles, id),
    getApproval: id => persistence.get(V4_STORES.approvals, id),

    createUser: (input, context) => {
      const user = createUser(input, context);
      return persistence.runTransaction(
        [V4_STORES.users, V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          await tx.add(V4_STORES.users, user);
          if (input.auditScope?.accountId) {
            await tx.add(V4_STORES.businessEvents, createBusinessEvent({
              ...input.auditScope,
              eventType: 'identity.user.created',
              entityType: 'user',
              entityId: user.id,
              actorId: input.actorId ?? null,
              metadata: {}
            }, context));
          }
          return user;
        }
      );
    },

    createMembership: (input, context) => {
      const membership = createBusinessMembership(input, context);
      return persistence.runTransaction(
        [V4_STORES.users, V4_STORES.businesses, V4_STORES.businessMemberships, V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          const user = await tx.get(V4_STORES.users, membership.userId);
          const business = await tx.get(V4_STORES.businesses, membership.businessId);
          if (!user || !business) throw new ScopeValidationError('Membership User or Business does not exist.');
          await tx.add(V4_STORES.businessMemberships, membership);
          await tx.add(V4_STORES.businessEvents, createBusinessEvent({
            accountId: business.accountId,
            businessId: business.id,
            eventType: 'identity.membership.created',
            entityType: 'businessMembership',
            entityId: membership.id,
            actorId: input.actorId ?? null
          }, context));
          return membership;
        }
      );
    },

    createRoleAssignment: (input, context) => {
      const assignment = createRoleAssignment(input, context);
      return persistence.runTransaction(
        [V4_STORES.businessMemberships, V4_STORES.roles, V4_STORES.permissions,
          V4_STORES.operatingUnits, V4_STORES.businesses, V4_STORES.roleAssignments,
          V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          const { role } = await assertMembershipScope(
            tx, assignment.membershipId, assignment.roleId,
            assignment.businessId, assignment.operatingUnitIds
          );
          const business = await tx.get(V4_STORES.businesses, assignment.businessId);
          await tx.add(V4_STORES.roleAssignments, assignment);
          await tx.add(V4_STORES.businessEvents, createBusinessEvent({
            accountId: business.accountId,
            businessId: business.id,
            eventType: 'authorization.role.assigned',
            entityType: 'roleAssignment',
            entityId: assignment.id,
            actorId: input.actorId ?? null,
            metadata: { roleCode: role.code, scopeType: assignment.scopeType }
          }, context));
          return assignment;
        }
      );
    },

    revokeRoleAssignment: (assignmentId, decision = {}, context = {}) =>
      persistence.runTransaction(
        [V4_STORES.roleAssignments, V4_STORES.businesses, V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          const assignment = await tx.get(V4_STORES.roleAssignments, assignmentId);
          if (!assignment) throw new ScopeValidationError('Role assignment does not exist.');
          if (assignment.status === 'revoked') return assignment;
          const business = await tx.get(V4_STORES.businesses, assignment.businessId);
          const timestamp = nowTimestamp(context.clock);
          const updated = { ...assignment, status: 'revoked', revokedAt: timestamp, updatedAt: timestamp };
          await tx.put(V4_STORES.roleAssignments, updated);
          await tx.add(V4_STORES.businessEvents, createBusinessEvent({
            accountId: business.accountId,
            businessId: business.id,
            eventType: 'authorization.role.revoked',
            entityType: 'roleAssignment',
            entityId: assignment.id,
            actorId: decision.actorId ?? null,
            metadata: { reason: decision.reason ?? null }
          }, context));
          return updated;
        }
      ),

    createApproval: (input, context) => {
      const approval = createApproval(input, context);
      if (!APPROVAL_STATUSES.has(approval.status) || approval.status !== 'pending') {
        throw new TypeError('New approvals must have pending status.');
      }
      return persistence.runTransaction(
        [V4_STORES.users, V4_STORES.businesses, V4_STORES.operatingUnits,
          V4_STORES.businessMemberships, V4_STORES.permissions, V4_STORES.approvals,
          V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          const business = await tx.get(V4_STORES.businesses, approval.businessId);
          if (!business || business.accountId !== approval.accountId) {
            throw new ScopeValidationError('Approval Business scope is invalid.');
          }
          if (approval.operatingUnitId) {
            const unit = await tx.get(V4_STORES.operatingUnits, approval.operatingUnitId);
            if (!unit || unit.businessId !== approval.businessId) {
              throw new ScopeValidationError('Approval Operating Unit scope is invalid.');
            }
          }
          const membership = await tx.getByIndex(
            V4_STORES.businessMemberships, 'byUserAndBusiness',
            [approval.requestedByUserId, approval.businessId]
          );
          if (!membership || membership.status !== 'active') {
            throw new ScopeValidationError('Approval requester is not an active Business member.');
          }
          if (!await tx.get(V4_STORES.permissions, approval.requiredPermission)) {
            throw new ScopeValidationError('Approval references an unknown permission.');
          }
          await tx.add(V4_STORES.approvals, approval);
          await tx.add(V4_STORES.businessEvents, createBusinessEvent({
            accountId: approval.accountId,
            businessId: approval.businessId,
            operatingUnitId: approval.operatingUnitId,
            eventType: 'approval.requested',
            entityType: 'approval',
            entityId: approval.id,
            actorId: approval.requestedByUserId,
            metadata: { actionType: approval.actionType }
          }, context));
          return approval;
        }
      );
    },

    decideApproval: (approvalId, decision, context = {}) => {
      if (!['approved', 'rejected', 'cancelled', 'expired'].includes(decision.status)) {
        throw new TypeError('Approval decision status is invalid.');
      }
      return persistence.runTransaction(
        [V4_STORES.approvals, V4_STORES.businessMemberships, V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          const approval = await tx.get(V4_STORES.approvals, approvalId);
          if (!approval || approval.status !== 'pending') {
            throw new ScopeValidationError('Approval is not pending.');
          }
          const membership = await tx.getByIndex(
            V4_STORES.businessMemberships, 'byUserAndBusiness',
            [decision.decidedByUserId, approval.businessId]
          );
          if (!membership || membership.status !== 'active') {
            throw new ScopeValidationError('Approval decision actor is not an active Business member.');
          }
          const timestamp = nowTimestamp(context.clock);
          const updated = {
            ...approval,
            status: decision.status,
            decidedAt: timestamp,
            decidedByUserId: decision.decidedByUserId,
            reason: decision.reason ?? approval.reason,
            notes: decision.notes ?? approval.notes,
            updatedAt: timestamp
          };
          await tx.put(V4_STORES.approvals, updated);
          await tx.add(V4_STORES.businessEvents, createBusinessEvent({
            accountId: approval.accountId,
            businessId: approval.businessId,
            operatingUnitId: approval.operatingUnitId,
            eventType: 'approval.decided',
            entityType: 'approval',
            entityId: approval.id,
            actorId: decision.decidedByUserId,
            metadata: { status: decision.status, reason: decision.reason ?? null }
          }, context));
          return updated;
        }
      );
    }
  });
}

export async function seedAuthorizationCatalog(persistence, businessId, context = {}) {
  return persistence.runTransaction(
    [V4_STORES.businesses, V4_STORES.permissions, V4_STORES.roles],
    'readwrite',
    async tx => {
      if (!await tx.get(V4_STORES.businesses, businessId)) {
        throw new ScopeValidationError('Cannot seed roles for a missing Business.');
      }
      for (const definition of PERMISSION_CATALOG) {
        if (!await tx.get(V4_STORES.permissions, definition.code)) {
          await tx.add(V4_STORES.permissions, createPermission(definition, context));
        }
      }
      const roles = {};
      for (const definition of SYSTEM_ROLE_DEFINITIONS) {
        let role = await tx.getByIndex(
          V4_STORES.roles, 'byBusinessAndCode', [businessId, definition.code]
        );
        if (!role) {
          role = createRole({ ...definition, businessId, kind: 'system' }, context);
          await tx.add(V4_STORES.roles, role);
        }
        roles[definition.code] = role;
      }
      return roles;
    }
  );
}

export async function bootstrapLegacyV3Owner(persistence, options = {}, context = {}) {
  const scope = await bootstrapLegacyV3Scope(persistence, options, context);
  const roles = await seedAuthorizationCatalog(persistence, scope.business.id, context);
  return persistence.runTransaction(
    [V4_STORES.users, V4_STORES.businesses, V4_STORES.businessMemberships,
      V4_STORES.roles, V4_STORES.permissions, V4_STORES.roleAssignments,
      V4_STORES.businessEvents, V4_STORES.meta],
    'readwrite',
    async tx => {
      const existing = await tx.get(V4_STORES.meta, LEGACY_OWNER_BOOTSTRAP_META_KEY);
      if (existing?.status === 'completed') {
        const user = await tx.get(V4_STORES.users, existing.userId);
        const membership = await tx.get(V4_STORES.businessMemberships, existing.membershipId);
        const ownerRole = await tx.get(V4_STORES.roles, existing.ownerRoleId);
        const roleAssignment = await tx.get(V4_STORES.roleAssignments, existing.roleAssignmentId);
        if (!user || !membership || !ownerRole || !roleAssignment) {
          throw new ScopeValidationError(
            'Legacy Owner bootstrap metadata references missing identity records.'
          );
        }
        return {
          ...scope,
          user,
          membership,
          ownerRole,
          roleAssignment,
          createdOwner: false
        };
      }
      const user = createUser({
        displayName: options.ownerDisplayName || 'Owner',
        email: options.ownerEmail || null,
        phone: options.ownerPhone || null,
        provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 },
        metadata: { placeholderDisplayName: !options.ownerDisplayName }
      }, context);
      const membership = createBusinessMembership({
        userId: user.id,
        businessId: scope.business.id,
        provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
      }, context);
      const assignment = createRoleAssignment({
        membershipId: membership.id,
        roleId: roles.owner.id,
        businessId: scope.business.id,
        scopeType: 'business',
        provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
      }, context);
      const event = createBusinessEvent({
        accountId: scope.account.id,
        businessId: scope.business.id,
        operatingUnitId: scope.operatingUnit.id,
        eventType: 'identity.legacy_owner.bootstrapped',
        entityType: 'roleAssignment',
        entityId: assignment.id,
        actorId: null,
        actorType: 'unknown_historical',
        provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
      }, context);
      await tx.add(V4_STORES.users, user);
      await tx.add(V4_STORES.businessMemberships, membership);
      await tx.add(V4_STORES.roleAssignments, assignment);
      await tx.add(V4_STORES.businessEvents, event);
      await tx.add(V4_STORES.meta, {
        key: LEGACY_OWNER_BOOTSTRAP_META_KEY,
        status: 'completed',
        userId: user.id,
        membershipId: membership.id,
        ownerRoleId: roles.owner.id,
        roleAssignmentId: assignment.id,
        completedAt: event.eventAt
      });
      return { ...scope, user, membership, ownerRole: roles.owner, roleAssignment: assignment, createdOwner: true };
    }
  );
}
