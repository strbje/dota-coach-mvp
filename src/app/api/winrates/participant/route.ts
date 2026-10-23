import { handleWinrate } from '@/lib/dota/winrates/handler';
export const runtime = 'nodejs';
export const maxDuration = 20;
export const POST = (request: Request) => handleWinrate(request, 'participant');
