import { V4_STORE_DEFINITIONS } from '../../v4/persistence/schema.mjs';

const clone = value => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

function keyToken(value) {
  return JSON.stringify(value);
}

function valueAtKeyPath(record, keyPath) {
  return Array.isArray(keyPath)
    ? keyPath.map(key => record[key])
    : record[keyPath];
}

export class MemoryV4Persistence {
  constructor(definitions = V4_STORE_DEFINITIONS) {
    this.definitions = new Map(definitions.map(definition => [definition.name, definition]));
    this.data = new Map(definitions.map(definition => [definition.name, new Map()]));
  }

  #store(data, storeName) {
    const store = data.get(storeName);
    if (!store) throw new Error(`Unknown store: ${storeName}`);
    return store;
  }

  #primaryKey(storeName, record) {
    const definition = this.definitions.get(storeName);
    return valueAtKeyPath(record, definition.options.keyPath);
  }

  #assertUnique(data, storeName, record, replacingKey = undefined) {
    const definition = this.definitions.get(storeName);
    const store = this.#store(data, storeName);
    for (const index of definition.indexes.filter(candidate => candidate.options?.unique)) {
      const candidateValue = valueAtKeyPath(record, index.keyPath);
      if (
        candidateValue === undefined || candidateValue === null ||
        (Array.isArray(candidateValue) && candidateValue.some(value => value === undefined || value === null))
      ) continue;
      const candidate = keyToken(candidateValue);
      for (const [key, existing] of store) {
        if (key === replacingKey) continue;
        const existingValue = valueAtKeyPath(existing, index.keyPath);
        if (existingValue !== undefined && keyToken(existingValue) === candidate) {
          throw new Error(`Unique index violation: ${storeName}.${index.name}`);
        }
      }
    }
  }

  #context(data, mode, declaredStoreNames) {
    const writable = mode === 'readwrite';
    const declared = new Set(declaredStoreNames);
    const assertDeclared = storeName => {
      if (!declared.has(storeName)) {
        throw new Error(`Store not in transaction: ${storeName}`);
      }
    };
    const store = storeName => {
      assertDeclared(storeName);
      return this.#store(data, storeName);
    };
    return {
      get: async (storeName, key) => clone(store(storeName).get(keyToken(key))),
      getAll: async storeName => clone([...store(storeName).values()]),
      getByIndex: async (storeName, indexName, query) => {
        assertDeclared(storeName);
        const definition = this.definitions.get(storeName);
        const index = definition.indexes.find(candidate => candidate.name === indexName);
        if (!index) throw new Error(`Unknown index: ${storeName}.${indexName}`);
        const match = [...store(storeName).values()].find(
          record => keyToken(valueAtKeyPath(record, index.keyPath)) === keyToken(query)
        );
        return clone(match);
      },
      getAllByIndex: async (storeName, indexName, query) => {
        assertDeclared(storeName);
        const definition = this.definitions.get(storeName);
        const index = definition.indexes.find(candidate => candidate.name === indexName);
        if (!index) throw new Error(`Unknown index: ${storeName}.${indexName}`);
        return clone([...store(storeName).values()].filter(
          record => keyToken(valueAtKeyPath(record, index.keyPath)) === keyToken(query)
        ));
      },
      add: async (storeName, value) => {
        assertDeclared(storeName);
        if (!writable) throw new Error('Readonly transaction cannot add.');
        const record = clone(value);
        const key = keyToken(this.#primaryKey(storeName, record));
        const target = store(storeName);
        if (target.has(key)) throw new Error(`Duplicate key in ${storeName}`);
        this.#assertUnique(data, storeName, record);
        target.set(key, record);
        return this.#primaryKey(storeName, record);
      },
      put: async (storeName, value) => {
        assertDeclared(storeName);
        if (!writable) throw new Error('Readonly transaction cannot put.');
        const record = clone(value);
        const key = keyToken(this.#primaryKey(storeName, record));
        this.#assertUnique(data, storeName, record, key);
        store(storeName).set(key, record);
        return this.#primaryKey(storeName, record);
      },
      delete: async (storeName, key) => {
        assertDeclared(storeName);
        if (!writable) throw new Error('Readonly transaction cannot delete.');
        store(storeName).delete(keyToken(key));
      }
    };
  }

  async runTransaction(storeNames, mode, work) {
    const names = [...new Set(Array.isArray(storeNames) ? storeNames : [storeNames])];
    names.forEach(name => this.#store(this.data, name));
    const transactionData = mode === 'readwrite'
      ? new Map([...this.data].map(([name, store]) => [
          name,
          new Map([...store].map(([key, value]) => [key, clone(value)]))
        ]))
      : this.data;

    const result = await work(this.#context(transactionData, mode, names));
    if (mode === 'readwrite') this.data = transactionData;
    return result;
  }

  get(storeName, key) {
    return this.runTransaction([storeName], 'readonly', tx => tx.get(storeName, key));
  }

  getAll(storeName) {
    return this.runTransaction([storeName], 'readonly', tx => tx.getAll(storeName));
  }

  add(storeName, value) {
    return this.runTransaction([storeName], 'readwrite', tx => tx.add(storeName, value));
  }

  put(storeName, value) {
    return this.runTransaction([storeName], 'readwrite', tx => tx.put(storeName, value));
  }
}
