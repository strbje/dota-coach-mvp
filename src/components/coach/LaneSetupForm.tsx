import { Field, Input } from '@/components/ui';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

type FieldName = 'allyPair' | 'enemyPair' | 'allies' | 'enemies';

type Props = {
  allyPair: string;
  enemyPair: string;
  allies: string;
  enemies: string;
  locale: Locale;
  onChange: (field: FieldName, value: string) => void;
};

export function LaneSetupForm({ allyPair, enemyPair, allies, enemies, locale, onChange }: Props) {
  const copy = preGameHeadings[locale];

  return (
    <div className="grid grid-2">
      <Field id="allies" label={copy.allies} hint={copy.comma}>
        <Input value={allies} onChange={(event) => onChange('allies', event.target.value)} />
      </Field>
      <Field id="enemies" label={copy.enemies} hint={copy.comma}>
        <Input value={enemies} onChange={(event) => onChange('enemies', event.target.value)} />
      </Field>
      <Field id="ally-pair" label={copy.allyPair}>
        <Input value={allyPair} onChange={(event) => onChange('allyPair', event.target.value)} />
      </Field>
      <Field id="enemy-pair" label={copy.enemyPair}>
        <Input value={enemyPair} onChange={(event) => onChange('enemyPair', event.target.value)} />
      </Field>
    </div>
  );
}
