import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const STRATZ_URL = 'https://api.stratz.com/graphql';
const OPENDOTA_URL = 'https://api.opendota.com/api/matches';
const query = `query HeroAverageMethodologyProbe($id: Long!) {
  match(id: $id) {
    id durationSeconds gameVersionId lobbyType gameMode
    players {
      steamAccountId playerSlot heroId position role roleBasic numLastHits goldPerMinute
      stats { lastHitsPerMinute networthPerMinute goldPerMinute }
      heroAverage { heroId time position matchCount winCount cs networth goldPerMinute }
    }
  }
}`;

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return body;
}

function valueAtIndex(series, index) {
  if (!Array.isArray(series)) return undefined;
  const value = series[index];
  return typeof value === 'number' ? value : undefined;
}

function windowAtIndex(series, index) {
  return [-1, 0, 1].map((offset) => {
    const candidateIndex = index + offset;
    return { index: candidateIndex, value: valueAtIndex(series, candidateIndex) ?? null };
  });
}

export function parseTargets(args) {
  const targets = args.map((arg) => {
    if (!/^\d+:\d+$/.test(arg)) throw new Error(`Invalid target: ${arg}`);
    const [matchId, heroId] = arg.split(':').map(Number);
    if (!Number.isSafeInteger(matchId) || matchId <= 0 || !Number.isInteger(heroId) || heroId <= 0) {
      throw new Error(`Invalid target: ${arg}`);
    }
    return { matchId, heroId };
  });
  const keys = targets.map(({ matchId, heroId }) => `${matchId}:${heroId}`);
  if (new Set(keys).size !== keys.length) throw new Error('Targets must be unique matchId:heroId pairs');
  if (targets.length < 3) throw new Error('At least three unique targets are required');
  if (new Set(targets.map(({ matchId }) => matchId)).size < 3) throw new Error('At least three distinct matchIds are required');
  if (!keys.includes('8781054570:54')) throw new Error('Control target 8781054570:54 is required');
  return targets;
}

export async function writeArtifact(outputPath, output) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
}

export function summarizeProbe(matchId, heroId, stratzBody, openDotaBody) {
  const match = stratzBody?.data?.match;
  const player = match?.players?.find((candidate) => candidate.heroId === heroId);
  const openDotaPlayer = openDotaBody?.players?.find((candidate) => candidate.hero_id === heroId);
  if (!match || !player) throw new Error(`match ${matchId}: heroId ${heroId} missing from STRATZ payload`);
  const samples = Array.isArray(player.heroAverage) ? player.heroAverage : [];

  return {
    matchId,
    heroId,
    durationSeconds: match.durationSeconds,
    matchContext: { gameVersionId: match.gameVersionId, lobbyType: match.lobbyType, gameMode: match.gameMode },
    selectedPosition: player.position,
    role: player.role,
    roleBasic: player.roleBasic,
    finalLastHits: player.numLastHits,
    finalGoldPerMinute: player.goldPerMinute,
    checkpoints: samples.map((sample) => ({
      minute: sample.time,
      actualCsStratzWindow: windowAtIndex(player.stats?.lastHitsPerMinute, sample.time),
      actualCsOpenDotaWindow: windowAtIndex(openDotaPlayer?.lh_t, sample.time),
      actualNetworthStratzWindow: windowAtIndex(player.stats?.networthPerMinute, sample.time),
      actualGpmStratzWindow: windowAtIndex(player.stats?.goldPerMinute, sample.time),
      heroAverage: sample
    })),
    caveats: [
      'Array indexes are recorded as candidate minute alignment, not asserted as equivalent.',
      'OpenDota gold_t is deliberately not requested or compared.',
      'Cohort filters absent from the payload remain unknown.'
    ]
  };
}

async function main() {
  const token = process.env.STRATZ_API_TOKEN;
  const args = process.argv.slice(2);
  const outArg = args.find((arg) => arg.startsWith('--out='));
  let targets;
  try {
    targets = parseTargets(args.filter((arg) => !arg.startsWith('--')));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  if (!token || !targets) {
    console.error('Usage: STRATZ_API_TOKEN=... node scripts/probe-stratz-hero-average.mjs <matchId:heroId> <matchId:heroId> <matchId:heroId> [--out=file.json]');
    process.exitCode = 2;
    return;
  }

  const probes = [];
  for (const { matchId, heroId } of targets) {
    const [stratzBody, openDotaBody] = await Promise.all([
      jsonFetch(STRATZ_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'dota-coach-mvp-methodology-probe/1.0' }, body: JSON.stringify({ query, variables: { id: matchId } }) }),
      jsonFetch(`${OPENDOTA_URL}/${matchId}`)
    ]);
    if (stratzBody.errors?.length) throw new Error(`match ${matchId}: ${JSON.stringify(stratzBody.errors)}`);
    probes.push(summarizeProbe(matchId, heroId, stratzBody, openDotaBody));
  }

  const output = `${JSON.stringify({ capturedAt: new Date().toISOString(), methodologyStatus: 'research-only', probes }, null, 2)}\n`;
  if (outArg) await writeArtifact(outArg.slice('--out='.length), output);
  else process.stdout.write(output);
}

if (process.argv[1]?.endsWith('probe-stratz-hero-average.mjs')) await main();
