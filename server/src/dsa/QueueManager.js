import { PatientQueue } from './PatientQueue.js';

const MAX_OPERATIONS = 50;

const COMPLEXITY_REFERENCE = [
  { operation: 'Insert waiting patient', structure: 'MinHeap', complexity: 'O(log n)', note: 'Append then bubble up.' },
  { operation: 'Call next patient', structure: 'MinHeap', complexity: 'O(log n)', note: 'Extract minimum then sink down.' },
  { operation: 'Peek next patient', structure: 'MinHeap', complexity: 'O(1)', note: 'The root is always the next patient.' },
  { operation: 'Find by appointment', structure: 'Hash Map', complexity: 'O(1)', note: 'Appointment id → queue entry.' },
  { operation: 'Remove waiting patient', structure: 'MinHeap + Map', complexity: 'O(n)', note: 'Linear search, then heap repair.' },
  { operation: 'Rebuild a queue', structure: 'MinHeap', complexity: 'O(n)', note: 'Bottom-up heapify from SQLite rows.' },
  { operation: 'Ordered waiting list', structure: 'MinHeap', complexity: 'O(n log n)', note: 'Sorted copy; the heap itself is unchanged.' },
  { operation: 'FIFO comparison', structure: 'FIFOQueue', complexity: 'O(n)', note: 'Arrival-order view of normal patients.' },
];

function cloneEntry(entry) {
  return entry ? { ...entry } : null;
}

/**
 * Pure in-memory queue state. It imports no database, Express or Socket.IO
 * code; QueueService is the only component that bridges this engine with
 * SQLite. All methods are synchronous and deterministic for easy unit testing.
 */
export class QueueManager {
  constructor({ maxOperations = MAX_OPERATIONS } = {}) {
    this.doctorQueues = new Map();
    this.entriesByAppointment = new Map();
    this.doctorDirectory = new Map();
    this.patientDirectory = new Map();
    this.currentByDoctor = new Map();
    this.operations = [];
    this.maxOperations = maxOperations;
    this.operationSequence = 0;
  }

  registerDoctor(doctor) {
    if (!doctor || !doctor.id) {
      throw new TypeError('registerDoctor requires a doctor with an id');
    }

    const existing = this.doctorDirectory.get(doctor.id);
    const record = {
      id: doctor.id,
      name: doctor.name ?? existing?.name ?? 'Doctor',
      hospitalId: doctor.hospitalId ?? existing?.hospitalId ?? null,
      hospitalName: doctor.hospitalName ?? existing?.hospitalName ?? null,
      roomNumber: doctor.roomNumber ?? existing?.roomNumber ?? null,
      avgConsultationMinutes:
        doctor.avgConsultationMinutes ?? existing?.avgConsultationMinutes ?? 15,
      isActive: doctor.isActive ?? existing?.isActive ?? true,
      delayMinutes: doctor.delayMinutes ?? existing?.delayMinutes ?? 0,
    };

    this.doctorDirectory.set(doctor.id, record);
    return record;
  }

  getDoctor(doctorId) {
    return this.doctorDirectory.get(doctorId) ?? null;
  }

  registerPatient(patient) {
    if (!patient || !patient.id) {
      throw new TypeError('registerPatient requires a patient with an id');
    }

    const record = {
      id: patient.id,
      name: patient.name ?? this.patientDirectory.get(patient.id)?.name ?? 'Patient',
    };

    this.patientDirectory.set(patient.id, record);
    return record;
  }

  getPatient(patientId) {
    return this.patientDirectory.get(patientId) ?? null;
  }

  setDoctorDelay(doctorId, delayMinutes) {
    const doctor = this.doctorDirectory.get(doctorId);
    if (doctor) {
      doctor.delayMinutes = Number.isFinite(delayMinutes) && delayMinutes > 0 ? delayMinutes : 0;
    }
    return doctor ?? null;
  }

  ensureQueue(doctorId) {
    let queue = this.doctorQueues.get(doctorId);
    if (!queue) {
      queue = new PatientQueue({ doctorId });
      this.doctorQueues.set(doctorId, queue);
    }
    return queue;
  }

  getQueue(doctorId) {
    return this.doctorQueues.get(doctorId) ?? null;
  }

  /** Replaces a doctor's waiting queue with the supplied entries. */
  rebuildDoctorQueue(doctorId, entries = []) {
    const queue = this.ensureQueue(doctorId);

    // Drop stale appointment lookups belonging to this doctor before indexing
    // the rebuilt rows. The current patient is tracked separately.
    for (const [appointmentId, entry] of this.entriesByAppointment) {
      if (entry.doctorId === doctorId) {
        this.entriesByAppointment.delete(appointmentId);
      }
    }

    queue.rebuild(entries);
    for (const entry of entries) {
      this.entriesByAppointment.set(entry.appointmentId, entry);
    }

    return queue;
  }

  insertWaiting(entry) {
    if (!entry || !entry.appointmentId || !entry.doctorId) {
      throw new TypeError('insertWaiting requires an entry with doctorId and appointmentId');
    }

    const queue = this.ensureQueue(entry.doctorId);
    queue.insert(entry);
    this.entriesByAppointment.set(entry.appointmentId, entry);

    this.logOperation({
      type: 'insert',
      doctorId: entry.doctorId,
      patientName: entry.patientName ?? null,
      tokenNumber: entry.tokenNumber ?? null,
      complexity: 'O(log n)',
      message: `Inserted token #${entry.tokenNumber} into the waiting heap.`,
    });

    return entry;
  }

  removeWaiting(appointmentId) {
    const entry = this.entriesByAppointment.get(appointmentId);
    if (!entry) return null;

    const queue = this.ensureQueue(entry.doctorId);
    queue.remove(appointmentId);
    this.entriesByAppointment.delete(appointmentId);

    this.logOperation({
      type: 'remove',
      doctorId: entry.doctorId,
      patientName: entry.patientName ?? null,
      tokenNumber: entry.tokenNumber ?? null,
      complexity: 'O(n)',
      message: `Removed token #${entry.tokenNumber} from the waiting heap.`,
    });

    return entry;
  }

  /**
   * Extracts the next waiting patient and marks them current. Returns null when
   * a patient is already current or the queue is empty.
   */
  callNext(doctorId) {
    if (this.currentByDoctor.has(doctorId)) return null;

    const queue = this.ensureQueue(doctorId);
    const entry = queue.extractNext();
    if (!entry) return null;

    this.currentByDoctor.set(doctorId, entry);
    this.entriesByAppointment.set(entry.appointmentId, entry);

    this.logOperation({
      type: 'call-next',
      doctorId,
      patientName: entry.patientName ?? null,
      tokenNumber: entry.tokenNumber ?? null,
      complexity: 'O(log n)',
      message: `Called token #${entry.tokenNumber}.`,
    });

    return entry;
  }

  setCurrent(doctorId, entry, { silent = false } = {}) {
    if (!entry) {
      throw new TypeError('setCurrent requires an entry');
    }

    this.ensureQueue(doctorId);
    this.currentByDoctor.set(doctorId, entry);
    this.entriesByAppointment.set(entry.appointmentId, entry);

    if (!silent) {
      this.logOperation({
        type: 'set-current',
        doctorId,
        patientName: entry.patientName ?? null,
        tokenNumber: entry.tokenNumber ?? null,
        complexity: 'O(1)',
        message: `Set token #${entry.tokenNumber} as the current patient.`,
      });
    }

    return entry;
  }

  getCurrent(doctorId) {
    return this.currentByDoctor.get(doctorId) ?? null;
  }

  clearCurrent(doctorId, { silent = false } = {}) {
    const entry = this.currentByDoctor.get(doctorId) ?? null;
    this.currentByDoctor.delete(doctorId);

    if (entry) {
      this.entriesByAppointment.delete(entry.appointmentId);

      if (!silent) {
        this.logOperation({
          type: 'clear-current',
          doctorId,
          patientName: entry.patientName ?? null,
          tokenNumber: entry.tokenNumber ?? null,
          complexity: 'O(1)',
          message: `Cleared token #${entry.tokenNumber} from the current position.`,
        });
      }
    }

    return entry;
  }

  getEntryByAppointment(appointmentId) {
    return this.entriesByAppointment.get(appointmentId) ?? null;
  }

  getEntryById(entryId) {
    for (const entry of this.entriesByAppointment.values()) {
      if (entry.id === entryId) return entry;
    }
    return null;
  }

  /** Staff-facing snapshot: names, tokens, current patient and positions. */
  getSnapshot(doctorId) {
    const queue = this.doctorQueues.get(doctorId) ?? null;
    const current = this.getCurrent(doctorId);
    const ordered = queue ? queue.getOrderedEntries() : [];

    const waiting = ordered.map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));

    return {
      doctorId,
      doctor: this.getDoctor(doctorId),
      current: cloneEntry(current),
      waiting,
      counts: {
        waiting: waiting.length,
        current: current ? 1 : 0,
        active: waiting.length + (current ? 1 : 0),
      },
    };
  }

  /** DSA demonstration snapshot: heap array, FIFO view, ordered list, log. */
  getDsaSnapshot(doctorId) {
    const queue = this.doctorQueues.get(doctorId) ?? null;

    return {
      doctorId,
      comparator: 'priority ascending (0 = emergency, 1 = normal), then tokenNumber ascending',
      heapArray: queue ? queue.getHeapArray().map(cloneEntry) : [],
      fifoOrder: queue ? queue.getFifoOrder().map(cloneEntry) : [],
      orderedWaiting: queue ? queue.getOrderedEntries().map(cloneEntry) : [],
      current: cloneEntry(this.getCurrent(doctorId)),
      size: queue ? queue.size() : 0,
      isEmpty: queue ? queue.isEmpty() : true,
      operations: this.operations
        .filter((operation) => operation.doctorId === doctorId)
        .map((operation) => ({ ...operation })),
      complexities: COMPLEXITY_REFERENCE.map((item) => ({ ...item })),
    };
  }

  getOperations() {
    return this.operations.map((operation) => ({ ...operation }));
  }

  logOperation({ type, doctorId, patientName = null, tokenNumber = null, complexity, message }) {
    this.operationSequence += 1;

    this.operations.push({
      id: this.operationSequence,
      type,
      doctorId,
      patientName,
      tokenNumber,
      complexity,
      message,
      at: new Date().toISOString(),
    });

    while (this.operations.length > this.maxOperations) {
      this.operations.shift();
    }

    return this.operations[this.operations.length - 1];
  }

  clearDoctor(doctorId) {
    for (const [appointmentId, entry] of this.entriesByAppointment) {
      if (entry.doctorId === doctorId) {
        this.entriesByAppointment.delete(appointmentId);
      }
    }

    this.currentByDoctor.delete(doctorId);
    this.doctorQueues.delete(doctorId);
    return this;
  }

  clearAll() {
    this.doctorQueues.clear();
    this.entriesByAppointment.clear();
    this.doctorDirectory.clear();
    this.patientDirectory.clear();
    this.currentByDoctor.clear();
    this.operations = [];
    this.operationSequence = 0;
    return this;
  }
}

export { COMPLEXITY_REFERENCE };
export default QueueManager;
