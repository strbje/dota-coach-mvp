'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';
import { useLocale } from './LocaleProvider';
import { getUiCopy } from '@/lib/i18n/uiCopy';

export function AppHeader() {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const text = getUiCopy(locale);
  const links = [{ href: '/', label: text.nav.home }, { href: '/post-match', label: text.nav.postMatch }, { href: '/pre-game', label: text.nav.preGame }];

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/">Dota Coach</Link>
        <div className={styles.headerControls}>
        <nav className={styles.nav} aria-label={text.nav.label}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={styles.localeSwitch} role="group" aria-label={text.locale.label}>
          {(['ru', 'en'] as const).map((value) => <button key={value} type="button" aria-pressed={locale === value} onClick={() => setLocale(value)}>{text.locale[value]}</button>)}
        </div>
        </div>
      </div>
    </header>
  );
}
