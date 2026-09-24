import Link from "next/link";
import { STAGE_META } from "@/lib/uiMeta";
import type { CompanyDto } from "@/lib/dto";

const FALLBACK_BADGE = "bg-slate-500/10 text-slate-300 ring-slate-500/30";

export function CompanyCard({ company }: { company: CompanyDto }) {
  const stage = STAGE_META[company.stage] ?? { label: company.stage, badge: FALLBACK_BADGE };
  const pct = company.questionCount
    ? Math.round((company.masteredCount / company.questionCount) * 100)
    : 0;

  return (
    <Link
      href={`/companies/${company.id}`}
      className="group block rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-indigo-500/50 hover:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-100 transition group-hover:text-indigo-200">
            {company.name}
          </h3>
          {company.role && <p className="mt-0.5 truncate text-sm text-slate-400">{company.role}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${stage.badge}`}
        >
          {stage.label}
        </span>
      </div>

      <div className="mt-4">
        {company.questionCount === 0 ? (
          <p className="text-xs text-slate-500">No questions yet — open to generate a set.</p>
        ) : (
          <>
            <div className="mb-1.5 flex justify-between text-xs text-slate-400">
              <span>
                {company.masteredCount}/{company.questionCount} mastered
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
