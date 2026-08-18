import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createV4Application } from '../v4/application/application.mjs';
import { createFreshProductionController, FRESH_RESET_STORES, FRESH_START_ACTIVATION_KEY, isValidFreshStartActivation } from '../v4/migration/fresh-production-control.mjs';
import { V4_DATABASE_NAME, V4_STORES } from '../v4/persistence/schema.mjs';
import { MemoryV4Persistence } from './helpers/memory-v4-persistence.mjs';

const stamp = '2026-08-18T23:30:00.000Z';
const context = { clock: () => new Date(stamp) };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'v4/migration/production-cutover.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'v4/migration/production-cutover-ui.mjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'v4/app/main.mjs'), 'utf8');

async function setup({ normalize = true } = {}) {
  const persistence = new MemoryV4Persistence();
  const app = await createV4Application({ persistence, context });
  const control = createFreshProductionController({ app, databaseName: V4_DATABASE_NAME, clock: context.clock, context });
  if (normalize) await control.normalize();
  return { persistence, app, control };
}

assert.match(html, /RESET V4 DEVELOPMENT DATA FOR FRESH PRODUCTION/);
assert.match(html, /REPAIR FRESH-START PRODUCTION SCOPE/);
assert.match(html, /ACTIVATE FRESH V4 PRODUCTION/);
assert.match(ui, /storeReports/);
assert.match(ui, /Complete blocker report/);
assert.match(main, /isValidFreshStartActivation/);
assert.doesNotMatch(ui, /createMigrationService|localStorage|file:\/\//);

// A/B/L: arbitrary bootstrap UUIDs, durable repair, IDs preserved, refresh recognized.
{
  const s = await setup({ normalize: false });
  const before = await s.control.diagnose();
  assert.ok(before.blockers.some(item => item.code === 'PRODUCTION_SCOPE_NORMALIZATION_REQUIRED'));
  const ids = [before.business.id, before.unit.id, before.selectedLocation.id];
  const repaired = await s.control.normalize();
  assert.deepEqual([repaired.after.business.id, repaired.after.unit.id, repaired.after.selectedLocation.id], ids);
  assert.deepEqual([repaired.after.business.name, repaired.after.unit.name, repaired.after.selectedLocation.name, repaired.after.business.defaultCurrency], ['MG Sambo Collections', 'Main Store', 'Main Store', 'NGN']);
  const reopenedApp = await createV4Application({ persistence: s.persistence, context });
  const reopened = createFreshProductionController({ app: reopenedApp, databaseName: V4_DATABASE_NAME, clock: context.clock, context });
  assert.equal((await reopened.diagnose()).eligible, true);
  assert.equal((await reopened.normalize()).after.eligible, true);
}

// C/D/E/M: activation, zero evidence, no journal, refresh, idempotency, startup/routes/native writes.
{
  const s = await setup();
  const activated = await s.control.activate();
  assert.equal(activated.alreadyActivated, false);
  assert.deepEqual([activated.verification.cash, activated.verification.ar, activated.verification.ap, activated.verification.inventoryQuantity, activated.verification.inventoryValue], [0, 0, 0, 0, 0]);
  assert.deepEqual([activated.verification.trialBalance.totalDebitsMinor, activated.verification.trialBalance.totalCreditsMinor, activated.verification.trialBalance.balanced], [0, 0, true]);
  assert.deepEqual([activated.verification.balanceSheet.assetsMinor, activated.verification.balanceSheet.liabilitiesMinor, activated.verification.balanceSheet.equityMinor, activated.verification.balanceSheet.balanced], [0, 0, 0, true]);
  assert.equal((await s.persistence.getAll(V4_STORES.journalEntries)).length, 0);
  assert.equal((await s.persistence.getAll(V4_STORES.journalEntryLines)).length, 0);
  const eventCount = (await s.persistence.getAll(V4_STORES.businessEvents)).length;
  assert.equal((await s.control.activate()).alreadyActivated, true);
  assert.equal((await s.persistence.getAll(V4_STORES.businessEvents)).length, eventCount);
  const reopenedApp = await createV4Application({ persistence: s.persistence, context });
  const reopenedControl = createFreshProductionController({ app: reopenedApp, databaseName: V4_DATABASE_NAME, clock: context.clock, context });
  const reopened = await reopenedControl.diagnose();
  assert.equal(reopened.eligible, true);
  assert.equal(isValidFreshStartActivation(reopened.activation, { businessId: reopened.active.businessId, operatingUnitId: reopened.active.operatingUnitId, inventoryLocationId: reopened.active.inventoryLocationId, currency: reopened.active.baseCurrency }), true);
  for (const route of ['sales', 'customers', 'inventory', 'purchases', 'suppliers', 'finance', 'reports']) await reopenedApp.screenData(route);
  await reopenedApp.dashboard(); await reopenedApp.activity(); await reopenedApp.search('anything');
  assert.equal((await reopenedApp.createCustomer({ name: 'Synthetic native customer' })).ok, true);
}

// F: immutable snapshot survives reset and activation; incomplete migration metadata does not control Fresh Start.
{
  const s = await setup();
  const snapshot = { id: 'immutable-snapshot', aggregateChecksum: 'immutable' };
  await s.persistence.add(V4_STORES.migrationSnapshots, snapshot);
  await s.persistence.add(V4_STORES.migrationRuns, { id: 'abandoned-run', status: 'ready', businessId: s.app.getContext().businessId, snapshotId: snapshot.id });
  await s.persistence.add(V4_STORES.products, { id: 'migrated-product', businessId: s.app.getContext().businessId, provenance: { sourceSystem: 'freeofis-v3', migrationRunId: 'abandoned-run' } });
  const reset = await s.control.resetDevelopmentData();
  assert.equal(reset.after.eligible, true);
  assert.deepEqual(await s.persistence.get(V4_STORES.migrationSnapshots, snapshot.id), snapshot);
  assert.equal((await s.persistence.getAll(V4_STORES.products)).length, 0);
  assert.equal((await s.control.activate()).evidence.legacyMigration, false);
}

// G: every reset-classified native store is diagnosed and reset; reset twice is idempotent.
{
  const s = await setup();
  for (const store of FRESH_RESET_STORES) await s.persistence.add(store, { id: `dev-${store}`, businessId: s.app.getContext().businessId });
  const report = await s.control.diagnose();
  assert.deepEqual(new Set(report.storeReports.map(item => item.store)), new Set(FRESH_RESET_STORES));
  assert.ok(report.blockers.some(item => item.code === 'FRESH_START_OPERATIONAL_DATA_PRESENT'));
  const reset = await s.control.resetDevelopmentData();
  assert.equal(reset.after.eligible, true);
  assert.ok(FRESH_RESET_STORES.every(store => reset.removed[store] === 1));
  assert.equal((await s.control.resetDevelopmentData()).after.eligible, true);
}

// H: active Bank is reported and safely removed by the authorized pre-activation reset.
{
  const s = await setup();
  await s.persistence.add(V4_STORES.financialAccounts, { id: 'dev-bank', businessId: s.app.getContext().businessId, status: 'active', type: 'bank_account', currency: 'NGN' });
  const report = await s.control.diagnose();
  assert.ok(report.blockers.some(item => item.code === 'FRESH_START_BANK_ACCOUNT_PRESENT'));
  assert.equal((await s.control.resetDevelopmentData()).after.financialAccounts.some(item => item.type === 'bank_account'), false);
}

// I/J: all financial blockers are returned together rather than first-error behavior.
{
  const s = await setup();
  const finance = { ...s.app.services.finance, ledgerBalanceByRole: async (_id, role) => role === 'cash_on_hand' ? 5 : role === 'accounts_receivable' ? 4 : role === 'accounts_payable' ? -3 : 2, trialBalance: async () => ({ totalDebitsMinor: 5, totalCreditsMinor: 4, balanced: false }), balanceSheet: async () => ({ assetsMinor: 7, liabilitiesMinor: 3, equityMinor: 3, balanced: false }) };
  const app = { ...s.app, services: { ...s.app.services, finance } };
  const report = await createFreshProductionController({ app, databaseName: V4_DATABASE_NAME, clock: context.clock, context }).diagnose();
  assert.ok(['FRESH_START_NON_ZERO_POSITION', 'FRESH_START_TRIAL_BALANCE_INVALID', 'FRESH_START_BALANCE_SHEET_INVALID'].every(code => report.blockers.some(item => item.code === code)));
}

// K: completed migration remains a hard blocker.
{
  const s = await setup();
  await s.persistence.add(V4_STORES.migrationRuns, { id: 'completed', status: 'cutover_completed', businessId: s.app.getContext().businessId });
  const report = await s.control.diagnose();
  assert.ok(report.blockers.some(item => item.code === 'MIGRATION_RUN_ALREADY_COMPLETED'));
  await assert.rejects(s.control.resetDevelopmentData(), /DEVELOPMENT_RESET_BLOCKED/);
}

// Unknown provenance fails closed and is enumerated.
{
  const s = await setup();
  await s.persistence.add(V4_STORES.products, { id: 'unknown-product', businessId: s.app.getContext().businessId, provenance: { sourceSystem: 'external-production-system' } });
  const report = await s.control.diagnose();
  assert.equal(report.storeReports[0].classification, 'E_REAL_OR_UNKNOWN_OPERATIONAL_DATA');
  assert.equal(report.storeReports[0].safelyDisposable, false);
  await assert.rejects(s.control.resetDevelopmentData(), /DEVELOPMENT_RESET_BLOCKED/);
}

process.stdout.write('All complete Fresh V4 diagnostic, reset, repair, activation, refresh, and startup checks passed.\n');
