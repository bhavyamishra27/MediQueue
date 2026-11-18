/**
 * Custom binary Min-Heap (no external libraries).
 *
 * MediQueue orders waiting patients by:
 *   1. priority  — Emergency = 0, Normal = 1 (lower is served first)
 *   2. tokenNumber — smaller token first (preserves check-in / FCFS order)
 *
 * Complexities:
 *   insert / extractMin / remove — O(log n) (remove also pays O(n) to find)
 *   peek / size / isEmpty        — O(1)
 *   heapify                      — O(n)
 */

export function defaultQueueComparator(a, b) {
  return (a.priority - b.priority) || (a.tokenNumber - b.tokenNumber);
}

export class MinHeap {
  constructor(comparator = defaultQueueComparator) {
    if (typeof comparator !== 'function') {
      throw new TypeError('MinHeap comparator must be a function');
    }

    this.comparator = comparator;
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  peek() {
    return this.items.length > 0 ? this.items[0] : null;
  }

  insert(value) {
    this.items.push(value);
    this.#bubbleUp(this.items.length - 1);
    return this;
  }

  extractMin() {
    if (this.items.length === 0) return null;

    const minimum = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0) {
      this.items[0] = last;
      this.#sinkDown(0);
    }

    return minimum;
  }

  /**
   * Replaces the heap contents in O(n) using bottom-up heap construction.
   * Used when a doctor's queue is rebuilt from SQLite at startup.
   */
  heapify(values = []) {
    this.items = Array.from(values);

    for (let index = Math.floor(this.items.length / 2) - 1; index >= 0; index -= 1) {
      this.#sinkDown(index);
    }

    return this;
  }

  /** Returns a copy so callers cannot mutate the heap by accident. */
  toArray() {
    return this.items.slice();
  }

  clear() {
    this.items = [];
    return this;
  }

  /**
   * Removes the first item matching the predicate.
   * Returns the removed item, or null when nothing matched.
   */
  remove(predicate) {
    if (typeof predicate !== 'function') {
      throw new TypeError('MinHeap.remove expects a predicate function');
    }

    const index = this.items.findIndex(predicate);
    if (index === -1) return null;

    const removed = this.items[index];
    const last = this.items.pop();

    if (index < this.items.length) {
      this.items[index] = last;

      // The replacement can be either too small (move up) or too large
      // (move down); repairing both directions keeps the heap valid.
      const position = this.#bubbleUp(index);
      this.#sinkDown(position);
    }

    return removed;
  }

  #bubbleUp(startIndex) {
    let index = startIndex;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.comparator(this.items[index], this.items[parentIndex]) >= 0) break;

      [this.items[index], this.items[parentIndex]] = [this.items[parentIndex], this.items[index]];
      index = parentIndex;
    }

    return index;
  }

  #sinkDown(startIndex) {
    let index = startIndex;
    const length = this.items.length;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallest = index;

      if (
        leftIndex < length &&
        this.comparator(this.items[leftIndex], this.items[smallest]) < 0
      ) {
        smallest = leftIndex;
      }

      if (
        rightIndex < length &&
        this.comparator(this.items[rightIndex], this.items[smallest]) < 0
      ) {
        smallest = rightIndex;
      }

      if (smallest === index) break;

      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }

    return index;
  }
}

export default MinHeap;
