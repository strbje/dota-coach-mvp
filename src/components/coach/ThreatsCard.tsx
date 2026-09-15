import { Panel } from '@/components/ui';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

type Props = {
  threats: string[];
  locale: Locale;
};

export function ThreatsCard({ threats, locale }: Props) {
  return (
    <Panel>
      <h3>{preGameHeadings[locale].threats}</h3>
      <ul>
        {threats.map((threat) => <li key={threat}>{threat}</li>)}
      </ul>
    </Panel>
  );
}
