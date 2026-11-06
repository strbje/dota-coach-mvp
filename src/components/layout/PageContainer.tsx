import type { ReactNode } from 'react';
import styles from './layout.module.css';

export function PageContainer({
  children,
  width = 'standard',
  atmosphere = false,
  className = ''
}: {
  children: ReactNode;
  width?: 'standard' | 'workspace' | 'report';
  atmosphere?: boolean | 'home' | 'pre-game' | 'winrates';
  className?: string;
}) {
  const content = <main className={`${styles.container} ${width === 'standard' ? '' : styles[width]} ${className}`}>{children}</main>;
  return atmosphere ? <div className={`${styles.atmosphere} ${typeof atmosphere === 'string' ? styles[atmosphere] : ''}`}>{content}</div> : content;
}
