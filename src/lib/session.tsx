/**
 * App-wide session context. Bootstraps the Telegram user once and
 * exposes user/admin/settings/announcements to every route.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTelegramWebApp } from "@/lib/telegram-webapp";
import { bootstrapUser } from "@/lib/auth.functions";

type SessionUser = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  is_premium: boolean | null;
  balance_gtc: number;
  banned: boolean;
};

type SessionData = {
  user: SessionUser | null;
  admin: { role: "main" | "secondary" } | null;
  settings: Record<string, string | number | boolean | null>;
  announcements: Array<{ id: string; title: string; body: string; created_at: string }>;
  lock: { message: string; url: string } | null;
};

type SessionCtx = SessionData & {
  initData: string | null;
  loading: boolean;
  error: string | null;
  devMode: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { initData, ready, devMode } = useTelegramWebApp();
  const [state, setState] = useState<SessionData>({
    user: null,
    admin: null,
    settings: {},
    announcements: [],
    lock: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (id: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const res = await bootstrapUser({ data: { initData: id } });
      setState((prev) => ({
        user: (res.user as SessionUser | null) ?? prev.user,
        admin: res.admin,
        settings: res.settings,
        announcements: res.announcements as SessionData["announcements"],
        lock: (res as { lock?: SessionData["lock"] }).lock ?? null,
      }));
    } catch (e) {
      // Silent refreshes must NOT replace the live screen with the auth-error
      // screen — a transient network blip mid-game would otherwise kick the
      // user back to "Authentication failed".
      if (!opts.silent) setError(e instanceof Error ? e.message : "Failed to authenticate");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (initData) {
      void load(initData);
    } else if (devMode) {
      // Dev preview outside Telegram → show a friendly notice instead of crashing
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initData, devMode]);

  return (
    <Ctx.Provider
      value={{
        ...state,
        initData,
        loading,
        error,
        devMode,
        refresh: async () => {
          // Silent: refreshing balance/user after a game action must not
          // remount the app behind a full-screen "Authenticating…" loader.
          if (initData) await load(initData, { silent: true });
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
