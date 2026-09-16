export const STRATZ_GRID_MIN = 0;
export const STRATZ_GRID_MAX = 255;
export const DOTA_WORLD_UNITS_PER_GRID_CELL = 128;
export const DOTA_WORLD_GRID_ORIGIN = 128;

export type StratzCoordinateSystem = 'stratz_grid_0_255' | 'dota_world_units' | 'unknown';
export type CoordinateValidation = 'structural_only' | 'invalid';

export type NormalizedStratzCoordinates = {
  rawX: number;
  rawY: number;
  coordinateSystem: StratzCoordinateSystem;
  mapX?: number;
  mapY?: number;
  worldX?: number;
  worldY?: number;
  validation: CoordinateValidation;
  productReady: false;
};

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Keeps raw STRATZ coordinates and provides deterministic research projections.
 * A projection is not evidence that the STRATZ coordinate semantics are correct;
 * known-landmark validation is still required before product use.
 */
export function normalizeStratzCoordinates(x: unknown, y: unknown): NormalizedStratzCoordinates | undefined {
  if (!isFiniteCoordinate(x) || !isFiniteCoordinate(y)) return undefined;

  const isGrid = x >= STRATZ_GRID_MIN && x <= STRATZ_GRID_MAX && y >= STRATZ_GRID_MIN && y <= STRATZ_GRID_MAX;
  if (isGrid) {
    return {
      rawX: x,
      rawY: y,
      coordinateSystem: 'stratz_grid_0_255',
      mapX: x / STRATZ_GRID_MAX,
      mapY: y / STRATZ_GRID_MAX,
      worldX: (x - DOTA_WORLD_GRID_ORIGIN) * DOTA_WORLD_UNITS_PER_GRID_CELL,
      worldY: (y - DOTA_WORLD_GRID_ORIGIN) * DOTA_WORLD_UNITS_PER_GRID_CELL,
      validation: 'structural_only',
      productReady: false
    };
  }

  // Values outside the byte-sized replay grid can be retained as possible
  // Source 2 world units, but are deliberately not projected onto the map.
  const looksLikeWorldUnits = Math.abs(x) <= 32768 && Math.abs(y) <= 32768;
  return {
    rawX: x,
    rawY: y,
    coordinateSystem: looksLikeWorldUnits ? 'dota_world_units' : 'unknown',
    validation: looksLikeWorldUnits ? 'structural_only' : 'invalid',
    productReady: false
  };
}
