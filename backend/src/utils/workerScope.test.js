import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerResidentScope } from './workerScope.js';

const residents = [
  { resident_id: 1, purok_id: 1, focus_groups: [] },
  { resident_id: 2, purok_id: 1, focus_groups: ['senior'] },
  { resident_id: 3, purok_id: 2, focus_groups: ['senior'] },
  { resident_id: 4, purok_id: 2, focus_groups: ['pregnant'] }
];
const matches = (r, group) => r.focus_groups.includes(group);

test('handled scope is the union of purok and barangay-wide focus group, deduplicated', () => {
  assert.deepEqual(buildWorkerResidentScope(residents, '1', 'senior', matches), {
    purokResidentIds: [1, 2], focusResidentIds: [2, 3], residentIds: [1, 2, 3]
  });
});
test('focus-only assignment includes other puroks without allowing unrelated residents', () => {
  assert.deepEqual(buildWorkerResidentScope(residents, null, 'senior', matches).residentIds, [2, 3]);
});
test('purok-only assignment and no assignment remain restricted', () => {
  assert.deepEqual(buildWorkerResidentScope(residents, 1, null, matches).residentIds, [1, 2]);
  assert.deepEqual(buildWorkerResidentScope(residents, null, null, matches).residentIds, []);
  assert.deepEqual(buildWorkerResidentScope([], 1, 'senior', matches).residentIds, []);
});
