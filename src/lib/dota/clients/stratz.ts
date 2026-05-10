import type { StratzHeroContext } from '@/lib/dota/types/providers';

export const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

export const STRATZ_EVENTS_QUERY = `query DebugStratzEvents($id: Long!) {
  match(id: $id) {
    id
    durationSeconds
    chatEvents {
      time
      type
      fromHeroId
      toHeroId
      value
      isRadiant
    }
    players {
      steamAccountId
      heroId
      isRadiant
      stats {
        killEvents {
          time
        }
        deathEvents {
          time
        }
        assistEvents {
          time
        }
      }
    }
  }
}`;

type RunStratzQueryParams = {
  query: string;
  variables?: Record<string, unknown>;
  token: string;
};

export type RunStratzQueryResult = {
  ok: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  bodyLength?: number;
  bodyPreview?: string;
  json?: unknown;
  graphQLErrors?: unknown[];
  error?: string;
};

export async function runStratzQuery({ query, variables, token }: RunStratzQueryParams): Promise<RunStratzQueryResult> {
  try {
    const response = await fetch(STRATZ_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dota-coach-mvp/0.1 local-dev'
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store'
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const mayBeJson =
      contentType.includes('application/json') ||
      contentType.includes('application/graphql-response+json') ||
      text.trim().startsWith('{');

    let json: unknown;
    let parseError: string | undefined;
    if (mayBeJson) {
      try {
        json = JSON.parse(text) as unknown;
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
    }

    const graphQLErrors = Array.isArray((json as { errors?: unknown[] } | undefined)?.errors)
      ? ((json as { errors: unknown[] }).errors)
      : undefined;

    return {
      ok: response.ok && !parseError,
      status: response.status,
      statusText: response.statusText,
      contentType,
      bodyLength: text.length,
      bodyPreview: text.slice(0, 1000),
      json,
      graphQLErrors,
      error: parseError
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function fetchStratzHeroContext(hero: string, role: string): Promise<StratzHeroContext> {
  const token = process.env.STRATZ_API_TOKEN;
  if (!token) {
    return {
      hero,
      role,
      laneTips: ['STRATZ token missing. Using deterministic fallback context.'],
      itemPriors: ['Phase Boots', 'Armlet'],
      source: 'fallback'
    };
  }

  const probe = await runStratzQuery({
    query: '{ __typename }',
    token
  });

  if (!probe.ok) {
    return {
      hero,
      role,
      laneTips: ['STRATZ unavailable. Using deterministic fallback context.'],
      itemPriors: ['Phase Boots', 'Armlet'],
      source: 'fallback'
    };
  }

  return {
    hero,
    role,
    laneTips: ['Use prior build and matchup tendencies as tie-breakers only.'],
    itemPriors: ['Phase Boots', 'Armlet', 'Sange and Yasha'],
    source: 'stratz'
  };
}
