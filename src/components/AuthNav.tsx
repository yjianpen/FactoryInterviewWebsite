"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AuthNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        if (active) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        if (active) setEmail(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setEmail(null);
    router.push("/login");
    router.refresh();
  };

  if (!email) {
    return (
      <Link
        href="/login"
        className="rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30 transition hover:bg-indigo-500/25"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-48 truncate text-xs text-slate-400 sm:block">{email}</span>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
      >
        Sign out
      </button>
    </div>
  );
}
