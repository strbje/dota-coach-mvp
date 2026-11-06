import type { PreGameAnalysis } from '../dota/types/domain';
import type { Locale } from './locales';

const ru: Record<string, string> = {
  'enemy short-trade pressure is high': 'Противник силён в коротких разменах',
  'lane punishes melee positioning mistakes': 'Ошибка в позиции на линии легко наказывается',
  'sustained fair trading is not favorable early': 'Долгие равные размены в начале невыгодны',
  'lane pattern not in hardcoded matchup set; using safe baseline plan': 'Для этого матчапа пока есть только общий план',
  short_trade_burst: 'Сильный урон в коротких разменах', chain_control_after_rage: 'Цепочка контроля после Rage', snowball_lane_pressure: 'Риск быстро проиграть линию после нескольких ошибок',
  'secure last hits': 'Помогает надёжнее добивать крипов', 'lane sustain': 'Даёт восстановление на линии', 'spell value on lane': 'Выгоден против частого использования заклинаний', 'stable CS foundation': 'Помогает стабильно добивать крипов', 'baseline sustain': 'Даёт базовое восстановление на линии', 'frequent lane spell value': 'Выгоден при частом использовании заклинаний на линии',
  'Tempo punish': 'Темповая сборка', 'Stable contact': 'Чтобы держаться на цели',
  'when lane is stable and your team can convert fights into objectives': 'Когда линия стабильна, а команда может превращать победы в драках в объекты',
  'when you need safer midgame contact and better stickiness': 'Когда важно догонять цель и продолжать бить её в драке',
  'default safe branch for uncertain lane pressure': 'Безопасный базовый вариант при неясном давлении на линии',
  'prioritize creeps and HP over long melee trades': 'Сохраняй здоровье и добивай крипов; не затягивай невыгодные размены',
  'save Rage for a dangerous trade or disengage': 'Сохраняй Rage для опасного размена или выхода из драки',
  'secure last hits and avoid low-value brawls': 'Добивай крипов и избегай драк без явной выгоды',
  'isolated support targets': 'Саппорты без прикрытия', 'damaged backline heroes': 'Герои с малым запасом здоровья за спиной противника', 'exposed supports': 'Саппорты без прикрытия',
  'healthy frontliner without support follow-up': 'Герой с полным здоровьем, если союзники не могут поддержать твой заход', 'unbroken frontliner with backup': 'Герой с полным здоровьем под прикрытием своей команды',
  'do not commit Rage too early before the enemy truly commits': 'Не трать Rage до того, как противник начнёт атаковать', 'commit Rage reactively to real threat windows': 'Используй Rage в ответ на угрозу',
  'farm safest lane-to-jungle pattern available': 'Выбирай безопасный маршрут между линией и лесом', 'repeat safe farm loops': 'Повторяй безопасный маршрут фарма',
  'join fights only when there is an objective to convert': 'Перед подключением к драке оцени, что можно забрать после неё: башню или Рошана', 'join only objective-convertible fights': 'Ищи драки, после которых команда сможет забрать башню или Рошана',
  'take fights around vision and objective control, not empty map areas': 'Выбирай драки под своим виженом, рядом с башнями или Рошаном', 'avoid vision-dark map fights': 'Не заходи в драку без вижена',
  'using Rage too early': 'Слишком раннее использование Rage', 'taking long lane trades for low-value creeps': 'Долгие размены на линии ради малоценных крипов', 'joining random fights with no objective nearby': 'Подключение к случайным дракам без объекта рядом', 'random map movements with no objective': 'Бесцельные перемещения по карте'
  , 'STRATZ note: Use prior build and matchup tendencies as tie-breakers only.': 'Учитывай прошлые сборки и особенности матчапа только как дополнительный ориентир.'
};

export const preGameHeadings = {
  ru: { branches: 'Варианты сборки', stages: 'План по этапам', threats: 'Главные угрозы', targets: 'Кого фокусить в драке', primary: 'Фокус:', avoid: 'Не начинать с:', notes: 'Подсказки:', hero: 'Герой', role: 'Роль', allies: 'Союзники', enemies: 'Противники', comma: 'Через запятую', allyPair: 'Твоя линия', enemyPair: 'Соперники на линии', difficulty: { easy: 'лёгкая', medium: 'средняя', hard: 'сложная', unknown: 'Не оценена' } },
  en: { branches: 'Build options', stages: 'Stage plan', threats: 'Main threats', targets: 'Target priority', primary: 'Primary targets:', avoid: 'Do not open on:', notes: 'Notes:', hero: 'Hero', role: 'Role', allies: 'Allies', enemies: 'Enemies', comma: 'Comma-separated', allyPair: 'Your safe-lane pair', enemyPair: 'Enemy off-lane pair', difficulty: { easy: 'easy', medium: 'medium', hard: 'hard', unknown: 'Not assessed' } }
} as const;

export function localizePreGameText(value: string, locale: Locale): string {
  return locale === 'ru' ? (ru[value] ?? value.replaceAll('_', ' ')) : value.replaceAll('_', ' ');
}

export function localizePreGameAnalysis(data: PreGameAnalysis, locale: Locale): PreGameAnalysis {
  const t = (value: string) => localizePreGameText(value, locale);
  return { ...data, lane: { ...data.lane, reasons: data.lane.reasons.map(t) }, threats: data.threats.map(t), startingItems: data.startingItems.map((item) => ({ ...item, reason: t(item.reason) })), buildBranches: data.buildBranches.map((branch) => ({ ...branch, title: t(branch.title), when: t(branch.when) })), stagePlan: data.stagePlan.map((stage) => ({ ...stage, goals: stage.goals.map(t) })), targetPriority: { primary: data.targetPriority.primary.map(t), avoidOpeningOn: data.targetPriority.avoidOpeningOn.map(t), notes: data.targetPriority.notes.map(t) }, mapPlan: { early: data.mapPlan.early.map(t), mid: data.mapPlan.mid.map(t), late: data.mapPlan.late.map(t) }, mistakesToAvoid: data.mistakesToAvoid.map(t) };
}
