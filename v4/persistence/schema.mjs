export const V4_DATABASE_NAME = 'freeofis_v4';
export const V4_DATABASE_VERSION = 4;

export const V4_STORES = Object.freeze({
  accounts: 'accounts',
  businesses: 'businesses',
  operatingUnits: 'operatingUnits',
  legacyMappings: 'legacyMappings',
  businessEvents: 'businessEvents',
  meta: 'meta',
  users: 'users',
  businessMemberships: 'businessMemberships',
  roles: 'roles',
  permissions: 'permissions',
  roleAssignments: 'roleAssignments',
  approvals: 'approvals',
  products: 'products',
  productIdentifiers: 'productIdentifiers',
  inventoryLocations: 'inventoryLocations',
  inventoryMovements: 'inventoryMovements',
  inventoryCostLayers: 'inventoryCostLayers',
  inventoryOwnerships: 'inventoryOwnerships', suppliers: 'suppliers',
  procurementAgreements: 'procurementAgreements', purchaseOrders: 'purchaseOrders',
  purchaseOrderLines: 'purchaseOrderLines', goodsReceipts: 'goodsReceipts',
  goodsReceiptLines: 'goodsReceiptLines', supplierInvoices: 'supplierInvoices',
  supplierInvoiceLines: 'supplierInvoiceLines', supplierPayments: 'supplierPayments',
  supplierPaymentAllocations: 'supplierPaymentAllocations', purchaseReturns: 'purchaseReturns',
  purchaseReturnLines: 'purchaseReturnLines'
});

export const V4_STORE_DEFINITIONS = Object.freeze([
  {
    name: V4_STORES.accounts,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byStatus', keyPath: 'status', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.businesses,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byAccountId', keyPath: 'accountId', options: { unique: false } },
      {
        name: 'byAccountAndStatus',
        keyPath: ['accountId', 'status'],
        options: { unique: false }
      }
    ]
  },
  {
    name: V4_STORES.operatingUnits,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      {
        name: 'byBusinessAndType',
        keyPath: ['businessId', 'type'],
        options: { unique: false }
      },
      {
        name: 'byBusinessAndStatus',
        keyPath: ['businessId', 'status'],
        options: { unique: false }
      }
    ]
  },
  {
    name: V4_STORES.legacyMappings,
    options: { keyPath: 'id' },
    indexes: [
      {
        name: 'bySourceIdentity',
        keyPath: ['sourceSystem', 'sourceEntityType', 'sourceId'],
        options: { unique: true }
      },
      {
        name: 'byTargetIdentity',
        keyPath: ['targetEntityType', 'targetId'],
        options: { unique: true }
      },
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.businessEvents,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byAccountId', keyPath: 'accountId', options: { unique: false } },
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      {
        name: 'byBusinessAndEventAt',
        keyPath: ['businessId', 'eventAt'],
        options: { unique: false }
      },
      { name: 'byOperatingUnitId', keyPath: 'operatingUnitId', options: { unique: false } },
      { name: 'byEventType', keyPath: 'eventType', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.meta,
    options: { keyPath: 'key' },
    indexes: []
  },
  {
    name: V4_STORES.users,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byStatus', keyPath: 'status', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.businessMemberships,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byUserId', keyPath: 'userId', options: { unique: false } },
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      {
        name: 'byUserAndBusiness',
        keyPath: ['userId', 'businessId'],
        options: { unique: true }
      }
    ]
  },
  {
    name: V4_STORES.roles,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      {
        name: 'byBusinessAndCode',
        keyPath: ['businessId', 'code'],
        options: { unique: true }
      }
    ]
  },
  {
    name: V4_STORES.permissions,
    options: { keyPath: 'code' },
    indexes: [
      { name: 'byModule', keyPath: 'module', options: { unique: false } },
      { name: 'byStatus', keyPath: 'status', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.roleAssignments,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byMembershipId', keyPath: 'membershipId', options: { unique: false } },
      { name: 'byRoleId', keyPath: 'roleId', options: { unique: false } },
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.approvals,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      {
        name: 'byBusinessAndStatus',
        keyPath: ['businessId', 'status'],
        options: { unique: false }
      },
      { name: 'byOperatingUnitId', keyPath: 'operatingUnitId', options: { unique: false } },
      { name: 'byRequestedByUserId', keyPath: 'requestedByUserId', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.products, options: { keyPath: 'id' }, indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      { name: 'byBusinessAndStatus', keyPath: ['businessId', 'status'], options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.productIdentifiers, options: { keyPath: 'id' }, indexes: [
      { name: 'byProductId', keyPath: 'productId', options: { unique: false } },
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      { name: 'byIdentity', keyPath: ['businessId', 'type', 'normalizedValue'], options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.inventoryLocations, options: { keyPath: 'id' }, indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      { name: 'byOperatingUnitId', keyPath: 'operatingUnitId', options: { unique: false } }
    ]
  },
  {
    name: V4_STORES.inventoryMovements, options: { keyPath: 'id' }, indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      { name: 'byProductId', keyPath: 'productId', options: { unique: false } },
      { name: 'byLocationId', keyPath: 'inventoryLocationId', options: { unique: false } },
      { name: 'byOperatingUnitId', keyPath: 'operatingUnitId', options: { unique: false } },
      { name: 'byTransferId', keyPath: 'transferId', options: { unique: false } },
      { name: 'byReversalOfId', keyPath: 'reversalOfId', options: { unique: true } }
    ]
  },
  {
    name: V4_STORES.inventoryCostLayers, options: { keyPath: 'id' }, indexes: [
      { name: 'byBusinessAndProduct', keyPath: ['businessId', 'productId'], options: { unique: false } },
      { name: 'byMovementId', keyPath: 'movementId', options: { unique: true } }
    ]
  },
  {
    name: V4_STORES.inventoryOwnerships, options: { keyPath: 'id' }, indexes: [
      { name: 'byBusinessId', keyPath: 'businessId', options: { unique: false } },
      { name: 'byType', keyPath: ['businessId', 'type'], options: { unique: false } }
    ]
  },
  ...[
    ['suppliers',[['byBusinessId','businessId'],['byBusinessAndStatus',['businessId','status']]]],
    ['procurementAgreements',[['bySupplierId','supplierId'],['byBusinessId','businessId']]],
    ['purchaseOrders',[['bySupplierId','supplierId'],['byBusinessId','businessId'],['byOperatingUnitId','operatingUnitId'],['byTransactionAt','transactionAt']]],
    ['purchaseOrderLines',[['byPurchaseOrderId','purchaseOrderId'],['byProductId','productId']]],
    ['goodsReceipts',[['bySupplierId','supplierId'],['byBusinessId','businessId'],['byOperatingUnitId','operatingUnitId'],['byTransactionAt','transactionAt']]],
    ['goodsReceiptLines',[['byGoodsReceiptId','goodsReceiptId'],['byProductId','productId']]],
    ['supplierInvoices',[['bySupplierId','supplierId'],['byBusinessId','businessId'],['byStatus','status'],['byTransactionAt','transactionAt']]],
    ['supplierInvoiceLines',[['bySupplierInvoiceId','supplierInvoiceId'],['byProductId','productId']]],
    ['supplierPayments',[['bySupplierId','supplierId'],['byBusinessId','businessId'],['byTransactionAt','transactionAt']]],
    ['supplierPaymentAllocations',[['byPaymentId','paymentId'],['byInvoiceId','invoiceId']]],
    ['purchaseReturns',[['bySupplierId','supplierId'],['byGoodsReceiptId','goodsReceiptId'],['byTransactionAt','transactionAt']]],
    ['purchaseReturnLines',[['byPurchaseReturnId','purchaseReturnId'],['byGoodsReceiptLineId','goodsReceiptLineId']]]
  ].map(([name,indexes])=>({name:V4_STORES[name],options:{keyPath:'id'},indexes:indexes.map(([indexName,keyPath])=>({name:indexName,keyPath,options:{unique:false}}))}))
]);

function hasName(collection, name) {
  return typeof collection?.contains === 'function'
    ? collection.contains(name)
    : Array.from(collection || []).includes(name);
}

export function applyV4SchemaUpgrade(database, upgradeTransaction) {
  for (const definition of V4_STORE_DEFINITIONS) {
    const store = hasName(database.objectStoreNames, definition.name)
      ? upgradeTransaction.objectStore(definition.name)
      : database.createObjectStore(definition.name, definition.options);

    for (const index of definition.indexes) {
      if (!hasName(store.indexNames, index.name)) {
        store.createIndex(index.name, index.keyPath, index.options);
      }
    }
  }
}
