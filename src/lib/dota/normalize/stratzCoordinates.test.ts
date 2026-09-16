import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeStratzCoordinates,
  DOTA_WORLD_UNITS_PER_GRID_CELL
} from './stratzCoordinates';

test('projects a STRATZ replay-grid sample without marking it product-ready', () => {
  const sample = normalizeStratzCoordinates(128, 128);

  assert.deepEqual(sample, {
    rawX: 128,
    rawY: 128,
    coordinateSystem: 'stratz_grid_0_255',
    mapX: 128 / 255,
    mapY: 128 / 255,
    worldX: 0,
    worldY: 0,
    validation: 'structural_only',
    productReady: false
  });
});

test('uses 128 Source 2 world units per replay-grid cell', () => {
  const sample = normalizeStratzCoordinates(129, 127);

  assert.equal(sample?.worldX, DOTA_WORLD_UNITS_PER_GRID_CELL);
  assert.equal(sample?.worldY, -DOTA_WORLD_UNITS_PER_GRID_CELL);
});

test('retains plausible world coordinates but does not invent a map projection', () => {
  const sample = normalizeStratzCoordinates(-3200, 4700);

  assert.equal(sample?.coordinateSystem, 'dota_world_units');
  assert.equal(sample?.mapX, undefined);
  assert.equal(sample?.productReady, false);
});

test('rejects incomplete coordinate pairs', () => {
  assert.equal(normalizeStratzCoordinates(128, undefined), undefined);
});
