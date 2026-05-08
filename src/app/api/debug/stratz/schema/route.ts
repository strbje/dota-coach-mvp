export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

export async function GET(request: Request) {
  const token = process.env.STRATZ_API_TOKEN;
  const typeName = new URL(request.url).searchParams.get('type') ?? 'MatchType';

  if (!token) {
    return NextResponse.json({ ok: false, hasToken: false, endpoint: STRATZ_GRAPHQL_URL, typeName, errors: ['STRATZ_API_TOKEN missing'], notes: ['Schema discovery is optional research flow and must never block product UI.'] }, { status: 200 });
  }

  const query = `query IntrospectType($typeName: String!) {
    __type(name: $typeName) {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }`;

  try {
    const response = await fetch(STRATZ_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dota-coach-mvp/0.1 local-dev'
      },
      body: JSON.stringify({ query, variables: { typeName } }),
      cache: 'no-store'
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const mayBeJson = contentType.includes('application/json') || contentType.includes('application/graphql-response+json') || text.trim().startsWith('{');
    type IntrospectionResponse = { data?: { __type?: { name?: string; fields?: Array<{ name?: string; type?: { kind?: string; name?: string; ofType?: { kind?: string; name?: string } } }> } }; errors?: Array<{ message?: string }> };
    const parsed = mayBeJson ? JSON.parse(text) as IntrospectionResponse : null;
    const errors = parsed?.errors?.map((entry) => entry.message ?? 'Unknown GraphQL error') ?? [];
    const fields = parsed?.data?.__type?.fields?.map((field) => ({ name: field.name, type: field.type })) ?? [];

    return NextResponse.json({
      ok: response.ok && errors.length === 0,
      hasToken: true,
      endpoint: STRATZ_GRAPHQL_URL,
      typeName: parsed?.data?.__type?.name ?? typeName,
      fields,
      errors,
      notes: [
        'Schema discovery is for research/debug only and must not be used directly by product UI.',
        errors.length > 0 ? 'If introspection is denied, use STRATZ GraphQL Explorer manually and document confirmed fields.' : 'Fields listed here are the current introspection snapshot for targeted schema discovery.'
      ]
    });
  } catch (error) {
    const parsed = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, hasToken: true, endpoint: STRATZ_GRAPHQL_URL, typeName, fields: [], errors: [parsed], notes: ['Introspection call failed; fallback to GraphQL Explorer manual verification.'] }, { status: 502 });
  }
}
