import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Play, Trash2, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GoldFrame, GoldButton } from "@/components/gold-ui";
import { useSession } from "@/lib/session";
import { upsertLevel, getLevel } from "@/lib/levels.functions";
import { Flappy, type Level as RuntimeLevel } from "@/components/flappy";

export const Route = createFileRoute("/admin/level/$id")({
  component: LevelEditorRoute,
});

type ObjType = "pipe" | "coin" | "bear" | "spike" | "poll";
type Obj = { id: string; obj_type: ObjType; x_time: number; y: number; props: Record<string, number | string | boolean> };

const OBJ_COLORS: Record<ObjType, string> = {
  pipe: "#D4A24C",
  coin: "#F2D27A",
  bear: "#6b3a1a",
  spike: "#c0c0c0",
  poll: "#8a8a8a",
};

function LevelEditorRoute() {
  return (
    <AppShell>
      <LevelEditor />
    </AppShell>
  );
}

function LevelEditor() {
  const { id } = useParams({ from: "/admin/level/$id" });
  const { admin, initData } = useSession();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [name, setName] = useState("New Level");
  const [duration, setDuration] = useState(60);
  const [gravity, setGravity] = useState(0.45);
  const [jump, setJump] = useState(-7.5);
  const [speed, setSpeed] = useState(2.5);
  const [pipeGap, setPipeGap] = useState(170);
  const [enabled, setEnabled] = useState(true);
  const [weight, setWeight] = useState(10);
  const [repeat, setRepeat] = useState(false);
  const [rewardPerCoin, setRewardPerCoin] = useState(2);
  const [bgColor, setBgColor] = useState("#0a0a0a");
  const [tool, setTool] = useState<ObjType>("pipe");
  const [objects, setObjects] = useState<Obj[]>([]);
  const [preview, setPreview] = useState(false);

  const existing = useQuery({
    queryKey: ["level", id],
    queryFn: () => getLevel({ data: { initData: initData!, id } }),
    enabled: !!initData && !isNew,
  });

  useEffect(() => {
    if (existing.data) {
      const l = existing.data.level;
      setName(l.name);
      setDuration(l.duration_seconds);
      setGravity(l.gravity);
      setJump(l.jump_strength);
      setSpeed(l.scroll_speed);
      setPipeGap(l.pipe_gap);
      setEnabled(l.enabled);
      setWeight(l.weight);
      setRepeat(l.repeat_loop);
      setRewardPerCoin(l.reward_per_coin);
      setBgColor(l.bg_color);
      setObjects(
        existing.data.objects.map((o) => ({
          id: o.id,
          obj_type: o.obj_type,
          x_time: o.x_time,
          y: o.y,
          props: o.props as Record<string, number | string | boolean>,
        })),
      );
    }
  }, [existing.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertLevel({
        data: {
          initData: initData!,
          id: isNew ? undefined : id,
          name,
          duration_seconds: duration,
          gravity,
          jump_strength: jump,
          scroll_speed: speed,
          pipe_gap: pipeGap,
          enabled,
          weight,
          repeat_loop: repeat,
          reward_per_coin: rewardPerCoin,
          bg_color: bgColor,
          objects: objects.map(({ obj_type, x_time, y, props }) => ({ obj_type, x_time, y, props })),
        },
      }),
    onSuccess: (r) => {
      toast.success("Level saved");
      if (isNew && r.id) navigate({ to: "/admin/level/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (!admin) {
    return (
      <div className="p-4">
        <GoldFrame className="p-6 text-center">Admin only.</GoldFrame>
      </div>
    );
  }

  if (preview) {
    const runtime: RuntimeLevel = {
      id: "preview",
      name,
      duration_seconds: duration,
      gravity,
      jump_strength: jump,
      scroll_speed: speed,
      pipe_gap: pipeGap,
      bg_color: bgColor,
      repeat_loop: repeat,
      reward_per_coin: rewardPerCoin,
    };
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <button onClick={() => setPreview(false)} className="absolute top-3 left-3 z-10 rounded-md border border-gold-soft/40 bg-black/60 px-3 py-1 text-xs text-gold-soft">
          Exit preview
        </button>
        <Flappy
          level={runtime}
          objects={objects.map((o) => ({ id: o.id, obj_type: o.obj_type, x_time: o.x_time, y: o.y, props: o.props }))}
          onEnd={() => setPreview(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 pt-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate({ to: "/admin" })} className="rounded-md border border-gold-soft/40 p-1.5 text-gold-soft">
          <ArrowLeft size={16} />
        </button>
        <h1 className="flex-1 font-display text-xl text-gradient-gold truncate">{isNew ? "New Level" : name}</h1>
        <button onClick={() => setPreview(true)} className="rounded border border-gold-soft/40 p-1.5 text-gold-soft">
          <Play size={14} />
        </button>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rounded bg-gradient-gold-flat p-1.5 text-primary-foreground">
          <Save size={14} />
        </button>
      </div>

      {/* Timeline canvas */}
      <GoldFrame className="p-2">
        <p className="px-1 pb-1 text-[10px] uppercase tracking-widest text-gold-soft">
          Timeline · tap to place {tool} · {objects.length} objects
        </p>
        <TimelineCanvas
          duration={duration}
          objects={objects}
          tool={tool}
          onAdd={(o) => setObjects([...objects, o])}
          onRemove={(idObj) => setObjects(objects.filter((x) => x.id !== idObj))}
        />
      </GoldFrame>

      <div className="grid grid-cols-5 gap-1">
        {(["pipe", "coin", "bear", "spike", "poll"] as ObjType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            className={`rounded border px-1 py-2 text-[10px] uppercase ${tool === t ? "border-gold-soft bg-gradient-gold-flat text-primary-foreground" : "border-gold-soft/30 text-muted-foreground"}`}
          >
            <span className="block h-3 w-3 mx-auto rounded-full mb-1" style={{ background: OBJ_COLORS[t] }} />
            {t}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          if (confirm("Clear all objects?")) setObjects([]);
        }}
        className="w-full rounded border border-destructive/40 py-1.5 text-xs text-destructive"
      >
        <Trash2 size={12} className="inline" /> Clear all
      </button>

      <GoldFrame className="space-y-2 p-3">
        <FieldText label="Name" value={name} onChange={setName} />
        <div className="grid grid-cols-2 gap-2">
          <FieldNum label="Duration (s)" value={duration} step={5} onChange={setDuration} />
          <FieldNum label="Weight" value={weight} step={1} onChange={setWeight} />
          <FieldNum label="Pipe gap" value={pipeGap} step={10} onChange={setPipeGap} />
          <FieldNum label="Reward/coin" value={rewardPerCoin} step={0.5} onChange={setRewardPerCoin} />
          <FieldNum label="Gravity" value={gravity} step={0.05} onChange={setGravity} />
          <FieldNum label="Jump str." value={jump} step={0.5} onChange={setJump} />
          <FieldNum label="Speed" value={speed} step={0.25} onChange={setSpeed} />
          <FieldText label="BG color" value={bgColor} onChange={setBgColor} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat loop
        </label>
      </GoldFrame>

      <GoldButton onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="w-full">
        <Save size={14} /> {saveMut.isPending ? "Saving…" : "Save level"}
      </GoldButton>
    </div>
  );
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="uppercase tracking-widest text-gold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-gold-soft/40 bg-black/40 px-2 py-1 text-sm"
      />
    </label>
  );
}

function FieldNum({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="uppercase tracking-widest text-gold">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-gold-soft/40 bg-black/40 px-2 py-1 text-sm"
      />
    </label>
  );
}

function TimelineCanvas({
  duration,
  objects,
  tool,
  onAdd,
  onRemove,
}: {
  duration: number;
  objects: Obj[];
  tool: ObjType;
  onAdd: (o: Obj) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 220 });

  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setSize({ w: r.width, h: 220 });
    const obs = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: 220 });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pxPerSec = useMemo(() => Math.max(8, size.w / Math.max(10, duration)), [size.w, duration]);
  const totalWidth = duration * pxPerSec;

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const y = e.clientY - rect.top;
    const x_time = Math.max(0, Math.round((x / pxPerSec) * 10) / 10);
    const yNorm = Math.max(0.05, Math.min(0.95, y / size.h));
    onAdd({
      id: crypto.randomUUID(),
      obj_type: tool,
      x_time,
      y: Math.round(yNorm * 100) / 100,
      props: tool === "pipe" ? { gap: 170 } : {},
    });
  };

  return (
    <div
      ref={ref}
      onClick={handleTap}
      className="relative overflow-x-auto rounded border border-gold-soft/30 bg-black/60"
      style={{ height: size.h }}
    >
      <div className="relative" style={{ width: Math.max(totalWidth, size.w), height: size.h }}>
        {/* time grid */}
        {Array.from({ length: Math.floor(duration / 5) + 1 }).map((_, i) => (
          <div key={i} className="absolute top-0 bottom-0 border-l border-gold-soft/15 text-[9px] text-gold-soft/50" style={{ left: i * 5 * pxPerSec, paddingLeft: 2 }}>
            {i * 5}s
          </div>
        ))}
        {/* objects */}
        {objects.map((o) => (
          <button
            key={o.id}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove ${o.obj_type}?`)) onRemove(o.id);
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
            style={{
              left: o.x_time * pxPerSec,
              top: o.y * size.h,
              width: o.obj_type === "pipe" ? 14 : 12,
              height: o.obj_type === "pipe" ? 14 : 12,
              background: OBJ_COLORS[o.obj_type as ObjType],
            }}
            aria-label={`Remove ${o.obj_type} at ${o.x_time}s`}
          />
        ))}
      </div>
    </div>
  );
}
