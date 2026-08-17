# Free Ofis

Free Ofis is a multi-workspace productivity and record-management application. Business is one workspace alongside Student, Media, Office, and Personal.

## Current implementation

The active implementation is a browser-based Phase 1 application. Its common shell provides Home, Business, Student, Media, Office, and Personal workspaces. The Business workspace currently includes:

- multi-item Sales & Orders
- inventory and low-stock thresholds
- registered customers, credit, and debtors
- separate payment records and payment allocation
- receipts, reports, expenses, and seller details
- cancellation history with stock restoration
- JSON backup export and import

Student, Media, Office, and Personal are currently workspace shells with roadmap modules. Future records for those workspaces should use independent data models and storage keys rather than Business collections.

## Business data model (v3)

Business data is stored in browser `localStorage` under these keys:

- `freeofis_inventory`
- `freeofis_customers`
- `freeofis_sales`
- `freeofis_payments`
- `freeofis_expenses`
- `freeofis_business`
- `freeofis_data_version`

The current data version is `3`. On startup, Free Ofis normalizes records and migrates older single-item sales into the current sale format where possible. Migrations preserve existing records and do not guess ambiguous payment links.

### Sales and payments

A sale is a transaction with an `items` array. Each item records a product reference, name, quantity, unit price, and subtotal, preserving the sold-item snapshot even if inventory changes later. Payments are separate records linked to a sale through `saleId`; each sale’s cached `paid` and `balance` fields are recomputed from its non-cancelled payments.

### Customers and Walk-ins

Registered customers have persistent `CUS-...` identities in `freeofis_customers`. A sale or payment for a registered customer uses that `customerId`.

An anonymous Walk-in is not a customer record. It is represented by `customerId: null` on the sale and any sale-linked payment. The `__walkin__` value is only a UI grouping/navigation sentinel and must never be stored as a customer identity. Walk-ins do not have customer-wide credit, statements, or account payments; any legitimate later payment is applied to its specific sale.

If a historical sale or payment has a non-null customer ID that no longer exists, it remains an orphaned historical reference—not a Walk-in. Use **Settings → Check Data Integrity** to report it before deciding on a manual correction.

## Persistence and safety

Data survives normal refreshes and navigation within the same browser profile and origin. It is not server-synchronised. Data may appear absent when opening the app from a different browser/profile/origin, using private browsing, clearing site data, or when browser storage is unavailable.

Critical multi-collection operations (sales, payment changes, cancellations, migration, and import) use a checked batch write with best-effort rollback if a later write fails. Browser `localStorage` is not a true database transaction system, so regular backups remain essential.

Before moving devices, clearing browser data, importing a backup, or making a major upgrade:

1. Open **Settings**.
2. Choose **Export Backup** and keep the downloaded JSON file safely.
3. Use **Check Data Integrity** to review any missing references.
4. Import only a known Free Ofis backup. Import replaces the current browser-local business data after confirmation.

## Development guidance

Preserve existing local-storage keys, v3 migration behaviour, historical sales, payment audit history, and the transaction-level Walk-in model. Make incremental, reversible changes and avoid modifying archived Free Ofis copies.
