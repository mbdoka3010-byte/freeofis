import { createId, timestamp } from '../domain/foundation.mjs';
import { V5_STORES } from '../persistence/schema.mjs';
const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
const digest = async (value, cryptoApi) => hex(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export function createSessionService(persistence, options = {}) {
  const cryptoApi = options.cryptoApi || globalThis.crypto, clock = options.clock || (() => new Date()), ttlMs = options.ttlMs || 8 * 60 * 60 * 1000;
  if (!cryptoApi?.subtle || !cryptoApi?.getRandomValues) throw Error('Web Crypto is required for V5 sessions.');
  return Object.freeze({
    async create(userId) { const user = await persistence.get(V5_STORES.users, userId); if (!user || user.status !== 'active') throw Error('SESSION_USER_INVALID'); const secretBytes = cryptoApi.getRandomValues(new Uint8Array(32)), secret = hex(secretBytes), at = clock(), record = { id: createId({ cryptoApi }), userId, secretHash: await digest(secret, cryptoApi), status: 'active', createdAt: at.toISOString(), expiresAt: new Date(at.getTime() + ttlMs).toISOString() }; await persistence.add(V5_STORES.sessions, record); return { sessionId: record.id, secret, expiresAt: record.expiresAt }; },
    async validate(token) { if (!token?.sessionId || !token?.secret) return null; const session = await persistence.get(V5_STORES.sessions, token.sessionId); if (!session || session.status !== 'active' || new Date(session.expiresAt) <= clock()) return null; if (await digest(token.secret, cryptoApi) !== session.secretHash) return null; const user = await persistence.get(V5_STORES.users, session.userId); return user?.status === 'active' ? { session, user } : null; },
    async revoke(sessionId) { const session = await persistence.get(V5_STORES.sessions, sessionId); if (!session) return false; await persistence.put(V5_STORES.sessions, { ...session, status: 'revoked', revokedAt: timestamp(clock) }); return true; }
  });
}
