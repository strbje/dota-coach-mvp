import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/AppHeader';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import './globals.css';
export const metadata: Metadata = { title: process.env.NEXT_PUBLIC_APP_NAME ?? 'Dota Coach', description: 'Персональный тактический помощник для матчей Dota 2.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body><LocaleProvider><AppHeader />{children}</LocaleProvider></body></html>; }
