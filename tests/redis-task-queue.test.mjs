import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedisTaskQueue, redisConnectionOptions } from '../redis-task-queue.mjs';

test('parses local Redis URLs without emitting credentials in the connection contract', () => {
  const options = redisConnectionOptions('rediss://queue-user:secret-value@redis.example:6380/2');
  assert.deepEqual(options, {
    host: 'redis.example', port: 6380, db: 2, username: 'queue-user', password: 'secret-value',
    maxRetriesPerRequest: null, tls: {},
  });
  assert.throws(() => redisConnectionOptions('http://redis.example'), /redis:\/\/ or rediss:\/\//);
  assert.throws(() => redisConnectionOptions('redis://redis.example/not-a-db'), /database number/);
});

test('dispatches only a task identifier and leaves lane exclusivity to the task worker', async () => {
  let processor;
  let queueOptions;
  const calls = [];
  class QueueMock {
    constructor(name, options) { this.name = name; queueOptions = options; }
    async add(name, data, options) { calls.push({ name, data, options }); return { id: options.jobId }; }
    async waitUntilReady() {}
    async close() {}
  }
  class WorkerMock {
    constructor(name, process, options) { this.name = name; processor = process; this.options = options; }
    async waitUntilReady() {}
    async close() {}
  }
  const processed = [];
  const queue = createRedisTaskQueue({
    connectionString: 'redis://localhost:6379/0',
    QueueClass: QueueMock,
    WorkerClass: WorkerMock,
    processTask: async id => { processed.push(id); },
  });
  await queue.enqueue('task-abc', 1);
  await processor({ data: { taskId: 'task-abc', generation: 1 } });
  assert.equal(queue.worker.options.concurrency, 2);
  assert.equal(queueOptions.prefix, 'daymark');
  assert.deepEqual(calls[0].data, { taskId: 'task-abc', generation: 1 });
  assert.equal(calls[0].options.attempts, 1);
  assert.equal(calls[0].data.generation, 1);
  assert.match(calls[0].options.jobId, /-g1$/);
  assert.deepEqual(processed, ['task-abc']);
  await assert.rejects(() => processor({ data: {} }), /Invalid Daymark queue task identifier/);
});

test('configures two worker slots so collection and one application can progress independently', async () => {
  let processor;
  let queue;
  class QueueMock {
    constructor() {}
    async add(name, data, options) { return { id: options.jobId }; }
    async waitUntilReady() {}
    async close() {}
  }
  class WorkerMock {
    constructor(name, process, options) { processor = process; this.options = options; }
    async waitUntilReady() {}
    async close() {}
  }
  let active = 0, maximum = 0;
  queue = createRedisTaskQueue({ connectionString: 'redis://localhost:6379/0', QueueClass: QueueMock, WorkerClass: WorkerMock, processTask: async id => {
    active += 1; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 10)); active -= 1; return id;
  } });
  await Promise.all(['prepare-task','fill-task'].map(taskId => processor({ data: { taskId } })));
  assert.equal(queue.worker.options.concurrency, 2);
  assert.equal(maximum, 2);
  await queue.close();
});

test('uses a distinct BullMQ job id for each explicit resume generation', async () => {
  const calls = [];
  class QueueMock { constructor() {} async add(name, data, options) { calls.push({ data, options }); return options.jobId; } async waitUntilReady() {} async close() {} }
  class WorkerMock { constructor(name, process) { this.process = process; } async waitUntilReady() {} async close() {} }
  const queue = createRedisTaskQueue({ connectionString: 'redis://localhost:6379/0', QueueClass: QueueMock, WorkerClass: WorkerMock, processTask: async () => {} });
  await queue.enqueue('task-abc', 2);
  await queue.enqueue('task-abc', 3);
  assert.notEqual(calls[0].options.jobId, calls[1].options.jobId);
  assert.deepEqual(calls.map(item => item.data.generation), [2, 3]);
  await queue.close();
});
