import { NextResponse } from 'next/server';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const matchId = Number(id);
    if (!Number.isFinite(matchId)) {
      return NextResponse.json({ error: 'id must be numeric' }, { status: 400 });
    }

    const payload = await fetchOpenDotaMatch(matchId);
    const normalized = normalizeOpenDotaMatch(payload);

    return NextResponse.json({ ok: true, normalized });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown debug error' },
      { status: 502 }
    );
  }
}
