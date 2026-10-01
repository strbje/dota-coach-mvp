export const runtime = 'nodejs';

import { handleDebugMatch } from '@/lib/dota/debugMatchHandler';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleDebugMatch(request, context);
}
