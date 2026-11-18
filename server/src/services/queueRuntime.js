import { QueueManager } from '../dsa/QueueManager.js';
import { KeyedMutex } from '../utils/KeyedMutex.js';

/**
 * Process-wide singletons. The DSA engine is pure; this module is the only
 * shared state the service layer needs. Keeping it separate makes imports from
 * appointment.service.js and queue.service.js resolve to the same instance.
 */
export const queueManager = new QueueManager();
export const queueMutex = new KeyedMutex();

export function doctorQueueKey(doctorId) {
  return `queue:${doctorId}`;
}
