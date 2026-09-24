// UI metadata shared by server components and client components.

export const CATEGORY_ORDER = ["CODING", "BEHAVIORAL", "SYSTEM_DESIGN", "DOMAIN"] as const;

export const CATEGORY_META: Record<string, { label: string; description: string; badge: string }> = {
  CODING: {
    label: "Coding",
    description: "LeetCode-style algorithm problems",
    badge: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  },
  BEHAVIORAL: {
    label: "Behavioral",
    description: "STAR-format, company-culture questions",
    badge: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  },
  SYSTEM_DESIGN: {
    label: "System Design",
    description: "Architecture and scaling discussions",
    badge: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  },
  DOMAIN: {
    label: "Domain",
    description: "Company-specific deep technical skills",
    badge: "bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30",
  },
};

export const DIFFICULTY_META: Record<string, { label: string; badge: string }> = {
  EASY: { label: "Easy", badge: "bg-green-500/10 text-green-300 ring-green-500/30" },
  MEDIUM: { label: "Medium", badge: "bg-yellow-500/10 text-yellow-300 ring-yellow-500/30" },
  HARD: { label: "Hard", badge: "bg-rose-500/10 text-rose-300 ring-rose-500/30" },
};

export const STAGES = ["APPLIED", "PREP", "INTERVIEWING", "OFFER", "REJECTED"] as const;

export const STAGE_META: Record<string, { label: string; badge: string }> = {
  APPLIED: { label: "Applied", badge: "bg-slate-500/10 text-slate-300 ring-slate-500/30" },
  PREP: { label: "Preparing", badge: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30" },
  INTERVIEWING: { label: "Interviewing", badge: "bg-violet-500/10 text-violet-300 ring-violet-500/30" },
  OFFER: { label: "Offer", badge: "bg-green-500/10 text-green-300 ring-green-500/30" },
  REJECTED: { label: "Rejected", badge: "bg-rose-500/10 text-rose-300 ring-rose-500/30" },
};

export const STATUS_META: Record<string, { label: string; badge: string }> = {
  TODO: { label: "To practice", badge: "bg-slate-500/10 text-slate-300 ring-slate-500/30" },
  PRACTICING: { label: "Practicing", badge: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30" },
  MASTERED: { label: "Mastered", badge: "bg-green-500/10 text-green-300 ring-green-500/30" },
};
