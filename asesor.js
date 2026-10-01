/* =====================================================================
   Finanzas · asesor integrado (sin IA, gratis y sin conexión)
   Analiza los datos del propio iPhone con reglas de finanzas personales:
   gasto frente a tu media, límites, suscripciones, deudas por TAE,
   colchón de emergencia, tasa de ahorro, plazo de tu meta y concentración.
   Se usa cuando no hay clave de Anthropic configurada.
   ===================================================================== */
(function(){
'use strict';
const r0 = n => Math.round(Number(n)||0);
const FIXED = /vivienda|salud|alquiler|hipoteca/i;
const wait = (ms, signal) => new Promise((res, rej)=>{
  const t = setTimeout(res, ms);
  if(signal) signal.addEventListener('abort', ()=>{ clearTimeout(t); rej({code:'cancelled'}); }, {once:true});
});

/* ---------- datos ---------- */
function data(){
  const c = finContext();
  const past = c.ultimos_meses.slice(0,3).filter(m=>m.ingresos||m.gastos);
  const cur = c.ultimos_meses[3] || {ingresos:0, gastos:0, ahorro:0};
  const avg = k => past.length ? past.reduce((a,m)=>a+m[k],0)/past.length : cur[k];
  const liquid = state.items.filter(i=>LIQUID_CATS.includes(i.cat)).reduce((s,i)=>s+toEUR(i),0);
  return {c, cur, inc: avg('ingresos'), out: avg('gastos'), sav: c.ahorro_mensual_medio.importe, basis: c.ahorro_mensual_medio.calculado_sobre,
    liquid, hasMoves: (state.expenses.length + state.incomes.length) > 0};
}
const debtsByTae = c => c.deudas.filter(d=>d.saldo>0).sort((a,b)=>(b.tae||0)-(a.tae||0) || b.saldo-a.saldo);
const overAvg = c => c.gastos_por_ambito.filter(s=>s.media_mensual_3m>=20 && s.este_mes > s.media_mensual_3m*1.2).sort((a,b)=>(b.este_mes-b.media_mensual_3m)-(a.este_mes-a.media_mensual_3m));

/* ---------- análisis completo ("Analizar mis finanzas") ---------- */
function analysis(){
  const D = data(), c = D.c, acts = [];
  const add = (score, titulo, detalle, impacto, categoria) => acts.push({score, titulo, detalle, impacto_mensual_eur: Math.max(0, r0(impacto)), categoria});

  // Deudas: primero la de mayor TAE (método avalancha)
  const debts = debtsByTae(c);
  if(debts.length){
    const d = debts[0], intMes = d.tae ? d.saldo*d.tae/100/12 : 0;
    let det = `${d.nombre}: ${fmt(d.saldo)} pendientes` + (d.tae ? ` al ${d.tae}% TAE, unos ${fmt(intMes)} de intereses al mes.` : '.');
    if(d.con_50_extra && d.meses_restantes && d.intereses_pendientes!=null)
      det += ` Pagando 50 € más al mes la saldas en ${fmtMonths(d.con_50_extra.meses)} en vez de ${fmtMonths(d.meses_restantes)} y te ahorras ${fmt(Math.max(0, d.intereses_pendientes - d.con_50_extra.intereses))} de intereses.`;
    else if(debts.length>1) det += ' Es la más cara: paga el mínimo en las demás y el extra a esta.';
    else if(!d.tae) det += ' Añade su TAE y su cuota en Cartera para calcular cuánto te ahorrarías adelantando pagos.';
    add(40 + (d.tae||0)*3 + intMes, d.tae>=7 ? `Prioriza la deuda ${d.nombre}` : `Plan para saldar ${d.nombre}`, det, 0, 'Deuda');
  }
  // Ámbitos por encima de tu media o del límite
  overAvg(c).filter(s=>!FIXED.test(s.ambito)).slice(0,2).forEach(s=>{
    const diff = s.este_mes - s.media_mensual_3m;
    add(diff, `Frena el gasto en ${s.ambito}`, `Este mes llevas ${fmt(s.este_mes)}, frente a ${fmt(s.media_mensual_3m)} de media: ${fmt(diff)} más de lo habitual. Volver a tu media libera ese dinero.`,
      Math.min(diff, s.media_mensual_3m), s.ambito);
  });
  c.gastos_por_ambito.filter(s=>s.limite && s.este_mes > s.limite && !acts.some(a=>a.categoria===s.ambito)).forEach(s=>{
    add(30 + s.este_mes - s.limite, `Has superado el límite de ${s.ambito}`, `${fmt(s.este_mes)} de ${fmt(s.limite)} este mes. Evita nuevos gastos aquí hasta fin de mes o ajusta el límite si era poco realista.`,
      Math.min(s.este_mes - s.limite, s.media_mensual_3m || s.este_mes), s.ambito);
  });
  // Mayor gasto variable: recorte del 15 %
  const disc = c.gastos_por_ambito.filter(s=>!FIXED.test(s.ambito) && s.media_mensual_3m>=40 && !acts.some(a=>a.categoria===s.ambito))
    .sort((a,b)=>b.media_mensual_3m-a.media_mensual_3m)[0];
  if(disc){
    const cut = Math.max(10, Math.round(disc.media_mensual_3m*0.15/5)*5);
    add(cut*1.5, `Recorta un 15 % en ${disc.ambito}`, `Es tu mayor gasto variable: ${fmt(disc.media_mensual_3m)} al mes de media. Bajarlo a ${fmt(disc.media_mensual_3m - cut)} son ${fmt(cut*12)} más al año.`, cut, disc.ambito);
  }
  // Suscripciones y cargos fijos
  const subs = c.gastos_por_ambito.find(s=>/suscrip/i.test(s.ambito));
  const recG = c.recurrentes.filter(r=>r.tipo==='gasto'), recTot = recG.reduce((a,r)=>a+r.importe,0);
  const subBase = Math.max(subs ? subs.media_mensual_3m : 0, recTot);
  if(subBase>=15 && !acts.some(a=>/suscrip/i.test(a.categoria))){
    const cut = Math.max(5, Math.round(subBase*0.2));
    const names = recG.map(r=>r.concepto).filter(Boolean);
    add(cut*1.3, 'Revisa suscripciones y recurrentes', `Pagas unos ${fmt(subBase)} al mes en cargos fijos${names.length?` (${names.slice(0,3).join(', ')}${names.length>3?'…':''})`:''}. Cancelar lo que no uses suele liberar en torno a un 20 %.`, cut, 'Suscripciones');
  }
  // Colchón de emergencia (3 meses de gastos)
  if(D.out>0){
    const m = D.liquid / D.out;
    if(m<3) add(35 - m*8, m<1 ? 'Crea un colchón de emergencia' : 'Completa tu colchón de emergencia',
      `Tienes ${fmt(D.liquid)} en efectivo y bancos: ${m.toFixed(1).replace('.',',')} meses de gastos. Lo recomendable son 3 meses (${fmt(D.out*3)}) antes de asumir más riesgos.`, 0, 'Ahorro');
  }
  // Tasa de ahorro
  if(D.inc>0){
    const rate = D.sav / D.inc;
    if(rate < 0.1){
      const target = D.inc*0.1;
      add(25 + Math.max(0, target - D.sav)*0.5, 'Automatiza ahorrar el 10 %',
        D.sav<0 ? `Gastas más de lo que ingresas: ${fmt(-D.sav)} al mes de media. Programa una transferencia a ahorro el día que cobras, aunque sea pequeña, y revisa los ámbitos de arriba.`
                : `Ahorras el ${Math.round(rate*100)} % de tus ingresos (${fmt(D.sav)} al mes). Llegar al 10 % son ${fmt(target)}: prográmalo el día que cobras para no tener que pensarlo.`,
        Math.min(Math.max(0, target - D.sav), D.out*0.1), 'Ahorro');
    }
  }
  // Concentración de inversiones (sin recomendar comprar ni vender)
  const inv = c.inversiones;
  if(inv && inv.total_eur>0 && inv.posiciones.length){
    const top = inv.posiciones[0];
    if(top.peso_en_inversion_pct>=40) add(15, 'Tu inversión está muy concentrada', `${top.nombre} es el ${String(top.peso_en_inversion_pct).replace('.',',')} % de lo invertido. Depender de un solo activo aumenta el riesgo; la diversificación lo reparte.`, 0, 'Ahorro');
    if(inv.peso_en_patrimonio_pct>=70) add(12, 'Mucho patrimonio expuesto al mercado', `El ${inv.peso_en_patrimonio_pct} % de tu patrimonio está invertido. Asegúrate de tener el colchón de emergencia fuera de la inversión.`, 0, 'Ahorro');
  }
  // Rellenos si faltan datos
  const fill = [
    [!D.hasMoves, 5, 'Registra tus movimientos un mes', 'Apunta ingresos y gastos durante un mes completo: con eso el análisis podrá darte cifras concretas de ahorro.', 'Ahorro'],
    [!Object.keys(state.budgets||{}).length, 4, 'Ponte límites de gasto', 'Define un tope mensual en tus 2 o 3 ámbitos más grandes (Gastos › Límites). Te avisaré al llegar al 80 % y al 100 %.', 'Ahorro'],
    [!primaryGoal(), 3, 'Define una meta', 'Ponte una meta de patrimonio en Inicio o una meta de ahorro en Más › Metas para medir cuánto te falta y cuándo llegas.', 'Ahorro'],
    [true, 1, 'Revisa tus números cada semana', 'Dedicar 5 minutos los domingos a mirar el mes ayuda a corregir a tiempo los ámbitos que se disparan.', 'Ahorro'],
  ];
  fill.forEach(([cond, s, t, d, cat])=>{ if(cond && acts.length<3) add(s, t, d, 0, cat); });

  acts.sort((a,b)=>b.score-a.score);
  // Resumen y alerta
  const P = c.patrimonio, g = primaryGoal();
  let resumen = `Tu patrimonio neto es de ${fmt(P.neto)} (${fmt(P.activos)} en activos y ${fmt(P.deudas)} en deudas). `;
  resumen += D.hasMoves ? `Ahorras de media ${fmt(D.sav)} al mes (${D.basis}). ` : 'Aún no hay movimientos suficientes para calcular tu ritmo de ahorro. ';
  if(g){ const m = monthsTo(g.remaining, D.sav); resumen += m===0 ? `Ya has alcanzado tu meta «${g.name}».` : m===null ? `A este ritmo no llegarías a «${g.name}»: te faltan ${fmt(g.remaining)}.` : `Te faltan ${fmt(g.remaining)} para «${g.name}»: llegas en ${fmtMonths(m)}.`; }
  let alerta = '';
  const top = debtsByTae(c)[0];
  if(D.hasMoves && D.sav<0) alerta = `Estás gastando más de lo que ingresas: ${fmt(-D.sav)} al mes de media.`;
  else if(D.out>0 && D.liquid/D.out < 1) alerta = 'Tu dinero disponible no cubre ni un mes de gastos.';
  else if(top && top.tae>=15) alerta = `${top.nombre} tiene un ${top.tae}% TAE: es dinero caro, conviene saldarla cuanto antes.`;
  else { const ex = c.gastos_por_ambito.find(s=>s.limite && s.este_mes > s.limite); if(ex) alerta = `Has superado tu límite de ${ex.ambito} este mes.`; }
  return {resumen: resumen.trim(), alerta, acciones: acts.slice(0,5).map(({score, ...a})=>a)};
}

/* ---------- respuestas del chat ---------- */
function ans(q){
  const t = normTxt(q), D = data(), c = D.c, mk = monthKey();
  const has = re => re.test(t);
  const list = arr => arr.map(x=>'- '+x).join('\n');

  if(has(/deuda|prestamo|tarjeta|credito|debo|tae|amortiz/)){
    const ds = debtsByTae(c);
    if(!ds.length) return 'No tienes deudas registradas. 🎉 Si tienes alguna, añádela en **Cartera › Otros** con su TAE y su cuota y te diré cuál conviene pagar primero.';
    return `**Paga primero la de mayor TAE** (método avalancha): cubre el mínimo en todas y destina cualquier extra a la primera de la lista.\n\n` +
      list(ds.map((d,i)=>`**${i+1}. ${d.nombre}**: ${fmt(d.saldo)}${d.tae?` · ${d.tae}% TAE`:' · sin TAE registrada'}${d.cuota?` · cuota ${fmt(d.cuota)}`:''}${d.meses_restantes?` · ${fmtMonths(d.meses_restantes)} restantes`:''}`)) +
      (ds[0].con_50_extra && ds[0].meses_restantes ? `\n\nCon **50 € más al mes** en ${ds[0].nombre} terminas en ${fmtMonths(ds[0].con_50_extra.meses)} y te ahorras ${fmt(Math.max(0,(ds[0].intereses_pendientes||0)-ds[0].con_50_extra.intereses))} en intereses.` : '');
  }
  if(has(/suscrip|recurrent|fijo|cuota/)){
    const r = c.recurrentes.filter(x=>x.tipo==='gasto');
    if(!r.length) return 'No tienes gastos recurrentes registrados. Marca **«Repetir cada mes»** al añadir un gasto fijo (alquiler, gimnasio, Netflix…) y se apuntará solo cada mes.';
    const tot = r.reduce((a,x)=>a+x.importe,0);
    return `Tus cargos fijos suman **${fmt(tot)} al mes** (${fmt(tot*12)} al año):\n\n${list(r.sort((a,b)=>b.importe-a.importe).map(x=>`${x.concepto||'Sin nombre'}: ${fmt(x.importe)}`))}\n\nRepasa cuáles usas de verdad: cancelar uno de ${fmt(r[r.length-1].importe)} son ${fmt(r[r.length-1].importe*12)} al año.`;
  }
  if(has(/invers|cartera|cripto|bolsa|accion|etf|bitcoin|diversif/)){
    const inv = c.inversiones;
    if(!inv || !inv.total_eur) return 'Aún no tienes inversiones registradas. Puedes añadirlas en **Cartera › Bolsa** o **Crypto**.';
    return `Tienes **${fmt(inv.total_eur)} invertidos**${inv.peso_en_patrimonio_pct!=null?`, el ${inv.peso_en_patrimonio_pct} % de tu patrimonio`:''}:\n\n` +
      list(inv.posiciones.slice(0,6).map(p=>`${p.nombre}: ${fmt(p.valor_eur)} (${String(p.peso_en_inversion_pct).replace('.',',')} %)${p.rentabilidad_pct!=null?` · ${p.rentabilidad_pct>=0?'+':''}${String(p.rentabilidad_pct).replace('.',',')} %`:''}`)) +
      (inv.posiciones[0] && inv.posiciones[0].peso_en_inversion_pct>=40 ? `\n\nOjo: **${inv.posiciones[0].nombre}** concentra mucho peso. Repartir entre más activos reduce el riesgo.` : '') +
      '\n\nNo recomiendo comprar ni vender valores concretos: para eso, consulta a un profesional.';
  }
  if(has(/colchon|emergencia|imprevist|fondo/)){
    if(!(D.out>0)) return `Tienes ${fmt(D.liquid)} en efectivo y bancos. Registra tus gastos para que pueda decirte cuántos meses te cubre.`;
    const m = D.liquid/D.out;
    return `Tienes **${fmt(D.liquid)}** disponibles, que cubren **${m.toFixed(1).replace('.',',')} meses** de tus gastos (${fmt(D.out)} al mes de media).\n\nLo recomendable son **3 a 6 meses**: entre ${fmt(D.out*3)} y ${fmt(D.out*6)}.` + (m<3 ? ` Te faltan ${fmt(D.out*3 - D.liquid)} para el mínimo.` : ' Vas bien cubierto. ✓');
  }
  if(has(/ahorr|meta|objetivo|llegar|cuanto tengo que/)){
    const g = primaryGoal();
    if(!g) return `Ahora ahorras de media **${fmt(D.sav)} al mes** (${D.basis}). Ponte una meta en **Inicio** o en **Más › Metas** y te calculo cuánto tienes que apartar y cuándo llegas.`;
    const m = t.match(/(\d+)\s*(ano|anos|mes|meses)/); let months = 12;
    if(m) months = /^ano/.test(m[2]) ? Number(m[1])*12 : Number(m[1]);
    if(g.remaining<=0) return `¡Ya has alcanzado **${g.name}**! 🎉 Puedes ponerte una meta nueva.`;
    const need = g.remaining / months, base = monthsTo(g.remaining, D.sav);
    return `Para **${g.name}** te faltan **${fmt(g.remaining)}**.\n\n- En ${fmtMonths(months)} necesitas ahorrar **${fmt(need)} al mes**.\n- Ahora ahorras ${fmt(D.sav)} al mes${base===null?', así que a este ritmo no llegarías':` y llegarías en ${fmtMonths(base)}`}.` +
      (need > D.sav ? `\n\nTe faltan **${fmt(need - D.sav)} al mes**. ${(()=>{ const s = c.gastos_por_ambito.filter(x=>!FIXED.test(x.ambito)).sort((a,b)=>b.media_mensual_3m-a.media_mensual_3m)[0]; return s ? `Tu mayor gasto variable es ${s.ambito} (${fmt(s.media_mensual_3m)} al mes): es el primer sitio donde mirar.` : ''; })()}` : '\n\nCon tu ritmo actual lo consigues. ✓');
  }
  if(has(/mas de lo normal|gastando mas|disparad|me paso|normal|demasiado|en que gasto|donde se va/)){
    const o = overAvg(c);
    if(!D.hasMoves) return 'Aún no tengo movimientos para comparar. Registra tus gastos y te diré en qué te desvías de lo normal.';
    if(!o.length) return `Este mes vas **en línea con tu media** en todos los ámbitos. ✓\n\nTus mayores gastos este mes:\n\n${list(c.gastos_por_ambito.filter(s=>s.este_mes).sort((a,b)=>b.este_mes-a.este_mes).slice(0,3).map(s=>`${s.ambito}: ${fmt(s.este_mes)} (media ${fmt(s.media_mensual_3m)})`))}`;
    return `Este mes gastas **más de lo normal** en:\n\n${list(o.map(s=>`**${s.ambito}**: ${fmt(s.este_mes)} frente a ${fmt(s.media_mensual_3m)} de media (+${fmt(s.este_mes-s.media_mensual_3m)})`))}\n\nSi vuelves a tu media en ${o[0].ambito}, liberas ${fmt(o[0].este_mes-o[0].media_mensual_3m)} este mes.`;
  }
  if(has(/puedo gastar|me queda|cuanto queda|presupuesto|limite/)){
    const L = c.gastos_por_ambito.filter(s=>s.limite);
    if(!L.length) return 'No tienes límites configurados. Ponlos en **Gastos › Límites** y te diré cuánto te queda en cada ámbito.';
    const dLeft = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate() - new Date().getDate() + 1;
    return `Te quedan **${dLeft} días** de mes:\n\n${list(L.map(s=>{ const left = s.limite - s.este_mes; return left>=0 ? `**${s.ambito}**: quedan ${fmt(left)} (unos ${fmt(left/dLeft)} al día)` : `**${s.ambito}**: superado en ${fmt(-left)}`; }))}`;
  }
  if(has(/patrimonio|cuanto tengo|neto|activos/)){
    const P = c.patrimonio;
    return `Tu patrimonio neto es **${fmt(P.neto)}**:\n\n${list(P.por_categoria.map(x=>`${x.categoria}: ${x.tipo==='deuda'?'−':''}${fmt(x.total)}`))}`;
  }
  if(has(/resum|como voy|este mes|mes|balance|situacion|que tal/)){
    const cur = D.cur;
    if(!D.hasMoves) return 'Aún no has registrado movimientos. Toca el **+** para apuntar tu primer gasto o ingreso y te haré el resumen.';
    const topS = c.gastos_por_ambito.filter(s=>s.este_mes).sort((a,b)=>b.este_mes-a.este_mes).slice(0,3);
    const ex = c.gastos_por_ambito.filter(s=>s.limite && s.este_mes > s.limite);
    return `**Este mes** llevas:\n\n- Ingresos: ${fmt(cur.ingresos)}\n- Gastos: ${fmt(cur.gastos)}\n- Ahorro: **${fmt(cur.ahorro)}**${D.out?` (tu media de gasto es ${fmt(D.out)})`:''}\n\n` +
      (topS.length ? `Donde más gastas: ${topS.map(s=>`${s.ambito} (${fmt(s.este_mes)})`).join(', ')}.` : '') +
      (ex.length ? `\n\n⚠ Has superado el límite de ${ex.map(s=>s.ambito).join(' y ')}.` : '');
  }
  return `Soy tu asesor integrado: funciono sin internet y analizo solo tus datos. Puedo responderte sobre:\n\n${list(['Cómo vas **este mes**','Dónde gastas **más de lo normal**','Qué **deuda** pagar primero','Cuánto **ahorrar** para tu meta (p. ej. «en 2 años»)','Tus **suscripciones** y gastos fijos','Tu **colchón** de emergencia','Cuánto te **queda** de cada límite','Tus **inversiones** y tu **patrimonio**'])}\n\nPara un plan completo, pulsa **Analizar mis finanzas**.`;
}

/* ---------- interfaz compatible con la del asesor de la app ---------- */
async function advisor(msgs, opts){
  opts = opts || {};
  const last = [...msgs].reverse().find(m=>m.role==='user');
  const full = ans(last ? String(last.content) : '');
  await wait(350, opts.signal);
  // efecto de escritura
  const parts = full.split(/(\s+)/); let shown = '';
  for(let i=0;i<parts.length;i+=6){
    shown += parts.slice(i, i+6).join('');
    if(opts.onText) try{ opts.onText({text: shown}); }catch(e){}
    await wait(22, opts.signal);
  }
  return {text: full, truncated:false};
}
advisor.json = async function(prompt, opts){
  opts = opts || {};
  if((opts.images||[]).length || !/acciones/.test(prompt)) throw {code:'images_unavailable'};
  await wait(900, opts.signal);
  return analysis();
};
advisor.limits = async () => ({tools:{maxCount:0}, images:null});
advisor.local = true;
window.nvLocalAdvisor = advisor;
})();
