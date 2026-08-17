# Free Ofis V4 Phase 4 — Suppliers and Procurement

Phase 4 is isolated from production V3. IndexedDB version 4 preserves all 18 Phase 3 stores and adds 12 procurement stores: suppliers, agreements, purchase orders/lines, goods receipts/lines, supplier invoices/lines, supplier payments/allocations, and purchase returns/lines. Supplier contacts remain inline because Phase 4 needs one optional contact person; a separate contacts store would be premature.

Supplier is Business-scoped and may optionally list the Operating Units it serves. Agreements support outright, credit, partial-payment, consignment, revenue-share, and custom types with unit scope, basis-point rates, terms, timing, dates, and notes. Purchase Orders support multiple lines but are optional: direct receipt and invoice workflows remain valid.

Goods receipt is physical truth. Receipt header, lines, Phase 3 inventory movements, acquisition-cost layers, and `goods.received` event commit atomically. Supplier invoice is payable truth and is not assumed identical to receipt evidence. Costs use integer minor units and remain separate from Product selling price. Landed-cost allocation is structurally deferred.

Supplier balances derive from invoice totals minus active payment allocations and completed return credits. Payments may remain unallocated advances. Allocations are immutable history, reject Supplier/Business/currency mismatch, cannot exceed the payment, and cannot overpay the adjusted invoice. Corrections use cancellation/reversal additions rather than deletion.

Consignment receipts require Phase 3 `supplier_consignment` ownership whose explicit Supplier reference matches the receipt Supplier. They increase physical stock without changing it to merchant ownership. Full sales settlement remains deferred.

Purchase returns reference receipt lines, preserve received unit cost, reject quantities above the remaining returnable quantity, create outbound inventory movements, and optionally credit the referenced payable. Original receipts, costs, invoices, and payments remain intact.

Queries provide Supplier purchases, outstanding balance, payment history, unpaid/overdue invoices, and return history. Store indexes support later unit/date, goods-by-product/Supplier, and Year→Month→Day presentation from timestamps without duplicated calendar collections.

Permission catalog/template version 3 adds `purchases.return`, `suppliers.view`, `suppliers.manage`, `supplier_payments.view`, and `supplier_payments.record`. Existing persisted roles are not silently rewritten. Events use the existing BusinessEvent store: `supplier.created`, `procurement_agreement.created`, `purchase.created`, `goods.received`, `supplier_invoice.created`, `supplier_payment.recorded`, `supplier_payment.allocated`, and `purchase.returned`.

V3 contains no trustworthy procurement history. Phase 4 performs no migration and invents no Supplier, invoice, debt, purchase, ownership, or provenance.

The manual Chrome harness is `tests/browser/v4-phase4-indexeddb.html`. Serve the repository locally, open it in Chrome, and run the checks. It exclusively uses and deletes `freeofis_v4_phase4_test`.
