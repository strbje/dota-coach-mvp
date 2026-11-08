import { NextResponse } from 'next/server';
import { findChallengeMatches, parseChallengeSearch, PrivateChallengeHistoryError } from '@/lib/dota/analyze/challengeMatches';
import { failure, winrateSource } from '@/lib/dota/winrates/source';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const query = parseChallengeSearch(new URL(request.url).searchParams);
  if (!query) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  try {
    return NextResponse.json(await findChallengeMatches(winrateSource, query, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof PrivateChallengeHistoryError ? 'private' : failure(error);
    return NextResponse.json({ error: code }, { status: code === 'private' ? 403 : code === 'rate_limit' ? 429 : code === 'timeout' ? 504 : 502 });
  }
}
