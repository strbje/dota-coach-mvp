export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { normalizeStratzMatch } from '@/lib/dota/adapters/normalizeStratzMatch';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

const SUPPORTED_QUERY_MODES = ['basic', 'playerDeep', 'teamfightsProbe', 'eventsProbe', 'playbackProbe', 'heroAverageProbe'] as const;
type QueryMode = (typeof SUPPORTED_QUERY_MODES)[number];

type QueryConfig = { name: string; query: string; availableFields: string[] };

const QUERY_BY_MODE: Record<QueryMode, QueryConfig> = {
  basic: {
    name: 'DebugStratz',
    query: `query DebugStratz($id: Long!) {
      match(id: $id) {
        id
        players {
          steamAccountId
          heroId
        }
      }
    }`,
    availableFields: ['match.id', 'match.players[].steamAccountId', 'match.players[].heroId']
  },
  playerDeep: {
    name: 'DebugStratzPlayerDeep',
    query: `query DebugStratzPlayerDeep($id: Long!) {
      match(id: $id) {
        id
        durationSeconds
        didRadiantWin
        averageImp
        players {
          steamAccountId
          playerSlot
          isRadiant
          isVictory
          heroId
          kills
          deaths
          assists
          numLastHits
          numDenies
          goldPerMinute
          experiencePerMinute
          networth
          level
          gold
          goldSpent
          heroDamage
          towerDamage
          heroHealing
          lane
          position
          role
          roleBasic
          imp
          award
          item0Id
          item1Id
          item2Id
          item3Id
          item4Id
          item5Id
          backpack0Id
          backpack1Id
          backpack2Id
          neutral0Id
        }
      }
    }`,
    availableFields: [
      'match.id', 'match.durationSeconds', 'match.didRadiantWin', 'match.averageImp',
      'match.players[].steamAccountId', 'match.players[].playerSlot', 'match.players[].isRadiant', 'match.players[].isVictory',
      'match.players[].heroId', 'match.players[].kills', 'match.players[].deaths', 'match.players[].assists',
      'match.players[].numLastHits', 'match.players[].numDenies',
      'match.players[].goldPerMinute', 'match.players[].experiencePerMinute', 'match.players[].networth', 'match.players[].level',
      'match.players[].gold', 'match.players[].goldSpent', 'match.players[].heroDamage', 'match.players[].towerDamage', 'match.players[].heroHealing',
      'match.players[].lane', 'match.players[].position', 'match.players[].role', 'match.players[].roleBasic', 'match.players[].imp', 'match.players[].award',
      'match.players[].item0Id..item5Id', 'match.players[].backpack0Id..backpack2Id', 'match.players[].neutral0Id'
    ]
  },
  teamfightsProbe: {
    name: 'DebugStratzTeamfights',
    query: `query DebugStratzTeamfights($id: Long!) {
      match(id: $id) {
        id
        teamfights {
          start
          end
          lastDeath
          deaths
        }
      }
    }`,
    availableFields: ['match.id', 'match.teamfights[].start', 'match.teamfights[].end', 'match.teamfights[].lastDeath', 'match.teamfights[].deaths']
  },
  eventsProbe: {
    name: 'DebugStratzEvents',
    query: `query DebugStratzEvents($id: Long!) {
      match(id: $id) {
        id
        durationSeconds
        chatEvents {
          time
          type
          fromHeroId
          toHeroId
          value
          isRadiant
        }
        players {
          steamAccountId
          heroId
          isRadiant
          stats {
            killEvents {
              time
            }
            deathEvents {
              time
            }
            assistEvents {
              time
            }
          }
        }
      }
    }`,
    availableFields: ['match.chatEvents[]', 'match.players[].stats.killEvents[]', 'match.players[].stats.deathEvents[]', 'match.players[].stats.assistEvents[]']
  },
  playbackProbe: {
    name: 'DebugStratzPlayback',
    query: `query DebugStratzPlayback($id: Long!) {
      match(id: $id) {
        id
        playbackData {
          roshanEvents {
            time
            x
            y
            totalDamageTaken
            item0
            item1
            item2
            item3
            item4
            item5
          }
          buildingEvents {
            time
            type
            positionX
            positionY
            isRadiant
            npcId
          }
          towerDeathEvents {
            time
            radiant
            dire
          }
          wardEvents {
            time
            positionX
            positionY
            fromPlayer
            wardType
            action
            playerDestroyed
          }
        }
        players {
          steamAccountId
          heroId
          playbackData {
            playerUpdatePositionEvents {
              time
            }
            killEvents {
              time
            }
            deathEvents {
              time
            }
            purchaseEvents {
              time
            }
            goldEvents {
              time
            }
          }
        }
      }
    }`,
    availableFields: ['match.playbackData.roshanEvents[]', 'match.playbackData.buildingEvents[]', 'match.playbackData.towerDeathEvents[]', 'match.playbackData.wardEvents[]', 'match.players[].playbackData.*Events[]']
  },
  heroAverageProbe: {
    name: 'DebugStratzHeroAverage',
    query: `query DebugStratzHeroAverage($id: Long!) {
      match(id: $id) {
        id
        players {
          steamAccountId
          heroId
          position
          role
          roleBasic
          heroAverage {
            heroId
            time
            position
            matchCount
            winCount
            kills
            deaths
            assists
            networth
            xp
            cs
            neutrals
            heroDamage
            towerDamage
            goldPerMinute
            teamKills
            goldLost
            goldFed
            buybackCount
            ancients
            kDAAverage
            killContributionAverage
          }
        }
      }
    }`,
    availableFields: ['match.players[].heroAverage.heroId', 'match.players[].heroAverage.time', 'match.players[].heroAverage.matchCount', 'match.players[].heroAverage.kDAAverage']
  }
};

function parseQueryMode(raw: string | null): QueryMode | null {
  if (!raw) return 'basic';
  return (SUPPORTED_QUERY_MODES as readonly string[]).includes(raw) ? (raw as QueryMode) : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  const token = process.env.STRATZ_API_TOKEN;
  const { searchParams } = new URL(request.url);
  const queryMode = parseQueryMode(searchParams.get('query'));

  if (!queryMode) {
    return NextResponse.json({ ok: false, error: 'Unknown STRATZ debug query mode', supportedModes: SUPPORTED_QUERY_MODES }, { status: 400 });
  }

  const selected = QUERY_BY_MODE[queryMode];

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ ok: false, hasToken: Boolean(token), matchId: id, error: 'id must be numeric' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ ok: false, hasToken: false, matchId, endpoint: STRATZ_GRAPHQL_URL, queryName: selected.name, error: 'STRATZ_API_TOKEN missing' }, { status: 200 });
  }

  try {
    const response = await fetch(STRATZ_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dota-coach-mvp/0.1 local-dev'
      },
      body: JSON.stringify({ query: selected.query, variables: { id: matchId } }),
      cache: 'no-store'
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const mayBeJson = contentType.includes('application/json') || contentType.includes('application/graphql-response+json') || text.trim().startsWith('{');
    const parsed = mayBeJson ? JSON.parse(text) as { data?: { match?: { id?: number; durationSeconds?: number; players?: Array<Record<string, unknown>> } }; errors?: Array<{ message?: string }> } : null;
    const match = parsed?.data?.match;
    const errors = parsed?.errors?.map((entry) => entry.message ?? 'Unknown GraphQL error') ?? [];

    const isOk = response.ok && errors.length === 0;

    const normalizedPack = parsed?.data ? normalizeStratzMatch(parsed.data) : null;
    const normalizedSummary = normalizedPack ? buildNormalizedSummary(queryMode, normalizedPack) : null;

    return NextResponse.json({
      ok: isOk,
      hasToken: true,
      matchId,
      endpoint: STRATZ_GRAPHQL_URL,
      queryMode,
      queryName: selected.name,
      status: response.status,
      statusText: response.statusText,
      contentType,
      bodyLength: text.length,
      bodyPreview: text.slice(0, 1000),
      dataShape: match ? { id: match.id, durationSeconds: match.durationSeconds, playersCount: Array.isArray(match.players) ? match.players.length : 0 } : null,
      normalizedSummary,
      availableFields: match ? selected.availableFields : [],
      errors,
      notes: [
        'Research/debug output only; do not wire this route into product UI.',
        'If a field fails in GraphQL, treat it as unconfirmed and validate via schema discovery.',
        queryMode === 'teamfightsProbe'
          ? 'teamfights on MatchType is currently not confirmed and may return GraphQL field errors.'
          : 'Probe modes can return GraphQL errors while schema discovery is in progress; this is expected research output.'
      ]
    });
  } catch (error) {
    const parsed = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, hasToken: true, matchId, endpoint: STRATZ_GRAPHQL_URL, queryMode, queryName: selected.name, errors: [parsed], notes: ['Transport or parse failure while probing STRATZ debug endpoint.'] }, { status: 502 });
  }
}


function buildNormalizedSummary(queryMode: QueryMode, pack: ReturnType<typeof normalizeStratzMatch>) {
  const selected = pack.normalized.selectedPlayer;
  const baseSelected = {
    heroId: selected?.heroId,
    steamAccountId: selected?.steamAccountId,
    selectedBy: pack.selectedBy
  };

  if (queryMode === 'playerDeep' || queryMode === 'basic') {
    return { selectedPlayer: baseSelected, summary: selected, dataAvailability: pack.normalized.dataAvailability };
  }

  if (queryMode === 'eventsProbe') {
    return {
      selectedPlayer: baseSelected,
      eventSummary: {
        killEventsCount: selected?.killEvents?.length ?? 0,
        deathEventsCount: selected?.deathEvents?.length ?? 0,
        assistEventsCount: selected?.assistEvents?.length ?? 0,
        firstKillEventsPreview: (selected?.killEvents ?? []).slice(0, 5),
        firstDeathEventsPreview: (selected?.deathEvents ?? []).slice(0, 5),
        firstAssistEventsPreview: (selected?.assistEvents ?? []).slice(0, 5),
        deathEventsTimeAvailable: pack.deathTimings.length > 0,
        deathTimings: pack.deathTimings,
        deathsByPhase: pack.deathsByPhase
      }
    };
  }

  if (queryMode === 'playbackProbe') {
    return {
      selectedPlayer: baseSelected,
      positionSamplesCount: pack.positionSamples.length,
      positionSamplesPreview: { first: pack.positionSamples.slice(0, 5), last: pack.positionSamples.slice(-5) },
      deathPositionSamplesPreview: pack.deathPositionSamples.slice(0, 5),
      objectivePlaybackSummary: pack.objectivePlaybackSummary
    };
  }

  if (queryMode === 'heroAverageProbe') {
    const byTime = [10,20,30,40].map((t) => pack.heroAverage.find((x) => x.time === t)).filter(Boolean);
    return {
      selectedPlayer: baseSelected,
      heroAverageBenchmarkPreview: {
        source: 'stratz_hero_average',
        entriesCount: pack.heroAverage.length,
        selectedPosition: selected?.position,
        samples: [...pack.heroAverage.slice(0,5), ...byTime].slice(0,8),
        productReady: false
      }
    };
  }

  return { selectedPlayer: baseSelected, dataAvailability: pack.normalized.dataAvailability };
}
