import type { PreGameAnalysis } from '../dota/types/domain';
import type { Locale } from './locales';

const ru: Record<string, string> = {
  'enemy short-trade pressure is high': 'Противник силён в коротких разменах',
  'lane punishes melee positioning mistakes': 'Ошибка в позиции на линии легко наказывается',
  'sustained fair trading is not favorable early': 'Долгие равные размены в начале невыгодны',
  'lane pattern not in hardcoded matchup set; using safe baseline plan': 'Для этой линии нет точного сценария — используем безопасный базовый план',
  short_trade_burst: 'Сильный урон в коротких разменах', chain_control_after_rage: 'Цепочка контроля после Rage', snowball_lane_pressure: 'Риск быстро проиграть линию после нескольких ошибок',
  'secure last hits': 'Помогает надёжнее добивать крипов', 'lane sustain': 'Даёт восстановление на линии', 'spell value on lane': 'Выгоден против частого использования заклинаний', 'stable CS foundation': 'Помогает стабильно добивать крипов', 'baseline sustain': 'Даёт базовое восстановление на линии', 'frequent lane spell value': 'Выгоден при частом использовании заклинаний на линии',
  'Tempo punish': 'Темповая сборка', 'Stable contact': 'Надёжный контакт',
  'when lane is stable and your team can convert fights into objectives': 'Когда линия стабильна, а команда может превращать победы в драках в объекты',
  'when you need safer midgame contact and better stickiness': 'Когда нужен более безопасный контакт в середине игры и возможность удерживаться на цели',
  'default safe branch for uncertain lane pressure': 'Безопасный базовый вариант при неясном давлении на линии',
  'prioritize creeps and HP over long melee trades': 'Ставьте добивание крипов и запас здоровья выше долгих разменов в ближнем бою',
  'use Rage for guaranteed survival or secure farm windows': 'Используйте Rage для гарантированного выживания или безопасного фарма',
  'secure last hits and avoid low-value brawls': 'Надёжно добивайте крипов и избегайте драк без явной выгоды',
  'isolated support targets': 'Изолированные герои поддержки', 'damaged backline heroes': 'Потрёпанные герои задней линии', 'exposed supports': 'Открытые герои поддержки',
  'healthy frontliner without support follow-up': 'Здоровый герой передней линии без поддержки команды', 'unbroken frontliner with backup': 'Здоровый герой передней линии с поддержкой команды',
  'do not commit Rage too early before the enemy truly commits': 'Не используйте Rage слишком рано — дождитесь реальной атаки противника', 'commit Rage reactively to real threat windows': 'Используйте Rage в ответ на реальную угрозу',
  'farm safest lane-to-jungle pattern available': 'Фармите по самому безопасному маршруту между линией и лесом', 'repeat safe farm loops': 'Повторяйте безопасные маршруты фарма',
  'join fights only when there is an objective to convert': 'Подключайтесь к дракам, только если победу можно превратить в объект', 'join only objective-convertible fights': 'Подключайтесь только к дракам за объекты',
  'take fights around vision and objective control, not empty map areas': 'Деритесь вокруг обзора и контроля объектов, а не в пустых частях карты', 'avoid vision-dark map fights': 'Избегайте драк без обзора',
  'using Rage too early': 'Слишком раннее использование Rage', 'taking long lane trades for low-value creeps': 'Долгие размены на линии ради малоценных крипов', 'joining random fights with no objective nearby': 'Подключение к случайным дракам без объекта рядом', 'random map movements with no objective': 'Бесцельные перемещения по карте'
  , 'STRATZ note: Use prior build and matchup tendencies as tie-breakers only.': 'Учитывайте прошлые сборки и особенности матчапа только как дополнительный ориентир.'
};

export const preGameHeadings = {
  ru: { branches: 'Варианты сборки', stages: 'План по этапам', threats: 'Главные угрозы', targets: 'Приоритет целей', primary: 'Основные цели:', avoid: 'Не начинать с:', notes: 'Подсказки:', hero: 'Герой', role: 'Роль', allies: 'Союзники', enemies: 'Противники', comma: 'Через запятую', allyPair: 'Ваша пара на лёгкой линии', enemyPair: 'Пара противника на сложной линии', difficulty: { easy: 'лёгкая', medium: 'средняя', hard: 'сложная' } },
  en: { branches: 'Build options', stages: 'Stage plan', threats: 'Main threats', targets: 'Target priority', primary: 'Primary targets:', avoid: 'Do not open on:', notes: 'Notes:', hero: 'Hero', role: 'Role', allies: 'Allies', enemies: 'Enemies', comma: 'Comma-separated', allyPair: 'Your safe-lane pair', enemyPair: 'Enemy off-lane pair', difficulty: { easy: 'easy', medium: 'medium', hard: 'hard' } }
} as const;

export function localizePreGameText(value: string, locale: Locale): string {
  return locale === 'ru' ? (ru[value] ?? value.replaceAll('_', ' ')) : value.replaceAll('_', ' ');
}

export function localizePreGameAnalysis(data: PreGameAnalysis, locale: Locale): PreGameAnalysis {
  const t = (value: string) => localizePreGameText(value, locale);
  return { ...data, lane: { ...data.lane, reasons: data.lane.reasons.map(t) }, threats: data.threats.map(t), startingItems: data.startingItems.map((item) => ({ ...item, reason: t(item.reason) })), buildBranches: data.buildBranches.map((branch) => ({ ...branch, title: t(branch.title), when: t(branch.when) })), stagePlan: data.stagePlan.map((stage) => ({ ...stage, goals: stage.goals.map(t) })), targetPriority: { primary: data.targetPriority.primary.map(t), avoidOpeningOn: data.targetPriority.avoidOpeningOn.map(t), notes: data.targetPriority.notes.map(t) }, mapPlan: { early: data.mapPlan.early.map(t), mid: data.mapPlan.mid.map(t), late: data.mapPlan.late.map(t) }, mistakesToAvoid: data.mistakesToAvoid.map(t) };
}
