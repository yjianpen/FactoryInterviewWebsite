"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Authentication failed.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-md items-center px-6 py-10">
        <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
            Interview Prep Studio
          </p>
          <h1 className="mt-3 text-2xl font-bold text-slate-100">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Your companies, progress, and generated questions are private to your account.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={12}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500"
              />
              {!isLogin && <p className="mt-1.5 text-xs text-slate-500">Use at least 12 characters.</p>}
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Working…" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {isLogin ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError(null);
              }}
              className="font-medium text-indigo-300 hover:text-indigo-200"
            >
              {isLogin ? "Create an account" : "Sign in"}
            </button>
          </p>
          <Link href="/" className="mt-4 block text-center text-xs text-slate-600 hover:text-slate-400">
            Continue to the home page
          </Link>
        </section>
      </main>
    </>
  );
}
