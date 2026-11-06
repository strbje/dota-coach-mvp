'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locales';

// Reports and winrates currently ship in Russian. Do not restore a legacy EN
// preference until all product messages are translated.
const LocaleContext = createContext<{ locale: Locale }>({ locale: 'ru' });
export function LocaleProvider({ children }: { children: ReactNode }) {
  return <LocaleContext.Provider value={{ locale: 'ru' }}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
