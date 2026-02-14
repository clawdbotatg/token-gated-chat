import { kv } from "@vercel/kv";

export interface VerifiedUser {
  wallet: string;
  verifiedAt: number;
}

export type VerifiedUsers = Record<string, VerifiedUser>;

export async function getVerifiedUsers(): Promise<VerifiedUsers> {
  const users = await kv.hgetall<VerifiedUsers>("verified-users");
  return users || {};
}

export async function saveVerifiedUser(telegramUserId: string, wallet: string): Promise<void> {
  await kv.hset("verified-users", {
    [telegramUserId]: { wallet: wallet.toLowerCase(), verifiedAt: Date.now() },
  });
}

export async function removeVerifiedUser(telegramUserId: string): Promise<void> {
  await kv.hdel("verified-users", telegramUserId);
}

export async function getVerifiedUser(telegramUserId: string): Promise<VerifiedUser | null> {
  const user = await kv.hget<VerifiedUser>("verified-users", telegramUserId);
  return user || null;
}
