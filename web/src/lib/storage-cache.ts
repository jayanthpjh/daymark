// Minimal, dependency-free localStorage cache wrapper with namespace scoping, optional TTL,
// corrupt-JSON eviction, and safe no-op fallback when storage is unavailable or quota-blocked.

export interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

export interface CacheOptions {
  /** Key prefix applied to every entry (defaults to `'dm.'` to match Daymark's local keys). */
  prefix?: string;
  /** Default time-to-live in milliseconds when `set()` does not specify one. */
  defaultTtlMs?: number;
  /** Backing storage (defaults to `globalThis.localStorage` when available). */
  storage?: StorageLike | null;
  /** Clock function for deterministic testing (defaults to `Date.now`). */
  now?: () => number;
}

export interface SetOptions {
  /** Entry time-to-live in milliseconds. `0` or negative values expire immediately. */
  ttlMs?: number;
}

interface CacheEnvelope<T> {
  v: T;
  e?: number; // expiration timestamp in ms
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export function createStorageCache(options: CacheOptions = {}) {
  const prefix = options.prefix ?? 'dm.';
  const defaultTtlMs = options.defaultTtlMs;
  const now = options.now ?? Date.now;
  const resolveStorage = (): StorageLike | null =>
    options.storage !== undefined ? options.storage : defaultStorage();

  const fullKey = (key: string) => `${prefix}${key}`;

  function get<T>(key: string, fallback?: T): T | undefined {
    const store = resolveStorage();
    if (!store) return fallback;
    const rawKey = fullKey(key);
    try {
      const raw = store.getItem(rawKey);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw) as CacheEnvelope<T>;
      if (!parsed || typeof parsed !== 'object' || !('v' in parsed)) {
        store.removeItem(rawKey);
        return fallback;
      }
      if (typeof parsed.e === 'number' && now() >= parsed.e) {
        store.removeItem(rawKey);
        return fallback;
      }
      return parsed.v;
    } catch {
      try { store.removeItem(rawKey); } catch { /* ignore private-mode errors */ }
      return fallback;
    }
  }

  function set<T>(key: string, value: T, setOptions?: SetOptions): boolean {
    const store = resolveStorage();
    if (!store) return false;
    const ttl = setOptions?.ttlMs ?? defaultTtlMs;
    if (typeof ttl === 'number' && ttl <= 0) {
      remove(key);
      return false;
    }
    const envelope: CacheEnvelope<T> =
      typeof ttl === 'number' && Number.isFinite(ttl)
        ? { v: value, e: now() + ttl }
        : { v: value };
    try {
      store.setItem(fullKey(key), JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  function has(key: string): boolean {
    const sentinel = Symbol('missing');
    return get<unknown>(key, sentinel) !== sentinel;
  }

  function remove(key: string): void {
    const store = resolveStorage();
    if (!store) return;
    try {
      store.removeItem(fullKey(key));
    } catch {
      /* ignore */
    }
  }

  function getOrSet<T>(key: string, compute: () => T, setOptions?: SetOptions): T {
    const sentinel = Symbol('missing');
    const cached = get<T | symbol>(key, sentinel);
    if (cached !== sentinel) return cached as T;
    const fresh = compute();
    set(key, fresh, setOptions);
    return fresh;
  }

  /** Removes only keys belonging to this cache's prefix, leaving unrelated localStorage keys intact. */
  function clear(): void {
    const store = resolveStorage();
    if (!store) return;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      for (const k of toRemove) store.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  return { get, set, has, remove, getOrSet, clear };
}

export type StorageCache = ReturnType<typeof createStorageCache>;
export const storageCache = createStorageCache();
