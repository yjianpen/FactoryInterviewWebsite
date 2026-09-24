import { execSpecSchema } from "@/lib/exec/types";
import type { ExecSpec, PracticeMeta, RunLanguage } from "@/lib/exec/types";
import { RUN_LANGUAGES } from "@/lib/exec/types";

// Runnable practice specs, keyed by question title.
//
// Each spec gives the codepad:
//   starter  -> skeleton shown in the editor (never contains the answer)
//   harness  -> server-side test code; calls case(label, lambda: fn(...), expected)
//
// Harness helpers available (injected, see src/lib/exec/python.ts):
//   case(label, fn, expected, tol=1e-6, unordered=False)
//     fn must be a zero-arg lambda, so an exception fails just that case.
//     Floats compare with tolerance; dict key order and set order do not matter.
//   check(label, got, expected)  -> same, for an already-computed value
//
// HOW TO EXTEND:
//  - New runnable question: add an entry below keyed by its exact title (lowercased).
//  - Questions without an entry still get a codepad in "freeform" mode when a
//    starter exists, or no codepad at all.
//  - `languages: {}` plus a `note` marks a question as deliberately not runnable
//    here (e.g. CUDA kernels that need nvcc and a GPU).

const PRACTICE_SPECS: Record<string, ExecSpec> = {
  // ---------------------------------------------------------------- generic pool
  "two sum": {
    entry: "twoSum(nums, target) -> list[int]",
    languages: {
      python: {
        starter: `def twoSum(nums, target):
    """Return the indices of the two numbers that add up to target.

    Exactly one solution exists and you may not use the same element twice.
    Aim for O(n) time.
    """
    # your code here
    return []
`,
        harness: `case("nums=[2,7,11,15], target=9", lambda: twoSum([2, 7, 11, 15], 9), [0, 1])
case("nums=[3,2,4], target=6", lambda: twoSum([3, 2, 4], 6), [1, 2])
case("duplicate values: nums=[3,3], target=6", lambda: twoSum([3, 3], 6), [0, 1])
case("negatives: nums=[-3,4,3,90], target=0", lambda: twoSum([-3, 4, 3, 90], 0), [0, 2])
case("answer at the end (10k elements)", lambda: twoSum(list(range(1, 10001)), 19999), [9998, 9999])
`,
      },
    },
  },

  "valid parentheses": {
    entry: "isValid(s) -> bool",
    languages: {
      python: {
        starter: `def isValid(s):
    """Return True if the brackets in s are closed correctly and in order.

    s contains only the characters ()[]{}.
    """
    # your code here
    return False
`,
        harness: `case('s="()[]{}"', lambda: isValid("()[]{}"), True)
case('s="([)]" (wrong nesting)', lambda: isValid("([)]"), False)
case('s="(]"', lambda: isValid("(]"), False)
case('s="" (empty is valid)', lambda: isValid(""), True)
case('s="]" (closer only)', lambda: isValid("]"), False)
case('s="((((()))))"', lambda: isValid("((((()))))"), True)
case('s="(((" (never closed)', lambda: isValid("((("), False)
case('s="{[]}"', lambda: isValid("{[]}"), True)
`,
      },
    },
  },

  "design a url shortener": {
    note: "System design questions are discussion-based, so there is nothing to run here. Sketch your architecture, then compare with the solution.",
    languages: {},
  },

  // ---------------------------------------------------------------------- Google
  "merge k sorted linked lists": {
    entry: "mergeKLists(lists) -> ListNode",
    note: "The harness builds real ListNode chains from arrays and flattens your result, so keep the ListNode class in place.",
    languages: {
      python: {
        starter: `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def mergeKLists(lists):
    """Merge k sorted linked lists into one sorted linked list.

    lists: a list of ListNode heads (any of them may be None).
    Return the head of the merged list. Target O(n log k).
    """
    # your code here
    return None
`,
        harness: `def _build(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head


def _flatten(node, limit=100000):
    out = []
    while node is not None and len(out) < limit:
        out.append(node.val)
        node = node.next
    return out


def _run(groups):
    return _flatten(mergeKLists([_build(g) for g in groups]))


case("[[1,4,5],[1,3,4],[2,6]]", lambda: _run([[1, 4, 5], [1, 3, 4], [2, 6]]), [1, 1, 2, 3, 4, 4, 5, 6])
case("[[]] -> []", lambda: _run([[]]), [])
case("[] (no lists) -> []", lambda: _run([]), [])
case("single list passes through", lambda: _run([[1, 2, 3]]), [1, 2, 3])
case("empty lists mixed in", lambda: _run([[], [2], [], [1, 3]]), [1, 2, 3])
case("negatives", lambda: _run([[-5, -1], [-3, 0]]), [-5, -3, -1, 0])
case("duplicates across lists", lambda: _run([[1, 1], [1], [1, 1]]), [1, 1, 1, 1, 1])
case("20 lists of 50 values", lambda: _run([[i * 50 + j for j in range(50)] for i in range(20)]), sorted(i * 50 + j for i in range(20) for j in range(50)))
`,
      },
    },
  },

  "top k queries in a sliding time window": {
    note: "This one is a design discussion (exact vs approximate, expiry, memory bounds) rather than a single function, so there is nothing to run. Sketch the data structures, then compare with the solution.",
    languages: {},
  },

  // ------------------------------------------------------------------------ Meta
  "clone a graph (friend graph)": {
    entry: "cloneGraph(node) -> Node",
    note: "The harness checks both the copied topology AND that no node is shared with the original, so a shallow copy fails.",
    languages: {
      python: {
        starter: `class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


def cloneGraph(node):
    """Return a deep copy of a connected undirected graph.

    Handle cycles. Target O(V + E).
    """
    # your code here
    return None
`,
        harness: `def _build_graph(adj):
    """adj is 1-indexed: adj[i] lists the neighbours of node i+1."""
    if not adj:
        return None, []
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, neighbours in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in neighbours]
    return nodes[0], nodes


def _shape(node):
    """Adjacency map of the reachable graph, keyed by value."""
    shape = {}
    stack = [node] if node is not None else []
    while stack:
        current = stack.pop()
        if current.val in shape:
            continue
        shape[current.val] = sorted(n.val for n in current.neighbors)
        for neighbour in current.neighbors:
            if neighbour.val not in shape:
                stack.append(neighbour)
    return shape


def _reachable_ids(node):
    seen = set()
    stack = [node] if node is not None else []
    while stack:
        current = stack.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        for neighbour in current.neighbors:
            if id(neighbour) not in seen:
                stack.append(neighbour)
    return seen


def _clone_shape(adj):
    head, _ = _build_graph(adj)
    return _shape(cloneGraph(head))


def _is_deep_copy(adj):
    head, originals = _build_graph(adj)
    copy = cloneGraph(head)
    if copy is None:
        return False
    return not (_reachable_ids(copy) & {id(n) for n in originals})


SQUARE = [[2, 4], [1, 3], [2, 4], [1, 3]]

case("square graph: topology preserved", lambda: _clone_shape(SQUARE), {1: [2, 4], 2: [1, 3], 3: [2, 4], 4: [1, 3]})
case("square graph: deep copy (no shared nodes)", lambda: _is_deep_copy(SQUARE), True)
case("single node, no neighbours", lambda: _clone_shape([[]]), {1: []})
case("two connected nodes", lambda: _clone_shape([[2], [1]]), {1: [2], 2: [1]})
case("None input -> None", lambda: cloneGraph(None), None)
case("self-loop", lambda: _clone_shape([[1]]), {1: [1]})
case("cloned node values are ints, not nodes", lambda: sorted(_clone_shape(SQUARE).keys()), [1, 2, 3, 4])
`,
      },
    },
  },

  // ---------------------------------------------------------------------- Amazon
  "lru cache": {
    entry: "class LRUCache(capacity) with get(key) / put(key, value)",
    languages: {
      python: {
        starter: `class LRUCache:
    def __init__(self, capacity):
        """Create a cache holding at most \`capacity\` entries."""
        # your code here
        pass

    def get(self, key):
        """Return the value for key, or -1 if it is not cached."""
        return -1

    def put(self, key, value):
        """Insert or overwrite key, evicting the least recently used entry
        when the cache is over capacity. Both operations should be O(1).
        """
        pass
`,
        harness: `def _ops(capacity, ops):
    """Replay a sequence of ("put", k, v) / ("get", k) ops, collecting get results."""
    cache = LRUCache(capacity)
    results = []
    for op in ops:
        if op[0] == "put":
            cache.put(op[1], op[2])
        else:
            results.append(cache.get(op[1]))
    return results


case(
    "classic sequence (capacity 2)",
    lambda: _ops(2, [("put", 1, 1), ("put", 2, 2), ("get", 1), ("put", 3, 3), ("get", 2), ("put", 4, 4), ("get", 1), ("get", 3), ("get", 4)]),
    [1, -1, -1, 3, 4],
)
case(
    "get() refreshes recency",
    lambda: _ops(2, [("put", 1, 1), ("put", 2, 2), ("get", 1), ("put", 3, 3), ("get", 2), ("get", 1)]),
    [1, -1, 1],
)
case("overwriting a key keeps one entry", lambda: _ops(2, [("put", 1, 1), ("put", 1, 10), ("get", 1)]), [10])
case("capacity 1 evicts immediately", lambda: _ops(1, [("put", 1, 1), ("put", 2, 2), ("get", 1), ("get", 2)]), [-1, 2])
case("missing key returns -1", lambda: _ops(2, [("get", 99)]), [-1])
case(
    "put() on an existing key also refreshes recency",
    lambda: _ops(2, [("put", 1, 1), ("put", 2, 2), ("put", 1, 11), ("put", 3, 3), ("get", 2), ("get", 1), ("get", 3)]),
    [-1, 11, 3],
)
case(
    "stays within capacity under 2000 ops",
    lambda: _ops(3, [("put", i, i) for i in range(2000)] + [("get", 1997), ("get", 1998), ("get", 1999), ("get", 0)]),
    [1997, 1998, 1999, -1],
)
`,
      },
    },
  },

  "string rotation check": {
    entry: "is_rotation(s1, s2) -> bool",
    languages: {
      python: {
        starter: `def is_rotation(s1, s2):
    """Return True if s2 is a rotation of s1.

    e.g. "waterbottle" rotated at index 3 -> "erbottlewat".
    Use O(1) extra space beyond the inputs.
    """
    # your code here
    return False
`,
        harness: `case('"waterbottle" / "terbottlewa"', lambda: is_rotation("waterbottle", "terbottlewa"), True)
case('"abc" / "acb" (not a rotation)', lambda: is_rotation("abc", "acb"), False)
case("empty strings", lambda: is_rotation("", ""), True)
case("single character", lambda: is_rotation("a", "a"), True)
case("rotation by zero (identical)", lambda: is_rotation("abc", "abc"), True)
case("different lengths", lambda: is_rotation("aa", "aaa"), False)
case('"aab" / "aba"', lambda: is_rotation("aab", "aba"), True)
case("repeated characters", lambda: is_rotation("aaaa", "aaaa"), True)
case("substring but not rotation", lambda: is_rotation("abcde", "abced"), False)
`,
      },
    },
  },

  // ----------------------------------------------------------------------- Apple
  "trie with prefix search (autocomplete)": {
    entry: "class Autocomplete with insert(word) / words_with_prefix(prefix)",
    languages: {
      python: {
        starter: `class Autocomplete:
    def __init__(self):
        # your code here
        pass

    def insert(self, word):
        """Add a word to the dictionary."""
        pass

    def words_with_prefix(self, prefix):
        """Return every inserted word starting with prefix, sorted
        lexicographically. Return [] when nothing matches.
        """
        return []
`,
        harness: `def _lookup(words, prefix):
    index = Autocomplete()
    for word in words:
        index.insert(word)
    return index.words_with_prefix(prefix)


WORDS = ["apple", "app", "apply", "banana"]

case('prefix "app"', lambda: _lookup(WORDS, "app"), ["app", "apple", "apply"])
case('prefix "appl"', lambda: _lookup(WORDS, "appl"), ["apple", "apply"])
case('prefix "xyz" -> []', lambda: _lookup(WORDS, "xyz"), [])
case("empty prefix returns everything, sorted", lambda: _lookup(WORDS, ""), ["app", "apple", "apply", "banana"])
case("exact word matches itself", lambda: _lookup(["cat"], "cat"), ["cat"])
case("duplicate inserts are not duplicated", lambda: _lookup(["dog", "dog"], "do"), ["dog"])
case("prefix longer than any word", lambda: _lookup(["ab"], "abcd"), [])
case("results are sorted, not insertion-ordered", lambda: _lookup(["zebra", "apple", "mango"], ""), ["apple", "mango", "zebra"])
`,
      },
    },
  },

  // ------------------------------------------------------------------- Microsoft
  "integer to english words": {
    entry: "numberToWords(num) -> str",
    languages: {
      python: {
        starter: `def numberToWords(num):
    """Convert 0 <= num <= 2**31 - 1 into English words.

    e.g. 123 -> "One Hundred Twenty Three". Single spaces, no trailing space.
    """
    # your code here
    return ""
`,
        harness: `case("123", lambda: numberToWords(123), "One Hundred Twenty Three")
case("12345", lambda: numberToWords(12345), "Twelve Thousand Three Hundred Forty Five")
case("0", lambda: numberToWords(0), "Zero")
case("20", lambda: numberToWords(20), "Twenty")
case("100", lambda: numberToWords(100), "One Hundred")
case("1000", lambda: numberToWords(1000), "One Thousand")
case("1000000", lambda: numberToWords(1000000), "One Million")
case("1000010 (teens inside a group)", lambda: numberToWords(1000010), "One Million Ten")
case("1000000000", lambda: numberToWords(1000000000), "One Billion")
case(
    "2147483647 (max int)",
    lambda: numberToWords(2147483647),
    "Two Billion One Hundred Forty Seven Million Four Hundred Eighty Three Thousand Six Hundred Forty Seven",
)
case("19 (teen)", lambda: numberToWords(19), "Nineteen")
case("1000001", lambda: numberToWords(1000001), "One Million One")
`,
      },
    },
  },

  // ----------------------------------------------------------------------- Tesla
  "sliding window maximum on a sensor stream": {
    entry: "maxSlidingWindow(nums, k) -> list[int]",
    languages: {
      python: {
        starter: `def maxSlidingWindow(nums, k):
    """Return the maximum of every contiguous window of size k.

    Target O(n) total time and O(k) memory (monotonic deque).
    """
    # your code here
    return []
`,
        harness: `case("nums=[1,3,-1,-3,5,3,6,7], k=3", lambda: maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3), [3, 3, 5, 5, 6, 7])
case("nums=[1], k=1", lambda: maxSlidingWindow([1], 1), [1])
case("k=1 returns the input", lambda: maxSlidingWindow([9, 8, 7], 1), [9, 8, 7])
case("k == len(nums)", lambda: maxSlidingWindow([1, 2, 3, 4], 4), [4])
case("all negative values", lambda: maxSlidingWindow([-7, -8, -3, -5], 2), [-7, -3, -3])
case("repeated maxima", lambda: maxSlidingWindow([-7, -8, 7, 5, 7, 1, 6, 0], 4), [7, 7, 7, 7, 7])
case("empty input", lambda: maxSlidingWindow([], 1), [])
case("decreasing sequence", lambda: maxSlidingWindow([5, 4, 3, 2, 1], 2), [5, 4, 3, 2])
case("10k samples, k=100", lambda: maxSlidingWindow(list(range(10000)), 100)[:3], [99, 100, 101])
`,
      },
    },
  },

  // ------------------------------------------------------------------ Databricks
  "top-k words from a text stream (reduce-side)": {
    entry: "top_k(words, k) -> list[tuple[str, int]]",
    note: "Ties are broken alphabetically so the expected order is deterministic. words may be any iterable (including a generator).",
    languages: {
      python: {
        starter: `def top_k(words, k):
    """Return the k most frequent words as (word, count) pairs.

    Sort by count descending, then alphabetically for ties.
    words may be any iterable; k may exceed the number of distinct words.
    """
    # your code here
    return []
`,
        harness: `case(
    "hello x3, world x2, data x1 (k=2)",
    lambda: top_k(["hello", "hello", "hello", "world", "world", "data"], 2),
    [["hello", 3], ["world", 2]],
)
case("k greater than the distinct count", lambda: top_k(["a", "b"], 5), [["a", 1], ["b", 1]])
case("ties broken alphabetically", lambda: top_k(["b", "a"], 2), [["a", 1], ["b", 1]])
case("empty stream", lambda: top_k([], 3), [])
case("k = 0", lambda: top_k(["a", "a"], 0), [])
case("works with a generator/iterator", lambda: top_k(iter(["x", "x", "y"]), 1), [["x", 2]])
case(
    "mixed counts (k=3)",
    lambda: top_k(["c"] * 5 + ["a"] * 5 + ["b"] * 2 + ["d"], 3),
    [["a", 5], ["c", 5], ["b", 2]],
)
case("10k words", lambda: top_k(["w" + str(i % 7) for i in range(10000)], 2), [["w0", 1429], ["w1", 1429]])
`,
      },
    },
  },

  // ------------------------------------------------------------------- Anthropic
  "token-level f1 evaluation (squad-style)": {
    entry: "evaluate(pred, ref) -> (exact_match, token_f1)",
    note: "Tokenize on word characters and lowercase. exact_match compares the normalized token SEQUENCES (order matters); F1 uses the token sets.",
    languages: {
      python: {
        starter: `def evaluate(pred, ref):
    """Return (exact_match, token_f1) for a predicted answer vs a reference.

    Normalize by lowercasing and splitting on word characters.
      exact_match: the normalized token sequences are identical
      token_f1:    2*p*r/(p+r) over the token sets, 0.0 when nothing overlaps
    """
    # your code here
    return (False, 0.0)
`,
        harness: `case(
    '"The answer is 42" vs "the answer was 42"',
    lambda: evaluate("The answer is 42", "the answer was 42"),
    (False, 0.75),
)
case('"42" vs "forty two" (no overlap)', lambda: evaluate("42", "forty two"), (False, 0.0))
case("identical strings", lambda: evaluate("hello world", "hello world"), (True, 1.0))
case("case and punctuation are normalized away", lambda: evaluate("Hello!", "hello"), (True, 1.0))
case("same tokens, different order", lambda: evaluate("a b", "b a"), (False, 1.0))
case(
    "partial overlap (2 of 3 vs 2 of 2)",
    lambda: evaluate("red blue green", "red blue"),
    (False, 0.8),
)
`,
      },
    },
  },

  // ---------------------------------------------------------------------- OpenAI
  "top-k sampling with temperature": {
    entry: "top_k_sample(logits, k, temperature=1.0) -> (indices, probabilities)",
    note: "numpy is not available in the runner: use plain Python lists and math.exp. Return indices (and their probabilities) sorted by logit, highest first.",
    languages: {
      python: {
        starter: `import math


def top_k_sample(logits, k, temperature=1.0):
    """Temperature-scale logits, keep the top k, softmax, and return
    (indices, probabilities) ordered from most to least likely.

    Handle k >= len(logits) (clip it) and temperature <= 0 (greedy: return the
    single argmax with probability 1.0).
    """
    # your code here
    return ([], [])
`,
        harness: `import math


def _softmax(values):
    top = max(values)
    exps = [math.exp(v - top) for v in values]
    total = sum(exps)
    return [e / total for e in exps]


case(
    "logits=[1,2,3], k=2, T=1",
    lambda: top_k_sample([1.0, 2.0, 3.0], 2, 1.0),
    ([2, 1], _softmax([3.0, 2.0])),
)
case(
    "k greater than vocab is clipped",
    lambda: top_k_sample([1.0, 2.0, 3.0], 5, 1.0),
    ([2, 1, 0], _softmax([3.0, 2.0, 1.0])),
)
case("temperature 0 is greedy", lambda: top_k_sample([1.0, 2.0, 3.0], 2, 0.0), ([2], [1.0]))
case(
    "temperature 0.5 sharpens",
    lambda: top_k_sample([1.0, 2.0, 3.0], 2, 0.5),
    ([2, 1], _softmax([6.0, 4.0])),
)
case("k=1", lambda: top_k_sample([0.5, 9.0, 1.0], 1, 1.0), ([1], [1.0]))
case(
    "probabilities sum to 1",
    lambda: round(sum(top_k_sample([0.2, 1.7, -3.0, 4.4], 3, 0.8)[1]), 6),
    1.0,
)
`,
      },
    },
  },

  "implement causal self-attention": {
    entry: "causal_attention(Q, K, V) -> (out, probs)",
    note: "numpy is not available in the runner: use nested Python lists shaped [B][N][D]. Masked positions in probs must be exactly 0.0.",
    languages: {
      python: {
        starter: `import math


def causal_attention(Q, K, V):
    """Causal (masked) self-attention over nested lists shaped [B][N][D].

    out = softmax(Q K^T / sqrt(D) + mask) V, where token i may only attend to
    tokens j <= i. Return (out, probs) with probs[b][i][j] == 0.0 for j > i.
    """
    # your code here
    return ([], [])
`,
        harness: `import math


def _ref(Q, K, V):
    """Reference implementation the harness compares against."""
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


ONES = [[[1.0, 1.0], [1.0, 1.0], [1.0, 1.0]]]
SINGLE = [[[0.3, -0.7]]]
MIXED_Q = [[[0.1, 0.2], [0.3, -0.4], [1.0, 0.5]]]
MIXED_K = [[[0.5, -0.1], [-0.2, 0.8], [0.0, 0.3]]]
MIXED_V = [[[1.0, 0.0], [0.0, 2.0], [-1.0, 0.5]]]
BATCH_Q = MIXED_Q + ONES
BATCH_K = MIXED_K + ONES
BATCH_V = MIXED_V + ONES

case("uniform input: causal probs are 1, 1/2, 1/3", lambda: causal_attention(ONES, ONES, ONES)[1], _ref(ONES, ONES, ONES)[1])
case("uniform input: output", lambda: causal_attention(ONES, ONES, ONES)[0], _ref(ONES, ONES, ONES)[0])
case("single token: out == V", lambda: causal_attention(SINGLE, SINGLE, SINGLE)[0], SINGLE)
case("single token: probs == [[1.0]]", lambda: causal_attention(SINGLE, SINGLE, SINGLE)[1], [[[1.0]]])
case("distinct Q/K/V: probs", lambda: causal_attention(MIXED_Q, MIXED_K, MIXED_V)[1], _ref(MIXED_Q, MIXED_K, MIXED_V)[1])
case("distinct Q/K/V: output", lambda: causal_attention(MIXED_Q, MIXED_K, MIXED_V)[0], _ref(MIXED_Q, MIXED_K, MIXED_V)[0])
case("batch of 2: output", lambda: causal_attention(BATCH_Q, BATCH_K, BATCH_V)[0], _ref(BATCH_Q, BATCH_K, BATCH_V)[0])
case(
    "future positions are exactly 0.0",
    lambda: [row[i + 1:] for i, row in enumerate(causal_attention(MIXED_Q, MIXED_K, MIXED_V)[1][0])],
    [[0.0, 0.0], [0.0], []],
)
`,
      },
    },
  },

  // ---------------------------------------------------------------------- NVIDIA
  "vector addition kernel (cuda)": {
    entry: "CUDA kernel (needs nvcc and an NVIDIA GPU)",
    note: "This can't run in the local codepad: CUDA needs the nvcc toolchain and an NVIDIA GPU. Practice it on a GPU box or a free Colab T4 runtime, then compare against the solution.",
    languages: {},
  },

  "parallel reduction (shared memory)": {
    entry: "CUDA kernel (needs nvcc and an NVIDIA GPU)",
    note: "This can't run in the local codepad: CUDA needs the nvcc toolchain and an NVIDIA GPU. Practice it on a GPU box or a free Colab T4 runtime, then compare against the solution.",
    languages: {},
  },
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Look up the runnable spec for a question title (exact, case-insensitive). */
export function execSpecForTitle(title: string): ExecSpec | null {
  return PRACTICE_SPECS[normalizeTitle(title)] ?? null;
}

/** Parse the JSON blob stored on Question.execSpec. Invalid data is ignored. */
export function parseExecSpec(raw: string | null | undefined): ExecSpec | null {
  if (!raw) return null;
  try {
    return execSpecSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Client-safe view of a spec: starter code and language list, never the harness. */
export function toPracticeMeta(spec: ExecSpec | null): PracticeMeta | null {
  if (!spec) return null;

  const languages = RUN_LANGUAGES.filter((language) => Boolean(spec.languages[language]));
  const starters: Partial<Record<RunLanguage, string>> = {};
  let checked = false;
  for (const language of languages) {
    const entry = spec.languages[language];
    if (!entry) continue;
    starters[language] = entry.starter;
    if (entry.harness) checked = true;
  }

  return {
    mode: checked ? "checked" : "freeform",
    entry: spec.entry,
    note: spec.note,
    languages,
    starters,
  };
}
