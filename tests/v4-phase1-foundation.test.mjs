import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  V4_DATABASE_NAME,
  V4_DATABASE_VERSION,
  V4_STORES,
  V4_STORE_DEFINITIONS,
  applyV4SchemaUpgrade
} from '../v4/persistence/schema.mjs';
import { openV4Database } from '../v4/persistence/indexeddb.mjs';
import {
  createAccount,
  createBusiness,
  createOperatingUnit,
  createBusinessEvent,
  createUuidV7,
  isUuidV7
} from '../v4/domain/entities.mjs';
import {
  createV4Repositories,
  bootstrapLegacyV3Scope,
  LEGACY_BOOTSTRAP_META_KEY,
  ScopeValidationError
} from '../v4/persistence/repositories.mjs';
import { MemoryV4Persistence } from './helpers/memory-v4-persistence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '..');
const fixedDate = new Date('2026-08-17T12:00:00.000Z');
const clock = () => new Date(fixedDate);
let randomCall = 0;
const cryptoApi = {
  getRandomValues(bytes) {
    randomCall += 1;
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index + randomCall) % 256;
    }
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

function schemaRecorder() {
  const stores = new Map();
  const names = {
    contains: name => stores.has(name),
    [Symbol.iterator]: function* iterator() { yield* stores.keys(); }
  };
  const database = {
    objectStoreNames: names,
    createObjectStore(name, options) {
      const indexes = new Map();
      const store = {
        name,
        options,
        indexNames: {
          contains: indexName => indexes.has(indexName),
          [Symbol.iterator]: function* iterator() { yield* indexes.keys(); }
        },
        createIndex(indexName, keyPath, indexOptions) {
          indexes.set(indexName, { keyPath, options: indexOptions });
        },
        indexes
      };
      stores.set(name, store);
      return store;
    }
  };
  const transaction = { objectStore: name => stores.get(name) };
  return { database, transaction, stores };
}

globalThis.localStorage = Object.freeze({
  getItem() { throw new Error('Phase 1 tests must not access V3 localStorage.'); },
  setItem() { throw new Error('Phase 1 tests must not mutate V3 localStorage.'); },
  removeItem() { throw new Error('Phase 1 tests must not mutate V3 localStorage.'); },
  clear() { throw new Error('Phase 1 tests must not mutate V3 localStorage.'); }
});

await test('defines the V4 IndexedDB name, version, and minimum stores', () => {
  assert.equal(V4_DATABASE_NAME, 'freeofis_v4');
  assert.equal(V4_DATABASE_VERSION, 2);
  assert.deepEqual(V4_STORE_DEFINITIONS.map(definition => definition.name), Object.values(V4_STORES));
});

await test('creates the IndexedDB schema and justified indexes idempotently', () => {
  const recorder = schemaRecorder();
  applyV4SchemaUpgrade(recorder.database, recorder.transaction);
  applyV4SchemaUpgrade(recorder.database, recorder.transaction);
  assert.equal(recorder.stores.size, Object.values(V4_STORES).length);
  assert.equal(recorder.stores.get('legacyMappings').indexes.get('bySourceIdentity').options.unique, true);
  assert.equal(recorder.stores.get('businesses').indexes.has('byAccountId'), true);
  assert.equal(recorder.stores.get('operatingUnits').indexes.has('byBusinessId'), true);
  assert.equal(recorder.stores.get('businessEvents').indexes.has('byBusinessAndEventAt'), true);
});

await test('reports IndexedDB unavailability without touching V3 storage', async () => {
  await assert.rejects(openV4Database(null), error => error.code === 'V4_INDEXEDDB_UNAVAILABLE');
});

await test('creates canonical UUIDv7 entity IDs and timestamps', () => {
  const id = createUuidV7(context.uuidOptions);
  assert.equal(isUuidV7(id), true);
  const account = createAccount({ name: 'Owner account' }, context);
  assert.equal(isUuidV7(account.id), true);
  assert.equal(account.createdAt, '2026-08-17T12:00:00.000Z');
  assert.equal(account.status, 'active');
});

await test('creates and retrieves Account, Business, and OperatingUnit records', async () => {
  const persistence = new MemoryV4Persistence();
  const repositories = createV4Repositories(persistence);
  const account = await repositories.createAccount({ name: 'Account A' }, context);
  const business = await repositories.createBusiness({
    accountId: account.id,
    name: 'Business A',
    type: 'retail'
  }, context);
  const unit = await repositories.createOperatingUnit({
    businessId: business.id,
    name: 'Kiosk A',
    type: 'kiosk'
  }, context);
  assert.deepEqual(await repositories.getAccount(account.id), account);
  assert.deepEqual(await repositories.getBusiness(business.id), business);
  assert.deepEqual(await repositories.getOperatingUnit(unit.id), unit);
});

await test('rejects invalid Account, Business, and OperatingUnit ownership', async () => {
  const persistence = new MemoryV4Persistence();
  const repositories = createV4Repositories(persistence);
  await assert.rejects(
    repositories.createBusiness({ accountId: createUuidV7(context.uuidOptions), name: 'Invalid' }, context),
    ScopeValidationError
  );
  await assert.rejects(
    repositories.createOperatingUnit({ businessId: createUuidV7(context.uuidOptions), name: 'Invalid' }, context),
    ScopeValidationError
  );
});

await test('bootstraps one default legacy scope without reading V3 records', async () => {
  const persistence = new MemoryV4Persistence();
  const result = await bootstrapLegacyV3Scope(persistence, {
    accountName: 'Legacy Account',
    businessName: 'Legacy Business',
    operatingUnitName: 'Legacy Main Unit',
    operatingUnitType: 'shop'
  }, context);
  assert.equal(result.created, true);
  assert.equal(result.business.accountId, result.account.id);
  assert.equal(result.operatingUnit.businessId, result.business.id);
  assert.equal((await persistence.getAll(V4_STORES.businessEvents)).length, 1);
  assert.equal((await persistence.get(V4_STORES.meta, LEGACY_BOOTSTRAP_META_KEY)).status, 'completed');
});

await test('makes legacy bootstrap idempotent and deterministic after creation', async () => {
  const persistence = new MemoryV4Persistence();
  const first = await bootstrapLegacyV3Scope(persistence, {}, context);
  const second = await bootstrapLegacyV3Scope(persistence, { businessName: 'Ignored later name' }, context);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.account.id, first.account.id);
  assert.equal(second.business.id, first.business.id);
  assert.equal(second.operatingUnit.id, first.operatingUnit.id);
  assert.equal((await persistence.getAll(V4_STORES.accounts)).length, 1);
  assert.equal((await persistence.getAll(V4_STORES.businesses)).length, 1);
  assert.equal((await persistence.getAll(V4_STORES.operatingUnits)).length, 1);
});

await test('creates idempotent, unique, provenance-aware legacy mappings', async () => {
  const persistence = new MemoryV4Persistence();
  const repositories = createV4Repositories(persistence);
  const scope = await bootstrapLegacyV3Scope(persistence, {}, context);
  const input = {
    sourceEntityType: 'sale',
    sourceId: 'SALE-V3-001',
    targetEntityType: 'sale',
    targetId: createUuidV7(context.uuidOptions),
    businessId: scope.business.id,
    operatingUnitId: scope.operatingUnit.id,
    provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
  };
  const first = await repositories.createLegacyMapping(input, context);
  const second = await repositories.createLegacyMapping(input, context);
  assert.equal(second.id, first.id);
  assert.equal((await persistence.getAll(V4_STORES.legacyMappings)).length, 1);
  await assert.rejects(
    repositories.createLegacyMapping({ ...input, targetId: 'different-target' }, context),
    ScopeValidationError
  );
  await assert.rejects(
    repositories.createLegacyMapping({
      ...input,
      sourceId: 'SALE-V3-002',
      targetId: createUuidV7(context.uuidOptions),
      operatingUnitId: createUuidV7(context.uuidOptions)
    }, context),
    ScopeValidationError
  );
});

await test('persists a scoped BusinessEvent with an unknown actor', async () => {
  const persistence = new MemoryV4Persistence();
  const scope = await bootstrapLegacyV3Scope(persistence, {}, context);
  const repositories = createV4Repositories(persistence);
  const event = await repositories.createBusinessEvent({
    accountId: scope.account.id,
    businessId: scope.business.id,
    operatingUnitId: scope.operatingUnit.id,
    eventType: 'test.synthetic.created',
    entityType: 'synthetic',
    entityId: 'SYNTHETIC-1'
  }, context);
  assert.equal(event.actorId, null);
  assert.equal(event.actorType, 'unknown_historical');
  assert.equal((await persistence.getAll(V4_STORES.businessEvents)).length, 2);
});

await test('atomically commits Business, OperatingUnit, and BusinessEvent', async () => {
  const persistence = new MemoryV4Persistence();
  const account = createAccount({ name: 'Atomic account' }, context);
  await persistence.add(V4_STORES.accounts, account);
  const business = createBusiness({ accountId: account.id, name: 'Atomic business' }, context);
  const unit = createOperatingUnit({ businessId: business.id, name: 'Atomic unit' }, context);
  const event = createBusinessEvent({
    accountId: account.id,
    businessId: business.id,
    operatingUnitId: unit.id,
    eventType: 'test.atomic.committed',
    entityType: 'operatingUnit',
    entityId: unit.id
  }, context);
  await persistence.runTransaction(
    [V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.businessEvents],
    'readwrite',
    async tx => {
      await tx.add(V4_STORES.businesses, business);
      await tx.add(V4_STORES.operatingUnits, unit);
      await tx.add(V4_STORES.businessEvents, event);
    }
  );
  assert.equal((await persistence.getAll(V4_STORES.businesses)).length, 1);
  assert.equal((await persistence.getAll(V4_STORES.operatingUnits)).length, 1);
  assert.equal((await persistence.getAll(V4_STORES.businessEvents)).length, 1);
});

await test('rolls back every store when an atomic transaction fails', async () => {
  const persistence = new MemoryV4Persistence();
  const business = createBusiness({ accountId: createUuidV7(context.uuidOptions), name: 'Rollback business' }, context);
  const unit = createOperatingUnit({ businessId: business.id, name: 'Rollback unit' }, context);
  await assert.rejects(
    persistence.runTransaction(
      [V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.businessEvents],
      'readwrite',
      async tx => {
        await tx.add(V4_STORES.businesses, business);
        await tx.add(V4_STORES.operatingUnits, unit);
        throw new Error('Deliberate rollback');
      }
    ),
    /Deliberate rollback/
  );
  assert.equal((await persistence.getAll(V4_STORES.businesses)).length, 0);
  assert.equal((await persistence.getAll(V4_STORES.operatingUnits)).length, 0);
  assert.equal((await persistence.getAll(V4_STORES.businessEvents)).length, 0);
});

await test('leaves all production V3 files and storage constants unchanged', () => {
  const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
  const discoveredKeys = [...new Set(appSource.match(/freeofis_[a-z_]+/g) || [])].sort();
  assert.deepEqual(discoveredKeys, [
    'freeofis_business',
    'freeofis_customers',
    'freeofis_data_version',
    'freeofis_expenses',
    'freeofis_inventory',
    'freeofis_payments',
    'freeofis_sales'
  ]);
  assert.match(appSource, /const DATA_VERSION = 3;/);
  assert.equal(appSource.includes('v4/persistence'), false);
  assert.equal(htmlSource.includes('v4/persistence'), false);
});

await test('does not access or mutate production localStorage', () => {
  assert.equal(typeof globalThis.localStorage.setItem, 'function');
});

process.stdout.write('All V4 Phase 1 foundation checks passed.\n');
