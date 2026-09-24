import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { LanguageRuntime, PreparedProgram } from "./runner";
import { detectCommand } from "./detect";

// Python runtime for the practice codepad.
//
// Layout written into the throwaway temp dir (checked mode):
//   user_code.py  your code, verbatim
//   judge.py      assertion helpers + result writer (injected, not yours)
//   tests.py      the question's harness; imports your names, calls case(...)
//   main.py       entry point: imports tests, then writes the results file
//
// Separate files (instead of one concatenated blob) keep your line numbers intact
// in tracebacks and mean a harness never has to be re-indented to fit inside a
// try block.

const JUDGE_PY = `"""Assertion helpers injected by Interview Prep Studio. Not part of your solution."""
import json as _json
import math as _math

_RESULTS_PATH = __RESULTS_PATH__

_results = []
_error = None
_MAX_FIELD = 2000


def _norm(value, ndigits=6):
    """Normalize for comparison/printing: round floats, sort dict keys and sets."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        if _math.isnan(value):
            return "nan"
        if _math.isinf(value):
            return "inf" if value > 0 else "-inf"
        return round(value, ndigits)
    if isinstance(value, (list, tuple)):
        return [_norm(v, ndigits) for v in value]
    if isinstance(value, (set, frozenset)):
        return sorted((_norm(v, ndigits) for v in value), key=repr)
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: str(kv[0]))
        return {str(k): _norm(v, ndigits) for k, v in items}
    return value


def fmt(value):
    """Readable, stable rendering used in the results table."""
    try:
        return _json.dumps(_norm(value), ensure_ascii=False)
    except (TypeError, ValueError):
        return repr(value)


def _equal(got, expected, tol):
    if isinstance(expected, float) or isinstance(got, float):
        try:
            gf, ef = float(got), float(expected)
        except (TypeError, ValueError):
            return False
        if _math.isnan(gf) and _math.isnan(ef):
            return True
        if _math.isinf(gf) or _math.isinf(ef):
            return gf == ef
        return abs(gf - ef) <= tol
    if isinstance(expected, (list, tuple)):
        if not isinstance(got, (list, tuple)) or len(got) != len(expected):
            return False
        return all(_equal(g, e, tol) for g, e in zip(got, expected))
    if isinstance(expected, (set, frozenset)):
        try:
            return set(got) == set(expected)
        except TypeError:
            return False
    if isinstance(expected, dict):
        if not isinstance(got, dict):
            return False
        if set(str(k) for k in expected) != set(str(k) for k in got):
            return False
        by_str = {str(k): k for k in got}
        return all(_equal(got[by_str[str(k)]], v, tol) for k, v in expected.items())
    return _norm(got) == _norm(expected)


def _flush():
    payload = {"cases": _results, "error": _error}
    try:
        with open(_RESULTS_PATH, "w", encoding="utf-8") as handle:
            _json.dump(payload, handle, ensure_ascii=False)
    except OSError:
        pass


def _record(label, passed, expected_text, actual_text):
    _results.append(
        {
            "pass": bool(passed),
            "label": str(label)[:300],
            "expected": expected_text[:_MAX_FIELD],
            "actual": actual_text[:_MAX_FIELD],
        }
    )
    # Written per case so partial results survive a timeout.
    _flush()


def case(label, fn, expected, tol=1e-6, unordered=False):
    """Run one test case.

    fn must be a zero-argument callable (use a lambda) so an exception in one case
    is reported as a failure instead of aborting the whole run.
    """
    try:
        got = fn()
    except Exception as exc:
        _record(label, False, fmt(expected), "raised {}: {}".format(type(exc).__name__, exc))
        return False
    left, right = got, expected
    if unordered:
        try:
            left = sorted(_norm(list(got)), key=repr)
            right = sorted(_norm(list(expected)), key=repr)
        except TypeError:
            left, right = got, expected
    try:
        ok = _equal(left, right, tol)
    except Exception:
        ok = False
    _record(label, ok, fmt(expected), fmt(got))
    return ok


def check(label, got, expected, tol=1e-6, unordered=False):
    """Compare an already-computed value. Prefer case() so exceptions are isolated."""
    return case(label, lambda: got, expected, tol=tol, unordered=unordered)


def set_error(message):
    global _error
    _error = str(message)[:4000]
    _flush()


def emit():
    _flush()
`;

const MAIN_PY = `import traceback

import judge

try:
    import tests  # noqa: F401  (loads your code, then runs the test cases)
except SyntaxError as exc:
    judge.set_error(
        "Your code has a syntax error: "
        + "".join(traceback.format_exception_only(type(exc), exc)).strip()
    )
except Exception:
    judge.set_error(traceback.format_exc(limit=8).strip())

judge.emit()
`;

/**
 * tests.py preamble: copy every name from user_code into this module's globals so
 * the harness can call the expected function/class by its bare name.
 */
const TESTS_PREAMBLE = `from judge import case, check, fmt  # noqa: F401
import user_code as _user_code

globals().update({_k: _v for _k, _v in vars(_user_code).items() if not _k.startswith("__")})

`;

export const pythonRuntime: LanguageRuntime = {
  language: "python",

  async detect() {
    return detectCommand({
      language: "python",
      label: "Python 3",
      candidates: ["python3", "python"],
      versionArgs: ["--version"],
      installHint: "Install Python 3 (python.org or `brew install python`) and restart the app.",
    });
  },

  async prepare({ dir, code, harness, resultsPath }): Promise<PreparedProgram> {
    const status = await pythonRuntime.detect();
    if (!status.available || !status.command) {
      return { error: status.hint ?? "Python 3 was not found on this machine." };
    }

    await writeFile(path.join(dir, "user_code.py"), code, "utf8");

    if (!harness) {
      // Freeform: run the file as a plain script, no assertions.
      return {
        command: status.command,
        args: ["user_code.py"],
        env: { PYTHONDONTWRITEBYTECODE: "1" },
      };
    }

    // JSON.stringify produces a correctly escaped Python string literal.
    const judgeSource = JUDGE_PY.replace("__RESULTS_PATH__", JSON.stringify(resultsPath));

    await writeFile(path.join(dir, "judge.py"), judgeSource, "utf8");
    await writeFile(path.join(dir, "tests.py"), TESTS_PREAMBLE + harness, "utf8");
    await writeFile(path.join(dir, "main.py"), MAIN_PY, "utf8");

    return {
      command: status.command,
      args: ["main.py"],
      env: { PYTHONDONTWRITEBYTECODE: "1" },
    };
  },
};
