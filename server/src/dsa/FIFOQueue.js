/**
 * Custom FIFO queue backed by an array plus a head index.
 *
 * `Array.shift()` is O(n) because it re-indexes every remaining element.
 * Moving the head pointer instead keeps dequeue O(1) amortized; the backing
 * array is compacted only occasionally.
 *
 * Complexities:
 *   enqueue / dequeue / peek / size / isEmpty — O(1) amortized
 *   remove                                    — O(n)
 */
export class FIFOQueue {
  constructor() {
    this.items = [];
    this.head = 0;
  }

  enqueue(value) {
    this.items.push(value);
    return this;
  }

  dequeue() {
    if (this.isEmpty()) return null;

    const value = this.items[this.head];
    this.head += 1;
    this.#compact();
    return value;
  }

  peek() {
    return this.isEmpty() ? null : this.items[this.head];
  }

  size() {
    return this.items.length - this.head;
  }

  isEmpty() {
    return this.size() === 0;
  }

  /** Returns a copy of the live queue in arrival order. */
  toArray() {
    return this.items.slice(this.head);
  }

  /** Removes the first item matching the predicate, preserving order. */
  remove(predicate) {
    if (typeof predicate !== 'function') {
      throw new TypeError('FIFOQueue.remove expects a predicate function');
    }

    for (let index = this.head; index < this.items.length; index += 1) {
      if (predicate(this.items[index])) {
        const [removed] = this.items.splice(index, 1);
        this.#compact();
        return removed;
      }
    }

    return null;
  }

  clear() {
    this.items = [];
    this.head = 0;
    return this;
  }

  #compact() {
    // Reclaim memory once the dead prefix dominates the backing array.
    if (this.head > 32 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    } else if (this.head >= this.items.length) {
      this.items = [];
      this.head = 0;
    }
  }
}

export default FIFOQueue;
