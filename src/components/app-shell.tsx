import { Outlet, useRouter } from "@tanstack/react-router";
import { ReactNode, useEffect, useState } from "react";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { useSession } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { GoldLoader } from "@/components/gold-loader";
import { GoldFrame } from "@/components/gold-ui";
import { dismissMyLock } from "@/lib/locks.functions";

export function AppShell({ children }: { children?: ReactNode }) {
  const { loading, error, user, lock, initData, refresh } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // ignore — error component handles it
    }
  }, [loading, user, router]);

  if (loading) return <GoldLoader label="Authenticating with Telegram…" />;

  if (error || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <GoldFrame className="max-w-sm p-6 text-center">
          <h1 className="font-display text-xl text-gold-soft">Authentication failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "Open this app from @GTCgames_bot inside Telegram to play."}
          </p>
          <button
            onClick={() => void refresh()}
            className="mt-4 rounded-md bg-gradient-gold-flat px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Retry
          </button>
        </GoldFrame>
      </div>
    );
  }

  if (lock && initData) {
    return <LockGate message={lock.message} url={lock.url} initData={initData} onCleared={() => void refresh()} />;
  }

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-md pb-20 bg-circuit">
      {children ?? <Outlet />}
      <BottomNav />
    </div>
  );
}

function LockGate({
  message,
  url,
  initData,
  onCleared,
}: {
  message: string;
  url: string;
  initData: string;
  onCleared: () => void;
}) {
  const [clicking, setClicking] = useState(false);

  const handleClick = async () => {
    setClicking(true);
    // Open the admin's URL in a new tab. Some Telegram WebApp wrappers block
    // window.open from synchronous handlers, so we open first, then dismiss.
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    }
    try {
      await dismissMyLock({ data: { initData } });
    } catch {
      /* still let them through — server will retry next bootstrap */
    }
    onCleared();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <GoldFrame className="w-full max-w-md p-6 text-center" glow>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-destructive bg-black/60 shadow-gold">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="mt-4 font-display text-2xl text-gradient-gold">Action Required</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm text-gold-soft">{message}</p>
        <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          You must click the link below to continue using the bot.
        </p>
        <button
          onClick={handleClick}
          disabled={clicking}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-gold bg-gradient-gold-flat px-6 py-4 font-display text-base font-bold uppercase tracking-widest text-primary-foreground shadow-gold transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <ExternalLink className="h-4 w-4" />
          Click here
        </button>
        <p className="mt-3 text-[10px] text-muted-foreground">
          This appears one time only. After you click, the bot unlocks for you.
        </p>
      </GoldFrame>
    </div>
  );
}


