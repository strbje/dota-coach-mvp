'use client';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, Button } from '@/components/ui';
export default function ErrorPage() {
  return <PageContainer className="page-stack">
    <h1>Не удалось загрузить контрольные данные</h1>
    <Alert tone="danger">Проверьте наличие исследовательского набора в этой ветке и повторите загрузку.</Alert>
    <div><Button onClick={() => window.location.reload()}>Повторить загрузку</Button></div>
  </PageContainer>;
}
