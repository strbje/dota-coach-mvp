'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import styles from './layout.module.css';
import { useLocale } from './LocaleProvider';
import { getUiCopy } from '@/lib/i18n/uiCopy';

export function AppHeader() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const text = getUiCopy(locale);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const menu = useRef<HTMLDivElement>(null);
  const links = [{ href: '/', label: text.nav.home }, { href: '/post-match', label: text.nav.postMatch }, { href: '/pre-game', label: text.nav.preGame }, { href: '/winrates', label: text.nav.winrates }];

  return (
    <header className={styles.header} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { setOpen(false); menu.current?.querySelector('button')?.focus(); }
    }}>
      <div className={`${styles.headerInner} ${styles.report}`}>
        <Link className={styles.brand} href="/">Dota Coach</Link>
        <div ref={menu} className={styles.headerControls}>
        <Button type="button" variant="secondary" className={styles.menuToggle} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}>Меню</Button>
        <nav id="site-menu" className={`${styles.nav} ${open ? styles.navOpen : ''}`} aria-label={text.nav.label}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        </div>
      </div>
    </header>
  );
}
