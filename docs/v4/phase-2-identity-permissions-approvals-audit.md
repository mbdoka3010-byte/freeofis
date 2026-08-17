# Free Ofis V4 Phase 2 — Identity, Permissions, Approvals, and Audit

Status: foundation only; isolated from the production V3 application

## Architecture

```text
User
└── BusinessMembership → Business
    └── RoleAssignment
        ├── Role
        │   └── permissionCodes → Permission catalog
        └── Scope
            ├── entire Business
            └── one or more Operating Units in that Business
```

A User is an identity, not an authentication credential and not automatic access. A BusinessMembership establishes association with exactly one Business. A RoleAssignment supplies permissions through a Role and independently defines where those permissions apply.

Phase 2 remains disconnected from `app.js` and `index.html`. V3 continues to use its seven `localStorage` keys at data version 3. No Phase 2 module reads, writes, projects, or migrates V3 records.

## IndexedDB version 2

Database `freeofis_v4` advances additively from version 1 to version 2. All six v1 stores remain. Six stores are added:

| Store | Key | Purpose |
| --- | --- | --- |
| `users` | `id` | Person identity without authentication credentials |
| `businessMemberships` | `id` | Unique User-to-Business membership |
| `roles` | `id` | Built-in or future custom Business roles |
| `permissions` | `code` | Controlled action permission catalog |
| `roleAssignments` | `id` | Role assignment plus Business/unit scope |
| `approvals` | `id` | Generic future approval request and decision |

The upgrade creates missing stores and indexes only. Existing stores and data are not recreated or rewritten.

## User and BusinessMembership

User contains UUIDv7 ID, display name, optional email and phone, explicit status, timestamps, provenance, and metadata. Email and phone are nullable.

BusinessMembership links one User to one Business. The compound `(userId, businessId)` is unique. Membership status is explicit; `active` may authorize, while `suspended` and `revoked` may not. A membership never grants permissions by itself.

## Roles and permissions

Permission codes describe actions rather than pages. The initial catalog contains 25 stable codes across sales, payments, customers, inventory, purchases, finance, reports, documents, staff, approvals, and settings.

Roles belong to a Business and contain permission codes. `kind` distinguishes seeded `system` roles from future `custom` roles. Role names have no hard-coded authorization behavior; evaluation uses permission membership only.

Initial built-in roles:

| Role code | Default intent |
| --- | --- |
| `owner` | All current permissions |
| `administrator` | All current permissions |
| `manager` | Broad operations excluding sensitive finance posting/adjustment and settings |
| `cashier` | Sales, receipt, customer, payment, and inventory viewing operations |
| `accountant` | Payments, purchases, finance, reports, documents, and approval review |
| `inventory_storekeeper` | Inventory movement and receiving operations |
| `viewer` | Only permission codes ending in `.view` |

Seeding is idempotent. Permission code and per-Business role code indexes prevent duplication. These defaults may be versioned or customized in later approved phases; the initial names are not operational logic.

## Role assignment and scope

A RoleAssignment references one membership and one Role in the same Business. Scope is either:

- `business`, with no unit IDs; or
- `operating_units`, with a non-empty unique set of Operating Unit IDs.

Every scoped unit is validated as belonging to the assignment Business. One Manager assignment can therefore cover Stores 1, 2, and 3 without copying the Manager Role. Cross-Business membership, role, and unit combinations are rejected.

## Authorization evaluation

`canUser` answers whether a User has a permission in a Business and optional Operating Unit. It requires:

1. The Business exists.
2. The optional unit exists in that Business.
3. The User has an active membership in that Business.
4. The permission exists and is active.
5. At least one active assignment belongs to that membership and Business.
6. The assignment covers the requested scope.
7. Its active Role belongs to the Business and contains the permission code.

Suspended/revoked membership, inactive/revoked assignment, missing permission, wrong unit, or cross-Business Role denies access. Phase 2 does not connect evaluation to V3 UI actions.

## Sole-trader Owner bootstrap

`bootstrapLegacyV3Owner` composes the Phase 1 scope bootstrap with permission/role seeding and an atomic identity bootstrap. It establishes one default User, active membership, Owner Role, Business-wide assignment, event, and completion checkpoint.

The placeholder display name `Owner` is explicitly marked in metadata and is not treated as a known personal name. Email and phone stay null unless supplied. Repeated execution returns the stored identities. It never reads or modifies V3 `localStorage` and does not require staff setup UI.

The scope step, catalog seed, and owner-identity step are separate restart-safe transactions. A failure may leave an earlier completed checkpoint but rerunning safely resumes without duplication.

## Approval foundation

Approval records capture Account, Business, optional unit, requested action, required permission, source entity reference, requester, status, timestamps, decision actor, reason/notes, provenance, and metadata.

New approvals must be `pending`. Decisions may be `approved`, `rejected`, `cancelled`, or `expired`. The requester and decision actor must be active members of the Approval Business. Phase 2 validates identity and scope but does not execute the requested operational action.

## BusinessEvent integration

The existing `businessEvents` store remains the only audit/event store. Phase 2 writes compact reference events for:

- `identity.user.created`
- `identity.membership.created`
- `authorization.role.assigned`
- `authorization.role.revoked`
- `approval.requested`
- `approval.decided`
- `identity.legacy_owner.bootstrapped`

Events identify who, what, where, when, and limited why metadata without copying entire entity state. Unknown bootstrap actors remain null with `unknown_historical` actor type.

## Data-integrity rules

- Membership requires an existing User and Business.
- User/Business membership is unique.
- Role assignment requires matching membership, Role, and Business.
- Every Role permission code must exist before assignment.
- Every scoped unit must belong to the assignment Business.
- Suspended/revoked memberships and inactive/revoked assignments do not authorize.
- Approval scope must match Account, Business, and optional unit ownership.
- Approval requesters and decision actors must be active Business members.
- All related entity and event writes share one atomic transaction.

## Browser IndexedDB integration harness

The harness is [v4-phase2-indexeddb.html](../../tests/browser/v4-phase2-indexeddb.html). It is not linked from the production application. It uses and deletes the isolated database `freeofis_v4_phase2_test`; it never opens the production-named V4 database and never accesses V3 `localStorage`.

Manual Chrome steps:

1. From the repository root, start a local static server, for example using an already-installed Python runtime: `python -m http.server 8000`.
2. Open `http://localhost:8000/tests/browser/v4-phase2-indexeddb.html` in Chrome.
3. Select **Run IndexedDB integration checks**.
4. Confirm the output ends with `ALL BROWSER INDEXEDDB CHECKS PASSED`.
5. Close any other harness tabs if cleanup reports that deletion is blocked.

The harness verifies database opening at v2, all stores, default Owner bootstrap, repository reads, atomic commit, deliberate rollback, and test-database cleanup.

## Phase 3 boundary

Phase 3 must separately approve its operational domain, new stores and database version 3 upgrade, command/event transaction boundary, authorization enforcement points, and the moment—if any—when the isolated V4 runtime becomes connected to production navigation.
