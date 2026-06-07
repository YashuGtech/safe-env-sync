/**
 * Level editor server functions (admin-only).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin, logAdminAction } from "@/lib/auth-helpers.server";

const ObjectSchema = z.object({
  obj_type: z.enum(["pipe", "coin", "bear", "spike", "poll"]),
  x_time: z.number().min(0).max(3600),
  y: z.number().min(0).max(1),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

const UpsertLevelInput = z.object({
  initData: z.string().min(1).max(16384),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  duration_seconds: z.number().int().min(10).max(900),
  gravity: z.number().min(0.05).max(3),
  jump_strength: z.number().min(-20).max(-1),
  scroll_speed: z.number().min(0.5).max(10),
  pipe_gap: z.number().int().min(80).max(300),
  enabled: z.boolean(),
  weight: z.number().int().min(0).max(1000),
  repeat_loop: z.boolean(),
  reward_per_coin: z.number().min(0).max(1000),
  bg_color: z.string().min(1).max(20).default("#0a0a0a"),
  objects: z.array(ObjectSchema).max(2000),
});

export const upsertLevel = createServerFn({ method: "POST" })
  .inputValidator((input) => UpsertLevelInput.parse(input))
  .handler(async ({ data }) => {
    const { user: admin } = await requireAdmin(data.initData);

    let levelId = data.id;
    const payload = {
      name: data.name,
      duration_seconds: data.duration_seconds,
      gravity: data.gravity,
      jump_strength: data.jump_strength,
      scroll_speed: data.scroll_speed,
      pipe_gap: data.pipe_gap,
      enabled: data.enabled,
      weight: data.weight,
      repeat_loop: data.repeat_loop,
      reward_per_coin: data.reward_per_coin,
      bg_color: data.bg_color,
    };

    if (levelId) {
      await supabaseAdmin.from("levels").update(payload).eq("id", levelId);
      await supabaseAdmin.from("level_objects").delete().eq("level_id", levelId);
    } else {
      const { data: created } = await supabaseAdmin
        .from("levels")
        .insert({ ...payload, created_by: admin.telegram_id })
        .select("id")
        .single();
      levelId = created!.id;
    }

    if (data.objects.length > 0) {
      const rows = data.objects.map((o) => ({
        level_id: levelId!,
        obj_type: o.obj_type,
        x_time: o.x_time,
        y: o.y,
        props: o.props as never,
      }));
      await supabaseAdmin.from("level_objects").insert(rows);
    }

    await logAdminAction(admin.telegram_id, data.id ? "update_level" : "create_level", levelId ?? null, {
      name: data.name,
      objects: data.objects.length,
    });
    return { ok: true, id: levelId };
  });

const GetLevelInput = z.object({
  initData: z.string().min(1).max(16384),
  id: z.string().uuid(),
});

export const getLevel = createServerFn({ method: "POST" })
  .inputValidator((input) => GetLevelInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin(data.initData);
    const { data: lv } = await supabaseAdmin.from("levels").select("*").eq("id", data.id).single();
    const { data: objs } = await supabaseAdmin
      .from("level_objects")
      .select("*")
      .eq("level_id", data.id)
      .order("x_time");
    return {
      level: {
        id: lv!.id,
        name: lv!.name,
        duration_seconds: lv!.duration_seconds,
        gravity: Number(lv!.gravity),
        jump_strength: Number(lv!.jump_strength),
        scroll_speed: Number(lv!.scroll_speed),
        pipe_gap: lv!.pipe_gap,
        enabled: lv!.enabled,
        weight: lv!.weight,
        repeat_loop: lv!.repeat_loop,
        reward_per_coin: Number(lv!.reward_per_coin),
        bg_color: lv!.bg_color ?? "#0a0a0a",
      },
      objects: (objs ?? []).map((o) => ({
        id: o.id,
        obj_type: o.obj_type as "pipe" | "coin" | "bear" | "spike" | "poll",
        x_time: Number(o.x_time),
        y: Number(o.y),
        props: (o.props ?? {}) as Record<string, string | number | boolean>,
      })),
    };
  });

const DeleteLevelInput = z.object({
  initData: z.string().min(1).max(16384),
  id: z.string().uuid(),
});

export const deleteLevel = createServerFn({ method: "POST" })
  .inputValidator((input) => DeleteLevelInput.parse(input))
  .handler(async ({ data }) => {
    const { user: admin } = await requireAdmin(data.initData);
    await supabaseAdmin.from("levels").delete().eq("id", data.id);
    await logAdminAction(admin.telegram_id, "delete_level", data.id);
    return { ok: true };
  });
