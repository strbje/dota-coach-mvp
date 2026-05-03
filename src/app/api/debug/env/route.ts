import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      hasOpenDotaApiKey: Boolean(process.env.OPENDOTA_API_KEY),
      hasStratzApiToken: Boolean(process.env.STRATZ_API_TOKEN),
      appName: process.env.NEXT_PUBLIC_APP_NAME ?? null
    }
  });
}
