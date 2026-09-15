import { Field, Input } from '@/components/ui';
type Props = { matchId: string; onChange: (value: string) => void };
export function MatchIdForm({ matchId, onChange }: Props) { return <Field id="match-id" label="Match ID" hint="Числовой ID завершённого матча"><Input inputMode="numeric" required value={matchId} onChange={(event) => onChange(event.target.value)} placeholder="8781054570" /></Field>; }
