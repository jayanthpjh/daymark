import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function acquireWorkerLock(directory, { pid = process.pid, timeoutMs = 15_000, staleMs = 30_000, heartbeatMs = Math.max(1000, Math.floor(staleMs / 3)), onLost } = {}) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'worker.lock');
  const reaper = `${file}.reaper`;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const token = randomUUID();
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid, token, renewedAt: Date.now() }));
        await handle.sync();
      } finally {
        await handle.close();
      }

      let refreshing = false;
      let lostError = null;
      let lossReported = false;
      const loseLease = error => {
        lostError ||= new Error('Daymark worker lease was lost; this process must stop starting work.', { cause: error });
        if (lossReported) return;
        lossReported = true;
        try { onLost?.(lostError); } catch {}
      };
      const heartbeat = setInterval(async () => {
        if (refreshing) return;
        refreshing = true;
        try {
          const current = JSON.parse(await fs.readFile(file, 'utf8'));
          if (current.token !== token) throw new Error('lock ownership changed');
          const now = new Date();
          await fs.utimes(file, now, now);
        } catch (error) { loseLease(error); }
        finally { refreshing = false; }
      }, heartbeatMs);
      heartbeat.unref?.();

      const release = async () => {
        clearInterval(heartbeat);
        try {
          const current = JSON.parse(await fs.readFile(file, 'utf8'));
          if (current.token === token) await fs.unlink(file);
        } catch {}
      };
      release.assertOwned = async () => {
        if (lostError) throw lostError;
        try {
          const [current, stat] = await Promise.all([fs.readFile(file, 'utf8').then(JSON.parse), fs.stat(file)]);
          if (current.token !== token || Date.now() - stat.mtimeMs > staleMs) throw new Error('lock ownership changed or expired');
        } catch (error) {
          loseLease(error);
          throw lostError;
        }
      };
      return release;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const observed = await fs.stat(file).catch(() => null);
    if (!observed) continue;
    if (Date.now() - observed.mtimeMs <= staleMs) {
      throw new Error('Another Daymark worker is already using this data folder. Stop that instance before starting another.');
    }

    // Serialize stale-lock cleanup so a second worker cannot remove a new
    // owner's lock after the first worker has recovered an abandoned lease.
    let reaperHandle;
    try {
      reaperHandle = await fs.open(reaper, 'wx', 0o600);
      await reaperHandle.writeFile(token);
      await reaperHandle.close();
      reaperHandle = null;
    } catch (error) {
      await reaperHandle?.close().catch(() => {});
      if (error.code !== 'EEXIST') throw error;
      const reaperStat = await fs.stat(reaper).catch(() => null);
      if (reaperStat && Date.now() - reaperStat.mtimeMs > staleMs) await fs.unlink(reaper).catch(() => {});
      await delay(25);
      continue;
    }

    try {
      const currentStat = await fs.stat(file).catch(() => null);
      const currentText = currentStat ? await fs.readFile(file, 'utf8').catch(() => '') : '';
      const confirmedStat = await fs.stat(file).catch(() => null);
      const confirmedText = confirmedStat ? await fs.readFile(file, 'utf8').catch(() => '') : '';
      if (currentStat && confirmedStat && currentStat.ino === observed.ino && confirmedStat.ino === currentStat.ino && Date.now() - confirmedStat.mtimeMs > staleMs && currentText === confirmedText) {
        await fs.unlink(file).catch(() => {});
      }
    } finally {
      if (await fs.readFile(reaper, 'utf8').catch(() => '') === token) await fs.unlink(reaper).catch(() => {});
    }
  }

  throw new Error('Daymark could not acquire its worker lock.');
}
