# Milestones

## v1.1 Fire Wx Outlook Expansion (Shipped: 2026-03-21)

**Phases completed:** 3 phases, 3 plans, 6 tasks

**Key accomplishments:**

- All 12 Day 3-8 SPC categorical fire weather GeoJSON endpoints confirmed HTTP 200; DN=5/8/10 parse strategy required (LABEL contains day identifier "D3"/"D6", not risk level)
- Day 3-8 fire weather fetch loop added to getSpcOutlook() using DN-based parsing via exper/fire_wx windrhcat/drytcat endpoints, populating day3Risk-day8Risk in both fireWeather return paths
- Day 3-8 fire weather rows added to getDom() with per-day conditional rendering and extended no-risk guard covering all 8 fire weather days

---

## v1.0 Refactor and Feature Update (Shipped: 2026-03-12)

**Phases completed:** 7 phases, 13 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---
