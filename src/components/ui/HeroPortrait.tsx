'use client';
import { useState } from 'react';
import { getHeroPortraitUrl } from '@/lib/dota/data/heroConstants';
import styles from './ui.module.css';

export function HeroPortrait({ heroKey }: { heroKey?: string }) {
  const [failed, setFailed] = useState(false);
  const src = getHeroPortraitUrl(heroKey);
  return <span className={styles.heroPortrait} aria-hidden="true">{src && !failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : '◇'}</span>;
}
