/**
 * Per-user lockout-notify.
 *
 * Stored in the existing `settings` table under key `lock_user_<telegram_id>`
 * as JSON `{ message, url, created_at, dismissed_at|null }`. This avoids
 * needing a new table while giving us a single source of truth.
 *
 * Active lock = row exists AND dismissed_at is null. Once a user clicks the
 * provided URL, dismissMyLock() sets dismissed_at — the bot becomes usable
 * again and the same lock will never re-trigger. Admins can remove the row
 * entirely (adminUnlockUser) to reset the slot.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireUser, requireAdmin, logAdminAction } from "@/lib/auth-helpers.server";

const InitOnly = z.object({ initData: z.string().min(1).max(16384) });

export type LockPayload = {
  message: string;
  url: string;
  created_at: string;
  dismissed_at: string | null;
};

const lockKey = (uid: number) => `lock_user_${uid}`;

export async function readLockForUser(uid: number): Promise<LockPayload | null> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", lockKey(uid))
    .maybeSingle();
  const v = data?.value as unknown as LockPayload | null;
  if (!v || typeof v !== "object") return null;
  return v;
}

export const getMyLock = createServerFn({ method: "POST" })
  .inputValidator((input) => InitOnly.parse(input))
  .handler(async ({ data }) => {
    const { user } = await requireUser(data.initData);
    const lock = await readLockForUser(user.telegram_id);
    if (!lock || lock.dismissed_at) return { lock: null };
    return { lock: { message: lock.message, url: lock.url } };
  });

export const dismissMyLock = createServerFn({ method: "POST" })
  .inputValidator((input) => InitOnly.parse(input))
  .handler(async ({ data }) => {
    const { user } = await requireUser(data.initData);
    const lock = await readLockForUser(user.telegram_id);
    if (!lock || lock.dismissed_at) return { ok: true };
    const updated: LockPayload = { ...lock, dismissed_at: new Date().toISOString() };
    await supabaseAdmin
      .from("settings")
      .upsert({ key: lockKey(user.telegram_id), value: updated as never }, { onConflict: "key" });
    return { ok: true };
  });

const AdminLockInput = z.object({
  initData: z.string().min(1).max(16384),
  userId: z.number().int(),
  message: z.string().min(1).max(800),
  url: z.string().url().max(800),
});

export const adminLockUser = createServerFn({ method: "POST" })
  .inputValidator((input) => AdminLockInput.parse(input))
  .handler(async ({ data }) => {
    const { user: adminUser } = await requireAdmin(data.initData);
    const payload: LockPayload = {
      message: data.message,
      url: data.url,
      created_at: new Date().toISOString(),
      dismissed_at: null,
    };
    await supabaseAdmin
      .from("settings")
      .upsert({ key: lockKey(data.userId), value: payload as never }, { onConflict: "key" });
    await logAdminAction(adminUser.telegram_id, "lock_user", String(data.userId), { url: data.url });
    return { ok: true };
  });

const AdminUnlockInput = z.object({
  initData: z.string().min(1).max(16384),
  userId: z.number().int(),
});
export const adminUnlockUser = createServerFn({ method: "POST" })
  .inputValidator((input) => AdminUnlockInput.parse(input))
  .handler(async ({ data }) => {
    const { user: adminUser } = await requireAdmin(data.initData);
    await supabaseAdmin.from("settings").delete().eq("key", lockKey(data.userId));
    await logAdminAction(adminUser.telegram_id, "unlock_user", String(data.userId), {});
    return { ok: true };
  });

const AdminStatusInput = z.object({
  initData: z.string().min(1).max(16384),
  userId: z.number().int(),
});
export const adminGetUserLock = createServerFn({ method: "POST" })
  .inputValidator((input) => AdminStatusInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin(data.initData);
    const lock = await readLockForUser(data.userId);
    return { lock };
  });
