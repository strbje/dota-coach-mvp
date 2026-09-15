import Link, { type LinkProps } from 'next/link';
import {
  cloneElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react';
import styles from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'unknown'
  | 'brand'
  | 'critical'
  | 'weak'
  | 'average'
  | 'ok'
  | 'good'
  | 'excellent';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  loadingLabel?: ReactNode;
  fullWidth?: boolean;
};

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${styles.button} ${styles[variant]} ${fullWidth ? styles.fullWidth : ''} ${className}`}
    >
      <span className={styles.buttonLabel} aria-hidden={loading || undefined}>{children}</span>
      {loading ? <span className={styles.loadingLabel}>{loadingLabel ?? children}</span> : null}
    </button>
  );
}

export function ActionLink({
  variant = 'primary',
  className = '',
  children,
  ...props
}: LinkProps & { variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link {...props} className={`${styles.actionLink} ${styles[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Panel({
  as: Tag = 'section',
  className = '',
  children
}: {
  as?: 'section' | 'article' | 'div';
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={`${styles.panel} ${className}`}>{children}</Tag>;
}

export function Badge({
  tone = 'unknown',
  children,
  className = ''
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`${styles.badge} ${styles[tone]} ${className}`}>{children}</span>;
}

export function Alert({
  tone = 'unknown',
  children
}: {
  tone?: Exclude<Tone, 'brand' | 'critical' | 'weak' | 'average' | 'ok' | 'good' | 'excellent'>;
  children: ReactNode;
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`${styles.alert} ${styles[tone]}`}>
      {children}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }>;
}) {
  const describedBy = [
    hint && `${id}-hint`,
    error && `${id}-error`,
    children.props['aria-describedby']
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined
      })}
      {hint ? <span id={`${id}-hint`} className={styles.hint}>{hint}</span> : null}
      {error ? <span id={`${id}-error`} className={styles.error}>{error}</span> : null}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.control} ${className}`} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${styles.control} ${className}`} />;
}
