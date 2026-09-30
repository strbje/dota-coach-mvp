export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';
const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';

type TypeRef = { kind?: string; name?: string; ofType?: TypeRef };
type SchemaArgument = { name?: string; description?: string; defaultValue?: string; type?: TypeRef };
type IntrospectionResponse = {
  data?: { __type?: { name?: string; description?: string;
    fields?: Array<{ name?: string; description?: string; type?: TypeRef; args?: SchemaArgument[] }>;
    enumValues?: Array<{ name?: string; description?: string; isDeprecated?: boolean; deprecationReason?: string }> } };
  errors?: Array<{ message?: string }>;
};

export async function GET(request: Request) {
  const token = process.env.STRATZ_API_TOKEN;
  const typeName = new URL(request.url).searchParams.get('type') ?? 'MatchType';

  if (!token) {
    return NextResponse.json({ ok: false, hasToken: false, endpoint: STRATZ_GRAPHQL_URL, typeName, fields: [], enumValues: [], errors: ['STRATZ_API_TOKEN missing'], notes: ['Schema discovery is optional research flow and must never block product UI.'] }, { status: 200 });
  }

  const query = `query IntrospectType($typeName: String!) {
    __type(name: $typeName) {
      name
      description
      fields {
        name
        description
        type { ${TYPE_REF} }
        args { name description defaultValue type { ${TYPE_REF} } }
      }
      enumValues(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
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
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000)
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const mayBeJson = contentType.includes('application/json') || contentType.includes('application/graphql-response+json') || text.trim().startsWith('{');
    const parsed = mayBeJson ? JSON.parse(text) as IntrospectionResponse : null;
    const errors = parsed?.errors?.map((entry) => entry.message ?? 'Unknown GraphQL error') ?? [];
    if (!response.ok) errors.push(`STRATZ HTTP ${response.status}`);
    if (!parsed?.data?.__type && errors.length === 0) errors.push('Requested schema type unavailable');
    const fields = parsed?.data?.__type?.fields?.map((field) => ({ name: field.name, description: field.description ?? null, type: field.type,
      args: (field.args ?? []).map((arg) => ({ name: arg.name, description: arg.description ?? null,
        defaultValue: arg.defaultValue ?? null, type: arg.type })) })) ?? [];
    const enumValues = parsed?.data?.__type?.enumValues?.map((value) => ({ ...value, description: value.description ?? null, deprecationReason: value.deprecationReason ?? null })) ?? [];

    return NextResponse.json({
      ok: response.ok && errors.length === 0,
      hasToken: true,
      capturedAt: new Date().toISOString(),
      endpoint: STRATZ_GRAPHQL_URL,
      typeName: parsed?.data?.__type?.name ?? typeName,
      typeDescription: parsed?.data?.__type?.description ?? null,
      fields,
      enumValues,
      errors,
      notes: [
        'Schema discovery is for research/debug only and must not be used directly by product UI.',
        errors.length > 0 ? 'If introspection is denied, use STRATZ GraphQL Explorer manually and document confirmed fields.' : 'Fields listed here are the current introspection snapshot for targeted schema discovery.'
      ]
    });
  } catch (error) {
    const parsed = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, hasToken: true, endpoint: STRATZ_GRAPHQL_URL, typeName, fields: [], enumValues: [], errors: [parsed], notes: ['Introspection call failed; fallback to GraphQL Explorer manual verification.'] }, { status: 502 });
  }
}
