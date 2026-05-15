"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AuthUserContext } from "@/components/AuthUserContext";
import { SyncProvider } from "@/components/SyncProvider";

type Props = {
  children: React.ReactNode;
  onSyncError?: (message: string) => void;
  onSyncRecovered?: () => void;
};

/** Login por e-mail/senha (usuário criado no painel Supabase). Sem nuvem configurada, o app roda só local. */
export function AuthGate({ children, onSyncError, onSyncRecovered }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const ctxValue = useMemo(
    () => ({
      userId: session?.user.id ?? null,
      supabase,
    }),
    [session?.user.id, supabase],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-600 dark:text-zinc-400">
        Carregando sessão…
      </div>
    );
  }

  if (!supabase) {
    return (
      <AuthUserContext.Provider value={ctxValue}>
        <div className="mx-auto max-w-lg px-4 pt-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Nuvem não configurada: defina <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no ambiente (ex.: Vercel → Environment Variables).
          </div>
        </div>
        {children}
      </AuthUserContext.Provider>
    );
  }

  if (!session) {
    return (
      <AuthUserContext.Provider value={ctxValue}>
        <LoginPanel supabase={supabase} />
      </AuthUserContext.Provider>
    );
  }

  return (
    <AuthUserContext.Provider value={ctxValue}>
      <SyncProvider
        supabase={supabase}
        userId={session.user.id}
        onSyncError={onSyncError}
        onSyncRecovered={onSyncRecovered}
      >
        {children}
      </SyncProvider>
    </AuthUserContext.Provider>
  );
}

function LoginPanel({ supabase }: { supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
    } catch (err) {
      console.error("[AuthGate] login:", err);
      setError(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Entrar</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Use o usuário criado no painel Supabase (Authentication → Users).
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          E-mail
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
