#!/usr/bin/env bash
#
# Mechanically enforces the concurrency-safety invariant documented in
# node_helper.js's Promise.allSettled batch comment (Phase 17 Plan 05, Task 2)
# and 17-PATTERNS.md §6: PERF-01's batch fans six product runners out
# concurrently, and two helper-global fields — `_unusableFeatureCount` and
# `_oldestStaleAt` — are shared across every member. They are safe under
# concurrency ONLY because every one of their write sites is a synchronous
# statement with no `await` between the enclosing block's opening brace and
# the mutation itself: JavaScript's single-threaded, run-to-completion
# semantics mean two concurrently-running async functions can only interleave
# at an `await` boundary, so a mutation with no `await` inside it cannot be
# torn by a sibling batch member.
#
# This script is the self-failing half of that argument. It locates each
# known mutation site by a fixed anchor string, finds the nearest enclosing
# block's opening line (the last line at-or-above the mutation that ends in
# `{`), and fails loudly if an `await` token appears anywhere in that window.
# It is intentionally grep/sed-based, not a parser — good enough to catch a
# future edit that drops an `await` into one of these specific mutations,
# not a general data-flow analysis.
#
# `_unusableFeatureCount` currently has THREE write sites — extractPolygons,
# evaluatePolygonsCollectAll, and checkInPolygon (reached only through
# _runKmlAdvisoryRow, one of the batch's own members) — not the two the
# original phase plan named; checkInPolygon was found during this script's
# own construction and is audited here for the same reason the other two
# are. `_oldestStaleAt` has one write site, _noteStaleEntry's min-reduce.
#
# Exit 0 when every site is clean. Exit non-zero, naming the offending
# field and site, otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../node_helper.js"
FAIL=0

# check_site FIELD SITE ANCHOR MUTATION
#   FIELD    - the helper-global field name, for the failure message
#   SITE     - the function name the mutation lives in, for the failure message
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

  # Walk backward from the mutation line (exclusive) to the nearest line
  # ending in `{` — the enclosing catch/if block's own opening line.
  local block_start
  block_start=$(awk -v end="$mutation_line" 'NR<end && /\{[[:space:]]*$/{start=NR} END{print start+0}' "$FILE")
  if [ -z "$block_start" ] || [ "$block_start" -eq 0 ]; then
    echo "FAIL: $field @ $site:$mutation_line — could not locate an enclosing block opening before the mutation"
    FAIL=1
    return
  fi

  local snippet
  snippet=$(sed -n "${block_start},${mutation_line}p" "$FILE")

  if echo "$snippet" | grep -qE '\bawait\b'; then
    echo "FAIL: $field @ $site:$mutation_line — a future edit introduced an \`await\` into a mutation that Promise.allSettled's safety argument requires to be synchronous — see node_helper.js's batch comment and 17-PATTERNS.md §6"
    FAIL=1
  else
    echo "OK: $field @ $site:$mutation_line (block starts at line $block_start) — no await between the enclosing block's start and the mutation"
  fi
}

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

if [ "$FAIL" -ne 0 ]; then
  echo "check-concurrency-invariant: FAILED — see above"
  exit 1
fi

echo "check-concurrency-invariant: all sites clean"
exit 0
