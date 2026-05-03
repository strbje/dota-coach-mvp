import { NextResponse } from 'next/server';
import { normalizeDraftInput } from '@/lib/dota/adapters/normalizeDraftInput';
import type { PreGameDraftInput } from '@/lib/dota/types/domain';

export async function POST(request: Request) {
  const body = (await request.json()) as PreGameDraftInput;
  return NextResponse.json(normalizeDraftInput(body));
}
