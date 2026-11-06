import { NextResponse } from 'next/server';
import { ParseRequestError, requestMatchParse } from '@/lib/dota/clients/openDotaParse';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let matchId: unknown;
  try { matchId = (await request.json())?.matchId; }
  catch { return NextResponse.json({ error: 'invalid_match' }, { status: 400 }); }
  if (typeof matchId !== 'number' || !Number.isSafeInteger(matchId) || matchId <= 0) {
    return NextResponse.json({ error: 'invalid_match' }, { status: 400 });
  }
  try { return NextResponse.json(await requestMatchParse(matchId)); }
  catch (error) {
    const code = error instanceof ParseRequestError ? error.code : 'unavailable';
    return NextResponse.json({ error: code }, { status: code === 'rate_limit' ? 429 : code === 'timeout' ? 504 : 502 });
  }
}
