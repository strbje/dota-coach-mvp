'use client';
import { PageContainer } from '@/components/layout/PageContainer';
import { useLocale } from '@/components/layout/LocaleProvider';
import { ActionLink, Panel } from '@/components/ui';
import { getUiCopy } from '@/lib/i18n/uiCopy';
import styles from './home.module.css';
export default function HomePage() {
  const { locale } = useLocale();
  const t = getUiCopy(locale).home;
  return <PageContainer><div className={styles.hero}><div className={styles.copy}><span className="eyebrow">{t.eyebrow}</span><h1 className={styles.title}>{t.title}</h1><p className={styles.lead}>{t.lead}</p><div className={styles.actions}><ActionLink href="/post-match">{t.postCta}</ActionLink><ActionLink href="/pre-game" variant="secondary">{t.preCta}</ActionLink></div></div></div><section className="page-stack" aria-labelledby="steps"><h2 id="steps">{t.steps}</h2><div className={`grid grid-2 ${styles.steps}`}><Panel as="article" className={styles.step}><h3>{t.step1}</h3><p className="muted">{t.step1Body}</p></Panel><Panel as="article" className={styles.step}><h3>{t.step2}</h3><p className="muted">{t.step2Body}</p></Panel><Panel as="article" className={styles.step}><h3>{t.step3}</h3><p className="muted">{t.step3Body}</p></Panel></div></section></PageContainer>;
}
