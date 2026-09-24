"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KNOWN_COMPANY_NAMES } from "@/lib/companyKnowledge";

export function AddCompanyForm() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role: role.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add company.");
      setName("");
      setRole("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
            Company
          </label>
          <input
            list="known-companies"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NVIDIA"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            required
          />
          <datalist id="known-companies">
            {KNOWN_COMPANY_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
            Role (optional)
          </label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Senior SWE, GPU Platform"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Adding…" : "Add company"}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Tip: suggestions above are pre-loaded company profiles. Any other company works
        too — it gets fundamentals now, and tailored questions once you add an OpenAI
        key to{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-400">.env</code>.
      </p>
    </form>
  );
}
