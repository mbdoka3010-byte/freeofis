export const V5_DATABASE_NAME = 'freeofis_v5';
export const V5_DATABASE_VERSION = 2;
export const V5_STORES = Object.freeze({ meta: 'meta', users: 'users', personalEnvironments: 'personalEnvironments', organisations: 'organisations', organisationUnits: 'organisationUnits', memberships: 'memberships', roles: 'roles', roleAssignments: 'roleAssignments', workspaceDefinitions: 'workspaceDefinitions', workspaceInstances: 'workspaceInstances', activityEvents: 'activityEvents', auditEvents: 'auditEvents', sessions: 'sessions', userPreferences: 'userPreferences', notifications: 'notifications' });
const definition = (name, keyPath = 'id', indexes = []) => ({ name, options: { keyPath }, indexes: indexes.map(([indexName, path, unique = false]) => ({ name: indexName, keyPath: path, options: { unique } })) });
export const V5_STORE_DEFINITIONS = Object.freeze([
  definition(V5_STORES.meta, 'key'), definition(V5_STORES.users, 'id', [['byEmail', 'email', true]]), definition(V5_STORES.personalEnvironments, 'id', [['byUserId', 'userId', true]]),
  definition(V5_STORES.organisations), definition(V5_STORES.organisationUnits, 'id', [['byOrganisationId', 'organisationId'], ['byParentUnitId', 'parentUnitId']]),
  definition(V5_STORES.memberships, 'id', [['byUserAndOrganisation', ['userId', 'organisationId'], true], ['byOrganisationId', 'organisationId']]),
  definition(V5_STORES.roles, 'id', [['byOrganisationAndCode', ['organisationId', 'code'], true]]), definition(V5_STORES.roleAssignments, 'id', [['byMembershipId', 'membershipId'], ['byOrganisationId', 'organisationId']]),
  definition(V5_STORES.workspaceDefinitions, 'id', [['byCode', 'code', true], ['byOrganisationId', 'organisationId']]), definition(V5_STORES.workspaceInstances, 'id', [['byOwner', ['ownerType', 'ownerId']], ['byOrganisationId', 'organisationId'], ['byDefinitionId', 'definitionId']]),
  definition(V5_STORES.activityEvents, 'id', [['byOrganisationId', 'organisationId'], ['byActor', 'actorUserId']]), definition(V5_STORES.auditEvents, 'id', [['byOrganisationId', 'organisationId'], ['byActor', 'actorUserId']]), definition(V5_STORES.sessions, 'id', [['bySecretHash', 'secretHash', true], ['byUserId', 'userId']]),
  definition(V5_STORES.userPreferences, 'userId'), definition(V5_STORES.notifications, 'id', [['byRecipient', 'recipientUserId'], ['byOrganisationId', 'organisationId'], ['byWorkspaceId', 'workspaceId']])
]);
export function applyV5SchemaUpgrade(database) { for (const item of V5_STORE_DEFINITIONS) { if (database.objectStoreNames.contains(item.name)) continue; const store = database.createObjectStore(item.name, item.options); for (const index of item.indexes) store.createIndex(index.name, index.keyPath, index.options); } }
