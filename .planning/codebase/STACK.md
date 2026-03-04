# Technology Stack

**Analysis Date:** 2026-03-04

## Languages

**Primary:**
- JavaScript (ES6+) - Frontend module and node helper logic
- Node.js - Server-side runtime for weather data processing

**Secondary:**
- HTML/CSS - UI rendering via MagicMirror module API

## Runtime

**Environment:**
- Node.js (version not specified in package.json)

**Package Manager:**
- npm
- Lockfile: Not detected

## Frameworks

**Core:**
- MagicMirror² - Framework for the module system (not declared as dependency, assumed host framework)

**Build/Dev:**
- ESLint 9.24.0 - Code linting
- TypeScript ESLint 8.30.1 - ESLint plugin for TypeScript support
- ESLint globals 16.0.0 - Global variable definitions for linting

## Key Dependencies

**Critical:**
- `@turf/turf` 7.2.0 - Geospatial analysis and point-in-polygon calculations
- `@xmldom/xmldom` 0.9.8 - XML/KML document parsing for weather data
- `@tmcw/togeojson` 7.1.0 - KML to GeoJSON conversion for SPC outlook polygons
- `xpath` 0.0.34 - XPath querying for KML document navigation

**Infrastructure:**
- `node-fetch` 2.6.1 - HTTP client for fetching weather data from NOAA SPC APIs
- `adm-zip` 0.5.16 - ZIP file extraction for KMZ (zipped KML) file handling
- `weather-icons` 1.3.2 - Icon fonts for weather visualization (tornado, hail, wind)

## Configuration

**Environment:**
- No `.env` file detected - Configuration via MagicMirror module config object
- Module accepts configuration parameters: `lat`, `lon`, `extended`, `updateInterval`

**Build:**
- No build configuration detected (plain JavaScript, no transpilation)
- ESLint configuration not present in repo (devDependencies suggest linting is available but config not committed)

## Platform Requirements

**Development:**
- Node.js (version unspecified)
- npm
- MagicMirror² host instance

**Production:**
- MagicMirror² running on a compatible system (typically Raspberry Pi or Linux-based display)
- Network access to NOAA SPC endpoints: `https://www.spc.noaa.gov/products/`

## External API Endpoints

**NOAA SPC Convective Outlooks:**
- Day 1-2 categorical: `https://www.spc.noaa.gov/products/outlook/day[1-2]otlk_cat.lyr.geojson`
- Day 1-2 tornado: `https://www.spc.noaa.gov/products/outlook/day[1-2]otlk_torn.lyr.geojson`
- Day 1-2 hail: `https://www.spc.noaa.gov/products/outlook/day[1-2]otlk_hail.lyr.geojson`
- Day 1-2 wind: `https://www.spc.noaa.gov/products/outlook/day[1-2]otlk_wind.lyr.geojson`
- Day 3 categorical: `https://www.spc.noaa.gov/products/outlook/day3otlk_cat.lyr.geojson`
- Day 3 probability: `https://www.spc.noaa.gov/products/outlook/day3otlk_prob.lyr.geojson`
- Day 3 significant probability: `https://www.spc.noaa.gov/products/outlook/day3otlk_sigprob.lyr.geojson`
- Day 4-8 probability: `https://www.spc.noaa.gov/products/exper/day4-8/day[4-8]prob.lyr.geojson`
- Mesoscale Discussion active: `https://www.spc.noaa.gov/products/md/ActiveMD.kmz`

---

*Stack analysis: 2026-03-04*
