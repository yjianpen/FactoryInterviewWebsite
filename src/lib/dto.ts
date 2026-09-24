import type { Company, Question, TestCase } from "@prisma/client";
import { parseExecSpec, toPracticeMeta } from "@/lib/practice/specs";
import type { PracticeMeta } from "@/lib/exec/types";

// Server <-> client DTOs. Two things are deliberately never sent in list payloads:
//  - `solution`: only GET /api/questions/:id returns it ("Show me the solution")
//  - the practice test harness: the client gets starter code and the language
//    list (PracticeMeta), while the assertions stay server-side

export interface TestCaseDto {
  id: string;
  input: string;
  expected: string;
  explanation: string | null;
}

export interface QuestionDto {
  id: string;
  category: string;
  title: string;
  prompt: string;
  difficulty: string;
  status: string;
  source: string;
  sortOrder: number;
  testCases: TestCaseDto[];
  /** Codepad configuration, or null when the question has no practice mode. */
  practice: PracticeMeta | null;
}

export interface FullQuestionDto extends QuestionDto {
  solution: string;
}

export interface CompanyDto {
  id: string;
  name: string;
  role: string | null;
  stage: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  masteredCount: number;
}

export type QuestionCounts = Record<string, { total: number; mastered: number }>;

export function toQuestionDto(q: Question & { testCases?: TestCase[] }): QuestionDto {
  return {
    id: q.id,
    category: q.category,
    title: q.title,
    prompt: q.prompt,
    difficulty: q.difficulty,
    status: q.status,
    source: q.source,
    sortOrder: q.sortOrder,
    practice: toPracticeMeta(parseExecSpec(q.execSpec)),
    testCases: (q.testCases ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({
        id: t.id,
        input: t.input,
        expected: t.expected,
        explanation: t.explanation,
      })),
  };
}

export function toCompanyDto(
  c: Company,
  counts?: { total: number; mastered: number },
): CompanyDto {
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    stage: c.stage,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    questionCount: counts?.total ?? 0,
    masteredCount: counts?.mastered ?? 0,
  };
}
