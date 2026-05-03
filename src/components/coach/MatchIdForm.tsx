type Props = {
  matchId: string;
  onChange: (value: string) => void;
};

export function MatchIdForm({ matchId, onChange }: Props) {
  return (
    <label>
      Match ID
      <input value={matchId} onChange={(e) => onChange(e.target.value)} placeholder="8781054570" />
    </label>
  );
}
