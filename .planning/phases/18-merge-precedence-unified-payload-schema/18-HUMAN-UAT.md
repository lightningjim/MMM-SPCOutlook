---
status: complete
phase: 18-merge-precedence-unified-payload-schema
source: [18-VERIFICATION.md]
started: 2026-09-06T15:15:00Z
updated: 2026-09-06T15:20:00Z
---

## Current Test

[none — all tests resolved]

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

result: PASS — measured 2026-09-06 on the target hardware.

Hardware: Raspberry Pi 4 Model B Rev 1.5 (aarch64, 4 cores, 3795 MB RAM),
Linux 6.18.34+rpt-rpi-v8, Node v24.13.1. Reached over SSH (`ssh mm`,
magicmirror.creasey.lan). Measured against the deployed coordinates
(lat 35.4432156, lon -97.595822) with all seven product toggles enabled and
`extended: true` — a superset of the live config, which leaves
showWinterImpact/showSPCMD unset and showDrought false.

Method: the shipped PERF-03 instrument's own once-per-process cold-start log
(`node_helper.js:1784-1799`), driven by a harness that stubs ONLY MagicMirror's
`node_helper`/`logger` shims — every fetch, ZIP, KML and turf call is the real
library over the real network. `node_helper.js` on the Pi was sha256-verified
identical to local HEAD. Run from `/tmp/spc-perf03`; the deployed MagicMirror
install was never modified. Each run is a fresh process, so the in-memory cache
is cold.

Three cold starts:

| Run | Backend interval | Wall clock since process start | Slowest source |
|-----|------------------|-------------------------------|----------------|
| 1   | 4094 ms          | 4096 ms                       | spc-inline (2718 ms) |
| 2   | 2159 ms          | 2161 ms                       | spc-inline (1261 ms) |
| 3   | 2303 ms          | 2305 ms                       | spc-inline (1239 ms) |

Run 1 carries first-contact DNS/TLS and upstream cache-miss cost; runs 2-3 are
the steady-state cold-process figure. **Median backend interval 2303 ms;
range 2159-4094 ms.** `spc-inline` (the SPC convective + fire-weather serial
chain that runs before the parallel batch) is the slowest source in every run,
consistently ~55% of the total.

Local x86 baseline for comparison (18-06-SUMMARY.md): 4004 ms backend interval,
spc-inline 2914 ms. The Pi is not slower than the development machine.

Full payload emitted successfully on every run: 18 top-level keys, 14 grid days,
no `error` key, seven sources reporting.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
