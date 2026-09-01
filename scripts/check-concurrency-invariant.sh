#!/usr/bin/env bash
#
# Mechanically enforces the concurrency-safety invariant documented in
# node_helper.js's Promise.allSettled batch comment (Phase 17 Plan 05, Task 2)
# and 17-PATTERNS.md §6: PERF-01's batch fans six product runners out
# concurrently, and two helper-global fields — `_unusableFeatureCount` and
# `_oldestStaleAt` — are shared across every member. They are safe under
# concurrency ONLY because every one of their write sites is a synchronous
# statement with no `await` anywhere between the start of the enclosing
# METHOD and the mutation itself: JavaScript's single-threaded,
# run-to-completion semantics mean two concurrently-running async functions
# can only interleave at an `await` boundary, so a mutation no `await` can
# precede within its own method cannot be torn by a sibling batch member.
#
# This script is the self-failing half of that argument. It locates each
# known mutation site by a fixed anchor string, walks back to the opening
# line of the METHOD that contains it, and fails loudly if an `await` token
# appears anywhere in that window.
#
# 17-REVIEW CR-02: it did NOT always do that. The window used to be found by
# `awk 'NR<end && /\{[[:space:]]*$/{start=NR}'` — the last line at-or-above
# the mutation that merely ENDS IN `{`. That is almost never the enclosing
# method; for `_oldestStaleAt @ _noteStaleEntry` it resolved to the `if`
# condition's own continuation line, TWO lines above the mutation, so an
# `await` inserted as the first statement of that method was invisible and
# the script still printed "all sites clean". A guard that cannot fail is
# worse than no guard: it manufactures confidence instead of providing it.
# The window is now anchored on the method declaration the caller already
# names in SITE, and the self-test at the bottom of this file proves on
# every run that an `await` at the top of a method is actually caught.
#
# The window is deliberately the WHOLE method prefix rather than the tightest
# enclosing brace: that is a superset of the true enclosing block, so it can
# only ever be over-strict, never under-strict. An `await` earlier in the
# method on a path that cannot reach the mutation would be a false FAIL — a
# loud one, that a maintainer must reason about and can then re-scope
# deliberately. Under-strictness is the failure mode that shipped; this
# direction is the safe one to err in. It remains intentionally grep/sed and
# awk based, not a parser — good enough to catch a future edit that drops an
# `await` into one of these specific methods, not a general data-flow
# analysis.
#
# `_unusableFeatureCount` currently has THREE write sites — extractPolygons,
# evaluatePolygonsCollectAll, and checkInPolygon (reached only through
# _runKmlAdvisoryRow, one of the batch's own members) — not the two the
# original phase plan named; checkInPolygon was found during this script's
# own construction and is audited here for the same reason the other two
# are. `_oldestStaleAt` has one write site, _noteStaleEntry's min-reduce.
#
# Exit 0 when every site is clean and the self-test passes. Exit non-zero,
# naming the offending field and site, otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_FILE="$SCRIPT_DIR/../node_helper.js"
# The file currently under audit. Normally node_helper.js; temporarily
# repointed at a mutated copy of it by self_test() below.
FILE="$DEFAULT_FILE"
FAIL=0

# check_site FIELD SITE ANCHOR MUTATION
#   FIELD    - the helper-global field name, for the failure message
#   SITE     - the METHOD name the mutation lives in. Used both for the
#              failure message and, since CR-02, to anchor the audited
#              window on that method's own declaration line.
#   ANCHOR   - a fixed literal substring uniquely identifying a line at or
#              near the mutation (used to disambiguate identical mutation
#              text that repeats across sites)
#   MUTATION - a fixed literal substring identifying the mutation statement
#              itself, expected on or shortly after the anchor line
check_site() {
  local field="$1" site="$2" anchor="$3" mutation="$4"

  local anchor_line
  anchor_line=$(grep -n -F "$anchor" "$FILE" | head -1 | cut -d: -f1)
  if [ -z "$anchor_line" ]; then
    echo "FAIL: $field @ $site — anchor text not found (has the code moved or been renamed?): $anchor"
    FAIL=1
    return
  fi

  local relative_mutation_line
  relative_mutation_line=$(tail -n "+$anchor_line" "$FILE" | grep -n -F "$mutation" | head -1 | cut -d: -f1)
  if [ -z "$relative_mutation_line" ]; then
    echo "FAIL: $field @ $site:$anchor_line — mutation text not found near its anchor: $mutation"
    FAIL=1
    return
  fi
  local mutation_line=$((anchor_line + relative_mutation_line - 1))

  # Walk backward from the mutation line (exclusive) to the opening line of
  # the METHOD named by SITE — a line declaring `<site>(...)` and ending in
  # `{`. Object-literal method shorthand is the only form node_helper.js
  # uses, so this matches every one of the four sites; a call site such as
  # `this.checkInPolygon(a, b);` cannot match because it does not end in `{`.
  # If the declaration cannot be found the script FAILS rather than falling
  # back to a narrower window — silently auditing less than advertised is
  # precisely the CR-02 defect.
  local block_start
  block_start=$(awk -v end="$mutation_line" -v site="$site" \
    'NR<end && $0 ~ ("(^|[^A-Za-z0-9_$])" site "[[:space:]]*\\(") && /\{[[:space:]]*$/ {start=NR} END{print start+0}' "$FILE")
  if [ -z "$block_start" ] || [ "$block_start" -eq 0 ]; then
    echo "FAIL: $field @ $site:$mutation_line — could not locate the enclosing method's opening line for \"$site\" above the mutation; this script will not fall back to a narrower window (see CR-02 in this file's header)"
    FAIL=1
    return
  fi

  local snippet
  snippet=$(sed -n "${block_start},${mutation_line}p" "$FILE")

  if echo "$snippet" | grep -qE '\bawait\b'; then
    echo "FAIL: $field @ $site:$mutation_line — a future edit introduced an \`await\` between ${site}()'s opening line ($block_start) and a mutation that Promise.allSettled's safety argument requires to be unreachable-by-interleaving — see node_helper.js's batch comment and 17-PATTERNS.md §6"
    FAIL=1
  else
    echo "OK: $field @ $site:$mutation_line (method ${site}() opens at line $block_start) — no await between the enclosing method's start and the mutation"
  fi
}

# The audited sites, as one callable unit so self_test() can re-run the exact
# same checks against a deliberately-broken copy of the file.
audit_all_sites() {
  check_site "_unusableFeatureCount" "extractPolygons" \
    "MMM-SPCOutlook extractPolygons: skipping a feature with unusable geometry" \
    "this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;"

  check_site "_unusableFeatureCount" "evaluatePolygonsCollectAll" \
    "MMM-SPCOutlook evaluatePolygonsCollectAll: containment check failed" \
    "this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;"

  check_site "_unusableFeatureCount" "checkInPolygon" \
    "MMM-SPCOutlook checkInPolygon: skipping a feature with unusable geometry" \
    "this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;"

  check_site "_oldestStaleAt" "_noteStaleEntry" \
    "_noteStaleEntry(entry) {" \
    "this._oldestStaleAt = entry.timestamp;"
}

# CR-02's second half: prove, on every run, that this guard is capable of
# failing. A copy of node_helper.js gets an `await` injected as the FIRST
# statement of `_noteStaleEntry` — inside the real enclosing method, but
# ABOVE the `if` whose brace the pre-CR-02 walk-back latched onto, which is
# exactly the position that used to slip through. The audit is then re-run
# against that copy and must report `_oldestStaleAt @ _noteStaleEntry` as a
# FAIL. The copy is never parsed as JavaScript (an `await` in a non-async
# method would not parse), only grepped, and is deleted either way.
self_test() {
  local fixture
  fixture=$(mktemp "${TMPDIR:-/tmp}/check-concurrency-selftest-XXXXXX.js") || {
    echo "FAIL(self-test): could not create a temporary fixture file"
    return 1
  }

  awk '
    { print }
    /_noteStaleEntry\(entry\)[[:space:]]*\{[[:space:]]*$/ { print "    await this._fetch(\"http://concurrency-guard-self-test\");" }
  ' "$DEFAULT_FILE" > "$fixture"

  if ! grep -q "concurrency-guard-self-test" "$fixture"; then
    echo "FAIL(self-test): could not inject the probe await — _noteStaleEntry's opening line no longer matches this self-test's pattern, so this guard's own coverage is unverified"
    rm -f "$fixture"
    return 1
  fi

  # Run the audit against the mutated copy. The command substitution is a
  # subshell, so the FAIL flag it sets does not leak into the real run.
  local out
  FILE="$fixture"
  out=$(audit_all_sites 2>&1)
  FILE="$DEFAULT_FILE"
  rm -f "$fixture"

  if ! echo "$out" | grep -q "^FAIL: _oldestStaleAt @ _noteStaleEntry"; then
    echo "FAIL(self-test): an \`await\` injected as the first statement of _noteStaleEntry was NOT reported — this guard cannot fail, which manufactures false confidence rather than providing it (17-REVIEW CR-02). Audit output against the deliberately-broken copy was:"
    echo "$out" | sed 's/^/  /'
    return 1
  fi

  echo "OK(self-test): an await injected at the top of _noteStaleEntry is detected — this guard is demonstrably capable of failing"
  return 0
}

if ! self_test; then
  FAIL=1
fi

audit_all_sites

if [ "$FAIL" -ne 0 ]; then
  echo "check-concurrency-invariant: FAILED — see above"
  exit 1
fi

echo "check-concurrency-invariant: all sites clean"
exit 0
