import { Field, Select } from '@/components/ui';
import { HEROES } from '@/lib/dota/constants/heroes';
type Props = { value: string; onChange: (value: string) => void };
export function HeroPicker({ value, onChange }: Props) { return <Field id="hero" label="Герой"><Select value={value} onChange={(event) => onChange(event.target.value)}>{HEROES.map((hero) => <option key={hero}>{hero}</option>)}</Select></Field>; }
