import { ROLES } from '@/lib/dota/constants/roles';

type Props = { value: string; onChange: (value: string) => void };

export function RolePicker({ value, onChange }: Props) {
  return (
    <label>
      Role
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </label>
  );
}
