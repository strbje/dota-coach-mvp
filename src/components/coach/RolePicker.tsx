import { Field, Select } from '@/components/ui';
import { ROLES } from '@/lib/dota/constants/roles';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

const LABELS = {
  ru: { carry: 'Керри', mid: 'Мидер', offlane: 'Оффлейнер', support: 'Поддержка' },
  en: { carry: 'Carry', mid: 'Mid', offlane: 'Offlaner', support: 'Support' }
} as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
};

export function RolePicker({ value, onChange, locale }: Props) {
  return (
    <Field id="role" label={preGameHeadings[locale].role}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {LABELS[locale][role as keyof typeof LABELS.ru] ?? role}
          </option>
        ))}
      </Select>
    </Field>
  );
}
