import Redis from 'ioredis';
import { env } from './env';

export const CACHE_TTL = {
  FIGHTERS_ALL: 3600,
  FREE_AGENTS: 300,
  EVENTS_UPCOMING: 600,
  STANDINGS: 120,
} as const;

// Minimal interface — only the operations we actually use
interface CacheClient {
  connect(): Promise<void>;
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryCache implements CacheClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async connect() {
    console.warn(
      '[Cache] Redis not configured — using in-memory cache (restarts clear all cached data)',
    );
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class RedisCache implements CacheClient {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
    });
    this.client.on('error', () => {}); // suppress unhandled-error crashes
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('[Cache] Redis connected');
  }

  async get(key: string) {
    return this.client.get(key).catch(() => null);
  }

  async setex(key: string, ttlSeconds: number, value: string) {
    await this.client.setex(key, ttlSeconds, value).catch(() => {});
  }

  async del(key: string) {
    await this.client.del(key).catch(() => {});
  }
}

export const redis: CacheClient = env.REDIS_URL ? new RedisCache(env.REDIS_URL) : new MemoryCache();
