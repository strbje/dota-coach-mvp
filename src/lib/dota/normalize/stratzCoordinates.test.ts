import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStratzCoordinates } from './stratzCoordinates';

test('projects a complete candidate byte-grid pair as research-only', () => {
  assert.deepEqual(normalizeStratzCoordinates(128, 128), {
    rawX: 128,
    rawY: 128,
    mapX: 128 / 255,
    mapY: 128 / 255,
    worldX: 0,
    worldY: 0,
    coordinateSystem: 'stratz_grid_0_255',
    validation: 'structural_only',
    productReady: false
  });
});

test('preserves a possible world-space pair without applying the grid projection', () => {
  const coordinates = normalizeStratzCoordinates(-3200, 4700);
  assert.equal(coordinates.rawX, -3200);
  assert.equal(coordinates.rawY, 4700);
  assert.equal(coordinates.coordinateSystem, 'unknown');
  assert.equal(coordinates.mapX, undefined);
  assert.equal(coordinates.mapY, undefined);
  assert.equal(coordinates.worldX, undefined);
  assert.equal(coordinates.worldY, undefined);
});

test('does not project an incomplete coordinate pair', () => {
  const coordinates = normalizeStratzCoordinates(128, undefined);
  assert.equal(coordinates.coordinateSystem, 'unknown');
  assert.equal(coordinates.validation, 'invalid');
  assert.equal(coordinates.mapX, undefined);
  assert.equal(coordinates.mapY, undefined);
  assert.equal(coordinates.worldX, undefined);
  assert.equal(coordinates.worldY, undefined);
});
