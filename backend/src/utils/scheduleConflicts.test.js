import test from 'node:test';
import assert from 'node:assert/strict';
import { findWorkerConflict, schedulesOverlap } from './scheduleConflicts.js';

const booking = { schedule_id: 1, date: '2026-09-14', time: '10:00:00', duration: 30, status: 'Scheduled', bhw_id: 7 };
const conflict = (candidate = booking, workers = [{ bhwId: '7' }], rows = [booking], excludeId) =>
  findWorkerConflict(candidate, workers, rows, excludeId);

test('same worker cannot book the same time or overlapping duration', () => {
  assert.ok(conflict());
  assert.ok(conflict({ ...booking, time: '10:15:00' }));
  assert.ok(conflict({ ...booking, time: '09:45:00' }));
});

test('adjacent times, different dates, and different workers are allowed', () => {
  assert.equal(conflict({ ...booking, time: '10:30:00' }), null);
  assert.equal(conflict({ ...booking, date: '2026-09-15' }), null);
  assert.equal(conflict(booking, [{ bhwId: 8 }]), null);
});

test('additional assignments and custom names also reserve the worker', () => {
  assert.ok(conflict(booking, [{ bhwId: 8 }], [{ ...booking, schedule_bhws: [{ bhw_id: 8 }] }]));
  assert.ok(conflict(booking, [{ customName: '  Rolan  Reyes ' }], [{ ...booking, bhws: { name: 'rolan reyes' } }]));
});

test('exclude the edited schedule and ignore cancelled, missed, completed bookings', () => {
  assert.equal(conflict(booking, [{ bhwId: 7 }], [booking], '1'), null);
  for (const status of ['Cancelled', 'Missed', 'Completed']) {
    assert.equal(conflict(booking, [{ bhwId: 7 }], [{ ...booking, status }]), null);
    assert.equal(conflict({ ...booking, status }), null);
  }
});

test('active programs and appointments crossing midnight block overlaps', () => {
  assert.ok(conflict(booking, [{ bhwId: 7 }], [{ ...booking, time: '09:00:00', duration: 120, status: 'Active' }]));
  assert.ok(schedulesOverlap({ ...booking, time: '23:45:00' }, { ...booking, date: '2026-09-15', time: '00:00:00' }));
});
