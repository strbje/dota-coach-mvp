import type { PreGameDraftInput } from '../types/domain';

const aliases: Record<string, string> = { lifestealer: 'Lifestealer', naix: 'Lifestealer', 'найкс': 'Lifestealer', lion: 'Lion', 'лион': 'Lion', tusk: 'Tusk', 'таск': 'Tusk', 'legion commander': 'Legion Commander', lc: 'Legion Commander', 'легионка': 'Legion Commander' };
export function laneHero(value: string) { const name = value.trim(); return Object.hasOwn(aliases, name.toLowerCase()) ? aliases[name.toLowerCase()] : name; }
export function validLaneInput(value: unknown): value is PreGameDraftInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as PreGameDraftInput;
  if (typeof input.hero !== 'string' || typeof input.role !== 'string' || !input.role.trim()) return false;
  const ally = input.lanes?.safe?.ally, enemy = input.lanes?.safe?.enemy;
  if (!Array.isArray(ally) || !Array.isArray(enemy) || ally.length !== 2 || enemy.length !== 2
    || !Array.isArray(input.allies) || !Array.isArray(input.enemies)) return false;
  const names = [...ally, ...enemy];
  return names.every((name) => typeof name === 'string' && name.trim().length > 0 && name.length <= 60 && !name.includes(','))
    && new Set(names.map((name) => laneHero(name).toLowerCase())).size === 4
    && ally.some((name) => laneHero(name) === input.hero)
    && [...input.allies, ...input.enemies].every((name) => typeof name === 'string' && name.length <= 60);
}
