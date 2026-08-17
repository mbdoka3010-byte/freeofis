import {
  V4_DATABASE_NAME,
  V4_DATABASE_VERSION,
  applyV4SchemaUpgrade
} from './schema.mjs';

export class V4PersistenceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'V4PersistenceError';
    this.code = options.code || 'V4_PERSISTENCE_ERROR';
  }
}

function requestResult(request, operation) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      new V4PersistenceError(`IndexedDB ${operation} failed.`, {
        code: 'V4_REQUEST_FAILED',
        cause: request.error
      })
    );
  });
}

function createTransactionContext(transaction) {
  const store = name => transaction.objectStore(name);

  return Object.freeze({
    get: (storeName, key) => requestResult(store(storeName).get(key), 'get'),
    getAll: storeName => requestResult(store(storeName).getAll(), 'getAll'),
    getAllByIndex: (storeName, indexName, query) =>
      requestResult(store(storeName).index(indexName).getAll(query), 'index getAll'),
    getByIndex: (storeName, indexName, query) =>
      requestResult(store(storeName).index(indexName).get(query), 'index get'),
    add: (storeName, value) => requestResult(store(storeName).add(value), 'add'),
    put: (storeName, value) => requestResult(store(storeName).put(value), 'put'),
    delete: (storeName, key) => requestResult(store(storeName).delete(key), 'delete')
  });
}

export function openV4Database(indexedDbFactory = globalThis.indexedDB) {
  if (!indexedDbFactory) {
    return Promise.reject(new V4PersistenceError(
      'IndexedDB is unavailable in this environment.',
      { code: 'V4_INDEXEDDB_UNAVAILABLE' }
    ));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDbFactory.open(V4_DATABASE_NAME, V4_DATABASE_VERSION);

    request.onupgradeneeded = event => {
      try {
        applyV4SchemaUpgrade(request.result, request.transaction, event.oldVersion);
      } catch (error) {
        request.transaction.abort();
        reject(new V4PersistenceError('V4 database upgrade failed.', {
          code: 'V4_UPGRADE_FAILED',
          cause: error
        }));
      }
    };

    request.onblocked = () => reject(new V4PersistenceError(
      'V4 database upgrade is blocked by another open Free Ofis tab.',
      { code: 'V4_OPEN_BLOCKED' }
    ));
    request.onerror = () => reject(new V4PersistenceError(
      'V4 database could not be opened.',
      { code: 'V4_OPEN_FAILED', cause: request.error }
    ));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export class IndexedDbPersistence {
  constructor(database) {
    if (!database) throw new TypeError('An open IndexedDB database is required.');
    this.database = database;
  }

  static async open(indexedDbFactory) {
    return new IndexedDbPersistence(await openV4Database(indexedDbFactory));
  }

  close() {
    this.database.close();
  }

  runTransaction(storeNames, mode, work) {
    const names = [...new Set(Array.isArray(storeNames) ? storeNames : [storeNames])];
    if (!names.length) return Promise.reject(new TypeError('At least one store is required.'));
    if (!['readonly', 'readwrite'].includes(mode)) {
      return Promise.reject(new TypeError('Transaction mode must be readonly or readwrite.'));
    }

    return new Promise((resolve, reject) => {
      let transaction;
      let workResult;
      let workError;

      try {
        transaction = this.database.transaction(names, mode);
      } catch (error) {
        reject(new V4PersistenceError('V4 transaction could not start.', {
          code: 'V4_TRANSACTION_START_FAILED',
          cause: error
        }));
        return;
      }

      transaction.oncomplete = () => resolve(workResult);
      transaction.onabort = () => reject(workError || new V4PersistenceError(
        'V4 transaction was aborted.',
        { code: 'V4_TRANSACTION_ABORTED', cause: transaction.error }
      ));
      transaction.onerror = () => {
        // The abort handler is the single rejection path.
      };

      try {
        const pending = work(createTransactionContext(transaction));
        Promise.resolve(pending).then(
          value => {
            workResult = value;
          },
          error => {
            workError = error;
            try {
              transaction.abort();
            } catch {
              reject(error);
            }
          }
        );
      } catch (error) {
        workError = error;
        try {
          transaction.abort();
        } catch {
          reject(error);
        }
      }
    });
  }

  get(storeName, key) {
    return this.runTransaction([storeName], 'readonly', tx => tx.get(storeName, key));
  }

  getAll(storeName) {
    return this.runTransaction([storeName], 'readonly', tx => tx.getAll(storeName));
  }

  put(storeName, value) {
    return this.runTransaction([storeName], 'readwrite', tx => tx.put(storeName, value));
  }

  add(storeName, value) {
    return this.runTransaction([storeName], 'readwrite', tx => tx.add(storeName, value));
  }
}
