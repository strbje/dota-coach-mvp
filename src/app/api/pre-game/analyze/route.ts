import { NextResponse } from 'next/server';
import { analyzePreGame } from '@/lib/dota/engine/preGameEngine';
import type { PreGameDraftInput } from '@/lib/dota/types/domain';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PreGameDraftInput;
    if (body.hero !== 'Lifestealer' || body.role !== 'carry') {
      return NextResponse.json(
        { error: 'v1 supports only hero=Lifestealer and role=carry' },
        { status: 400 }
      );
    }

    const result = await analyzePreGame(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown pre-game error' },
      { status: 500 }
    );
  }
}
