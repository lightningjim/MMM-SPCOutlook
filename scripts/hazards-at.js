#!/usr/bin/env node
// Usage: node hazards-at.js <lat> <lon>
// Prints every live Hazards Outlook feature containing the point, with the day
// offsets the module will compute against today's UTC date.
const { PRODUCT_REGISTRY, hazardLabelKey } = require(require('path').resolve(__dirname, '..', 'productRegistry.js'));
const row = PRODUCT_REGISTRY.hazardsOutlook;
const [lat, lon] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) { console.error('usage: node hazards-at.js <lat> <lon>'); process.exit(1); }
const rc=(r,x,y)=>{let i2=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))i2=!i2;}return i2;};
const pc=(p,x,y)=>{if(!rc(p[0],x,y))return false;for(let k=1;k<p.length;k++)if(rc(p[k],x,y))return false;return true;};
const gc=(g,x,y)=>!g?false:g.type==='Polygon'?pc(g.coordinates,x,y):g.type==='MultiPolygon'?g.coordinates.some(p=>pc(p,x,y)):false;
const n=new Date(), today=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate());
const off=t=>Math.round((t-today)/86400000), iso=t=>new Date(t).toISOString().slice(0,10);
// WR-02: gate on the registry's own FOLDED keys, exactly as node_helper does. Comparing
// the raw upstream label meant this script reported "renders" for `"Flooding Likely "` or
// `"flooding likely"` — the same bypass the module itself had, reproduced in the tool an
// operator uses to confirm the module is right.
const DROUGHT=row.droughtLabelKeys, EXCL=row.excludedLabelKeys;
// 16-REVIEW WR-08: reproduce the module's ACTUAL routing decision instead of guessing it
// from the layer group. Production routes a Precipitation feature to the WINDOW BAND when
// _isFullNominalWindow(offsetStart, offsetEnd, layer.dayRange) holds — D-04's guard, the
// locked exact-alignment reading — so for the one Precipitation case D-04 singles out, the
// old `group==='precipitation' ? 'per-day grid' : 'window band'` told the operator
// "per-day grid" while the module rendered a band entry. It also ignored the day-grid
// clamp, reporting a Precipitation feature at D0-D2 or past the last day as reaching the
// grid when it reaches nothing at all.
//
// Both bounds come from the registry (`row.dayRangeTotal` is derived from the layers'
// own dayRange values), so a span change cannot leave a stale literal here.
const [FIRST_DAY, LAST_DAY] = row.dayRangeTotal;
const nominal = (s, e, [a, b]) => s === a && e === b;   // mirrors _isFullNominalWindow
(async()=>{
  const hits=[];
  for(const L of row.layers){
    const gj=await (await fetch(row.buildUrl(L.id))).json();
    for(const f of (gj.features||[])){
      if(!gc(f.geometry,lon,lat))continue;
      const p=f.properties||{};
      hits.push({L,label:p.label,s:off(p.start_date),e:off(p.end_date),sd:iso(p.start_date),ed:iso(p.end_date),
        age:((Date.now()-p.idp_filedate)/3600000).toFixed(1)});
    }
  }
  console.log(`Live Hazards Outlook at lat ${lat}, lon ${lon}  (today = ${iso(today)} UTC)`);
  if(!hits.length){console.log('  (nothing — module renders no "Extended Hazards:" heading at all)');return;}
  hits.sort((a,b)=>a.s-b.s||a.e-b.e);
  for(const h of hits){
    const key = hazardLabelKey(h.label);
    const gate = EXCL.has(key)?'  [EXCLUDED — never renders]'
               : DROUGHT.has(key)?'  [drought-gated — hidden unless showDrought:true]':'';
    // WR-08: non-precipitation routes to the band unconditionally (HAZ-02); precipitation
    // routes to the band only on exact alignment to its layer's nominal window (D-04), and
    // otherwise to the day grid, where _bucketHazardMatch clamps it to the row's span.
    const route = (h.L.group!=='precipitation' || nominal(h.s,h.e,h.L.dayRange))
      ? 'window band'
      : (h.e<FIRST_DAY || h.s>LAST_DAY
          ? `per-day grid (clamped out of D${FIRST_DAY}-${LAST_DAY} — renders nothing)`
          : 'per-day grid');
    const mapped = Object.prototype.hasOwnProperty.call(row.displayColor,h.label);
    console.log(`  L${h.L.id} ${h.L.group.padEnd(15)} "${h.label}" ${h.sd}..${h.ed}  D${h.s}${h.s===h.e?'':'–'+h.e}  -> ${route}  color=${mapped?'#'+row.displayColor[h.label]:'#'+row.defaultColor+' (UNMAPPED)'}  filed ${h.age}h ago${gate}`);
  }
  const maxAge=Math.max(...hits.map(h=>Number(h.age)));
  console.log(`  freshness: oldest contributing idp_filedate ${maxAge}h vs ${row.maxDataAgeHours}h threshold -> ${maxAge>row.maxDataAgeHours?'STALE (warning expected)':'fresh (no warning)'}`);
})();
