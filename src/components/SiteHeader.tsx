import Link from "next/link";
import { AuthNav } from "@/components/AuthNav";

export function SiteHeader({ backHref }: { backHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
        {backHref && (
          <Link
            href={backHref}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          >
            ← Back
          </Link>
        )}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-lg shadow-indigo-950">
            IP
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-100">
            Interview Prep Studio
          </span>
        </Link>
        <span className="ml-auto hidden text-xs text-slate-500 sm:block">
          Company-specific questions, solutions on demand
        </span>
        <AuthNav />
      </div>
    </header>
  );
}
