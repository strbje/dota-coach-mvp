import { HEROES } from '@/lib/dota/constants/heroes';

type Props = { value: string; onChange: (value: string) => void };

export function HeroPicker({ value, onChange }: Props) {
  return (
    <label>
      Hero
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {HEROES.map((hero) => (
          <option key={hero} value={hero}>
            {hero}
          </option>
        ))}
      </select>
    </label>
  );
}
