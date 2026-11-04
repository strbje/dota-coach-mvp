import { normalizeStratzCoordinates } from '../normalize/stratzCoordinates';

export type XY = [number, number];
export type RawXY = [number | null, number | null];
export type FarmCategory = 'lane' | 'neutral' | 'ancient' | 'unclassified';
export type Executor = 'hero' | 'skeleton' | 'unknown';
export type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };
export type FarmEvent = {
  index: number; time: number; xy: RawXY; category: FarmCategory;
  executor: Executor; target: string; replayTime: number;
};
export type DeathCase = {
  index: number; time: number; replayTime: number; eventXY: RawXY; candidateXY: RawXY;
  candidateTime: number | null; confidence: string; sameCell: boolean | null;
  worldError: number | null; referenceWorld: XY; referenceTime: number; referenceCell: XY;
};
export type FarmExample = {
  index: number; hero: { time: number; world: XY };
  dyingCandidates: Array<{ time: number; world: XY; className: string; handle: number }>;
};
export type ReviewMatch = {
  id: number; side: 'Radiant' | 'Dire'; heroId: number; slot: number;
  duration: number; gameVersion: number; lastHits: number; decodeSha256: string;
  farm: FarmEvent[]; farmExamples: FarmExample[]; deaths: DeathCase[];
  landmarks: Array<{ label: string; time: number; team: number; world: XY; cell: XY }>;
  bounds: Bounds;
};
export type ReviewData = {
  schemaVersion: 1; productReady: false;
  source: { captureSha256: string; protocolSha256: string; builderSha256: string;
    synthetic: false; csJoin: string; mapAssetStatus: 'unavailable' };
  matches: ReviewMatch[];
};

// This page has no production opt-in, query bypass or link in product navigation.
export const isCoordinateReviewEnabled = (nodeEnv: string | undefined) => nodeEnv === 'development';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const pair = (value: unknown, nullable = false) => Array.isArray(value) && value.length === 2
  && value.every((part) => finite(part) || (nullable && part === null));
const categories = ['lane', 'neutral', 'ancient', 'unclassified'];
const executors = ['hero', 'skeleton', 'unknown'];
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function parseReviewData(value: unknown): ReviewData {
  const fail = () => { throw new Error('Контрольный набор повреждён или имеет неподдерживаемый формат.'); };
  if (!record(value) || value.schemaVersion !== 1 || value.productReady !== false
    || !record(value.source) || value.source.synthetic !== false || value.source.mapAssetStatus !== 'unavailable'
    || !['captureSha256', 'protocolSha256', 'builderSha256'].every((key) => hash(value.source && (value.source as Record<string, unknown>)[key]))
    || typeof value.source.csJoin !== 'string' || !Array.isArray(value.matches)) return fail();
  const ids = new Set<number>();
  for (const m of value.matches) {
    if (!record(m) || !finite(m.id) || !Number.isSafeInteger(m.id) || ids.has(m.id)
      || !['Radiant', 'Dire'].includes(String(m.side)) || m.heroId !== 42 || !finite(m.slot)
      || !finite(m.duration) || m.duration <= 0 || !finite(m.gameVersion) || !hash(m.decodeSha256)
      || !record(m.bounds) || !Object.values(m.bounds).every(finite)
      || !validBounds(m.bounds as Bounds) || !Array.isArray(m.farm) || !Array.isArray(m.deaths)
      || !Array.isArray(m.landmarks) || !Array.isArray(m.farmExamples) || m.lastHits !== m.farm.length) return fail();
    ids.add(m.id);
    const eventIds = new Set<number>();
    for (const e of m.farm) {
      if (!record(e) || !finite(e.index) || !Number.isInteger(e.index) || eventIds.has(e.index)
        || !finite(e.time) || !finite(e.replayTime) || !pair(e.xy, true)
        || !categories.includes(String(e.category)) || !executors.includes(String(e.executor))
        || typeof e.target !== 'string') return fail();
      eventIds.add(e.index);
    }
    for (const d of m.deaths) {
      if (!record(d) || !finite(d.index) || !finite(d.time) || !finite(d.replayTime)
        || !pair(d.eventXY, true) || !pair(d.candidateXY, true) || !pair(d.referenceWorld) || !pair(d.referenceCell)
        || !finite(d.referenceTime) || !(d.candidateTime === null || finite(d.candidateTime))
        || !(d.worldError === null || finite(d.worldError)) || !(d.sameCell === null || typeof d.sameCell === 'boolean')
        || typeof d.confidence !== 'string') return fail();
    }
    for (const p of m.landmarks) {
      if (!record(p) || typeof p.label !== 'string' || !finite(p.time) || !finite(p.team) || !pair(p.world) || !pair(p.cell)) return fail();
    }
    for (const e of m.farmExamples) {
      if (!record(e) || !finite(e.index) || !eventIds.has(e.index) || !record(e.hero)
        || !finite(e.hero.time) || !pair(e.hero.world) || !Array.isArray(e.dyingCandidates)) return fail();
      if (!e.dyingCandidates.every((p) => record(p) && finite(p.time) && pair(p.world)
        && typeof p.className === 'string' && finite(p.handle))) return fail();
    }
  }
  return value as ReviewData;
}

export function gridOrigin(xy: RawXY): XY | null {
  const position = normalizeStratzCoordinates(xy[0] ?? undefined, xy[1] ?? undefined);
  return position.worldX === undefined || position.worldY === undefined ? null : [position.worldX, position.worldY];
}

export function validBounds(bounds: Bounds) {
  return [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].every(Number.isFinite)
    && bounds.xMin < bounds.xMax && bounds.yMin < bounds.yMax;
}

// A cartesian research plane. This is not the product's unvalidated raw/255 map projection.
export function projectWorld(world: XY, bounds: Bounds): XY {
  if (!validBounds(bounds) || !world.every(Number.isFinite)) throw new Error('Некорректная область схемы');
  const scale = 1000 / (bounds.xMax - bounds.xMin);
  return [(world[0] - bounds.xMin) * scale, (bounds.yMax - world[1]) * scale];
}

export type FarmFilter = { from: number; to: number; category: FarmCategory | 'all'; executor: Executor | 'all' };
export function filterFarm(events: FarmEvent[], filter: FarmFilter) {
  if (!Number.isFinite(filter.from) || !Number.isFinite(filter.to) || filter.from > filter.to) return [];
  return events.filter((e) => e.time >= filter.from && e.time <= filter.to
    && (filter.category === 'all' || e.category === filter.category)
    && (filter.executor === 'all' || e.executor === filter.executor));
}

export function farmSummary(events: FarmEvent[]) {
  const usable = events.filter((e) => gridOrigin(e.xy) !== null).length;
  return { total: events.length, usable, missing: events.length - usable,
    hero: events.filter((e) => e.executor === 'hero').length,
    skeleton: events.filter((e) => e.executor === 'skeleton').length,
    unknownExecutor: events.filter((e) => e.executor === 'unknown').length };
}

export function formatReviewTime(time: number) {
  const seconds = Math.floor(Math.abs(time));
  return `${time < 0 ? '−' : ''}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
