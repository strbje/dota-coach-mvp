import { HeroPortrait } from '@/components/ui/HeroPortrait';
import type { MatchPlayerOption } from '@/lib/dota/selection/matchPlayers';
import styles from './postMatch.module.css';

export function PlayerRoster({ players, selected, onChange }: { players: MatchPlayerOption[]; selected: string; onChange: (slot: string) => void }) {
  return <fieldset className={styles.playerPicker}>
    <legend>Выбери себя в составе</legend>
    <p className={styles.note}>Полный разбор пока доступен для керри. Роль проверим по данным матча.</p>
    <div className={styles.rosterGrid}>{[true, false].map((radiant) => <div key={String(radiant)} className="stack"><h3>{radiant ? 'Radiant' : 'Dire'}</h3>{players.filter((player) => player.isRadiant === radiant).map((player) => <label key={player.playerSlot} className={styles.playerChoice}>
      <input type="radio" name="match-player" value={player.playerSlot} checked={selected === String(player.playerSlot)} onChange={(event) => onChange(event.target.value)} />
      <HeroPortrait key={player.heroKey ?? player.heroId} heroKey={player.heroKey}/>
      <span><strong>{player.heroName}</strong><span className={styles.note}>{player.playerName ?? 'Имя скрыто'}</span></span>{player.kills !== undefined && player.deaths !== undefined && player.assists !== undefined ? <span className={styles.rosterStats} title="Убийства / смерти / помощи">{player.kills}/{player.deaths}/{player.assists}</span> : null}
    </label>)}</div>)}</div>
  </fieldset>;
}
