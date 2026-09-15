import { PageContainer } from '@/components/layout/PageContainer';
import { Panel } from '@/components/ui';
import { normalizeDraftInput } from '@/lib/dota/adapters/normalizeDraftInput';

const sampleDraft = normalizeDraftInput({
  hero: 'Lifestealer',
  role: 'carry',
  allies: ['Lifestealer', 'Lion'],
  enemies: ['Legion Commander', 'Tusk'],
  lanes: {
    safe: {
      ally: ['Lifestealer', 'Lion'],
      enemy: ['Legion Commander', 'Tusk']
    }
  }
});

export default function DebugPage() {
  return (
    <PageContainer className="page-stack">
      <h1>Отладка</h1>
      <Panel>
        <h2>Пример нормализованного запроса</h2>
        <pre className="debug-pre">{JSON.stringify(sampleDraft, null, 2)}</pre>
      </Panel>
      <Panel>
        <h2>Проверка провайдеров</h2>
        <p className="muted">
          Используйте <code>/api/debug/match/:id</code> для проверки OpenDota.
        </p>
      </Panel>
    </PageContainer>
  );
}
