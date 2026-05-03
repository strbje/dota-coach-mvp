import type { PreGameDraftInput } from '@/lib/dota/types/domain';

function clean(name: string): string {
  return name.trim();
}

export function normalizeDraftInput(input: PreGameDraftInput): PreGameDraftInput {
  return {
    hero: clean(input.hero),
    role: clean(input.role),
    allies: input.allies.map(clean).filter(Boolean),
    enemies: input.enemies.map(clean).filter(Boolean),
    lanes: {
      safe: {
        ally: input.lanes.safe.ally.map(clean).filter(Boolean),
        enemy: input.lanes.safe.enemy.map(clean).filter(Boolean)
      }
    }
  };
}
