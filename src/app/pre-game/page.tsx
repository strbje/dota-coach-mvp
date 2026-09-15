'use client';
import { type FormEvent, useState } from 'react';
import { BuildBranchesCard } from '@/components/coach/BuildBranchesCard';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { DebugPanel } from '@/components/coach/DebugPanel';
import { HeroPicker } from '@/components/coach/HeroPicker';
import { LaneSetupForm } from '@/components/coach/LaneSetupForm';
import { RolePicker } from '@/components/coach/RolePicker';
import { StagePlanCard } from '@/components/coach/StagePlanCard';
import { TargetPriorityCard } from '@/components/coach/TargetPriorityCard';
import { ThreatsCard } from '@/components/coach/ThreatsCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, Badge, Button, Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';
const DIFFICULTY = { easy: 'лёгкая', medium: 'средняя', hard: 'сложная' } as const;
const splitCSV = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
export default function PreGamePage() {
  const [hero,setHero]=useState('Lifestealer');
  const [role,setRole]=useState('carry');
  const [allies,setAllies]=useState('Lifestealer, Lion, Puck, Mars, Phoenix');
  const [enemies,setEnemies]=useState('Legion Commander, Tusk, Invoker, Dazzle, Sven');
  const [allyPair,setAllyPair]=useState('Lifestealer, Lion');
  const [enemyPair,setEnemyPair]=useState('Legion Commander, Tusk');
  const [data,setData]=useState<PreGameAnalysis|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setData(null);
    setError(null);
    setLoading(true);

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Не удалось составить план');
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer className="page-stack">
<header className="stack">
<span className="eyebrow">До игры</span>
<h1 className="page-title">План перед матчем</h1>
<p className="muted">Зафиксируйте драфт и получите конкретный план для линии, сборки и карты.</p>
</header>
<Panel>
<form className="stack" onSubmit={submit} aria-busy={loading}>
<div className="grid grid-2">
<HeroPicker value={hero} onChange={setHero}/>
<RolePicker value={role} onChange={setRole}/></div>
<LaneSetupForm {...{allies,enemies,allyPair,enemyPair}} onChange={(field,value)=>({allies:setAllies,enemies:setEnemies,allyPair:setAllyPair,enemyPair:setEnemyPair}[field](value))}/>
<Button type="submit" loading={loading}>Составить план</Button>
{error?<Alert tone="danger">{error}</Alert>
:null}{!data&&!loading&&!error?<Alert tone="unknown">Заполните составы, чтобы составить план.</Alert>
:null}</form>
</Panel>
{data?<div className="page-stack">
<Panel>
<h2>Оценка линии</h2>
<Badge tone={data.lane.difficulty==='hard'?'danger':data.lane.difficulty==='medium'?'warning':'success'}>{DIFFICULTY[data.lane.difficulty]}</Badge>

<ul>{data.lane.reasons.map((reason)=>
<li key={reason}>{reason}</li>
)}</ul>
</Panel>
<ThreatsCard threats={data.threats}/>
<Panel>
<h3>Стартовые предметы</h3>
<ul>{data.startingItems.map((item)=>
<li key={item.name}><strong>{item.name}</strong> — {item.reason}</li>
)}</ul>
</Panel>
<BuildBranchesCard branches={data.buildBranches}/>
<StagePlanCard stagePlan={data.stagePlan}/>
<TargetPriorityCard targetPriority={data.targetPriority}/>
<CoachSummaryCard title="План по карте" lines={[...data.mapPlan.early,...data.mapPlan.mid,...data.mapPlan.late]}/>
<CoachSummaryCard title="Ошибки, которых стоит избежать" lines={data.mistakesToAvoid}/>
<DebugPanel data={data} title="JSON плана"/></div>
:null}</PageContainer>
  );
}
