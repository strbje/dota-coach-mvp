import { NextResponse } from 'next/server';
import { analyzePreGame } from '@/lib/dota/engine/preGameEngine';
import { handlePreGameAnalyze, preGameFailure } from './handler';

export async function POST(request: Request) {
  try {
    const result = await handlePreGameAnalyze(await request.json(), analyzePreGame);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const result = preGameFailure(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
