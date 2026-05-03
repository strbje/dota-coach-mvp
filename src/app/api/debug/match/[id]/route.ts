import { NextResponse } from 'next/server';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const hasApiKey = Boolean(process.env.OPENDOTA_API_KEY);

  try {
    const { id } = await params;
    const matchId = Number(id);
    if (!Number.isFinite(matchId)) {
      return NextResponse.json(
        {
          ok: false,
          source: 'opendota',
          matchId: id,
          hasApiKey,
          error: 'id must be numeric'
        },
        { status: 400 }
      );
    }

    const payload = await fetchOpenDotaMatch(matchId);
    const normalized = normalizeOpenDotaMatch(payload);

    return NextResponse.json({
      ok: true,
      source: 'opendota',
      matchId,
      hasApiKey,
      normalized
    });
  } catch (error) {
    const { id } = await params;

    return NextResponse.json(
      {
        ok: false,
        source: 'opendota',
        matchId: Number.isFinite(Number(id)) ? Number(id) : id,
        hasApiKey,
        error: error instanceof Error ? error.message : 'Unknown debug error'
      },
      { status: 502 }
    );
  }
}
