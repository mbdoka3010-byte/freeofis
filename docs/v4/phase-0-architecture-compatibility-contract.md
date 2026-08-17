# Free Ofis V4 Phase 0 — Architecture and Compatibility Contract

Status: normative Phase 0 contract

Baseline: V3 commit `5ee1df09859600a61b675f733f0ed84a3c379406`

Scope: documentation and test foundation only; no V4 runtime behavior

## 1. Purpose and boundaries

This contract freezes the observable V3 business semantics that V4 must preserve and defines conventions for future V4 implementation. During the transition, the current V3 `localStorage` collections remain authoritative. Phase 0 does not modify `app.js`, introduce storage keys, read or write browser data, or project V3 data at runtime.

The words MUST, MUST NOT, SHOULD, and MAY are normative.

## 2. Frozen V3 semantics

### Inventory

- `freeofis_inventory` is the authoritative V3 inventory collection.
- An item has a persistent `id`, `name`, mutable `quantity`, selling `price`, optional `sku`, and `lowStock` threshold.
- Completing a sale reduces the referenced items' quantities.
- Cancelling an active sale restores its referenced quantities exactly once.
- A product referenced by an active historical sale is not silently removed.
- V3 does not contain authoritative purchase cost, ownership, supplier, or stock-movement history. Selling `price` MUST NOT be reinterpreted as historical cost.

### Customers and Walk-ins

- `freeofis_customers` is the authoritative V3 registered-customer collection.
- Registered customers retain their persistent IDs and profile fields.
- A Walk-in is not a customer master record. A Walk-in sale and its sale-linked payment use `customerId: null`.
- `__walkin__` is only a UI grouping/navigation sentinel and MUST NOT be persisted.
- A non-null customer ID absent from the customer collection is an orphaned/archived historical reference, not a Walk-in. It MUST remain identifiable and MUST NOT be converted to null.

### Sales

- `freeofis_sales` is the authoritative V3 sales collection.
- Current sales contain an `items` array. Each line preserves `productId`, name snapshot, quantity, unit price, and subtotal.
- Multi-item sales MUST remain multi-item sales and line order MUST survive compatibility processing.
- Sale identity, transaction time, customer reference, line snapshots, totals, reference, notes, status, and cancellation history are historical facts and MUST NOT be silently rewritten.
- Older single-item records may be recognized through the already-existing V3 fallback shape, but Phase 0 performs no production migration.
- The Sales & Orders presentation groups transactions by derived Year → Month → Day → individual sale, using `transactionAt` with `date` fallback. This is presentation, not duplicated persisted year/month/day truth.

### Payments, credit, and statements

- `freeofis_payments` is the authoritative V3 payment collection.
- A payment may link to a sale through `saleId`; valid explicit links MUST survive.
- Sale `paid` and `balance` are cached V3 values. Operational V3 recomputation uses non-cancelled linked payments.
- Customer credit is derived from active customer sales and active payments/allocations; it is not a separate customer balance field.
- Customer account payments are allocated to open sales by existing V3 behavior. Ambiguous historical payments MUST NOT be guessed onto a sale.
- Walk-ins have no customer-wide account, credit balance, or statement. A later Walk-in payment must target its specific sale.
- Customer statements present purchases and payments as history. Cancelled payments remain visible as cancelled history and do not affect active balances.
- V3 `method` is a payment method, not reliable evidence of a destination bank/cash account.

### Expenses

- `freeofis_expenses` is the authoritative V3 expense collection.
- Expense ID, description, amount, date/time, and `transactionAt` where present are preserved.
- V3 has no authoritative supplier, expense-account, payment-destination, or tax allocation for an expense.

### Receipts and reports

- V3 receipts are rendered from the preserved sale, payment, customer, and business facts; a receipt does not create or replace a sale.
- Reports derive from current V3 collections and exclude cancelled financial effects according to current behavior.
- No V3 report result creates transaction truth.

### Cancellation

- Sale cancellation changes the sale status to `cancelled`, records `cancelledAt`, cascade-cancels active linked payments, and restores stock exactly once.
- Payment cancellation changes the payment status to `cancelled`, records `cancelledAt`, preserves the record, and removes its effect from linked sale/customer balances.
- Already-cancelled records are idempotent and MUST NOT be cancelled or stock-restored twice.
- Historical cancellation status and timestamps MUST survive compatibility processing.

### Backup, export, and import

- V3 export produces JSON with `app`, version, `exportedAt`, and `data` containing inventory, customers, sales, payments, expenses, and business.
- V3 import also accepts the collections at the payload root through its existing `payload.data || payload` compatibility behavior.
- A recognizable backup requires array values for inventory, customers, sales, payments, and expenses. Business details may be absent and fall back to an empty object.
- Old V3 backups MUST remain recognizable by future compatibility import tooling. Import is an explicit user action and may replace browser-local V3 data only through the existing confirmed V3 workflow until a later approved phase changes it.

### Authoritative storage contract

The only current V3 storage keys are:

| Key | Authority |
| --- | --- |
| `freeofis_inventory` | Inventory items and current quantities |
| `freeofis_customers` | Registered customers |
| `freeofis_sales` | Sales and sale history |
| `freeofis_payments` | Payments and payment history |
| `freeofis_expenses` | Expenses |
| `freeofis_business` | Current seller/business details |
| `freeofis_data_version` | V3 schema version marker |

The current data version is exactly `3`. Phase 0 adds no key and changes no stored value.

## 3. Shared V4 conventions (prospective only)

These conventions apply to future V4 entities after their implementation phase is approved. They MUST NOT be retroactively written into V3 records by Phase 0.

### Identity

- New V4 entity and business-event IDs MUST use canonical lowercase UUIDv7 strings. Generation MUST use a cryptographically secure random source and MUST NOT depend on a database sequence or a user-visible business number.
- IDs are immutable after creation and are never recycled.
- Entity type is not inferred solely from a display prefix.
- Existing V3 IDs are immutable legacy identities; V4 MUST reference them without replacement.
- Public tokens and document-share credentials are distinct from internal IDs.

### Time and timezone

- Canonical V4 instants use ISO 8601/RFC 3339 with an explicit UTC offset, with UTC (`Z`) preferred for interchange.
- Business timezone is stored separately as an IANA timezone name when that model is introduced.
- `transactionAt` is the business event time; `createdAt` is record creation; `postedAt` is financial posting time.
- Calendar grouping derives from `transactionAt` in the applicable Business timezone. Derived year/month/day fields are not independent truth.
- V3 local timestamps lacking an offset retain their original text plus provenance; an offset MUST NOT be invented.

### Currency and money

- V4 monetary values use signed integer minor units plus an ISO 4217 currency code, for example `{ "minor": 2000000, "currency": "NGN" }` for ₦20,000.00.
- Floating-point values MUST NOT be the authoritative V4 money representation.
- Conversion from V3 decimal-number money is prospective and must use a documented currency exponent and rounding rule. The original V3 value remains preserved in provenance.
- Unknown money is `null` with a reason/status; it is not zero.
- Zero means a known amount of zero.

### Status

- Status values are stable lowercase machine tokens such as `draft`, `completed`, `posted`, `cancelled`, `reversed`, and `archived`.
- Each entity defines its allowed transitions. Display labels do not become persisted status values.
- Finalized/posted records are corrected by explicit reversal, cancellation, or replacement records rather than silent editing.

### Null, unknown, and unallocated

- `null` means absent/not applicable only where the field contract permits it; for V3 `customerId`, null specifically means Walk-in.
- Unknown facts remain `null` and SHOULD carry an `unknownReason` or quality flag in a future projection.
- Unallocated means a known transaction whose required allocation is unresolved. It is distinct from unknown and from zero.
- Unknown historical cost, destination account, actor, supplier, refund, or ownership MUST NOT be synthesized.

### Provenance and legacy references

Future V4 projections SHOULD carry a provenance structure equivalent to:

```json
{
  "sourceSystem": "freeofis-v3",
  "sourceCollection": "freeofis_sales",
  "sourceId": "SALE-...",
  "sourceDataVersion": 3,
  "sourceHash": "optional-content-hash",
  "projectedAt": "future-offset-aware-timestamp",
  "projectionVersion": "future-version"
}
```

- A compatibility mapping key is the tuple `(sourceSystem, sourceCollection, sourceId)`.
- The tuple maps to at most one active V4 identity for the same entity type.
- Mapping is idempotent and never changes the V3 ID.
- Orphaned references are preserved as legacy references with resolution status `orphaned`; they are not coerced to another entity.

### Reversal and cancellation

- Cancellation preserves the original identity and facts, records status/time/reason/actor when known, and prevents active effect.
- Reversal is a new immutable record referencing the original through `reversalOfId`; it does not overwrite the original.
- Unknown historical reason or actor remains null.
- V3 cancellation fields are preserved verbatim in compatibility projections.

### Business-event and audit identity

- Future audit events use their own opaque immutable event ID.
- `eventId`, source transaction identity, affected entity identity, correlation identity, and causation identity are distinct.
- Events record actor only when known and authenticated; V3 history MUST NOT be assigned to a fabricated Owner.
- Event ordering uses timestamp plus stable event identity; timestamp alone is not assumed unique.

## 4. V3 compatibility contract

### Transition authority

Until an explicitly approved later phase changes runtime persistence, the seven V3 keys above remain authoritative. Documentation, fixtures, tests, and future projections MUST NOT write to them during validation.

### Fields that must not be rewritten

For every V3 collection, existing `id` values MUST remain unchanged. The following preserved facts MUST not be silently replaced when present:

- Inventory: `id`, `name`, `quantity`, `price`, `sku`, `lowStock`.
- Customer: `id`, `name`, `phone`, `address`.
- Sale: `id`, `customerId`, `items` and their order/snapshots, `total`, `paid`, `balance`, `method`, `reference`, `notes`, `date`, `time`, `transactionAt`, `status`, `cancelledAt`.
- Payment: `id`, `customerId`, `saleId`, `amount`, `method`, `reference`, `date`, `time`, `transactionAt`, `status`, `cancelledAt`.
- Expense: `id`, `description`, `amount`, `date`, `time`, `transactionAt`.
- Business: existing seller detail fields.

Missing optional fields may receive defaults only inside a clearly versioned, non-mutating compatibility view. The raw V3 source remains unchanged.

### Projection rules

- Compatibility validation and projection read a deep copy or immutable snapshot of V3 input.
- A future V4 record references V3 through provenance/compatibility mapping, never by changing the V3 record.
- Projection must be deterministic and idempotent for identical source input.
- Any cached or derived values are labelled as projections and can be rebuilt.
- Compatibility processing MUST NOT call `localStorage.setItem`, `removeItem`, `clear`, import, migration, or application save helpers.

### Required representations of historical uncertainty

| Historical condition | Required future representation |
| --- | --- |
| Walk-in | `customerId: null`; classification `walk_in` may exist only in projection metadata |
| Missing non-null customer | Original ID retained; resolution `orphaned`; never Walk-in |
| Missing inventory cost | Cost `null`; cost status `unknown_historical`; no profit claim |
| Unknown payment destination | Destination account `null`; allocation status `unallocated_historical_unknown` |
| Unknown actor | Actor/user ID `null`; actor status `unknown_historical` |
| Unknown timestamp offset | Original timestamp retained; timezone/offset status `unknown` |
| Missing optional field | Absent/null with provenance; no invented business fact |

### Backup compatibility

- Future import tooling MUST recognize the current V3 envelope and root-collections fallback.
- Recognition and validation are read-only until the user explicitly confirms import.
- Original collection contents and IDs are retained during parsing.
- Unsupported or ambiguous values produce warnings, not guessed corrections.
- Import tests use synthetic files and MUST NOT access production browser storage.

## 5. Phase 0 validation assets

- `tests/fixtures/v3-representative-backup.json` is synthetic and intentionally covers registered cash/credit sales, partial and full settlement, Walk-in, multi-item, orphaned customer reference, cancellation history, inventory, expense, legacy date fallback, and missing optional fields.
- `tests/v3-compatibility.test.js` is a standalone Node test. It reads the fixture, processes only a deep clone, verifies the compatibility rules, checks the current production source contract, and installs a throwing `localStorage` guard to prove validation performs no storage mutation.

These assets are not imported by `app.js` and have no production runtime effect.

## 6. Phase 1 entry criteria

Phase 1 MUST NOT start until:

1. This contract and its fixture expectations are approved.
2. The future persistence technology and atomic transaction boundary are selected.
3. The implementation preserves naive V3 local timestamps verbatim and marks their offset unknown, as required here.
4. The implementation keeps raw V3 source, read-only compatibility projection, and later V4 authority as distinct layers, as required here.
