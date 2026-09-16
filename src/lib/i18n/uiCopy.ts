import type { Locale } from './locales';

const copy = {
  ru: {
    nav: { label: 'Основная навигация', home: 'Главная', postMatch: 'Разбор матча', preGame: 'План перед игрой' },
    locale: { label: 'Язык интерфейса', ru: 'RU', en: 'EN' },
    home: {
      eyebrow: 'Тактический помощник', title: 'Персональный тренер для вашей следующей игры', lead: 'Разберите решения после матча или подготовьте чёткий план до старта — без лишней статистики и догадок.', postCta: 'Разобрать матч', preCta: 'Составить план', steps: 'От матча к следующему решению', step1: 'Укажите матч', step1Body: 'Введите ID завершённой игры.', step2: 'Получите разбор', step2Body: 'Посмотрите вывод тренера, ошибки и доказательства.', step3: 'Выберите фокус', step3Body: 'Возьмите одно конкретное действие в следующий матч.'
    },
    preGame: {
      eyebrow: 'До игры', title: 'План перед матчем', lead: 'Зафиксируйте драфт и получите конкретный план для линии, сборки и карты.', submit: 'Составить план', loading: 'Составляем план…', initial: 'Заполните составы, чтобы составить план.', failed: 'Не удалось составить план', unknownError: 'Неизвестная ошибка', lane: 'Оценка линии', startingItems: 'Стартовые предметы', mapPlan: 'План по карте', mistakes: 'Ошибки, которых стоит избежать', json: 'JSON плана'
    },
    postMatch: {
      eyebrow: 'После игры', title: 'Разбор матча', lead: 'Узнайте, что определило игру и какой фокус взять в следующий матч.', submit: 'Разобрать матч', loading: 'Разбираем матч…', loadingStatus: 'Получаем данные матча и строим рекомендации. Обычно это занимает несколько секунд, иногда до минуты.', initial: 'Введите Match ID, чтобы начать разбор.', matchIdLabel: 'Match ID', matchIdHint: 'Числовой ID завершённого матча', failed: 'Не удалось разобрать матч. Попробуйте ещё раз.', unknownError: 'Неизвестная ошибка'
    }
  },
  en: {
    nav: { label: 'Main navigation', home: 'Home', postMatch: 'Match review', preGame: 'Pre-game plan' },
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
    INVALID_MATCH_ID: 'Введите корректный Match ID.',
    INVALID_PLAYER_SELECTOR: 'Не удалось однозначно определить выбранного игрока. Выберите игрока ещё раз.',
    OPENDOTA_INVALID_RESPONSE: 'OpenDota вернул некорректный ответ. Попробуйте ещё раз через несколько секунд.',
    OPENDOTA_TIMEOUT: 'OpenDota сейчас отвечает слишком долго. Попробуйте ещё раз.',
    OPENDOTA_NOT_FOUND: 'Матч не найден или ещё не обработан OpenDota.',
    OPENDOTA_RATE_LIMIT: 'OpenDota временно ограничил число запросов. Попробуйте немного позже.',
    OPENDOTA_UNAVAILABLE: 'OpenDota временно недоступен. Попробуйте позже.',
    UNSUPPORTED_POST_MATCH_ROLE: 'Пока разбор доступен только для игроков, надёжно определённых как carry.',
    POST_MATCH_FAILED: 'Не удалось разобрать матч. Попробуйте ещё раз.'
  },
  en: {
    INVALID_MATCH_ID: 'Enter a valid Match ID.',
    INVALID_PLAYER_SELECTOR: 'We could not identify the selected player unambiguously. Please select the player again.',
    OPENDOTA_INVALID_RESPONSE: 'OpenDota returned an invalid response. Please try again in a few seconds.',
    OPENDOTA_TIMEOUT: 'OpenDota is taking too long to respond. Please try again.',
    OPENDOTA_NOT_FOUND: 'The match was not found or has not been processed by OpenDota yet.',
    OPENDOTA_RATE_LIMIT: 'OpenDota has temporarily limited requests. Please try again later.',
    OPENDOTA_UNAVAILABLE: 'OpenDota is temporarily unavailable. Please try again later.',
    UNSUPPORTED_POST_MATCH_ROLE: 'Match review currently supports only players reliably identified as carry.',
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
    UNSUPPORTED_PRE_GAME_INPUT: 'Этот сценарий пока поддерживает только Lifestealer на позиции керри.',
    PRE_GAME_FAILED: 'Не удалось составить план. Попробуйте ещё раз.'
  },
  en: {
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
