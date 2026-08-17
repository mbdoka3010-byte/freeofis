import { V4_STORES } from '../persistence/schema.mjs';
import { createUuidV7, nowTimestamp, createBusinessEvent } from '../domain/entities.mjs';
import { ScopeValidationError } from '../persistence/repositories.mjs';

const OWNERSHIP_TYPES = new Set(['merchant', 'supplier_consignment', 'unknown_historical']);
const POSITIVE_TYPES = new Set(['opening', 'purchase_receipt', 'customer_return', 'transfer_in', 'adjustment_increase', 'consignment_receipt', 'production', 'reversal']);
const NEGATIVE_TYPES = new Set(['sale_issue', 'supplier_return', 'transfer_out', 'adjustment_decrease', 'damage_writeoff', 'consignment_return']);

const required = (value, name) => {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`${name} is required.`);
  return text;
};
const common = (input, context) => {
  const timestamp = input.createdAt || nowTimestamp(context.clock);
  return {
    id: input.id || createUuidV7(context.uuidOptions), status: input.status || 'active',
    createdAt: timestamp, updatedAt: input.updatedAt || timestamp,
    provenance: input.provenance ?? null, metadata: input.metadata ?? {}
  };
};

export function createProduct(input = {}, context = {}) {
  return {
    ...common(input, context), businessId: required(input.businessId, 'Product businessId'),
    name: required(input.name, 'Product name'), description: input.description ?? null,
    category: input.category ?? null, unitOfMeasure: input.unitOfMeasure || 'unit',
    defaultSellingPriceMinor: input.defaultSellingPriceMinor ?? null,
    sellingCurrency: input.sellingCurrency || null, taxMetadata: input.taxMetadata ?? null
  };
}

export function createProductIdentifier(input = {}, context = {}) {
  const value = required(input.value, 'Identifier value');
  return {
    ...common(input, context), businessId: required(input.businessId, 'Identifier businessId'),
    productId: required(input.productId, 'Identifier productId'), type: required(input.type, 'Identifier type'),
    value, normalizedValue: value.trim().toLowerCase()
  };
}

export function createInventoryLocation(input = {}, context = {}) {
  return {
    ...common(input, context), businessId: required(input.businessId, 'Location businessId'),
    operatingUnitId: input.operatingUnitId ?? null, name: required(input.name, 'Location name'),
    type: input.type || 'stock', negativeStockPolicy: input.negativeStockPolicy || 'detect'
  };
}

export function createInventoryOwnership(input = {}, context = {}) {
  const type = input.type || 'unknown_historical';
  if (!OWNERSHIP_TYPES.has(type)) throw new TypeError('Invalid inventory ownership type.');
  if (type === 'supplier_consignment' && !input.ownerReference) {
    throw new TypeError('Supplier-owned inventory requires an explicit owner reference.');
  }
  return {
    ...common(input, context), businessId: required(input.businessId, 'Ownership businessId'),
    type, ownerReference: input.ownerReference ?? null
  };
}

export function createInventoryMovement(input = {}, context = {}) {
  const movementType = required(input.movementType, 'Movement type');
  const magnitude = Number(input.quantity);
  if (!Number.isFinite(magnitude) || magnitude <= 0) throw new TypeError('Movement quantity must be positive and non-zero.');
  let signedQuantity = input.signedQuantity;
  if (signedQuantity === undefined) {
    if (POSITIVE_TYPES.has(movementType)) signedQuantity = magnitude;
    else if (NEGATIVE_TYPES.has(movementType)) signedQuantity = -magnitude;
    else throw new TypeError('Unknown movement type requires explicit signedQuantity.');
  }
  if (!Number.isFinite(signedQuantity) || signedQuantity === 0 || Math.abs(signedQuantity) !== magnitude) {
    throw new TypeError('Movement signed quantity is invalid.');
  }
  return {
    ...common(input, context), businessId: required(input.businessId, 'Movement businessId'),
    operatingUnitId: required(input.operatingUnitId, 'Movement operatingUnitId'),
    inventoryLocationId: required(input.inventoryLocationId, 'Movement inventoryLocationId'),
    productId: required(input.productId, 'Movement productId'), ownershipId: required(input.ownershipId, 'Movement ownershipId'),
    quantity: magnitude, signedQuantity, movementType, transactionAt: input.transactionAt || nowTimestamp(context.clock),
    sourceType: input.sourceType ?? null, sourceId: input.sourceId ?? null,
    transferId: input.transferId ?? null,
    ...(input.reversalOfId ? { reversalOfId: input.reversalOfId } : {}),
    actorId: input.actorId ?? null
  };
}

export function createInventoryCostLayer(input = {}, context = {}) {
  const quantityReceived = Number(input.quantityReceived);
  if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) throw new TypeError('Cost quantity must be positive.');
  if (input.unitCostMinor !== null && (!Number.isSafeInteger(input.unitCostMinor) || input.unitCostMinor < 0)) {
    throw new TypeError('Unit cost must be a non-negative integer minor-unit amount or null.');
  }
  return {
    ...common(input, context), businessId: required(input.businessId, 'Cost businessId'),
    productId: required(input.productId, 'Cost productId'), movementId: required(input.movementId, 'Cost movementId'),
    ownershipId: required(input.ownershipId, 'Cost ownershipId'), quantityReceived,
    unitCostMinor: input.unitCostMinor ?? null, currency: input.currency ?? null,
    receivedAt: input.receivedAt || nowTimestamp(context.clock), costStatus: input.unitCostMinor == null ? 'unknown' : 'known'
  };
}

async function validateMovement(tx, movement) {
  const product = await tx.get(V4_STORES.products, movement.productId);
  const location = await tx.get(V4_STORES.inventoryLocations, movement.inventoryLocationId);
  const ownership = await tx.get(V4_STORES.inventoryOwnerships, movement.ownershipId);
  const unit = await tx.get(V4_STORES.operatingUnits, movement.operatingUnitId);
  if (!product || !location || !ownership || !unit) throw new ScopeValidationError('Movement references missing inventory scope.');
  if ([product.businessId, location.businessId, ownership.businessId].some(id => id !== movement.businessId)) {
    throw new ScopeValidationError('Movement contains cross-Business references.');
  }
  if (location.operatingUnitId && location.operatingUnitId !== unit.id) {
    throw new ScopeValidationError('Movement Operating Unit does not own the location.');
  }
  if (movement.reversalOfId) {
    const original = await tx.get(V4_STORES.inventoryMovements, movement.reversalOfId);
    if (!original || original.businessId !== movement.businessId || original.productId !== movement.productId ||
        original.inventoryLocationId !== movement.inventoryLocationId || original.ownershipId !== movement.ownershipId ||
        original.signedQuantity !== -movement.signedQuantity) {
      throw new ScopeValidationError('Movement reversal is invalid.');
    }
  }
  return { product, location, ownership, unit };
}

async function enforceNegativePolicy(tx, movement, location) {
  if (movement.signedQuantity >= 0 || location.negativeStockPolicy !== 'prevent') return;
  const existing = await tx.getAllByIndex(
    V4_STORES.inventoryMovements,
    'byLocationId',
    movement.inventoryLocationId
  );
  const current = existing
    .filter(item => item.status === 'active' && item.productId === movement.productId && item.ownershipId === movement.ownershipId)
    .reduce((sum, item) => sum + item.signedQuantity, 0);
  if (current + movement.signedQuantity < 0) {
    throw new ScopeValidationError('Movement would violate the location negative-stock policy.');
  }
}

export function createInventoryService(persistence) {
  const addEvent = (tx, scope, type, entityType, entityId, context, metadata = {}) =>
    tx.add(V4_STORES.businessEvents, createBusinessEvent({
      accountId: scope.accountId, businessId: scope.businessId, operatingUnitId: scope.operatingUnitId,
      eventType: type, entityType, entityId, actorId: scope.actorId ?? null, metadata
    }, context));

  return Object.freeze({
    createProduct(input, context = {}) {
      const product = createProduct(input, context);
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.products, V4_STORES.businessEvents], 'readwrite', async tx => {
        const business = await tx.get(V4_STORES.businesses, product.businessId);
        if (!business) throw new ScopeValidationError('Product Business does not exist.');
        await tx.add(V4_STORES.products, product);
        await addEvent(tx, { accountId: business.accountId, businessId: business.id, actorId: input.actorId }, 'product.created', 'product', product.id, context);
        return product;
      });
    },
    addIdentifier(input, context = {}) {
      const identifier = createProductIdentifier(input, context);
      return persistence.runTransaction([V4_STORES.products, V4_STORES.productIdentifiers, V4_STORES.businesses, V4_STORES.businessEvents], 'readwrite', async tx => {
        const product = await tx.get(V4_STORES.products, identifier.productId);
        if (!product || product.businessId !== identifier.businessId) throw new ScopeValidationError('Identifier Product scope is invalid.');
        if (identifier.status === 'active') {
          const existing = await tx.getAllByIndex(V4_STORES.productIdentifiers, 'byIdentity', [identifier.businessId, identifier.type, identifier.normalizedValue]);
          if (existing.some(item => item.status === 'active')) throw new ScopeValidationError('Active identifier already exists in this Business.');
        }
        const business = await tx.get(V4_STORES.businesses, identifier.businessId);
        await tx.add(V4_STORES.productIdentifiers, identifier);
        await addEvent(tx, { accountId: business.accountId, businessId: business.id, actorId: input.actorId }, 'product.identifier_added', 'productIdentifier', identifier.id, context);
        return identifier;
      });
    },
    createLocation(input, context = {}) {
      const location = createInventoryLocation(input, context);
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.inventoryLocations], 'readwrite', async tx => {
        if (!await tx.get(V4_STORES.businesses, location.businessId)) throw new ScopeValidationError('Location Business does not exist.');
        if (location.operatingUnitId) {
          const unit = await tx.get(V4_STORES.operatingUnits, location.operatingUnitId);
          if (!unit || unit.businessId !== location.businessId) throw new ScopeValidationError('Location Operating Unit scope is invalid.');
        }
        await tx.add(V4_STORES.inventoryLocations, location); return location;
      });
    },
    createOwnership(input, context = {}) {
      const ownership = createInventoryOwnership(input, context);
      return persistence.runTransaction([V4_STORES.businesses, V4_STORES.inventoryOwnerships], 'readwrite', async tx => {
        if (!await tx.get(V4_STORES.businesses, ownership.businessId)) throw new ScopeValidationError('Ownership Business does not exist.');
        await tx.add(V4_STORES.inventoryOwnerships, ownership); return ownership;
      });
    },
    recordMovement(input, costInput = null, context = {}) {
      const movement = createInventoryMovement(input, context);
      const stores = [V4_STORES.products, V4_STORES.inventoryLocations, V4_STORES.inventoryOwnerships,
        V4_STORES.operatingUnits, V4_STORES.businesses, V4_STORES.inventoryMovements,
        V4_STORES.inventoryCostLayers, V4_STORES.businessEvents];
      return persistence.runTransaction(stores, 'readwrite', async tx => {
        const { location } = await validateMovement(tx, movement);
        await enforceNegativePolicy(tx, movement, location);
        const business = await tx.get(V4_STORES.businesses, movement.businessId);
        await tx.add(V4_STORES.inventoryMovements, movement);
        let costLayer = null;
        if (costInput) {
          if (movement.signedQuantity <= 0) throw new TypeError('Cost layers require an inbound movement.');
          costLayer = createInventoryCostLayer({ ...costInput, businessId: movement.businessId,
            productId: movement.productId, movementId: movement.id, ownershipId: movement.ownershipId,
            quantityReceived: movement.quantity, receivedAt: movement.transactionAt }, context);
          await tx.add(V4_STORES.inventoryCostLayers, costLayer);
        }
        const eventType = movement.reversalOfId ? 'inventory.reversed' :
          movement.movementType === 'opening' ? 'inventory.opened' :
          movement.movementType.includes('adjustment') ? 'inventory.adjusted' : 'inventory.received';
        await addEvent(tx, { accountId: business.accountId, businessId: business.id,
          operatingUnitId: movement.operatingUnitId, actorId: movement.actorId }, eventType,
          'inventoryMovement', movement.id, context, { movementType: movement.movementType });
        return { movement, costLayer };
      });
    },
    async stock(query) {
      const movements = await persistence.getAll(V4_STORES.inventoryMovements);
      const ownerships = new Map((await persistence.getAll(V4_STORES.inventoryOwnerships)).map(item => [item.id, item]));
      const filtered = movements.filter(item => item.status === 'active' && item.businessId === query.businessId &&
        (!query.productId || item.productId === query.productId) &&
        (!query.inventoryLocationId || item.inventoryLocationId === query.inventoryLocationId) &&
        (!query.operatingUnitId || item.operatingUnitId === query.operatingUnitId) &&
        (!query.ownershipType || ownerships.get(item.ownershipId)?.type === query.ownershipType));
      const quantity = filtered.reduce((sum, item) => sum + item.signedQuantity, 0);
      return { quantity, negative: quantity < 0, movementCount: filtered.length };
    },
    async weightedAverageCost(query) {
      const ownerships = new Map((await persistence.getAll(V4_STORES.inventoryOwnerships)).map(item => [item.id, item]));
      const layers = (await persistence.getAll(V4_STORES.inventoryCostLayers)).filter(layer =>
        layer.status === 'active' && layer.businessId === query.businessId && layer.productId === query.productId &&
        (!query.ownershipType || ownerships.get(layer.ownershipId)?.type === query.ownershipType));
      if (layers.some(layer => layer.costStatus !== 'known')) return { unitCostMinor: null, costStatus: 'unknown' };
      const quantity = layers.reduce((sum, layer) => sum + layer.quantityReceived, 0);
      const total = layers.reduce((sum, layer) => sum + layer.quantityReceived * layer.unitCostMinor, 0);
      return { unitCostMinor: quantity ? Math.round(total / quantity) : null, costStatus: quantity ? 'known' : 'unavailable' };
    },
    transfer(input, context = {}) {
      const transferId = input.transferId || createUuidV7(context.uuidOptions);
      const outMovement = createInventoryMovement({ ...input, inventoryLocationId: input.fromLocationId,
        operatingUnitId: input.fromOperatingUnitId, movementType: 'transfer_out', transferId }, context);
      const inMovement = createInventoryMovement({ ...input, id: undefined, inventoryLocationId: input.toLocationId,
        operatingUnitId: input.toOperatingUnitId, movementType: 'transfer_in', transferId }, context);
      const stores = [V4_STORES.products, V4_STORES.inventoryLocations, V4_STORES.inventoryOwnerships,
        V4_STORES.operatingUnits, V4_STORES.businesses, V4_STORES.inventoryMovements, V4_STORES.businessEvents];
      return persistence.runTransaction(stores, 'readwrite', async tx => {
        const { location: fromLocation } = await validateMovement(tx, outMovement);
        await validateMovement(tx, inMovement);
        await enforceNegativePolicy(tx, outMovement, fromLocation);
        if (outMovement.businessId !== inMovement.businessId || outMovement.signedQuantity + inMovement.signedQuantity !== 0) {
          throw new ScopeValidationError('Transfer must remain within one Business and net to zero.');
        }
        await tx.add(V4_STORES.inventoryMovements, outMovement);
        if (input.deliberateFailure) throw new Error('Deliberate transfer rollback');
        await tx.add(V4_STORES.inventoryMovements, inMovement);
        const business = await tx.get(V4_STORES.businesses, input.businessId);
        await addEvent(tx, { accountId: business.accountId, businessId: business.id,
          operatingUnitId: input.fromOperatingUnitId, actorId: input.actorId }, 'inventory.transferred',
          'inventoryTransfer', transferId, context, { outMovementId: outMovement.id, inMovementId: inMovement.id });
        return { transferId, outMovement, inMovement };
      });
    }
  });
}
