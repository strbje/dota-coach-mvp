import type { ReactNode } from 'react';
import styles from './layout.module.css';

export function PageContainer({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return <main className={`${styles.container} ${className}`}>{children}</main>;
}
