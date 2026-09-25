// Server-injected judges for compiled CodePad languages. Their result files are
// the only grading channel, so user stdout cannot forge a passing result.

export const CPP_JUDGE_HEADER = `#pragma once
#include <cmath>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

#define JUDGE_RESULTS_PATH __RESULTS_PATH__

namespace judge {
inline std::vector<std::string> results;
inline std::string fatal_error;

inline std::string escape(const std::string& value) {
  std::ostringstream out;
  for (unsigned char c : value) {
    switch (c) {
      case '"': out << R"(\")"; break;
      case '\\\\': out << R"(\\)"; break;
      case '\\b': out << R"(\b)"; break;
      case '\\f': out << R"(\f)"; break;
      case '\\n': out << R"(\n)"; break;
      case '\\r': out << R"(\r)"; break;
      case '\\t': out << R"(\t)"; break;
      default:
        if (c < 0x20) {
          out << "\\\\u" << std::hex << std::setw(4) << std::setfill('0')
              << static_cast<int>(c) << std::dec << std::setfill(' ');
        } else {
          out << c;
        }
    }
  }
  return out.str();
}

inline void flush() {
  std::ofstream out(JUDGE_RESULTS_PATH, std::ios::trunc);
  if (!out) return;
  out << "{\\"cases\\":[";
  for (std::size_t i = 0; i < results.size(); ++i) {
    if (i) out << ",";
    out << results[i];
  }
  out << "],\\"error\\":";
  if (fatal_error.empty()) out << "null";
  else out << "\\"" << escape(fatal_error) << "\\"";
  out << "}";
}

template <typename T> struct is_vector : std::false_type {};
template <typename T, typename A> struct is_vector<std::vector<T, A>> : std::true_type {};
template <typename T> struct is_pair : std::false_type {};
template <typename A, typename B> struct is_pair<std::pair<A, B>> : std::true_type {};
template <typename T> struct is_string_like : std::false_type {};
template <> struct is_string_like<std::string> : std::true_type {};
template <> struct is_string_like<char*> : std::true_type {};
template <> struct is_string_like<const char*> : std::true_type {};

inline std::string render(const std::string& value) { return "\\"" + escape(value) + "\\""; }
inline std::string render(const char* value) { return render(std::string(value ? value : "")); }
inline std::string render(bool value) { return value ? "true" : "false"; }

template <typename T>
std::enable_if_t<std::is_integral_v<T> && !std::is_same_v<T, bool>, std::string>
render(const T& value) {
  return std::to_string(value);
}

template <typename T>
std::enable_if_t<std::is_floating_point_v<T>, std::string> render(const T& value) {
  if (std::isnan(value)) return "\\"nan\\"";
  if (std::isinf(value)) return value > 0 ? "\\"inf\\"" : "\\"-inf\\"";
  std::ostringstream out;
  out << std::setprecision(12) << value;
  return out.str();
}

template <typename T>
std::enable_if_t<is_vector<std::decay_t<T>>::value, std::string> render(const T& values) {
  std::string out = "[";
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i) out += ", ";
    out += render(values[i]);
  }
  return out + "]";
}

template <typename T>
std::enable_if_t<is_pair<std::decay_t<T>>::value, std::string> render(const T& value) {
  return "[" + render(value.first) + ", " + render(value.second) + "]";
}

template <typename A, typename B>
bool equal(const A& actual, const B& expected) {
  using Actual = std::decay_t<A>;
  using Expected = std::decay_t<B>;
  if constexpr (std::is_floating_point_v<Actual> || std::is_floating_point_v<Expected>) {
    const double a = static_cast<double>(actual);
    const double b = static_cast<double>(expected);
    if (std::isnan(a) || std::isnan(b)) return std::isnan(a) && std::isnan(b);
    if (std::isinf(a) || std::isinf(b)) return a == b;
    return std::fabs(a - b) <= 1e-6;
  } else if constexpr (is_string_like<Actual>::value && is_string_like<Expected>::value) {
    return std::string(actual) == std::string(expected);
  } else if constexpr (is_string_like<Actual>::value || is_string_like<Expected>::value) {
    return false;
  } else if constexpr (is_vector<Actual>::value && is_vector<Expected>::value) {
    if (actual.size() != expected.size()) return false;
    for (std::size_t i = 0; i < actual.size(); ++i) {
      if (!equal(actual[i], expected[i])) return false;
    }
    return true;
  } else if constexpr (is_vector<Actual>::value || is_vector<Expected>::value) {
    return false;
  } else if constexpr (is_pair<Actual>::value && is_pair<Expected>::value) {
    return equal(actual.first, expected.first) && equal(actual.second, expected.second);
  } else if constexpr (is_pair<Actual>::value || is_pair<Expected>::value) {
    return false;
  } else {
    return actual == expected;
  }
}

template <typename A, typename E>
bool case_(const char* label, const A& actual, const E& expected) {
  bool passed = false;
  try {
    passed = equal(actual, expected);
  } catch (...) {
    passed = false;
  }
  const std::string expected_text = render(expected);
  const std::string actual_text = render(actual);
  results.push_back("{\\"pass\\":" + std::string(passed ? "true" : "false") +
                    ",\\"label\\":\\"" + escape(label ? label : "") +
                    "\\",\\"expected\\":\\"" + escape(expected_text) +
                    "\\",\\"actual\\":\\"" + escape(actual_text) + "\\"}");
  flush();
  return passed;
}

inline void error(const std::string& message) {
  fatal_error = message.substr(0, 4000);
  flush();
}

inline int finish() {
  flush();
  return fatal_error.empty() ? 0 : 1;
}
}  // namespace judge
`;

export const JAVA_JUDGE_SOURCE = `import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.List;

class Judge {
  private static final String RESULTS_PATH = __RESULTS_PATH__;
  private static final List<String> RESULTS = new ArrayList<String>();
  private static String error = null;

  private static String escape(String value) {
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"': out.append('\\\\').append('"'); break;
        case '\\\\': out.append('\\\\').append('\\\\'); break;
        case '\\b': out.append('\\\\').append('b'); break;
        case '\\f': out.append('\\\\').append('f'); break;
        case '\\n': out.append('\\\\').append('n'); break;
        case '\\r': out.append('\\\\').append('r'); break;
        case '\\t': out.append('\\\\').append('t'); break;
        default:
          if (c < 0x20) out.append(String.format("\\\\u%04x", (int) c));
          else out.append(c);
      }
    }
    return out.toString();
  }

  private static void flush() {
    try (FileWriter out = new FileWriter(RESULTS_PATH, false)) {
      out.write("{\\"cases\\":[");
      for (int i = 0; i < RESULTS.size(); i++) {
        if (i > 0) out.write(",");
        out.write(RESULTS.get(i));
      }
      out.write("],\\"error\\":");
      out.write(error == null ? "null" : "\\"" + escape(error) + "\\"");
      out.write("}");
    } catch (IOException ignored) {
      // A missing result path should not hide the program's original failure.
    }
  }

  public static String render(Object value) {
    if (value == null) return "null";
    if (value instanceof String || value instanceof Character) return "\\"" + escape(String.valueOf(value)) + "\\"";
    if (value instanceof Boolean || value instanceof Byte || value instanceof Short ||
        value instanceof Integer || value instanceof Long) return String.valueOf(value);
    if (value instanceof Float || value instanceof Double) {
      double number = ((Number) value).doubleValue();
      if (Double.isNaN(number)) return "\\"nan\\"";
      if (Double.isInfinite(number)) return number > 0 ? "\\"inf\\"" : "\\"-inf\\"";
      return String.valueOf(value);
    }
    if (value.getClass().isArray()) {
      StringBuilder out = new StringBuilder("[");
      int length = Array.getLength(value);
      for (int i = 0; i < length; i++) {
        if (i > 0) out.append(", ");
        out.append(render(Array.get(value, i)));
      }
      return out.append("]").toString();
    }
    if (value instanceof List<?>) {
      StringBuilder out = new StringBuilder("[");
      List<?> values = (List<?>) value;
      for (int i = 0; i < values.size(); i++) {
        if (i > 0) out.append(", ");
        out.append(render(values.get(i)));
      }
      return out.append("]").toString();
    }
    return "\\"" + escape(String.valueOf(value)) + "\\"";
  }

  private static boolean equal(Object actual, Object expected) {
    if (actual == expected) return true;
    if (actual == null || expected == null) return false;
    if (actual instanceof Float || actual instanceof Double ||
        expected instanceof Float || expected instanceof Double) {
      if (!(actual instanceof Number) || !(expected instanceof Number)) return false;
      double a = ((Number) actual).doubleValue();
      double b = ((Number) expected).doubleValue();
      if (Double.isNaN(a) || Double.isNaN(b)) return Double.isNaN(a) && Double.isNaN(b);
      if (Double.isInfinite(a) || Double.isInfinite(b)) return a == b;
      return Math.abs(a - b) <= 1e-6;
    }
    if (actual.getClass().isArray() && expected.getClass().isArray()) {
      int length = Array.getLength(actual);
      if (length != Array.getLength(expected)) return false;
      for (int i = 0; i < length; i++) {
        if (!equal(Array.get(actual, i), Array.get(expected, i))) return false;
      }
      return true;
    }
    if (actual instanceof List<?> && expected instanceof List<?>) {
      List<?> a = (List<?>) actual;
      List<?> b = (List<?>) expected;
      if (a.size() != b.size()) return false;
      for (int i = 0; i < a.size(); i++) if (!equal(a.get(i), b.get(i))) return false;
      return true;
    }
    if (actual instanceof Number && expected instanceof Number) {
      return ((Number) actual).longValue() == ((Number) expected).longValue();
    }
    return actual.equals(expected);
  }

  public static boolean case_(String label, Object actual, Object expected) {
    boolean passed;
    try {
      passed = equal(actual, expected);
    } catch (RuntimeException ignored) {
      passed = false;
    }
    String expectedText = render(expected);
    String actualText = render(actual);
    RESULTS.add("{\\"pass\\":" + (passed ? "true" : "false") +
        ",\\"label\\":\\"" + escape(label) + "\\",\\"expected\\":\\"" +
        escape(expectedText) + "\\",\\"actual\\":\\"" + escape(actualText) + "\\"}");
    flush();
    return passed;
  }

  public static boolean check(String label, Object actual, Object expected) {
    return case_(label, actual, expected);
  }

  public static void error(String message) {
    error = message == null ? "null" : message.substring(0, Math.min(4000, message.length()));
    flush();
  }

  public static int finish() {
    flush();
    return error == null ? 0 : 1;
  }
}
`;
