export type StratzCoordinates = {
  rawX?: number;
  rawY?: number;
  mapX?: number;
  mapY?: number;
  worldX?: number;
  worldY?: number;
  coordinateSystem: 'stratz_grid_0_255' | 'unknown';
  validation: 'structural_only' | 'invalid';
  productReady: false;
};

/**
 * Research-only interpretation of STRATZ's grid coordinates. The world-space
 * conversion is a hypothesis and must not be used for product map rendering
 * until it has been checked against live match landmarks.
 */
export function normalizeStratzCoordinates(rawX?: number, rawY?: number): StratzCoordinates {
  const hasCompleteFinitePair = Number.isFinite(rawX) && Number.isFinite(rawY);
  const isCandidateGrid = hasCompleteFinitePair
    && (rawX as number) >= 0 && (rawX as number) <= 255
    && (rawY as number) >= 0 && (rawY as number) <= 255;

  return {
    rawX,
    rawY,
    mapX: isCandidateGrid ? (rawX as number) / 255 : undefined,
    mapY: isCandidateGrid ? (rawY as number) / 255 : undefined,
    worldX: isCandidateGrid ? ((rawX as number) - 128) * 128 : undefined,
    worldY: isCandidateGrid ? ((rawY as number) - 128) * 128 : undefined,
    coordinateSystem: isCandidateGrid ? 'stratz_grid_0_255' : 'unknown',
    validation: hasCompleteFinitePair ? 'structural_only' : 'invalid',
    productReady: false
  };
}
