import { createBusinessEvent } from '../domain/entities.mjs';
import { V4_DATABASE_NAME, V4_STORES } from '../persistence/schema.mjs';

export const FRESH_START_ACTIVATION_KEY = 'production_activation';
export const FRESH_PRODUCTION_SCOPE = Object.freeze({ businessName: 'MG Sambo Collections', operatingUnitName: 'Main Store', inventoryLocationName: 'Main Store', currency: 'NGN', actor: 'Mohammed Bello Doka' });

export const FRESH_RESET_STORES = Object.freeze([
  'approvals', 'legacyMappings', 'products', 'productIdentifiers', 'inventoryMovements', 'inventoryCostLayers',
  'customers', 'salesOrders', 'salesOrderLines', 'salesFulfillments', 'salesFulfillmentLines', 'customerInvoices',
  'customerInvoiceLines', 'customerPayments', 'customerPaymentAllocations', 'customerCreditNotes',
  'customerCreditNoteLines', 'salesReturns', 'salesReturnLines', 'customerRefunds', 'inventoryCostRecognitions',
  'suppliers', 'procurementAgreements', 'purchaseOrders', 'purchaseOrderLines', 'goodsReceipts', 'goodsReceiptLines',
  'supplierInvoices', 'supplierInvoiceLines', 'supplierPayments', 'supplierPaymentAllocations', 'purchaseReturns',
  'purchaseReturnLines', 'documentSequences', 'idempotencyRecords', 'journalEntries', 'journalEntryLines',
  'financeTransactions', 'expensesV4', 'accountingPeriods', 'openingBalanceBatches', 'financePostingCheckpoints',
  'financePostingFailures'
].map(name => V4_STORES[name]));

const allowedSources = new Set([undefined, null, '', 'freeofis-v4', 'freeofis-v3', 'test', 'synthetic']);
const recordIdentity = record => ({ id: record.id ?? record.key ?? null, businessId: record.businessId ?? null, sourceSystem: record.provenance?.sourceSystem ?? record.sourceSystem ?? null, migrationRunId: record.provenance?.migrationRunId ?? record.migrationRunId ?? null, status: record.status ?? null });
const sourceOf = record => record.provenance?.sourceSystem ?? record.sourceSystem;

export function isValidFreshStartActivation(evidence, scope = {}) {
  const opening = evidence?.openingPosition;
  const verified = item => item?.status === 'verified' && item.amountMinor === 0 && item.verifiedBy && item.verifiedAt && item.verificationReference;
  return evidence?.status === 'active' && evidence.productionActivated === true && evidence.activationMode === 'fresh_start' && evidence.legacyMigration === false && evidence.zeroOpeningPosition === true && evidence.nativeOperationsEnabled === true &&
    (!scope.businessId || evidence.businessId === scope.businessId) && (!scope.operatingUnitId || evidence.operatingUnitId === scope.operatingUnitId) && (!scope.inventoryLocationId || evidence.inventoryLocationId === scope.inventoryLocationId) && (!scope.currency || evidence.currency === scope.currency) &&
    verified(opening?.cash) && verified(opening?.bankPosition) && opening.bankAccounts?.length === 0 && verified(opening?.accountsReceivable) && verified(opening?.accountsPayable) && opening.inventory?.status === 'verified' && opening.inventory.quantity === 0 && opening.inventory.valueMinor === 0 && opening.inventory.verifiedBy && opening.inventory.verifiedAt && opening.inventory.verificationReference &&
    opening.trialBalance?.totalDebitsMinor === 0 && opening.trialBalance?.totalCreditsMinor === 0 && opening.trialBalance?.balanced === true && opening.balanceSheet?.assetsMinor === 0 && opening.balanceSheet?.liabilitiesMinor === 0 && opening.balanceSheet?.equityMinor === 0 && opening.balanceSheet?.balanced === true && opening.journalRequired === false && opening.journalCreated === false;
}

export function createFreshProductionController({ app, databaseName = V4_DATABASE_NAME, clock = () => new Date(), context = {} } = {}) {
  if (databaseName !== V4_DATABASE_NAME) throw Error('PRODUCTION_DATABASE_IDENTITY_INVALID');
  const now = () => clock().toISOString();

  async function readState() {
    const active = app.getContext();
    const [business, unit, businesses, units, allLocations, bootstrap, ownerBootstrap, memberships, events, financialAccounts, snapshots, runs, manifests, resolutions, reconciliations, activation] = await Promise.all([
      app.persistence.get(V4_STORES.businesses, active.businessId), app.persistence.get(V4_STORES.operatingUnits, active.operatingUnitId), app.persistence.getAll(V4_STORES.businesses), app.persistence.getAll(V4_STORES.operatingUnits), app.persistence.getAll(V4_STORES.inventoryLocations), app.persistence.get(V4_STORES.meta, 'legacyV3ScopeBootstrap'), app.persistence.get(V4_STORES.meta, 'legacyV3OwnerBootstrap'), app.persistence.getAll(V4_STORES.businessMemberships), app.persistence.getAll(V4_STORES.businessEvents), app.persistence.getAll(V4_STORES.financialAccounts), app.persistence.getAll(V4_STORES.migrationSnapshots), app.persistence.getAll(V4_STORES.migrationRuns), app.persistence.getAll(V4_STORES.migrationManifestEntries), app.persistence.getAll(V4_STORES.migrationResolutions), app.persistence.getAll(V4_STORES.migrationReconciliations), app.persistence.get(V4_STORES.meta, FRESH_START_ACTIVATION_KEY)
    ]);
    const scopedLocations = allLocations.filter(item => item.businessId === active.businessId && item.operatingUnitId === active.operatingUnitId);
    const activeLocations = scopedLocations.filter(item => item.status === 'active');
    const selectedLocation = activeLocations.find(item => item.id === active.inventoryLocationId);
    const storeReports = [];
    for (const store of FRESH_RESET_STORES) {
      const records = await app.persistence.getAll(store);
      if (!records.length) continue;
      const unknown = records.filter(record => !allowedSources.has(sourceOf(record)));
      const migrated = records.filter(record => sourceOf(record) === 'freeofis-v3' || record.provenance?.migrationRunId);
      storeReports.push({ store, count: records.length, classification: unknown.length ? 'E_REAL_OR_UNKNOWN_OPERATIONAL_DATA' : migrated.length === records.length ? 'C_ABANDONED_MIGRATION_OUTPUT' : 'D_AUTHORIZED_PRE_ACTIVATION_V4_DEVELOPMENT_DATA', safelyDisposable: unknown.length === 0 && !activation, reason: 'Native operational/accounting state prevents a genuine zero Fresh Start.', records: records.slice(0, 25).map(recordIdentity), omittedRecordCount: Math.max(0, records.length - 25) });
    }
    const scopedFinancial = financialAccounts.filter(item => item.businessId === active.businessId && item.status === 'active');
    const disposableFinancial = scopedFinancial.filter(item => item.type !== 'physical_cash');
    if (disposableFinancial.length) storeReports.push({ store: V4_STORES.financialAccounts, count: disposableFinancial.length, classification: disposableFinancial.some(record => !allowedSources.has(sourceOf(record))) ? 'E_REAL_OR_UNKNOWN_OPERATIONAL_DATA' : 'D_AUTHORIZED_PRE_ACTIVATION_V4_DEVELOPMENT_DATA', safelyDisposable: disposableFinancial.every(record => allowedSources.has(sourceOf(record))) && !activation, reason: 'Fresh Start permits only the bootstrap physical Cash account and no active Bank/other financial account.', records: disposableFinancial.map(recordIdentity), omittedRecordCount: 0 });
    const [cash, ar, ap, inventoryValue, trial, balance] = await Promise.all([app.services.finance.ledgerBalanceByRole(active.businessId, 'cash_on_hand'), app.services.finance.ledgerBalanceByRole(active.businessId, 'accounts_receivable'), app.services.finance.ledgerBalanceByRole(active.businessId, 'accounts_payable'), app.services.finance.ledgerBalanceByRole(active.businessId, 'inventory_asset'), app.services.finance.trialBalance(active.businessId), app.services.finance.balanceSheet(active.businessId)]);
    const inventoryQuantity = (await app.persistence.getAll(V4_STORES.inventoryMovements)).filter(item => item.businessId === active.businessId && item.status === 'active').reduce((sum, item) => sum + item.signedQuantity, 0);
    const blockers = [];
    const add = (code, detail) => blockers.push({ code, detail });
    if (!business || !unit || !selectedLocation) add('PRODUCTION_BOOTSTRAP_SCOPE_INCOMPLETE', 'The active bootstrap Business, Operating Unit, or Inventory Location is missing.');
    if (bootstrap?.status !== 'completed' || bootstrap.businessId !== business?.id || bootstrap.operatingUnitId !== unit?.id || bootstrap.accountId !== business?.accountId) add('PRODUCTION_BOOTSTRAP_CONTEXT_INCONSISTENT', 'legacyV3ScopeBootstrap does not reference the active persisted scope.');
    const membership = memberships.find(item => item.id === ownerBootstrap?.membershipId);
    if (ownerBootstrap?.status !== 'completed' || !membership || membership.businessId !== business?.id || membership.userId !== active.userId) add('PRODUCTION_OWNER_CONTEXT_INCONSISTENT', 'Owner bootstrap metadata or membership does not reference the active Business.');
    if (businesses.filter(item => item.accountId === business?.accountId && item.status === 'active').length !== 1 || units.filter(item => item.businessId === business?.id && item.status === 'active').length !== 1) add('PRODUCTION_BOOTSTRAP_SCOPE_AMBIGUOUS', 'More than one active Business or Operating Unit exists in the bootstrap account scope.');
    if (storeReports.length) add('FRESH_START_OPERATIONAL_DATA_PRESENT', `${storeReports.length} store classification(s) contain resettable or unknown state.`);
    if (storeReports.some(report => report.classification === 'E_REAL_OR_UNKNOWN_OPERATIONAL_DATA')) add('FRESH_START_UNKNOWN_DATA_PRESENT', 'At least one record has unrecognized provenance and cannot be reset automatically.');
    if (scopedFinancial.some(item => item.type === 'bank_account')) add('FRESH_START_BANK_ACCOUNT_PRESENT', 'At least one active Bank account exists.');
    if ([cash, ar, ap, inventoryValue, inventoryQuantity].some(value => value !== 0)) add('FRESH_START_NON_ZERO_POSITION', { cash, ar, ap, inventoryValue, inventoryQuantity });
    if (!trial.balanced || trial.totalDebitsMinor !== 0 || trial.totalCreditsMinor !== 0) add('FRESH_START_TRIAL_BALANCE_INVALID', trial);
    if (!balance.balanced || balance.assetsMinor !== 0 || balance.liabilitiesMinor !== 0 || balance.equityMinor !== 0) add('FRESH_START_BALANCE_SHEET_INVALID', balance);
    if (runs.some(run => run.status === 'cutover_completed')) add('MIGRATION_RUN_ALREADY_COMPLETED', 'A completed legacy cutover cannot be reclassified as Fresh Start.');
    const normalized = business?.name === FRESH_PRODUCTION_SCOPE.businessName && unit?.name === FRESH_PRODUCTION_SCOPE.operatingUnitName && selectedLocation?.name === FRESH_PRODUCTION_SCOPE.inventoryLocationName && business?.defaultCurrency === FRESH_PRODUCTION_SCOPE.currency && activeLocations.length === 1;
    if (!normalized) add('PRODUCTION_SCOPE_NORMALIZATION_REQUIRED', 'The preserved bootstrap scope requires in-place normalization.');
    if (activation && !isValidFreshStartActivation(activation, { businessId: business?.id, operatingUnitId: unit?.id, inventoryLocationId: selectedLocation?.id, currency: business?.defaultCurrency })) add('FRESH_START_ACTIVATION_EVIDENCE_INCONSISTENT', 'Persisted activation evidence is incomplete or does not match the active scope.');
    return { databaseName, active, business, unit, selectedLocation, activeLocations, scopedLocations, bootstrap, ownerBootstrap, events: { count: events.length, classification: 'B_TECHNICAL_AUDIT_PRESERVED', records: events.slice(0, 25).map(recordIdentity) }, storeReports, blockers, financialAccounts: scopedFinancial, cash, ar, ap, inventoryQuantity, inventoryValue, trialBalance: trial, balanceSheet: balance, migrationArtifacts: { classification: 'C_LEGACY_MIGRATION_ARTIFACT_PRESERVED_NOT_CONTROLLING_FRESH_START', snapshots: snapshots.map(recordIdentity), runs: runs.map(recordIdentity), manifestCount: manifests.length, resolutionCount: resolutions.length, reconciliationCount: reconciliations.length }, activation, normalized, eligible: blockers.length === 0 };
  }

  async function normalize() {
    const before = await readState();
    const unsafe = before.blockers.filter(blocker => !['PRODUCTION_SCOPE_NORMALIZATION_REQUIRED'].includes(blocker.code));
    if (unsafe.length) throw Error(`FRESH_SCOPE_NORMALIZATION_BLOCKED:${unsafe.map(item => item.code).join(',')}`);
    const target = before.selectedLocation;
    await app.persistence.runTransaction([V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.inventoryLocations, V4_STORES.meta], 'readwrite', async tx => {
      const business = await tx.get(V4_STORES.businesses, before.business.id), unit = await tx.get(V4_STORES.operatingUnits, before.unit.id), location = await tx.get(V4_STORES.inventoryLocations, target.id), bootstrap = await tx.get(V4_STORES.meta, 'legacyV3ScopeBootstrap');
      if (!business || !unit || !location || bootstrap.businessId !== business.id || bootstrap.operatingUnitId !== unit.id) throw Error('PRODUCTION_SCOPE_CHANGED_DURING_NORMALIZATION');
      await tx.put(V4_STORES.businesses, { ...business, name: FRESH_PRODUCTION_SCOPE.businessName, defaultCurrency: FRESH_PRODUCTION_SCOPE.currency });
      await tx.put(V4_STORES.operatingUnits, { ...unit, name: FRESH_PRODUCTION_SCOPE.operatingUnitName });
      await tx.put(V4_STORES.inventoryLocations, { ...location, name: FRESH_PRODUCTION_SCOPE.inventoryLocationName, status: 'active' });
      for (const duplicate of before.activeLocations.filter(item => item.id !== location.id)) await tx.put(V4_STORES.inventoryLocations, { ...duplicate, status: 'inactive' });
    });
    await app.switchContext({ businessId: before.business.id, operatingUnitId: before.unit.id, inventoryLocationId: target.id });
    return { before, after: await readState() };
  }

  async function resetDevelopmentData() {
    const before = await readState();
    if (before.activation) throw Error('RESET_AFTER_PRODUCTION_ACTIVATION_FORBIDDEN');
    if (before.blockers.some(item => ['PRODUCTION_BOOTSTRAP_SCOPE_INCOMPLETE', 'PRODUCTION_BOOTSTRAP_CONTEXT_INCONSISTENT', 'PRODUCTION_OWNER_CONTEXT_INCONSISTENT', 'PRODUCTION_BOOTSTRAP_SCOPE_AMBIGUOUS', 'FRESH_START_UNKNOWN_DATA_PRESENT', 'MIGRATION_RUN_ALREADY_COMPLETED'].includes(item.code))) throw Error(`DEVELOPMENT_RESET_BLOCKED:${before.blockers.map(item => item.code).join(',')}`);
    const stores = [...FRESH_RESET_STORES, V4_STORES.financialAccounts];
    const removed = {};
    await app.persistence.runTransaction(stores, 'readwrite', async tx => {
      for (const store of FRESH_RESET_STORES) {
        const records = await tx.getAll(store);
        removed[store] = records.length;
        for (const record of records) await tx.delete(store, record.id ?? record.key);
      }
      const accounts = await tx.getAll(V4_STORES.financialAccounts);
      const disposable = accounts.filter(item => item.businessId === before.business.id && item.type !== 'physical_cash');
      removed[V4_STORES.financialAccounts] = disposable.length;
      for (const account of disposable) await tx.delete(V4_STORES.financialAccounts, account.id);
    });
    const afterReset = await readState();
    const remainingResetBlockers = afterReset.blockers.filter(item => !['PRODUCTION_SCOPE_NORMALIZATION_REQUIRED'].includes(item.code));
    if (remainingResetBlockers.length) throw Error(`POST_RESET_VERIFICATION_FAILED:${remainingResetBlockers.map(item => item.code).join(',')}`);
    const normalized = afterReset.normalized ? { before: afterReset, after: afterReset } : await normalize();
    const after = await readState();
    if (!after.eligible) throw Error(`POST_RESET_FRESH_START_BLOCKED:${after.blockers.map(item => item.code).join(',')}`);
    return { removed, preserved: { bootstrapScopeIds: [before.business.id, before.unit.id, before.selectedLocation.id], migrationSnapshots: before.migrationArtifacts.snapshots.length, technicalEvents: before.events.count }, before, normalization: normalized, after };
  }

  async function activate() {
    const state = await readState();
    if (state.activation) {
      if (!state.eligible || !isValidFreshStartActivation(state.activation, { businessId: state.business.id, operatingUnitId: state.unit.id, inventoryLocationId: state.selectedLocation.id, currency: state.business.defaultCurrency })) throw Error('FRESH_START_ACTIVATION_EVIDENCE_INCONSISTENT');
      return { alreadyActivated: true, evidence: state.activation, verification: state };
    }
    if (!state.eligible) throw Error(`FRESH_START_ACTIVATION_BLOCKED:${state.blockers.map(item => item.code).join(',')}`);
    const at = now(), reference = 'Operator-authorized Fresh V4 production start with no V3 migration; verified from absent operational activity.';
    const evidence = { key: FRESH_START_ACTIVATION_KEY, status: 'active', productionActivated: true, activationMode: 'fresh_start', legacyMigration: false, freshStart: true, zeroOpeningPosition: true, nativeOperationsEnabled: true, businessId: state.business.id, operatingUnitId: state.unit.id, inventoryLocationId: state.selectedLocation.id, currency: state.business.defaultCurrency, activatedAt: at, activatedBy: FRESH_PRODUCTION_SCOPE.actor, openingPosition: { cash: { status: 'verified', amountMinor: 0, verifiedAt: at, verifiedBy: FRESH_PRODUCTION_SCOPE.actor, verificationReference: reference }, bankPosition: { status: 'verified', amountMinor: 0, verifiedAt: at, verifiedBy: FRESH_PRODUCTION_SCOPE.actor, verificationReference: 'No active Bank accounts.' }, bankAccounts: [], accountsReceivable: { status: 'verified', amountMinor: 0, verifiedAt: at, verifiedBy: FRESH_PRODUCTION_SCOPE.actor, verificationReference: reference }, accountsPayable: { status: 'verified', amountMinor: 0, verifiedAt: at, verifiedBy: FRESH_PRODUCTION_SCOPE.actor, verificationReference: reference }, inventory: { status: 'verified', quantity: 0, valueMinor: 0, verifiedAt: at, verifiedBy: FRESH_PRODUCTION_SCOPE.actor, verificationReference: 'No Products, movements, cost layers, or inventory journals.' }, trialBalance: { totalDebitsMinor: 0, totalCreditsMinor: 0, balanced: true }, balanceSheet: { assetsMinor: 0, liabilitiesMinor: 0, equityMinor: 0, balanced: true }, journalRequired: false, journalCreated: false }, migrationArtifacts: state.migrationArtifacts };
    await app.persistence.runTransaction([V4_STORES.meta, V4_STORES.businessEvents], 'readwrite', async tx => {
      if (await tx.get(V4_STORES.meta, FRESH_START_ACTIVATION_KEY)) throw Error('FRESH_START_ACTIVATION_RACE');
      await tx.add(V4_STORES.meta, evidence);
      await tx.add(V4_STORES.businessEvents, createBusinessEvent({ accountId: state.business.accountId, businessId: state.business.id, operatingUnitId: state.unit.id, eventType: 'production.fresh_start.activated', entityType: 'productionActivation', entityId: FRESH_START_ACTIVATION_KEY, actorId: FRESH_PRODUCTION_SCOPE.actor, metadata: { activationMode: 'fresh_start', legacyMigration: false } }, { clock, uuidOptions: context.uuidOptions }));
    });
    const after = await readState();
    if (!after.eligible || !isValidFreshStartActivation(after.activation, { businessId: after.business.id, operatingUnitId: after.unit.id, inventoryLocationId: after.selectedLocation.id, currency: after.business.defaultCurrency })) throw Error('FRESH_START_ACTIVATION_WRITE_FAILED');
    return { alreadyActivated: false, evidence: after.activation, verification: after };
  }

  return Object.freeze({ diagnose: readState, normalize, resetDevelopmentData, activate });
}
