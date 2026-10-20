import { describe, expect, it } from 'vitest';
import { createStorageCache, type StorageLike } from '../storage-cache';

function createMemoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() { return map.size; },
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: key => { map.delete(key); },
    key: index => [...map.keys()][index] ?? null,
  };
}

describe('createStorageCache', () => {
  it('stores, retrieves, checks existence, and removes typed values under the configured prefix', () => {
    const storage = createMemoryStorage();
    const cache = createStorageCache({ storage, prefix: 'dm.' });

    expect(cache.get('views', [])).toEqual([]);
    expect(cache.has('views')).toBe(false);

    expect(cache.set('views', [{ id: '1', name: 'Active' }])).toBe(true);
    expect(storage.map.has('dm.views')).toBe(true);
    expect(cache.has('views')).toBe(true);
    expect(cache.get('views')).toEqual([{ id: '1', name: 'Active' }]);

    cache.remove('views');
    expect(cache.has('views')).toBe(false);
    expect(cache.get('views', null)).toBeNull();
  });

  it('expires entries past their TTL and evicts them on read', () => {
    let clock = 1_000;
    const storage = createMemoryStorage();
    const cache = createStorageCache({ storage, defaultTtlMs: 500, now: () => clock });

    cache.set('token', 'abc');
    expect(cache.get('token')).toBe('abc');

    clock = 1_499;
    expect(cache.get('token')).toBe('abc');

    clock = 1_500;
    expect(cache.get('token', 'expired')).toBe('expired');
    expect(storage.map.has('dm.token')).toBe(false);
  });

  it('evicts corrupt JSON or malformed envelopes and returns fallback', () => {
    const storage = createMemoryStorage();
    const cache = createStorageCache({ storage });

    storage.setItem('dm.broken', '{not-json');
    expect(cache.get('broken', 'safe')).toBe('safe');
    expect(storage.getItem('dm.broken')).toBeNull();

    storage.setItem('dm.noEnvelope', JSON.stringify({ wrong: 123 }));
    expect(cache.get('noEnvelope', 'safe')).toBe('safe');
    expect(storage.getItem('dm.noEnvelope')).toBeNull();
  });

  it('supports getOrSet and preserves cached falsy values like false, 0, and empty string', () => {
    const storage = createMemoryStorage();
    const cache = createStorageCache({ storage });
    let calls = 0;

    const first = cache.getOrSet('collapsed', () => { calls++; return false; });
    const second = cache.getOrSet('collapsed', () => { calls++; return true; });

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(calls).toBe(1);
  });

  it('clears only keys matching its prefix', () => {
    const storage = createMemoryStorage();
    storage.setItem('other.key', 'keep');
    const cache = createStorageCache({ storage, prefix: 'dm.' });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(storage.getItem('other.key')).toBe('keep');
  });

  it('degrades gracefully when storage is null or throws QuotaExceededError', () => {
    const nullCache = createStorageCache({ storage: null });
    expect(nullCache.set('k', 'v')).toBe(false);
    expect(nullCache.get('k', 'fallback')).toBe('fallback');
    expect(nullCache.has('k')).toBe(false);

    const throwingStorage: StorageLike = {
      length: 0,
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
      key: () => null,
    };
    const restrictedCache = createStorageCache({ storage: throwingStorage });
    expect(restrictedCache.set('k', 'v')).toBe(false);
    expect(restrictedCache.get('k', 'fallback')).toBe('fallback');
    expect(() => restrictedCache.remove('k')).not.toThrow();
    expect(() => restrictedCache.clear()).not.toThrow();
  });
});
