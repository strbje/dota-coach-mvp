import type { MatchPhase } from '../types/domain';
import { phaseForEvent } from './deathRules';

type TimedEvent = { timeSeconds: number };
type EventPlayer = {
  heroId?: number;
  isRadiant?: boolean;
  killEvents?: TimedEvent[];
  assistEvents?: TimedEvent[];
};

export type FightRulesSummary = {
  byPhase: Record<MatchPhase, {
    playerKills: number;
    playerAssists: number;
    teamKills: number;
    killParticipation: number | null;
    assistParticipation: number | null;
  }> | null;
  source: 'stratz_stats.killEvents+assistEvents' | 'unavailable';
  readiness: 'normalized' | 'unavailable';
};

const PHASES: MatchPhase[] = ['laning', 'earlyMid', 'midGame', 'lateGame'];
const MATCH_ROSTER_SIZE = 10;
const TEAM_ROSTER_SIZE = 5;

export function evaluateFightRules(players: EventPlayer[] | undefined, selectedHeroId?: number): FightRulesSummary {
  if (!players || selectedHeroId === undefined) return { byPhase: null, source: 'unavailable', readiness: 'unavailable' };
  const selected = players.find((player) => player.heroId === selectedHeroId);
  if (!selected || selected.isRadiant === undefined || !selected.killEvents || !selected.assistEvents) {
    return { byPhase: null, source: 'unavailable', readiness: 'unavailable' };
  }
  const selectedKillEvents = selected.killEvents;
  const selectedAssistEvents = selected.assistEvents;

  const phaseCount = (events: TimedEvent[], phase: MatchPhase) => events.filter((event) => phaseForEvent(event.timeSeconds) === phase).length;
  const heroIds = players.map((player) => player.heroId);
  const hasCompleteUniqueRoster = players.length === MATCH_ROSTER_SIZE
    && heroIds.every((heroId): heroId is number => heroId !== undefined)
    && new Set(heroIds).size === MATCH_ROSTER_SIZE;
  if (!hasCompleteUniqueRoster) return { byPhase: null, source: 'unavailable', readiness: 'unavailable' };
  if (players.some((player) => player.isRadiant === undefined)) return { byPhase: null, source: 'unavailable', readiness: 'unavailable' };
  const teammates = players.filter((player) => player.isRadiant === selected.isRadiant);
  if (teammates.length !== TEAM_ROSTER_SIZE || teammates.some((player) => !player.killEvents)) {
    return { byPhase: null, source: 'unavailable', readiness: 'unavailable' };
  }
  const byPhase = Object.fromEntries(PHASES.map((phase) => {
    const playerKills = phaseCount(selectedKillEvents, phase);
    const playerAssists = phaseCount(selectedAssistEvents, phase);
    const teamKills = teammates.reduce((sum, player) => sum + phaseCount(player.killEvents!, phase), 0);
    return [phase, {
      playerKills,
      playerAssists,
      teamKills,
      killParticipation: teamKills > 0 ? (playerKills + playerAssists) / teamKills : null,
      assistParticipation: teamKills > 0 ? playerAssists / teamKills : null
    }];
  })) as FightRulesSummary['byPhase'];

  return { byPhase, source: 'stratz_stats.killEvents+assistEvents', readiness: 'normalized' };
}
