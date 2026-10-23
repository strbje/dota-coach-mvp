import { fetchOpenDotaPath, OpenDotaHttpError } from '../providers/opendotaProvider';
import type { Failure } from './types';

export const CACHE_TTL_MS = 5 * 60 * 1000;
export class SourceError extends Error {
  constructor(public readonly code: Failure, public readonly retryAfter?: number) { super(code); }
}
export type Resource = { value: unknown; fetchedAt: number; expiresAt: number };
export type Source = { get(path: string, deadline: number, signal?: AbortSignal): Promise<Resource> };
export const failure = (error: unknown): Failure => error instanceof SourceError ? error.code : 'provider_error';

export function waitFor<T>(promise: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new SourceError('timeout')); }, Math.max(0, deadline - Date.now()));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    promise.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
  });
}

type Job = { path: string; deadline: number; resolve(value: unknown): void; reject(error: unknown): void };

/** Process-local rate limit and bounded cache; pending requests are shared, not owned by one caller's signal. */
export class OpenDotaSource implements Source {
  private cache = new Map<string, Resource>();
  private pending = new Map<string, Promise<Resource>>();
  private queue: Job[] = [];
  private active = 0;
  private nextStart = 0;
  private blockedUntil = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: {
    fetcher?: typeof fetchOpenDotaPath; spacingMs?: number; ttlMs?: number; maxEntries?: number; requestMs?: number;
  } = {}) {}

  async get(path: string, deadline: number, signal?: AbortSignal): Promise<Resource> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() >= deadline) throw new SourceError('timeout');
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt * 1000 > Date.now()) return cached;
    this.cache.delete(path);
    let pending = this.pending.get(path);
    if (!pending) {
      if (this.pending.size >= (this.options.maxEntries ?? 128)) throw new SourceError('rate_limit', 5);
      pending = this.load(path, Math.min(deadline, Date.now() + (this.options.requestMs ?? 8000))).finally(() => this.pending.delete(path));
      this.pending.set(path, pending);
    }
    return waitFor(pending, deadline, signal);
  }

  private async load(path: string, deadline: number): Promise<Resource> {
    const fetchedAt = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await new Promise<unknown>((resolve, reject) => { this.queue.push({ path, deadline, resolve, reject }); this.pump(); });
        const resource = { value, fetchedAt: Math.floor(fetchedAt / 1000), expiresAt: Math.floor((fetchedAt + (this.options.ttlMs ?? CACHE_TTL_MS)) / 1000) };
        this.cache.set(path, resource);
        while (this.cache.size > (this.options.maxEntries ?? 128)) this.cache.delete(this.cache.keys().next().value!);
        return resource;
      } catch (error) {
        if (error instanceof OpenDotaHttpError && error.status === 429) throw new SourceError('rate_limit', error.retryAfterSeconds ?? 60);
        if (error instanceof SourceError) throw error;
        if (error instanceof OpenDotaHttpError && error.status < 500) throw new SourceError('provider_error');
        if (Date.now() >= deadline || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) throw new SourceError('timeout');
        if (attempt === 1 || deadline - Date.now() < 1000) throw new SourceError('provider_error');
      }
    }
  }

  private pump() {
    clearTimeout(this.timer);
    const now = Date.now();
    this.queue = this.queue.filter((job) => {
      if (now >= job.deadline) { job.reject(new SourceError('timeout')); return false; }
      if (now < this.blockedUntil) { job.reject(new SourceError('rate_limit', Math.ceil((this.blockedUntil - now) / 1000))); return false; }
      return true;
    });
    if (!this.queue.length) return;
    if (this.active < 2 && now >= this.nextStart) {
      const job = this.queue.shift()!;
      this.active++;
      this.nextStart = now + (this.options.spacingMs ?? 1100);
      const fetcher = this.options.fetcher ?? fetchOpenDotaPath;
      // fetchOpenDotaPath bounds both headers and body consumption.
      fetcher(job.path, { timeoutMs: Math.max(1, job.deadline - now) }).then(job.resolve, (error: unknown) => {
        if (error instanceof OpenDotaHttpError && error.status === 429) this.blockedUntil = Date.now() + (error.retryAfterSeconds ?? 60) * 1000;
        job.reject(error);
      }).finally(() => { this.active--; this.pump(); });
    }
    if (this.queue.length) {
      const wake = this.active < 2 ? Math.min(this.nextStart, ...this.queue.map((job) => job.deadline)) : Math.min(...this.queue.map((job) => job.deadline));
      this.timer = setTimeout(() => this.pump(), Math.max(1, wake - Date.now()));
    }
  }
}

// Route bundles and dev reloads must share the same provider budget/cache in this process.
const processCache = globalThis as typeof globalThis & { __dotaWinrateSource?: OpenDotaSource };
export const winrateSource = processCache.__dotaWinrateSource ??= new OpenDotaSource();
