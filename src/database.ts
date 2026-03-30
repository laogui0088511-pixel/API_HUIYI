import { Pool } from 'pg';
import { TG_CREATE_TABLES_SQL } from './adminSchema';

let pool: Pool;

// ====== 内存缓存（替代 Redis） ======
interface CacheEntry {
  data: any;
  expiry: number;
}

const cacheStore = new Map<string, CacheEntry>();

export function cacheGet(key: string): any | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet(key: string, data: any, ttlSeconds: number): void {
  cacheStore.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 });
}

export function cacheDel(key: string): void {
  cacheStore.delete(key);
}

// ====== 数据库连接 ======
export function initDatabase(connectionString: string): Pool {
  pool = new Pool({ connectionString, max: 20 });
  pool.on('error', (err) => {
    console.error('数据库连接池异常:', err.message);
  });
  console.log('PostgreSQL 连接池已创建');
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return pool;
}

// 建表 SQL（直连 PG，不需要 RLS）
export const CREATE_TABLES_SQL = `
-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  room_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ttl_seconds INTEGER NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 2,
  assigned_to BIGINT,
  assigned_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE invite_codes ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS assigned_to BIGINT;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS assigned_name TEXT NOT NULL DEFAULT '';
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_expires ON invite_codes(expires_at);

-- 应用配置表
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

${TG_CREATE_TABLES_SQL}
`;
