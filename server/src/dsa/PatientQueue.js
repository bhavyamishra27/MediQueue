import { MinHeap, defaultQueueComparator } from './MinHeap.js';
import { FIFOQueue } from './FIFOQueue.js';
import { getPosition } from './QueueCalculator.js';

/**
 * One doctor's live waiting queue.
 *
 * The MinHeap is the single source of truth for serving order. The FIFO queue
 * is a derived arrival-order view of NORMAL patients used by the DSA panel and
 * consistency tests; it never independently decides who is called. Emergency
 * patients are intentionally excluded from the FIFO view because they bypass
 * FCFS.
 *
 * The appointment map provides O(1) lookup for cancellations and no-shows.
 */
export class PatientQueue {
  constructor({ doctorId = null } = {}) {
    this.doctorId = doctorId;
    this.heap = new MinHeap(defaultQueueComparator);
    this.fifo = new FIFOQueue();
    this.entriesByAppointment = new Map();
  }

  insert(entry) {
    if (!entry || !entry.appointmentId) {
      throw new TypeError('PatientQueue.insert requires an entry with appointmentId');
    }

    // Re-inserting the same appointment replaces the previous copy instead of
    // creating a duplicate in the heap.
    if (this.entriesByAppointment.has(entry.appointmentId)) {
      this.remove(entry.appointmentId);
    }

    this.heap.insert(entry);
    this.entriesByAppointment.set(entry.appointmentId, entry);

    if (entry.priority !== 0) {
      this.fifo.enqueue(entry);
    }

    return entry;
  }

  remove(appointmentId) {
    const entry = this.entriesByAppointment.get(appointmentId);
    if (!entry) return null;

    this.heap.remove((candidate) => candidate.appointmentId === appointmentId);

    if (entry.priority !== 0) {
      this.fifo.remove((candidate) => candidate.appointmentId === appointmentId);
    }

    this.entriesByAppointment.delete(appointmentId);
    return entry;
  }

  get(appointmentId) {
    return this.entriesByAppointment.get(appointmentId) ?? null;
  }

  has(appointmentId) {
    return this.entriesByAppointment.has(appointmentId);
  }

  peekNext() {
    return this.heap.peek();
  }

  /** Removes and returns the next patient, or null when the queue is empty. */
  extractNext() {
    const next = this.heap.peek();
    if (!next) return null;
    return this.remove(next.appointmentId);
  }

  getPosition(appointmentId) {
    const target = this.entriesByAppointment.get(appointmentId);
    if (!target) return null;
    return getPosition(this.heap.toArray(), target);
  }

  /** Waiting patients in serving order (sorted copy, heap untouched). */
  getOrderedEntries() {
    return this.heap.toArray().sort(defaultQueueComparator);
  }

  /** Raw internal heap array — useful for the DSA demonstration panel. */
  getHeapArray() {
    return this.heap.toArray();
  }

  /** Normal patients in check-in order — the FCFS demonstration view. */
  getFifoOrder() {
    return this.fifo.toArray();
  }

  rebuild(entries = []) {
    this.clear();
    for (const entry of entries) this.insert(entry);
    return this;
  }

  clear() {
    this.heap.clear();
    this.fifo.clear();
    this.entriesByAppointment.clear();
    return this;
  }

  size() {
    return this.heap.size();
  }

  isEmpty() {
    return this.heap.isEmpty();
  }
}

export default PatientQueue;
