import { Field, Input } from '@/components/ui';

type Props = {
  matchId: string;
  label: string;
  hint: string;
  onChange: (value: string) => void;
};

export function MatchIdForm({ matchId, label, hint, onChange }: Props) {
  return (
    <Field id="match-id" label={label} hint={hint}>
      <Input
        inputMode="numeric"
        required
        value={matchId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="8781054570"
      />
    </Field>
  );
}
