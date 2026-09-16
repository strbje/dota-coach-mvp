export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { analyzePostMatch } from '@/lib/dota/engine/postMatchEngine';
import type { PostMatchAnalyzeRequest } from '@/lib/dota/types/api';
import { toPublicPostMatchError } from '@/lib/dota/errors/postMatchError';
import { isPostMatchSuccessPayload } from '@/lib/dota/validation/postMatchResponse';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PostMatchAnalyzeRequest;
    if (!body.matchId || !Number.isFinite(body.matchId)) {
      return NextResponse.json(
        { error: 'Введите корректный Match ID.', errorCode: 'INVALID_MATCH_ID' },
        { status: 400 }
      );
    }

    const result = await analyzePostMatch(body.matchId, body.hero ?? 'Lifestealer');
    if (!isPostMatchSuccessPayload(result)) {
      throw new Error('Post-match analysis missing from successful result');
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[post-match] analysis failed', error);
    const publicError = toPublicPostMatchError(error);
    return NextResponse.json(
      { error: publicError.error, errorCode: publicError.errorCode },
      { status: publicError.status }
    );
  }
}
