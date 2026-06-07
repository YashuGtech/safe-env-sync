/**
 * Shared server-only auth helpers used by other server functions.
 * NEVER import from client code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyInitData } from "@/lib/telegram.server";

export async function requireUser(initData: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const v = verifyInitData(initData, token);
  if (!v) throw new Error("Invalid Telegram authentication");
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("telegram_id", v.user.id)
    .single();
  if (!user) throw new Error("User not found");
  if (user.banned) throw new Error("Account banned");
  const { data: adminRow } = await supabaseAdmin
    .from("admins")
    .select("role")
    .eq("telegram_id", v.user.id)
    .maybeSingle();
  return {
    user,
    admin: adminRow ? { role: adminRow.role as "main" | "secondary" } : null,
  };
}

export async function requireAdmin(initData: string, mainOnly = false) {
  const r = await requireUser(initData);
  if (!r.admin) throw new Error("Forbidden: admin only");
  if (mainOnly && r.admin.role !== "main") throw new Error("Forbidden: main admin only");
  return r;
}

export async function logAdminAction(
  adminId: number,
  action: string,
  target: string | null,
  details: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("admin_logs").insert({
    admin_id: adminId,
    action,
    target,
    details: details as never,
  });
}
