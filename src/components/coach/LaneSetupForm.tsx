type Props = {
  allyPair: string;
  enemyPair: string;
  allies: string;
  enemies: string;
  onChange: (field: 'allyPair' | 'enemyPair' | 'allies' | 'enemies', value: string) => void;
};

export function LaneSetupForm({ allyPair, enemyPair, allies, enemies, onChange }: Props) {
  return (
    <div className="grid">
      <label>
        Allies (comma-separated)
        <input value={allies} onChange={(e) => onChange('allies', e.target.value)} placeholder="Lifestealer, Lion, Puck..." />
      </label>
      <label>
        Enemies (comma-separated)
        <input value={enemies} onChange={(e) => onChange('enemies', e.target.value)} placeholder="Legion Commander, Tusk..." />
      </label>
      <label>
        Ally safe lane pair
        <input value={allyPair} onChange={(e) => onChange('allyPair', e.target.value)} placeholder="Lifestealer, Lion" />
      </label>
      <label>
        Enemy offlane pair
        <input value={enemyPair} onChange={(e) => onChange('enemyPair', e.target.value)} placeholder="Legion Commander, Tusk" />
      </label>
    </div>
  );
}
