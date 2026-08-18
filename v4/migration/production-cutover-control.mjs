import { V4_DATABASE_NAME, V4_STORES } from '../persistence/schema.mjs';
import { REHEARSAL_DATABASE_NAME, parseRehearsalSnapshot } from './rehearsal-import.mjs';

export const AUTHORIZED_SNAPSHOT_SHA256 = 'D127E5F249FE015B26AFEB3813F1248C861A16E0E1E42C75451C687CC97337BD';
export const AUTHORIZED_PHASE8_AGGREGATE_CHECKSUM = 'a4c7274878c8ca612ab362f847bc6b092e2ac89a6efc2c55fcc4c8ae3bbe4238';
export const PRODUCTION_CONFIGURATION = Object.freeze({ databaseName: V4_DATABASE_NAME, businessName: 'MG Sambo Collections', operatingUnitName: 'Main Store', inventoryLocationName: 'Main Store', baseCurrency: 'NGN', actor: 'Mohammed Bello Doka', rollbackOwner: 'Mohammed Bello Doka' });
export const AUTHORIZED_WARNINGS = Object.freeze(['UNKNOWN_INVENTORY_VALUATION', 'acquisition_cost_unknown', 'historical_cost_unknown', 'historical_location_unknown', 'ownership_unknown', 'represented_by_sale_payment_evidence']);
const CASH_REFERENCE = 'Operator-verified clean V4 accounting opening position; V3 maintained no authoritative Cash-at-Hand ledger.';
const AR_REFERENCE = 'Operator-authorized clean prospective V4 accounting opening position.';
const AP_REFERENCE = 'Operator-authorized clean prospective V4 accounting opening position; no V3 authoritative supplier-payables ledger is being carried into opening accounting.';
const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
const unique = values => [...new Set(values)];
const req = (value, message) => { if (!value) throw new Error(message); return value; };

export async function parseAuthorizedSnapshot(bytes, { authorizedChecksum = AUTHORIZED_SNAPSHOT_SHA256, cryptoApi = globalThis.crypto } = {}) {
  const checksum = hex(await cryptoApi.subtle.digest('SHA-256', bytes));
  if (checksum !== authorizedChecksum) throw new Error(`SNAPSHOT_FILE_CHECKSUM_MISMATCH:${checksum}`);
  return { checksum, envelope: parseRehearsalSnapshot(new TextDecoder().decode(bytes)) };
}

export function createProductionCutoverController({ app, migration, databaseName = V4_DATABASE_NAME, clock = () => new Date(), confirmFinalCutover = () => false, authorizedAggregateChecksum = AUTHORIZED_PHASE8_AGGREGATE_CHECKSUM } = {}) {
  if (databaseName !== V4_DATABASE_NAME || databaseName === REHEARSAL_DATABASE_NAME) throw new Error('PRODUCTION_DATABASE_IDENTITY_INVALID');
  let snapshot, sourceFileChecksum, run, reconciliation;
  const timestamp = () => clock().toISOString();
  const current = async () => run = await app.persistence.get(V4_STORES.migrationRuns, run.id);
  return Object.freeze({
    get state() { return { snapshot, sourceFileChecksum, run, reconciliation, databaseName }; },
    async resume() {
      snapshot = (await app.persistence.getAll(V4_STORES.migrationSnapshots)).find(item => item.aggregateChecksum === authorizedAggregateChecksum);
      if (!snapshot) return { stage: 'snapshot_required' };
      await migration.verifySnapshot(snapshot);
      sourceFileChecksum = AUTHORIZED_SNAPSHOT_SHA256;
      const runs = (await app.persistence.getAll(V4_STORES.migrationRuns)).filter(item => item.snapshotId === snapshot.id);
      if (runs.length > 1) throw new Error('MULTIPLE_PRODUCTION_MIGRATION_RUNS');
      run = runs[0];
      if (!run) return { stage: 'snapshot_verified', snapshot };
      if (run.reconciliationStatus && run.reconciliationStatus !== 'not_started') reconciliation = { run, warnings: run.warnings || [], blockers: run.blockers || [] };
      const stage = run.status === 'cutover_completed' ? 'cutover_completed' : run.status === 'accepted' && run.maintenanceMode === 'active' ? 'maintenance_active' : run.status === 'accepted' ? 'accepted' : run.status === 'ready_for_acceptance' && run.metadata?.zeroOpeningPosition ? 'opening_applied' : run.status === 'ready_for_acceptance' ? 'reconciled' : run.status === 'migrated' ? 'migrated' : run.status === 'ready' ? 'target_verified' : run.status;
      return { stage, snapshot, run };
    },
    async importSnapshot(bytes, options = {}) {
      const parsed = await parseAuthorizedSnapshot(bytes, options);
      sourceFileChecksum = parsed.checksum;
      snapshot = await migration.createSnapshot(parsed.envelope);
      await migration.verifySnapshot(snapshot);
      return snapshot;
    },
    async verifyTarget() {
      req(snapshot, 'SNAPSHOT_REQUIRED');
      const ctx = app.getContext(), business = await app.persistence.get(V4_STORES.businesses, ctx.businessId), unit = await app.persistence.get(V4_STORES.operatingUnits, ctx.operatingUnitId);
      if (business?.name !== PRODUCTION_CONFIGURATION.businessName || unit?.name !== PRODUCTION_CONFIGURATION.operatingUnitName || business?.defaultCurrency !== PRODUCTION_CONFIGURATION.baseCurrency) throw new Error('PRODUCTION_SCOPE_MISMATCH');
      if ((await app.persistence.getAll(V4_STORES.migrationRuns)).length) throw new Error('PRODUCTION_MIGRATION_RUN_ALREADY_EXISTS');
      const assessment = await migration.targetAssessment();
      if (!assessment.empty) throw new Error(`TARGET_V4_NOT_EMPTY:${assessment.meaningfulRecordCount}`);
      let location = (await app.persistence.getAll(V4_STORES.inventoryLocations)).find(item => item.businessId === ctx.businessId && item.operatingUnitId === ctx.operatingUnitId && item.name === PRODUCTION_CONFIGURATION.inventoryLocationName && item.status === 'active');
      if (!location) location = await app.services.inventory.createLocation({ businessId: ctx.businessId, operatingUnitId: ctx.operatingUnitId, name: PRODUCTION_CONFIGURATION.inventoryLocationName, negativeStockPolicy: 'allow_with_warning' });
      await app.switchContext({ businessId: ctx.businessId, operatingUnitId: ctx.operatingUnitId, inventoryLocationId: location.id });
      const active = app.getContext();
      run = await migration.createRun({ snapshotId: snapshot.id, businessId: active.businessId, operatingUnitId: active.operatingUnitId, inventoryLocationId: active.inventoryLocationId, baseCurrency: active.baseCurrency, cutoverAt: timestamp(), actorId: PRODUCTION_CONFIGURATION.actor });
      if (run.status !== 'ready' || run.blockers?.length) throw new Error(`TARGET_NOT_READY:${JSON.stringify(run.blockers || [])}`);
      return { databaseName, assessment, run };
    },
    async executeMigration() { req(run?.status === 'ready', 'TARGET_VERIFICATION_REQUIRED'); run = await migration.execute(run.id); return run; },
    async reconcile() {
      req(run?.status === 'migrated', 'MIGRATION_REQUIRED'); reconciliation = await migration.reconcile(run.id); run = reconciliation.run;
      if (!reconciliation.readyForAcceptance) throw new Error(`RECONCILIATION_BLOCKED:${JSON.stringify(reconciliation.blockers)}`);
      const generated = unique(reconciliation.warnings.map(item => item.code)), unexpected = generated.filter(code => !AUTHORIZED_WARNINGS.includes(code));
      if (unexpected.length) throw new Error(`UNAUTHORIZED_WARNING:${unexpected.join(',')}`);
      return reconciliation;
    },
    async recordZeroOpeningPosition() {
      req(run?.status === 'ready_for_acceptance', 'RECONCILIATION_REQUIRED');
      const verifiedAt = timestamp(), accounts = (await app.persistence.getAll(V4_STORES.ledgerAccounts)).filter(item => item.businessId === run.businessId), cash = accounts.find(item => item.systemRole === 'cash_on_hand'), ar = accounts.find(item => item.systemRole === 'accounts_receivable'), ap = accounts.find(item => item.systemRole === 'accounts_payable'), banks = (await app.persistence.getAll(V4_STORES.financialAccounts)).filter(item => item.businessId === run.businessId && item.status === 'active' && item.type === 'bank_account');
      if (banks.length) throw new Error('ACTIVE_BANK_ACCOUNT_REQUIRES_INDEPENDENT_EVIDENCE');
      return migration.recordOpeningPosition(run.id, { actor: PRODUCTION_CONFIGURATION.actor, receivables: { status: 'verified', amountMinor: 0, verifiedAt, verificationReference: AR_REFERENCE }, payables: { status: 'verified', amountMinor: 0, verifiedAt, verificationReference: AP_REFERENCE }, balances: [{ accountId: cash.id, amountMinor: 0, verifiedAt, verificationReference: CASH_REFERENCE }, { accountId: ar.id, amountMinor: 0, verifiedAt, verificationReference: AR_REFERENCE }, { accountId: ap.id, amountMinor: 0, verifiedAt, verificationReference: AP_REFERENCE }] }, app.services.finance);
    },
    async readiness() { req(run, 'MIGRATION_RUN_REQUIRED'); return migration.readiness(run.id); },
    async acceptWarnings(acceptedWarnings) { req(reconciliation, 'RECONCILIATION_REQUIRED'); const generated = unique(reconciliation.warnings.map(item => item.code)); if (generated.some(code => !acceptedWarnings.includes(code))) throw new Error('EXPLICIT_WARNING_ACCEPTANCE_REQUIRED'); run = await migration.accept(run.id, { actor: PRODUCTION_CONFIGURATION.actor, acceptedWarnings }); return run; },
    async activateMaintenance() { req(run?.status === 'accepted', 'ACCEPTED_MIGRATION_REQUIRED'); const frozenAt = timestamp(), freezeReference = `operator-freeze:${run.id}:${frozenAt}`; run = await migration.activateMaintenanceMode(run.id, { actor: PRODUCTION_CONFIGURATION.actor, frozenAt, freezeReference }); return run; },
    async completeCutover() { req(run?.status === 'accepted', 'ACCEPTED_MIGRATION_REQUIRED'); req(run.maintenanceMode === 'active', 'MAINTENANCE_MODE_NOT_ACTIVE'); if (!await confirmFinalCutover()) throw new Error('FINAL_HUMAN_CONFIRMATION_REQUIRED'); run = await migration.completeCutover(run.id, { actor: PRODUCTION_CONFIGURATION.actor }); return run; },
    async verify() {
      await current(); await migration.verifySnapshot(snapshot);
      const ready = await migration.readiness(run.id), products = (await app.persistence.getAll(V4_STORES.products)).filter(item => item.provenance?.migrationRunId === run.id), movements = (await app.persistence.getAll(V4_STORES.inventoryMovements)).filter(item => item.provenance?.migrationRunId === run.id), customers = (await app.persistence.getAll(V4_STORES.customers)).filter(item => item.provenance?.migrationRunId === run.id), sales = (await app.persistence.getAll(V4_STORES.salesOrders)).filter(item => item.provenance?.migrationRunId === run.id), lines = (await app.persistence.getAll(V4_STORES.salesOrderLines)).filter(item => item.provenance?.migrationRunId === run.id), trial = await app.services.finance.trialBalance(run.businessId), balance = await app.services.finance.balanceSheet(run.businessId);
      return { databaseName, runId: run.id, status: run.status, cutoverAt: run.cutoverAt, cutoverCompletedAt: run.cutoverCompletedAt, snapshotFileChecksum: sourceFileChecksum, snapshotChecksumVerified: true, products: products.length, quantity: movements.reduce((sum, item) => sum + item.signedQuantity, 0), customers: customers.length, sales: sales.length, saleLines: lines.length, walkIns: sales.filter(item => item.customerId === null).length, zeroOpeningPosition: run.metadata?.zeroOpeningPosition === true, trialBalanceBalanced: trial.balanced, balanceSheetBalanced: balance.balanced, acceptedWarnings: run.acceptedWarnings || [], blockers: ready.blockers, maintenanceEvidence: run.maintenanceEvidence, rollbackOwner: PRODUCTION_CONFIGURATION.rollbackOwner, rollbackAvailable: !run.nativeOperationsStarted, v3Preservation: 'Not accessed by V4 HTTP control', snapshotPreservation: 'Operator-selected file was read without modification' };
    },
    async rollback(reason) { req(run && ['accepted', 'cutover_completed'].includes(run.status), 'ROLLBACK_NOT_AVAILABLE'); run = await migration.rollback(run.id, { actor: PRODUCTION_CONFIGURATION.rollbackOwner, reason }); return run; }
  });
}
