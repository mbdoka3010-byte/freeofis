const STATUS_ACTIVE = 'active';
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value) {
  return UUID_V7_PATTERN.test(String(value));
}

export function createUuidV7(options = {}) {
  const timestamp = options.timestamp ?? Date.now();
  const cryptoApi = options.cryptoApi ?? globalThis.crypto;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffffffff) {
    throw new RangeError('UUIDv7 timestamp must fit in 48 bits.');
  }
  if (!cryptoApi?.getRandomValues) {
    throw new Error('A cryptographically secure random source is required.');
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  let remaining = BigInt(timestamp);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowTimestamp(clock = () => new Date()) {
  return clock().toISOString();
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`${field} is required.`);
  return text;
}

function commonFields(input, context = {}) {
  const timestamp = input.createdAt || nowTimestamp(context.clock);
  return {
    id: input.id || createUuidV7(context.uuidOptions),
    status: input.status || STATUS_ACTIVE,
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    provenance: input.provenance ?? null,
    metadata: input.metadata ?? {}
  };
}

export function createAccount(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    name: requiredText(input.name, 'Account name')
  };
}

export function createBusiness(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    accountId: requiredText(input.accountId, 'Business accountId'),
    name: requiredText(input.name, 'Business name'),
    type: requiredText(input.type || 'other', 'Business type'),
    defaultCurrency: requiredText(input.defaultCurrency || 'NGN', 'Default currency').toUpperCase(),
    timezone: requiredText(input.timezone || 'Africa/Lagos', 'Business timezone')
  };
}

export function createOperatingUnit(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    businessId: requiredText(input.businessId, 'OperatingUnit businessId'),
    name: requiredText(input.name, 'OperatingUnit name'),
    type: requiredText(input.type || 'other', 'OperatingUnit type')
  };
}

export function createLegacyMapping(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    sourceSystem: requiredText(input.sourceSystem || 'freeofis-v3', 'sourceSystem'),
    sourceEntityType: requiredText(input.sourceEntityType, 'sourceEntityType'),
    sourceId: requiredText(input.sourceId, 'sourceId'),
    targetEntityType: requiredText(input.targetEntityType, 'targetEntityType'),
    targetId: requiredText(input.targetId, 'targetId'),
    businessId: input.businessId ?? null,
    operatingUnitId: input.operatingUnitId ?? null,
    sourceDataVersion: input.sourceDataVersion ?? 3,
    mappingStatus: input.mappingStatus || 'active'
  };
}

export function createBusinessEvent(input = {}, context = {}) {
  const createdAt = input.createdAt || nowTimestamp(context.clock);
  return {
    id: input.id || createUuidV7(context.uuidOptions),
    accountId: requiredText(input.accountId, 'BusinessEvent accountId'),
    businessId: input.businessId ?? null,
    operatingUnitId: input.operatingUnitId ?? null,
    eventType: requiredText(input.eventType, 'BusinessEvent eventType'),
    entityType: requiredText(input.entityType, 'BusinessEvent entityType'),
    entityId: requiredText(input.entityId, 'BusinessEvent entityId'),
    eventAt: input.eventAt || createdAt,
    createdAt,
    actorId: input.actorId ?? null,
    actorType: input.actorType || (input.actorId ? 'user' : 'unknown_historical'),
    provenance: input.provenance ?? null,
    metadata: input.metadata ?? {}
  };
}

export function createUser(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    displayName: requiredText(input.displayName, 'User displayName'),
    email: input.email ? String(input.email).trim() : null,
    phone: input.phone ? String(input.phone).trim() : null
  };
}

export function createBusinessMembership(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    userId: requiredText(input.userId, 'BusinessMembership userId'),
    businessId: requiredText(input.businessId, 'BusinessMembership businessId')
  };
}

export function createRole(input = {}, context = {}) {
  return {
    ...commonFields(input, context),
    businessId: requiredText(input.businessId, 'Role businessId'),
    code: requiredText(input.code, 'Role code'),
    name: requiredText(input.name, 'Role name'),
    kind: input.kind === 'custom' ? 'custom' : 'system',
    permissionCodes: [...new Set(input.permissionCodes || [])].sort()
  };
}

export function createPermission(input = {}, context = {}) {
  const timestamp = input.createdAt || nowTimestamp(context.clock);
  return {
    code: requiredText(input.code, 'Permission code'),
    module: requiredText(input.module, 'Permission module'),
    description: requiredText(input.description, 'Permission description'),
    status: input.status || STATUS_ACTIVE,
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    metadata: input.metadata ?? {}
  };
}

export function createRoleAssignment(input = {}, context = {}) {
  const scopeType = input.scopeType || 'business';
  if (!['business', 'operating_units'].includes(scopeType)) {
    throw new TypeError('RoleAssignment scopeType is invalid.');
  }
  const operatingUnitIds = [...new Set(input.operatingUnitIds || [])];
  if (scopeType === 'business' && operatingUnitIds.length) {
    throw new TypeError('Business-wide assignments cannot include Operating Units.');
  }
  if (scopeType === 'operating_units' && !operatingUnitIds.length) {
    throw new TypeError('Operating-unit assignments require at least one unit.');
  }
  return {
    ...commonFields(input, context),
    membershipId: requiredText(input.membershipId, 'RoleAssignment membershipId'),
    roleId: requiredText(input.roleId, 'RoleAssignment roleId'),
    businessId: requiredText(input.businessId, 'RoleAssignment businessId'),
    scopeType,
    operatingUnitIds
  };
}

export function createApproval(input = {}, context = {}) {
  const createdAt = input.createdAt || nowTimestamp(context.clock);
  return {
    id: input.id || createUuidV7(context.uuidOptions),
    accountId: requiredText(input.accountId, 'Approval accountId'),
    businessId: requiredText(input.businessId, 'Approval businessId'),
    operatingUnitId: input.operatingUnitId ?? null,
    actionType: requiredText(input.actionType, 'Approval actionType'),
    requiredPermission: requiredText(input.requiredPermission, 'Approval requiredPermission'),
    entityType: requiredText(input.entityType, 'Approval entityType'),
    entityId: requiredText(input.entityId, 'Approval entityId'),
    requestedByUserId: requiredText(input.requestedByUserId, 'Approval requestedByUserId'),
    status: input.status || 'pending',
    requestedAt: input.requestedAt || createdAt,
    decidedAt: input.decidedAt ?? null,
    decidedByUserId: input.decidedByUserId ?? null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    provenance: input.provenance ?? null,
    metadata: input.metadata ?? {}
  };
}
