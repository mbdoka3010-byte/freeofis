import { V4_STORES } from './schema.mjs';
import {
  createAccount,
  createBusiness,
  createOperatingUnit,
  createLegacyMapping,
  createBusinessEvent
} from '../domain/entities.mjs';

export const LEGACY_BOOTSTRAP_META_KEY = 'legacyV3ScopeBootstrap';

export class ScopeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScopeValidationError';
  }
}

export function createV4Repositories(persistence) {
  if (!persistence?.runTransaction) {
    throw new TypeError('A V4 persistence adapter is required.');
  }

  return Object.freeze({
    getAccount: id => persistence.get(V4_STORES.accounts, id),
    getBusiness: id => persistence.get(V4_STORES.businesses, id),
    getOperatingUnit: id => persistence.get(V4_STORES.operatingUnits, id),
    listBusinesses: accountId => persistence.runTransaction(
      [V4_STORES.businesses],
      'readonly',
      tx => tx.getAllByIndex(V4_STORES.businesses, 'byAccountId', accountId)
    ),
    listOperatingUnits: businessId => persistence.runTransaction(
      [V4_STORES.operatingUnits],
      'readonly',
      tx => tx.getAllByIndex(V4_STORES.operatingUnits, 'byBusinessId', businessId)
    ),

    createAccount: (input, context) => {
      const account = createAccount(input, context);
      return persistence.add(V4_STORES.accounts, account).then(() => account);
    },

    createBusiness: (input, context) => {
      const business = createBusiness(input, context);
      return persistence.runTransaction(
        [V4_STORES.accounts, V4_STORES.businesses],
        'readwrite',
        async tx => {
          if (!await tx.get(V4_STORES.accounts, business.accountId)) {
            throw new ScopeValidationError('Business account does not exist.');
          }
          await tx.add(V4_STORES.businesses, business);
          return business;
        }
      );
    },

    createOperatingUnit: (input, context) => {
      const unit = createOperatingUnit(input, context);
      return persistence.runTransaction(
        [V4_STORES.businesses, V4_STORES.operatingUnits],
        'readwrite',
        async tx => {
          if (!await tx.get(V4_STORES.businesses, unit.businessId)) {
            throw new ScopeValidationError('OperatingUnit business does not exist.');
          }
          await tx.add(V4_STORES.operatingUnits, unit);
          return unit;
        }
      );
    },

    createBusinessEvent: (input, context) => {
      const event = createBusinessEvent(input, context);
      return persistence.runTransaction(
        [V4_STORES.accounts, V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.businessEvents],
        'readwrite',
        async tx => {
          if (!await tx.get(V4_STORES.accounts, event.accountId)) {
            throw new ScopeValidationError('BusinessEvent account does not exist.');
          }
          if (event.businessId) {
            const business = await tx.get(V4_STORES.businesses, event.businessId);
            if (!business || business.accountId !== event.accountId) {
              throw new ScopeValidationError('BusinessEvent business scope is invalid.');
            }
          }
          if (event.operatingUnitId) {
            const unit = await tx.get(V4_STORES.operatingUnits, event.operatingUnitId);
            if (!unit || unit.businessId !== event.businessId) {
              throw new ScopeValidationError('BusinessEvent operating-unit scope is invalid.');
            }
          }
          await tx.add(V4_STORES.businessEvents, event);
          return event;
        }
      );
    },

    getLegacyMapping: (sourceSystem, sourceEntityType, sourceId) =>
      persistence.runTransaction(
        [V4_STORES.legacyMappings],
        'readonly',
        tx => tx.getByIndex(
          V4_STORES.legacyMappings,
          'bySourceIdentity',
          [sourceSystem, sourceEntityType, sourceId]
        )
      ),

    createLegacyMapping: (input, context) => {
      const mapping = createLegacyMapping(input, context);
      return persistence.runTransaction(
        [V4_STORES.businesses, V4_STORES.operatingUnits, V4_STORES.legacyMappings],
        'readwrite',
        async tx => {
          if (mapping.businessId) {
            const business = await tx.get(V4_STORES.businesses, mapping.businessId);
            if (!business) {
              throw new ScopeValidationError('Legacy mapping business does not exist.');
            }
          }
          if (mapping.operatingUnitId) {
            const unit = await tx.get(V4_STORES.operatingUnits, mapping.operatingUnitId);
            if (!unit || unit.businessId !== mapping.businessId) {
              throw new ScopeValidationError('Legacy mapping operating-unit scope is invalid.');
            }
          }
          const existing = await tx.getByIndex(
            V4_STORES.legacyMappings,
            'bySourceIdentity',
            [mapping.sourceSystem, mapping.sourceEntityType, mapping.sourceId]
          );
          if (existing) {
            if (
              existing.targetEntityType !== mapping.targetEntityType ||
              existing.targetId !== mapping.targetId
            ) {
              throw new ScopeValidationError('Legacy source is already mapped to a different target.');
            }
            return existing;
          }
          await tx.add(V4_STORES.legacyMappings, mapping);
          return mapping;
        }
      );
    }
  });
}

export async function bootstrapLegacyV3Scope(persistence, options = {}, context = {}) {
  const stores = [
    V4_STORES.accounts,
    V4_STORES.businesses,
    V4_STORES.operatingUnits,
    V4_STORES.businessEvents,
    V4_STORES.meta
  ];

  return persistence.runTransaction(stores, 'readwrite', async tx => {
    const existing = await tx.get(V4_STORES.meta, LEGACY_BOOTSTRAP_META_KEY);
    if (existing?.status === 'completed') {
      const account = await tx.get(V4_STORES.accounts, existing.accountId);
      const business = await tx.get(V4_STORES.businesses, existing.businessId);
      const operatingUnit = await tx.get(V4_STORES.operatingUnits, existing.operatingUnitId);
      if (!account || !business || !operatingUnit) {
        throw new ScopeValidationError('Legacy bootstrap metadata references missing scope records.');
      }
      return { account, business, operatingUnit, created: false };
    }

    const account = createAccount({
      name: options.accountName || 'Free Ofis Account',
      provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
    }, context);
    const business = createBusiness({
      accountId: account.id,
      name: options.businessName || 'My Business',
      type: options.businessType || 'other',
      defaultCurrency: options.defaultCurrency || 'NGN',
      timezone: options.timezone || 'Africa/Lagos',
      provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
    }, context);
    const operatingUnit = createOperatingUnit({
      businessId: business.id,
      name: options.operatingUnitName || 'Main Operating Unit',
      type: options.operatingUnitType || 'other',
      provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
    }, context);
    const event = createBusinessEvent({
      accountId: account.id,
      businessId: business.id,
      operatingUnitId: operatingUnit.id,
      eventType: 'legacy.scope.bootstrapped',
      entityType: 'operatingUnit',
      entityId: operatingUnit.id,
      actorId: null,
      actorType: 'unknown_historical',
      provenance: { sourceSystem: 'freeofis-v3', sourceDataVersion: 3 }
    }, context);
    const completedAt = event.eventAt;

    await tx.add(V4_STORES.accounts, account);
    await tx.add(V4_STORES.businesses, business);
    await tx.add(V4_STORES.operatingUnits, operatingUnit);
    await tx.add(V4_STORES.businessEvents, event);
    await tx.add(V4_STORES.meta, {
      key: LEGACY_BOOTSTRAP_META_KEY,
      status: 'completed',
      accountId: account.id,
      businessId: business.id,
      operatingUnitId: operatingUnit.id,
      completedAt,
      sourceDataVersion: 3
    });

    return { account, business, operatingUnit, created: true };
  });
}
