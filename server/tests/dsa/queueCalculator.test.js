import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEffectiveAverage,
  estimateStartTime,
  estimateWaitMinutes,
  getAheadCount,
  getPosition,
} from '../../src/dsa/QueueCalculator.js';

function entry(tokenNumber, priority = 1) {
  return { appointmentId: `appt-${tokenNumber}`, tokenNumber, priority };
}

test('getPosition returns 1 for the next patient', () => {
  const entries = [entry(1), entry(2), entry(3, 0)];

  assert.equal(getPosition(entries, entry(3, 0)), 1);
  assert.equal(getPosition(entries, entry(1)), 2);
  assert.equal(getPosition(entries, entry(2)), 3);
  assert.equal(getAheadCount(entries, entry(2)), 2);
});

test('getPosition handles empty or missing targets', () => {
  assert.equal(getPosition([], null), null);
  assert.equal(getPosition([], entry(1)), 1);
  assert.equal(getAheadCount([], null), null);
});

test('estimateWaitMinutes includes the current patient and reported delay', () => {
  assert.equal(
    estimateWaitMinutes({
      position: 1,
      currentPatient: true,
      avgConsultationMinutes: 15,
      delayMinutes: 10,
    }),
    25,
  );

  assert.equal(
    estimateWaitMinutes({
      position: 3,
      currentPatient: true,
      avgConsultationMinutes: 15,
      delayMinutes: 0,
    }),
    45,
  );

  assert.equal(
    estimateWaitMinutes({
      position: 1,
      currentPatient: false,
      avgConsultationMinutes: 20,
      delayMinutes: 0,
    }),
    0,
  );
});

test('estimateWaitMinutes guards invalid values', () => {
  assert.equal(estimateWaitMinutes({ position: 0, currentPatient: false }), 0);
  assert.equal(
    estimateWaitMinutes({
      position: 1,
      currentPatient: true,
      avgConsultationMinutes: -5,
      delayMinutes: -10,
    }),
    15,
  );
});

test('estimateStartTime starts from the later of now and the booked slot', () => {
  assert.equal(
    estimateStartTime({
      now: '10:00',
      slotTime: '09:30',
      position: 1,
      currentPatient: false,
    }),
    '10:00',
  );

  assert.equal(
    estimateStartTime({
      now: '10:00',
      slotTime: '11:00',
      position: 1,
      currentPatient: false,
    }),
    '11:00',
  );

  assert.equal(
    estimateStartTime({
      now: '10:00',
      slotTime: '10:00',
      position: 2,
      currentPatient: true,
      avgConsultationMinutes: 15,
      delayMinutes: 5,
    }),
    '10:35',
  );

  assert.equal(
    estimateStartTime({ now: null, slotTime: null, position: 1 }),
    null,
  );
});

test('calculateEffectiveAverage waits for three completed consultations', () => {
  assert.equal(calculateEffectiveAverage(15, []), 15);
  assert.equal(calculateEffectiveAverage(15, [10, 20]), 15);
  assert.equal(calculateEffectiveAverage(15, [10, 20, 30]), 20);
  assert.equal(calculateEffectiveAverage(15, [10, 20, 30, 40]), 25);
  assert.equal(calculateEffectiveAverage(null, []), 15);
});
