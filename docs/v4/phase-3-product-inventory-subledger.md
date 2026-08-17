# Free Ofis V4 Phase 3 — Product and Inventory Subledger

Status: isolated foundation; not imported by the production V3 application.

## IndexedDB version 3

The additive v2→v3 upgrade preserves all 12 earlier stores and adds `products`, `productIdentifiers`, `inventoryLocations`, `inventoryMovements`, `inventoryCostLayers`, and `inventoryOwnerships`. No supplier or purchasing store is introduced.

## Model

```text
Business → Product → ProductIdentifier(s)
Business → OperatingUnit → InventoryLocation(s)
Product + Location + Ownership → immutable InventoryMovement(s)
Inbound Movement → immutable InventoryCostLayer
```

Product is the durable Business-level master. It supports optional description/category, unit of measure, tax metadata, and default selling price without forcing specialist fields. Duplicate names are allowed because names are not reliable identities.

Identifiers are separate records, allowing multiple SKU, barcode, QR, supplier-code, internal-code, or other values per Product. The service rejects conflicting active `(Business, type, normalized value)` identities while allowing different identifier types.

InventoryLocation is distinct from OperatingUnit. A unit may contain sales-floor, stock-room, damaged, returns, transit, virtual, or other locations. A location normally references a unit; its Business ownership is validated.

## Movement-derived stock

InventoryMovement is the quantity source of truth. It stores a positive magnitude and signed quantity, type, Product, location, unit, ownership, time, optional source/transfer/reversal references, actor, provenance, and metadata. There is no authoritative mutable stock balance. Location, unit, Business, physical-total, and ownership balances are sums of active signed movements. Negative stock is returned explicitly by the query and is not hidden.

Movement types include opening, receipts, issues, returns, paired transfers, adjustments, damage/write-off, consignment, production, and reversal. Exact reversal validation requires matching Business, Product, location, ownership, and opposite quantity. Historical movements and cost layers have no update API; corrections use new reversing records.

## Ownership

Ownership is explicit:

- `merchant`
- `supplier_consignment`, requiring a supplied owner reference
- `unknown_historical`

The Phase 3 owner reference may remain unresolved until Supplier is introduced. No Supplier entity is fabricated. Physical total may therefore be partitioned by ownership, such as 12 merchant-owned and 8 supplier-owned units in one location.

## Cost and selling price

Weighted Average Cost is the initial policy. Each inbound cost layer preserves received quantity, integer minor-unit acquisition cost, currency, ownership, movement, time, and provenance. The derived weighted average is `sum(quantity × unit cost) / sum(quantity)`. If any applicable layer has unknown cost, the result is explicitly unknown rather than misleadingly partial.

Default selling price belongs to Product and is operational pricing, not acquisition cost. Changing it cannot modify cost layers. Landed costs, consumption allocation, and purchase/supplier linkage are deferred, but source references and layers preserve reconstruction inputs.

## Transfers

A transfer creates an outbound and inbound movement with one transfer ID plus a compact `inventory.transferred` BusinessEvent in one atomic transaction. The pair must remain inside one Business and net to zero. Any failure aborts both movements and the event.

## V3 compatibility

V3 remains authoritative and unchanged. A future explicit projection may map each immutable V3 item ID to a V4 Product, copy its current selling price as selling price, map its SKU/barcode if non-conflicting, create a default location, and create one opening movement equal to current quantity. It must preserve V3 provenance and ID mapping.

V3 cannot establish historical purchases, acquisition cost, supplier, location history, actor, or ownership. Cost therefore remains null/unknown. Ownership defaults to `unknown_historical` unless separate reliable evidence explicitly supports merchant ownership. No historical purchase is invented.

## Permissions and events

Catalog version 2 adds `inventory.receive`. System role template version 2 includes it for newly seeded Owner, Administrator, Manager, and Inventory/Storekeeper roles. Existing stored roles are not silently rewritten; later template migration/customization policy must explicitly reconcile them.

Events use the existing store: `product.created`, `product.identifier_added`, `inventory.opened`, `inventory.received`, `inventory.adjusted`, `inventory.transferred`, and `inventory.reversed`. Events reference records instead of duplicating them.

## Browser harness

Serve the repository locally and open `tests/browser/v4-phase3-indexeddb.html` in Chrome. The isolated `freeofis_v4_phase3_test` database verifies v3 opening, all stores, Product/location/opening movement, derived balance, weighted cost, atomic transfer, rollback, and cleanup. It never uses V3 localStorage or the production V4 database name.
