# Phase 8 — Verified migration, reconciliation, controlled cutover and recovery

## Status and boundary

Phase 8 supplies a development-only migration engine and evidence model. It does not read production browser data, activate maintenance mode, switch the production entry point, or authorize a real cutover. The production V3 application and its seven storage keys remain authoritative until a separately approved cutover.

The required sequence is:

**Snapshot → Preview → Resolve → Rehearse → Migrate → Reconcile → Accept → Cut Over**

Copying records is not acceptance. Cutover readiness requires verified input, deterministic mappings, a complete manifest, zero blockers, explicit warning acceptance, balanced verified opening finance, reconciliation, and a successful rehearsal.

## Durable evidence

IndexedDB v7 contains 63 stores: all 58 Phase 7 stores plus exactly five additive stores.

| Store | Purpose |
|---|---|
| migrationSnapshots | Immutable raw V3 values, source/build identity, key and aggregate SHA-256 checksums, counts and validation state |
| migrationRuns | Configuration, state, counts, warnings/errors, acceptance, rollback and native-operation boundary |
| migrationManifestEntries | One disposition per considered source record, including source signature, destination, transformation, warnings and unknown fields |
| migrationResolutions | Actor-attributed manual anomaly decisions without changing the snapshot |
| migrationReconciliations | Durable source/destination comparisons, differences, unknown coverage, status and details |

The exported backup includes format/source versions, timestamp, all captured raw values, checksums and parsed counts. Export and validation are read-only with respect to the supplied source abstraction.

## Snapshot and checksum contract

Migration accepts a supplied object containing exact raw values for the seven known V3 keys. It never rereads live storage during execution. Each value is SHA-256 hashed; an aggregate hash is calculated over deterministic key/checksum pairs. Verification checks both layers before any write. A mismatch stops migration.

The browser harness constructs this object in memory. Opening the V4 app or migration screen never invokes localStorage.

## Context and target safety

A run requires an explicit Business, Operating Unit, Inventory Location, base currency and user-chosen cutover date/time. Bootstrap identity/configuration is allowed; meaningful operational target data produces TARGET_V4_NOT_EMPTY. Migration does not merge with or overwrite an operational V4 database.

The migration identity derives deterministically from snapshot and configuration. Destination IDs derive from run, source entity type and immutable V3 ID. Unique schema indexes and replay checks prevent duplicates.

## State machine

Supported states are preview, ready, migrating, migrated, reconciling, reconciliation_failed, ready_for_acceptance, accepted, cutover_completed, rolled_back, and failed. Invalid transitions fail.

Acceptance requires:

- no hard blockers;
- completed successful reconciliation;
- configured cutover timestamp;
- a verified balanced opening journal;
- an explicit actor;
- explicit acceptance of every outstanding warning.

nativeOperationsStarted is the commit boundary. Before it, accepted/cut-over rehearsal evidence can be rolled back while retained for audit. After it, simple rollback is rejected as unsafe. Phase 8 does not set this flag or switch production entry points outside explicit service calls.

Maintenance mode is represented as a cutover prerequisite/design concern only. A future authorized procedure must freeze V3 writes before its final snapshot and keep them frozen until cutover or rollback completes.

## Mapping rules

Products map by V3 ID. Equal names stay separate and are review candidates. Current quantity becomes a provenance-marked opening Inventory Movement at the configured location. Negative quantity is preserved with negative_opening_stock; ownership is unknown_historical; missing acquisition cost stays unknown and creates no zero-cost layer.

Registered Customers map by V3 ID. Walk-in Sales always retain customerId: null; no durable Walk-in Customer is created. A non-null missing Customer ID remains orphaned and is warned, never reclassified as Walk-in or invented.

One V3 Sale remains one historical V4 order/invoice with its line boundaries intact. References use the LEGACY-SAL-* namespace and do not consume native sequences. Reliable paid/outstanding evidence may create historical payment allocation/subledger evidence, but no historical finance journals are fabricated. Walk-in credit is a blocker.

V3 absence of Suppliers and procurement evidence remains absence. Current stock never creates Purchase Orders, Goods Receipts, Supplier Invoices or Supplier Payments.

Expenses retain source identity, date, amount, description/category, reliable method and provenance. Obvious category mapping is deterministic; ambiguity is a warning requiring review. Unknown financial destination remains null.

## Finance opening position

Finance starts at the configured cutover instant from verified balances, not reconstructed historical journals. Cash and each Bank/Financial Account require amount, verification timestamp, reference and actor evidence. Verified AR/AP/known-cost inventory or other balances may be supplied. The balancing side uses the semantic opening_balance_equity account, never Retained Earnings.

The opening journal is balanced, idempotent and linked to the run. Unknown inventory cost is reported as unknown coverage; it is not posted as zero. Readiness also requires a balanced Trial Balance and Balance Sheet.

## Reconciliation and readiness

Durable results compare Products, per-product and total quantity, Customers, Sales count/units/value, Walk-ins and fake-customer count, accepted AR, Expenses, ownership and unknown inventory value coverage. Finance verification covers Trial Balance, Balance Sheet and known/unknown AR, AP and inventory coverage.

Unexplained identity, quantity, sales-unit/value, accepted-AR, schema, checksum, write, opening-journal, source-mutation, engine or rehearsal discrepancies are blockers. Unknown costs, unavailable historical Supplier/location/actor/method, ambiguous categories, unknown ownership and non-financial orphan references are warnings. Warnings proceed only when recorded as explicitly accepted.

Manual resolutions point to a manifest item and record issue, decision, optional destination, reason, actor and timestamp. They can update disposition evidence but never raw snapshot bytes.

## Rehearsal and production procedure

The implementation supports an isolated database such as freeofis_v4_phase8_rehearsal. A rehearsal verifies the snapshot, executes deterministic migration, reconciles and calculates acceptance readiness. Synthetic automated and Chrome tests are the only rehearsals authorized in Phase 8.

Later real-data rehearsal requires separate user authorization and should:

1. Export and independently retain a V3 backup.
2. Explicitly supply a read-only capture of all seven V3 raw keys to an isolated rehearsal database.
3. Verify checksums and review every manifest warning/blocker.
4. Enter verified Cash, Bank and other opening balances and their evidence.
5. Reconcile counts, quantities, money, AR/AP, inventory coverage, Trial Balance and Balance Sheet.
6. Run application smoke checks and preserve the report.
7. Delete/recreate the rehearsal candidate and repeat to prove determinism.
8. Stop. Production maintenance mode, final snapshot, entry-point switch and native operations require a later explicit approval.

## UI and validation

The separate /v4/app/index.html workspace includes a Migration area marked **V4 DEVELOPMENT — NO CUTOVER**. Cutover controls remain development-disabled; the area describes the review workflow and never reads legacy storage.

tests/browser/v4-phase8-migration.html uses only synthetic in-memory source values and freeofis_v4_phase8_test. It verifies schema, checksums, backup, mapping, reconciliation, opening finance, acceptance, blocker behavior, application smoke behavior, rollback and isolated database cleanup.
