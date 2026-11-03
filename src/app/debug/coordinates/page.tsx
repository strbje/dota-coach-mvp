import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Panel } from '@/components/ui';
import { CoordinateReview } from '@/components/research/CoordinateReview';
import { isCoordinateReviewEnabled, parseReviewData } from '@/lib/dota/research/coordinateReview';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Проверка координат · Dota Coach', robots: { index: false, follow: false } };

export default function CoordinateReviewPage() {
  // Gate before creating a loading boundary, which would start an HTTP 200 stream.
  if (!isCoordinateReviewEnabled(process.env.NODE_ENV)) notFound();
  return <Suspense fallback={<PageContainer><Panel><p role="status" aria-busy="true">Загружаем контрольные матчи…</p></Panel></PageContainer>}>
    <ReviewDataset />
  </Suspense>;
}

async function ReviewDataset() {
  const text = await readFile(join(process.cwd(), 'docs/research/stratz-coordinates/visual-review-data.json'), 'utf8');
  return <CoordinateReview data={parseReviewData(JSON.parse(text))} />;
}
