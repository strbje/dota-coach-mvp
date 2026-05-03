'use client';

import { useState } from 'react';
import { BuildBranchesCard } from '@/components/coach/BuildBranchesCard';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { DebugPanel } from '@/components/coach/DebugPanel';
import { HeroPicker } from '@/components/coach/HeroPicker';
import { LaneSetupForm } from '@/components/coach/LaneSetupForm';
import { RolePicker } from '@/components/coach/RolePicker';
import { StagePlanCard } from '@/components/coach/StagePlanCard';
import { TargetPriorityCard } from '@/components/coach/TargetPriorityCard';
import { ThreatsCard } from '@/components/coach/ThreatsCard';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';

function splitCSV(value: string): string[] {
  return value.split(',').map((x) => x.trim()).filter(Boolean);
}

export default function PreGamePage() {
  const [hero, setHero] = useState('Lifestealer');
  const [role, setRole] = useState('carry');
  const [allies, setAllies] = useState('Lifestealer, Lion, Puck, Mars, Phoenix');
  const [enemies, setEnemies] = useState('Legion Commander, Tusk, Invoker, Dazzle, Sven');
  const [allyPair, setAllyPair] = useState('Lifestealer, Lion');
  const [enemyPair, setEnemyPair] = useState('Legion Commander, Tusk');
  const [data, setData] = useState<PreGameAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/pre-game/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hero,
          role,
          allies: splitCSV(allies),
          enemies: splitCSV(enemies),
          lanes: {
            safe: {
              ally: splitCSV(allyPair),
              enemy: splitCSV(enemyPair)
            }
          }
        })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? 'Pre-game analyze failed');
      }
      setData((await response.json()) as PreGameAnalysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Pre-Game Assistant</h1>
      <div className="card grid">
        <HeroPicker value={hero} onChange={setHero} />
        <RolePicker value={role} onChange={setRole} />
        <LaneSetupForm
          allies={allies}
          enemies={enemies}
          allyPair={allyPair}
          enemyPair={enemyPair}
          onChange={(field, value) => {
            if (field === 'allies') setAllies(value);
            if (field === 'enemies') setEnemies(value);
            if (field === 'allyPair') setAllyPair(value);
            if (field === 'enemyPair') setEnemyPair(value);
          }}
        />
        <button disabled={loading} onClick={submit}>{loading ? 'Analyzing...' : 'Analyze pre-game'}</button>
        {error ? <p className="error">{error}</p> : null}
      </div>

      {data ? (
        <div className="grid" style={{ marginTop: '1rem' }}>
          <section className="card">
            <h3>Lane Verdict: {data.lane.difficulty}</h3>
            <ul>{data.lane.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>
          <ThreatsCard threats={data.threats} />
          <section className="card"><h3>Starting Items</h3><ul>{data.startingItems.map((i) => <li key={i.name}><strong>{i.name}</strong> — {i.reason}</li>)}</ul></section>
          <BuildBranchesCard branches={data.buildBranches} />
          <StagePlanCard stagePlan={data.stagePlan} />
          <TargetPriorityCard targetPriority={data.targetPriority} />
          <CoachSummaryCard title="Map Plan" lines={[...data.mapPlan.early, ...data.mapPlan.mid, ...data.mapPlan.late]} />
          <CoachSummaryCard title="Mistakes to Avoid" lines={data.mistakesToAvoid} />
          <DebugPanel data={data} title="Pre-game JSON" />
        </div>
      ) : null}
    </main>
  );
}
