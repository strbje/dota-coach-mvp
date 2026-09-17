export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { toPublicPostMatchError } from '@/lib/dota/errors/postMatchError';
import { getMatchPlayerOptions } from '@/lib/dota/selection/matchPlayers';
import { ensureOpenDotaConstantsLoaded } from '@/lib/dota/providers/opendotaConstantsProvider';

export async function GET(request: Request) {
  const matchId = Number(new URL(request.url).searchParams.get('matchId'));
  if (!Number.isFinite(matchId) || matchId <= 0) return NextResponse.json({ error: 'Введите корректный Match ID.', errorCode: 'INVALID_MATCH_ID' }, { status: 400 });
  try {
    const payload = await fetchOpenDotaMatch(matchId);
    await ensureOpenDotaConstantsLoaded();
    const players = getMatchPlayerOptions(payload);
    return NextResponse.json({ matchId, players });
  } catch (error) {
    console.error('[post-match] player list failed', error);
    const publicError = toPublicPostMatchError(error);
    return NextResponse.json({ error: publicError.error, errorCode: publicError.errorCode }, { status: publicError.status });
  }
}
