'use client';
import { type FormEvent, useMemo, useState } from 'react';
import { useLocale } from '@/components/layout/LocaleProvider';
import { getUiCopy } from '@/lib/i18n/uiCopy';
import { localizePreGameAnalysis, preGameHeadings } from '@/lib/i18n/preGameCopy';
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
const splitCSV = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
export default function PreGamePage() {
  const { locale } = useLocale();
  const copy = getUiCopy(locale).preGame;
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
      if (!response.ok) throw new Error(payload.error ?? copy.failed);
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.unknownError);
    } finally {
      setLoading(false);
    }
  }

  const localizedData = useMemo(() => data ? localizePreGameAnalysis(data, locale) : null, [data, locale]);

  return (
    <PageContainer className="page-stack">
<header className="stack">
<span className="eyebrow">{copy.eyebrow}</span>
<h1 className="page-title">{copy.title}</h1>
<p className="muted">{copy.lead}</p>
</header>
<Panel>
<form className="stack" onSubmit={submit} aria-busy={loading}>
<div className="grid grid-2">
<HeroPicker value={hero} onChange={setHero} locale={locale}/>
<RolePicker value={role} onChange={setRole} locale={locale}/></div>
<LaneSetupForm {...{allies,enemies,allyPair,enemyPair}} locale={locale} onChange={(field,value)=>({allies:setAllies,enemies:setEnemies,allyPair:setAllyPair,enemyPair:setEnemyPair}[field](value))}/>
<Button type="submit" loading={loading} loadingLabel={copy.loading}>{copy.submit}</Button>
{error?<Alert tone="danger">{error}</Alert>
:null}{!data&&!loading&&!error?<Alert tone="unknown">{copy.initial}</Alert>
:null}</form>
</Panel>
{localizedData?<div className="page-stack">
<Panel>
<h2>{copy.lane}</h2>
<Badge tone={localizedData.lane.difficulty==='hard'?'danger':localizedData.lane.difficulty==='medium'?'warning':'success'}>{preGameHeadings[locale].difficulty[localizedData.lane.difficulty]}</Badge>

<ul>{localizedData.lane.reasons.map((reason)=>
<li key={reason}>{reason}</li>
)}</ul>
</Panel>
<ThreatsCard threats={localizedData.threats} locale={locale}/>
<Panel>
<h3>{copy.startingItems}</h3>
<ul>{localizedData.startingItems.map((item)=>
<li key={item.name}><strong>{item.name}</strong> — {item.reason}</li>
)}</ul>
</Panel>
<BuildBranchesCard branches={localizedData.buildBranches} locale={locale}/>
<StagePlanCard stagePlan={localizedData.stagePlan} locale={locale}/>
<TargetPriorityCard targetPriority={localizedData.targetPriority} locale={locale}/>
<CoachSummaryCard title={copy.mapPlan} lines={[...localizedData.mapPlan.early,...localizedData.mapPlan.mid,...localizedData.mapPlan.late]}/>
<CoachSummaryCard title={copy.mistakes} lines={localizedData.mistakesToAvoid}/>
<DebugPanel data={data} title={copy.json}/></div>
:null}</PageContainer>
  );
}
