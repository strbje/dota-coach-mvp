export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { getGoldReasonConstants } from '@/lib/dota/providers/opendotaConstantsProvider';

type Stage = 'fetch' | 'normalize' | 'unknown';
type Transport = 'fetch' | 'https-fallback' | 'unknown';

type GoldGrouped = {
  creeps?: number;
  heroes?: number;
  objectives?: number;
  roshan?: number;
  runes?: number;
  abilitiesOrItems?: number;
  passiveOrOther?: number;
  unknown?: number;
};

function logDebugError(matchId: string | number, stage: Stage, error: unknown) {
  const parsed = error instanceof Error ? error : new Error(String(error));
  const cause = parsed.cause as { message?: string } | undefined;

  console.error('[debug/match] failure', { matchId, stage, errorName: parsed.name, errorMessage: parsed.message, errorCause: cause?.message, timestamp: new Date().toISOString() });
}

function toGoldGroup(label: string): keyof GoldGrouped {
  const l = label.toLowerCase();
  if (l.includes('hero')) return 'heroes';
  if (l.includes('roshan')) return 'roshan';
  if (l.includes('tower') || l.includes('building') || l.includes('courier') || l.includes('objective')) return 'objectives';
  if (l.includes('creep') || l.includes('lane') || l.includes('neutral') || l.includes('ancient')) return 'creeps';
  if (l.includes('rune') || l.includes('bounty')) return 'runes';
  if (l.includes('buyback') || l.includes('ability') || l.includes('spell') || l.includes('item') || l.includes('hand')) return 'abilitiesOrItems';
  if (l.includes('passive') || l.includes('lost') || l.includes('abandon') || l.includes('other')) return 'passiveOrOther';
  return 'unknown';
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const hasApiKey = Boolean(process.env.OPENDOTA_API_KEY);
  const { id } = await params;
  const matchId = Number(id);

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ ok: false, source: 'opendota', matchId: id, hasApiKey, stage: 'unknown', error: 'id must be numeric', errorName: 'ValidationError', errorCause: null, timestamp: new Date().toISOString() }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof fetchOpenDotaMatch>>;

  try { payload = await fetchOpenDotaMatch(matchId); } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    const cause = parsed.cause as { message?: string } | undefined;
    const transport = ((parsed as { transport?: Transport }).transport ?? 'unknown') as Transport;
    logDebugError(matchId, 'fetch', parsed);
    return NextResponse.json({ ok: false, source: 'opendota', matchId, hasApiKey, stage: 'fetch', transport, error: parsed.message, errorName: parsed.name, errorCause: cause?.message ?? null, timestamp: new Date().toISOString() }, { status: 502 });
  }

  try {
    const normalized = await normalizeOpenDotaMatch(payload);
    const player = Array.isArray(payload.players) ? payload.players.find((p) => Number((p as Record<string, unknown>).hero_id) === 54) as Record<string, unknown> | undefined : undefined;
    const raw = player && typeof player.gold_reasons === 'object' && player.gold_reasons ? player.gold_reasons as Record<string, number> : {};
    const constants = await getGoldReasonConstants();
    const decoded = Object.entries(raw).map(([key, amount]) => {
      const constant = constants?.[key];
      const label = constant?.label ?? `unknown_${key}`;
      return { key, label, group: constant?.group ?? 'unknown', amount: Number(amount) };
    });
    const constantsAvailable = decoded.some((entry) => !entry.label.startsWith('unknown_'));
    const grouped = decoded.reduce<GoldGrouped>((acc, entry) => {
      const g = toGoldGroup(entry.label);
      acc[g] = (acc[g] ?? 0) + entry.amount;
      return acc;
    }, {});

    return NextResponse.json({ ok: true, source: 'opendota', matchId, hasApiKey, stages: { fetched: true, normalized: true }, normalized, goldReasonsDebug: { raw, constantsAvailable, decoded, grouped } });
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    const cause = parsed.cause as { message?: string } | undefined;
    logDebugError(matchId, 'normalize', parsed);
    return NextResponse.json({ ok: false, source: 'opendota', matchId, hasApiKey, stage: 'normalize', error: parsed.message, errorName: parsed.name, errorCause: cause?.message ?? null, timestamp: new Date().toISOString() }, { status: 502 });
  }
}
