import type { Locale } from './locales';

const copy = {
  ru: {
    nav: { label: 'Основная навигация', home: 'Главная', postMatch: 'Разбор матча', preGame: 'План перед игрой', winrates: 'Винрейт игроков' },
    locale: { label: 'Язык интерфейса', ru: 'RU', en: 'EN' },
    home: {
      eyebrow: 'Тактический помощник', title: 'Разбери матч. Выбери цель на следующую игру.', lead: 'Посмотри свой темп фарма, найди эпизод для разбора и возьми одну цель в следующий матч.', postCta: 'Разобрать матч', preCta: 'Составить план', steps: 'Три шага к следующей игре', step1: 'Найди матч', step1Body: 'Введи ID завершённого матча и выбери себя в составе.', step2: 'Посмотри разбор', step2Body: 'Посмотри, что получилось и какие эпизоды стоит пересмотреть.', step3: 'Выбери цель', step3Body: 'Возьми одно конкретное действие в следующую игру.'
    },
    preGame: {
      eyebrow: 'До игры', title: 'План перед матчем', lead: 'Укажи пики на линии — получи план стартового закупа, разменов и билда.', submit: 'Составить план', loading: 'Составляем план…', initial: 'Выбери своего саппорта и двух соперников на линии.', failed: 'Не удалось составить план', unknownError: 'Неизвестная ошибка', lane: 'Оценка линии', startingItems: 'Стартовые предметы', mapPlan: 'План по карте', mistakes: 'Ошибки, которых стоит избежать', json: 'JSON плана'
    },
    postMatch: {
      eyebrow: 'После игры', title: 'Разбор матча', lead: 'Посмотри ключевые отрезки и выбери цель на следующую игру.', submit: 'Разобрать матч', loading: 'Разбираем матч…', loadingStatus: 'Получаем данные матча и строим рекомендации. Обычно это занимает несколько секунд, иногда до минуты.', initial: 'Введи ID матча, чтобы начать разбор.', matchIdLabel: 'ID матча', matchIdHint: 'Числовой ID завершённого матча', failed: 'Не удалось разобрать матч. Попробуй ещё раз.', unknownError: 'Неизвестная ошибка'
    }
  },
  en: {
    nav: { label: 'Main navigation', home: 'Home', postMatch: 'Match review', preGame: 'Pre-game plan', winrates: 'Win percentages' },
    locale: { label: 'Interface language', ru: 'RU', en: 'EN' },
    home: {
      eyebrow: 'Tactical assistant', title: 'A personal coach for your next game', lead: 'Review your decisions after a match or prepare a clear plan before it starts — without noise or guesswork.', postCta: 'Review a match', preCta: 'Build a plan', steps: 'From the match to your next decision', step1: 'Choose a match', step1Body: 'Enter the ID of a completed match.', step2: 'Get your review', step2Body: 'See the coach verdict, mistakes, and evidence.', step3: 'Pick a focus', step3Body: 'Take one concrete action into your next match.'
    },
    preGame: {
      eyebrow: 'Before the game', title: 'Pre-game plan', lead: 'Enter the draft and get a concrete plan for your lane, build, and map play.', submit: 'Build a plan', loading: 'Building your plan…', initial: 'Fill in the lineups to build a plan.', failed: 'Could not build the plan', unknownError: 'Unknown error', lane: 'Lane assessment', startingItems: 'Starting items', mapPlan: 'Map plan', mistakes: 'Mistakes to avoid', json: 'Plan JSON'
    },
    postMatch: {
      eyebrow: 'After the game', title: 'Match review', lead: 'Find out what shaped the game and what to focus on next.', submit: 'Review match', loading: 'Reviewing match…', loadingStatus: 'Fetching match data and building recommendations. This usually takes a few seconds, but can take up to a minute.', initial: 'Enter a Match ID to start the review.', matchIdLabel: 'Match ID', matchIdHint: 'Numeric ID of a completed match', failed: 'Could not review the match. Please try again.', unknownError: 'Unknown error'
    }
  }
} as const;

export function getUiCopy(locale: Locale) {
  return copy[locale];
}

const postMatchErrors = {
  ru: {
    INVALID_MATCH_ID: 'Введи корректный ID матча.',
    INVALID_PLAYER_SELECTOR: 'Не удалось однозначно определить выбранного игрока. Выбери игрока ещё раз.',
    OPENDOTA_INVALID_RESPONSE: 'OpenDota вернул некорректный ответ. Попробуй ещё раз через несколько секунд.',
    OPENDOTA_TIMEOUT: 'OpenDota сейчас отвечает слишком долго. Попробуй ещё раз.',
    OPENDOTA_NOT_FOUND: 'Матч не найден или ещё не обработан OpenDota.',
    OPENDOTA_RATE_LIMIT: 'OpenDota временно ограничил число запросов. Попробуй немного позже.',
    OPENDOTA_UNAVAILABLE: 'OpenDota временно недоступен. Попробуй позже.',
    STRATZ_NOT_CONFIGURED: 'Определение роли недоступно: подключение к STRATZ не настроено. Пока разбор этого игрока недоступен.',
    STRATZ_AUTH_FAILED: 'Не удалось подключиться к STRATZ: сервис отклонил авторизацию. Пока нельзя подтвердить роль игрока.',
    STRATZ_TIMEOUT: 'STRATZ не успел ответить. Роль игрока пока не подтверждена. Попробуй разобрать матч ещё раз.',
    STRATZ_UNAVAILABLE: 'STRATZ временно недоступен. Роль игрока пока не подтверждена. Попробуй позже.',
    STRATZ_INVALID_RESPONSE: 'STRATZ вернул неполный или некорректный ответ. Не удалось проверить роль игрока. Попробуй позже.',
    STRATZ_PLAYER_MISMATCH: 'Не удалось сопоставить выбранного игрока с данными STRATZ. Разбор остановлен, чтобы не использовать чужие данные.',
    POST_MATCH_ROLE_UNCONFIRMED: 'В полученных данных не удалось подтвердить роль игрока. Это не означает, что ты играл не на керри. Попробуй проверить матч позже.',
    UNSUPPORTED_POST_MATCH_ROLE: 'Для выбранного игрока определена другая роль. Сейчас разбор доступен только для керри.',
    POST_MATCH_FAILED: 'Не удалось разобрать матч. Попробуй ещё раз.'
  },
  en: {
    INVALID_MATCH_ID: 'Enter a valid Match ID.',
    INVALID_PLAYER_SELECTOR: 'We could not identify the selected player unambiguously. Please select the player again.',
    OPENDOTA_INVALID_RESPONSE: 'OpenDota returned an invalid response. Please try again in a few seconds.',
    OPENDOTA_TIMEOUT: 'OpenDota is taking too long to respond. Please try again.',
    OPENDOTA_NOT_FOUND: 'The match was not found or has not been processed by OpenDota yet.',
    OPENDOTA_RATE_LIMIT: 'OpenDota has temporarily limited requests. Please try again later.',
    OPENDOTA_UNAVAILABLE: 'OpenDota is temporarily unavailable. Please try again later.',
    STRATZ_NOT_CONFIGURED: 'Role verification is unavailable: the STRATZ connection has not been configured. This player cannot be reviewed yet.',
    STRATZ_AUTH_FAILED: 'STRATZ rejected authentication. We cannot verify the player’s role yet.',
    STRATZ_TIMEOUT: 'STRATZ did not respond in time. The player’s role is not verified yet. Please try reviewing the match again.',
    STRATZ_UNAVAILABLE: 'STRATZ is temporarily unavailable. The player’s role is not verified yet. Please try later.',
    STRATZ_INVALID_RESPONSE: 'STRATZ returned an incomplete or invalid response. We could not verify the player’s role. Please try later.',
    STRATZ_PLAYER_MISMATCH: 'We could not match the selected player to STRATZ data. The review was stopped to avoid using another player’s data.',
    POST_MATCH_ROLE_UNCONFIRMED: 'The available data does not confirm the player’s role. This does not mean you were not playing carry. Please check the match later.',
    UNSUPPORTED_POST_MATCH_ROLE: 'A different role was identified for this player. Match review currently supports carry only.',
    POST_MATCH_FAILED: 'Could not review the match. Please try again.'
  }
} as const;

export function getPostMatchErrorCopy(locale: Locale, errorCode: unknown): string {
  if (typeof errorCode === 'string' && errorCode in postMatchErrors[locale]) {
    return postMatchErrors[locale][errorCode as keyof typeof postMatchErrors.ru];
  }

  return postMatchErrors[locale].POST_MATCH_FAILED;
}

const preGameErrors = {
  ru: {
    INVALID_PRE_GAME_DRAFT: 'Проверь героев на линии: нужны две пары без повторов.',
    UNSUPPORTED_PRE_GAME_INPUT: 'Этот сценарий пока поддерживает только Lifestealer на позиции керри.',
    PRE_GAME_FAILED: 'Не удалось составить план. Попробуй ещё раз.'
  },
  en: {
    INVALID_PRE_GAME_DRAFT: 'Check the lane heroes: two pairs without duplicates are required.',
    UNSUPPORTED_PRE_GAME_INPUT: 'This scenario currently supports only Lifestealer carry.',
    PRE_GAME_FAILED: 'Could not build the plan. Please try again.'
  }
} as const;

export function getPreGameErrorCopy(locale: Locale, errorCode: unknown): string {
  if (typeof errorCode === 'string' && errorCode in preGameErrors[locale]) {
    return preGameErrors[locale][errorCode as keyof typeof preGameErrors.ru];
  }
  return preGameErrors[locale].PRE_GAME_FAILED;
}
