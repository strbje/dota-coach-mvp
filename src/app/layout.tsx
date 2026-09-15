import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/AppHeader';
import './globals.css';
export const metadata: Metadata = { title: process.env.NEXT_PUBLIC_APP_NAME ?? 'Dota Coach', description: 'Персональный тактический помощник для матчей Dota 2.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body><AppHeader />{children}</body></html>; }
