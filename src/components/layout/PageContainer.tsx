import type { ReactNode } from 'react';
import styles from './layout.module.css';

export function PageContainer({
  children,
  width = 'standard',
  className = ''
}: {
  children: ReactNode;
  width?: 'standard' | 'workspace';
  className?: string;
}) {
  return <main className={`${styles.container} ${width === 'workspace' ? styles.workspace : ''} ${className}`}>{children}</main>;
}
