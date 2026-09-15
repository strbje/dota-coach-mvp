import { Field, Select } from '@/components/ui';
import { ROLES } from '@/lib/dota/constants/roles';
const LABELS: Record<string, string> = { carry: 'Керри', mid: 'Мидер', offlane: 'Оффлейнер', support: 'Поддержка' };
type Props = { value: string; onChange: (value: string) => void };
export function RolePicker({ value, onChange }: Props) { return <Field id="role" label="Роль"><Select value={value} onChange={(event) => onChange(event.target.value)}>{ROLES.map((role) => <option key={role} value={role}>{LABELS[role] ?? role}</option>)}</Select></Field>; }
