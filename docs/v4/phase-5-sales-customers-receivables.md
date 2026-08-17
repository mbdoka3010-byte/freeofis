# V4 Phase 5 — Sales, Customers and Receivables

Phase 5 is an isolated V4 foundation. V3 remains authoritative; no production entry point imports V4 and no V3 storage is read, projected, migrated, or rewritten.

## Locked semantics

- A registered Customer is a durable Business-scoped entity. Phone and email are attributes, never identity. Inactive Customers remain readable and may settle debt but cannot normally receive new sales.
- A Walk-in is not a Customer entity. Its canonical persisted identity is `customerId: null`; `__walkin__` is never persisted. Walk-ins must pay exactly in full and cannot hold receivables, later payments, advances, or statements.
- Orders, fulfilments, Invoices, payments, returns and refunds are separate evidence. Fulfilled transactions are corrected by returns, Credit Notes, refunds and reversals—not deletion or rewriting.
- Sales are multi-line. Product names, units, prices, discounts and tax evidence are transaction-time snapshots.
- `grossUnitsSold` sums fulfilled quantities; `lineItemCount` counts lines; `unitsReturned` sums valid return quantities; `netUnitsSold = grossUnitsSold - unitsReturned`.

## Persistence

IndexedDB advances additively to version 5. The 30 Phase 4 stores remain intact and 17 stores are added: `customers`, `salesOrders`, `salesOrderLines`, `salesFulfillments`, `salesFulfillmentLines`, `customerInvoices`, `customerInvoiceLines`, `customerPayments`, `customerPaymentAllocations`, `customerCreditNotes`, `customerCreditNoteLines`, `salesReturns`, `salesReturnLines`, `customerRefunds`, `inventoryCostRecognitions`, `documentSequences`, and `idempotencyRecords` (47 total).

The in-memory adapter now enforces the declared transaction store set for every read, index lookup, write and delete. Undeclared access fails immediately and read-write work rolls back, matching real IndexedDB boundaries.

## Atomic direct sale

`completeDirectSale()` validates Business → Operating Unit → InventoryLocation scope, Customer rules, Product and ownership evidence, and stock availability. In one transaction it allocates non-reusable `SAL` and `INV` numbers, confirms the order, fulfils it, records outbound InventoryMovements and immutable weighted-average cost recognitions, issues the Invoice, records and allocates any payment, writes BusinessEvents, and persists the idempotency result.

Multiple ownership pools require explicit selection. Supplier-consignment identity is retained on cost recognition. Phase 5 does not settle consignment suppliers.

Known outbound WAC is snapshotted in integer minor units. Missing acquisition cost remains `null` with `costStatus: unknown`; it is never coerced to zero. Reports expose known COGS, unknown-cost items, known-cost gross margin and revenue coverage.

## Receivables

Invoice outstanding is derived from issued Invoices, active payment allocations, Credit Notes and payment reversals. Payments are immutable records and can allocate many-to-many with Invoices without over-allocation. Any unallocated registered-Customer payment remains an explicit advance. Statements are chronological derived views, never editable balances.

Payment destinations and future finance-account references remain nullable/unknown until the Finance layer exists. Sales receipts are not described as cash at hand.

## Returns, credits and refunds

Return lines reference original fulfilment lines and cannot exceed the remaining returnable quantity. Only `restock` creates saleable inbound InventoryMovement evidence; damaged, expired, quarantine, scrap and other dispositions do not. Restock return cost uses the original outbound recognition, including an unknown state when original cost was unknown.

Returns issue Credit Notes without rewriting Invoices. Refunds require matching Invoice and Credit Note evidence and are durable. Anonymous returns resolve against the original Walk-in transaction; no anonymous balance is created. Exchanges are represented as return plus a new sale.

## Controls and compatibility

Critical sale, payment, return and refund commands use Business-scoped idempotency keys. Exact replay returns the original result; a conflicting payload fails. Document sequences are transaction-safe and scoped by Business + Operating Unit + type + UTC year; allocated numbers are never reused after rollback/cancellation semantics become visible.

The permission catalog/template advances to version 4 with Customer, fulfilment, credit, discount, return, receivable and Customer-payment capabilities. Existing persisted/custom roles are not rewritten. BusinessEvents contain identity and compact references, not duplicate authoritative transaction bodies. The design remains compatible with later approval policies for credit, discount, return, refund and below-cost risks.

The isolated Chrome harness uses only `freeofis_v4_phase5_test`, deletes it before and after execution, and never accesses localStorage.
