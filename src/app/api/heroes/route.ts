import { NextResponse } from 'next/server';
import { HEROES } from '@/lib/dota/constants/heroes';

export async function GET() {
  return NextResponse.json({ heroes: HEROES });
}
