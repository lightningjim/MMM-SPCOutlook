---
status: partial
phase: 18-merge-precedence-unified-payload-schema
source: [18-VERIFICATION.md]
started: 2026-09-06T15:15:00Z
updated: 2026-09-06T15:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Cold-cache startup latency on target Raspberry Pi hardware (ROADMAP criterion 6 / PERF-03)

Run the module on the target Raspberry Pi with every product toggle enabled, starting from a
fresh process (cold in-memory cache), and record the logged backend-interval and wall-clock
startup figures.

expected: A measured cold-cache latency figure from the actual target hardware is recorded (in
STATE.md or a UAT record) before the v2.0 milestone closes.

why_human: No Raspberry Pi hardware is reachable from the verification environment. The PERF-03
instrumentation shipped in 18-06 and was exercised against a local cold start (backend interval
4004ms, slowest source spc-inline 2914ms), but that is a local baseline, not the target-hardware
figure the criterion requires. Deliberately scoped to milestone close rather than phase close per
locked decision D-19 (18-CONTEXT.md); tracked as an open blocker at STATE.md:94.

result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
