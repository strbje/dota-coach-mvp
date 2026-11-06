import { canApplyCarryRulesForSelector, type RoleDetectionResult } from '../role/detectRole';
import type { PlayerSelector } from '../selection/playerSelector';

const roleVerificationErrors = {
  STRATZ_NOT_CONFIGURED: { error: 'Определение роли недоступно: подключение к STRATZ не настроено. Пока разбор этого игрока недоступен.', status: 503 },
  STRATZ_AUTH_FAILED: { error: 'Не удалось подключиться к STRATZ: сервис отклонил авторизацию. Пока нельзя подтвердить роль игрока.', status: 503 },
  STRATZ_TIMEOUT: { error: 'STRATZ не успел ответить. Роль игрока пока не подтверждена. Попробуй разобрать матч ещё раз.', status: 504 },
  STRATZ_UNAVAILABLE: { error: 'STRATZ временно недоступен. Роль игрока пока не подтверждена. Попробуй позже.', status: 503 },
  STRATZ_INVALID_RESPONSE: { error: 'STRATZ вернул неполный или некорректный ответ. Не удалось проверить роль игрока. Попробуй позже.', status: 502 },
  STRATZ_PLAYER_MISMATCH: { error: 'Не удалось сопоставить выбранного игрока с данными STRATZ. Разбор остановлен, чтобы не использовать чужие данные.', status: 422 },
  POST_MATCH_ROLE_UNCONFIRMED: { error: 'В полученных данных не удалось подтвердить роль игрока. Это не означает, что ты играл не на керри. Попробуй проверить матч позже.', status: 422 }
} as const;

export type RoleVerificationErrorCode = keyof typeof roleVerificationErrors;

export type PostMatchErrorCode = RoleVerificationErrorCode
  | 'INVALID_MATCH_ID'
  | 'INVALID_PLAYER_SELECTOR'
  | 'OPENDOTA_INVALID_RESPONSE'
  | 'OPENDOTA_TIMEOUT'
  | 'OPENDOTA_NOT_FOUND'
  | 'OPENDOTA_RATE_LIMIT'
  | 'OPENDOTA_UNAVAILABLE'
  | 'UNSUPPORTED_POST_MATCH_ROLE'
  | 'POST_MATCH_FAILED';

export type PublicPostMatchError = { errorCode: PostMatchErrorCode; error: string; status: number };

export class UnsupportedPostMatchRoleError extends Error {
  constructor(role: string) {
    super(`Post-match rules are not available for detected role: ${role}`);
    this.name = 'UnsupportedPostMatchRoleError';
  }
}

export class PostMatchRoleVerificationError extends Error {
  constructor(readonly code: RoleVerificationErrorCode) {
    super(code);
    this.name = 'PostMatchRoleVerificationError';
  }
}

export function assertPostMatchRole(role: RoleDetectionResult, selector: PlayerSelector, failure?: RoleVerificationErrorCode) {
  // Keep the existing eligibility policy, including its legacy selector behavior.
  if (canApplyCarryRulesForSelector(role, selector)) return;
  if (role.source === 'stratz' && ['mid', 'offlane', 'support'].includes(role.role)) {
    throw new UnsupportedPostMatchRoleError(role.role);
  }
  throw new PostMatchRoleVerificationError(failure ?? 'POST_MATCH_ROLE_UNCONFIRMED');
}

function errorChain(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    messages.push(`${current.name} ${current.message}`);
    current = current.cause;
  }
  return messages.join(' ').toLowerCase();
}

export function toPublicPostMatchError(error: unknown): PublicPostMatchError {
  if (error instanceof PostMatchRoleVerificationError) {
    return { errorCode: error.code, ...roleVerificationErrors[error.code] };
  }
  if (error instanceof Error && error.name === 'PlayerSelectionError') return { errorCode: 'INVALID_PLAYER_SELECTOR', error: 'Не удалось однозначно определить выбранного игрока. Выберите игрока ещё раз.', status: 422 };
  if (error instanceof UnsupportedPostMatchRoleError) {
    return { errorCode: 'UNSUPPORTED_POST_MATCH_ROLE', error: 'Для выбранного игрока определена другая роль. Сейчас разбор доступен только для керри.', status: 422 };
  }
  const chain = errorChain(error);
  if (chain.includes('playerselectionerror')) return { errorCode: 'INVALID_PLAYER_SELECTOR', error: 'Не удалось однозначно определить выбранного игрока. Выберите игрока ещё раз.', status: 422 };
  if (chain.includes('invalid json') || chain.includes('empty response body')) return { errorCode: 'OPENDOTA_INVALID_RESPONSE', error: 'OpenDota вернул некорректный ответ. Попробуйте ещё раз через несколько секунд.', status: 502 };
  if (chain.includes('not found') || chain.includes('status 404')) return { errorCode: 'OPENDOTA_NOT_FOUND', error: 'Матч не найден или ещё не обработан OpenDota.', status: 404 };
  if (chain.includes('rate limit') || chain.includes('status 429')) return { errorCode: 'OPENDOTA_RATE_LIMIT', error: 'OpenDota временно ограничил число запросов. Попробуйте немного позже.', status: 429 };
  if (chain.includes('service unavailable') || /status 5\d\d/.test(chain)) return { errorCode: 'OPENDOTA_UNAVAILABLE', error: 'OpenDota временно недоступен. Попробуйте позже.', status: 503 };
  if (chain.includes('timed out') || chain.includes('timeout') || chain.includes('fetch failed') || chain.includes('econnreset') || chain.includes('eai_again') || chain.includes('socket')) return { errorCode: 'OPENDOTA_TIMEOUT', error: 'OpenDota сейчас отвечает слишком долго. Попробуйте ещё раз.', status: 504 };
  return { errorCode: 'POST_MATCH_FAILED', error: 'Не удалось разобрать матч. Попробуйте ещё раз.', status: 502 };
}
