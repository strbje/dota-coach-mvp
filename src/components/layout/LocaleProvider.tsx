'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, type Locale } from '@/lib/i18n/locales';

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) {
      setLocale(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const selectLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale: selectLocale }),
    [locale, selectLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider');
  return context;
}
