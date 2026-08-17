'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const fixturePath = path.join(
  __dirname,
  'fixtures',
  'v3-representative-backup.json'
);

const V3_VERSION = 3;
const V3_STORAGE_KEYS = Object.freeze([
  'freeofis_inventory',
  'freeofis_customers',
  'freeofis_sales',
  'freeofis_payments',
  'freeofis_expenses',
  'freeofis_business',
  'freeofis_data_version'
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function recognizeV3Backup(payload) {
  const data = payload && (payload.data || payload);
  const requiredArrays = [
    'inventory',
    'customers',
    'sales',
    'payments',
    'expenses'
  ];

  return Boolean(
    data && requiredArrays.every(key => Array.isArray(data[key]))
  );
}

function compatibilityView(payload) {
  assert.equal(recognizeV3Backup(payload), true);

  const source = deepClone(payload.data || payload);
  const customerIds = new Set(source.customers.map(customer => customer.id));

  return {
    source,
    sales: source.sales.map(sale => ({
      legacyId: sale.id,
      customerId: sale.customerId === undefined ? null : sale.customerId,
      customerResolution:
        sale.customerId === null || sale.customerId === undefined
          ? 'walk_in'
          : customerIds.has(sale.customerId)
            ? 'resolved'
            : 'orphaned',
      items: deepClone(Array.isArray(sale.items) ? sale.items : []),
      status: sale.status || 'completed',
      cancelledAt: sale.cancelledAt || null,
      transactionAt: sale.transactionAt || `${sale.date}T00:00:00`,
      inventoryCostMinor: null,
      inventoryCostStatus: 'unknown_historical',
      actorId: null,
      actorStatus: 'unknown_historical'
    })),
    payments: source.payments.map(payment => ({
      legacyId: payment.id,
      customerId:
        payment.customerId === undefined ? null : payment.customerId,
      saleId: payment.saleId || null,
      status: payment.status || 'completed',
      cancelledAt: payment.cancelledAt || null,
      destinationFinancialAccountId: null,
      destinationAllocationStatus: 'unallocated_historical_unknown'
    }))
  };
}

function collectIds(data) {
  return {
    inventory: data.inventory.map(record => record.id),
    customers: data.customers.map(record => record.id),
    sales: data.sales.map(record => record.id),
    payments: data.payments.map(record => record.id),
    expenses: data.expenses.map(record => record.id)
  };
}

function test(name, action) {
  try {
    action();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

const rawFixture = fs.readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(rawFixture);
const fixtureBefore = JSON.stringify(fixture);

global.localStorage = Object.freeze({
  getItem() {
    throw new Error('Compatibility validation must not read production localStorage');
  },
  setItem() {
    throw new Error('Compatibility validation must not mutate production localStorage');
  },
  removeItem() {
    throw new Error('Compatibility validation must not mutate production localStorage');
  },
  clear() {
    throw new Error('Compatibility validation must not mutate production localStorage');
  }
});

const view = compatibilityView(fixture);

test('recognizes the current V3 backup envelope', () => {
  assert.equal(fixture.app, 'Free Ofis');
  assert.equal(fixture.version, V3_VERSION);
  assert.equal(recognizeV3Backup(fixture), true);
  assert.equal(recognizeV3Backup(fixture.data), true);
});

test('preserves every V3 ID', () => {
  assert.deepEqual(collectIds(view.source), collectIds(fixture.data));
  assert.deepEqual(
    view.sales.map(sale => sale.legacyId),
    fixture.data.sales.map(sale => sale.id)
  );
  assert.deepEqual(
    view.payments.map(payment => payment.legacyId),
    fixture.data.payments.map(payment => payment.id)
  );
});

test('keeps Walk-ins null and never persists the UI sentinel', () => {
  const walkInSale = view.sales.find(sale => sale.legacyId === 'SALE-WALKIN-003');
  const walkInPayment = view.payments.find(
    payment => payment.legacyId === 'PAY-WALKIN-003'
  );

  assert.equal(walkInSale.customerId, null);
  assert.equal(walkInSale.customerResolution, 'walk_in');
  assert.equal(walkInPayment.customerId, null);
  assert.equal(JSON.stringify(fixture).includes('__walkin__'), false);
  assert.equal(JSON.stringify(view).includes('__walkin__'), false);
});

test('keeps an orphaned non-null customer reference orphaned', () => {
  const sale = view.sales.find(sale => sale.legacyId === 'SALE-ORPHAN-005');
  assert.equal(sale.customerId, 'CUS-ARCHIVED-999');
  assert.equal(sale.customerResolution, 'orphaned');
});

test('preserves multi-item lines and their order', () => {
  const source = fixture.data.sales.find(sale => sale.id === 'SALE-MULTI-004');
  const projected = view.sales.find(sale => sale.legacyId === source.id);
  assert.equal(projected.items.length, 2);
  assert.deepEqual(projected.items, source.items);
});

test('preserves explicit sale and payment links', () => {
  const links = new Map(
    view.payments.map(payment => [payment.legacyId, payment.saleId])
  );
  assert.equal(links.get('PAY-CASH-001'), 'SALE-CASH-001');
  assert.equal(links.get('PAY-PARTIAL-002'), 'SALE-CREDIT-002');
  assert.equal(links.get('PAY-MULTI-004'), 'SALE-MULTI-004');
});

test('preserves cancellation status and timestamps', () => {
  const sale = view.sales.find(sale => sale.legacyId === 'SALE-CANCELLED-006');
  const payment = view.payments.find(
    payment => payment.legacyId === 'PAY-CANCELLED-006'
  );
  assert.equal(sale.status, 'cancelled');
  assert.equal(sale.cancelledAt, '2026-08-16T14:05:00');
  assert.equal(payment.status, 'cancelled');
  assert.equal(payment.cancelledAt, '2026-08-16T14:05:00');
});

test('represents unknown cost, destination, and actor without guessing', () => {
  assert.equal(view.sales.every(sale => sale.inventoryCostMinor === null), true);
  assert.equal(
    view.sales.every(sale => sale.inventoryCostStatus === 'unknown_historical'),
    true
  );
  assert.equal(view.sales.every(sale => sale.actorId === null), true);
  assert.equal(
    view.payments.every(
      payment =>
        payment.destinationFinancialAccountId === null &&
        payment.destinationAllocationStatus ===
          'unallocated_historical_unknown'
    ),
    true
  );
});

test('supports transactionAt fallback without changing source records', () => {
  const source = fixture.data.sales.find(
    sale => sale.id === 'SALE-LEGACY-DATE-007'
  );
  const projected = view.sales.find(sale => sale.legacyId === source.id);
  assert.equal(Object.hasOwn(source, 'transactionAt'), false);
  assert.equal(projected.transactionAt, '2026-07-31T00:00:00');
});

test('uses exactly the frozen V3 storage keys and data version in app.js', () => {
  const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
  const discoveredKeys = [
    ...new Set(appSource.match(/freeofis_[a-z_]+/g) || [])
  ].sort();

  assert.deepEqual(discoveredKeys, [...V3_STORAGE_KEYS].sort());
  assert.match(appSource, /const DATA_VERSION = 3;/);
});

test('keeps production runtime independent of Phase 0 test assets', () => {
  const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
  assert.equal(appSource.includes('v3-compatibility.test'), false);
  assert.equal(htmlSource.includes('v3-compatibility.test'), false);
  assert.equal(appSource.includes('v3-representative-backup'), false);
  assert.equal(htmlSource.includes('v3-representative-backup'), false);
});

test('does not mutate the fixture or access localStorage', () => {
  assert.equal(JSON.stringify(fixture), fixtureBefore);
});

process.stdout.write('All V3 compatibility checks passed.\n');
