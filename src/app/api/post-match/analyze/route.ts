export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { analyzePostMatch } from '@/lib/dota/engine/postMatchEngine';
import type { PostMatchAnalyzeRequest } from '@/lib/dota/types/api';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PostMatchAnalyzeRequest;
    if (!body.matchId || !Number.isFinite(body.matchId)) {
      return NextResponse.json({ error: 'matchId must be a valid number' }, { status: 400 });
    }

    const result = await analyzePostMatch(body.matchId, body.hero ?? 'Lifestealer');
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `OpenDota fetch/analyze failed: ${error.message}`
            : 'Unknown post-match error'
      },
      { status: 502 }
    );
  }
}
