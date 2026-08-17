export const V4_DATABASE_NAME = 'freeofis_v4';
export const V4_DATABASE_VERSION = 1;

export const V4_STORES = Object.freeze({
  accounts: 'accounts',
  businesses: 'businesses',
  operatingUnits: 'operatingUnits',
  legacyMappings: 'legacyMappings',
  businessEvents: 'businessEvents',
  meta: 'meta'
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
  }
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
