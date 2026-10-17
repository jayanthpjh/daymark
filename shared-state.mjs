import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const appendOnlyArrays = new Set(['activity', 'answerHistory', 'versions', 'changes', 'approvedAdditions', 'reviewHistory', 'statusHistory', 'mailEvents']);
const keyFields = ['id', 'jobId', 'messageId', 'label', 'version'];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertState(value) {
  if (!object(value) || !Array.isArray(value.jobs) || !Array.isArray(value.tasks) || !Array.isArray(value.applications) || !object(value.profile)) {
    throw new Error('Daymark saved state has an invalid structure. The file was left untouched.');
  }
  return value;
}

function identity(value) {
  if (!object(value)) return null;
  for (const field of keyFields) if (value[field] !== undefined && value[field] !== null) return `${field}:${value[field]}`;
  return null;
}

function mergeAppendOnly(base, draft, latest) {
  const result = clone(latest);
  const known = new Set(result.map(item => JSON.stringify(item)));
  for (const item of draft) {
    const serialized = JSON.stringify(item);
    if (!known.has(serialized)) {
      result.push(clone(item));
      known.add(serialized);
    }
  }
  return result.slice(-Math.max(80, base.length, draft.length, latest.length));
}

function mergeKeyedArray(key, base, draft, latest) {
  const baseMap = new Map(base.map(item => [identity(item), item]).filter(([id]) => id));
  const draftMap = new Map(draft.map(item => [identity(item), item]).filter(([id]) => id));
  const latestMap = new Map(latest.map(item => [identity(item), item]).filter(([id]) => id));
  if ([...base, ...draft, ...latest].some(item => !identity(item))) return null;

  const order = [...latest.map(identity), ...draft.map(identity).filter(id => !latestMap.has(id))];
  const output = [];
  for (const id of order) {
    const before = baseMap.get(id);
    const proposed = draftMap.get(id);
    const current = latestMap.get(id);
    if (!proposed) {
      if (before && current && equal(current, before)) continue;
      if (current) output.push(clone(current));
      continue;
    }
    if (!before || !current) {
      output.push(clone(proposed || current));
      continue;
    }
    output.push(mergeValue(id, before, proposed, current));
  }
  return output;
}

function mergeValue(key, base, draft, latest) {
  if (equal(draft, base)) return clone(latest);
  if (equal(latest, base)) return clone(draft);
  if (Array.isArray(base) && Array.isArray(draft) && Array.isArray(latest)) {
    if (appendOnlyArrays.has(key)) return mergeAppendOnly(base, draft, latest);
    const keyed = mergeKeyedArray(key, base, draft, latest);
    return keyed || clone(draft);
  }
  if (object(base) && object(draft) && object(latest)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(draft), ...Object.keys(latest)]);
    for (const child of keys) {
      const before = base[child];
      const proposed = draft[child];
      const current = latest[child];
      const hasBefore = Object.hasOwn(base, child);
      const hasProposed = Object.hasOwn(draft, child);
      const hasCurrent = Object.hasOwn(latest, child);
      if (!hasProposed) {
        if (hasBefore && hasCurrent && equal(current, before)) continue;
        if (hasCurrent) result[child] = clone(current);
        continue;
      }
      if (!hasBefore) {
        result[child] = hasCurrent && !equal(proposed, current) && object(proposed) && object(current)
          ? mergeValue(child, {}, proposed, current)
          : clone(proposed);
        continue;
      }
      if (!hasCurrent) {
        if (!equal(proposed, before)) result[child] = clone(proposed);
        continue;
      }
      result[child] = mergeValue(child, before, proposed, current);
    }
    return result;
  }
  return clone(draft);
}

export function mergeStateSnapshots(base, draft, latest) {
  return mergeValue('', base, draft, latest);
}

async function acquireFileLock(file, { timeoutMs = 15_000, staleMs = 30_000 } = {}) {
  const started = Date.now();
  const token = `${process.pid}:${randomUUID()}`;
  while (Date.now() - started < timeoutMs) {
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      await handle.writeFile(token);
      await handle.close();
      let refreshing = false;
      const refresh = setInterval(async () => {
        if (refreshing) return;
        refreshing = true;
        try {
          if (await fs.readFile(file, 'utf8') === token) {
            const now = new Date();
            await fs.utimes(file, now, now);
          }
        } catch {}
        finally { refreshing = false; }
      }, Math.max(1000, Math.floor(staleMs / 3)));
      refresh.unref?.();
      return async () => {
        clearInterval(refresh);
        if (await fs.readFile(file, 'utf8').catch(() => '') === token) await fs.unlink(file).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) continue;
      if (Date.now() - stat.mtimeMs > staleMs) {
        await fs.unlink(file).catch(() => {});
        continue;
      }
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }
  throw new Error('Daymark state is busy in another process. Retry the last action.');
}

export function createSharedJsonStore(file) {
  const snapshots = new WeakMap();
  const snapshotRevisions = new WeakMap();
  let lastKnownRevision = 0;
  let localWrites = Promise.resolve();

  async function read() {
    const value = assertState(JSON.parse(await fs.readFile(file, 'utf8')));
    const revision = value._stateRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || (lastKnownRevision > 0 && revision < lastKnownRevision)) {
      throw new Error('Daymark saved state revision moved backwards. The file was left untouched.');
    }
    lastKnownRevision = Math.max(lastKnownRevision, revision);
    snapshots.set(value, clone(value));
    snapshotRevisions.set(value, revision);
    return value;
  }

  function write(value) {
    const writeOperation = localWrites.catch(() => {}).then(async () => {
      assertState(value);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const release = await acquireFileLock(`${file}.lock`);
      let temporary;
      try {
        const base = snapshots.get(value);
        const baseRevision = snapshotRevisions.get(value) ?? base?._stateRevision ?? 0;
        let latest;
        try {
          latest = assertState(JSON.parse(await fs.readFile(file, 'utf8')));
          const revision = latest._stateRevision ?? 0;
          if (!Number.isSafeInteger(revision) || revision < 0 || revision < Math.max(baseRevision, lastKnownRevision)) {
            throw new Error('state revision moved backwards');
          }
        } catch (error) {
          if (error.code === 'ENOENT' && !base) latest = null;
          else if (error.code === 'ENOENT') throw new Error('Daymark cannot safely update missing state; reload state before retrying.', { cause: error });
          else throw new Error('Daymark cannot safely update unreadable state; the saved file was left untouched.', { cause: error });
        }
        if (latest && !base) throw new Error('Daymark state changed during initialization; reload state before retrying.');
        const merged = assertState(base && latest ? mergeStateSnapshots(base, value, latest) : clone(value));
        merged._stateRevision = Math.max(baseRevision, Number(latest?._stateRevision || 0), lastKnownRevision) + 1;
        temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
        const handle = await fs.open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify(merged, null, 2));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temporary, file);
        temporary = undefined;
        await fs.chmod(file, 0o600);
        try {
          const directory = await fs.open(path.dirname(file), 'r');
          try { await directory.sync(); } finally { await directory.close(); }
        } catch {}
        for (const key of Object.keys(value)) delete value[key];
        Object.assign(value, merged);
        snapshots.set(value, clone(merged));
        snapshotRevisions.set(value, merged._stateRevision);
        lastKnownRevision = merged._stateRevision;
        return value;
      } finally {
        if (temporary) await fs.unlink(temporary).catch(() => {});
        await release();
      }
    });
    localWrites = writeOperation;
    return writeOperation;
  }

  return { read, write };
}
