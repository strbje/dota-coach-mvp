import { Field, Select } from '@/components/ui';
import { HEROES } from '@/lib/dota/constants/heroes';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

type Props = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
};

export function HeroPicker({ value, onChange, locale }: Props) {
  return (
    <Field id="hero" label={preGameHeadings[locale].hero}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {HEROES.map((hero) => <option key={hero}>{hero}</option>)}
      </Select>
    </Field>
  );
}
