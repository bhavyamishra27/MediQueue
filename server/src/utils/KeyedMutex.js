/**
 * Serializes async work per key.
 *
 * MediQueue uses one key per doctor for queue mutations (`queue:<doctorId>`).
 * Work for different doctors still runs concurrently, while operations for the
 * same doctor run strictly one after another. This keeps token generation and
 * heap updates deterministic without a global lock.
 */
export class KeyedMutex {
  constructor() {
    this.tails = new Map();
  }

  async run(key, task) {
    if (typeof task !== 'function') {
      throw new TypeError('KeyedMutex.run requires a task function');
    }

    const previous = this.tails.get(key) ?? Promise.resolve();

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    // The stored tail never rejects: it resolves when the current task calls
    // release(), so a failed task cannot poison the next waiter.
    const tail = previous.then(
      () => gate,
      () => gate,
    );
    this.tails.set(key, tail);

    // Wait for the previous holder, ignoring any unexpected rejection.
    await previous.catch(() => {});

    try {
      return await task();
    } finally {
      release();

      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }

  get size() {
    return this.tails.size;
  }
}

export default KeyedMutex;
