# V4 Phase 7 — Application Integration and Read-only V3 Bridge

Phase 7 introduces the first independently accessible V4 development application. V3 remains the production application. `app.js`, `index.html`, `styles.css`, the seven V3 storage keys, and data version 3 remain unchanged. There is no migration or cutover command.

## Layering and bootstrap

The dependency direction is UI → application services → domain services → persistence. Code under `v4/app/` imports the application layer only; it does not import IndexedDB, repositories, or transaction constructors. The application bootstrap opens the existing v6/58-store database, idempotently establishes Owner identity, Business, Operating Unit, preferred InventoryLocation, semantic Finance accounts and physical Cash account, and returns a normalized active context.

Active context contains Account, User, Business, Operating Unit, preferred location, base currency, permissions and workspace. Context switching is limited to active memberships and Operating Units. Domain and authorization checks remain authoritative; hidden UI actions are not security controls.

The workspace shell is structured as Workspace → Module → View. Business is enabled with Dashboard, Sales, Customers, Inventory, Purchases, Suppliers, Finance, Reports, Activity and Settings navigation. Student, Media, Office and Personal remain disabled structural placeholders, not implemented domains. Hash routing is reloadable and Back-compatible.

## Orchestration contract

Application commands return stable envelopes containing `ok`, `code`, `primaryEntity`, generated documents, warnings, follow-up actions and Finance posting status. Errors are normalized into stable codes including validation, permission, stock, Walk-in credit, period, conflict and Finance-health failures. Warnings do not masquerade as hard failures.

Sales, receiving, payments, returns, refunds, Expenses and transfers delegate to Phase 3–6 services. Operational evidence is committed first and then deterministically posted to Finance. Posting failure leaves operational evidence visible and appears in health diagnostics. Exact source identities and domain idempotency prevent duplicate Sales, movements, payments, returns, refunds and Journals after reload.

Walk-ins remain `customerId: null`. The application rejects Walk-in credit/partial payment with a registered-Customer explanation and never creates a fake Customer. Receipt models use immutable order, Invoice, line and payment snapshots and generate printable HTML.

Dashboard and reports are derived. Cash at Hand comes from the physical-cash Ledger Account, never Sales receipt totals. Health exposes unresolved Finance failures and Inventory/COGS reconciliation discrepancies without repair or false green state. Activity uses BusinessEvents; drill-down retains Journal/source and Sale/Invoice/payment references. Search is Business-scoped across Customers, Suppliers, Products and document numbers.

Date ranges are standardized as UTC half-open intervals `[from, toExclusive)` for Today, This Month, This Year and custom ranges. Presentation utilities format integer minor-unit money only at the UI boundary.

## Read-only legacy bridge

`legacy-reader.mjs` accepts a Storage-compatible object exposing `getItem`. The returned reader exposes only `read`; it has no write, update, delete, save, import or migrate method. It parses known V3 keys into snapshots and reports malformed values, missing fields, Walk-ins, orphaned Customer references and duplicate candidates without modifying source strings.

Migration preview is ephemeral. It proposes identity-preserving mappings, retains Walk-in null identity, and marks acquisition cost, ownership, historical location, actor and Finance evidence unknown when absent. Cutover readiness is informational and always non-executing; opening-balance strategy remains explicitly unresolved.

The Phase 7 browser harness uses only `freeofis_v4_phase7_test`. Its legacy preview uses an in-memory synthetic object rather than browser localStorage. The harness and V4 application contain no startup migration path.
