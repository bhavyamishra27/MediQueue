import test from 'node:test';
import assert from 'node:assert/strict';
import { MinHeap, defaultQueueComparator } from '../../src/dsa/MinHeap.js';

function entry(tokenNumber, priority = 1, extra = {}) {
  return { appointmentId: `appt-${tokenNumber}`, tokenNumber, priority, ...extra };
}

test('MinHeap orders by priority first, then token number', () => {
  const heap = new MinHeap();

  heap.insert(entry(3, 1));
  heap.insert(entry(1, 1));
  heap.insert(entry(2, 0));
  heap.insert(entry(4, 0));
  heap.insert(entry(5, 1));

  assert.equal(heap.peek().tokenNumber, 2);
  assert.deepEqual(
    [heap.extractMin(), heap.extractMin(), heap.extractMin(), heap.extractMin(), heap.extractMin()]
      .map((item) => item.tokenNumber),
    [2, 4, 1, 3, 5],
  );
  assert.equal(heap.isEmpty(), true);
});

test('MinHeap peek, size and extractMin on an empty heap are safe', () => {
  const heap = new MinHeap();

  assert.equal(heap.isEmpty(), true);
  assert.equal(heap.size(), 0);
  assert.equal(heap.peek(), null);
  assert.equal(heap.extractMin(), null);
});

test('MinHeap heapify builds a valid heap in one pass', () => {
  const values = [entry(9), entry(2), entry(7, 0), entry(1), entry(5), entry(3, 0)];
  const heap = new MinHeap().heapify(values);

  assert.equal(heap.size(), values.length);
  assert.deepEqual(
    heap.toArray().length,
    values.length,
  );

  const extracted = [];
  while (!heap.isEmpty()) extracted.push(heap.extractMin().tokenNumber);
  assert.deepEqual(extracted, [3, 7, 1, 2, 5, 9]);
});

test('MinHeap matches a sorted array for random insert/extract sequences', () => {
  const values = [];
  for (let token = 1; token <= 120; token += 1) {
    values.push(entry(token, token % 4 === 0 ? 0 : 1));
  }

  // Deterministic shuffle so failures are reproducible.
  let seed = 42;
  for (let index = values.length - 1; index > 0; index -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const swap = seed % (index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }

  const heap = new MinHeap();
  for (const value of values) heap.insert(value);

  const expected = values
    .slice()
    .sort(defaultQueueComparator)
    .map((item) => item.appointmentId);

  const actual = [];
  while (!heap.isEmpty()) actual.push(heap.extractMin().appointmentId);

  assert.deepEqual(actual, expected);
});

test('MinHeap remove finds an arbitrary item and repairs the heap', () => {
  const heap = new MinHeap();
  for (let token = 1; token <= 10; token += 1) heap.insert(entry(token));

  const removed = heap.remove((item) => item.tokenNumber === 4);
  assert.equal(removed.tokenNumber, 4);
  assert.equal(heap.size(), 9);
  assert.equal(heap.remove((item) => item.tokenNumber === 99), null);

  const remaining = [];
  while (!heap.isEmpty()) remaining.push(heap.extractMin().tokenNumber);
  assert.deepEqual(remaining, [1, 2, 3, 5, 6, 7, 8, 9, 10]);
});

test('MinHeap remove the root keeps the ordering intact', () => {
  const heap = new MinHeap().heapify([entry(5), entry(1), entry(3), entry(2), entry(4)]);
  const removed = heap.remove((item) => item.tokenNumber === 1);

  assert.equal(removed.tokenNumber, 1);
  assert.equal(heap.peek().tokenNumber, 2);

  const remaining = [];
  while (!heap.isEmpty()) remaining.push(heap.extractMin().tokenNumber);
  assert.deepEqual(remaining, [2, 3, 4, 5]);
});

test('MinHeap clear empties the structure', () => {
  const heap = new MinHeap().heapify([entry(1), entry(2)]);
  heap.clear();

  assert.equal(heap.size(), 0);
  assert.equal(heap.peek(), null);
});
