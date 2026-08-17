# Free Ofis V4 Phase 1 — Persistence, Tenancy, and Operating-Unit Foundation

Status: implementation foundation; not connected to the V3 production runtime

## Scope and coexistence

Phase 1 introduces a dedicated V4 IndexedDB foundation. The existing V3 application continues to run entirely from its seven `localStorage` keys at data version 3. Neither `app.js` nor `index.html` imports the V4 modules, so opening the current application does not open, bootstrap, or write the V4 database.

V3 remains authoritative during this transition:

```text
Current V3 UI → V3 localStorage (authoritative)

Future approved V4 runtime → V4 IndexedDB (currently isolated)
                         ↘ read-only legacy mappings/projections later
```

No V3 record is migrated or rewritten by Phase 1.

## Database and schema

- Database: `freeofis_v4`
- Version: `1`
- Engine: browser IndexedDB
- Upgrade entry point: `applyV4SchemaUpgrade`
- Access: `IndexedDbPersistence`; raw IndexedDB calls remain inside the persistence module

The open helper reports unavailable, blocked, open-failure, and upgrade-failure conditions with stable error codes. A version-change notification closes the connection so another tab can upgrade safely.

### Object stores

| Store | Key | Purpose |
| --- | --- | --- |
| `accounts` | `id` | Top-level owner/account identity without authentication |
| `businesses` | `id` | Businesses owned by Accounts |
| `operatingUnits` | `id` | Flexible store, branch, outlet, warehouse, channel, office, or other scope |
| `legacyMappings` | `id` | Non-destructive V3 source identity → V4 target identity mapping |
| `businessEvents` | `id` | Generic append-oriented audit/event foundation |
| `meta` | `key` | V4-only schema, bootstrap, compatibility, and future checkpoint state |

Only these foundational stores exist. No supplier, purchase, finance, journal, inventory-costing, staff, document, AI, or sharing store is created.

### Index justification

- Account/status and ownership indexes support scoped lists without full scans.
- Operating Unit type/status indexes support future unit selection and administration.
- Legacy source and target compound indexes are unique to enforce one active identity mapping in each direction.
- Event account/business/unit/type/time indexes support future audit histories and consolidated queries.
- `meta` is directly addressed by key and needs no index.

## Tenancy model

```text
Account
└── Business (one or many per Account)
    └── OperatingUnit (one or many per Business)
```

All new entity and event IDs use canonical lowercase UUIDv7. Timestamps are RFC 3339/ISO strings. Records carry status, provenance, and extensible metadata according to the Phase 0 contract.

### Account

Account is the top-level owner container. It contains `id`, `name`, `status`, creation/update timestamps, provenance, and metadata. Authentication is deliberately absent.

### Business

Business belongs to exactly one Account and contains `accountId`, name, extensible type, default ISO currency, IANA timezone, status, timestamps, provenance, and metadata. Repository creation rejects a missing owner Account.

### OperatingUnit

OperatingUnit belongs to exactly one Business. Its extensible `type` supports `store`, `branch`, `outlet`, `shop`, `kiosk`, `warehouse`, `online_store`, `social_page`, `office`, and future values without separate entity models. Repository creation rejects a missing owner Business.

## Default legacy V3 scope

`bootstrapLegacyV3Scope` atomically creates one Account, one Business, one OperatingUnit, one bootstrap event, and one completed meta checkpoint.

The bootstrap:

- never reads or writes V3 `localStorage`;
- never infers historical identities or actors;
- marks provenance as `freeofis-v3`, data version 3;
- records the actor as unknown;
- returns the stored scope unchanged on subsequent calls;
- fails as one atomic unit if any write fails;
- detects corrupt/incomplete checkpoint references instead of recreating or guessing.

Default names are prospective labels around the installation, not claims about historical V3 records. Callers may provide explicit names, business type, currency, timezone, and unit type on first bootstrap.

## Legacy mappings

A mapping associates the immutable tuple:

```text
(sourceSystem, sourceEntityType, sourceId)
→ (targetEntityType, targetId)
```

The source and target compound indexes are unique. Repeating an identical mapping returns the stored mapping; attempting to redirect an existing source to a different target fails. Mappings carry V3 data version, status, provenance, and optional Business/OperatingUnit scope. Phase 1 creates mapping infrastructure but performs no migration.

## Business events

BusinessEvent contains event ID, account/business/unit scope, event type, entity reference, event and creation timestamps, actor identity/type, provenance, and metadata. Unknown actors use `actorId: null` and `actorType: unknown_historical`.

Phase 1 persists only its synthetic tests and the prospective legacy-bootstrap event. Operational sale, payment, purchase, inventory, expense, and document events are deferred.

## Transaction boundary

`runTransaction(storeNames, mode, work)` is the common boundary. It exposes request helpers for `get`, `getAll`, indexed reads, `add`, `put`, and `delete`. A work callback may span multiple stores. A thrown/rejected error aborts the IndexedDB transaction, so all participating writes commit or none do.

Tests demonstrate both atomic commit and deliberate rollback across `businesses`, `operatingUnits`, and `businessEvents` using synthetic records.

## Repository convention

Domain code uses repositories or the transaction context rather than raw IndexedDB. Repositories:

- construct and validate entities before persistence;
- validate parent ownership inside the same transaction as child creation;
- return stored domain records;
- make idempotency explicit where required;
- preserve transaction boundaries for future business operations.

## Phase 2 boundary

Phase 1 does not select or implement later business modules. Before Phase 2, the next module's store set, posting/movement boundary, upgrade to database version 2, and relationship to legacy projections must be separately approved.
