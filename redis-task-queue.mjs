import { Queue, Worker } from 'bullmq';

export const DAYMARK_QUEUE_NAME = 'daymark-application-tasks';

export function redisConnectionOptions(connectionString) {
  let url;
  try { url = new URL(connectionString); }
  catch { throw new Error('DAYMARK_REDIS_URL must be a valid Redis URL.'); }
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('DAYMARK_REDIS_URL must use redis:// or rediss://.');
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isSafeInteger(database) || database < 0) throw new Error('DAYMARK_REDIS_URL has an invalid database number.');
  const options = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: database,
    maxRetriesPerRequest: null,
  };
  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === 'rediss:') options.tls = {};
  return options;
}

export function createRedisTaskQueue({ connectionString, processTask, QueueClass = Queue, WorkerClass = Worker, prefix = 'daymark' } = {}) {
  if (typeof processTask !== 'function') throw new Error('A Daymark task processor is required.');
  const connection = redisConnectionOptions(connectionString);
  const options = { connection, prefix };
  const queue = new QueueClass(DAYMARK_QUEUE_NAME, options);
  const worker = new WorkerClass(DAYMARK_QUEUE_NAME, async job => {
    const taskId = job?.data?.taskId;
    if (typeof taskId !== 'string' || !taskId || taskId.length > 200) throw new Error('Invalid Daymark queue task identifier.');
    const generation = job?.data?.generation ?? 0;
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Invalid Daymark queue generation.');
    return processTask(taskId, generation);
  }, {
    ...options,
    // One application task and one independent collection can run together.
    concurrency: 2,
    lockDuration: 120_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  });
  queue.on?.('error', () => {});
  worker.on?.('error', () => {});

  // Queue payloads carry only a task ID. Employer data, answers, files, and credentials
  // stay in the local state store and scoped worker filesystem.
  async function enqueue(taskId, generation = 0) {
    if (typeof taskId !== 'string' || !taskId || taskId.length > 200) throw new Error('A valid Daymark task identifier is required.');
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('A valid Daymark queue generation is required.');
    const jobId = `task-${Buffer.from(taskId).toString('base64url')}-g${generation}`;
    return queue.add('process-application-task', { taskId, generation }, {
      jobId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  return {
    enqueue,
    waitUntilReady: async () => { await queue.waitUntilReady(); await worker.waitUntilReady(); },
    close: async () => { await worker.close(); await queue.close(); },
    queue,
    worker,
  };
}
