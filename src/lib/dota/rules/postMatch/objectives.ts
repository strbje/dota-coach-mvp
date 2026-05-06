export type NormalizedObjectiveType = 'building' | 'roshan' | 'barracks' | 'aegis' | 'buyback' | 'rune' | 'unknown';

export function normalizeObjectiveType(rawType: string): NormalizedObjectiveType {
  if (rawType === 'CHAT_MESSAGE_TOWER_KILL') return 'building';
  if (rawType === 'building_kill') return 'building';
  if (rawType === 'CHAT_MESSAGE_BARRACKS_KILL') return 'barracks';
  if (rawType === 'CHAT_MESSAGE_AEGIS') return 'aegis';
  if (rawType === 'CHAT_MESSAGE_AEGIS_STOLEN') return 'aegis';
  if (rawType === 'CHAT_MESSAGE_MINIBOSS_KILL') return 'roshan';
  if (rawType === 'CHAT_MESSAGE_BUYBACK') return 'buyback';
  if (rawType === 'CHAT_MESSAGE_RUNE_PICKUP') return 'rune';
  return 'unknown';
}

export function getObjectiveLabel(type: NormalizedObjectiveType): string {
  if (type === 'building') return 'строение';
  if (type === 'roshan') return 'Roshan';
  if (type === 'barracks') return 'бараки';
  if (type === 'aegis') return 'Aegis/Roshan reward';
  if (type === 'buyback') return 'байбек';
  if (type === 'rune') return 'руна';
  return 'другое objective-событие';
}
