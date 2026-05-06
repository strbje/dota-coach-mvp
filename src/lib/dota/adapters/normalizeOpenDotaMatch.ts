import { formatGameTime, getItemIconUrlByKey, getItemNameById, getItemNameByKey } from '@/lib/dota/constants/items';
import { getMatchPhase, getPhaseLabel, type MatchPhase } from '@/lib/dota/rules/postMatch/phases';
import { normalizeObjectiveType } from '@/lib/dota/rules/postMatch/objectives';
import type { NormalizedOpenDotaMatch } from '@/lib/dota/types/domain';
import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

const TRACKED_ITEM_KEYS = new Set([
  'phase_boots', 'armlet', 'desolator', 'basher', 'black_king_bar', 'sange_and_yasha', 'assault', 'abyssal_blade', 'satanic',
  'mjollnir', 'radiance', 'monkey_king_bar', 'butterfly', 'heart'
]);

function toNumber(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function toBoolean(value: unknown, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback; }

function initPhaseCounts() { return { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 }; }

export function normalizeOpenDotaMatch(payload: OpenDotaMatchResponse, heroName = 'Lifestealer'): NormalizedOpenDotaMatch {
  const players = Array.isArray(payload.players) ? payload.players : [];
  const playerRaw = players.find((p) => toNumber((p as Record<string, unknown>).hero_id, -1) === 54) as Record<string, unknown> | undefined;
  if (!playerRaw) throw new Error('Target hero/player not found in OpenDota payload');

  const durationSeconds = toNumber(payload.duration);
  const durationMinutes = durationSeconds > 0 ? durationSeconds / 60 : 0;
  const kills = toNumber(playerRaw.kills);
  const assists = toNumber(playerRaw.assists);
  const lastHits = toNumber(playerRaw.last_hits);
  const heroDamage = toNumber(playerRaw.hero_damage);
  const deaths = toNumber(playerRaw.deaths);

  const rawPurchaseLog = Array.isArray(playerRaw.purchase_log) ? (playerRaw.purchase_log as Array<Record<string, unknown>>) : null;
  const itemTimingSource = rawPurchaseLog ? 'purchase_log' : 'unavailable';
  const seen = new Set<string>();
  const itemTimings = (rawPurchaseLog ?? [])
    .filter((entry) => typeof entry.key === 'string' && TRACKED_ITEM_KEYS.has(entry.key) && typeof entry.time === 'number')
    .filter((entry) => (seen.has(entry.key as string) ? false : (seen.add(entry.key as string), true)))
    .map((entry) => {
      const timeSeconds = toNumber(entry.time);
      return { key: entry.key as string, item: getItemNameByKey(entry.key as string), time: formatGameTime(timeSeconds), timeSeconds, iconUrl: getItemIconUrlByKey(entry.key as string) ?? undefined, source: 'purchase_log' as const };
    });

  const rawDeathsLog = Array.isArray(playerRaw.deaths_log) ? (playerRaw.deaths_log as Array<Record<string, unknown>>) : null;
  const rawDeathLog = Array.isArray(playerRaw.death_log) ? (playerRaw.death_log as Array<Record<string, unknown>>) : null;
  const deathSource = rawDeathsLog ? 'deaths_log' : rawDeathLog ? 'death_log' : 'unavailable';
  const deathEntries = (rawDeathsLog ?? rawDeathLog ?? []).filter((entry) => typeof entry.time === 'number');
  const deathTimings = deathEntries.map((entry) => {
    const timeSeconds = toNumber(entry.time);
    const phase = getMatchPhase(timeSeconds);
    return { timeSeconds, time: formatGameTime(timeSeconds), phase, phaseLabel: getPhaseLabel(phase) };
  });
  const deathsByPhase = deathTimings.length ? deathTimings.reduce((acc, d) => (acc[d.phase] += 1, acc), initPhaseCounts()) : undefined;

  const keyItems = ['armlet', 'desolator', 'black_king_bar', 'sange_and_yasha', 'phase_boots'];
  const deathsAfterItemTimings = deathTimings.length
    ? itemTimings.filter((t) => keyItems.includes(t.key)).map((it) => ({
        itemKey: it.key,
        item: it.item,
        itemTime: it.time,
        deathsWithin5Min: deathTimings.filter((d) => d.timeSeconds >= it.timeSeconds && d.timeSeconds <= it.timeSeconds + 300).length,
        deathsWithin10Min: deathTimings.filter((d) => d.timeSeconds >= it.timeSeconds && d.timeSeconds <= it.timeSeconds + 600).length
      }))
    : [];

  const rawObjectives = Array.isArray((payload as Record<string, unknown>).objectives) ? ((payload as Record<string, unknown>).objectives as Array<Record<string, unknown>>) : [];
  const objectiveEvents = rawObjectives
    .filter((o) => typeof o.time === 'number' && typeof o.type === 'string')
    .map((o) => {
      const timeSeconds = toNumber(o.time);
      const isPlayerTeam = (typeof o.team === 'number') ? (toNumber(o.team) === (toBoolean(playerRaw.isRadiant) ? 2 : 3)) : undefined;
      return { timeSeconds, time: formatGameTime(timeSeconds), type: String(o.type), phase: getMatchPhase(timeSeconds), isPlayerTeam };
    });

  const itemObjectiveWindows = objectiveEvents.length
    ? itemTimings.filter((t) => ['armlet', 'desolator'].includes(t.key)).map((it) => {
        const inside = objectiveEvents.filter((o) => o.timeSeconds >= it.timeSeconds && o.timeSeconds <= it.timeSeconds + 600);
        const teamAttributed = inside.length > 0 && inside.every((o) => o.isPlayerTeam === true);
        return { itemKey: it.key, item: it.item, itemTime: it.time, objectivesWithin10Min: inside.length, objectiveTypes: [...new Set(inside.map((x) => normalizeObjectiveType(x.type)))], attributedToPlayerTeam: teamAttributed };
      })
    : [];

  const goldT = Array.isArray(playerRaw.gold_t) ? playerRaw.gold_t.map((v) => toNumber(v, NaN)) : null;
  const lhT = Array.isArray(playerRaw.lh_t) ? playerRaw.lh_t.map((v) => toNumber(v, NaN)) : null;
  const economyByPhaseSource = goldT && lhT && goldT.length > 5 && lhT.length > 5 ? 'gold_t/lh_t' : 'unavailable';

  const laneEfficiency = typeof playerRaw.lane_efficiency === 'number' ? toNumber(playerRaw.lane_efficiency) : undefined;
  const laneEfficiencyPct = typeof playerRaw.lane_efficiency_pct === 'number' ? toNumber(playerRaw.lane_efficiency_pct) : undefined;
  const lhAt10 = lhT && lhT.length ? lhT[Math.min(10, lhT.length - 1)] : undefined;
  const goldAt10 = goldT && goldT.length ? goldT[Math.min(10, goldT.length - 1)] : undefined;
  const deathsBefore10 = deathTimings.length ? deathTimings.filter((d) => d.timeSeconds <= 600).length : undefined;
  const laneSource = laneEfficiencyPct !== undefined || (lhAt10 !== undefined && goldAt10 !== undefined) ? 'opendota' : (laneEfficiency !== undefined || lhAt10 !== undefined || goldAt10 !== undefined || deathsBefore10 !== undefined ? 'partial' : 'unavailable');
  const phaseRanges: Array<[MatchPhase, number, number | null]> = [['laning', 0, 10], ['earlyMid', 10, 20], ['midGame', 20, 35], ['lateGame', 35, null]];
  const economyByPhase = economyByPhaseSource === 'gold_t/lh_t' ? Object.fromEntries(phaseRanges.map(([phase, start, end]) => {
    const startIdx = Math.min(start, goldT!.length - 1);
    const endIdx = Math.min((end ?? Math.floor(durationSeconds / 60)), goldT!.length - 1);
    const goldStart = goldT![startIdx]; const goldEnd = goldT![endIdx]; const lhStart = lhT![startIdx]; const lhEnd = lhT![endIdx];
    return [phase, { goldStart, goldEnd, goldDelta: goldEnd - goldStart, lhStart, lhEnd, lhDelta: lhEnd - lhStart }];
  })) as Record<MatchPhase, { goldStart?: number; goldEnd?: number; goldDelta?: number; lhStart?: number; lhEnd?: number; lhDelta?: number; }> : undefined;

  const rawItemIds = [0, 1, 2, 3, 4, 5].map((slot) => toNumber(playerRaw[`item_${slot}`]));
  const unknownItemIds = rawItemIds.filter((id) => id > 0 && !getItemNameById(id));
  const buildPlayed = rawItemIds.map((id) => getItemNameById(id)).filter((name): name is string => Boolean(name));
  const teamKey = toBoolean(playerRaw.isRadiant) ? 'radiant_score' : 'dire_score';
  const teamKillsRaw = payload[teamKey as keyof OpenDotaMatchResponse];
  const teamKills = typeof teamKillsRaw === 'number' && teamKillsRaw > 0 ? teamKillsRaw : null;

  return { matchId: toNumber(payload.match_id), didRadiantWin: toBoolean(payload.radiant_win), durationSeconds, player: {
    heroName, isRadiant: toBoolean(playerRaw.isRadiant), durationMinutes, kills, deaths, assists, lastHits,
    lastHitsPerMin: durationMinutes > 0 ? lastHits / durationMinutes : 0, heroDamage, heroDamagePerMin: durationMinutes > 0 ? heroDamage / durationMinutes : 0,
    gpm: toNumber(playerRaw.gold_per_min), xpm: toNumber(playerRaw.xp_per_min), killParticipation: teamKills ? (kills + assists) / teamKills : undefined,
    item0: rawItemIds[0], item1: rawItemIds[1], item2: rawItemIds[2], item3: rawItemIds[3], item4: rawItemIds[4], item5: rawItemIds[5],
    itemTimings, itemTimingSource, buildPlayed,
    rawPurchaseLogPreview: (rawPurchaseLog ?? []).filter((e) => typeof e.key === 'string' && typeof e.time === 'number').slice(0, 30).map((e) => ({ key: e.key as string, time: toNumber(e.time) })),
    rawItemIds, unknownItemIds,
    deathTimings, deathsByPhase, deathDataSource: deathTimings.length ? deathSource : 'unavailable',
    fightParticipationByPhaseSource: 'unavailable',
    deathsAfterItemTimings,
    objectiveEvents,
    itemObjectiveWindows,
    economyByPhaseSource,
    economyByPhase,
    lane: { lane: typeof playerRaw.lane === 'number' ? toNumber(playerRaw.lane) : undefined, laneRole: typeof playerRaw.lane_role === 'number' ? toNumber(playerRaw.lane_role) : undefined, laneEfficiency, laneEfficiencyPct, lhAt10, goldAt10, deathsBefore10, source: laneSource }
  }};
}
