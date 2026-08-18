import { createV4Application } from './application.mjs';
import { canUser } from '../authorization/authorization.mjs';
import { V4_STORES } from '../persistence/schema.mjs';
import { commandResult, commandFailure, ApplicationError } from './errors.mjs';

const byNewest = (items, field = 'transactionAt') => items.sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
const inRange = (item, from, to, field = 'transactionAt') => (!from || item[field] >= from) && (!to || item[field] <= to);
const scope = (items, businessId) => items.filter(item => item.businessId === businessId);

export async function createOperationalApplication(options = {}) {
  return enhanceOperationalApplication(await createV4Application(options));
}

export function enhanceOperationalApplication(base) {
  const { persistence, services } = base;
  const context = () => base.getContext();
  const authorize = async code => {
    const ctx = context();
    if (!ctx.permissions.includes(code) || !await canUser(persistence, { userId: ctx.userId, businessId: ctx.businessId, operatingUnitId: ctx.operatingUnitId, permissionCode: code })) throw new ApplicationError('PERMISSION_DENIED', `Permission ${code} is required.`);
  };
  const run = async work => { try { return await work(); } catch (error) { return commandFailure(error); } };
  const post = async (code, amountMinor, type, id, extra = {}) => services.finance.automaticPost({ businessId: context().businessId, operatingUnitId: context().operatingUnitId, sourceModule: 'procurement', sourceEntityType: type, sourceEntityId: id, postingRuleCode: code, amountMinor, currency: context().baseCurrency, occurredAt: extra.occurredAt || new Date().toISOString(), supplierId: extra.supplierId, creditRole: extra.creditRole }, {});
  const all = store => persistence.getAll(store);

  const api = {
    ...base,
    async completePurchase(input) {
      return run(async () => {
        await authorize('purchases.receive');
        const totalMinor = input.lines.reduce((total, line) => total + line.quantity * line.unitCostMinor, 0);
        const amountPaidMinor = Number(input.amountPaidMinor || 0);
        if (!Number.isSafeInteger(amountPaidMinor) || amountPaidMinor < 0 || amountPaidMinor > totalMinor) throw new ApplicationError('VALIDATION_ERROR', 'Amount paid must be between zero and the purchase total.');
        const receiptResult = await base.receiveStock(input);
        if (!receiptResult.ok) return receiptResult;
        const invoiceResult = await services.procurement.createInvoice({ businessId: context().businessId, supplierId: input.supplierId, operatingUnitId: context().operatingUnitId, goodsReceiptId: receiptResult.primaryEntity.id, currency: context().baseCurrency, transactionAt: input.transactionAt, dueAt: input.dueAt || null, lines: input.lines, actorId: context().userId });
        await post('procurement.supplier_invoice', totalMinor, 'supplierInvoice', invoiceResult.invoice.id, { occurredAt: invoiceResult.invoice.transactionAt, supplierId: input.supplierId });
        let payment = null;
        if (amountPaidMinor > 0) {
          await authorize('supplier_payments.record');
          payment = await services.procurement.recordPayment({ businessId: context().businessId, supplierId: input.supplierId, operatingUnitId: context().operatingUnitId, amountMinor: amountPaidMinor, currency: context().baseCurrency, method: input.paymentMethod || 'cash', transactionAt: input.transactionAt, actorId: context().userId });
          await services.procurement.allocatePayment({ paymentId: payment.id, invoiceId: invoiceResult.invoice.id, amountMinor: amountPaidMinor, actorId: context().userId });
          await post('procurement.supplier_payment', amountPaidMinor, 'supplierPayment', payment.id, { occurredAt: payment.transactionAt, supplierId: input.supplierId, creditRole: (input.paymentMethod || 'cash') === 'cash' ? 'cash_on_hand' : 'bank' });
        }
        return commandResult({ ...receiptResult.primaryEntity, settlement: { totalMinor, amountPaidMinor, outstandingMinor: totalMinor - amountPaidMinor, supplierInvoiceId: invoiceResult.invoice.id, supplierPaymentId: payment?.id || null } }, { generatedDocuments: [invoiceResult.invoice], postingStatus: 'financially_posted' });
      });
    },
    async recordSupplierPayment(input) {
      return run(async () => {
        await authorize('supplier_payments.record');
        const payment = await services.procurement.recordPayment({ ...input, businessId: context().businessId, operatingUnitId: context().operatingUnitId, currency: context().baseCurrency, actorId: context().userId });
        await services.procurement.allocatePayment({ paymentId: payment.id, invoiceId: input.invoiceId, amountMinor: input.amountMinor, actorId: context().userId });
        await post('procurement.supplier_payment', input.amountMinor, 'supplierPayment', payment.id, { occurredAt: payment.transactionAt, supplierId: input.supplierId, creditRole: (input.method || 'cash') === 'cash' ? 'cash_on_hand' : 'bank' });
        return commandResult(payment, { postingStatus: 'financially_posted' });
      });
    },
    async operationalData(route, query = {}) {
      const ctx = context(), businessId = ctx.businessId, from = query.from || '', to = query.to || '9999-12-31T23:59:59.999Z';
      if (route === 'customers') {
        const [customers, orders, orderLines, invoices, payments, allocations] = await Promise.all([all(V4_STORES.customers), all(V4_STORES.salesOrders), all(V4_STORES.salesOrderLines), all(V4_STORES.customerInvoices), all(V4_STORES.customerPayments), all(V4_STORES.customerPaymentAllocations)]);
        const rows = [];
        for (const customer of scope(customers, businessId)) {
          const customerOrders = scope(orders, businessId).filter(order => order.customerId === customer.id), customerInvoices = scope(invoices, businessId).filter(invoice => invoice.customerId === customer.id), customerPayments = scope(payments, businessId).filter(payment => payment.customerId === customer.id), invoiceRows = [];
          for (const invoice of customerInvoices) { const balance = await services.sales.invoiceBalance(invoice.id), order = customerOrders.find(item => item.id === invoice.salesOrderId), applied = allocations.filter(item => item.invoiceId === invoice.id).map(item => ({ ...item, payment: customerPayments.find(payment => payment.id === item.paymentId) })); invoiceRows.push({ invoice, order, lines: orderLines.filter(line => line.salesOrderId === order?.id), balance, payments: applied }); }
          rows.push({ customer, invoices: byNewest(invoiceRows, 'invoice.transactionAt'), totalPurchasesMinor: customerInvoices.reduce((n, item) => n + item.totalMinor, 0), totalPaidMinor: customerPayments.reduce((n, item) => n + item.amountMinor, 0), outstandingMinor: invoiceRows.reduce((n, item) => n + item.balance.outstandingMinor, 0), lastActivityAt: [...customerOrders.map(x => x.transactionAt), ...customerPayments.map(x => x.transactionAt)].sort().at(-1) || null });
        }
        return { rows };
      }
      if (route === 'purchases' || route === 'suppliers') {
        const [suppliers, products, receipts, receiptLines, invoices, payments, allocations] = await Promise.all([all(V4_STORES.suppliers), all(V4_STORES.products), all(V4_STORES.goodsReceipts), all(V4_STORES.goodsReceiptLines), all(V4_STORES.supplierInvoices), all(V4_STORES.supplierPayments), all(V4_STORES.supplierPaymentAllocations)]), scopedReceipts = scope(receipts, businessId).filter(item => inRange(item, from, to)), receiptRows = scopedReceipts.map(receipt => { const lines = receiptLines.filter(line => line.goodsReceiptId === receipt.id), invoice = scope(invoices, businessId).find(item => item.goodsReceiptId === receipt.id), applied = invoice ? allocations.filter(item => item.invoiceId === invoice.id) : [], amountPaidMinor = applied.reduce((n, item) => n + item.amountMinor, 0), totalMinor = lines.every(line => line.unitCostMinor !== null) ? lines.reduce((n, line) => n + line.quantity * line.unitCostMinor, 0) : null; return { receipt, lines, invoice, totalMinor, amountPaidMinor, outstandingMinor: invoice ? Math.max(0, invoice.totalMinor - amountPaidMinor) : null, settlementStatus: !invoice ? 'unrecorded' : amountPaidMinor === 0 ? 'credit' : amountPaidMinor >= invoice.totalMinor ? 'paid' : 'part_paid' }; });
        if (route === 'purchases') return { suppliers: scope(suppliers, businessId), products: scope(products, businessId), receipts: byNewest(receiptRows, 'receipt.transactionAt'), ownershipId: ctx.inventoryOwnershipId };
        return { rows: scope(suppliers, businessId).map(supplier => { const purchases = receiptRows.filter(row => row.receipt.supplierId === supplier.id), supplierPayments = scope(payments, businessId).filter(item => item.supplierId === supplier.id); return { supplier, purchases, totalPurchasesMinor: purchases.reduce((n, row) => n + (row.totalMinor || 0), 0), totalPaidMinor: supplierPayments.reduce((n, item) => n + item.amountMinor, 0), outstandingMinor: purchases.reduce((n, row) => n + (row.outstandingMinor || 0), 0), lastPurchaseAt: purchases.map(row => row.receipt.transactionAt).sort().at(-1) || null, unpaidInvoices: purchases.filter(row => row.outstandingMinor > 0).map(row => ({ ...row.invoice, outstandingMinor: row.outstandingMinor })) }; }) };
      }
      if (route === 'reports') {
        const [baseReport, purchases] = await Promise.all([base.screenData('reports', query), api.operationalData('purchases', query)]);
        return { ...baseReport, purchaseReceipts: purchases.receipts, purchaseTotalMinor: purchases.receipts.reduce((n, row) => n + (row.totalMinor || 0), 0) };
      }
      return base.screenData(route, query);
    },
    async searchOperational(term, category = 'all') {
      const q = String(term || '').trim().toLowerCase(); if (!q) return [];
      const ctx = context(), baseResults = await base.search(q), [purchases, events, payments, journals] = await Promise.all([api.operationalData('purchases'), base.activity(), all(V4_STORES.customerPayments), all(V4_STORES.journalEntries)]), results = [];
      for (const customer of baseResults.customers) results.push({ category: 'customers', id: customer.id, title: customer.name, summary: customer.phone || customer.email || 'Customer' });
      for (const supplier of baseResults.suppliers) results.push({ category: 'suppliers', id: supplier.id, title: supplier.name, summary: supplier.phone || supplier.email || 'Supplier' });
      for (const product of baseResults.products) results.push({ category: 'products', id: product.id, title: product.name, summary: 'Inventory product' });
      for (const document of baseResults.documents) results.push({ category: 'sales', id: document.id, title: document.orderNumber || document.invoiceNumber, summary: `${document.totalMinor ?? document.expectedAmountMinor ?? 0}` });
      for (const row of purchases.receipts) if (JSON.stringify(row).toLowerCase().includes(q)) results.push({ category: 'purchases', id: row.receipt.id, title: `Stock received`, summary: `${row.totalMinor ?? 'Unknown value'}` });
      for (const payment of scope(payments, ctx.businessId)) if (JSON.stringify(payment).toLowerCase().includes(q)) results.push({ category: 'payments', id: payment.id, title: 'Payment received', summary: `${payment.amountMinor}` });
      for (const journal of scope(journals, ctx.businessId)) if (JSON.stringify(journal).toLowerCase().includes(q)) results.push({ category: 'finance', id: journal.id, title: journal.description, summary: journal.journalNumber || 'Journal' });
      for (const event of events) if (JSON.stringify(event).toLowerCase().includes(q)) results.push({ category: 'activity', id: event.id, title: event.eventType, summary: event.entityType });
      return category === 'all' ? results : results.filter(result => result.category === category);
    }
  };
  return Object.freeze(api);
}
