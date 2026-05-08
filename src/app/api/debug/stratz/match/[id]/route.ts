export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  const token = process.env.STRATZ_API_TOKEN;

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ ok: false, hasToken: Boolean(token), error: 'id must be numeric' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ ok: false, hasToken: false, error: 'STRATZ_API_TOKEN missing' }, { status: 200 });
  }

  const query = 'query DebugStratz($id: Long!) { match(id: $id) { id players { steamAccountId heroId } } }';

  try {
    const response = await fetch(STRATZ_GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: matchId } }),
      cache: 'no-store'
    });

    const json = await response.json();
    const match = (json as { data?: { match?: { id?: number; players?: Array<Record<string, unknown>> } } }).data?.match;

    return NextResponse.json({
      ok: response.ok,
      hasToken: true,
      matchId,
      dataShape: match ? { id: match.id, playersCount: Array.isArray(match.players) ? match.players.length : 0 } : null,
      availableFields: match ? ['match.id', 'match.players[].steamAccountId', 'match.players[].heroId'] : [],
      notes: ['Research/debug output only.', 'Use STRATZ GraphQL Explorer to verify advanced death/fight/map fields.']
    });
  } catch (error) {
    const parsed = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, hasToken: true, matchId, error: parsed, notes: ['Use STRATZ GraphQL Explorer to fill query if schema differs.'] }, { status: 502 });
  }
}
