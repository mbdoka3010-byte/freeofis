import { V4_STORES } from '../persistence/schema.mjs';
import { createUuidV7, nowTimestamp, createBusinessEvent } from '../domain/entities.mjs';
import { ScopeValidationError } from '../persistence/repositories.mjs';

const PAYMENT_METHODS = new Set(['cash', 'card', 'bank_transfer', 'mobile_money', 'cheque', 'other']);
const DISPOSITIONS = new Set(['restock', 'damaged', 'expired', 'quarantine', 'scrap', 'other']);
const req = (value, field) => { const text = String(value || '').trim(); if (!text) throw new TypeError(`${field} is required.`); return text; };
const money = (value, field, allowZero = true) => {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) throw new TypeError(`${field} must be ${allowZero ? 'a non-negative' : 'a positive'} integer minor-unit amount.`);
  return value;
};
const quantity = (value, field = 'quantity') => { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${field} must be positive.`); return number; };
const base = (input, context) => { const at = input.createdAt || nowTimestamp(context.clock); return { id: input.id || createUuidV7(context.uuidOptions), status: input.status || 'active', createdAt: at, updatedAt: input.updatedAt || at, provenance: input.provenance ?? null, metadata: input.metadata ?? {} }; };
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)))
  : item);

async function scope(tx, businessId, operatingUnitId = null, locationId = null) {
  const business = await tx.get(V4_STORES.businesses, businessId);
  if (!business) throw new ScopeValidationError('Business missing.');
  if (operatingUnitId) {
    const unit = await tx.get(V4_STORES.operatingUnits, operatingUnitId);
    if (!unit || unit.businessId !== businessId) throw new ScopeValidationError('Operating Unit scope invalid.');
  }
  if (locationId) {
    const location = await tx.get(V4_STORES.inventoryLocations, locationId);
    if (!location || location.businessId !== businessId || (location.operatingUnitId && location.operatingUnitId !== operatingUnitId)) throw new ScopeValidationError('InventoryLocation scope invalid.');
    return { business, location };
  }
  return { business, location: null };
}

async function customerInScope(tx, customerId, businessId, { allowInactive = false } = {}) {
  if (customerId === null) return null;
  const customer = await tx.get(V4_STORES.customers, customerId);
  if (!customer || customer.businessId !== businessId) throw new ScopeValidationError('Customer scope invalid.');
  if (!allowInactive && customer.status !== 'active') throw new ScopeValidationError('Inactive Customer cannot receive a new sale.');
  return customer;
}

async function event(tx, business, operatingUnitId, type, entityType, entityId, actorId, context, metadata = {}) {
  return tx.add(V4_STORES.businessEvents, createBusinessEvent({ accountId: business.accountId, businessId: business.id, operatingUnitId, eventType: type, entityType, entityId, actorId: actorId ?? null, metadata }, context));
}

async function number(tx, input, context) {
  const year = new Date(input.transactionAt).getUTCFullYear();
  const id = `${input.businessId}:${input.operatingUnitId}:${input.documentType}:${year}`;
  const current = await tx.get(V4_STORES.documentSequences, id);
  const next = (current?.lastNumber || 0) + 1;
  await tx.put(V4_STORES.documentSequences, { id, businessId: input.businessId, operatingUnitId: input.operatingUnitId, documentType: input.documentType, year, lastNumber: next, updatedAt: nowTimestamp(context.clock) });
  return `${input.prefix}-${year}-${String(next).padStart(6, '0')}`;
}

function salesLine(input, orderId, context) {
  const unitPriceMinor = money(input.unitPriceMinor, 'unitPriceMinor');
  const qty = quantity(input.quantity);
  const grossMinor = money(input.grossMinor ?? Math.round(qty * unitPriceMinor), 'grossMinor');
  const discountMinor = money(input.discountMinor ?? 0, 'discountMinor');
  const taxAmountMinor = money(input.taxAmountMinor ?? 0, 'taxAmountMinor');
  if (discountMinor > grossMinor) throw new TypeError('Line discount cannot exceed gross amount.');
  return { ...base(input, context), salesOrderId: orderId, productId: req(input.productId, 'productId'), productNameSnapshot: req(input.productNameSnapshot, 'productNameSnapshot'), quantity: qty, unitOfMeasure: input.unitOfMeasure || 'unit', unitPriceMinor, grossMinor, discountMinor, taxTreatment: input.taxTreatment || 'exclusive', taxRateBasisPoints: input.taxRateBasisPoints ?? null, taxReference: input.taxReference ?? null, taxableAmountMinor: money(input.taxableAmountMinor ?? grossMinor - discountMinor, 'taxableAmountMinor'), taxAmountMinor, finalAmountMinor: money(input.finalAmountMinor ?? grossMinor - discountMinor + taxAmountMinor, 'finalAmountMinor'), inventoryLocationId: req(input.inventoryLocationId, 'inventoryLocationId'), ownershipId: input.ownershipId ?? null };
}

async function balances(tx, invoice) {
  const allocations = (await tx.getAllByIndex(V4_STORES.customerPaymentAllocations, 'byInvoiceId', invoice.id)).filter(item => item.status === 'active');
  const reversals = new Set((await tx.getAll(V4_STORES.customerPayments)).filter(item => item.reversalOfId).map(item => item.reversalOfId));
  const paidMinor = allocations.filter(item => !reversals.has(item.paymentId)).reduce((sum, item) => sum + item.amountMinor, 0);
  const creditsMinor = (await tx.getAllByIndex(V4_STORES.customerCreditNotes, 'byInvoiceId', invoice.id)).filter(item => item.status === 'issued').reduce((sum, item) => sum + item.totalMinor, 0);
  return { paidMinor, creditsMinor, outstandingMinor: Math.max(0, invoice.totalMinor - paidMinor - creditsMinor) };
}

const DIRECT_STORES = Object.values(V4_STORES);

export function createSalesService(persistence) {
  const service = {
    createCustomer(input, context = {}) {
      const customer = { ...base(input, context), businessId: req(input.businessId, 'businessId'), customerType: input.customerType || 'individual', customerCode: input.customerCode ?? null, name: req(input.name, 'name'), phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null, contactPerson: input.contactPerson ?? null, notes: input.notes ?? null, defaultPaymentTerms: input.defaultPaymentTerms ?? null };
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.customers, V4_STORES.businessEvents], 'readwrite', async tx => { const { business } = await scope(tx, customer.businessId); await tx.add(V4_STORES.customers, customer); await event(tx, business, null, 'customer.created', 'customer', customer.id, input.actorId, context); return customer; });
    },

    completeDirectSale(input, context = {}) {
      if (input.customerId === undefined) throw new TypeError('customerId must be explicitly null or a registered Customer ID.');
      const at = input.transactionAt || nowTimestamp(context.clock);
      const order = { ...base(input, context), status: 'confirmed', businessId: req(input.businessId, 'businessId'), operatingUnitId: req(input.operatingUnitId, 'operatingUnitId'), customerId: input.customerId, customerNameSnapshot: input.customerNameSnapshot ?? (input.customerId === null ? 'Walk-in' : null), transactionAt: at, currency: req(input.currency, 'currency').toUpperCase(), notes: input.notes ?? null, actorId: input.actorId ?? null, commercialStatus: 'confirmed', fulfilmentStatus: 'fulfilled', returnStatus: 'none' };
      const lines = (input.lines || []).map(line => salesLine(line, order.id, context));
      if (!lines.length) throw new TypeError('Sale requires at least one line.');
      const lineTotal = lines.reduce((sum, line) => sum + line.finalAmountMinor, 0);
      order.transactionDiscountMinor = money(input.transactionDiscountMinor ?? 0, 'transactionDiscountMinor');
      if (order.transactionDiscountMinor > lineTotal) throw new TypeError('Transaction discount exceeds sale amount.');
      order.expectedAmountMinor = lineTotal - order.transactionDiscountMinor;
      const paymentAmount = money(input.payment?.amountMinor ?? 0, 'payment amount');
      if (input.customerId === null && paymentAmount !== order.expectedAmountMinor) throw new ScopeValidationError('Walk-in sales must be fully paid with no advance or receivable.');
      if (input.idempotencyKey === undefined) throw new TypeError('Direct sale requires an idempotencyKey.');
      const fingerprint = stable({ ...input, idempotencyKey: undefined });
      return persistence.runTransaction(DIRECT_STORES, 'readwrite', async tx => {
        const prior = await tx.getByIndex(V4_STORES.idempotencyRecords, 'byScopeAndKey', [order.businessId, 'completeDirectSale', input.idempotencyKey]);
        if (prior) { if (prior.fingerprint !== fingerprint) throw new ScopeValidationError('Idempotency key payload conflict.'); return prior.result; }
        const { business } = await scope(tx, order.businessId, order.operatingUnitId);
        const customer = await customerInScope(tx, order.customerId, order.businessId);
        if (order.customerId !== null && !customer) throw new ScopeValidationError('Registered Customer required.');
        if (paymentAmount < order.expectedAmountMinor && !input.allowCredit) throw new ScopeValidationError('Credit permission/evidence is required for an unpaid balance.');
        if (order.customerId === null && input.allowCredit) throw new ScopeValidationError('Walk-in credit is prohibited.');
        order.customerNameSnapshot = order.customerId === null ? (order.customerNameSnapshot || 'Walk-in') : customer.name;
        order.orderNumber = await number(tx, { ...order, documentType: 'sale', prefix: 'SAL' }, context);
        await tx.add(V4_STORES.salesOrders, order);
        const fulfillment = { ...base({}, context), status: 'completed', salesOrderId: order.id, businessId: order.businessId, operatingUnitId: order.operatingUnitId, inventoryLocationId: lines[0].inventoryLocationId, fulfilledAt: at, actorId: input.actorId ?? null };
        if (lines.some(line => line.inventoryLocationId !== fulfillment.inventoryLocationId)) throw new ScopeValidationError('One direct sale cannot silently cross InventoryLocations.');
        await scope(tx, order.businessId, order.operatingUnitId, fulfillment.inventoryLocationId);
        await tx.add(V4_STORES.salesFulfillments, fulfillment);
        const fulfillmentLines = [], movements = [], recognitions = [];
        for (const line of lines) {
          const product = await tx.get(V4_STORES.products, line.productId);
          if (!product || product.businessId !== order.businessId) throw new ScopeValidationError('Product scope invalid.');
          if (line.productNameSnapshot !== product.name && !input.allowExplicitProductSnapshot) line.productNameSnapshot = product.name;
          const allOwnerships = (await tx.getAll(V4_STORES.inventoryOwnerships)).filter(item => item.businessId === order.businessId);
          const movementsForProduct = (await tx.getAllByIndex(V4_STORES.inventoryMovements, 'byProductId', line.productId)).filter(item => item.businessId === order.businessId && item.inventoryLocationId === line.inventoryLocationId && item.status === 'active');
          const pools = allOwnerships.map(ownership => ({ ownership, quantity: movementsForProduct.filter(m => m.ownershipId === ownership.id).reduce((sum, m) => sum + m.signedQuantity, 0) })).filter(pool => pool.quantity > 0);
          let pool;
          if (line.ownershipId) pool = pools.find(candidate => candidate.ownership.id === line.ownershipId);
          else if (pools.length === 1) pool = pools[0];
          else if (pools.length > 1) throw new ScopeValidationError('Explicit ownership is required when multiple stock pools are available.');
          if (!pool) throw new ScopeValidationError('No valid ownership stock pool is available.');
          const location = await tx.get(V4_STORES.inventoryLocations, line.inventoryLocationId);
          if (pool.quantity < line.quantity && location.negativeStockPolicy === 'prevent') throw new ScopeValidationError('Insufficient stock under prevent policy.');
          if (pool.quantity < line.quantity) throw new ScopeValidationError('Direct sale cannot fabricate inventory.');
          line.ownershipId = pool.ownership.id;
          await tx.add(V4_STORES.salesOrderLines, line);
          const movement = { ...base({}, context), businessId: order.businessId, operatingUnitId: order.operatingUnitId, inventoryLocationId: line.inventoryLocationId, productId: line.productId, ownershipId: line.ownershipId, quantity: line.quantity, signedQuantity: -line.quantity, movementType: 'sale_issue', transactionAt: at, sourceType: 'salesFulfillment', sourceId: fulfillment.id, actorId: input.actorId ?? null };
          const fulfillmentLine = { ...base({}, context), salesFulfillmentId: fulfillment.id, salesOrderLineId: line.id, productId: line.productId, productNameSnapshot: line.productNameSnapshot, quantity: line.quantity, unitOfMeasure: line.unitOfMeasure, inventoryLocationId: line.inventoryLocationId, ownershipId: line.ownershipId, inventoryMovementId: movement.id };
          const layers = (await tx.getAllByIndex(V4_STORES.inventoryCostLayers, 'byBusinessAndProduct', [order.businessId, line.productId])).filter(layer => layer.status === 'active' && layer.ownershipId === line.ownershipId);
          const unknown = !layers.length || layers.some(layer => layer.costStatus !== 'known');
          const layerQty = layers.reduce((sum, layer) => sum + layer.quantityReceived, 0);
          const unitCostMinor = unknown || !layerQty ? null : Math.round(layers.reduce((sum, layer) => sum + layer.quantityReceived * layer.unitCostMinor, 0) / layerQty);
          const recognition = { ...base({}, context), businessId: order.businessId, operatingUnitId: order.operatingUnitId, productId: line.productId, inventoryMovementId: movement.id, salesFulfillmentLineId: fulfillmentLine.id, quantity: line.quantity, costPolicy: 'weighted_average', unitAcquisitionCostMinor: unitCostMinor, totalRecognizedCostMinor: unitCostMinor === null ? null : Math.round(unitCostMinor * line.quantity), currency: unitCostMinor === null ? null : order.currency, ownershipId: line.ownershipId, ownershipType: pool.ownership.type, ownerReference: pool.ownership.ownerReference ?? null, recognizedAt: at, costStatus: unitCostMinor === null ? 'unknown' : 'known' };
          await tx.add(V4_STORES.inventoryMovements, movement); await tx.add(V4_STORES.salesFulfillmentLines, fulfillmentLine); await tx.add(V4_STORES.inventoryCostRecognitions, recognition);
          fulfillmentLines.push(fulfillmentLine); movements.push(movement); recognitions.push(recognition);
        }
        const invoice = { ...base({}, context), status: 'issued', paymentStatus: paymentAmount === 0 ? 'unpaid' : paymentAmount >= order.expectedAmountMinor ? 'paid' : 'partially_paid', businessId: order.businessId, operatingUnitId: order.operatingUnitId, customerId: order.customerId, customerNameSnapshot: order.customerNameSnapshot, salesOrderId: order.id, salesFulfillmentId: fulfillment.id, transactionAt: at, dueAt: input.dueAt ?? null, currency: order.currency, subtotalMinor: lineTotal, transactionDiscountMinor: order.transactionDiscountMinor, totalMinor: order.expectedAmountMinor, invoiceNumber: await number(tx, { ...order, documentType: 'invoice', prefix: 'INV' }, context) };
        await tx.add(V4_STORES.customerInvoices, invoice);
        const invoiceLines = [];
        for (const line of lines) { const invoiceLine = { ...line, id: createUuidV7(context.uuidOptions), customerInvoiceId: invoice.id, salesOrderLineId: line.id }; delete invoiceLine.salesOrderId; await tx.add(V4_STORES.customerInvoiceLines, invoiceLine); invoiceLines.push(invoiceLine); }
        let payment = null, allocation = null;
        if (paymentAmount > 0) {
          if (!PAYMENT_METHODS.has(input.payment.method || 'other')) throw new TypeError('Unsupported payment method.');
          payment = { ...base(input.payment, context), status: 'completed', businessId: order.businessId, operatingUnitId: order.operatingUnitId, customerId: order.customerId, amountMinor: paymentAmount, currency: order.currency, transactionAt: input.payment.transactionAt || at, method: input.payment.method || 'other', reference: input.payment.reference ?? null, destinationAccountReference: input.payment.destinationAccountReference ?? null, actorId: input.actorId ?? null };
          await tx.add(V4_STORES.customerPayments, payment);
          const allocated = Math.min(paymentAmount, invoice.totalMinor);
          allocation = { ...base({}, context), paymentId: payment.id, invoiceId: invoice.id, amountMinor: allocated, allocatedAt: at };
          await tx.add(V4_STORES.customerPaymentAllocations, allocation);
          await event(tx, business, order.operatingUnitId, 'customer_payment.recorded', 'customerPayment', payment.id, input.actorId, context);
          await event(tx, business, order.operatingUnitId, 'customer_payment.allocated', 'customerPaymentAllocation', allocation.id, input.actorId, context);
        }
        if (input.deliberateFailure) throw new Error('Deliberate direct-sale rollback');
        await event(tx, business, order.operatingUnitId, 'sales_order.created', 'salesOrder', order.id, input.actorId, context);
        await event(tx, business, order.operatingUnitId, 'sales_order.confirmed', 'salesOrder', order.id, input.actorId, context);
        await event(tx, business, order.operatingUnitId, 'sale.fulfilled', 'salesFulfillment', fulfillment.id, input.actorId, context);
        await event(tx, business, order.operatingUnitId, 'customer_invoice.issued', 'customerInvoice', invoice.id, input.actorId, context);
        const result = { salesOrder: order, lines, fulfillment, fulfillmentLines, movements, costRecognitions: recognitions, invoice, invoiceLines, payment, allocation };
        await tx.add(V4_STORES.idempotencyRecords, { id: createUuidV7(context.uuidOptions), businessId: order.businessId, commandType: 'completeDirectSale', idempotencyKey: String(input.idempotencyKey), fingerprint, result, createdAt: at });
        return result;
      });
    },

    recordPayment(input, context = {}) {
      if (input.customerId === null) throw new ScopeValidationError('Walk-ins cannot make later payments or advances.');
      if (input.idempotencyKey === undefined) throw new TypeError('Payment requires an idempotencyKey.');
      const fingerprint = stable({ ...input, idempotencyKey: undefined });
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.customers, V4_STORES.customerPayments, V4_STORES.customerPaymentAllocations, V4_STORES.customerInvoices, V4_STORES.customerCreditNotes, V4_STORES.businessEvents, V4_STORES.idempotencyRecords], 'readwrite', async tx => {
        const prior = await tx.getByIndex(V4_STORES.idempotencyRecords, 'byScopeAndKey', [input.businessId, 'recordCustomerPayment', input.idempotencyKey]);
        if (prior) { if (prior.fingerprint !== fingerprint) throw new ScopeValidationError('Idempotency key payload conflict.'); return prior.result; }
        const { business } = await scope(tx, input.businessId, input.operatingUnitId); await customerInScope(tx, input.customerId, input.businessId, { allowInactive: true });
        const payment = { ...base(input, context), status: 'completed', businessId: input.businessId, operatingUnitId: input.operatingUnitId ?? null, customerId: input.customerId, amountMinor: money(input.amountMinor, 'amountMinor', false), currency: req(input.currency, 'currency').toUpperCase(), transactionAt: input.transactionAt || nowTimestamp(context.clock), method: input.method || 'other', reference: input.reference ?? null, destinationAccountReference: input.destinationAccountReference ?? null, actorId: input.actorId ?? null };
        if (!PAYMENT_METHODS.has(payment.method)) throw new TypeError('Unsupported payment method.');
        await tx.add(V4_STORES.customerPayments, payment); let allocatedMinor = 0; const allocations = [];
        for (const requested of input.allocations || []) { const invoice = await tx.get(V4_STORES.customerInvoices, requested.invoiceId); if (!invoice || invoice.businessId !== payment.businessId || invoice.customerId !== payment.customerId || invoice.currency !== payment.currency) throw new ScopeValidationError('Payment allocation scope/currency mismatch.'); const value = money(requested.amountMinor, 'allocation amount', false); const balance = await balances(tx, invoice); if (value > balance.outstandingMinor || allocatedMinor + value > payment.amountMinor) throw new ScopeValidationError('Payment allocation exceeds available amount or Invoice balance.'); const allocation = { ...base({}, context), paymentId: payment.id, invoiceId: invoice.id, amountMinor: value, allocatedAt: payment.transactionAt }; await tx.add(V4_STORES.customerPaymentAllocations, allocation); allocations.push(allocation); allocatedMinor += value; }
        const result = { payment, allocations, allocatedMinor, unallocatedMinor: payment.amountMinor - allocatedMinor };
        if (input.deliberateFailure) throw new Error('Deliberate payment rollback');
        await event(tx, business, payment.operatingUnitId, 'customer_payment.recorded', 'customerPayment', payment.id, input.actorId, context);
        await tx.add(V4_STORES.idempotencyRecords, { id: createUuidV7(context.uuidOptions), businessId: payment.businessId, commandType: 'recordCustomerPayment', idempotencyKey: String(input.idempotencyKey), fingerprint, result, createdAt: payment.transactionAt });
        return result;
      });
    },

    reversePayment(input, context = {}) {
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.customerPayments, V4_STORES.businessEvents], 'readwrite', async tx => { const original = await tx.get(V4_STORES.customerPayments, input.paymentId); if (!original || original.businessId !== input.businessId || original.reversalOfId) throw new ScopeValidationError('Original Customer payment invalid.'); if ((await tx.getByIndex(V4_STORES.customerPayments, 'byReversalOfId', original.id))) throw new ScopeValidationError('Payment is already reversed.'); const reversal = { ...base(input, context), status: 'completed', businessId: original.businessId, operatingUnitId: original.operatingUnitId, customerId: original.customerId, amountMinor: original.amountMinor, currency: original.currency, transactionAt: input.transactionAt || nowTimestamp(context.clock), method: original.method, reversalOfId: original.id, reason: req(input.reason, 'reason'), actorId: input.actorId ?? null }; await tx.add(V4_STORES.customerPayments, reversal); const business = await tx.get(V4_STORES.businesses, original.businessId); await event(tx, business, original.operatingUnitId, 'customer_payment.reversed', 'customerPayment', reversal.id, input.actorId, context, { originalPaymentId: original.id }); return reversal; });
    },

    createReturn(input, context = {}) {
      if (input.idempotencyKey === undefined) throw new TypeError('Return requires an idempotencyKey.');
      return persistence.runTransaction(DIRECT_STORES, 'readwrite', async tx => {
        const fingerprint = stable({ ...input, idempotencyKey: undefined }); const prior = await tx.getByIndex(V4_STORES.idempotencyRecords, 'byScopeAndKey', [input.businessId, 'createSalesReturn', input.idempotencyKey]); if (prior) { if (prior.fingerprint !== fingerprint) throw new ScopeValidationError('Idempotency key payload conflict.'); return prior.result; }
        const fulfillment = await tx.get(V4_STORES.salesFulfillments, input.salesFulfillmentId); if (!fulfillment || fulfillment.businessId !== input.businessId) throw new ScopeValidationError('Fulfilment scope invalid.'); const order = await tx.get(V4_STORES.salesOrders, fulfillment.salesOrderId); const { business } = await scope(tx, input.businessId, fulfillment.operatingUnitId, fulfillment.inventoryLocationId);
        const at = input.transactionAt || nowTimestamp(context.clock); const returned = { ...base(input, context), status: 'completed', businessId: input.businessId, operatingUnitId: fulfillment.operatingUnitId, customerId: order.customerId, salesFulfillmentId: fulfillment.id, transactionAt: at, returnNumber: await number(tx, { businessId: input.businessId, operatingUnitId: fulfillment.operatingUnitId, transactionAt: at, documentType: 'return', prefix: 'RET' }, context), reason: input.reason ?? null };
        await tx.add(V4_STORES.salesReturns, returned); const returnLines = []; let totalMinor = 0;
        for (const item of input.lines || []) { if (!DISPOSITIONS.has(item.disposition)) throw new TypeError('Invalid return disposition.'); const original = await tx.get(V4_STORES.salesFulfillmentLines, item.salesFulfillmentLineId); if (!original || original.salesFulfillmentId !== fulfillment.id) throw new ScopeValidationError('Return line does not reference original fulfilment.'); const qty = quantity(item.quantity); const priorQty = (await tx.getAllByIndex(V4_STORES.salesReturnLines, 'byFulfillmentLineId', original.id)).filter(line => line.status === 'active').reduce((sum, line) => sum + line.quantity, 0); if (priorQty + qty > original.quantity) throw new ScopeValidationError('Return exceeds remaining returnable quantity.'); const orderLine = await tx.get(V4_STORES.salesOrderLines, original.salesOrderLineId); const recognition = await tx.getByIndex(V4_STORES.inventoryCostRecognitions, 'byFulfillmentLineId', original.id); const creditMinor = money(item.creditMinor ?? Math.round(orderLine.finalAmountMinor * qty / orderLine.quantity), 'creditMinor'); const line = { ...base(item, context), salesReturnId: returned.id, salesFulfillmentLineId: original.id, productId: original.productId, quantity: qty, disposition: item.disposition, creditMinor, originalUnitCostMinor: recognition?.unitAcquisitionCostMinor ?? null, costStatus: recognition?.costStatus || 'unknown', inventoryMovementId: null }; if (item.disposition === 'restock') { const movement = { ...base({}, context), businessId: input.businessId, operatingUnitId: fulfillment.operatingUnitId, inventoryLocationId: original.inventoryLocationId, productId: original.productId, ownershipId: original.ownershipId, quantity: qty, signedQuantity: qty, movementType: 'customer_return', transactionAt: at, sourceType: 'salesReturn', sourceId: returned.id, actorId: input.actorId ?? null }; line.inventoryMovementId = movement.id; await tx.add(V4_STORES.inventoryMovements, movement); } await tx.add(V4_STORES.salesReturnLines, line); returnLines.push(line); totalMinor += creditMinor; }
        if (!returnLines.length) throw new TypeError('Return requires lines.'); const invoice = await tx.getByIndex(V4_STORES.customerInvoices, 'bySalesOrderId', order.id); const creditNote = { ...base({}, context), status: 'issued', businessId: input.businessId, operatingUnitId: fulfillment.operatingUnitId, customerId: order.customerId, customerInvoiceId: invoice?.id ?? null, salesReturnId: returned.id, transactionAt: at, currency: invoice?.currency || input.currency, totalMinor, reason: input.reason || 'returned_goods', creditNoteNumber: await number(tx, { businessId: input.businessId, operatingUnitId: fulfillment.operatingUnitId, transactionAt: at, documentType: 'credit_note', prefix: 'CRN' }, context) }; await tx.add(V4_STORES.customerCreditNotes, creditNote); for (const line of returnLines) await tx.add(V4_STORES.customerCreditNoteLines, { ...base({}, context), customerCreditNoteId: creditNote.id, customerInvoiceLineId: null, salesReturnLineId: line.id, amountMinor: line.creditMinor }); await event(tx, business, fulfillment.operatingUnitId, 'sales_return.created', 'salesReturn', returned.id, input.actorId, context); await event(tx, business, fulfillment.operatingUnitId, 'customer_credit_note.issued', 'customerCreditNote', creditNote.id, input.actorId, context); const result = { salesReturn: returned, lines: returnLines, creditNote }; await tx.add(V4_STORES.idempotencyRecords, { id: createUuidV7(context.uuidOptions), businessId: input.businessId, commandType: 'createSalesReturn', idempotencyKey: String(input.idempotencyKey), fingerprint, result, createdAt: at }); return result;
      });
    },

    recordRefund(input, context = {}) {
      if (input.idempotencyKey === undefined) throw new TypeError('Refund requires an idempotencyKey.');
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.customers, V4_STORES.customerInvoices, V4_STORES.customerPayments, V4_STORES.customerCreditNotes, V4_STORES.customerRefunds, V4_STORES.documentSequences, V4_STORES.businessEvents, V4_STORES.idempotencyRecords], 'readwrite', async tx => { const fingerprint = stable({ ...input, idempotencyKey: undefined }); const prior = await tx.getByIndex(V4_STORES.idempotencyRecords, 'byScopeAndKey', [input.businessId, 'recordCustomerRefund', input.idempotencyKey]); if (prior) { if (prior.fingerprint !== fingerprint) throw new ScopeValidationError('Idempotency key payload conflict.'); return prior.result; } const { business } = await scope(tx, input.businessId, input.operatingUnitId); if (input.customerId !== null) await customerInScope(tx, input.customerId, input.businessId, { allowInactive: true }); const invoice = input.customerInvoiceId ? await tx.get(V4_STORES.customerInvoices, input.customerInvoiceId) : null; if (!invoice || invoice.businessId !== input.businessId || invoice.customerId !== input.customerId) throw new ScopeValidationError('Refund requires matching original Invoice evidence.'); const credit = input.customerCreditNoteId ? await tx.get(V4_STORES.customerCreditNotes, input.customerCreditNoteId) : null; if (!credit || credit.customerInvoiceId !== invoice.id) throw new ScopeValidationError('Refund requires matching Credit Note evidence.'); const at = input.transactionAt || nowTimestamp(context.clock); const refund = { ...base(input, context), status: 'completed', businessId: input.businessId, operatingUnitId: input.operatingUnitId, customerId: input.customerId, customerInvoiceId: invoice.id, originalPaymentId: input.originalPaymentId ?? null, customerCreditNoteId: credit.id, amountMinor: money(input.amountMinor, 'amountMinor', false), currency: invoice.currency, method: input.method || 'other', transactionAt: at, reason: req(input.reason, 'reason'), actorId: input.actorId ?? null, refundNumber: await number(tx, { ...input, transactionAt: at, documentType: 'refund', prefix: 'REF' }, context) }; const priorRefunded = (await tx.getAll(V4_STORES.customerRefunds)).filter(item => item.customerCreditNoteId === credit.id && item.status === 'completed').reduce((sum, item) => sum + item.amountMinor, 0); if (priorRefunded + refund.amountMinor > credit.totalMinor) throw new ScopeValidationError('Refund exceeds remaining Credit Note amount.'); await tx.add(V4_STORES.customerRefunds, refund); if (input.deliberateFailure) throw new Error('Deliberate refund rollback'); await event(tx, business, input.operatingUnitId, 'customer_refund.recorded', 'customerRefund', refund.id, input.actorId, context); await tx.add(V4_STORES.idempotencyRecords, { id: createUuidV7(context.uuidOptions), businessId: input.businessId, commandType: 'recordCustomerRefund', idempotencyKey: String(input.idempotencyKey), fingerprint, result: refund, createdAt: at }); return refund; });
    },

    cancelOrder(input, context = {}) {
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.salesOrders, V4_STORES.salesFulfillments, V4_STORES.businessEvents], 'readwrite', async tx => { const order = await tx.get(V4_STORES.salesOrders, input.salesOrderId); if (!order || order.businessId !== input.businessId) throw new ScopeValidationError('Sales Order scope invalid.'); if (!['draft', 'confirmed'].includes(order.status)) throw new ScopeValidationError('Only draft or confirmed Orders can be cancelled.'); if ((await tx.getAllByIndex(V4_STORES.salesFulfillments, 'bySalesOrderId', order.id)).some(item => item.status === 'completed')) throw new ScopeValidationError('Fulfilled sales require return/reversal evidence.'); const cancelled = { ...order, status: 'cancelled', commercialStatus: 'cancelled', cancelledAt: nowTimestamp(context.clock), cancellationReason: req(input.reason, 'reason'), updatedAt: nowTimestamp(context.clock) }; await tx.put(V4_STORES.salesOrders, cancelled); const business = await tx.get(V4_STORES.businesses, order.businessId); await event(tx, business, order.operatingUnitId, 'sales_order.cancelled', 'salesOrder', order.id, input.actorId, context); return cancelled; });
    },

    voidInvoice(input, context = {}) {
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.customerInvoices, V4_STORES.customerPaymentAllocations, V4_STORES.customerCreditNotes, V4_STORES.businessEvents], 'readwrite', async tx => { const invoice = await tx.get(V4_STORES.customerInvoices, input.customerInvoiceId); if (!invoice || invoice.businessId !== input.businessId || invoice.status !== 'issued') throw new ScopeValidationError('Issued Invoice scope/state invalid.'); if ((await tx.getAllByIndex(V4_STORES.customerPaymentAllocations, 'byInvoiceId', invoice.id)).some(item => item.status === 'active') || (await tx.getAllByIndex(V4_STORES.customerCreditNotes, 'byInvoiceId', invoice.id)).some(item => item.status === 'issued')) throw new ScopeValidationError('Allocated or credited Invoice cannot be voided.'); const voided = { ...invoice, status: 'voided', paymentStatus: 'voided', voidedAt: nowTimestamp(context.clock), voidReason: req(input.reason, 'reason'), updatedAt: nowTimestamp(context.clock) }; await tx.put(V4_STORES.customerInvoices, voided); const business = await tx.get(V4_STORES.businesses, invoice.businessId); await event(tx, business, invoice.operatingUnitId, 'customer_invoice.voided', 'customerInvoice', invoice.id, input.actorId, context); return voided; });
    },

    async invoiceBalance(invoiceId) { const invoice = await persistence.get(V4_STORES.customerInvoices, invoiceId); if (!invoice) return null; return persistence.runTransaction([V4_STORES.customerInvoices, V4_STORES.customerPaymentAllocations, V4_STORES.customerPayments, V4_STORES.customerCreditNotes], 'readonly', tx => balances(tx, invoice)); },
    async customerStatement(businessId, customerId) { if (customerId === null) throw new ScopeValidationError('Walk-ins do not have Customer statements.'); const [invoices, payments, allocations, credits, refunds] = await Promise.all([persistence.getAll(V4_STORES.customerInvoices), persistence.getAll(V4_STORES.customerPayments), persistence.getAll(V4_STORES.customerPaymentAllocations), persistence.getAll(V4_STORES.customerCreditNotes), persistence.getAll(V4_STORES.customerRefunds)]); const entries = [...invoices.filter(x => x.businessId === businessId && x.customerId === customerId).map(x => ({ at: x.transactionAt, type: 'invoice', amountMinor: x.totalMinor, referenceId: x.id })), ...payments.filter(x => x.businessId === businessId && x.customerId === customerId).map(x => ({ at: x.transactionAt, type: x.reversalOfId ? 'payment_reversal' : 'payment', amountMinor: x.reversalOfId ? x.amountMinor : -x.amountMinor, referenceId: x.id })), ...credits.filter(x => x.businessId === businessId && x.customerId === customerId).map(x => ({ at: x.transactionAt, type: 'credit_note', amountMinor: -x.totalMinor, referenceId: x.id })), ...refunds.filter(x => x.businessId === businessId && x.customerId === customerId).map(x => ({ at: x.transactionAt, type: 'refund', amountMinor: x.amountMinor, referenceId: x.id }))].sort((a, b) => a.at.localeCompare(b.at)); let balanceMinor = 0; return entries.map(entry => ({ ...entry, balanceMinor: balanceMinor += entry.amountMinor, allocationEvidence: entry.type === 'payment' ? allocations.filter(a => a.paymentId === entry.referenceId) : [] })); },
    async salesReport(query) { const [orders, orderLines, invoices, fulfillmentLines, returnLines, recognitions, payments, allocations] = await Promise.all([persistence.getAll(V4_STORES.salesOrders), persistence.getAll(V4_STORES.salesOrderLines), persistence.getAll(V4_STORES.customerInvoices), persistence.getAll(V4_STORES.salesFulfillmentLines), persistence.getAll(V4_STORES.salesReturnLines), persistence.getAll(V4_STORES.inventoryCostRecognitions), persistence.getAll(V4_STORES.customerPayments), persistence.getAll(V4_STORES.customerPaymentAllocations)]); const selected = orders.filter(x => x.businessId === query.businessId && (!query.operatingUnitId || x.operatingUnitId === query.operatingUnitId) && (query.customerId === undefined || x.customerId === query.customerId) && (query.walkIn !== true || x.customerId === null) && (!query.from || x.transactionAt >= query.from) && (!query.to || x.transactionAt <= query.to)); const ids = new Set(selected.map(x => x.id)); const lines = orderLines.filter(x => ids.has(x.salesOrderId) && (!query.productId || x.productId === query.productId) && (!query.inventoryLocationId || x.inventoryLocationId === query.inventoryLocationId)); const invoiceSet = invoices.filter(x => ids.has(x.salesOrderId)); const fulfilIds = new Set(fulfillmentLines.filter(x => lines.some(line => line.id === x.salesOrderLineId)).map(x => x.id)); const returns = returnLines.filter(x => fulfilIds.has(x.salesFulfillmentLineId)); const cost = recognitions.filter(x => fulfilIds.has(x.salesFulfillmentLineId)); const revenueMinor = invoiceSet.reduce((sum, x) => sum + x.totalMinor, 0); const knownCogsMinor = cost.filter(x => x.costStatus === 'known').reduce((sum, x) => sum + x.totalRecognizedCostMinor, 0); const knownRevenueMinor = cost.filter(x => x.costStatus === 'known').reduce((sum, x) => { const f = fulfillmentLines.find(line => line.id === x.salesFulfillmentLineId); const line = lines.find(item => item.id === f?.salesOrderLineId); return sum + (line?.finalAmountMinor || 0); }, 0); const grossUnitsSold = fulfillmentLines.filter(x => fulfilIds.has(x.id)).reduce((sum, x) => sum + x.quantity, 0); const unitsReturned = returns.reduce((sum, x) => sum + x.quantity, 0); const linkedPayments = payments.filter(p => (!query.paymentMethod || p.method === query.paymentMethod) && allocations.some(a => a.paymentId === p.id && invoiceSet.some(i => i.id === a.invoiceId))); return { orders: selected, lines, invoices: invoiceSet, payments: linkedPayments, grossUnitsSold, lineItemCount: lines.length, unitsReturned, netUnitsSold: grossUnitsSold - unitsReturned, revenueMinor, knownCogsMinor, unknownCostSales: cost.filter(x => x.costStatus !== 'known'), grossMarginMinor: knownRevenueMinor - knownCogsMinor, knownCostRevenueMinor: knownRevenueMinor, knownCostCoverageBasisPoints: revenueMinor ? Math.round(knownRevenueMinor * 10000 / revenueMinor) : 0 }; },
    salesByDay(businessId, day) { return service.salesReport({ businessId, from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` }); },
    salesByMonth(businessId, year, month) { const from = new Date(Date.UTC(year, month - 1, 1)).toISOString(), to = new Date(Date.UTC(year, month, 1) - 1).toISOString(); return service.salesReport({ businessId, from, to }); },
    salesByYear(businessId, year) { return service.salesReport({ businessId, from: `${year}-01-01T00:00:00.000Z`, to: `${year}-12-31T23:59:59.999Z` }); },
    async customerOutstanding(businessId, customerId) { const invoices = (await persistence.getAll(V4_STORES.customerInvoices)).filter(item => item.businessId === businessId && item.customerId === customerId && item.status === 'issued'); let outstandingMinor = 0; for (const invoice of invoices) outstandingMinor += (await service.invoiceBalance(invoice.id)).outstandingMinor; return { customerId, outstandingMinor, invoices }; },
    async customerPaymentHistory(businessId, customerId) { return (await persistence.getAll(V4_STORES.customerPayments)).filter(item => item.businessId === businessId && item.customerId === customerId).sort((a, b) => a.transactionAt.localeCompare(b.transactionAt)); },
    async unpaidInvoices(businessId, now = new Date()) { const invoices = (await persistence.getAll(V4_STORES.customerInvoices)).filter(item => item.businessId === businessId && item.status === 'issued'); const result = []; for (const invoice of invoices) { const balance = await service.invoiceBalance(invoice.id); if (balance.outstandingMinor > 0) result.push({ ...invoice, ...balance, overdue: Boolean(invoice.dueAt && new Date(invoice.dueAt) < now) }); } return result; }
  };
  return Object.freeze(service);
}
