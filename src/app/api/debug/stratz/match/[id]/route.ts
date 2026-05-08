export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

type QueryMode = 'basic' | 'playerDeep' | 'teamfightsProbe';

const QUERY_BY_MODE: Record<QueryMode, { name: string; query: string; availableFields: string[] }> = {
  basic: {
    name: 'DebugStratz',
    query: 'query DebugStratz($id: Long!) { match(id: $id) { id players { steamAccountId heroId } } }',
    availableFields: ['match.id', 'match.players[].steamAccountId', 'match.players[].heroId']
  },
  playerDeep: {
    name: 'DebugStratzPlayerDeep',
    query: 'query DebugStratzPlayerDeep($id: Long!) { match(id: $id) { id durationSeconds players { steamAccountId heroId kills deaths assists goldPerMinute experiencePerMinute networth level item0Id item1Id item2Id item3Id item4Id item5Id } } }',
    availableFields: [
      'match.id', 'match.durationSeconds', 'match.players[].steamAccountId', 'match.players[].heroId', 'match.players[].kills', 'match.players[].deaths', 'match.players[].assists',
      'match.players[].goldPerMinute', 'match.players[].experiencePerMinute', 'match.players[].networth', 'match.players[].level', 'match.players[].item0Id..item5Id'
    ]
  },
  teamfightsProbe: {
    name: 'DebugStratzTeamfights',
    query: 'query DebugStratzTeamfights($id: Long!) { match(id: $id) { id teamfights { start end lastDeath deaths } } }',
    availableFields: ['match.id', 'match.teamfights[].start', 'match.teamfights[].end', 'match.teamfights[].lastDeath', 'match.teamfights[].deaths']
  }
};

function toMode(raw: string | null): QueryMode {
  return raw === 'playerDeep' || raw === 'teamfightsProbe' ? raw : 'basic';
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  const token = process.env.STRATZ_API_TOKEN;
  const mode = toMode(new URL(request.url).searchParams.get('query'));
  const selected = QUERY_BY_MODE[mode];

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

    return NextResponse.json({
      ok: isOk,
      hasToken: true,
      matchId,
      endpoint: STRATZ_GRAPHQL_URL,
      queryName: selected.name,
      status: response.status,
      statusText: response.statusText,
      contentType,
      bodyLength: text.length,
      bodyPreview: text.slice(0, 500),
      dataShape: match ? { id: match.id, durationSeconds: match.durationSeconds, playersCount: Array.isArray(match.players) ? match.players.length : 0 } : null,
      availableFields: match ? selected.availableFields : [],
      errors,
      notes: [
        'Research/debug output only; do not wire this route into product UI.',
        'If a field fails in GraphQL, treat it as unconfirmed and validate via schema discovery.',
        mode === 'teamfightsProbe' ? 'teamfights on MatchType is currently not confirmed and may return GraphQL field errors.' : 'Use query=teamfightsProbe to verify current schema support for teamfight data.'
      ]
    });
  } catch (error) {
    const parsed = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, hasToken: true, matchId, endpoint: STRATZ_GRAPHQL_URL, queryName: selected.name, errors: [parsed], notes: ['Transport or parse failure while probing STRATZ debug endpoint.'] }, { status: 502 });
  }
}
