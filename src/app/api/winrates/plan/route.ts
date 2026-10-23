import { handleWinrate } from '@/lib/dota/winrates/handler';
export const runtime = 'nodejs';
export const maxDuration = 25;
export const POST = (request: Request) => handleWinrate(request, 'plan');
