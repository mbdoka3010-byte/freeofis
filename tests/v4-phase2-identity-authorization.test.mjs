import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { V4_DATABASE_VERSION, V4_STORES, applyV4SchemaUpgrade } from '../v4/persistence/schema.mjs';
import { createAccount, createBusiness, createOperatingUnit, createBusinessEvent } from '../v4/domain/entities.mjs';
import { createV4Repositories, ScopeValidationError } from '../v4/persistence/repositories.mjs';
import { PERMISSION_CATALOG, SYSTEM_ROLE_DEFINITIONS } from '../v4/authorization/catalog.mjs';
import { canUser } from '../v4/authorization/authorization.mjs';
import {
  createAuthorizationRepositories,
  seedAuthorizationCatalog,
  bootstrapLegacyV3Owner
} from '../v4/authorization/repositories.mjs';
import { MemoryV4Persistence } from './helpers/memory-v4-persistence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixedDate = new Date('2026-08-17T15:00:00.000Z');
const clock = () => new Date(fixedDate);
let randomCall = 50;
const cryptoApi = {
  getRandomValues(bytes) {
    randomCall += 1;
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (randomCall + index) % 256;
    return bytes;
  }
};
const context = { clock, uuidOptions: { timestamp: fixedDate.getTime(), cryptoApi } };

async function test(name, action) {
  try {
    await action();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

function schemaRecorderWithV1() {
  const stores = new Map();
  const createStore = (name, options = { keyPath: 'id' }) => {
    const indexes = new Map();
    const store = {
      marker: `v1:${name}`,
      indexNames: { contains: key => indexes.has(key), [Symbol.iterator]: function* () { yield* indexes.keys(); } },
      createIndex: (indexName, keyPath, indexOptions) => indexes.set(indexName, { keyPath, options: indexOptions }),
      indexes,
      options
    };
    stores.set(name, store);
    return store;
  };
  ['accounts', 'businesses', 'operatingUnits', 'legacyMappings', 'businessEvents', 'meta'].forEach(name => createStore(name));
  const database = {
    objectStoreNames: { contains: name => stores.has(name), [Symbol.iterator]: function* () { yield* stores.keys(); } },
    createObjectStore: createStore
  };
  return { database, transaction: { objectStore: name => stores.get(name) }, stores };
}

async function setupOwner() {
  const persistence = new MemoryV4Persistence();
  const owner = await bootstrapLegacyV3Owner(persistence, {}, context);
  return {
    persistence,
    owner,
    auth: createAuthorizationRepositories(persistence),
    base: createV4Repositories(persistence)
  };
}

async function addUserWithRole(setup, roleCode, scopeType = 'business', operatingUnitIds = []) {
  const user = await setup.auth.createUser({
    displayName: `${roleCode} user`,
    auditScope: { accountId: setup.owner.account.id, businessId: setup.owner.business.id }
  }, context);
  const membership = await setup.auth.createMembership({
    userId: user.id,
    businessId: setup.owner.business.id,
    actorId: setup.owner.user.id
  }, context);
  const role = await setup.persistence.runTransaction(
    [V4_STORES.roles], 'readonly',
    tx => tx.getByIndex(V4_STORES.roles, 'byBusinessAndCode', [setup.owner.business.id, roleCode])
  );
  const assignment = await setup.auth.createRoleAssignment({
    membershipId: membership.id,
    roleId: role.id,
    businessId: setup.owner.business.id,
    scopeType,
    operatingUnitIds,
    actorId: setup.owner.user.id
  }, context);
  return { user, membership, role, assignment };
}

globalThis.localStorage = Object.freeze({
  getItem() { throw new Error('Phase 2 tests must not read V3 localStorage.'); },
  setItem() { throw new Error('Phase 2 tests must not mutate V3 localStorage.'); },
  removeItem() { throw new Error('Phase 2 tests must not mutate V3 localStorage.'); },
  clear() { throw new Error('Phase 2 tests must not mutate V3 localStorage.'); }
});

await test('upgrades IndexedDB from v1 to v2 additively', () => {
  assert.equal(V4_DATABASE_VERSION, 2);
  const recorder = schemaRecorderWithV1();
  const originalAccounts = recorder.stores.get('accounts');
  applyV4SchemaUpgrade(recorder.database, recorder.transaction, 1);
  assert.equal(recorder.stores.get('accounts'), originalAccounts);
  assert.deepEqual(
    ['users', 'businessMemberships', 'roles', 'permissions', 'roleAssignments', 'approvals']
      .filter(name => !recorder.stores.has(name)),
    []
  );
  assert.equal(recorder.stores.size, 12);
});

await test('creates a User without requiring email or phone', async () => {
  const setup = await setupOwner();
  const user = await setup.auth.createUser({ displayName: 'No Contact User' }, context);
  assert.equal(user.email, null);
  assert.equal(user.phone, null);
  assert.equal((await setup.auth.getUser(user.id)).displayName, 'No Contact User');
});

await test('creates a valid active BusinessMembership', async () => {
  const setup = await setupOwner();
  const member = await addUserWithRole(setup, 'viewer');
  assert.equal(member.membership.status, 'active');
  assert.equal(member.membership.businessId, setup.owner.business.id);
});

await test('rejects membership with a missing User or Business', async () => {
  const setup = await setupOwner();
  await assert.rejects(
    setup.auth.createMembership({ userId: 'missing', businessId: setup.owner.business.id }, context),
    ScopeValidationError
  );
});

await test('seeds the controlled permission catalog idempotently', async () => {
  const setup = await setupOwner();
  await seedAuthorizationCatalog(setup.persistence, setup.owner.business.id, context);
  assert.equal((await setup.persistence.getAll(V4_STORES.permissions)).length, PERMISSION_CATALOG.length);
  assert.equal(new Set(PERMISSION_CATALOG.map(item => item.code)).size, PERMISSION_CATALOG.length);
});

await test('seeds all built-in Business roles idempotently', async () => {
  const setup = await setupOwner();
  await seedAuthorizationCatalog(setup.persistence, setup.owner.business.id, context);
  assert.equal((await setup.persistence.getAll(V4_STORES.roles)).length, SYSTEM_ROLE_DEFINITIONS.length);
});

await test('creates a Business-wide role assignment', async () => {
  const setup = await setupOwner();
  const cashier = await addUserWithRole(setup, 'cashier');
  assert.equal(cashier.assignment.scopeType, 'business');
  assert.deepEqual(cashier.assignment.operatingUnitIds, []);
});

await test('allows Business-wide permissions in every unit of that Business', async () => {
  const setup = await setupOwner();
  const secondUnit = await setup.base.createOperatingUnit({
    businessId: setup.owner.business.id, name: 'Second Store', type: 'store'
  }, context);
  assert.equal(await canUser(setup.persistence, {
    userId: setup.owner.user.id,
    businessId: setup.owner.business.id,
    operatingUnitId: secondUnit.id,
    permissionCode: 'settings.manage'
  }), true);
});

await test('limits an Operating Unit-scoped Cashier to its assigned unit', async () => {
  const setup = await setupOwner();
  const secondUnit = await setup.base.createOperatingUnit({
    businessId: setup.owner.business.id, name: 'Second Store', type: 'store'
  }, context);
  const cashier = await addUserWithRole(setup, 'cashier', 'operating_units', [setup.owner.operatingUnit.id]);
  assert.equal(await canUser(setup.persistence, {
    userId: cashier.user.id, businessId: setup.owner.business.id,
    operatingUnitId: setup.owner.operatingUnit.id, permissionCode: 'sales.create'
  }), true);
  assert.equal(await canUser(setup.persistence, {
    userId: cashier.user.id, businessId: setup.owner.business.id,
    operatingUnitId: secondUnit.id, permissionCode: 'sales.create'
  }), false);
});

await test('supports one Manager assignment across multiple Operating Units', async () => {
  const setup = await setupOwner();
  const unit2 = await setup.base.createOperatingUnit({ businessId: setup.owner.business.id, name: 'Unit 2' }, context);
  const unit3 = await setup.base.createOperatingUnit({ businessId: setup.owner.business.id, name: 'Unit 3' }, context);
  const manager = await addUserWithRole(
    setup, 'manager', 'operating_units', [setup.owner.operatingUnit.id, unit2.id, unit3.id]
  );
  for (const operatingUnitId of manager.assignment.operatingUnitIds) {
    assert.equal(await canUser(setup.persistence, {
      userId: manager.user.id, businessId: setup.owner.business.id,
      operatingUnitId, permissionCode: 'inventory.adjust'
    }), true);
  }
});

await test('denies a suspended membership', async () => {
  const setup = await setupOwner();
  await setup.persistence.put(V4_STORES.businessMemberships, {
    ...setup.owner.membership, status: 'suspended'
  });
  assert.equal(await canUser(setup.persistence, {
    userId: setup.owner.user.id, businessId: setup.owner.business.id,
    permissionCode: 'sales.create'
  }), false);
});

await test('denies a revoked role assignment', async () => {
  const setup = await setupOwner();
  await setup.auth.revokeRoleAssignment(setup.owner.roleAssignment.id, {
    actorId: setup.owner.user.id, reason: 'Synthetic test'
  }, context);
  assert.equal(await canUser(setup.persistence, {
    userId: setup.owner.user.id, businessId: setup.owner.business.id,
    permissionCode: 'sales.create'
  }), false);
});

await test('rejects cross-Business role and Operating Unit scope', async () => {
  const setup = await setupOwner();
  const account = setup.owner.account;
  const otherBusiness = await setup.base.createBusiness({ accountId: account.id, name: 'Other Business' }, context);
  const otherUnit = await setup.base.createOperatingUnit({ businessId: otherBusiness.id, name: 'Other Unit' }, context);
  const viewer = await addUserWithRole(setup, 'viewer');
  await assert.rejects(
    setup.auth.createRoleAssignment({
      membershipId: viewer.membership.id,
      roleId: viewer.role.id,
      businessId: setup.owner.business.id,
      scopeType: 'operating_units',
      operatingUnitIds: [otherUnit.id]
    }, context),
    ScopeValidationError
  );
  assert.equal(await canUser(setup.persistence, {
    userId: viewer.user.id, businessId: otherBusiness.id,
    operatingUnitId: otherUnit.id, permissionCode: 'sales.view'
  }), false);
});

await test('bootstraps a default Owner without fabricated personal contact data', async () => {
  const setup = await setupOwner();
  assert.equal(setup.owner.createdOwner, true);
  assert.equal(setup.owner.user.displayName, 'Owner');
  assert.equal(setup.owner.user.email, null);
  assert.equal(setup.owner.user.phone, null);
  assert.equal(setup.owner.user.metadata.placeholderDisplayName, true);
});

await test('makes the Owner bootstrap idempotent', async () => {
  const persistence = new MemoryV4Persistence();
  const first = await bootstrapLegacyV3Owner(persistence, {}, context);
  const second = await bootstrapLegacyV3Owner(persistence, { ownerDisplayName: 'Ignored' }, context);
  assert.equal(second.createdOwner, false);
  assert.equal(second.user.id, first.user.id);
  assert.equal((await persistence.getAll(V4_STORES.users)).length, 1);
  assert.equal((await persistence.getAll(V4_STORES.roleAssignments)).length, 1);
});

await test('gives Owner every current permission', async () => {
  const setup = await setupOwner();
  for (const permission of PERMISSION_CATALOG) {
    assert.equal(await canUser(setup.persistence, {
      userId: setup.owner.user.id,
      businessId: setup.owner.business.id,
      permissionCode: permission.code
    }), true, permission.code);
  }
});

await test('keeps Cashier permissions limited', async () => {
  const setup = await setupOwner();
  const cashier = await addUserWithRole(setup, 'cashier');
  assert.equal(await canUser(setup.persistence, {
    userId: cashier.user.id, businessId: setup.owner.business.id, permissionCode: 'sales.create'
  }), true);
  assert.equal(await canUser(setup.persistence, {
    userId: cashier.user.id, businessId: setup.owner.business.id, permissionCode: 'finance.adjust'
  }), false);
  assert.equal(await canUser(setup.persistence, {
    userId: cashier.user.id, businessId: setup.owner.business.id, permissionCode: 'staff.manage'
  }), false);
});

await test('gives Viewer read-only permissions only', async () => {
  const setup = await setupOwner();
  const viewer = await addUserWithRole(setup, 'viewer');
  assert.equal(await canUser(setup.persistence, {
    userId: viewer.user.id, businessId: setup.owner.business.id, permissionCode: 'reports.view'
  }), true);
  assert.equal(await canUser(setup.persistence, {
    userId: viewer.user.id, businessId: setup.owner.business.id, permissionCode: 'sales.create'
  }), false);
});

await test('creates a pending Approval with valid Business scope', async () => {
  const setup = await setupOwner();
  const approval = await setup.auth.createApproval({
    accountId: setup.owner.account.id,
    businessId: setup.owner.business.id,
    operatingUnitId: setup.owner.operatingUnit.id,
    actionType: 'sale.cancel',
    requiredPermission: 'sales.cancel',
    entityType: 'sale',
    entityId: 'SYNTHETIC-SALE',
    requestedByUserId: setup.owner.user.id,
    reason: 'Synthetic approval test'
  }, context);
  assert.equal(approval.status, 'pending');
  assert.equal((await setup.auth.getApproval(approval.id)).status, 'pending');
});

await test('decides an Approval with an active same-Business member', async () => {
  const setup = await setupOwner();
  const approval = await setup.auth.createApproval({
    accountId: setup.owner.account.id, businessId: setup.owner.business.id,
    actionType: 'inventory.adjust', requiredPermission: 'inventory.adjust',
    entityType: 'inventoryAdjustment', entityId: 'SYNTHETIC-ADJ',
    requestedByUserId: setup.owner.user.id
  }, context);
  const decided = await setup.auth.decideApproval(approval.id, {
    status: 'approved', decidedByUserId: setup.owner.user.id, reason: 'Approved in test'
  }, context);
  assert.equal(decided.status, 'approved');
  assert.equal(decided.decidedAt, fixedDate.toISOString());
});

await test('rejects Approval decisions by users outside the Business', async () => {
  const setup = await setupOwner();
  const outsider = await setup.auth.createUser({ displayName: 'Outsider' }, context);
  const approval = await setup.auth.createApproval({
    accountId: setup.owner.account.id, businessId: setup.owner.business.id,
    actionType: 'sale.cancel', requiredPermission: 'sales.cancel',
    entityType: 'sale', entityId: 'SYNTHETIC-2', requestedByUserId: setup.owner.user.id
  }, context);
  await assert.rejects(
    setup.auth.decideApproval(approval.id, {
      status: 'rejected', decidedByUserId: outsider.id
    }, context),
    ScopeValidationError
  );
});

await test('generates BusinessEvents for identity, assignment, revocation, and approval actions', async () => {
  const setup = await setupOwner();
  const cashier = await addUserWithRole(setup, 'cashier');
  await setup.auth.revokeRoleAssignment(cashier.assignment.id, { actorId: setup.owner.user.id }, context);
  const approval = await setup.auth.createApproval({
    accountId: setup.owner.account.id, businessId: setup.owner.business.id,
    actionType: 'sale.cancel', requiredPermission: 'sales.cancel', entityType: 'sale',
    entityId: 'SYNTHETIC-3', requestedByUserId: setup.owner.user.id
  }, context);
  await setup.auth.decideApproval(approval.id, {
    status: 'approved', decidedByUserId: setup.owner.user.id
  }, context);
  const types = (await setup.persistence.getAll(V4_STORES.businessEvents)).map(event => event.eventType);
  for (const expected of [
    'identity.user.created', 'identity.membership.created', 'authorization.role.assigned',
    'authorization.role.revoked', 'approval.requested', 'approval.decided'
  ]) assert.equal(types.includes(expected), true, expected);
});

await test('atomically commits identity and audit records', async () => {
  const persistence = new MemoryV4Persistence();
  const account = createAccount({ name: 'Atomic identity account' }, context);
  const event = createBusinessEvent({
    accountId: account.id, eventType: 'test.identity.atomic',
    entityType: 'account', entityId: account.id
  }, context);
  await persistence.runTransaction(
    [V4_STORES.accounts, V4_STORES.businessEvents], 'readwrite',
    async tx => {
      await tx.add(V4_STORES.accounts, account);
      await tx.add(V4_STORES.businessEvents, event);
    }
  );
  assert.equal((await persistence.getAll(V4_STORES.accounts)).length, 1);
  assert.equal((await persistence.getAll(V4_STORES.businessEvents)).length, 1);
});

await test('rolls back identity and audit records on deliberate failure', async () => {
  const persistence = new MemoryV4Persistence();
  const account = createAccount({ name: 'Rollback identity account' }, context);
  await assert.rejects(
    persistence.runTransaction(
      [V4_STORES.accounts, V4_STORES.businessEvents], 'readwrite',
      async tx => {
        await tx.add(V4_STORES.accounts, account);
        throw new Error('Deliberate Phase 2 rollback');
      }
    ),
    /Deliberate Phase 2 rollback/
  );
  assert.equal((await persistence.getAll(V4_STORES.accounts)).length, 0);
  assert.equal((await persistence.getAll(V4_STORES.businessEvents)).length, 0);
});

await test('keeps V3 isolated and unchanged', () => {
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(appSource, /const DATA_VERSION = 3;/);
  assert.equal(appSource.includes('v4/'), false);
  assert.equal(htmlSource.includes('v4/'), false);
  assert.equal(typeof globalThis.localStorage.setItem, 'function');
});

process.stdout.write('All V4 Phase 2 identity and authorization checks passed.\n');
