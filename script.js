/* PhysLab - script.js
   Plain JavaScript, no libraries. Sections, in order:
   1. PHYSICS         formulas only (no screen code)          -> P, n(), f()
   2. HELPERS         number reading, safe HTML, CSV text
   3. SAVING          localStorage (key "physlab:v1")          -> STORE, saveStore(), setReadings()
   4. TABLE ENGINE    editable observation tables              -> Tbl()
   5. GRAPH DRAWING   small canvas chart (works offline)       -> MiniChart, Chart_()
   6. PRACTICALS      laser(), diode(), hall(), fibre()
   7. GRAPH ANALYZER  analyzer()
   8. ROUTER          home page, navigation, startup
   Camera/photo import (future): keep it in its own new section and hand the confirmed values to setReadings().
   Never put an API key in this file; a key must stay on a server. */
// ===== PHYSICS (independent of UI) =====
const E=1.602176634e-19;
const P={
 laser:(w1,w2,Dcm)=>{if(![w1,w2,Dcm].every(isFinite))return{e:'Enter w₁, w₂ and D'};if(w1<=0||w2<=0)return{e:'Spot diameters must be greater than 0'};if(Dcm<=0)return{e:'D must be > 0'};if(w2<w1)return{e:'w₂ must be ≥ w₁ (screen moved away)'};return{v:Math.sqrt(w2*w2-w1*w1)/(Dcm*10)*1000}}, // mrad, w mm, D cm
 slope0:(xs,ys)=>{let a=0,b=0;xs.forEach((x,i)=>{a+=x*ys[i];b+=x*x});return b>0?a/b:NaN}, // least squares through origin
 dyn:(V1,I1mA,V2,I2mA)=>{if(![V1,I1mA,V2,I2mA].every(isFinite))return{e:'Select two complete readings'};const dI=(I2mA-I1mA)/1000;const dV=V2-V1;if(dI===0)return{e:'ΔI = 0: choose points with different currents'};if(dV===0)return{e:'ΔV = 0: choose points with different voltages'};const v=dV/dI;if(v<0)return{e:'ΔV and ΔI have opposite signs: check the readings'};return{v,dI}},
 stat:(V,I_mA)=>I_mA>0&&V>=0?V/(I_mA/1000):NaN, // static resistance V/I in ohm (I converted mA -> A)
 na:(Hd,Vd,d)=>{if(![Hd,Vd,d].every(isFinite))return{e:'Enter Hd, Vd and d'};if(Hd<=0||Vd<=0||d<=0)return{e:'Values must be > 0'};const X=(Hd+Vd)/4,NA=X/Math.sqrt(X*X+d*d);return{X,NA,i:Math.asin(NA)*180/Math.PI}},
 carrier:RH=>({RH,conc:1/(Math.abs(RH)*E),type:RH>0?'holes':'electrons'}), // R_H = 1/(pe) for holes (>0), -1/(ne) for electrons (<0)
 // sgn = +1 if a positive V_H reading means holes, -1 if it means electrons (depends on meter wiring). Slope may be negative.
 hallA:(m,B_G,t_mm,sgn=1)=>{const B=B_G*1e-4,t=t_mm*1e-3;if(!(t>0))return{e:'Enter specimen thickness t (> 0)'};if(!isFinite(m))return{e:'Need at least 2 valid points'};if(m===0)return{e:'Slope is zero: V_H does not change with I'};return P.carrier(sgn*(m*1e3)*t/B)}, // m = dVH(V)/dI(mA); x1e3 -> V/A; R_H = m t / B
 hallB:(m,I_mA,t_mm,sgn=1)=>{const I=I_mA*1e-3,t=t_mm*1e-3;if(!(t>0))return{e:'Enter specimen thickness t (> 0)'};if(!isFinite(m))return{e:'Need at least 2 valid points'};if(m===0)return{e:'Slope is zero: V_H does not change with B'};return P.carrier(sgn*(m*1e4)*t/I)} // m = dVH(V)/dB(G); x1e4 -> V/T; R_H = m t / I
};
const NUM=/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/; // plain decimal numbers only: blank, spaces, hex, text -> NaN (never 0)
const n=v=>{if(v==null)return NaN;const t=String(v).trim();return NUM.test(t)?+t:NaN};
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); // for any user text placed in HTML
const csvCell=v=>{let x=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(x)&&!NUM.test(x.trim()))x="'"+x;return /[",\r\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}; // RFC4180 quoting + spreadsheet-formula guard
const csvLine=a=>a.map(csvCell).join(',');
const f=(x,d=4)=>isFinite(x)?String(+x.toPrecision(d)):'—';
const ex=x=>isFinite(x)?x.toExponential(3):'—';
const $=(s,r=document)=>r.querySelector(s);
// Laser helpers. D = |x2 - x1| (cm) when both screen positions are recorded; older D-only rows keep their typed D.
const pz=v=>v>=0?v:NaN; // negative or missing -> NaN (never plotted)
P.autoD=r=>{const a=n(r.x1),b=n(r.x2);return isFinite(a)&&isFinite(b)?Math.abs(b-a):NaN};
P.laserRow=r=>{const h1=isFinite(n(r.x1)),h2=isFinite(n(r.x2));let D=n(r.D);if(h1!==h2)return{e:'Enter both x₁ and x₂, or leave both blank and enter D'};if(h1){if(n(r.x1)<0||n(r.x2)<0)return{e:'Screen positions cannot be negative'};D=P.autoD(r)}const q=P.laser(n(r.w1),n(r.w2),D);return q.e?q:{v:q.v,D}};
// ===== TABLE ENGINE =====
// ===== Persistence: one versioned localStorage key; only this key is ever read or written =====
const SKEY='physlab:v1',ALLOWED={lt:['x1','w1','x2','w2','D'],dt:['V','I'],hta:['I','VH'],htb:['MC','B','VH'],ft:['Hd','Vd','d']},RESET={laser:['lt'],diode:['dt'],hall:['hta','htb'],fibre:['ft']};
const STORE={tables:{},hallT:'',conv:'h'};let storageOK=true;
// Keeps only the expected columns, as short text values (used for saved data and for any future imported readings).
function cleanRows(tableId,rows){
 const out=rows.slice(0,200).filter(r=>r&&typeof r==='object').map(r=>{const clean={};ALLOWED[tableId].forEach(col=>{let v=r[col];if(typeof v==='number'&&isFinite(v))v=String(v);if(typeof v==='string'&&v.length<=24)clean[col]=v});return clean});
 if(!out.length)out.push({});return out}
(function load(){let raw=null;try{raw=localStorage.getItem(SKEY)}catch(e){storageOK=false;return}if(!raw)return;let o;try{o=JSON.parse(raw)}catch(e){return} // corrupted JSON: ignore, start fresh
 if(!o||o.v!==1||typeof o.tables!=='object'||!o.tables)return;
 Object.keys(ALLOWED).forEach(k=>{if(Array.isArray(o.tables[k]))STORE.tables[k]=cleanRows(k,o.tables[k])});
 if(typeof o.hallT==='string'&&o.hallT.length<=24)STORE.hallT=o.hallT;if(o.conv==='e')STORE.conv='e'})();
// FUTURE HOOK (not used yet): a later photo/camera import can call setReadings('lt', [{x1:'50',w1:'1.0',...}]) AFTER the student
// has confirmed the extracted values. It validates and saves the rows, then the page is redrawn so tables, graphs and the
// Graph Analyzer update by themselves. Table ids: lt (laser), dt (diode), hta / htb (Hall), ft (fibre).
function setReadings(tableId,rows){if(!ALLOWED[tableId]||!Array.isArray(rows))return false;const list=DATA[tableId]||(DATA[tableId]=[]);list.length=0;list.push(...cleanRows(tableId,rows));saveStore();route();return true}
function saveStore(){if(!storageOK)return;try{localStorage.setItem(SKEY,JSON.stringify({v:1,tables:STORE.tables,hallT:STORE.hallT,conv:STORE.conv}))}catch(e){storageOK=false;storeNote()}}
function storeNote(){const el=document.getElementById('snote');if(el)el.textContent=storageOK?'':' Saving is not available in this browser, so readings will be lost when the page is closed.'}
const DATA=STORE.tables,AUTO=new WeakSet();storeNote();
const MIN0=new Set(['x1','w1','x2','w2','D','V','I','MC','B','Hd','Vd','d']); // measurements that cannot be negative (V_H may be negative)
const badCell=(c,v)=>v!==''&&v!=null&&c&&(!isFinite(n(v))||(MIN0.has(c.k)&&n(v)<0)); // AUTO marks rows whose auto-calculated column (e.g. D) was filled by the app, not typed by the user // shared row store so the Graph Analyzer edits the same tables as the practicals
function Tbl(host,cols,cb,sample,rows0=4,key){
 key=key||host.id;let rows=DATA[key]||Array.from({length:rows0},()=>({}));DATA[key]=rows;
 const T={rows,render,refresh};
 function render(){
  host.innerHTML='<div class="tw"><table><tr><th>Sr.</th>'+cols.map(c=>`<th>${c.h}</th>`).join('')+'<th></th></tr>'+
  T.rows.map((r,i)=>`<tr><td>${i+1}</td>`+cols.map(c=>c.out?`<td class="o" data-o="${i}-${c.k}"></td>`:`<td><input inputmode="decimal"${badCell(c,r[c.k])?' class="bad"':''} data-i="${i}" data-k="${c.k}" value="${esc(r[c.k]??'')}"></td>`).join('')+`<td><button data-d="${i}" title="Delete row">✕</button></td></tr>`).join('')+'</table></div>'+
  '<p><button data-a="add">+ Add row</button> <button data-a="rst">Reset table</button> '+(sample?'<button data-a="smp">Load sample</button>':'')+'</p>'+(sample?'<p class="mut">Sample = illustrative sample readings — replace with your actual laboratory observations.</p>':'');
  refresh();
 }
 function refresh(){T.rows.forEach((r,i)=>cols.filter(c=>c.auto).forEach(c=>{const v=c.auto(r),el=host.querySelector(`[data-i="${i}"][data-k="${c.k}"]`);if(isFinite(v)){r[c.k]=String(+v.toPrecision(10));AUTO.add(r);if(el){el.value=r[c.k];el.readOnly=true}}else{if(AUTO.has(r)){r[c.k]='';AUTO.delete(r);if(el)el.value=''}if(el)el.readOnly=false}}));T.rows.forEach((r,i)=>cols.filter(c=>c.out).forEach(c=>{const el=host.querySelector(`[data-o="${i}-${c.k}"]`);if(el)el.textContent=c.out(r)}));saveStore();cb&&cb(T.rows)}
 host.addEventListener('input',e=>{const t=e.target;if(t.dataset.i!=null){T.rows[t.dataset.i][t.dataset.k]=t.value;t.classList.toggle('bad',badCell(cols.find(c=>c.k==t.dataset.k),t.value));refresh()}});
 host.addEventListener('click',e=>{const t=e.target;if(t.dataset.d!=null){T.rows.splice(+t.dataset.d,1);if(!T.rows.length)T.rows.push({});render()}
  else if(t.dataset.a=='add'){T.rows.push({});render()}
  else if(t.dataset.a=='rst'){if(!confirm('Delete all readings in this table? This cannot be undone.'))return;T.rows.length=0;for(let i=0;i<rows0;i++)T.rows.push({});render()}
  else if(t.dataset.a=='smp'){if(T.rows.some(r=>Object.keys(r).some(k=>r[k]!==''))&&!confirm('Replace your current readings with the sample readings?'))return;T.rows.length=0;sample.forEach(s=>T.rows.push({...s}));render()}});
 host.addEventListener('keydown',e=>{const t=e.target;if(e.key!=='Enter'||t.dataset.i==null)return;e.preventDefault();const i=+t.dataset.i+1;if(i>=T.rows.length){T.rows.push({});render()}const nx=host.querySelector(`[data-i="${i}"][data-k="${t.dataset.k}"]`);if(nx)nx.focus()}); // Enter = next row, same column (adds a row at the end)
 host.addEventListener('focusin',e=>{if(e.target.dataset&&e.target.dataset.i!=null&&e.target.select)e.target.select()});
 T.set=(i,k,v)=>{while(T.rows.length<=i)T.rows.push({});T.rows[i][k]=v;render()};
 return T}
// ===== MiniChart: dependency-free canvas scatter/line renderer (replaces Chart.js; no network needed) =====
const nice=r=>{const e=Math.pow(10,Math.floor(Math.log10(r))),q=r/e;return(q<1.5?1:q<3?2:q<7?5:10)*e};
function axTicks(a,b){if(a===b){const p=Math.abs(a)*.1||1;a-=p;b+=p}const st=nice((b-a)/5),t=[];for(let i=Math.floor(a/st+1e-9);i<=Math.ceil(b/st-1e-9);i++)t.push(+(i*st).toPrecision(12));return t}
class MiniChart{
 constructor(cv,sets,xl,yl){if(!cv||!cv.getContext||!cv.getContext('2d'))throw new Error('no canvas');this.cv=cv;this.data={datasets:sets};this.options={scales:{x:{title:{text:xl}},y:{title:{text:yl}}}};if(window.ResizeObserver)new ResizeObserver(()=>this.update()).observe(cv.parentNode);this.update()}
 resize(){this.update()}
 toBase64Image(){return this.cv.toDataURL('image/png')}
 update(){
  const cv=this.cv,box=cv.parentNode,W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
  const dpr=window.devicePixelRatio||1;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const c=cv.getContext('2d'),cs=getComputedStyle(document.documentElement),ink=(cs.getPropertyValue('--ink')||'#000').trim(),bd=(cs.getPropertyValue('--bd')||'#ccc').trim();
  c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle=(cs.getPropertyValue('--pn')||'#fff').trim();c.fillRect(0,0,W,H);c.font='12px system-ui,sans-serif';
  const sets=this.data.datasets,ok=p=>isFinite(p.x)&&isFinite(p.y),all=[].concat(...sets.map(s=>s.data.filter(ok)));
  if(!all.length){c.fillStyle=ink;c.textAlign='center';c.fillText('No valid data to plot yet — enter complete readings.',W/2,H/2);return}
  const xt=axTicks(Math.min(...all.map(p=>p.x)),Math.max(...all.map(p=>p.x))),yt=axTicks(Math.min(...all.map(p=>p.y)),Math.max(...all.map(p=>p.y))),fmt=v=>String(+v.toPrecision(6));
  const named=sets.filter(s=>s.data.length&&s.label),legend=named.length>1,lw=Math.max(...yt.map(v=>c.measureText(fmt(v)).width)),L=lw+44,R=14,T=legend?30:14,B=46;
  const x0=xt[0],x1=xt[xt.length-1],y0=yt[0],y1=yt[yt.length-1],X=v=>L+(v-x0)/(x1-x0||1)*(W-L-R),Y=v=>H-B-(v-y0)/(y1-y0||1)*(H-B-T);
  c.strokeStyle=bd;c.fillStyle=ink;c.lineWidth=1;c.textAlign='center';
  xt.forEach(v=>{c.beginPath();c.moveTo(X(v),T);c.lineTo(X(v),H-B);c.stroke();c.fillText(fmt(v),X(v),H-B+16)});
  c.textAlign='right';yt.forEach(v=>{c.beginPath();c.moveTo(L,Y(v));c.lineTo(W-R,Y(v));c.stroke();c.fillText(fmt(v),L-6,Y(v)+4)});
  c.strokeStyle=ink;c.strokeRect(L,T,W-L-R,H-B-T);c.textAlign='center';c.fillText(this.options.scales.x.title.text||'',(L+W-R)/2,H-8);
  c.save();c.translate(14,(T+H-B)/2);c.rotate(-Math.PI/2);c.fillText(this.options.scales.y.title.text||'',0,0);c.restore();
  
  sets.forEach(s=>{const d=s.data.filter(ok);c.strokeStyle=c.fillStyle=s.borderColor;c.lineWidth=2;if(s.showLine&&d.length>1){c.beginPath();d.forEach((p,i)=>i?c.lineTo(X(p.x),Y(p.y)):c.moveTo(X(p.x),Y(p.y)));c.stroke()}if(s.pointRadius>0)d.forEach(p=>{c.beginPath();c.arc(X(p.x),Y(p.y),s.pointRadius,0,7);c.fill();c.save();c.strokeStyle='#ffffff';c.lineWidth=1.5;c.stroke();c.restore()})});
  if(legend){let lx=L;c.textAlign='left';named.forEach(s=>{c.fillStyle=s.borderColor;c.fillRect(lx,10,12,8);c.fillStyle=ink;c.fillText(s.label,lx+16,18);lx+=c.measureText(s.label).width+34})}
 }
}
function Chart_(id,xl,yl,sets){const cv=document.getElementById(id);try{return new MiniChart(cv,sets,xl,yl)}catch(e){if(cv&&cv.parentNode)cv.parentNode.innerHTML='<p class="er">The graph could not be drawn because this browser does not support canvas. Tables and calculations still work.</p>';return{data:{datasets:sets},options:{scales:{x:{title:{}},y:{title:{}}}},update(){},resize(){},toBase64Image(){return ''}}}}
const ds=(label,color,line=true)=>({label,data:[],borderColor:color,backgroundColor:color,showLine:line,pointRadius:line?4:4,borderWidth:2,tension:0})
// ===== PAGE SKELETON =====
const PR={laser:'Laser Beam Divergence',diode:'PN Junction Diode',hall:'Hall Effect',fibre:'Optical Fibre NA'};
function shell(id,aim,theory,formulas,sim,data,viva){return `<h1>${PR[id]}</h1>
<div class="tabs" data-id="${id}"><button class="on" data-p="t">Theory</button><button data-p="s">Simulator</button><button data-p="d">Data & Graph</button><button data-p="v">Viva</button></div>
<div class="pane on" data-p="t"><div class="pn"><h2>Aim</h2>${aim}</div><div class="pn"><h2>Concept</h2>${theory}</div><div class="pn"><h2>Formulae</h2>${formulas}</div></div>
<div class="pane" data-p="s">${sim}</div><div class="pane" data-p="d">${data}</div>
<div class="pane" data-p="v"><div class="pn">${viva}</div></div><p class="rst"><button data-rst="${id}">Reset this experiment…</button></p>`}
const vq=a=>a.length?a.map(([q,s])=>`<details><summary>${q}</summary><p>${s}</p></details>`).join(''):'<p class="mut">The practical sheet lists no review questions for this experiment, so none are added.</p>';
const cur={};
// ===== LASER =====
function laser(){
 const h=shell('laser','To determine the divergence of a laser beam.',
 '<p>Conventional sources spread light in all directions; a laser beam is highly directional but still diverges slightly (diffraction). A screen is placed at two positions: spot diameter w₁ at the first, w₂ at the second, separated by distance D. Apparatus: laser source, cardboard/screen, stand, scale.</p><p><b>Procedure (from sheet):</b> screen about 50 cm away → measure w₁; move to about 100 cm → measure w₂; measure D; repeat three times at different positions; calculate θ₀.</p>',
 '<div class="fm">θ₀ = √(w₂² − w₁²) / D</div><p class="mut">w₁, w₂ = spot diameters at the two positions, D = distance between the positions. Units here: w in mm, D in cm (converted internally), θ₀ in milliradians.</p><p class="mut">The minus sign inside the square root is used, as confirmed. This is the formula on your practical sheet; beam divergence is also often written (w₂ − w₁)/D, so check with your teacher if your lab expects that form.</p>',
 `<div class="pn"><svg id="lsv" class="sim" viewBox="0 0 600 230"></svg>
 <p><label>x₁ (cm)<input id="lx1" inputmode="decimal"></label><label>w₁ (mm)<input id="lw1" inputmode="decimal"></label><label>x₂ (cm)<input id="lx2" inputmode="decimal"></label><label>w₂ (mm)<input id="lw2" inputmode="decimal"></label><label>D (cm) — auto from x₁, x₂<input id="lD" inputmode="decimal"></label></p>
 <p class="mut">These inputs edit reading 1 of the observation table. Beam is drawn to scale for the entered values.</p><div id="lcalc"></div></div>`,
 `<div class="pn"><div id="lt"></div></div><div class="pn"><div class="cv"><canvas id="lch"></canvas></div></div><div class="pn"><h2>Result</h2><div id="lres"></div></div>`,vq([]));
 return{h,init(){
  const cols=[{k:'x1',h:'x₁ (cm)'},{k:'w1',h:'w₁ (mm)'},{k:'x2',h:'x₂ (cm)'},{k:'w2',h:'w₂ (mm)'},{k:'D',h:'D (cm) = |x₂−x₁|',auto:P.autoD},{k:'th',h:'θ₀ (mrad)',out:r=>{const q=P.laserRow(r);return q.e?'—':f(q.v)}}];
  const smp=[{x1:'50',w1:'1.0',x2:'100',w2:'1.6'},{x1:'60',w1:'1.2',x2:'120',w2:'2.1'},{x1:'70',w1:'1.5',x2:'140',w2:'2.6'}];
  const ch=Chart_('lch','Reading no.','θ₀ (mrad)',[ds('θ₀','#073B4C',false),ds('Mean θ₀','#EF476F')]);
  const T=Tbl($('#lt'),cols,rows=>{
   const vals=rows.map(r=>P.laserRow(r));const ok=vals.map((q,i)=>q.v!=null?{x:i+1,y:q.v}:null).filter(Boolean);
   const mean=ok.length?ok.reduce((a,b)=>a+b.y,0)/ok.length:NaN;
   ch.data.datasets[0].data=ok;ch.data.datasets[1].data=ok.length?[{x:1,y:mean},{x:rows.length,y:mean}]:[];ch.update();
   $('#lres').innerHTML=ok.length?`<div class="res">Mean θ₀ = ${f(mean)} mrad (${ex(mean/1000)} rad) from ${ok.length} valid reading(s)</div><p>The beam spreads by about ${f(mean)} mm for every metre of travel (1 mrad = 1 mm per m). A small value confirms the laser is highly directional.</p>`+vals.map((q,i)=>q.e&&Object.keys(rows[i]).some(k=>rows[i][k]!=='')?`<p class="er">Reading ${i+1}: ${q.e}</p>`:'').join(''):'<p class="mut">Enter w₁, w₂ and D to see the result.</p>';
   const r=rows[0]||{};['x1','w1','x2','w2','D'].forEach(k=>{const el=$('#l'+(k=='D'?'D':k));if(document.activeElement!==el)el.value=r[k]??'';if(k=='D')el.readOnly=AUTO.has(r)});draw(r)},smp);
  $('#lt').previousElementSibling;T.render();cur.laser=ch;
  function draw(r){const w1=n(r.w1),w2=n(r.w2),D=n(r.D);const x1=190,xs=isFinite(D)&&D>0?Math.min(D,100):30,x2=x1+xs*3.6,hh=w=>isFinite(w)?Math.min(Math.max(w*4,2),85):2;
   const a=hh(w1),b=hh(w2),c=115;
   $('#lsv').innerHTML=`<rect x="12" y="${c-12}" width="50" height="24" fill="#073B4C"/><text x="14" y="${c+28}">Laser</text>
   <polygon points="62,${c-2} ${x1},${c-a} ${x2},${c-b} ${x2},${c+b} ${x1},${c+a} 62,${c+2}" fill="#EF476F" opacity=".35"/>
   <line x1="62" x2="${x2+10}" y1="${c}" y2="${c}" stroke="#EF476F" stroke-dasharray="4 3"/>
   <line x1="${x1}" x2="${x1}" y1="20" y2="210" stroke="#4B6272" stroke-width="3"/><line x1="${x2}" x2="${x2}" y1="20" y2="210" stroke="#4B6272" stroke-width="3"/>
   <ellipse cx="${x1}" cy="${c}" rx="3" ry="${a}" fill="#EF476F"/><ellipse cx="${x2}" cy="${c}" rx="3" ry="${b}" fill="#EF476F"/>
   <text x="${x1-24}" y="14">Screen 1</text><text x="${x2-24}" y="14">Screen 2</text>
   <text x="${x1+4}" y="${c-a-4}">w₁=${f(w1)}</text><text x="${x2-60}" y="${c-b-4}">w₂=${f(w2)}</text>
   <line x1="${x1}" x2="${x2}" y1="218" y2="218" stroke="#073B4C"/><text x="${(x1+x2)/2-20}" y="228">D=${f(D)} cm</text>`;
   const q=P.laser(w1,w2,D);$('#lcalc').innerHTML=q.e?`<p class="er">${q.e}</p>`:`<p class="mut">θ₀ = √(${f(w2)}² − ${f(w1)}²) / (${f(D*10)} mm) = ${f(q.v/1000)} rad = <b>${f(q.v)} mrad</b></p>`}
  ['x1','w1','x2','w2','D'].forEach(k=>$('#l'+(k=='D'?'D':k)).addEventListener('input',e=>{T.rows[0][k]=e.target.value;T.refresh();const el=$('#lt');el.querySelectorAll(`input[data-i="0"][data-k="${k}"]`).forEach(i=>i.value=e.target.value)}));
 }}}
// ===== DIODE =====
function diode(){
 const h=shell('diode','To study the characteristics of a PN junction diode.',
 '<p>When p-type and n-type semiconductors are joined, holes and electrons diffuse across the junction, leaving a depletion region with a potential barrier that stops further diffusion. Forward bias lowers the barrier and current rises rapidly; reverse bias widens the depletion region and only a very small leakage current flows. Apparatus: PN diode kit (IN4007, 470 Ω), multimeter, connecting wires, power supply.</p><p><b>Procedure:</b> forward-bias circuit (0–2 V supply), increase voltage in steps of 0.05 V, note the current, tabulate, plot V on x and I on y, find slope and dynamic resistance. Reverse bias circuit uses 0–15 V and a µA meter.</p>',
 '<div class="fm">R<sub>D</sub> = ΔV / ΔI</div><p class="mut">Current in the table is in mA and is converted to A before computing R<sub>D</sub> in Ω.</p>',
 `<div class="pn"><svg id="dsv" class="sim" viewBox="0 0 600 220"></svg>
 <p><label>Bias<select id="db"><option value="f">Forward</option><option value="r">Reverse</option></select></label><label>Diode voltage (V)<input id="dv" type="range" min="0" max="1" step="0.01" value="0.5" style="width:180px"></label></p>
 <div id="dout"></div><div class="cv"><canvas id="dsc"></canvas></div><p class="mut"><b>Educational diode model:</b> This simulator uses a simplified diode equation to illustrate the qualitative I–V characteristics. It is not an exact model of the physical 1N4007 diode used in the laboratory.</p><p class="mut">Model: I = I<sub>s</sub>(e^(V/nV<sub>T</sub>) − 1), I<sub>s</sub> = 2 nA, n = 2; reverse mode shows only small leakage (no breakdown). All values on this tab are simulated and are never added to your observation table — use the “Analyze Actual Observations” tab for lab readings.</p></div>`,
 `<div class="pn"><h2>Analyze Actual Observations</h2><p class="mut">Enter your laboratory readings. Only your own entries (or the labelled sample) are plotted here — no simulated model values.</p><div id="dt"></div></div><div class="pn"><div class="cv"><canvas id="dch"></canvas></div></div>
 <div class="pn"><h2>Dynamic resistance</h2><label>Point 1 (Sr.)<select id="dp1"></select></label><label>Point 2 (Sr.)<select id="dp2"></select></label><div id="dres"></div></div>`,vq([]));
 return{h,init(){
  const cols=[{k:'V',h:'Voltage across diode (V)'},{k:'I',h:'Current (mA)'},{k:'Rs',h:'Static R = V/I (Ω)',out:r=>{const v=P.stat(n(r.V),n(r.I));return isFinite(v)?f(v):'—'}}];
  const smp=[0,0.3,0.5,0.55,0.6,0.65,0.7].map(v=>({V:String(v),I:f(1e3*2e-9*(Math.exp(v/0.0517)-1),3)}));
  const ch=Chart_('dch','Voltage across diode V (V)','Current I (mA)',[ds('I–V','#073B4C')]);
  let T,picked=false;const s1=$('#dp1'),s2=$('#dp2'); // picked: user chose points; otherwise default = last two readings
  function sel(rows){const ok=rows.map((r,i)=>isFinite(n(r.V))&&isFinite(n(r.I))?i:-1).filter(i=>i>=0);const o=ok.map(i=>`<option value="${i}">${i+1}</option>`).join('');const a=s1.value,b=s2.value;s1.innerHTML=o;s2.innerHTML=o;if(picked&&a!==''&&ok.includes(+a))s1.value=a;else if(ok.length>1)s1.value=ok[ok.length-2];if(picked&&b!==''&&ok.includes(+b))s2.value=b;else if(ok.length)s2.value=ok[ok.length-1]}
  function rd(){const r=T.rows,i=+s1.value,j=+s2.value;if(!r[i]||!r[j]||i===j){$('#dres').innerHTML='<p class="mut">Need two different complete readings.</p>';return}
   const a=r[i],b=r[j],q=P.dyn(n(a.V),n(a.I),n(b.V),n(b.I));
   $('#dres').innerHTML=q.e?`<p class="er">${q.e}</p>`:`<p class="mut">R<sub>D</sub> = (V₂ − V₁)/(I₂ − I₁) = (${f(n(b.V))} − ${f(n(a.V))}) V / (${f(n(b.I))} − ${f(n(a.I))})×10⁻³ A</p><div class="res">R<sub>D</sub> = ${f(q.v)} Ω</div><p class="mut">Choose points on the steep forward region for a meaningful dynamic resistance; it falls as current rises.</p>`}
  T=Tbl($('#dt'),cols,rows=>{const pts=rows.map(r=>({x:n(r.V),y:n(r.I)})).filter(p=>isFinite(p.x)&&isFinite(p.y)&&p.x>=0&&p.y>=0).sort((a,b)=>a.x-b.x);ch.data.datasets[0].data=pts;ch.update();sel(rows);rd()},smp,5);
  T.render();s1.onchange=s2.onchange=()=>{picked=true;rd()};cur.diode=ch;
  const I=(v,rev)=>rev?-2e-9*(1-Math.exp(-v/0.0517))*1e3*100:1e3*2e-9*(Math.exp(v/0.0517)-1); // mA
  function draw(){const rev=$('#db').value=='r',v=+$('#dv').value,vv=rev?v*15:v;if(rev){$('#dv').max=1}
   const i=I(rev?vv:v,rev),mag=Math.min(Math.abs(i)*(rev?2000:1),1),wd=rev?70:30;
   $('#dsv').innerHTML=`<rect x="60" y="70" width="170" height="70" fill="#FFE29A" stroke="#4B6272"/><text x="120" y="110">P-type</text>
   <rect x="${230+(70-wd)/2*0}" y="70" width="${wd}" height="70" fill="#E3E8EA" opacity=".7"/><text x="${230-6}" y="62">Depletion</text>
   <rect x="${230+wd}" y="70" width="${170-(wd-30)+0}" height="70" fill="#BDEFE1" stroke="#4B6272"/><text x="${260+wd+40}" y="110">N-type</text>
   <polygon points="460,130 460,150 480,140" fill="none" stroke="#073B4C"/><text x="440" y="170">Diode symbol (→ conventional I)</text>
   <text x="62" y="30">${rev?'REVERSE: + to N, − to P':'FORWARD: + to P, − to N'}</text>
   <text x="62" y="200">V = ${f(rev?vv:v,3)} V</text><text x="260" y="200">I = ${rev?f(-i*1000,3)+' µA (leakage)':f(i,3)+' mA'}</text>
   <line x1="30" x2="${30+mag*60+10}" y1="105" y2="105" stroke="#EF476F" stroke-width="${2+mag*8}"/>`;
   $('#dout').innerHTML=`<div class="res">${rev?'Reverse':'Forward'}: V = ${f(rev?vv:v,3)} V → I = ${rev?f(Math.abs(i)*1000,3)+' µA':f(i,3)+' mA'}</div><p class="mut">${rev?'Slider spans 0–15 V. Tiny, nearly constant leakage current.':'Below ~0.5 V almost no current; above it, current rises steeply.'}</p>`}
  const mch=Chart_('dsc','Voltage V (V)','Current I (mA)',[ds('Model curve (simulated)','#073B4C'),ds('Operating point','#EF476F',false)]);mch.data.datasets[0].pointRadius=0;mch.data.datasets[1].pointRadius=7;cur.diode2=mch;
  function simGraph(){const rev=$('#db').value=='r',vmax=rev?15:1,cv=[];for(let k=0;k<=60;k++){const v=vmax*k/60;cv.push({x:rev?-v:v,y:rev?I(v,true)*1000:I(v,false)})}const s=+$('#dv').value,vv=rev?s*15:s;mch.data.datasets[0].data=cv;mch.data.datasets[1].data=[{x:rev?-vv:vv,y:rev?I(vv,true)*1000:I(vv,false)}];mch.options.scales.y.title.text=rev?'Current I (µA) — simulated':'Current I (mA) — simulated';mch.options.scales.x.title.text=rev?'Voltage V (V), reverse bias':'Voltage V (V), forward bias';mch.update()}
  $('#db').onchange=()=>{draw();simGraph()};$('#dv').oninput=()=>{draw();simGraph()};draw();simGraph();
  const dadd=()=>{const rev=$('#db').value=='r';if(rev){alert('The table follows the sheet (forward characteristics). Switch to Forward to add a point.');return}const v=+$('#dv').value;const r=T.rows.findIndex(r=>r.V===''||r.V==null);T.rows.length&&T.rows.splice(r<0?T.rows.length:r,r<0?0:1,{V:String(v),I:f(I(v,false),3)});T.render()};
 }}}
// ===== HALL =====
function hall(){
 const h=shell('hall','To determine hole concentration and Hall coefficient.',
 '<p>If a metal or semiconductor carrying current I is placed in a transverse magnetic field B, an electric field is induced perpendicular to both I and B. The resulting voltage is the Hall voltage V<sub>H</sub>. In the sheet\'s set-up the current flows along +x and B along +z; charge carriers are deflected towards one face, making the upper face positive and the lower negative (for electrons).</p><p><b>Procedure:</b> (1) keep B constant (1000 gauss), vary probe current in 10 mA steps and note V<sub>H</sub>. (2) Keep I = 50 mA, vary B and record V<sub>H</sub>. (3) Plot V<sub>H</sub> (y-axis) against I, and V<sub>H</sub> (y-axis) against B. (4) The graph is a straight line through the origin — find the slope and substitute in the formula.</p>',
 '<div class="fm">V<sub>H</sub> = B I / (p e t)</div><div class="fm">R<sub>H</sub> = 1 / (p e)</div><p class="mut">p = hole concentration (m⁻³), e = 1.602×10⁻¹⁹ C, t = specimen thickness (you must enter it), B in tesla (1 G = 10⁻⁴ T), I in A.</p><p class="mut"><b>Graph axes used:</b> V<sub>H</sub> is on the y-axis in both graphs. Graph 1 (B constant): V<sub>H</sub> vs I, slope m = ΔV<sub>H</sub>/ΔI = B/(p e t), so p = B/(e t m). Graph 2 (I constant): V<sub>H</sub> vs B, slope m = ΔV<sub>H</sub>/ΔB = I/(p e t), so p = I/(e t m). The slope is a least-squares line through the origin, as the sheet says.</p><p class="mut"><b>Sign of R<sub>H</sub> and carrier type:</b> R<sub>H</sub> = 1/(pe) is positive for holes and R<sub>H</sub> = −1/(ne) is negative for electrons, so a negative slope is valid and means negative R<sub>H</sub> (electron carriers) when a positive V<sub>H</sub> reading is taken to mean holes. Which polarity your meter shows depends on how the Hall probes are wired, so choose the matching convention for your kit (check your lab manual). The sign is never forced positive.</p>',
 `<div class="pn"><svg id="hsv" class="sim" viewBox="0 0 600 250"></svg>
 <p><label>I (mA)<input id="hI" value="50" inputmode="decimal"></label><label>B (gauss)<input id="hB" value="1000" inputmode="decimal"></label><label>V<sub>H</sub> (V)<input id="hV" inputmode="decimal"></label></p>
 <p><button id="hadA" class="p">Add to Table 1</button> <button id="hadB" class="p">Add to Table 2</button></p><p class="mut">Arrow sizes follow I and B. The diagram uses the sheet's axes (I along +x, B along +z).</p></div>`,
 `<div class="pn"><label>Specimen thickness t (mm)<input id="ht" inputmode="decimal" placeholder="required"></label><label>V<sub>H</sub> sign convention<select id="hc" style="width:min(100%,290px)"><option value="h">Positive V_H reading = holes (p-type)</option><option value="e">Positive V_H reading = electrons (n-type)</option></select></label><label>View<select id="hm"><option value="A">1: B const.</option><option value="B">2: I const.</option></select></label></div>
 <div class="pn"><h2>1) B = 1000 gauss</h2><div id="hta"></div></div><div class="pn"><h2>2) I = 50 mA</h2><div id="htb"></div></div>
 <div class="pn"><div class="cv"><canvas id="hch"></canvas></div></div><div class="pn"><h2>Result</h2><div id="hres"></div></div>`,
 vq([['How can you identify whether a semiconductor is n-type or p-type?','From the sign of the Hall voltage / Hall coefficient. With the same I and B directions, the polarity of V<sub>H</sub> is opposite for electrons (n-type) and holes (p-type); R<sub>H</sub> is negative for n-type and positive for p-type.'],['Why is the magnetic field kept perpendicular to the current?','The magnetic force F = q(v × B) is maximum when B ⟂ v, giving the largest transverse deflection and Hall voltage.'],['Why does Hall voltage stop increasing after some time?','Charges pile up on the faces until the Hall electric field force qE<sub>H</sub> balances the magnetic force qvB. Then carriers move straight and V<sub>H</sub> becomes steady.'],['Why is Hall voltage larger in semiconductors than in metals?','Since R<sub>H</sub> = 1/(pe) and V<sub>H</sub> = BI/(pet), a lower carrier concentration p gives a larger V<sub>H</sub>. Semiconductors have far fewer carriers than metals.'],['Can Hall voltage exceed the applied voltage across the sample? Why or why not?','In normal conditions no. V<sub>H</sub> comes from the sideways deflection of carriers that drift because of the applied field, and for ordinary fields it is only a small fraction (≈ μB × width/length) of the applied voltage.']]));
 return{h,init(){
  const ch=Chart_('hch','Probe current I (mA)','V_H (V)',[ds('Data','#073B4C',false),ds('Fit through origin','#EF476F')]);
  let TA,TB;
  const calc=()=>{const A=$('#hm').value=='A',T=A?TA:TB;if(!T)return;const xs=[],ys=[];T.rows.forEach(r=>{const x=A?n(r.I):n(r.B),y=n(r.VH);if(isFinite(x)&&isFinite(y)){xs.push(x);ys.push(y)}});
   ch.options.scales.x.title.text=A?'Probe current I (mA)':'Magnetic field B (gauss)';ch.options.scales.y.title.text='V_H (V)';
   ch.data.datasets[0].data=xs.map((x,i)=>({x,y:ys[i]}));const m=xs.length>=2?P.slope0(xs,ys):NaN;const mx=Math.max(0,...xs);
   ch.data.datasets[1].data=isFinite(m)&&mx>0?[{x:0,y:0},{x:mx,y:m*mx}]:[];ch.update();
   const t=n($('#ht').value),sg=$('#hc').value=='e'?-1:1,q=A?P.hallA(m,1000,t,sg):P.hallB(m,50,t,sg);
   $('#hres').innerHTML=`<p>Slope m = ΔV<sub>H</sub>/Δ${A?'I':'B'} = ${f(m)} ${A?'V/mA':'V/gauss'} (${xs.length} points; sign kept as measured)</p>`+(q.e?`<p class="er">${q.e}</p>`:`<p class="mut">R<sub>H</sub> = ${sg<0?'−':''}m·t / ${A?'B':'I'} = ${sg<0?'−':''}${f(A?m*1e3:m*1e4)} ${A?'V/A':'V/T'} × ${f(t)}×10⁻³ m / ${A?'0.1 T':'50×10⁻³ A'}</p><div class="res">R<sub>H</sub> = ${ex(q.RH)} m³/C</div><div class="res">Carrier type: ${q.type=='holes'?'holes (p-type)':'electrons (n-type)'}</div><div class="res">${q.type=='holes'?'Hole concentration p':'Electron concentration n'} = 1/(|R<sub>H</sub>|·e) = ${ex(q.conc)} m⁻³</div><p class="mut">R<sub>H</sub> is shown with its sign, never forced positive. Its sign gives the carrier type only for the convention selected above.</p>`)};
  TA=Tbl($('#hta'),[{k:'I',h:'Probe current I (mA)'},{k:'VH',h:'V_H (V)'}],calc,[10,20,30,40,50].map((i)=>({I:String(i),VH:f(i*0.0012,3)})),5);
  TB=Tbl($('#htb'),[{k:'MC',h:'Magnet current (A)'},{k:'B',h:'B (gauss)'},{k:'VH',h:'V_H (V)'}],calc,[{MC:'0.5',B:'500',VH:'0.030'},{MC:'1.0',B:'1000',VH:'0.060'},{MC:'1.5',B:'1500',VH:'0.090'},{MC:'2.0',B:'2000',VH:'0.120'}],5);
  TA.render();TB.render();$('#ht').value=STORE.hallT;$('#hc').value=STORE.conv;$('#hm').onchange=calc;$('#ht').oninput=()=>{STORE.hallT=$('#ht').value;saveStore();calc()};$('#hc').onchange=()=>{STORE.conv=$('#hc').value;saveStore();calc()};cur.hall=ch;calc();
  const add=(T)=>()=>{const r=T.rows.findIndex(r=>!r.VH&&!r.B&&!r.I);const row=T===TA?{I:$('#hI').value,VH:$('#hV').value}:{MC:'',B:$('#hB').value,VH:$('#hV').value};T.rows.splice(r<0?T.rows.length:r,r<0?0:1,row);T.render()};
  $('#hadA').onclick=add(TA);$('#hadB').onclick=add(TB);
  function draw(){const I=Math.min(Math.max(n($('#hI').value)||0,0),100),B=Math.min(Math.max(n($('#hB').value)||0,0),3000),V=n($('#hV').value);
   const ia=20+I*1.1,ba=15+B*0.04;
   $('#hsv').innerHTML=`<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#EF476F"/></marker><marker id="ab" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#073B4C"/></marker></defs>
   <polygon points="160,130 400,130 440,100 200,100" fill="#BDEFE1" stroke="#4B6272"/><polygon points="160,130 400,130 400,170 160,170" fill="#8FE3CB" stroke="#4B6272"/><polygon points="400,130 440,100 440,140 400,170" fill="#6FD8BC" stroke="#4B6272"/>
   <line x1="${160-ia}" y1="150" x2="160" y2="150" stroke="#EF476F" stroke-width="3" marker-end="url(#ar)"/><text x="20" y="145">I = ${f(I)} mA (+x)</text>
   <line x1="300" y1="100" x2="300" y2="${100-ba}" stroke="#073B4C" stroke-width="3" marker-end="url(#ab)"/><text x="308" y="${100-ba+6}">B = ${f(B)} G (+z)</text>
   <circle cx="260" cy="150" r="3" fill="#EF476F"/><text x="205" y="190">e⁻ drift (−x), deflected ↓</text>
   <line x1="300" y1="175" x2="300" y2="220" stroke="#4B6272"/><text x="170" y="236">V_H = ${isFinite(V)?f(V)+' V':'—'} across width (top +, bottom −)</text>
   <text x="445" y="160">t</text><line x1="440" y1="100" x2="440" y2="140" stroke="#4B6272"/>`}
  ['hI','hB','hV'].forEach(i=>$('#'+i).oninput=draw);draw();
 }}}
// ===== FIBRE =====
function fibre(){
 const h=shell('fibre','To determine the numerical aperture of optical fibre.',
 '<p>An optical fibre guides light along its length by successive total internal reflection at the core–cladding boundary. It has a core (innermost light-guiding region) surrounded by a coaxial cladding. Apparatus: fibre optic cables, light source, fibre optic transmitter.</p><p><b>Procedure:</b> connect the transmitter and power supply with correct polarity; hold the free end of the fibre slightly away from a white paper or graph sheet; measure horizontal and vertical diameters of the bright red spot and the distance d from cable to screen; find mean radius X.</p>',
 '<div class="fm">X = (H<sub>d</sub> + V<sub>d</sub>) / 4</div><div class="fm">N.A. = sin i = X / √(X² + d²)</div><div class="fm">i = sin⁻¹(N.A.)</div><p class="mut">H<sub>d</sub> = horizontal diameter (cm), V<sub>d</sub> = vertical diameter (cm), d = distance between cable and screen (cm), X = mean radius, i = acceptance angle. The sheet prints "H<sub>d</sub>+V<sub>d</sub>/4"; this is implemented as (H<sub>d</sub>+V<sub>d</sub>)/4, the mean radius. N.A. has no unit.</p>',
 `<div class="pn"><svg id="fsv" class="sim" viewBox="0 0 600 240"></svg>
 <p><label>H<sub>d</sub> (cm)<input id="fh" inputmode="decimal"></label><label>V<sub>d</sub> (cm)<input id="fv" inputmode="decimal"></label><label>d (cm)<input id="fd" inputmode="decimal"></label></p>
 <p class="mut">These edit reading 1 of the table.</p><div id="fcalc"></div></div>`,
 `<div class="pn"><div id="ft"></div></div><div class="pn"><div class="cv"><canvas id="fch"></canvas></div><p class="mut">Mean radius X against distance d; the line is X = d·tan i for the mean acceptance angle.</p></div><div class="pn"><h2>Result</h2><div id="fres"></div></div>`,
 vq([['What is optical fibre?','A thin, flexible strand of glass or plastic (core + cladding) that guides light by total internal reflection.'],['On what principle does optical fibre depend?','Total internal reflection: light in the denser core meeting the core–cladding boundary beyond the critical angle is completely reflected.'],['What are the advantages of optical fibres?','High bandwidth, low loss, immunity to electromagnetic interference, small size and light weight, and good security.'],['Is numerical aperture dimensionless? What information can you get from it?','Yes — it is a ratio (sin i). It indicates the light-gathering ability of the fibre: a larger N.A. means a wider acceptance angle.']]));
 return{h,init(){
  const cols=[{k:'Hd',h:'H<sub>d</sub> (cm)'},{k:'Vd',h:'V<sub>d</sub> (cm)'},{k:'d',h:'d (cm)'},{k:'X',h:'Mean X (cm)',out:r=>{const q=P.na(n(r.Hd),n(r.Vd),n(r.d));return q.e?'—':f(q.X)}},{k:'NA',h:'N.A.',out:r=>{const q=P.na(n(r.Hd),n(r.Vd),n(r.d));return q.e?'—':f(q.NA)}},{k:'i',h:'Acceptance angle i (°)',out:r=>{const q=P.na(n(r.Hd),n(r.Vd),n(r.d));return q.e?'—':f(q.i)}}];
  const ch=Chart_('fch','Distance d (cm)','Mean radius X (cm)',[ds('X','#073B4C',false),ds('X = d tan i','#EF476F')]);
  const smp=[{Hd:'1.6',Vd:'1.6',d:'3'},{Hd:'2.2',Vd:'2.0',d:'4'},{Hd:'2.8',Vd:'2.6',d:'5'}];
  const T=Tbl($('#ft'),cols,rows=>{
   const v=rows.map(r=>({r,q:P.na(n(r.Hd),n(r.Vd),n(r.d))}));const ok=v.filter(o=>!o.q.e);
   const mNA=ok.length?ok.reduce((a,o)=>a+o.q.NA,0)/ok.length:NaN;const mi=Math.asin(mNA)*180/Math.PI;
   ch.data.datasets[0].data=ok.map(o=>({x:n(o.r.d),y:o.q.X}));const dm=Math.max(0,...ok.map(o=>n(o.r.d)));
   ch.data.datasets[1].data=ok.length?[{x:0,y:0},{x:dm,y:dm*mNA/Math.sqrt(1-mNA*mNA)}]:[];ch.update();
   $('#fres').innerHTML=ok.length?`<div class="res">N.A. = ${f(mNA)} (mean of ${ok.length}) &nbsp; i = ${f(mi)}°</div><p>The fibre accepts light within a cone of half-angle ${f(mi)}°. Higher N.A. means it gathers more light.</p>`:'<p class="mut">Enter H<sub>d</sub>, V<sub>d</sub> and d.</p>';
   const r=rows[0]||{};[['fh','Hd'],['fv','Vd'],['fd','d']].forEach(([id,k])=>{if(document.activeElement!==$('#'+id))$('#'+id).value=r[k]??''});draw(r)},smp);
  T.render();cur.fibre=ch;
  function draw(r){const Hd=n(r.Hd),Vd=n(r.Vd),d=n(r.d),q=P.na(Hd,Vd,d);
   const x0=90,L=Math.min(isFinite(d)&&d>0?d:3,10)*38,xs=x0+L,sc=Math.min(Math.max(isFinite(q.X)?q.X*38:20,6),100);
   $('#fsv').innerHTML=`<rect x="10" y="108" width="80" height="24" fill="#D5E3E8" stroke="#4B6272"/><rect x="10" y="114" width="80" height="12" fill="#FFD166"/><text x="12" y="104">Cladding</text><text x="30" y="150">Core</text>
   <line x1="10" x2="${xs+20}" y1="120" y2="120" stroke="#4B6272" stroke-dasharray="5 3"/><text x="12" y="172">Fibre axis</text>
   <polygon points="${x0},120 ${xs},${120-sc} ${xs},${120+sc}" fill="#EF476F" opacity=".3"/><line x1="${x0}" y1="120" x2="${xs}" y2="${120-sc}" stroke="#EF476F"/><line x1="${x0}" y1="120" x2="${xs}" y2="${120+sc}" stroke="#EF476F"/>
   <line x1="30" y1="120" x2="${x0}" y2="116" stroke="#EF476F"/><line x1="30" y1="120" x2="${x0}" y2="125" stroke="#EF476F"/>
   <line x1="${xs}" x2="${xs}" y1="${120-sc-12}" y2="${120+sc+12}" stroke="#4B6272" stroke-width="3"/><ellipse cx="${xs}" cy="120" rx="3" ry="${sc}" fill="#EF476F"/>
   <text x="${x0+10}" y="${120-6}">i = ${q.e?'—':f(q.i)+'°'}</text><text x="${xs-60}" y="${120-sc-16}">X = ${q.e?'—':f(q.X)} cm</text>
   <line x1="${x0}" x2="${xs}" y1="215" y2="215" stroke="#073B4C"/><text x="${(x0+xs)/2-20}" y="230">d = ${f(d)} cm</text>`;
   $('#fcalc').innerHTML=q.e?`<p class="er">${q.e}</p>`:`<p class="mut">X = (${f(Hd)}+${f(Vd)})/4 = ${f(q.X)} cm<br>N.A. = ${f(q.X)}/√(${f(q.X)}²+${f(d)}²) = <b>${f(q.NA)}</b><br>i = sin⁻¹(${f(q.NA)}) = <b>${f(q.i)}°</b></p>`}
  [['fh','Hd'],['fv','Vd'],['fd','d']].forEach(([id,k])=>$('#'+id).addEventListener('input',e=>{T.rows[0][k]=e.target.value;T.refresh();$('#ft').querySelectorAll(`input[data-i="0"][data-k="${k}"]`).forEach(i=>i.value=e.target.value)}));
 }}}
// ===== GRAPH ANALYZER (uses the same row store as the practicals) =====
function analyzer(){
 const C=(k,h,auto)=>({k,h,auto}),V=(k,l,f,virt)=>({k,l,f,virt});
 const na=r=>P.na(n(r.Hd),n(r.Vd),n(r.d));
 const S={
  laser:{t:'Laser Beam Divergence',key:'lt',cols:[C('x1','x₁ (cm)'),C('w1','w₁ (mm)'),C('x2','x₂ (cm)'),C('w2','w₂ (mm)'),C('D','D (cm) = |x₂−x₁|',P.autoD)],vars:[V('x1','Position x₁ (cm)',r=>pz(n(r.x1))),V('w1','Spot diameter w₁ (mm)',r=>pz(n(r.w1))),V('x2','Position x₂ (cm)',r=>pz(n(r.x2))),V('w2','Spot diameter w₂ (mm)',r=>pz(n(r.w2))),V('D','D (cm)',r=>pz(n(r.D))),V('th','θ₀ (mrad)',r=>P.laserRow(r).v??NaN),V('pos','Screen position x (cm): x₁ for w₁, x₂ for w₂',null,true),V('w','Spot diameter w (mm): w₁ and w₂ together',null,true)],x:'D',y:'w'},
  diode:{t:'PN Junction Diode',key:'dt',cols:[C('V','Voltage across diode (V)'),C('I','Current (mA)')],vars:[V('V','Voltage V (V)',r=>pz(n(r.V))),V('I','Current I (mA)',r=>pz(n(r.I)))],x:'V',y:'I'},
  hallA:{t:'Hall Effect — B = 1000 gauss',key:'hta',hall:'A',cols:[C('I','Probe current I (mA)'),C('VH','V_H (V)')],vars:[V('I','Probe current I (mA)',r=>pz(n(r.I))),V('VH','Hall voltage V_H (V)')],x:'I',y:'VH'},
  hallB:{t:'Hall Effect — I = 50 mA',key:'htb',hall:'B',cols:[C('MC','Magnet current (A)'),C('B','B (gauss)'),C('VH','V_H (V)')],vars:[V('MC','Magnet current (A)',r=>pz(n(r.MC))),V('B','Magnetic field B (gauss)',r=>pz(n(r.B))),V('VH','Hall voltage V_H (V)')],x:'B',y:'VH'},
  fibre:{t:'Optical Fibre NA',key:'ft',cols:[C('Hd','H_d (cm)'),C('Vd','V_d (cm)'),C('d','d (cm)')],vars:[V('Hd','H_d (cm)',r=>pz(n(r.Hd))),V('Vd','V_d (cm)',r=>pz(n(r.Vd))),V('d','Distance d (cm)',r=>pz(n(r.d))),V('X','Mean radius X (cm)',r=>na(r).X??NaN),V('NA','N.A. (no unit)',r=>na(r).NA??NaN),V('i','Acceptance angle i (°)',r=>na(r).i??NaN)],x:'d',y:'X'}};
 S.laser.tip='Plot w₁ and w₂ against D (or against screen position once x₁ and x₂ are entered). No fit is needed: θ₀ comes from the formula, not from a slope.';S.diode.tip='Use No fit. The forward I–V curve is not a straight line, so a straight-line fit would mislead. Choose two points on the steep part for R_D.';S.hallA.tip='Use Line through origin, with I on x and V_H on y as on your sheet. Enter thickness t to get p.';S.hallB.tip='Use Line through origin, with B on x and V_H on y as on your sheet. Enter thickness t to get p.';S.fibre.tip='Plot X against d. The points should lie roughly on a straight line from the origin; N.A. and i are calculated from the table.';
 const FIT={none:['No fit','only your points are shown and nothing is calculated from them. Best for curves, such as the diode I–V graph.'],lin:['Best-fit line (y = mx + c)','least-squares straight line through your points. Gives slope m, intercept c and R² (closer to 1 = closer to a perfect line).'],orig:['Line through origin (y = mx)','least-squares line forced through (0, 0), as the Hall sheet requires. Gives slope m only; the R² shown is for this forced line, so also judge the fit by eye.']};
 S.laser.pre=[{l:'Spot diameter vs screen position',x:'pos',y:'w',f:'none'},{l:'Spot diameter vs distance D',x:'D',y:'w',f:'none'},{l:'w₁ vs x₁',x:'x1',y:'w1',f:'none'},{l:'w₂ vs x₂',x:'x2',y:'w2',f:'none'}];S.diode.pre=[{l:'I–V graph (V on x, I on y)',x:'V',y:'I',f:'none',s:'line'}];S.hallA.pre=[{l:'V_H vs probe current I',x:'I',y:'VH',f:'orig'}];S.hallB.pre=[{l:'V_H vs magnetic field B',x:'B',y:'VH',f:'orig'}];S.fibre.pre=[{l:'Mean radius X vs distance d',x:'d',y:'X',f:'orig'},{l:'Acceptance angle vs distance d',x:'d',y:'i',f:'none'}];
 S.laser.smp=[{x1:'50',w1:'1.0',x2:'100',w2:'1.6'},{x1:'60',w1:'1.2',x2:'120',w2:'2.1'},{x1:'70',w1:'1.5',x2:'140',w2:'2.6'}];S.diode.smp=[0,0.3,0.5,0.55,0.6,0.65,0.7].map(v=>({V:String(v),I:f(1e3*2e-9*(Math.exp(v/0.0517)-1),3)}));S.hallA.smp=[10,20,30,40,50].map(i=>({I:String(i),VH:f(i*0.0012,3)}));S.hallB.smp=[{MC:'0.5',B:'500',VH:'0.030'},{MC:'1.0',B:'1000',VH:'0.060'},{MC:'1.5',B:'1500',VH:'0.090'},{MC:'2.0',B:'2000',VH:'0.120'}];S.fibre.smp=[{Hd:'1.6',Vd:'1.6',d:'3'},{Hd:'2.2',Vd:'2.0',d:'4'},{Hd:'2.8',Vd:'2.6',d:'5'}]; // illustrative samples only (labelled in the UI)
 const h=`<h1>Graph Analyzer</h1>
<div class="pn"><h2>1. Choose your experiment</h2><label>Experiment<select id="ap" style="width:min(100%,260px)">${Object.keys(S).map(k=>`<option value="${k}">${S[k].t}</option>`).join('')}</select></label><label id="aht">Specimen thickness t (mm)<input id="atk" inputmode="decimal" placeholder="needed for R_H"></label><label id="ahc">V<sub>H</sub> sign convention<select id="ahcs" style="width:min(100%,290px)"><option value="h">Positive V_H reading = holes</option><option value="e">Positive V_H reading = electrons</option></select></label><p class="mut">These are the same readings as on the practical's own page.</p></div>
<div class="pn"><h2>2. Enter your readings</h2><p class="mut">Type your measurements in the table. Press Enter to jump to the next row. New here? Tap \u201cLoad sample\u201d to see how it works.</p><div id="aw"></div><p><button id="aclr">Clear all readings</button></p></div>
<div class="pn"><h2>3. Pick a graph</h2><div id="apre" class="pre"></div><label>Line on the graph<select id="af"><option value="none">No line (points only)</option><option value="lin">Best-fit line (y = mx + c)</option><option value="orig">Line through origin (y = mx)</option></select></label><div id="ahint" class="hint"></div><details><summary>Change axes or style (optional)</summary><label>X-axis<select id="ax" style="width:190px"></select></label><label>Y-axis<select id="ay" style="width:190px"></select></label><label>Style<select id="as"><option value="scatter">Points only</option><option value="line">Points joined by a line</option></select></label></details><div class="cv"><canvas id="ach"></canvas></div><p><button id="areset">Reset graph</button> <button id="apng">Save graph (PNG)</button> <button id="acsv">Save readings (CSV)</button></p></div>
<div class="pn"><h2>4. Your results</h2><div id="ad" style="display:none"><p class="mut">Choose the two readings to use for dynamic resistance:</p><label>Point 1 (Sr.)<select id="ap1"></select></label><label>Point 2 (Sr.)<select id="ap2"></select></label></div><div id="aa"></div></div>`;
 return{h,init(){
  const $$=id=>document.getElementById(id),un=l=>(l.match(/\(([^)]*)\)/)||[,''])[1];
  let T,cfg,pk=false;
  const ch=Chart_('ach','','',[ds('Observations','#073B4C',false),ds('Fit','#EF476F'),ds('w₂','#06D6A0',false)]);ch.data.datasets[1].pointRadius=0;cur.analyzer=ch;
  const g=(v,r)=>v.f?v.f(r):n(r[v.k]);
  function usePre(p,i){$$('ax').value=p.x;$$('ay').value=p.y;$$('af').value=p.f;$$('as').value=p.s||'scatter';[...$$('apre').children].forEach((b,j)=>b.classList.toggle('on',j==i))}
  function defaults(){usePre(cfg.pre[0],0)}
  function build(){cfg=S[$$('ap').value];pk=false;$$('ax').innerHTML=$$('ay').innerHTML=cfg.vars.map(v=>`<option value="${v.k}">${v.l}</option>`).join('');$$('apre').innerHTML=cfg.pre.map((p,i)=>`<button data-pi="${i}">${p.l}</button>`).join('');defaults();$$('aht').style.display=$$('ahc').style.display=cfg.hall?'':'none';$$('ad').style.display=cfg.key=='dt'?'':'none';$$('aw').innerHTML='<div id="'+cfg.key+'"></div>';T=Tbl($$(cfg.key),cfg.cols,upd,cfg.smp,4,cfg.key);T.render()}
  function upd(rows){const fz=FIT[$$('af').value];$$('ahint').innerHTML=fz[1].charAt(0).toUpperCase()+fz[1].slice(1)+(cfg.tip?'<br><b>Tip:</b> '+cfg.tip:'');
   const xv=cfg.vars.find(v=>v.k==$$('ax').value),yv=cfg.vars.find(v=>v.k==$$('ay').value),line=$$('as').value=='line',fit=$$('af').value;
   let pts=[],s1=[],s2=[],bad='',used=0;const live=rows.filter(r=>Object.keys(r).some(k=>r[k]!==''&&r[k]!=null)),vr=k=>cfg.vars.find(v=>v.k==k);
   if(yv.virt){if(xv.k!='pos'&&xv.k!='D')bad='Spot diameter (w₁ and w₂ together) can be plotted against screen position or D — choose one of those on the X-axis.';else live.forEach(r=>{const xa=xv.k=='pos'?pz(n(r.x1)):g(vr('D'),r),xb=xv.k=='pos'?pz(n(r.x2)):g(vr('D'),r),a={x:xa,y:g(vr('w1'),r)},b={x:xb,y:g(vr('w2'),r)};let u=0;if(isFinite(a.x)&&isFinite(a.y)){s1.push(a);u=1}if(isFinite(b.x)&&isFinite(b.y)){s2.push(b);u=1}used+=u});pts=s1.concat(s2)}
   else if(xv.virt)bad='Screen position pairs x₁ with w₁ and x₂ with w₂, so choose “Spot diameter w (w₁ and w₂ together)” on the Y-axis, or pick x₁ / x₂ directly.';
   else live.forEach(r=>{const p={x:g(xv,r),y:g(yv,r)};if(isFinite(p.x)&&isFinite(p.y)){pts.push(p);used++}});
   if(line){const so=(a,b)=>a.x-b.x;pts.sort(so);s1.sort(so);s2.sort(so)}
   const N=pts.length,xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);let out=`<p>Points plotted: ${N} (entered observations).</p>`+(xv.k==yv.k?'<p class="er">X and Y are the same quantity — pick different axes.</p>':'')+(bad?`<p class="er">${bad}</p>`:'')+(live.length>used?`<p class="mut">${live.length-used} row(s) not plotted: a required value is missing, negative or invalid (for example older records with only D have no screen positions).</p>`:''),m=NaN,c=0,fl=[];
   if(fit!='none'){if(N<2)out+='<p class="er">A fit needs at least 2 points.</p>';else if(fit=='lin'){const Sx=xs.reduce((a,b)=>a+b,0),Sy=ys.reduce((a,b)=>a+b,0),Sxx=xs.reduce((a,b)=>a+b*b,0),Sxy=xs.reduce((a,x,i)=>a+x*ys[i],0),d=N*Sxx-Sx*Sx;if(Math.abs(d)<1e-12)out+='<p class="er">All x values are equal — a line cannot be fitted.</p>';else{m=(N*Sxy-Sx*Sy)/d;c=(Sy-m*Sx)/N}}else{m=P.slope0(xs,ys);if(!isFinite(m))out+='<p class="er">All x values are zero — fit through origin is undefined.</p>'}}
   if(isFinite(m)){const my=ys.reduce((a,b)=>a+b,0)/N,sst=ys.reduce((a,y)=>a+(y-my)**2,0),ssr=ys.reduce((a,y,i)=>a+(y-(m*xs[i]+c))**2,0),r2=sst>0?1-ssr/sst:NaN,x0=fit=='orig'?Math.min(0,...xs):Math.min(...xs),x1=Math.max(...xs);fl=[{x:x0,y:m*x0+c},{x:x1,y:m*x1+c}];
    out+=`<div class="res">y = ${f(m)} x${fit=='lin'?(c<0?' − ':' + ')+f(Math.abs(c)):''}</div><p>Slope = ${f(m)} ${un(yv.l)}/${un(xv.l)||'unit'}${fit=='lin'?`; intercept = ${f(c)} ${un(yv.l)}`:'; intercept fixed at 0'}</p>`+(fit=='lin'?`<p>R² = ${f(r2)}</p>`:`<p class="mut">R² here = 1 − SS<sub>res</sub>/SS<sub>tot</sub> about the mean of y, for the line forced through the origin; it is not the same as ordinary regression R² and can be misleading — judge the fit by the graph too.</p>`)}
   const d0=ch.data.datasets[0],d2=ch.data.datasets[2];d0.data=yv.virt?s1:pts;d0.label=yv.virt?'w₁':'Observations';d2.data=yv.virt?s2:[];d2.label='w₂';d0.showLine=d2.showLine=line;ch.data.datasets[1].data=fl;ch.data.datasets[1].label=fit=='orig'?'Fit through origin':'Linear fit';ch.options.scales.x.title.text=yv.virt?(xv.k=='pos'?'Screen position x (cm)':'D (cm)'):xv.l;ch.options.scales.y.title.text=yv.virt?'Spot diameter w (mm)':yv.l;ch.update();
   const rm=a=>f(a.reduce((s,v)=>s+v,0)/a.length),rd=N?`<h3>Readings summary</h3><p class="mut">x: min ${f(Math.min(...xs))}, max ${f(Math.max(...xs))}, mean ${rm(xs)} &nbsp;|&nbsp; y: min ${f(Math.min(...ys))}, max ${f(Math.max(...ys))}, mean ${rm(ys)}</p><div class="tw"><table class="rt"><tr><th>#</th><th>${xv.l}</th><th>${yv.l}</th>${isFinite(m)?'<th>Fitted y</th><th>Residual</th>':''}</tr>${pts.map((p,i)=>`<tr><td>${i+1}</td><td>${f(p.x)}</td><td>${f(p.y)}</td>${isFinite(m)?`<td>${f(m*p.x+c)}</td><td>${f(p.y-(m*p.x+c))}</td>`:''}</tr>`).join('')}</table></div>`:'';
   const sp=special(rows,m,xv.k,yv.k,fit).replace('<hr>','');if(!N&&!bad)out+='<p class="mut">No graph yet. Enter at least one complete row of readings in step 2, or tap \u201cLoad sample\u201d.</p>';$$('aa').innerHTML=(sp.trim()?`<div class="key">${sp}</div>`:'')+out+(N?`<details><summary>Show every plotted reading</summary>${rd}</details>`:'')}
  function special(rows,m,xk,yk,fit){let o='<hr>';
   if(cfg.key=='lt'){const q=rows.map(r=>({r,q:P.laserRow(r)}));const ok=q.filter(o=>o.q.v!=null);o+='<h3>θ₀ = √(w₂² − w₁²) / D</h3>';q.forEach((o2,i)=>{if(o2.q.e&&Object.keys(o2.r).some(k=>o2.r[k]!==''))o+=`<p class="er">Reading ${i+1}: ${o2.q.e}</p>`});if(!ok.length)return o+'<p class="mut">No valid reading yet.</p>';const a=ok[0].r;o+=`<p class="mut">Reading ${q.indexOf(ok[0])+1}: θ₀ = √(${f(n(a.w2))}² − ${f(n(a.w1))}²) / (${f(ok[0].q.D*10)} mm) = ${f(ok[0].q.v)} mrad</p><div class="res">Mean θ₀ = ${f(ok.reduce((s,o3)=>s+o3.q.v,0)/ok.length)} mrad (${ok.length} reading(s))</div>`;return o}
   if(cfg.key=='dt'){const ok=rows.map((r,i)=>isFinite(n(r.V))&&isFinite(n(r.I))?i:-1).filter(i=>i>=0),s1=$$('ap1'),s2=$$('ap2'),a=s1.value,b=s2.value,opts=ok.map(i=>`<option value="${i}">${i+1}</option>`).join('');s1.innerHTML=s2.innerHTML=opts;s1.value=(pk&&a!==''&&ok.includes(+a))?a:ok[ok.length-2];s2.value=(pk&&b!==''&&ok.includes(+b))?b:ok[ok.length-1];if(ok.length<2)return o+'<p class="mut">Enter at least two complete readings to compute R<sub>D</sub>.</p>';const p=rows[+s1.value],q=rows[+s2.value];if(s1.value===s2.value)return o+'<p class="er">Choose two different points.</p>';const r=P.dyn(n(p.V),n(p.I),n(q.V),n(q.I));return o+`<h3>R<sub>D</sub> = ΔV/ΔI = (V₂ − V₁)/(I₂ − I₁)</h3>`+(r.e?`<p class="er">${r.e}</p>`:`<p class="mut">= (${f(n(q.V))} − ${f(n(p.V))}) V / (${f(n(q.I))} − ${f(n(p.I))})×10⁻³ A</p><div class="res">R<sub>D</sub> = ${f(r.v)} Ω</div>`)}
   if(cfg.hall){const t=n($$('atk').value),A=cfg.hall=='A';o+=`<h3>Hall coefficient and carrier concentration</h3><p class="mut">${A?'R_H = m·t/B, m = ΔV_H/ΔI, B = 1000 G = 0.1 T':'R_H = m·t/I, m = ΔV_H/ΔB, I = 50 mA'}; concentration = 1/(|R_H|·e)</p>`;if(yk!='VH'||xk!=(A?'I':'B')||fit!='orig')return o+`<p class="er">Hall results use the sheet's graph only: V_H on y, ${A?'I':'B'} on x, with “Fit through origin”. Axes are not switched silently.</p>`;const sg=STORE.conv=='e'?-1:1,r=A?P.hallA(m,1000,t,sg):P.hallB(m,50,t,sg);return o+(r.e?`<p class="er">${r.e}</p>`:`<p class="mut">Slope in SI: ${A?f(m*1e3)+' V/A':f(m*1e4)+' V/T'}; t = ${f(t)} mm; convention: positive V_H reading = ${sg<0?'electrons':'holes'}</p><div class="res">R<sub>H</sub> = ${ex(r.RH)} m³/C</div><div class="res">Carrier type: ${r.type=='holes'?'holes (p-type)':'electrons (n-type)'}</div><div class="res">${r.type=='holes'?'p':'n'} = ${ex(r.conc)} m⁻³</div>`)}
   if(cfg.key=='ft'){const q=rows.map(r=>({r,q:na(r)})),ok=q.filter(o2=>!o2.q.e&&o2.q.NA>=0&&o2.q.NA<=1);o+='<h3>X = (H_d + V_d)/4, N.A. = X/√(X² + d²), i = sin⁻¹(N.A.)</h3>';q.forEach((o2,i)=>{if(o2.q.e&&Object.keys(o2.r).some(k=>o2.r[k]!==''))o+=`<p class="er">Reading ${i+1}: ${o2.q.e}</p>`});if(!ok.length)return o+'<p class="mut">No valid reading yet.</p>';const a=ok[0],mn=ok.reduce((s,o3)=>s+o3.q.NA,0)/ok.length;return o+`<p class="mut">Reading ${q.indexOf(a)+1}: X = (${f(n(a.r.Hd))} + ${f(n(a.r.Vd))})/4 = ${f(a.q.X)} cm; N.A. = ${f(a.q.X)}/√(${f(a.q.X)}² + ${f(n(a.r.d))}²) = ${f(a.q.NA)}</p><div class="res">Mean N.A. = ${f(mn)}, i = ${f(Math.asin(mn)*180/Math.PI)}°</div>`}
   return o}
  $$('ap').onchange=build;$$('ap1').onchange=$$('ap2').onchange=()=>{pk=true;upd(T.rows)};$$('apre').onclick=e=>{const i=e.target.dataset.pi;if(i==null)return;usePre(cfg.pre[+i],+i);upd(T.rows)};['ax','ay','as','af','ap1','ap2'].forEach(i=>$$(i).onchange=()=>upd(T.rows));$$('atk').value=STORE.hallT;$$('ahcs').value=STORE.conv;$$('atk').oninput=()=>{STORE.hallT=$$('atk').value;saveStore();upd(T.rows)};$$('ahcs').onchange=()=>{STORE.conv=$$('ahcs').value;saveStore();upd(T.rows)};
  $$('aclr').onclick=()=>{if(!confirm('Delete all readings in this table? This cannot be undone.'))return;T.rows.length=0;T.rows.push({});T.render()};
  $$('areset').onclick=()=>{defaults();upd(T.rows)};
  $$('apng').onclick=()=>{const a=document.createElement('a');a.href=ch.toBase64Image();a.download='physlab-graph.png';a.click()};
  function resultsCSV(){const R=T.rows,o=[];
   if(cfg.key=='lt'){const v=R.map(r=>P.laserRow(r).v).filter(isFinite);if(v.length){const mn=v.reduce((a,b)=>a+b,0)/v.length;o.push(['Mean angular divergence',mn,'mrad']);o.push(['Mean angular divergence',mn/1000,'rad'])}}
   else if(cfg.key=='ft'){const q=R.map(r=>na(r)).filter(x=>!x.e);if(q.length){const mn=q.reduce((a,x)=>a+x.NA,0)/q.length;o.push(['Mean numerical aperture',mn,'no unit']);o.push(['Acceptance angle',Math.asin(mn)*180/Math.PI,'degrees'])}}
   else if(cfg.key=='dt'){const a=R[+$$('ap1').value],b=R[+$$('ap2').value];if(a&&b&&$$('ap1').value!==$$('ap2').value){const q=P.dyn(n(a.V),n(a.I),n(b.V),n(b.I));if(!q.e)o.push(['Dynamic resistance R_D',q.v,'ohm'])}}
   else if(cfg.hall){const A=cfg.hall=='A',xs=[],ys=[];R.forEach(r=>{const x=A?n(r.I):n(r.B),y=n(r.VH);if(isFinite(x)&&isFinite(y)){xs.push(x);ys.push(y)}});if(xs.length>=2){const m=P.slope0(xs,ys),t=n($$('atk').value),sg=STORE.conv=='e'?-1:1,q=A?P.hallA(m,1000,t,sg):P.hallB(m,50,t,sg);o.push(['Slope (fit through origin)',m,A?'V/mA':'V/gauss']);if(q.e)o.push(['Note',q.e,'']);else{o.push(['Hall coefficient R_H',q.RH,'m^3/C']);o.push(['Carrier type',q.type,'']);o.push([q.type=='holes'?'Hole concentration p':'Electron concentration n',q.conc,'m^-3'])}}}
   if(!o.length)o.push(['Note','Not enough valid readings for a result','']);return o}
  $$('acsv').onclick=()=>{const calc=cfg.vars.filter(v=>v.f&&!v.virt&&!cfg.cols.some(c=>c.k==v.k)),L=[csvLine(['PhysLab export']),csvLine(['Practical',cfg.t]),csvLine(['Exported',new Date().toISOString()]),'',csvLine(['Sr.',...cfg.cols.map(c=>c.h),...calc.map(v=>v.l+' [calculated]')])];
   T.rows.forEach((r,i)=>{if(!Object.keys(r).some(k=>r[k]!==''))return;L.push(csvLine([i+1,...cfg.cols.map(c=>r[c.k]??''),...calc.map(v=>{const x=v.f(r);return isFinite(x)?x:''})]))});
   L.push('',csvLine(['Results (value, unit)']));resultsCSV().forEach(x=>L.push(csvLine(x)));
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+L.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));a.download='physlab-'+cfg.key+'.csv';a.click()};
  build();
 }}}
// ===== ROUTER =====
const MOD={laser,diode,hall,fibre,analyzer};
const ART={laser:'<svg viewBox="0 0 300 110"><rect x="8" y="48" width="30" height="14" fill="#073B4C"/><polygon points="38,54 200,38 280,20 280,90 200,72 38,56" fill="#EF476F" opacity=".35"/><line x1="200" x2="200" y1="15" y2="100" stroke="#4B6272" stroke-width="2"/><line x1="280" x2="280" y1="10" y2="100" stroke="#4B6272" stroke-width="2"/></svg>',
diode:'<svg viewBox="0 0 300 110"><rect x="30" y="35" width="100" height="40" fill="#FFE29A" stroke="#4B6272"/><rect x="130" y="35" width="30" height="40" fill="#ccc"/><rect x="160" y="35" width="100" height="40" fill="#BDEFE1" stroke="#4B6272"/><text x="60" y="60" font-size="12" fill="#073B4C">P</text><text x="205" y="60" font-size="12" fill="#073B4C">N</text></svg>',
hall:'<svg viewBox="0 0 300 110"><polygon points="70,65 210,65 240,45 100,45" fill="#BDEFE1" stroke="#4B6272"/><polygon points="70,65 210,65 210,90 70,90" fill="#8FE3CB" stroke="#4B6272"/><line x1="20" y1="78" x2="70" y2="78" stroke="#EF476F" stroke-width="3"/><line x1="140" y1="45" x2="140" y2="8" stroke="#073B4C" stroke-width="3"/></svg>',
fibre:'<svg viewBox="0 0 300 110"><rect x="10" y="45" width="90" height="20" fill="#D5E3E8" stroke="#4B6272"/><rect x="10" y="51" width="90" height="8" fill="#FFD166"/><polygon points="100,55 260,15 260,95" fill="#EF476F" opacity=".3"/></svg>'};
function home(){
 const info={laser:['Optics','Spot diameters at two screen positions give the angular divergence.'],diode:['Semiconductors','Forward I\u2013V readings, plotted curve and dynamic resistance.'],hall:['Magnetism','Hall voltage against current and field gives the Hall coefficient and carrier concentration.'],fibre:['Photonics','Spot size and distance give the numerical aperture and acceptance angle.']};
 const steps=['Select practical','Understand concept','Explore simulator','Enter readings','Calculate','Analyse graph','Interpret result'];
 const art='<svg class="hero-art" viewBox="0 0 320 240" aria-hidden="true"><g fill="none" stroke="#FAF9F6" stroke-opacity=".28"><circle cx="160" cy="120" r="40"/><circle cx="160" cy="120" r="75"/><circle cx="160" cy="120" r="110"/></g><circle cx="160" cy="120" r="14" fill="#FFD166"/><g class="orb"><circle cx="160" cy="45" r="9" fill="#06D6A0"/></g><g class="orb2"><circle cx="270" cy="120" r="9" fill="#EF476F"/></g><path d="M10 215 q25 -42 50 0 t50 0 t50 0 t50 0 t50 0 t50 0" fill="none" stroke="#06D6A0" stroke-width="4" stroke-linecap="round"/></svg>';
 return `<section class="hero"><div><span class="badge">First Year Applied Physics</span><h1>PhysLab</h1><p class="lead">Do the practical, see the physics. Change a reading and watch the calculation, graph and result update instantly.</p><div class="cta"><a class="btn btn-y" href="#laser">Start an experiment</a><a class="btn btn-o" href="#analyzer">Open Graph Analyzer</a></div></div>${art}</section>
<h2 class="sec">Choose a practical</h2>
<div class="grid">${Object.keys(PR).map(k=>`<a class="card c-${k}" href="#${k}">${ART[k]}<span class="tag">${info[k][0]}</span><h2>${PR[k]}</h2><p class="mut">${info[k][1]}</p><span class="go">Open practical \u2192</span></a>`).join('')}</div>
<h2 class="sec">How it works</h2>
<ol class="steps">${steps.map(t=>`<li>${t}</li>`).join('')}</ol>
<div class="pn note"><h2>The problem it solves</h2><p>Theory, apparatus, observations, formulae, calculations and graphs usually sit on separate pages. PhysLab connects them: change a reading and the calculation, graph and result update immediately.</p></div>`}

function go(h){location.hash=h}
function route(){const id=location.hash.slice(1),m=$('#m');
 $('#nav').innerHTML=Object.keys(PR).map(k=>`<a href="#${k}" class="${k==id?'on':''}">${PR[k]}</a>`).join('');$('#ddb').classList.toggle('on',!!PR[id]);$('#ddb span').textContent=PR[id]||'Practicals';$('#dka').classList.toggle('on',id=='analyzer');$('#dkh').classList.toggle('on',!PR[id]&&id!='analyzer');$('#dd').classList.remove('open');
 if(!MOD[id]){m.innerHTML=home();return}
 const mod=MOD[id]();m.innerHTML=mod.h;mod.init();const rb=$('[data-rst]');if(rb)rb.onclick=()=>{if(!confirm('Delete ALL saved readings for '+PR[id]+'? This cannot be undone.'))return;(RESET[id]||[]).forEach(k=>delete DATA[k]);if(id=='hall')STORE.hallT='';saveStore();route()};
 const tb=$('.tabs');if(id=='diode')$('[data-p=d]',tb).textContent='Analyze Actual Observations';if(tb)tb.addEventListener('click',e=>{const p=e.target.dataset.p;if(!p)return;m.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.p==p));m.querySelectorAll('.pane').forEach(b=>b.classList.toggle('on',b.dataset.p==p));if(cur[id])cur[id].resize();if(cur[id+'2'])cur[id+'2'].resize()});
 window.scrollTo(0,0)}
$('#ddb').onclick=e=>{e.stopPropagation();$('#dd').classList.toggle('open')};document.addEventListener('click',()=>$('#dd').classList.remove('open'));document.addEventListener('keydown',e=>{if(e.key=='Escape')$('#dd').classList.remove('open')});
$('#logo').onclick=()=>go('');
addEventListener('hashchange',route);route();
