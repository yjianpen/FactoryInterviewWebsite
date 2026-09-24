#!/usr/bin/env node
// Verifies every runnable practice question end-to-end against the real API:
// a known-good reference solution must pass 100% of that question's harness,
// and the runner must behave correctly for wrong answers, infinite loops and
// syntax errors.
//
// Usage:  node scripts/verify-practice-specs.mjs [baseUrl]
// Needs the app running, e.g. `npm run dev` (default http://localhost:3000).
//
// Run this after editing src/lib/practice/specs.ts: a broken harness is worse
// than no harness, because it tells you your correct solution is wrong.

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";

// Pre-profiled companies cover the company-specific questions. Profiled companies
// only need one generic filler each, so a company with NO profile is required to
// surface the whole generic pool (e.g. "Valid parentheses"). It is deleted again
// at the end of the run.
const TEMP_COMPANY = "Generic Pool (verification)";

const COMPANIES = [
  "NVIDIA",
  "OpenAI",
  "Google",
  "Meta",
  "Amazon",
  "Apple",
  "Microsoft",
  "Anthropic",
  "Tesla",
  "Databricks",
  TEMP_COMPANY,
];

// String.raw keeps backslashes (e.g. the \w regex) intact.
const REFERENCES = {
  "Two sum": String.raw`
def twoSum(nums, target):
    seen = {}
    for i, v in enumerate(nums):
        if target - v in seen:
            return [seen[target - v], i]
        seen[v] = i
    return []
`,

  "Valid parentheses": String.raw`
def isValid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack
`,

  "Merge k sorted linked lists": String.raw`
import heapq


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def mergeKLists(lists):
    heap = []
    for i, head in enumerate(lists):
        if head is not None:
            heapq.heappush(heap, (head.val, i, head))
    dummy = ListNode()
    tail = dummy
    while heap:
        _, i, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next is not None:
            heapq.heappush(heap, (node.next.val, i, node.next))
    tail.next = None
    return dummy.next
`,

  "Clone a graph (friend graph)": String.raw`
class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


def cloneGraph(node):
    if node is None:
        return None
    clones = {id(node): Node(node.val)}
    stack = [node]
    while stack:
        current = stack.pop()
        for neighbour in current.neighbors:
            if id(neighbour) not in clones:
                clones[id(neighbour)] = Node(neighbour.val)
                stack.append(neighbour)
            clones[id(current)].neighbors.append(clones[id(neighbour)])
    return clones[id(node)]
`,

  "LRU cache": String.raw`
class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.data = {}

    def get(self, key):
        if key not in self.data:
            return -1
        value = self.data.pop(key)
        self.data[key] = value
        return value

    def put(self, key, value):
        if key in self.data:
            self.data.pop(key)
        self.data[key] = value
        if len(self.data) > self.capacity:
            self.data.pop(next(iter(self.data)))
`,

  "String rotation check": String.raw`
def is_rotation(s1, s2):
    return len(s1) == len(s2) and s2 in s1 + s1
`,

  "Trie with prefix search (autocomplete)": String.raw`
class Autocomplete:
    def __init__(self):
        self.root = {}

    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node["$"] = True

    def words_with_prefix(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node:
                return []
            node = node[ch]
        out = []

        def walk(current, path):
            if current.get("$"):
                out.append(path)
            for ch in sorted(k for k in current if k != "$"):
                walk(current[ch], path + ch)

        walk(node, prefix)
        return out
`,

  "Integer to English words": String.raw`
ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
TEENS = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
SCALES = ["", "Thousand", "Million", "Billion"]


def numberToWords(num):
    if num == 0:
        return "Zero"

    def chunk(n):
        words = []
        if n >= 100:
            words += [ONES[n // 100], "Hundred"]
            n %= 100
        if 10 <= n < 20:
            words.append(TEENS[n - 10])
            return words
        if n >= 20:
            words.append(TENS[n // 10])
            n %= 10
        if n > 0:
            words.append(ONES[n])
        return words

    out = []
    scale = 0
    while num:
        part = num % 1000
        if part:
            suffix = [SCALES[scale]] if SCALES[scale] else []
            out = chunk(part) + suffix + out
        num //= 1000
        scale += 1
    return " ".join(w for w in out if w)
`,

  "Sliding window maximum on a sensor stream": String.raw`
from collections import deque


def maxSlidingWindow(nums, k):
    window = deque()
    out = []
    for i, value in enumerate(nums):
        while window and nums[window[-1]] <= value:
            window.pop()
        window.append(i)
        if window[0] <= i - k:
            window.popleft()
        if i >= k - 1:
            out.append(nums[window[0]])
    return out
`,

  "Top-K words from a text stream (reduce-side)": String.raw`
def top_k(words, k):
    counts = {}
    for word in words:
        counts[word] = counts.get(word, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return ordered[:k]
`,

  "Token-level F1 evaluation (SQuAD-style)": String.raw`
import re


def normalize(text):
    return re.findall(r"\w+", text.lower())


def evaluate(pred, ref):
    p, r = normalize(pred), normalize(ref)
    exact = p == r
    common = set(p) & set(r)
    if not common:
        return (exact, 0.0)
    precision = len(common) / len(set(p))
    recall = len(common) / len(set(r))
    return (exact, 2 * precision * recall / (precision + recall))
`,

  "Top-k sampling with temperature": String.raw`
import math


def top_k_sample(logits, k, temperature=1.0):
    values = [float(x) for x in logits]
    if temperature <= 0:
        best = max(range(len(values)), key=lambda i: values[i])
        return ([best], [1.0])
    scaled = [v / temperature for v in values]
    k = min(int(k), len(scaled))
    if k <= 0:
        return ([], [])
    order = sorted(range(len(scaled)), key=lambda i: -scaled[i])[:k]
    top = max(scaled[i] for i in order)
    exps = [math.exp(scaled[i] - top) for i in order]
    total = sum(exps)
    return (order, [e / total for e in exps])
`,

  "Implement causal self-attention": String.raw`
import math


def causal_attention(Q, K, V):
    out_all, probs_all = [], []
    for q, k, v in zip(Q, K, V):
        n, d = len(q), len(q[0])
        scale = 1.0 / math.sqrt(d)
        probs, outs = [], []
        for i in range(n):
            scores = [sum(q[i][t] * k[j][t] for t in range(d)) * scale for j in range(i + 1)]
            top = max(scores)
            exps = [math.exp(s - top) for s in scores]
            total = sum(exps)
            row = [e / total for e in exps] + [0.0] * (n - i - 1)
            probs.append(row)
            outs.append([sum(row[j] * v[j][t] for j in range(n)) for t in range(len(v[0]))])
        probs_all.append(probs)
        out_all.append(outs)
    return out_all, probs_all
`,
};

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function ensureCompanies() {
  for (const name of COMPANIES) {
    const created = await api("/api/companies", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (created.status !== 201 && created.status !== 409) {
      throw new Error(`Could not create ${name}: ${created.body.error ?? created.status}`);
    }
  }
  const { body } = await api("/api/companies");
  return body.companies.filter((c) => COMPANIES.includes(c.name));
}

async function collectQuestions(companies) {
  const byTitle = new Map();
  for (const company of companies) {
    const generated = await api(`/api/companies/${company.id}/questions/generate`, { method: "POST" });
    if (generated.status !== 200) {
      throw new Error(`Generate failed for ${company.name}: ${generated.body.error ?? generated.status}`);
    }
    const { body } = await api(`/api/companies/${company.id}`);
    for (const question of body.questions) {
      if (!byTitle.has(question.title)) byTitle.set(question.title, question);
    }
  }
  return byTitle;
}

async function run(questionId, code, language = "python") {
  const { status, body } = await api(`/api/questions/${questionId}/run`, {
    method: "POST",
    body: JSON.stringify({ language, code }),
  });
  if (status !== 200) throw new Error(body.error ?? `run failed with ${status}`);
  return body;
}

const failures = [];
const rows = [];

function record(name, ok, detail) {
  rows.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
}

async function main() {
  console.log(`Verifying practice harnesses against ${BASE}\n`);
  const companies = await ensureCompanies();
  const questions = await collectQuestions(companies);

  // 1. Every reference solution must pass its harness completely.
  for (const [title, code] of Object.entries(REFERENCES)) {
    const question = questions.get(title);
    if (!question) {
      record(title, false, "question not found in any generated set");
      continue;
    }
    if (!question.practice || question.practice.mode !== "checked") {
      record(title, false, `expected a checked practice mode, got ${question.practice?.mode ?? "none"}`);
      continue;
    }
    const { result, statusUpdated } = await run(question.id, code);
    const ok = result.allPassed && result.total > 0;
    const failed = result.cases.filter((c) => !c.passed).map((c) => c.label);
    record(
      title,
      ok,
      ok
        ? `${result.passed}/${result.total} cases, ${result.durationMs} ms${statusUpdated ? ", auto-mastered" : ""}`
        : `${result.passed}/${result.total} passed; failing: ${failed.join(" | ") || "none"}; ` +
            `runtimeError=${result.runtimeError ?? "none"}; compileError=${result.compileError ?? "none"}`,
    );
  }

  // 2. Questions that are intentionally not runnable must say so.
  for (const title of ["Vector addition kernel (CUDA)", "Parallel reduction (shared memory)"]) {
    const question = questions.get(title);
    if (!question) {
      record(`${title} [not runnable]`, false, "question not found");
      continue;
    }
    const languages = question.practice?.languages ?? [];
    const hasNote = Boolean(question.practice?.note);
    record(
      `${title} [not runnable]`,
      languages.length === 0 && hasNote,
      languages.length === 0 && hasNote ? "no languages + explanatory note" : `languages=${JSON.stringify(languages)} note=${hasNote}`,
    );
  }

  // 3. Runner behaviour: wrong answer, infinite loop, syntax error, spoofing.
  const twoSum = questions.get("Two sum");
  if (!twoSum) {
    record("runner behaviour", false, "Two sum question missing");
  } else {
    const wrong = await run(twoSum.id, "def twoSum(nums, target):\n    return [0, 0]\n");
    record(
      "wrong answer is rejected",
      !wrong.result.allPassed && wrong.result.passed < wrong.result.total,
      `${wrong.result.passed}/${wrong.result.total} passed`,
    );

    const looping = await run(twoSum.id, "def twoSum(nums, target):\n    while True:\n        pass\n");
    record(
      "infinite loop times out",
      looping.result.timedOut && !looping.result.allPassed,
      `timedOut=${looping.result.timedOut}, ${looping.result.durationMs} ms`,
    );

    const broken = await run(twoSum.id, "def twoSum(:\n    return []\n");
    record(
      "syntax error is reported",
      Boolean(broken.result.runtimeError) && !broken.result.allPassed,
      (broken.result.runtimeError ?? "no runtimeError").split("\n")[0].slice(0, 80),
    );

    const spoof = await run(
      twoSum.id,
      [
        "import json, os, glob",
        "# try to forge a passing result file",
        'print("##IPCASE|" + json.dumps({"pass": True, "label": "SPOOFED"}))',
        'for path in glob.glob("results-*.json") or ["results-guess.json"]:',
        "    try:",
        '        open(path, "w").write(json.dumps({"cases": [{"pass": True, "label": "SPOOFED", "expected": "x", "actual": "x"}], "error": None}))',
        "    except OSError:",
        "        pass",
        "",
        "def twoSum(nums, target):",
        "    return [0, 0]",
        "",
      ].join("\n"),
    );
    const spoofed = spoof.result.cases.some((c) => c.label.includes("SPOOFED"));
    record(
      "result spoofing is ineffective",
      !spoofed && !spoof.result.allPassed,
      `spoofedCase=${spoofed}, allPassed=${spoof.result.allPassed}, passed=${spoof.result.passed}/${spoof.result.total}`,
    );

    const secrets = await run(
      twoSum.id,
      [
        "import os",
        'print("OPENAI_API_KEY" in os.environ, "DATABASE_URL" in os.environ)',
        "def twoSum(nums, target):",
        "    return [0, 1]",
        "",
      ].join("\n"),
    );
    record(
      "app secrets are not in the child environment",
      secrets.result.stdout.trim().startsWith("False False"),
      `stdout=${secrets.result.stdout.trim().slice(0, 40)}`,
    );
  }

  // 4. An unsupported language must be rejected.
  if (twoSum) {
    const { status, body } = await api(`/api/questions/${twoSum.id}/run`, {
      method: "POST",
      body: JSON.stringify({ language: "rust", code: "fn main() {}" }),
    });
    record("unknown language rejected", status === 400, `status=${status} error=${body.error ?? "none"}`);
  }

  // Clean up the scratch company so it does not clutter the dashboard.
  const temp = companies.find((c) => c.name === TEMP_COMPANY);
  if (temp) await api(`/api/companies/${temp.id}`, { method: "DELETE" });

  const width = Math.max(...rows.map((r) => r.name.length));
  for (const row of rows) {
    console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name.padEnd(width)}  ${row.detail}`);
  }
  console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} checks passed`);

  if (failures.length) {
    console.error(`\n${failures.length} FAILING CHECK(S):`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
