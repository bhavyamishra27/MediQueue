import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyedMutex } from '../../src/utils/KeyedMutex.js';

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('KeyedMutex serializes tasks that share a key', async () => {
  const mutex = new KeyedMutex();
  const events = [];

  let releaseFirst;
  const first = mutex.run('doctor-a', async () => {
    events.push('first-start');
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    events.push('first-end');
  });

  await nextTick();

  const second = mutex.run('doctor-a', async () => {
    events.push('second');
  });

  await nextTick();
  assert.deepEqual(events, ['first-start']);

  releaseFirst();
  await Promise.all([first, second]);

  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('KeyedMutex allows different keys to run concurrently', async () => {
  const mutex = new KeyedMutex();
  const started = [];

  let releaseA;
  let releaseB;

  const taskA = mutex.run('doctor-a', async () => {
    started.push('a');
    await new Promise((resolve) => {
      releaseA = resolve;
    });
  });

  const taskB = mutex.run('doctor-b', async () => {
    started.push('b');
    await new Promise((resolve) => {
      releaseB = resolve;
    });
  });

  await nextTick();
  assert.deepEqual(started.sort(), ['a', 'b']);

  releaseA();
  releaseB();
  await Promise.all([taskA, taskB]);
});

test('a failed task releases the key for the next waiter', async () => {
  const mutex = new KeyedMutex();

  await assert.rejects(
    mutex.run('doctor-a', async () => {
      throw new Error('boom');
    }),
    /boom/,
  );

  const result = await mutex.run('doctor-a', async () => 'next task ran');
  assert.equal(result, 'next task ran');
  assert.equal(mutex.size, 0);
});

test('KeyedMutex returns task results and cleans up settled keys', async () => {
  const mutex = new KeyedMutex();

  const value = await mutex.run('doctor-a', async () => 42);
  assert.equal(value, 42);
  assert.equal(mutex.size, 0);
});
