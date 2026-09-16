export type PostMatchErrorCode =
  | 'INVALID_MATCH_ID'
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
  if (error instanceof UnsupportedPostMatchRoleError) {
    return { errorCode: 'UNSUPPORTED_POST_MATCH_ROLE', error: 'Пока разбор доступен только для игроков, надёжно определённых как carry.', status: 422 };
  }
  const chain = errorChain(error);
  if (chain.includes('invalid json') || chain.includes('empty response body')) return { errorCode: 'OPENDOTA_INVALID_RESPONSE', error: 'OpenDota вернул некорректный ответ. Попробуйте ещё раз через несколько секунд.', status: 502 };
  if (chain.includes('not found') || chain.includes('status 404')) return { errorCode: 'OPENDOTA_NOT_FOUND', error: 'Матч не найден или ещё не обработан OpenDota.', status: 404 };
  if (chain.includes('rate limit') || chain.includes('status 429')) return { errorCode: 'OPENDOTA_RATE_LIMIT', error: 'OpenDota временно ограничил число запросов. Попробуйте немного позже.', status: 429 };
  if (chain.includes('service unavailable') || /status 5\d\d/.test(chain)) return { errorCode: 'OPENDOTA_UNAVAILABLE', error: 'OpenDota временно недоступен. Попробуйте позже.', status: 503 };
  if (chain.includes('timed out') || chain.includes('timeout') || chain.includes('fetch failed') || chain.includes('econnreset') || chain.includes('eai_again') || chain.includes('socket')) return { errorCode: 'OPENDOTA_TIMEOUT', error: 'OpenDota сейчас отвечает слишком долго. Попробуйте ещё раз.', status: 504 };
  return { errorCode: 'POST_MATCH_FAILED', error: 'Не удалось разобрать матч. Попробуйте ещё раз.', status: 502 };
}
