#!/usr/bin/env node
// Usage: node hazards-at.js <lat> <lon>
// Prints every live Hazards Outlook feature containing the point, with the day
// offsets the module will compute against today's UTC date.
const { PRODUCT_REGISTRY } = require(require('path').resolve(__dirname, '..', 'productRegistry.js'));
const row = PRODUCT_REGISTRY.hazardsOutlook;
const [lat, lon] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) { console.error('usage: node hazards-at.js <lat> <lon>'); process.exit(1); }
const rc=(r,x,y)=>{let i2=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))i2=!i2;}return i2;};
const pc=(p,x,y)=>{if(!rc(p[0],x,y))return false;for(let k=1;k<p.length;k++)if(rc(p[k],x,y))return false;return true;};
const gc=(g,x,y)=>!g?false:g.type==='Polygon'?pc(g.coordinates,x,y):g.type==='MultiPolygon'?g.coordinates.some(p=>pc(p,x,y)):false;
const n=new Date(), today=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate());
const off=t=>Math.round((t-today)/86400000), iso=t=>new Date(t).toISOString().slice(0,10);
const DROUGHT=new Set(row.droughtLabels), EXCL=new Set(row.excludedLabels);
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
    const gate = EXCL.has(h.label)?'  [EXCLUDED — never renders]'
               : DROUGHT.has(h.label)?'  [drought-gated — hidden unless showDrought:true]':'';
    const route = h.L.group==='precipitation' ? 'per-day grid' : 'window band';
    const mapped = Object.prototype.hasOwnProperty.call(row.displayColor,h.label);
    console.log(`  L${h.L.id} ${h.L.group.padEnd(15)} "${h.label}" ${h.sd}..${h.ed}  D${h.s}${h.s===h.e?'':'–'+h.e}  -> ${route}  color=${mapped?'#'+row.displayColor[h.label]:'#'+row.defaultColor+' (UNMAPPED)'}  filed ${h.age}h ago${gate}`);
  }
  const maxAge=Math.max(...hits.map(h=>Number(h.age)));
  console.log(`  freshness: oldest contributing idp_filedate ${maxAge}h vs ${row.maxDataAgeHours}h threshold -> ${maxAge>row.maxDataAgeHours?'STALE (warning expected)':'fresh (no warning)'}`);
})();
