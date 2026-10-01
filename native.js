/* =====================================================================
   Finanzas · capa nativa para iPhone (PWA)
   - Sustituye las funciones que solo existían dentro de Claude:
     IA (tu clave de Anthropic), precios (Crypto.com, Frankfurter, Alpha Vantage)
     y descargas (hoja de compartir de iOS).
   - Añade vibración háptica, avisos, notificaciones, Face ID y animaciones.
   Todo se guarda solo en este dispositivo.
   ===================================================================== */
(function(){
'use strict';

const K = {
  anth:'finzz_key_anthropic', av:'finzz_key_av', haptics:'finzz_nv_haptics', alerts:'finzz_nv_alerts',
  sysNotif:'finzz_nv_sysnotif', daily:'finzz_nv_daily', faceid:'finzz_nv_faceid', seen:'finzz_nv_seen', lastBackup:'finzz_nv_lastbackup'
};
const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet = (k, v) => { try{ v==null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} };
const on = k => lsGet(k)!=='0';                 // interruptores activados por defecto
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const isStandalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const MODEL = 'claude-opus-5-5';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/* ======================= Vibración háptica ======================= */
// iOS no tiene navigator.vibrate. En Safari 18+ al pulsar un <input switch> el sistema
// produce un toque háptico; lo provocamos con una etiqueta invisible.
let inHaptic = false;
function iosTick(){
  const label = document.createElement('label'); label.setAttribute('aria-hidden','true'); label.style.display='none';
  const input = document.createElement('input'); input.type='checkbox'; input.setAttribute('switch','');
  label.appendChild(input); document.head.appendChild(label);
  inHaptic = true; try{ label.click(); }finally{ inHaptic = false; label.remove(); }
}
const PATTERNS = {select:[1,[8]], light:[1,[10]], medium:[1,[18]], success:[2,[12,70,18]], warning:[2,[22,90,22]], error:[3,[30,60,30,60,30]]};
function haptic(kind){
  if(!on(K.haptics)) return;
  if(navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // aún no se ha tocado la pantalla
  const [ticks, pattern] = PATTERNS[kind] || PATTERNS.light;
  if(!isIOS && navigator.vibrate){ try{ navigator.vibrate(pattern); }catch(e){} return; }
  if(!isIOS) return;
  iosTick();
  for(let i=1;i<ticks;i++) setTimeout(iosTick, i*110);
}
window.haptic = haptic;

/* ======================= Utilidades ======================= */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((s.length+3)%4)), c=>c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const escH = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SVG = {
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5l9 15.5H3z"/><path d="M12 10v4"/><circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a5 5 0 0 1 5-5h9l-3-3M20 15a5 5 0 0 1-5 5H6l3 3"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7l3.5 3.5V20H7z"/><path d="M9.5 12.5h5M9.5 15.5h5"/></svg>',
  faceid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1"/><path d="M9.5 15.5c1.4 1.1 3.6 1.1 5 0"/></svg>',
};

/* ======================= Precios en vivo (sustituye a los conectores de Claude) ======================= */
async function getJSON(url){
  const r = await fetch(url, {cache:'no-store'});
  const t = await r.text();
  let j = null; try{ j = JSON.parse(t); }catch(e){}
  if(!r.ok) { const err = new Error('HTTP '+r.status); err.status = r.status; err.body = j || t; throw err; }
  return j;
}
let fxCache = null;
async function usdTo(cur){
  if(!fxCache || Date.now()-fxCache.at > 3600e3){
    const j = await getJSON('https://api.frankfurter.dev/v1/latest?base=USD');
    fxCache = {at:Date.now(), rates: Object.assign({USD:1}, j.rates||{})};
  }
  return fxCache.rates[cur];
}
async function cryptoTicker(instrument){
  const [base, quote] = String(instrument).toUpperCase().split('_');
  const tryOne = async inst => {
    const j = await getJSON('https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name='+encodeURIComponent(inst));
    const d = j && j.result && j.result.data && j.result.data[0];
    if(!d || !(Number(d.a)>0)) throw new Error('not_found');
    return {last: Number(d.a), change: Number(d.c)};
  };
  try{ return await tryOne(instrument); }
  catch(e){
    // Si no existe el par en otra moneda, se calcula desde USD con el tipo de cambio del BCE
    if(quote && quote!=='USD' && quote!=='USDT'){
      const usd = await tryOne(base+'_USD'); const r = await usdTo(quote);
      if(r) return {last: usd.last*r, change: usd.change};
    }
    throw e;
  }
}
async function alphaVantage(fn, args){
  if(fn==='CURRENCY_EXCHANGE_RATE'){
    // Divisas gratis y sin consumir cupo de Alpha Vantage
    const from = String(args.from_currency||'USD').toUpperCase(), to = String(args.to_currency||'EUR').toUpperCase();
    const j = await getJSON(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`);
    const r = j && j.rates && j.rates[to];
    if(!r) throw new Error('fx_not_found');
    return JSON.stringify({'Realtime Currency Exchange Rate':{'1. From_Currency Code':from,'3. To_Currency Code':to,'5. Exchange Rate':String(r)}});
  }
  const key = lsGet(K.av);
  if(!key){ const err = new Error('Sin clave de Alpha Vantage'); err.code='av_nokey'; throw err; }
  const qs = new URLSearchParams(Object.assign({function: fn, apikey: key}, args||{}));
  const r = await fetch('https://www.alphavantage.co/query?'+qs.toString(), {cache:'no-store'});
  return await r.text();
}
const mcpShim = {
  async callTool(server, tool, args){
    if(server==='Crypto.com' && tool==='get_ticker'){
      const t = await cryptoTicker(args.instrument_name);
      return {payload: JSON.stringify({last: String(t.last), change: String(t.change)})};
    }
    if(server==='Alpha Vantage MCP Server') return {payload: await alphaVantage(tool, args)};
    if(server==='FMP') return {payload: '[]'};   // sin FMP: la app usa la búsqueda de Alpha Vantage
    throw new Error('Servicio no disponible: '+server);
  }
};

/* ======================= IA con tu clave de Anthropic ======================= */
let clientP = null;
function getClient(){
  const key = lsGet(K.anth); if(!key) return Promise.reject(Object.assign(new Error('sin clave'), {code:'not_granted'}));
  if(!clientP) clientP = import(SDK_URL).then(m=>{
    const Anthropic = m.default || m.Anthropic;
    return {Anthropic, client: new Anthropic({apiKey:key, dangerouslyAllowBrowser:true, maxRetries:2})};
  }).catch(e=>{ clientP = null; throw e; });
  return clientP;
}
function mapErr(e, Anthropic){
  if(e && e.code && typeof e.code==='string' && !e.status) return e;
  const name = e && e.name;
  if(name==='AbortError' || (Anthropic && Anthropic.APIUserAbortError && e instanceof Anthropic.APIUserAbortError)) return {code:'cancelled'};
  const st = e && e.status;
  const msg = String((e && e.message) || '');
  if(st===401 || st===403) return {code:'bad_key'};
  if(st===429) return {code:'rate_limited'};
  if(st===400 && /too long|too large|prompt is too long/i.test(msg)) return {code:'prompt_too_large'};
  if(st===400 && /credit|billing|balance/i.test(msg)) return {code:'no_credit'};
  if(!st) return {code:'network'};
  return {code:'api_error', status:st};
}
function toApiMessages(msgs){
  // El primer mensaje de la app trae reglas y datos: va como instrucción de sistema
  let system;
  const list = msgs.slice();
  if(list.length>1 && list[0].role==='user' && list[1].role==='user') system = String(list.shift().content);
  const out = [];
  list.forEach(m=>{
    const last = out[out.length-1];
    if(last && last.role===m.role && typeof last.content==='string' && typeof m.content==='string') last.content += '\n\n'+m.content;
    else out.push({role:m.role, content:m.content});
  });
  if(out.length && out[0].role!=='user') out.shift();
  return {system, messages: out};
}
async function fileToImageBlock(file){
  // Reduce la foto (más rápido y barato) y la convierte a JPEG, incluido HEIC del iPhone
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    const max = 1600, sc = Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth*sc); c.height = Math.round(img.naturalHeight*sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', .85).split(',')[1];
    return {type:'image', source:{type:'base64', media_type:'image/jpeg', data}};
  }catch(e){ throw {code:'image_rejected'}; }
  finally{ URL.revokeObjectURL(url); }
}
function parseJsonLoose(text){
  const t = String(text||'').replace(/```(?:json)?/gi,'').trim();
  try{ return JSON.parse(t); }catch(e){}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if(a>=0 && b>a){ try{ return JSON.parse(t.slice(a,b+1)); }catch(e){} }
  throw {code:'invalid_json'};
}
const textOf = msg => (msg.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
// Respaldo automático de modelo si Claude declina una consulta; si la API no lo aceptara, se reintenta sin él
let useFallbacks = true;
const withFallbacks = p => useFallbacks ? Object.assign(p, {betas:[FALLBACK_BETA], fallbacks:'default'}) : p;
const isFallbackReject = e => useFallbacks && e && e.status===400 && /fallback/i.test(String(e.message||''));

// Chat con herramientas: la app pasa {name, description, inputSchema, execute}
async function sample(msgs, opts){
  opts = opts || {};
  const {Anthropic, client} = await getClient();
  const conv = toApiMessages(msgs);
  const tools = (opts.tools||[]).map(t=>({name:t.name, description:t.description, input_schema:t.inputSchema}));
  const byName = Object.fromEntries((opts.tools||[]).map(t=>[t.name, t]));
  let shown = '', truncated = false;
  try{
    for(let turn=0; turn<8; turn++){
      const prefix = shown ? shown+'\n\n' : '';
      let msg;
      for(;;){
        const params = withFallbacks({model:MODEL, max_tokens:16000, messages:conv.messages, output_config:{effort:'low'}});
        if(conv.system) params.system = conv.system;
        if(tools.length) params.tools = tools;
        const stream = client.beta.messages.stream(params, {signal: opts.signal});
        let cur = '';
        stream.on('text', d=>{ cur += d; if(opts.onText) try{ opts.onText({text: prefix+cur}); }catch(e){} });
        try{ msg = await stream.finalMessage(); break; }
        catch(e){ if(isFallbackReject(e) && !cur){ useFallbacks = false; continue; } throw e; }
      }
      const txt = textOf(msg); if(txt) shown = prefix + txt;
      if(msg.stop_reason==='refusal') throw {code:'refused', text: shown};
      const uses = msg.content.filter(b=>b.type==='tool_use');
      if(!uses.length || msg.stop_reason==='max_tokens'){ truncated = msg.stop_reason==='max_tokens'; break; }
      conv.messages.push({role:'assistant', content: msg.content});
      const results = uses.map(u=>{
        const tool = byName[u.name];
        try{
          if(!tool) throw new Error('Herramienta desconocida');
          return {type:'tool_result', tool_use_id:u.id, content: JSON.stringify(tool.execute(u.input||{}))};
        }catch(e){ return {type:'tool_result', tool_use_id:u.id, is_error:true, content: String((e && e.message) || e)}; }
      });
      conv.messages.push({role:'user', content: results});
    }
  }catch(e){ const m = mapErr(e, Anthropic); if(shown && !m.text) m.text = shown; throw m; }
  return {text: shown, truncated};
}
// Respuesta en JSON (análisis del asesor, lectura de tickets y extractos)
sample.json = async function(prompt, opts){
  opts = opts || {};
  const {Anthropic, client} = await getClient();
  try{
    const content = [];
    for(const f of (opts.images||[])) content.push(await fileToImageBlock(f));
    content.push({type:'text', text: prompt + '\n\nResponde únicamente con el JSON, sin texto adicional.'});
    const call = () => client.beta.messages.create(withFallbacks({model:MODEL, max_tokens:16000, output_config:{effort: (opts.images||[]).length ? 'low' : 'medium'},
      messages:[{role:'user', content}]}), {signal: opts.signal});
    let msg;
    try{ msg = await call(); }
    catch(e){ if(!isFallbackReject(e)) throw e; useFallbacks = false; msg = await call(); }
    if(msg.stop_reason==='refusal') throw {code:'refused'};
    return parseJsonLoose(textOf(msg));
  }catch(e){ throw mapErr(e, Anthropic); }
};
sample.limits = async () => ({
  tools:{maxCount: 8},
  images:{mediaTypes:['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'], maxInputBytes: 30*1024*1024}
});

/* ======================= Guardar archivos (hoja de compartir) ======================= */
const downloadsShim = {
  async save({filename, data}){
    const type = /\.csv$/i.test(filename) ? 'text/csv' : 'application/json';
    const file = new File([data], filename, {type});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file], title: filename}); return; }
      catch(e){ if(e && e.name==='AbortError') return; throw e; }
    }
    throw new Error('share_unavailable');   // la app usa la descarga normal
  }
};

/* ======================= Puente con la app ======================= */
window.claude = {
  async use(name){
    if(name==='sample') return lsGet(K.anth) ? sample : (window.nvLocalAdvisor || null);   // sin clave: asesor integrado gratuito
    if(name==='mcp') return mcpShim;
    if(name==='downloads') return downloadsShim;
    return null;   // 'db' y 'user': sin nube, los datos viven en el dispositivo
  }
};

/* ======================= Animaciones ======================= */
function successBurst(kind){
  const map = {expense:['var(--rust)','Gasto añadido'], income:['var(--sage)','Ingreso añadido'], transfer:['var(--dusty)','Transferencia hecha'],
    owed:['var(--teal)','Guardado'], edit:['var(--gold)','Cambios guardados']};
  const [c, label] = map[kind] || map.edit;
  const el = document.createElement('div'); el.className='nv-done'; el.style.setProperty('--c', c);
  el.innerHTML = `<svg viewBox="0 0 64 64"><circle class="ring" cx="32" cy="32" r="28"/><path class="chk" d="M20 33l8 8 16-17"/></svg><b>${label}</b>`;
  document.body.appendChild(el); setTimeout(()=>el.remove(), 1500);
}
function confetti(){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.className='nv-confetti'; document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio||1), W = innerWidth, H = innerHeight;
  cv.width = W*dpr; cv.height = H*dpr; const ctx = cv.getContext('2d'); ctx.scale(dpr,dpr);
  const cols = ['#D8B978','#9CAF88','#B08BBB','#7C93B3','#C97B63','#F3F1EC'];
  const P = Array.from({length:140}, ()=>({x:W/2+(Math.random()-.5)*60, y:H*.35, vx:(Math.random()-.5)*14, vy:-Math.random()*14-4,
    s:5+Math.random()*6, r:Math.random()*6, vr:(Math.random()-.5)*.4, c:cols[(Math.random()*cols.length)|0], sh:Math.random()<.5}));
  const t0 = performance.now();
  (function frame(t){
    const el = t - t0; ctx.clearRect(0,0,W,H);
    P.forEach(p=>{ p.vy += .38; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - el/2600); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if(p.sh) ctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2); else { ctx.beginPath(); ctx.arc(0,0,p.s/2.4,0,6.3); ctx.fill(); } ctx.restore(); });
    if(el < 2600) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}
window.nvConfetti = confetti;

/* ======================= Avisos (dentro de la app y del sistema) ======================= */
let toastBox = null; const toastQueue = []; let toastActive = 0;
function toast(n){
  toastQueue.push(n); pumpToasts();
}
function pumpToasts(){
  if(!toastBox || toastActive>=2 || !toastQueue.length) return;
  const n = toastQueue.shift(); toastActive++;
  const el = document.createElement('div'); el.className='nv-toast'; el.setAttribute('role','status');
  el.innerHTML = `<div class="ti" style="background:${n.color||'var(--gold)'}">${SVG[n.icon]||SVG.bell}</div>
    <div class="tb"><div class="tt">${escH(n.title)}</div>${n.body?`<div class="tx">${escH(n.body)}</div>`:''}</div>
    ${n.actionLabel?`<button class="ta">${escH(n.actionLabel)}</button>`:''}`;
  let gone = false;
  const close = ()=>{ if(gone) return; gone = true; el.classList.add('out'); setTimeout(()=>{ el.remove(); toastActive--; pumpToasts(); }, 300); };
  el.addEventListener('click', e=>{ if(n.action) try{ n.action(); }catch(err){} close(); });
  let sy = null;
  el.addEventListener('touchstart', e=>{ sy = e.touches[0].clientY; }, {passive:true});
  el.addEventListener('touchmove', e=>{ if(sy!==null && e.touches[0].clientY - sy < -18){ sy=null; close(); } }, {passive:true});
  toastBox.appendChild(el);
  haptic(n.haptic || 'light');
  setTimeout(close, n.ms || 5200);
}
async function systemNotify(n){
  if(lsGet(K.sysNotif)!=='1' || !('Notification' in window) || Notification.permission!=='granted') return;
  try{
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(n.title, {body: n.body||'', icon:'icons/icon-192.png', badge:'icons/icon-192.png', tag: n.key, lang:'es'});
  }catch(e){}
}
function notify(n){
  toast(n);
  if(n.system!==false) systemNotify(n);
}
window.nvNotify = notify;

function seenMap(){ try{ return JSON.parse(lsGet(K.seen)||'{}'); }catch(e){ return {}; } }
function markSeen(key){ const m = seenMap(); m[key] = Date.now(); const cut = Date.now()-90*864e5; Object.keys(m).forEach(k=>{ if(m[k]<cut) delete m[k]; }); lsSet(K.seen, JSON.stringify(m)); }
const wasSeen = key => !!seenMap()[key];

function checkAlerts(){
  if(typeof state==='undefined' || !state) return;
  let badge = 0;
  const alertsOn = on(K.alerts);
  const once = (key, n)=>{ if(wasSeen(key)) return; markSeen(key); if(alertsOn) notify(Object.assign({key}, n)); };
  try{
    const mk = monthKey(), today = todayStr();
    // 1. límites de gasto
    SCOPES.forEach(s=>{
      const lim = Number(state.budgets[s.id]||0); if(!(lim>0)) return;
      const spent = state.expenses.filter(e=>e.scope===s.id && monthKey(e.date)===mk).reduce((a,e)=>a+Number(e.amount||0),0);
      const p = spent/lim;
      if(p>=1){ badge++; once(`bud:${mk}:${s.id}:100`, {title:`Límite de ${s.name} superado`, body:`Llevas ${fmt(spent)} de ${fmt(lim)} este mes.`, icon:'alert', color:'var(--rust)', haptic:'warning',
        actionLabel:'Ver', action:()=>goToTab('gastos','limites')}); }
      else if(p>=.8) once(`bud:${mk}:${s.id}:80`, {title:`${s.name}: ${Math.round(p*100)}% del límite`, body:`Te quedan ${fmt(lim-spent)} para el resto del mes.`, icon:'alert', color:'var(--gold)', haptic:'warning'});
    });
    // 2. meta de patrimonio y metas de ahorro
    if(state.goal && state.goal.target>0 && totals().net >= state.goal.target){
      if(!wasSeen('goal:'+state.goal.target)) setTimeout(confetti, 250);
      once('goal:'+state.goal.target, {title:'¡Meta de patrimonio alcanzada! 🎉', body:`Has llegado a ${fmt(state.goal.target)}.`, icon:'target', color:'var(--sage)', haptic:'success'});
    }
    (state.savingsGoals||[]).forEach(g=>{
      const acc = state.items.find(i=>i.id===g.accountId);
      if(acc && Number(acc.amount||0) >= g.target){
        if(!wasSeen('sg:'+g.id+':'+g.target)) setTimeout(confetti, 250);
        once('sg:'+g.id+':'+g.target, {title:`¡${g.name} conseguido! 🎉`, body:`Ya tienes ${fmt(g.target)} ahorrados.`, icon:'target', color:'var(--mauve)', haptic:'success'});
      }
    });
    // 3. dinero que te deben
    state.items.filter(i=>i.cat==='medeben' && Number(i.amount)>0 && i.due).forEach(i=>{
      if(i.due < today){ badge++; once('owed:'+i.id+':late', {title:`${i.name} tiene un pago vencido`, body:`Te debe ${fmt(i.amount)} desde el ${fmtDay(i.due)}.`, icon:'doc', color:'var(--teal)', haptic:'warning', actionLabel:'Ver', action:()=>openOwedSheet()}); }
      else if(i.due === today) once('owed:'+i.id+':today', {title:`Hoy vence el pago de ${i.name}`, body:`${fmt(i.amount)} pendientes.`, icon:'doc', color:'var(--teal)'});
    });
    // 4. movimientos recurrentes generados este mes
    const recs = [...state.expenses, ...state.incomes, ...(state.transfers||[])].filter(r=>r.recurringId && monthKey(r.date)===mk && r.ts > Date.now()-10*60e3 && r.id!==r.recurringId);
    if(recs.length) once('rec:'+mk, {title:'Recurrentes del mes registrados', body:`${recs.length} ${recs.length===1?'movimiento añadido':'movimientos añadidos'} automáticamente.`, icon:'repeat', color:'var(--dusty)'});
    // 5. copia de seguridad (solo si hay datos)
    const hasData = state.items.length + state.expenses.length + state.incomes.length > 0;
    const lb = Number(lsGet(K.lastBackup)||0);
    if(hasData && isStandalone() && Date.now()-lb > 30*864e5) once('backup:'+mk, {title:'Haz una copia de seguridad', body:'Tus datos solo están en este iPhone. Guárdalos en Archivos o iCloud Drive.', icon:'doc', color:'var(--gold)', system:false,
      actionLabel:'Copiar', action:()=>{ try{ exportBackup(); }catch(e){} }, ms:8000});
    // 6. recordatorio diario (solo dentro de la app, por la noche)
    if(on(K.daily) && new Date().getHours()>=20 && hasData){
      const todayMoves = [...state.expenses, ...state.incomes].some(e=>e.date===today);
      if(!todayMoves) once('daily:'+today, {title:'¿Apuntas los gastos de hoy?', body:'Un minuto ahora y tus números cuadran.', icon:'bell', color:'var(--rust)', system:false, actionLabel:'Añadir', action:()=>openExpenseSheet('expense')});
    }
  }catch(e){}
  try{
    if(navigator.setAppBadge){ if(badge>0) navigator.setAppBadge(badge); else navigator.clearAppBadge && navigator.clearAppBadge(); }
  }catch(e){}
}
let alertT = null;
const scheduleAlerts = () => { clearTimeout(alertT); alertT = setTimeout(checkAlerts, 700); };

/* ======================= Face ID ======================= */
const faceIdAvailable = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
async function faceIdSetup(){
  const cred = await navigator.credentials.create({publicKey:{
    challenge: rand(32), rp:{name:'Finanzas', id: location.hostname},
    user:{id: rand(16), name:'finanzas', displayName:'Finanzas'},
    pubKeyCredParams:[{type:'public-key', alg:-7},{type:'public-key', alg:-257}],
    authenticatorSelection:{authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged'},
    timeout:60000, attestation:'none'}});
  lsSet(K.faceid, b64url(cred.rawId));
}
let faceIdBusy = false;
async function faceIdUnlock(){
  const id = lsGet(K.faceid); if(!id || faceIdBusy) return false;
  faceIdBusy = true;
  try{
    await navigator.credentials.get({publicKey:{challenge: rand(32), allowCredentials:[{type:'public-key', id: unb64url(id), transports:['internal','hybrid']}],
      userVerification:'required', timeout:60000, rpId: location.hostname}});
    haptic('success'); closePinOverlay(); return true;
  }catch(e){ return false; }
  finally{ faceIdBusy = false; }
}
window.nvFaceIdUnlock = faceIdUnlock;
async function toggleFaceId(){
  if(lsGet(K.faceid)){ lsSet(K.faceid, null); haptic('light'); renderPinSettings(); return; }
  try{ await faceIdSetup(); haptic('success'); notify({title:'Face ID activado', body:'Ya puedes abrir la app con tu cara.', icon:'check', color:'var(--sage)', system:false}); }
  catch(e){ haptic('error'); notify({title:'No se pudo activar Face ID', body: e && e.name==='NotAllowedError' ? 'Se canceló la verificación.' : 'Tu dispositivo no lo permite aquí.', icon:'alert', color:'var(--rust)', system:false}); }
  renderPinSettings();
}
window.nvToggleFaceId = toggleFaceId;

/* ======================= Ajustes nuevos ======================= */
function sw(id, onState, fn, disabled){ return `<button class="switch ${onState?'on':''}" ${disabled?'disabled':''} role="switch" aria-checked="${onState?'true':'false'}" onclick="${fn}"></button>`; }
function renderNativeSettings(){
  const box = document.getElementById('nativeCard'); if(!box) return;
  const hasN = 'Notification' in window;
  const perm = hasN ? Notification.permission : 'unsupported';
  const sysOn = lsGet(K.sysNotif)==='1' && perm==='granted';
  let sysHint = 'Los avisos aparecen también en el centro de notificaciones y en el icono.';
  if(!isStandalone() && isIOS) sysHint = 'Primero instala la app en tu pantalla de inicio (ver abajo).';
  else if(!hasN) sysHint = 'Este navegador no admite notificaciones.';
  else if(perm==='denied') sysHint = 'Bloqueadas. Actívalas en Ajustes del iPhone › Notificaciones › Finanzas.';
  const sysDisabled = !hasN || perm==='denied' || (isIOS && !isStandalone());
  box.innerHTML = `<div class="nv-rows">
    <div class="nrow"><div><div class="t">Vibración</div><div class="s">Toques sutiles al pulsar, guardar o equivocarte con el PIN.</div></div>${sw('h', on(K.haptics), "nvSet('haptics')")}</div>
    <div class="nrow"><div><div class="t">Avisos</div><div class="s">Límites de gasto, metas alcanzadas, cobros que vencen y recurrentes.</div></div>${sw('a', on(K.alerts), "nvSet('alerts')")}</div>
    <div class="nrow ${sysDisabled?'off':''}"><div><div class="t">Notificaciones del sistema</div><div class="s">${sysHint}</div></div>${sw('n', sysOn, "nvSet('sysNotif')", sysDisabled)}</div>
    <div class="nrow"><div><div class="t">Recordatorio por la noche</div><div class="s">A partir de las 20:00, si no has apuntado nada hoy.</div></div>${sw('d', on(K.daily), "nvSet('daily')")}</div>
    <div class="nrow"><div class="s">¿Quieres ver cómo queda?</div><button class="btn-link" onclick="nvTestNotify()">Probar aviso</button></div>
  </div>`;
}
window.nvSet = async function(which){
  if(which==='sysNotif'){
    if(lsGet(K.sysNotif)==='1'){ lsSet(K.sysNotif,'0'); }
    else{
      try{ const p = await Notification.requestPermission(); lsSet(K.sysNotif, p==='granted' ? '1' : '0'); if(p==='granted') haptic('success'); }catch(e){}
    }
  } else { const k = K[which]; lsSet(k, on(k) ? '0' : '1'); }
  if(which==='haptics' && on(K.haptics)) haptic('medium');
  renderNativeSettings(); scheduleAlerts();
};
window.nvTestNotify = function(){
  notify({key:'test', title:'Así se verán tus avisos', body:'Por ejemplo, cuando superes un límite de gasto.', icon:'bell', color:'var(--gold)', haptic:'success'});
};

function renderConnections(){
  const box = document.getElementById('connCard'); if(!box) return;
  const ak = lsGet(K.anth), vk = lsGet(K.av);
  const mask = k => k ? '••••' + k.slice(-4) : '';
  box.innerHTML = `
  <div class="nv-conn">
    <div class="ch"><div><div class="n">Asesor financiero</div><div class="s">${ak ? 'Claude, con tu clave de Anthropic (de pago)' : 'Integrado · gratis, privado y sin internet'}</div></div>
      <span class="pill ok">Activo</span></div>
    ${ak ? `<div class="nv-keyset"><code>${mask(ak)}</code><button class="btn-link" onclick="nvRemoveKey('anth')" style="color:var(--rust)">Volver al gratuito</button></div>`
         : `<div class="hintx" style="margin-top:0;">Analiza tus gastos, límites, deudas, colchón y metas directamente en el iPhone. No envía tus datos a ningún sitio.</div>
            <details class="nv-more"><summary>Opcional: usar Claude (de pago, con chat libre y lectura de tickets)</summary>
            <div class="nv-keyrow" style="margin-top:10px;"><input id="nvAnthKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-..."><button onclick="nvSaveKey('anth')">Guardar</button></div>
            <div class="err" id="nvAnthErr"></div>
            <div class="hintx">Requiere una clave de <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> con saldo: la API se paga aparte de tu suscripción de Claude (unos céntimos por consulta).</div></details>`}
  </div>
  <div class="nv-conn">
    <div class="ch"><div><div class="n">Precios de bolsa</div><div class="s">Alpha Vantage · clave gratuita, 25 consultas al día</div></div>
      <span class="pill ${vk?'ok':'no'}">${vk?'Conectado':'Sin configurar'}</span></div>
    ${vk ? `<div class="nv-keyset"><code>${mask(vk)}</code><button class="btn-link" onclick="nvRemoveKey('av')" style="color:var(--rust)">Quitar</button></div>`
         : `<div class="nv-keyrow"><input id="nvAvKey" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Tu clave de Alpha Vantage"><button onclick="nvSaveKey('av')">Guardar</button></div>
            <div class="err" id="nvAvErr"></div>
            <div class="hintx">Pídela gratis en <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener">alphavantage.co</a> (solo un email).</div>`}
  </div>
  <div class="nv-conn">
    <div class="ch"><div><div class="n">Criptomonedas y divisas</div><div class="s">Crypto.com y Banco Central Europeo · sin clave</div></div><span class="pill ok">Activo</span></div>
  </div>`;
}
window.nvSaveKey = async function(which){
  const inp = document.getElementById(which==='anth'?'nvAnthKey':'nvAvKey'), err = document.getElementById(which==='anth'?'nvAnthErr':'nvAvErr');
  const v = (inp.value||'').trim(); if(!v) return;
  err.textContent = 'Comprobando…'; err.style.color = 'var(--ink3)';
  try{
    if(which==='anth'){
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {headers:{'x-api-key':v, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'}});
      if(r.status===401 || r.status===403) throw new Error('Esa clave no es válida.');
      if(!r.ok) throw new Error('No se pudo comprobar ahora (error '+r.status+'). Inténtalo de nuevo.');
      lsSet(K.anth, v);
    } else {
      const t = await (await fetch('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey='+encodeURIComponent(v))).text();
      if(/invalid api ?key|apikey is invalid/i.test(t)) throw new Error('Esa clave no es válida.');
      lsSet(K.av, v);
      try{ const q = JSON.parse(localStorage.getItem('finzz_av')||'{}'); q.blocked=false; localStorage.setItem('finzz_av', JSON.stringify(q)); }catch(e){}
    }
    haptic('success');
    location.reload();   // vuelve a conectar el asesor y los precios con la clave nueva
  }catch(e){
    haptic('error'); err.style.color = ''; err.textContent = (e && e.message && !/fetch/i.test(e.message)) ? e.message : 'Sin conexión. Inténtalo de nuevo.';
  }
};
window.nvRemoveKey = function(which){
  if(!confirm(which==='anth' ? '¿Quitar la clave de Anthropic y volver al asesor gratuito integrado?' : '¿Quitar la clave de Alpha Vantage?')) return;
  lsSet(which==='anth'?K.anth:K.av, null); haptic('warning'); location.reload();
};

/* ======================= Ganchos sobre la app ======================= */
function wrap(name, after, before){
  const orig = window[name]; if(typeof orig!=='function') return;
  window[name] = function(...args){
    const ctx = before ? before(...args) : undefined;
    const r = orig.apply(this, args);
    try{ after && after(ctx, r, ...args); }catch(e){}
    return r;
  };
}
const sheetOpen = () => document.getElementById('expenseSheet').classList.contains('show');

function installHooks(){
  // Interfaz base
  toastBox = document.createElement('div'); toastBox.className='nv-toasts'; document.body.appendChild(toastBox);
  const icon = 'icons/icon-180.png';
  const cover = document.createElement('div'); cover.className='nv-cover'; cover.innerHTML = `<img src="${icon}" alt="">`; document.body.appendChild(cover);
  if(isStandalone()){ const sp = document.createElement('div'); sp.className='nv-splash'; sp.innerHTML = `<img src="${icon}" alt="">`; document.body.appendChild(sp); setTimeout(()=>sp.remove(), 1200); }

  // Botón de Face ID en la pantalla del PIN
  const pinBox = document.querySelector('#pinOverlay .pin-box');
  if(pinBox){
    const b = document.createElement('button'); b.className='nv-faceid'; b.id='nvFaceIdBtn'; b.type='button';
    b.innerHTML = SVG.faceid + 'Usar Face ID'; b.onclick = ()=>faceIdUnlock();
    pinBox.insertBefore(b, document.getElementById('pinCancelBtn'));
  }

  // Vibración al tocar cualquier control
  document.addEventListener('click', e=>{
    if(inHaptic) return;
    const t = e.target.closest && e.target.closest('button, .tap, .walletcard, .scopechip, .owedcard, .legend .li, [onclick]');
    if(!t || t.disabled) return;
    if(t.matches('.sheetadd')) return;                         // guardar tiene su propia vibración (éxito o error)
    haptic(t.matches('.tabplus, .quickbtn') ? 'medium' : 'select');
  }, true);

  // Guardar movimientos: confirmación animada + vibración
  wrap('submitExpense', (ctx)=>{
    if(!sheetOpen()){ haptic('success'); successBurst(ctx.editing ? 'edit' : ctx.type); }
    else if(document.getElementById('sheetError').textContent) haptic('error');
  }, ()=>({type: typeof sheetType!=='undefined' ? sheetType : 'expense', editing: typeof editing!=='undefined' && !!editing}));
  wrap('deleteMovement', ()=>haptic('warning'));
  wrap('deletePortfolio', ()=>haptic('warning'));
  wrap('removeItem', ()=>haptic('warning'));
  wrap('payDebt', (ctx, r, id)=>{ const it = state.items.find(i=>i.id===id); if(!it || !(Number(it.amount)>0.004)){ haptic('success'); confetti(); } else haptic('success'); });
  wrap('collectDebt', ()=>haptic('success'));
  wrap('collectPart', ()=>haptic('success'));
  wrap('confirmProposal', ()=>haptic('success'));
  wrap('setGoal', ()=>haptic('success'));
  wrap('addSavingsGoal', ()=>haptic('success'));
  wrap('doUndo', ()=>haptic('medium'));
  wrap('manualSnapshot', ()=>haptic('success'));
  wrap('exportBackup', ()=>lsSet(K.lastBackup, String(Date.now())));

  // PIN: vibración y sacudida al fallar, Face ID como atajo
  wrap('handlePinComplete', ()=>{
    const ov = document.getElementById('pinOverlay');
    if(!ov.classList.contains('show')){ haptic('success'); return; }
    if(document.getElementById('pinError').textContent){
      haptic('error');
      const d = document.getElementById('pinDots'); d.classList.remove('nv-shake'); void d.offsetWidth; d.classList.add('nv-shake');
    }
  });
  wrap('openPinOverlay', (ctx, r, mode)=>{
    const b = document.getElementById('nvFaceIdBtn');
    const can = mode==='unlock' && !!lsGet(K.faceid) && faceIdAvailable();
    if(b) b.classList.toggle('show', can);
    if(can) setTimeout(()=>faceIdUnlock(), 350);
  });
  // Al quitar el PIN, Face ID también se desactiva
  wrap('renderPinSettings', ()=>{
    const box = document.getElementById('pinSettingsCard'); if(!box) return;
    if(!state.pin){ if(lsGet(K.faceid)) lsSet(K.faceid, null); return; }
    if(!faceIdAvailable()) return;
    const onF = !!lsGet(K.faceid);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid var(--hair);';
    row.innerHTML = `<div><div style="font-size:14.5px;font-weight:600;">Desbloquear con Face ID</div><div style="font-size:12.5px;color:var(--ink2);margin-top:2px;">El PIN sigue sirviendo como alternativa.</div></div>${sw('f', onF, 'nvToggleFaceId()')}`;
    box.appendChild(row);
  });

  // Cuenta e instalación: versión para iPhone
  window.renderAccount = function(){
    const box = document.getElementById('acctCard'); if(!box) return;
    const lb = Number(lsGet(K.lastBackup)||0);
    const days = lb ? Math.floor((Date.now()-lb)/864e5) : null;
    const last = lb ? (days===0 ? 'hoy' : days===1 ? 'ayer' : 'hace '+days+' días') : 'nunca';
    box.innerHTML = `<div class="acct-top">
        <div class="icn" style="width:52px;height:52px;border-radius:16px;background:${iconBg('var(--gold)')};color:var(--gold)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg></div>
        <div style="min-width:0;"><div class="acct-name">Este iPhone</div><div class="acct-sub">Tu app privada</div>
        <span class="acct-pill" style="color:var(--sage);background:color-mix(in srgb, var(--sage) 15%, transparent);"><i></i>Guardado en el dispositivo</span></div>
      </div>
      <div class="acct-how">Tus datos <b>no salen de este iPhone</b>: no hay servidor, cuenta ni nube. Por eso conviene que hagas una <b>copia de seguridad</b> de vez en cuando (más abajo) y la guardes en Archivos o iCloud Drive.
        <div style="margin-top:8px;">Última copia: <b>${last}</b></div></div>`;
  };
  window.copyAppUrl = async function(){
    const b = document.getElementById('copyBtn');
    try{ await navigator.clipboard.writeText(location.origin+location.pathname); b.textContent='Copiado ✓'; haptic('success'); }catch(e){ b.textContent='Mantén pulsado'; }
    setTimeout(()=>{ b.textContent='Copiar'; }, 1800);
  };
  window.renderInstall = function(){
    const box = document.getElementById('installCard'); if(!box) return;
    const url = location.origin + location.pathname;
    if(isStandalone()){
      box.innerHTML = `<div class="ic-head"><img src="${icon}" alt=""><div><div class="ic-t">Instalada ✓</div><div class="ic-s">Funciona sin conexión y se actualiza sola cuando hay internet.</div></div></div>`;
      return;
    }
    box.innerHTML = `<div class="ic-head"><img src="${icon}" alt=""><div><div class="ic-t">Finanzas en tu pantalla de inicio</div><div class="ic-s">Pantalla completa, sin conexión y con notificaciones</div></div></div>
      <ol class="steps">
        <li><span>Abre esta dirección en <b>Safari</b> en tu iPhone.</span></li>
        <li><span>Toca <span class="k">Compartir ⬆︎</span> en la barra inferior.</span></li>
        <li><span>Elige <span class="k">Añadir a pantalla de inicio</span> y toca <span class="k">Añadir</span>.</span></li>
        <li><span>Abre <b>Finanzas</b> desde el icono nuevo.</span></li></ol>
      <div class="linkrow"><code>${escH(url.replace(/^https?:\/\//,''))}</code><button id="copyBtn" onclick="copyAppUrl()">Copiar</button></div>
      <div class="ic-note">Los datos de Safari y los de la app instalada son independientes: empieza a usarla desde el icono.</div>`;
  };
  wrap('renderInstallBanner', ()=>{ if(isStandalone()){ const b = document.getElementById('installBanner'); if(b) b.innerHTML=''; } });

  // Pinta lo nuevo con cada actualización de la app
  wrap('renderAll', ()=>{ renderConnections(); renderNativeSettings(); scheduleAlerts(); });
  wrap('save', scheduleAlerts);

  // Mensajes de error de la IA propios de esta versión
  try{
    ADV_ERR.bad_key = 'Tu clave de Anthropic no es válida o ha caducado. Cámbiala en Más › Ajustes › Conexiones.';
    ADV_ERR.no_credit = 'Tu cuenta de Anthropic no tiene saldo. Añade crédito en console.anthropic.com.';
    ADV_ERR.network = 'Sin conexión a internet. Inténtalo cuando tengas cobertura.';
    ADV_ERR.not_granted = 'Añade tu clave de Anthropic en Más › Ajustes › Conexiones para usar el asesor.';
  }catch(e){}

  // Privacidad: tapa los importes en el selector de apps y vuelve a pedir el PIN tras 1 minuto fuera
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ hiddenAt = Date.now(); if(state && state.pin) document.body.classList.add('nv-covered'); return; }
    if(state && state.pin && hiddenAt && Date.now()-hiddenAt > 60e3 && !document.getElementById('pinOverlay').classList.contains('show')) openPinOverlay('unlock');
    document.body.classList.remove('nv-covered');
    scheduleAlerts();
  });
  window.addEventListener('pagehide', ()=>{ if(state && state.pin) document.body.classList.add('nv-covered'); });

  renderConnections(); renderNativeSettings(); try{ renderAccount(); renderInstall(); renderInstallBanner(); renderPinSettings(); }catch(e){}
  // Si al abrir ya estaba la pantalla del PIN, prepara Face ID
  if(document.getElementById('pinOverlay').classList.contains('show') && lsGet(K.faceid) && faceIdAvailable()){
    const b = document.getElementById('nvFaceIdBtn'); if(b) b.classList.add('show');
    setTimeout(()=>faceIdUnlock(), 600);
  }
  scheduleAlerts();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', installHooks); else installHooks();

/* ======================= Service worker ======================= */
if('serviceWorker' in navigator && window.isSecureContext){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
})();
