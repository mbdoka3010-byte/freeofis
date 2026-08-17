import { IndexedDbPersistence } from '../../v4/persistence/indexeddb.mjs';
import { V4_DATABASE_VERSION, V4_STORES } from '../../v4/persistence/schema.mjs';
import { bootstrapLegacyV3Owner } from '../../v4/authorization/repositories.mjs';
import { createBusinessEvent } from '../../v4/domain/entities.mjs';

const TEST_DATABASE_NAME = 'freeofis_v4_phase2_test';
const output = document.querySelector('#output');
const button = document.querySelector('#run');

function removeTestDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(TEST_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Test database deletion is blocked by another tab.'));
  });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

button.addEventListener('click', async () => {
  button.disabled = true;
  const messages = [];
  let persistence;
  try {
    await removeTestDatabase();
    persistence = await IndexedDbPersistence.open(indexedDB, {
      databaseName: TEST_DATABASE_NAME,
      databaseVersion: V4_DATABASE_VERSION
    });
    messages.push(`PASS database opened at version ${persistence.database.version}`);
    for (const store of Object.values(V4_STORES)) {
      check(persistence.database.objectStoreNames.contains(store), `Missing store ${store}`);
    }
    messages.push(`PASS all ${Object.values(V4_STORES).length} stores exist`);

    const owner = await bootstrapLegacyV3Owner(persistence, {
      accountName: 'Browser Test Account', businessName: 'Browser Test Business',
      operatingUnitName: 'Browser Test Unit', ownerDisplayName: 'Browser Test Owner'
    });
    check(owner.user && owner.roleAssignment, 'Owner bootstrap did not complete.');
    const second = await bootstrapLegacyV3Owner(persistence, {});
    check(second.user.id === owner.user.id && second.createdOwner === false, 'Bootstrap is not idempotent.');
    messages.push('PASS default Owner bootstrap and repository reads');

    const marker = `atomic-${Date.now()}`;
    await persistence.runTransaction(
      [V4_STORES.meta, V4_STORES.businessEvents], 'readwrite',
      async tx => {
        await tx.add(V4_STORES.meta, { key: marker, status: 'committed' });
        await tx.add(V4_STORES.businessEvents, createBusinessEvent({
          accountId: owner.account.id,
          businessId: owner.business.id, operatingUnitId: owner.operatingUnit.id,
          eventType: 'test.browser.atomic', entityType: 'meta', entityId: marker,
          actorId: null, actorType: 'unknown_historical'
        }));
      }
    );
    check((await persistence.get(V4_STORES.meta, marker))?.status === 'committed', 'Atomic commit missing.');
    messages.push('PASS atomic multi-store commit');

    const rollbackKey = `rollback-${Date.now()}`;
    try {
      await persistence.runTransaction(
        [V4_STORES.meta, V4_STORES.businessEvents], 'readwrite',
        async tx => {
          await tx.add(V4_STORES.meta, { key: rollbackKey, status: 'must-not-persist' });
          throw new Error('Deliberate browser rollback');
        }
      );
    } catch (error) {
      check(error.message === 'Deliberate browser rollback', 'Unexpected rollback error.');
    }
    check(await persistence.get(V4_STORES.meta, rollbackKey) === undefined, 'Rollback persisted partial data.');
    messages.push('PASS deliberate rollback left no partial record');
    messages.push('ALL BROWSER INDEXEDDB CHECKS PASSED');
  } catch (error) {
    messages.push(`FAIL ${error.stack || error.message}`);
  } finally {
    persistence?.close();
    try { await removeTestDatabase(); } catch (error) { messages.push(`WARN cleanup: ${error.message}`); }
    output.textContent = messages.join('\n');
    button.disabled = false;
  }
});
