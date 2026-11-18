import test from 'node:test';
import assert from 'node:assert/strict';
import { FIFOQueue } from '../../src/dsa/FIFOQueue.js';

test('FIFOQueue dequeues in arrival order', () => {
  const queue = new FIFOQueue();

  queue.enqueue('first');
  queue.enqueue('second');
  queue.enqueue('third');

  assert.equal(queue.size(), 3);
  assert.equal(queue.peek(), 'first');
  assert.equal(queue.dequeue(), 'first');
  assert.equal(queue.dequeue(), 'second');
  assert.equal(queue.peek(), 'third');
  assert.equal(queue.dequeue(), 'third');
  assert.equal(queue.dequeue(), null);
});

test('FIFOQueue reports size and emptiness', () => {
  const queue = new FIFOQueue();

  assert.equal(queue.isEmpty(), true);
  assert.equal(queue.size(), 0);

  queue.enqueue('a');
  assert.equal(queue.isEmpty(), false);
  assert.equal(queue.size(), 1);
});

test('FIFOQueue remove keeps the remaining order', () => {
  const queue = new FIFOQueue();
  for (const value of [1, 2, 3, 4, 5]) queue.enqueue(value);

  assert.equal(queue.remove((value) => value === 3), 3);
  assert.equal(queue.remove((value) => value === 99), null);
  assert.deepEqual(queue.toArray(), [1, 2, 4, 5]);
  assert.equal(queue.size(), 4);
});

test('FIFOQueue toArray returns a copy and clear resets the queue', () => {
  const queue = new FIFOQueue();
  queue.enqueue('a');
  queue.enqueue('b');

  const copy = queue.toArray();
  copy.push('c');
  assert.deepEqual(queue.toArray(), ['a', 'b']);

  queue.clear();
  assert.equal(queue.isEmpty(), true);
  assert.deepEqual(queue.toArray(), []);
});

test('FIFOQueue compacts its backing array without changing order', () => {
  const queue = new FIFOQueue();
  for (let value = 1; value <= 100; value += 1) queue.enqueue(value);

  for (let value = 1; value <= 60; value += 1) {
    assert.equal(queue.dequeue(), value);
  }

  assert.equal(queue.size(), 40);
  assert.equal(queue.peek(), 61);
  assert.deepEqual(
    queue.toArray().slice(0, 3),
    [61, 62, 63],
  );
});
