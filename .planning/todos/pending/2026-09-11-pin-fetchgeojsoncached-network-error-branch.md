---
created: 2026-09-11
source: Phase 14 re-verification (mutation M4)
severity: low
type: test-coverage
resolves_phase: null
---

# Pin `fetchGeoJsonCached`'s network-error hard-failure branch

## Problem

The probe suite cannot currently turn RED on a regression in
`fetchGeoJsonCached`'s **network-error** branch. Phase 14's re-verification
(2026-09-11) ran five mutation proofs; four turned RED as they should, and
this one **survived**:

> **M4** — drop the `failed: true` flag and the `Log.error` call from the
> network-error (fetch rejection) branch. Probe suite stayed green.

## Why the existing scenarios miss it

Two near-misses, each one layer off:

1. `throwingFetch` (`scripts/probe-payload-resilience.js:870`) throws one layer
   too high — above `fetchGeoJsonCached`, so the branch is never entered.
2. `installHttp`'s default for an unrouted URL is a **503**
   (`scripts/probe-payload-resilience.js:3299`), which takes the *non-2xx*
   branch instead. That branch IS pinned (mutation M3 turned it RED).

So the suite covers the non-2xx half of the hard-failure path and not the
network-error half.

## Why this is debt, not a live defect

The code at HEAD is **correct** by source read — the network-error branch does
set `failed: true` and does log (`node_helper.js:3990/:4000/:4026/:4079`), and
all 25 call sites consume the flag. Nothing is broken today. What is missing is
the guard that would catch it breaking later.

It matters more than a typical coverage gap because this is the exact branch
**CR-03** was raised about: the dominant real-world ERO failure mode is a
network/DNS error, and the original defect was that it degraded *invisibly*.
A silent regression here reproduces a false all-clear — the one outcome this
module exists to prevent.

## Fix

Add a probe scenario whose stub makes `helper._fetch` itself **reject** (rather
than throwing higher up, and rather than returning a 503), then assert both
halves of the contract: `failed: true` propagates, and the degrade is visible
(`anyStale` set / `Log.error` emitted). Mutation-prove it per D-10: drop the
`failed` flag on the network-error branch, confirm RED with a diagnosable
message, restore.

## Evidence

`.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-VERIFICATION.md`
— mutation table, row M4.
