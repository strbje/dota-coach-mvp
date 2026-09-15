'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

const links = [
  { href: '/', label: 'Главная' },
  { href: '/post-match', label: 'Разбор матча' },
  { href: '/pre-game', label: 'План перед игрой' }
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/">Dota Coach</Link>
        <nav className={styles.nav} aria-label="Основная навигация">
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
      </div>
    </header>
  );
}
