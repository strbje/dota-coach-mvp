export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getHeroBenchmarks } from '@/lib/dota/data/benchmarks';
import { getHeroItemPopularityResearch } from '@/lib/dota/data/itemPopularity';
import { getHeroItemTimingScenariosResearch } from '@/lib/dota/data/itemTimingScenarios';
import { getStratzHeroAverage } from '@/lib/dota/data/stratzHeroAverages';

export async function GET(request: Request, { params }: { params: Promise<{ heroId: string }> }) {
  const { heroId: heroIdRaw } = await params;
  const heroId = Number(heroIdRaw);
  if (!Number.isFinite(heroId) || heroId <= 0) {
    return NextResponse.json({ ok: false, error: 'heroId must be a positive number' }, { status: 400 });
  }

  const url = new URL(request.url);
  const matchIdRaw = url.searchParams.get('matchId');
  const matchId = matchIdRaw ? Number(matchIdRaw) : null;

  const opendotaBenchmarks = await getHeroBenchmarks(heroId);
  const itemPopularity = await getHeroItemPopularityResearch(heroId);
  const itemTimingScenarios = await getHeroItemTimingScenariosResearch(heroId);

  const notes: string[] = ['Research/debug endpoint only. Data is not wired into product UI.'];
  let stratzHeroAverage: Awaited<ReturnType<typeof getStratzHeroAverage>> | undefined;

  if (matchId && Number.isFinite(matchId) && matchId > 0) {
    stratzHeroAverage = await getStratzHeroAverage(matchId, heroId);
  } else if (matchIdRaw) {
    notes.push('matchId is invalid, STRATZ heroAverage skipped.');
  } else {
    notes.push('matchId is missing, STRATZ heroAverage skipped.');
  }

  if (!process.env.STRATZ_API_TOKEN) {
    notes.push('STRATZ_API_TOKEN is not configured; STRATZ source may be unavailable.');
  }

  return NextResponse.json({
    ok: true,
    heroId,
    sources: {
      opendotaBenchmarks,
      itemPopularity,
      itemTimingScenarios,
      stratzHeroAverage
    },
    coverage: {
      hasHeroBenchmarks: opendotaBenchmarks.available,
      hasItemPopularity: itemPopularity.available,
      hasItemTimingScenarios: itemTimingScenarios.available,
      hasStratzHeroAverage: Boolean(stratzHeroAverage?.available)
    },
    notes
  });
}
