import crypto from 'crypto';
import { getPool } from './database';

export interface AdminRecord {
  telegram_id: number;
  username: string | null;
}

export interface SaleBot {
  id: number;
  bot_token: string;
  bot_username: string | null;
  bot_name: string | null;
  added_by: number | null;
  active: boolean;
}

export interface PackageRecord {
  id: number;
  quantity: number;
  unit_price: number;
}

export interface PaymentOrder {
  id: number;
  telegram_id: number;
  bot_id: number;
  package_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  amount_offset: number;
  payable_amount: number;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  tx_hash: string | null;
  created_at: string;
  expire_at: string;
  paid_at: string | null;
}

export interface UserCode {
  id: number;
  telegram_id: number;
  bot_id: number;
  code: string;
  used: boolean;
  room_name: string | null;
  created_at: string;
}

export interface BotBinding {
  id: number;
  bot_id: number;
  telegram_id: number;
  created_at: string;
}

export interface BotCodeStats {
  botId: number;
  botName: string;
  total: number;
  used: number;
  unused: number;
  expired: number;
}

export interface CodeDetail {
  code: string;
  room_name: string | null;
  activated_at: string | null;
  expires_at: string | null;
  ttl_seconds: number;
  created_at: string;
  status: 'unused' | 'in_use' | 'expired';
  remaining_seconds: number | null;
}

export function buildDisabledBotToken(): string {
  return `disabled:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
}

export async function isAdmin(telegramId: number): Promise<boolean> {
  const { rows } = await getPool().query('SELECT id FROM tg_admins WHERE telegram_id = $1', [telegramId]);
  return rows.length > 0;
}

export async function addAdmin(telegramId: number, username?: string): Promise<boolean> {
  try {
    await getPool().query(
      'INSERT INTO tg_admins (telegram_id, username) VALUES ($1, $2) ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username',
      [telegramId, username || null],
    );
    return true;
  } catch {
    return false;
  }
}

export async function removeAdmin(telegramId: number): Promise<boolean> {
  try {
    await getPool().query('DELETE FROM tg_admins WHERE telegram_id = $1', [telegramId]);
    return true;
  } catch {
    return false;
  }
}

export async function getAdmins(): Promise<AdminRecord[]> {
  const { rows } = await getPool().query('SELECT telegram_id, username FROM tg_admins');
  return rows as AdminRecord[];
}

export async function initAdmins(adminIds: number[]): Promise<void> {
  for (const adminId of adminIds) {
    const exists = await isAdmin(adminId);
    if (!exists) {
      await addAdmin(adminId);
    }
  }
}

export async function addSaleBot(
  botToken: string,
  botUsername: string | null,
  botName: string,
  addedBy: number | null,
): Promise<boolean> {
  try {
    await getPool().query(
      'INSERT INTO tg_sale_bots (bot_token, bot_username, bot_name, added_by) VALUES ($1, $2, $3, $4)',
      [botToken, botUsername, botName, addedBy],
    );
    return true;
  } catch {
    return false;
  }
}

export async function removeSaleBot(id: number): Promise<boolean> {
  try {
    await getPool().query('DELETE FROM tg_sale_bots WHERE id = $1', [id]);
    return true;
  } catch {
    return false;
  }
}

export async function getSaleBots(): Promise<SaleBot[]> {
  const { rows } = await getPool().query('SELECT * FROM tg_sale_bots WHERE active = true ORDER BY id ASC');
  return rows as SaleBot[];
}

export async function getSaleBotById(id: number): Promise<SaleBot | null> {
  const { rows } = await getPool().query('SELECT * FROM tg_sale_bots WHERE id = $1', [id]);
  return (rows[0] as SaleBot) || null;
}

export async function addPackage(quantity: number, unitPrice: number): Promise<boolean> {
  try {
    await getPool().query('INSERT INTO tg_packages (quantity, unit_price) VALUES ($1, $2)', [quantity, unitPrice]);
    return true;
  } catch {
    return false;
  }
}

export async function removePackage(id: number): Promise<boolean> {
  try {
    await getPool().query('DELETE FROM tg_packages WHERE id = $1', [id]);
    return true;
  } catch {
    return false;
  }
}

export async function getPackages(): Promise<PackageRecord[]> {
  const { rows } = await getPool().query('SELECT * FROM tg_packages ORDER BY quantity ASC');
  return rows as PackageRecord[];
}

export async function createPaymentOrder(input: {
  telegramId: number;
  botId: number;
  packageId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  amountOffset: number;
  payableAmount: number;
  expireAt: string;
}): Promise<PaymentOrder | null> {
  try {
    const { rows } = await getPool().query(
      `INSERT INTO tg_payment_orders (telegram_id, bot_id, package_id, quantity, unit_price, total_price, amount_offset, payable_amount, expire_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [input.telegramId, input.botId, input.packageId, input.quantity, input.unitPrice, input.totalPrice, input.amountOffset, input.payableAmount, input.expireAt],
    );
    return (rows[0] as PaymentOrder) || null;
  } catch {
    return null;
  }
}

export async function getPendingPaymentOrders(): Promise<PaymentOrder[]> {
  const { rows } = await getPool().query(
    "SELECT * FROM tg_payment_orders WHERE status = 'pending' AND expire_at > $1 ORDER BY created_at ASC",
    [new Date().toISOString()],
  );
  return rows as PaymentOrder[];
}

export async function listPaymentOrders(status?: PaymentOrder['status']): Promise<PaymentOrder[]> {
  if (status) {
    const { rows } = await getPool().query(
      'SELECT * FROM tg_payment_orders WHERE status = $1 ORDER BY created_at DESC',
      [status],
    );
    return rows as PaymentOrder[];
  }
  const { rows } = await getPool().query('SELECT * FROM tg_payment_orders ORDER BY created_at DESC');
  return rows as PaymentOrder[];
}

export async function getRecentPendingOrdersByTotal(totalPrice: number): Promise<PaymentOrder[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await getPool().query(
    "SELECT * FROM tg_payment_orders WHERE status = 'pending' AND total_price = $1 AND created_at >= $2",
    [totalPrice, since],
  );
  return rows as PaymentOrder[];
}

export async function findPaymentOrderByTxHash(txHash: string): Promise<PaymentOrder | null> {
  const { rows } = await getPool().query('SELECT * FROM tg_payment_orders WHERE tx_hash = $1', [txHash]);
  return (rows[0] as PaymentOrder) || null;
}

export async function markPaymentOrderPaid(orderId: number, txHash: string): Promise<boolean> {
  try {
    const result = await getPool().query(
      "UPDATE tg_payment_orders SET status = 'paid', tx_hash = $1, paid_at = $2 WHERE id = $3 AND status = 'pending'",
      [txHash, new Date().toISOString(), orderId],
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function markPaymentOrderFailed(orderId: number): Promise<boolean> {
  try {
    const result = await getPool().query(
      "UPDATE tg_payment_orders SET status = 'failed' WHERE id = $1 AND status = 'pending'",
      [orderId],
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function expirePendingPaymentOrders(): Promise<boolean> {
  try {
    await getPool().query(
      "UPDATE tg_payment_orders SET status = 'expired' WHERE status = 'pending' AND expire_at < $1",
      [new Date().toISOString()],
    );
    return true;
  } catch {
    return false;
  }
}

export async function addUserCodes(telegramId: number, botId: number, codes: string[]): Promise<boolean> {
  if (codes.length === 0) return true;
  try {
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const code of codes) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++})`);
      values.push(telegramId, botId, code);
    }
    await getPool().query(
      `INSERT INTO tg_user_codes (telegram_id, bot_id, code) VALUES ${placeholders.join(', ')}`,
      values,
    );
    return true;
  } catch {
    return false;
  }
}

export async function addBotCodes(botId: number, codes: string[], telegramId = 0): Promise<boolean> {
  return addUserCodes(telegramId, botId, codes);
}

export async function getBotCodes(botId: number, used?: boolean): Promise<UserCode[]> {
  if (used !== undefined) {
    const { rows } = await getPool().query(
      'SELECT * FROM tg_user_codes WHERE bot_id = $1 AND used = $2 ORDER BY created_at DESC',
      [botId, used],
    );
    return rows as UserCode[];
  }
  const { rows } = await getPool().query(
    'SELECT * FROM tg_user_codes WHERE bot_id = $1 ORDER BY created_at DESC',
    [botId],
  );
  return rows as UserCode[];
}

export async function markCodeUsed(code: string, roomName?: string): Promise<boolean> {
  try {
    if (roomName) {
      await getPool().query('UPDATE tg_user_codes SET used = true, room_name = $1 WHERE code = $2', [roomName, code]);
    } else {
      await getPool().query('UPDATE tg_user_codes SET used = true WHERE code = $1', [code]);
    }
    return true;
  } catch {
    return false;
  }
}

export async function markCodeUnused(code: string): Promise<boolean> {
  try {
    await getPool().query('UPDATE tg_user_codes SET used = false, room_name = NULL WHERE code = $1', [code]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteUserCode(code: string): Promise<boolean> {
  try {
    await getPool().query('DELETE FROM tg_user_codes WHERE code = $1', [code]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllBotCodes(botId: number): Promise<number> {
  const { rows } = await getPool().query('SELECT code FROM tg_user_codes WHERE bot_id = $1', [botId]);
  if (rows.length === 0) return 0;
  const result = await getPool().query('DELETE FROM tg_user_codes WHERE bot_id = $1', [botId]);
  return result.rowCount ?? 0;
}

export async function getBotBindings(botId: number): Promise<BotBinding[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM tg_bot_bindings WHERE bot_id = $1 ORDER BY created_at ASC',
    [botId],
  );
  return rows as BotBinding[];
}

export async function isBotUserBound(botId: number, telegramId: number): Promise<boolean> {
  const { rows } = await getPool().query(
    'SELECT id FROM tg_bot_bindings WHERE bot_id = $1 AND telegram_id = $2',
    [botId, telegramId],
  );
  return rows.length > 0;
}

export async function bindBotUser(
  botId: number,
  telegramId: number,
): Promise<'bound' | 'exists' | 'full' | 'error'> {
  const exists = await isBotUserBound(botId, telegramId);
  if (exists) {
    return 'exists';
  }

  const bindings = await getBotBindings(botId);
  if (bindings.length >= 2) {
    return 'full';
  }

  const { error } = await getPool().query(
    'INSERT INTO tg_bot_bindings (bot_id, telegram_id) VALUES ($1, $2)',
    [botId, telegramId],
  ).catch((err) => ({ error: err })) as any;
  return error ? 'error' : 'bound';
}

export async function unbindBotUser(botId: number, telegramId: number): Promise<boolean> {
  try {
    await getPool().query(
      'DELETE FROM tg_bot_bindings WHERE bot_id = $1 AND telegram_id = $2',
      [botId, telegramId],
    );
    return true;
  } catch {
    return false;
  }
}

export async function getAllCodesStatsByBot(): Promise<BotCodeStats[]> {
  const bots = await getSaleBots();
  const result: BotCodeStats[] = [];
  const now = Date.now();

  for (const bot of bots) {
    const codes = await getBotCodes(bot.id);
    const total = codes.length;

    if (total === 0) {
      result.push({
        botId: bot.id,
        botName: bot.bot_name || bot.bot_username || '未命名渠道',
        total: 0,
        used: 0,
        unused: 0,
        expired: 0,
      });
      continue;
    }

    const codeStrings = codes.map((item) => item.code.trim().toUpperCase());
    const { rows: invites } = await getPool().query(
      'SELECT code, room_name, activated_at, expires_at FROM invite_codes WHERE code = ANY($1)',
      [codeStrings],
    );

    let used = 0;
    let expired = 0;

    if (invites && invites.length > 0) {
      const inviteMap = new Map(invites.map((item: any) => [item.code, item]));      for (const code of codes) {
        const invite = inviteMap.get(code.code.trim().toUpperCase()) as any;
        if (!invite) {
          if (code.used) {
            used += 1;
          }
          continue;
        }

        const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : null;
        const isExpired = expiresAt !== null && expiresAt <= now;
        const isInUse = !!invite.room_name && !isExpired;
        if (isExpired) {
          expired += 1;
        } else if (isInUse || invite.activated_at) {
          used += 1;
        }
      }
    } else {
      used = codes.filter((item) => item.used).length;
    }

    result.push({
      botId: bot.id,
      botName: bot.bot_name || bot.bot_username || '未命名渠道',
      total,
      used,
      unused: total - used - expired,
      expired,
    });
  }

  return result;
}

export async function getBotCodesDetail(botId: number): Promise<CodeDetail[]> {
  const codes = await getBotCodes(botId);
  if (codes.length === 0) {
    return [];
  }

  const codeStrings = codes.map((item) => item.code.trim().toUpperCase());
  const { rows: invites } = await getPool().query(
    'SELECT * FROM invite_codes WHERE code = ANY($1)',
    [codeStrings],
  );

  const inviteMap = new Map((invites || []).map((item: any) => [item.code, item]));
  const now = Date.now();

  return codes.map((code) => {
    const invite = inviteMap.get(code.code.trim().toUpperCase()) as any;
    if (!invite) {
      return {
        code: code.code,
        room_name: code.room_name,
        activated_at: null,
        expires_at: null,
        ttl_seconds: 0,
        created_at: code.created_at,
        status: code.used ? 'in_use' : 'unused',
        remaining_seconds: null,
      } satisfies CodeDetail;
    }

    const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : null;
    const isExpired = expiresAt !== null && expiresAt <= now;
    const isInUse = !!invite.activated_at && !isExpired;

    return {
      code: code.code,
      room_name: invite.room_name,
      activated_at: invite.activated_at,
      expires_at: invite.expires_at,
      ttl_seconds: invite.ttl_seconds,
      created_at: invite.created_at,
      status: isExpired ? 'expired' : isInUse ? 'in_use' : 'unused',
      remaining_seconds: expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null,
    } satisfies CodeDetail;
  });
}

export async function getCodeDetail(code: string): Promise<CodeDetail | null> {
  const normalized = code.trim().toUpperCase();
  const { rows } = await getPool().query('SELECT * FROM invite_codes WHERE code = $1', [normalized]);
  const data = rows[0];

  if (!data) {
    return null;
  }

  const now = Date.now();
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt !== null && expiresAt <= now;
  const isInUse = !!data.activated_at && !isExpired;

  return {
    code: data.code,
    room_name: data.room_name,
    activated_at: data.activated_at,
    expires_at: data.expires_at,
    ttl_seconds: data.ttl_seconds,
    created_at: data.created_at,
    status: isExpired ? 'expired' : isInUse ? 'in_use' : 'unused',
    remaining_seconds: expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null,
  };
}

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await getPool().query('SELECT value FROM tg_settings WHERE key = $1', [key]);
  return rows[0]?.value || null;
}

export async function getAllSettings(): Promise<{ key: string; value: string }[]> {
  const { rows } = await getPool().query('SELECT key, value FROM tg_settings ORDER BY key ASC');
  return rows as { key: string; value: string }[];
}

export async function getSettingsByPrefix(prefix: string): Promise<{ key: string; value: string }[]> {
  const { rows } = await getPool().query('SELECT key, value FROM tg_settings WHERE key LIKE $1', [`${prefix}%`]);
  return (rows as { key: string; value: string }[]).filter((item) => item.value);
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  try {
    await getPool().query(
      'INSERT INTO tg_settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      [key, value, new Date().toISOString()],
    );
    return true;
  } catch {
    return false;
  }
}

export async function setAppConfigValue(key: string, value: string): Promise<boolean> {
  try {
    await getPool().query(
      'INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      [key, value, new Date().toISOString()],
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteSetting(key: string): Promise<boolean> {
  try {
    await getPool().query('DELETE FROM tg_settings WHERE key = $1', [key]);
    return true;
  } catch {
    return false;
  }
}

export async function allocatePayableAmount(baseTotal: number): Promise<{ offset: number; payable: number } | null> {
  const pending = await getRecentPendingOrdersByTotal(baseTotal);
  const used = new Set(pending.map((item) => Number(item.payable_amount).toFixed(3)));
  for (let step = 1; step <= 999; step += 1) {
    const offset = step / 1000;
    const payable = Number((baseTotal + offset).toFixed(3));
    if (!used.has(payable.toFixed(3))) {
      return { offset, payable };
    }
  }
  return null;
}

