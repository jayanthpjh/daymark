import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import { redisConnectionOptions } from './redis-task-queue.mjs';

export function hostedRpm(env = process.env) {
  const value = Number(env.NVIDIA_RPM || 10);
  if (!Number.isInteger(value) || value < 1 || value > 15) throw new Error('NVIDIA_RPM must be an integer from 1 to 15.');
  return value;
}

const nextSlots = new Map();
const connections = new Map();
// Redis owns the schedule across API/worker processes. No prompt or credential is stored.
const reserve = `local now=redis.call('TIME'); local ms=now[1]*1000+math.floor(now[2]/1000)
local slot=math.max(ms,tonumber(redis.call('GET',KEYS[1])) or 0)
if slot-ms>180000 then return -1 end
redis.call('SET',KEYS[1],slot+tonumber(ARGV[1]),'PX',240000)
return slot-ms`;
export async function waitForHostedSlot({ key, env = process.env, pause = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, redisClient } = {}) {
  const interval = Math.ceil(60000 / hostedRpm(env));
  const id = createHash('sha256').update(key).digest('hex');
  let delay;
  if (redisClient || env.DAYMARK_REDIS_URL) {
    if (!redisClient) {
      const url = env.DAYMARK_REDIS_URL;
      if (!connections.has(url)) {
        const queue = new Queue('daymark-llm-rate', { connection: { ...redisConnectionOptions(url), maxRetriesPerRequest: 1, enableOfflineQueue: false } });
        queue.on('error', () => {});
        connections.set(url, queue);
      }
      redisClient = await connections.get(url).client;
    }
    delay = Number(await redisClient.eval(reserve, 1, `daymark:hosted-rate:${id}`, interval));
  } else {
    // Single-process development only; split API/worker deployments must configure Redis.
    const time = now(), slot = Math.max(time, nextSlots.get(id) || 0);
    delay = slot - time;
    if (delay <= 180000) nextSlots.set(id, slot + interval);
  }
  if (delay < 0 || delay > 180000 || !Number.isFinite(delay)) throw new Error('Hosted model queue is full. Try again later.');
  if (delay) await pause(delay);
}

export async function closeHostedRateConnections() {
  await Promise.all([...connections.values()].map(queue => queue.close()));
  connections.clear();
}
