// panels/kalk.js
// Depends: config.js, utils.js

let kalkType = 'sigim';
let kalkLastResult = '';


// ── KALKULYATOR ──

function setKalkType(type, el){
  kalkType = type;
  document.querySelectorAll('.kc-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  else {
    const btn = document.querySelector('.kc-tab[data-type="'+type+'"]');
    if(btn) btn.classList.add('active');
  }
  // Default tartib: Sig'im · Banner · Orakal · Bek Print · UV DTF · DTF · Ofset.
  // "pechat" TAB olib tashlandi (calcPechatNarx/PECHAT_NARX ofset katalogida qoladi).
  ['sigim','banner','orakal','bekprint','uvdtf','dtf','ofset'].forEach(t => {
    const el2 = document.getElementById('kalk-'+t);
    if(el2) el2.classList.toggle('hidden', t !== type);
  });
  if(type === 'ofset') updateOfsetFormats();
  if(type === 'orakal') calcOrakal();
}

function clearKalk(){
  // Clear all inputs in current kalk section
  const section = document.getElementById('kalk-'+kalkType);
  if(section){
    section.querySelectorAll('input[type=text]').forEach(i=>i.value='');
    section.querySelectorAll('input[type=checkbox]').forEach(i=>{ if(i.classList.contains('kc-switch-input')) i.checked=false; });
    section.querySelectorAll('[id$="-body"]').forEach(b=>b.style.display='none');
    // Reset results
    ['kalk-banner-result','kalk-bek-result','kalk-uv-result','kalk-dtf-result','kalk-orakal-result','kalk-of-result','sig-result'].forEach(id=>{
      const e=document.getElementById(id);
      if(e && section.contains(e)){
        e.style.display='none';
        const valEl = e.querySelector && e.querySelector('[style*="font-size:24px"]'); if(valEl) valEl.textContent='—';
      }
    });
    const sigEmpty = document.getElementById('sig-empty');
    if(sigEmpty && section.contains(sigEmpty)) sigEmpty.style.display='block';
    const sigMessage = document.getElementById('sig-message');
    if(sigMessage && section.contains(sigMessage)) sigMessage.style.display='none';
  }
  kalkLastResult = '';
  showNotify('Tozalandi');
}

function showKalkResult(elId, kvM, narxKv, jami, izoh){
  const el = document.getElementById(elId);
  if(!el) return;
  kalkLastResult = izoh + '\nNarx: ' + fmt(jami) + " so'm";
  el.innerHTML =
    '<div style="font-size:12px;color:var(--text3);margin-bottom:4px">' + izoh + '</div>' +
    '<div style="font-size:28px;font-weight:700;color:var(--blue)">' + fmt(jami) + " so'm</div>" +
    (narxKv ? '<div style="font-size:12px;color:var(--text3);margin-top:4px">Birlik narxi: ' + fmt(narxKv) + " so'm</div>" : '');
}

function calcSigim(){
  const mahEni  = document.getElementById('sig-mah-eni').value;
  const mahBoyi = document.getElementById('sig-mah-boyi').value;
  const matEni  = document.getElementById('sig-mat-eni').value;
  const matBoyi = document.getElementById('sig-mat-boyi').value;
  const kesish  = document.getElementById('sig-kesish').checked;
  const resEl   = document.getElementById('sig-result');
  const emptyEl = document.getElementById('sig-empty');
  const messageEl = document.getElementById('sig-message');

  if(![mahEni, mahBoyi, matEni, matBoyi].every(v => String(v).trim() !== '')){
    if(resEl) resEl.style.display = 'none';
    if(emptyEl) emptyEl.style.display = 'block';
    if(messageEl) messageEl.style.display = 'none';
    kalkLastResult = '';
    return;
  }

  const r = calculateSigim({
    pieceWidth: mahEni, pieceHeight: mahBoyi,
    materialWidth: matEni, materialHeight: matBoyi,
    withGap: kesish,
  });
  if(!r.ok){
    if(resEl) resEl.style.display = 'none';
    if(emptyEl) emptyEl.style.display = 'none';
    if(messageEl){
      messageEl.style.display = 'block';
      messageEl.textContent = r.error === 'non_positive'
        ? "O'lchamlar 0 dan katta bo'lishi kerak."
        : "Faqat raqam kiriting (masalan: 9.5 yoki 9,5).";
    }
    kalkLastResult = '';
    return;
  }

  const bestWay = r.bestOrientation === 'normal' ? "(to'g'ri)" : "(aylantirib)";
  if(resEl) resEl.style.display = 'block';
  if(emptyEl) emptyEl.style.display = 'none';
  if(messageEl){
    messageEl.style.display = r.noFit ? 'block' : 'none';
    messageEl.textContent = r.noFit
      ? "Mahsulot materialdan katta: bu o'lchamlarda birorta ham sig'maydi. Mahsulot — bitta dona, material — tashqi list/rulon o'lchami."
      : '';
  }

  kalkLastResult = 'Sig\'im hisoblash\n'+
    'Mahsulot (1 dona): '+r.pieceWidth+'×'+r.pieceHeight+' sm\n'+
    'Material (list/rulon): '+r.materialWidth+'×'+r.materialHeight+' sm\n'+
    (kesish?'Kesish oralig\': +0.5 sm\n':'')+
    'To\'g\'ri joylashganda: '+r.normal.total+' ta ('+r.normal.columns+'×'+r.normal.rows+')\n'+
    'Aylantirib: '+r.rotated.total+' ta ('+r.rotated.columns+'×'+r.rotated.rows+')\n'+
    'Eng ko\'p: '+r.bestTotal+' ta '+bestWay;

  const set = (id, val) => { const e=document.getElementById(id); if(e) e.textContent=val; };
  set('sig-normal', r.normal.total + ' ta');
  set('sig-normal-info', r.normal.columns+'×'+r.normal.rows + (kesish?' ('+r.normal.usedWidth.toFixed(1)+'×'+r.normal.usedHeight.toFixed(1)+' sm)':''));
  set('sig-rotated', r.rotated.total + ' ta');
  set('sig-rotated-info', r.rotated.columns+'×'+r.rotated.rows + (kesish?' ('+r.rotated.usedWidth.toFixed(1)+'×'+r.rotated.usedHeight.toFixed(1)+' sm)':''));
  set('sig-best', r.bestTotal + ' ta');
  set('sig-best-way', ' ' + bestWay);
}


function calcBanner(){
  const eniInput = parseFloat(document.getElementById('kalk-eni').value)||0;
  const boyiInput = parseFloat(document.getElementById('kalk-boyi').value)||0;
  const podloshka = document.getElementById('kalk-podloshka').checked;
  const formatEl = document.getElementById('kalk-banner-format');
  const warnEl = document.getElementById('kalk-banner-warn');

  if(!eniInput || !boyiInput){
    if(formatEl) formatEl.style.display='none';
    if(warnEl) warnEl.style.display='none';
    return;
  }

  function getRulo(olcham){
    if(olcham <= 1.2)  return { rulo: 1.32, nom: '1.32m' };
    if(olcham <= 2.0)  return { rulo: 2.1,  nom: '2.1m' };
    if(olcham <= 2.5)  return { rulo: 2.6,  nom: '2.6m' };
    if(olcham <= 3.1)  return { rulo: 3.2,  nom: '3.2m' };
    return null;
  }

  function getNarx(kv, extraNarx){
    let n;
    if(kv < 1)        n = 100000;
    else if(kv < 5)   n = 50000;
    else if(kv < 10)  n = 40000;
    else if(kv < 20)  n = 35000;
    else if(kv < 30)  n = 30000;
    else if(kv < 50)  n = 28000;
    else if(kv < 100) n = 27000;
    else              n = 25000;
    if(podloshka) n += 4000;
    if(extraNarx) n += extraNarx;
    return n;
  }

  // Variant 1: eniInput kenglik, boyiInput uzunlik
  // Variant 2: boyiInput kenglik, eniInput uzunlik
  function calcVariant(kenglik, uzunlik){
    const r = getRulo(kenglik);
    if(!r) return null; // kenglik 3.1 dan katta
    const kv = r.rulo * uzunlik;
    const narx = getNarx(kv, 0);
    const jami = Math.round(kv * narx);
    return { rulo: r.rulo, ruloNom: r.nom, uzunlik, kv, narx, jami, isOversized: false };
  }

  const v1 = calcVariant(eniInput, boyiInput);  // eni = kenglik
  const v2 = calcVariant(boyiInput, eniInput);  // boyi = kenglik

  let best, other, isOversized = false, format;

  if(!v1 && !v2){
    // Ikkala tomon ham 3.1m dan katta
    isOversized = true;
    const kv = eniInput * boyiInput;
    const narx = getNarx(kv, 10000);
    const jami = Math.round(kv * narx);
    best = { rulo: eniInput, ruloNom: 'Maxsus', uzunlik: boyiInput, kv, narx, jami, isOversized: true };
    format = 'Maxsus pechat — ikkala tomon 3.1m dan katta!';
  } else if(!v1){
    best = v2;
    format = v2.ruloNom + ' rulo (boyi kenglik, eni uzunlik)';
  } else if(!v2){
    best = v1;
    format = v1.ruloNom + ' rulo (eni kenglik, boyi uzunlik)';
  } else {
    // Ikkala variant ham mumkin — arzonini tanla
    if(v1.jami <= v2.jami){
      best = v1;
      other = v2;
      format = v1.ruloNom + ' rulo (eni kenglik) — arzon variant';
    } else {
      best = v2;
      other = v1;
      format = v2.ruloNom + ' rulo (boyi kenglik) — arzon variant';
    }
  }

  const mijozKv = eniInput * boyiInput;

  if(formatEl){ formatEl.style.display = 'block'; document.getElementById('kalk-format-text').textContent = 'Formatlar: ' + format; }
  if(warnEl) warnEl.style.display = isOversized ? 'block' : 'none';

  kalkLastResult = 'Banner: ' + eniInput + 'm x ' + boyiInput + 'm' +
    '\nRulo: ' + best.rulo + 'm x ' + best.uzunlik + 'm = ' + best.kv.toFixed(2) + ' kv.m' +
    '\nNarx: ' + fmt(best.narx) + " so\'m/kv.m" +
    '\nJami: ' + fmt(best.jami) + " so\'m";

  const el = document.getElementById('kalk-banner-result');
  if(!el) return;
  el.innerHTML =
    '<div style="font-size:12px;color:var(--text3);margin-bottom:8px">' +
      'Mijoz: <b>' + eniInput + 'm x ' + boyiInput + 'm</b> = ' + mijozKv.toFixed(2) + ' kv.m<br>' +
      'Hisob: <b style="color:var(--blue)">' + best.rulo + 'm x ' + best.uzunlik + 'm = ' + best.kv.toFixed(2) + ' kv.m</b>' +
      ' <span style="color:var(--green);font-size:11px">(' + best.ruloNom + ' rulo)</span>' +
    '</div>' +
    (other ? '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Boshqa variant: ' + other.rulo + 'm x ' + other.uzunlik + 'm = ' + other.kv.toFixed(2) + ' kv.m → ' + fmt(other.jami) + " so\'m</div>" : '') +
    '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">' + fmt(best.narx) + " so\'m/kv.m" + (podloshka ? ' + Podloshka' : '') + (isOversized ? ' + Maxsus' : '') + '</div>' +
    '<div style="font-size:30px;font-weight:700;color:' + (isOversized ? 'var(--red)' : 'var(--blue)') + '">' + fmt(best.jami) + " so\'m</div>";
}



function calcBekprint(){
  const ruloEl = document.querySelector('input[name="bek-rulo"]:checked');
  const boyi = parseFloat(document.getElementById('kalk-bek-boyi').value)||0;
  const formatEl = document.getElementById('kalk-bek-format');
  const formatText = document.getElementById('kalk-bek-format-text');

  if(!ruloEl || !boyi){
    if(formatEl) formatEl.style.display='none';
    return;
  }

  const ruloKengligi = parseFloat(ruloEl.value);
  const kv = ruloKengligi * boyi;

  // Narx jadvali
  let narxKv;
  if(kv < 1)        narxKv = 150000;
  else if(kv < 5)   narxKv = 80000;
  else if(kv < 10)  narxKv = 70000;
  else if(kv < 20)  narxKv = 65000;
  else if(kv < 30)  narxKv = 60000;
  else if(kv < 50)  narxKv = 55000;
  else              narxKv = 50000;

  const jami = Math.round(kv * narxKv);

  if(formatEl){ formatEl.style.display='block'; }
  if(formatText) formatText.textContent = '📐 ' + ruloKengligi + 'm rulo × ' + boyi + 'm = ' + kv.toFixed(2) + ' kv.m';

  kalkLastResult = 'Bekprint: '+ruloKengligi+'m × '+boyi+'m = '+kv.toFixed(2)+' kv.m\nNarx: '+fmt(narxKv)+" so'm/kv.m\nJami: "+fmt(jami)+" so'm";

  const el = document.getElementById('kalk-bek-result');
  if(!el) return;
  el.innerHTML =
    '<div style="font-size:12px;color:var(--text3);margin-bottom:6px">'+
      ruloKengligi+'m × '+boyi+'m = <b>'+kv.toFixed(2)+' kv.m</b> | '+fmt(narxKv)+" so'm/kv.m"+
    '</div>'+
    '<div style="font-size:30px;font-weight:700;color:var(--blue)">'+fmt(jami)+" so'm</div>";
}

function setUvTab(tab){
  document.getElementById('uv-panel-30').style.display = tab==='30' ? 'block' : 'none';
  document.getElementById('uv-panel-60').style.display = tab==='60' ? 'block' : 'none';
  document.getElementById('uv-tab-30').style.background = tab==='30' ? '#3B82F6' : 'none';
  document.getElementById('uv-tab-30').style.color = tab==='30' ? '#fff' : 'var(--text3)';
  document.getElementById('uv-tab-60').style.background = tab==='60' ? '#6366F1' : 'none';
  document.getElementById('uv-tab-60').style.color = tab==='60' ? '#fff' : 'var(--text3)';
}

function calcUvDtf60(){
  const uzunlik = parseFloat(document.getElementById('kalk-uv60-uzunlik').value)||0;
  const narx    = parseInt(document.getElementById('kalk-uv60-narx').value)||0;
  if(!uzunlik || !narx) return;
  const jami = Math.round(uzunlik * narx);
  kalkLastResult = 'UV DTF 60sm: '+uzunlik+' metr\nNarx: '+fmt(narx)+" so'm/metr\nJami: "+fmt(jami)+" so'm";
  const el = document.getElementById('kalk-uv60-result');
  if(!el) return;
  el.innerHTML =
    '<div style="font-size:12px;color:var(--text3);margin-bottom:6px">'+uzunlik+' metr × '+fmt(narx)+" so'm/metr</div>"+
    '<div style="font-size:30px;font-weight:700;color:#6366F1">'+fmt(jami)+" so'm</div>";
}

function calcUvDtf(){
  const uzunlik = parseFloat(document.getElementById('kalk-uv-uzunlik').value)||0;
  if(!uzunlik) return;

  // Pogonometr narxi (metr asosida)
  let narx;
  if(uzunlik <= 0.5)  narx = 150000;
  else if(uzunlik < 5)   narx = 250000;
  else if(uzunlik < 10)  narx = 230000;
  else if(uzunlik < 20)  narx = 200000;
  else if(uzunlik < 50)  narx = 180000;
  else                   narx = 150000;

  // Jami: uzunlik × narx (metr narxi)
  const jami = Math.round(uzunlik * narx);

  kalkLastResult = 'UV DTF: '+uzunlik+' metr\nNarx: '+fmt(narx)+" so'm/metr\nJami: "+fmt(jami)+" so'm";

  const el = document.getElementById('kalk-uv-result');
  if(!el) return;
  el.innerHTML =
    '<div style="font-size:12px;color:var(--text3);margin-bottom:6px">'+
      uzunlik+' metr pogonometr | '+fmt(narx)+" so'm/metr"+
    '</div>'+
    '<div style="font-size:30px;font-weight:700;color:var(--blue)">'+fmt(jami)+" so'm</div>"+
    '<div style="font-size:11px;color:var(--text3);margin-top:4px">Rulo: 30sm, pechat zonasi: 29sm</div>';
}

// ── Ishlab chiqarish breakdown UI yordamchisi (Orakal + DTF uchun) ──
// Ixcham kartochkalar: JOYLAYISH / MATERIAL / NARXLASH / NATIJA. Har biri
// {label, value} qatorlardan iborat. ERP qorong'i uslubi saqlanadi.
function kalkBreakdownHTML(color, groups, total, totalNote){
  const card = g => {
    if(!g || !g.rows || !g.rows.length) return '';
    const rows = g.rows.filter(r=>r && r[1]!=null && r[1]!=='').map(r =>
      '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;line-height:1.7">'+
        '<span style="color:var(--text3)">'+r[0]+'</span>'+
        '<span style="color:var(--text);font-weight:600;text-align:right">'+r[1]+'</span>'+
      '</div>').join('');
    return '<div style="background:var(--bg2,rgba(255,255,255,.03));border:1px solid var(--border,rgba(255,255,255,.07));border-radius:10px;padding:10px 12px">'+
      '<div style="font-size:10px;letter-spacing:.5px;color:'+color+';font-weight:700;margin-bottom:6px">'+g.title+'</div>'+rows+'</div>';
  };
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">'+
      groups.map(card).join('')+'</div>'+
    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border,rgba(255,255,255,.08))">'+
      '<div style="font-size:11px;color:var(--text3)">Jami narx'+(totalNote?' · '+totalNote:'')+'</div>'+
      '<div style="font-size:28px;font-weight:800;color:'+color+'">'+fmt(total)+" so'm</div></div>";
}

// ── ORAKAL ──
// Sotuv narxi TAYYOR MIJOZ MAYDONI bo'yicha; material sarfi (2 sm overlap,
// panel/rulon isrofi) ALOHIDA ko'rsatiladi va mijozdan olinmaydi.
function calcOrakal(){
  const eni  = parseFloat((document.getElementById('kalk-orakal-eni')||{}).value)||0;
  const boyi = parseFloat((document.getElementById('kalk-orakal-boyi')||{}).value)||0;
  const son  = parseInt((document.getElementById('kalk-orakal-son')||{}).value)||1;
  const tur  = (document.getElementById('kalk-orakal-tur')||{}).value==='setkalik'?'setkalik':'oddiy';
  const el = document.getElementById('kalk-orakal-result');
  if(!eni || !boyi){ if(el){ el.style.display='none'; } kalkLastResult=''; return; }

  const r = calculateOrakal({ finishedW:eni, finishedH:boyi, qty:son, type:tur });
  if(el) el.style.display='block';
  if(!r.ok){
    if(el) el.innerHTML = '<div style="color:#EF4444;font-weight:600">Hisoblab bo\'lmadi: '+(r.message||'ma\'lumot yetarli emas')+'</div>';
    kalkLastResult=''; return;
  }
  const turLabel = r.type==='setkalik' ? 'Setkalik' : 'Oddiy';
  const orient = r.rotated ? 'Aylantirilgan (90°)' : "To'g'ri";
  const panelInfo = r.panels>1
    ? r.panels+' panel (jami bosilgan eni '+r.totalPrintedW+' sm)'
    : '1 panel (bo\'linmasdan)';
  // 2 sm — panellarni yopishtirish uchun ustma-ust chiqish (montaj uchun).
  const ustmaUst = r.panels>1 ? r.overlap+' sm (har chok)' : '—';

  if(el) el.innerHTML = kalkBreakdownHTML('#F59E0B', [
    { title:'JOYLAYISH', rows:[
      ['Tayyor o\'lcham', eni+'×'+boyi+' sm'],
      ['Soni', son+' dona'],
      ['Orakal turi', turLabel],
      ['Orientatsiya', orient],
      ['Panel', panelInfo],
      ['Yopishtirish uchun ustma-ust chiqish', ustmaUst],
    ]},
    { title:'MATERIAL', rows:[
      ['Tanlangan rulon', r.rollPhysical+' sm'],
      ['Foydali pechat eni', r.rollSafe+' sm'],
      ['Material uzunligi', r.rollLengthM+' m ('+r.rollLengthCm+' sm)'],
      ['Real material sarfi', r.materialAreaM2+' m²'],
    ]},
    { title:'NARXLASH', rows:[
      ['Sotuv (tayyor) maydoni', r.billableAreaM2+' m²'],
      ['Tarif', fmt(r.rate)+" so'm/m²"+(r.type==='setkalik'?' (setkalik +10 000)':'')],
      ['Hisob asosi', 'tayyor maydon × tarif'],
    ]},
  ], r.total, r.rollPhysical+' sm rulon · '+turLabel);

  // Nusxa olish uchun matn (dimensions + narx)
  kalkLastResult =
    'Orakal ('+turLabel+')\n'+
    'Tayyor o\'lcham: '+eni+'×'+boyi+' sm × '+son+' dona\n'+
    'Sotuv maydoni: '+r.billableAreaM2+' m² (tarif '+fmt(r.rate)+" so'm/m²)\n"+
    'Tanlangan rulon: '+r.rollPhysical+' sm (foydali '+r.rollSafe+' sm), '+orient+'\n'+
    'Panel: '+r.panels+' ta'+(r.panels>1?' · yopishtirish uchun ustma-ust chiqish '+r.overlap+' sm (har chok)':'')+'\n'+
    'Real material sarfi: '+r.materialAreaM2+' m² ('+r.rollLengthM+' m uzunlik)\n'+
    'Jami: '+fmt(r.total)+" so'm";
}

// ── DTF (tekstil transfer) — UV DTF EMAS ──
// 58 sm rulon; qo'shnilar orasida majburiy 0.5 sm oraliq; <=0.5 m -> maydon×150k,
// >0.5 m -> pogon metr×100k. Sof mantiq calculateDtf() (kalk_engines.js) da.
function calcDtf(){
  const eni  = parseFloat((document.getElementById('kalk-dtf-eni')||{}).value)||0;
  const boyi = parseFloat((document.getElementById('kalk-dtf-boyi')||{}).value)||0;
  const son  = parseInt((document.getElementById('kalk-dtf-son')||{}).value)||0;
  const el = document.getElementById('kalk-dtf-result');
  if(!eni || !boyi || !son){ if(el){ el.style.display='none'; } kalkLastResult=''; return; }

  const r = calculateDtf({ width:eni, height:boyi, qty:son });
  if(el) el.style.display='block';
  if(!r.ok){
    const msg = r.error==='both_exceed_width'
      ? 'Mahsulot 58 sm rulon eniga sig\'madi (ikkala yo\'nalishda ham).'
      : (r.message||'Ma\'lumot yetarli emas');
    if(el) el.innerHTML = '<div style="color:#EF4444;font-weight:600">'+msg+'</div>';
    kalkLastResult=''; return;
  }
  const orient = r.rotated ? 'Aylantirilgan (90°)' : "To'g'ri";
  const modeLabel = r.mode==='m²' ? 'm² bo\'yicha (kichik ish)' : 'pogon metr bo\'yicha';
  const rateLabel = r.mode==='m²' ? fmt(r.rate)+" so'm/m²" : fmt(r.rate)+" so'm/pogon metr";

  if(el) el.innerHTML = kalkBreakdownHTML('#EF4444', [
    { title:'JOYLAYISH', rows:[
      ['Mahsulot o\'lchami', eni+'×'+boyi+' sm'],
      ['Soni', son+' dona'],
      ['Orientatsiya', orient],
      ['Bir qatorga', r.across+' dona'],
      ['Qatorlar soni', r.rows+' qator'],
    ]},
    { title:'MATERIAL', rows:[
      ['Material eni', r.rollWidth+' sm'],
      ['Majburiy oraliq', r.gap+' sm'],
      ['Rulon uzunligi', r.lengthCm+' sm ('+r.lengthM+' m)'],
      ['Ishlatilgan maydon', r.usedAreaM2+' m² (eni '+r.usedWidthCm+' sm)'],
    ]},
    { title:'NARXLASH', rows:[
      ['Narx rejimi', modeLabel],
      ['Tarif', rateLabel],
    ]},
  ], r.total, r.across+' dona/qator × '+r.rows+' qator · '+r.lengthCm+' sm');

  kalkLastResult =
    'DTF (tekstil)\n'+
    'Mahsulot: '+eni+'×'+boyi+' sm × '+son+' dona ('+orient+')\n'+
    'Joylashuv: '+r.across+' dona/qator × '+r.rows+' qator, oraliq '+r.gap+' sm\n'+
    'Material: 58 sm rulon, uzunlik '+r.lengthCm+' sm ('+r.lengthM+' m)\n'+
    'Narx rejimi: '+modeLabel+' — '+rateLabel+'\n'+
    'Jami: '+fmt(r.total)+" so'm";
}


// ── OFSET NARXLARI ──
function calcPechatNarx(son, tur){
  const n = PECHAT_NARX[tur];
  if(!n || !son) return 0;
  if(son <= 1000) return n.base;
  const q = Math.ceil((son-1000)/1000);
  return n.base + q*n.extra;
}

function autoSigim(mEni, mBoyi, ishEni, ishBoyi){
  if(!mEni||!mBoyi) return 0;
  const g = Math.floor(ishEni/mEni)*Math.floor(ishBoyi/mBoyi);
  const v = Math.floor(ishEni/mBoyi)*Math.floor(ishBoyi/mEni);
  return Math.max(g,v);
}

function ofAutoFill(inputId, hiddenId){
  // Fokusda avtomatik qiymat hinti allaqachon calcOfset() da ko'rsatiladi.
  // Maydonni to'ldirish uchun hint ustiga bosiladi (ofUseAuto).
}

// "Avtomatik: N ta (bosing)" hintini bosganda tegishli maydonni to'ldiradi.
// applySuggestedValue -> qiymatni set qiladi va input/change ni bir marta yuboradi
// (calcOfset oninput orqali aynan bir marta ishga tushadi; += yo'q, ko'paymaydi).
function ofUseAuto(inputId, hiddenId){
  const hidden = document.getElementById(hiddenId);
  const autoVal = hidden ? hidden.value : '';
  if(autoVal) applySuggestedValue(inputId, autoVal);
}

function toggleOfBlok(key){
  const body = document.getElementById('of-'+key+'-body');
  const check = document.getElementById('of-'+key+'-check');
  if(body && check) body.style.display = check.checked ? 'grid' : 'none';
}

function updateOfsetFormats(){ calcOfset(); }
function updateOfsetQogoz(){ calcOfset(); }

// ── KATALOG REJIMI ──
let _catPaperCloned = false;
function setOfsetMode(mode){
  const ord = document.getElementById('of-ordinary-mode');
  const cat = document.getElementById('of-catalog-mode');
  if(!ord || !cat) return;
  const isCat = mode === 'katalog';
  ord.classList.toggle('hidden', isCat);
  cat.classList.toggle('hidden', !isCat);
  const bOd = document.getElementById('of-mode-oddiy');
  const bKa = document.getElementById('of-mode-katalog');
  if(bOd) bOd.classList.toggle('active', !isCat);
  if(bKa) bKa.classList.toggle('active', isCat);
  if(isCat){
    // Qog'oz narxlar ro'yxatini oddiy kalkulyatordan klonlaymiz (narxlar takrorlanmaydi).
    if(!_catPaperCloned){
      const src = document.getElementById('of-qogoz-tur');
      const dst = document.getElementById('of-cat-qogoz-tur');
      if(src && dst && src.innerHTML.trim()){ dst.innerHTML = src.innerHTML; _catPaperCloned = true; }
    }
    calcCatalog();
  }
}

// Katalog hisob-kitobi — barcha formulalar utils.js dagi sof funksiyalarda
// (calculateCatalogLayout/Paper/Services). Bu yerda faqat DOM o'qish/yozish.
function calcCatalog(){
  if(!document.getElementById('of-cat-bet')) return;
  const bet     = parseInt(document.getElementById('of-cat-bet').value)||0;
  const nusxa   = parseInt(document.getElementById('of-cat-nusxa').value)||0;
  const fmtStr  = document.getElementById('of-cat-format').value;
  const ishFmt  = document.getElementById('of-cat-ishformat').value;
  const pechatTur = document.getElementById('of-cat-pechat-tur').value;
  const preladka  = parseInt(document.getElementById('of-cat-preladka').value)||0;
  const formaNarx = parseInt(document.getElementById('of-cat-forma-tur').value)||0;
  const paperUnit = parseInt(document.getElementById('of-cat-qogoz-tur').value)||0;

  const ishInfo = ISH_FORMAT[ishFmt] || ISH_FORMAT['44x31'];
  const dims = String(fmtStr).split('x');
  const fe = parseFloat(dims[0]), fb = parseFloat(dims[1]);
  const pieces = autoSigim(fe, fb, ishInfo.eni, ishInfo.boyi) || 1; // 1 varaqdan chiqadigan varoq

  // Layout + bet yaxlitlash taklifi (kiritilgan qiymat o'zgartirilmaydi)
  const layout = calculateCatalogLayout(bet);
  const roundHint = document.getElementById('of-cat-round-hint');
  if(roundHint) roundHint.textContent = layout.rounded
    ? `${layout.pagesEntered} bet ishlab chiqarish qoidasi bo'yicha ${layout.pagesProd} betga yaxlitlandi (${layout.leaves} varoq).`
    : (bet>0 ? `${layout.pagesProd} bet = ${layout.leaves} varoq` : '');
  const betAuto = document.getElementById('of-cat-bet-auto');
  if(betAuto) betAuto.value = layout.rounded ? layout.pagesProd : '';
  const betHint = document.getElementById('of-cat-bet-hint');
  if(betHint) betHint.textContent = layout.rounded ? `Tavsiya: ${layout.pagesProd} bet (bosing)` : '';

  // Forma soni — qo'lda kiritilgan bo'lsa o'sha, aks holda tavsiya (layout.forms)
  const formaManual = parseInt(document.getElementById('of-cat-forma-son').value);
  const formaOverridden = Number.isFinite(formaManual) && formaManual > 0;
  const forms = formaOverridden ? formaManual : layout.forms;
  const formaAuto = document.getElementById('of-cat-forma-auto');
  if(formaAuto) formaAuto.value = layout.forms || '';
  const formaHint = document.getElementById('of-cat-forma-hint');
  if(formaHint) formaHint.textContent = (layout.forms ? `Tavsiya: ${layout.forms} forma (bosing)` : '')
    + (formaOverridden && formaManual !== layout.forms ? " · qo'lda" : '');

  // Qog'oz miqdori
  const paper = calculateCatalogPaper(layout.leaves, pieces, forms, preladka, nusxa);
  const qogozManual = parseInt(document.getElementById('of-cat-qogoz-son').value);
  const qogozOverridden = Number.isFinite(qogozManual) && qogozManual > 0;
  const paperQty = qogozOverridden ? qogozManual : paper.totalSheets;
  const qogozAuto = document.getElementById('of-cat-qogoz-auto');
  if(qogozAuto) qogozAuto.value = paper.totalSheets || '';
  const qogozHint = document.getElementById('of-cat-qogoz-hint');
  if(qogozHint) qogozHint.textContent = (paper.totalSheets ? `Tavsiya: ${fmt(paper.totalSheets)} list (bosing)` : '')
    + (qogozOverridden && qogozManual !== paper.totalSheets ? " · qo'lda" : '');

  // A1 ekvivalenti: qog'oz narxi 1 A1 varaq uchun; ishchi list A1 dan kesiladi.
  // piecesPerA1 = ishchi format bolinishi (44×31 -> 4), oddiy rejim bilan bir xil.
  const piecesPerA1 = (ishInfo && ishInfo.bolinish) || 1;
  const a1Quantity = catalogA1Sheets(paperQty, piecesPerA1);

  // Xizmatlar — pechat narxi mavjud manbadan (calcPechatNarx: oborot + nusxa bosqichi)
  const pechatPerForm = calcPechatNarx(nusxa, pechatTur);
  const lamOn = document.getElementById('of-cat-lam-check').checked;
  const lamRate = parseInt(document.getElementById('of-cat-lam-narx').value)||0;
  const termOn = document.getElementById('of-cat-term-check').checked;
  const termRate = parseInt(document.getElementById('of-cat-term-narx').value)||0;

  const svc = calculateCatalogServices({
    forms, formaNarx, pechatPerForm, copies:nusxa, paperUnit,
    a1Sheets:a1Quantity, lamination:lamOn, lamRate, bind:termOn, bindRate:termRate
  });

  const setSum = (id,v,show) => { const e=document.getElementById(id); if(e) e.textContent = show ? fmt(v)+" so'm" : '—'; };
  setSum('of-cat-forma-jami', svc.formCost, forms>0 && formaNarx>0);
  setSum('of-cat-pechat-jami', svc.printCost, svc.printCost>0);
  setSum('of-cat-qogoz-jami', svc.paperCost, svc.paperCost>0);
  setSum('of-cat-per', svc.perCatalog, svc.perCatalog>0);

  const lamJamiEl = document.getElementById('of-cat-lam-jami');
  if(lamJamiEl) lamJamiEl.textContent = lamOn ? `= ${fmt(svc.lamCost)} so'm` : (nusxa>0?`Tavsiya: ${fmt(nusxa*lamRate)} so'm`:'');
  const termJamiEl = document.getElementById('of-cat-term-jami');
  if(termJamiEl) termJamiEl.textContent = termOn ? `= ${fmt(svc.bindCost)} so'm` : (nusxa>0?`Tavsiya: ${fmt(nusxa*termRate)} so'm`:'');

  const paperDetail = document.getElementById('of-cat-paper-detail');
  if(paperDetail) paperDetail.innerHTML = bet>0
    ? `Varoq: <b>${layout.leaves}</b> · 1 varaqdan: <b>${pieces}</b> ta · Toza qog'oz: <b>${fmt(paper.cleanSheets)}</b> · Preladka: <b>${fmt(paper.makeready)}</b><br>`
      + `Ishchi listlar soni: <b>${fmt(paperQty)}</b> · 1 A1 ga sig'imi: <b>${piecesPerA1}</b> ta · A1 qog'oz ekvivalenti: <b>${fmt(a1Quantity)}</b> · Qog'oz jami: <b>${fmt(svc.paperCost)}</b> so'm`
    : '';

  const res = document.getElementById('kalk-cat-result');
  if(res){
    if(svc.total > 0){
      res.innerHTML = `<div style="font-size:12px;color:var(--text3)">${nusxa} dona · ${layout.pagesProd} bet · ${forms} forma</div>`
        + `<div style="font-size:28px;font-weight:700;color:var(--blue)">${fmt(svc.total)} so'm</div>`
        + `<div style="font-size:12px;color:var(--text3);margin-top:2px">1 dona: <b>${fmt(svc.perCatalog)}</b> so'm</div>`;
      kalkLastResult = `Katalog: ${layout.pagesProd} bet × ${nusxa} dona = ${fmt(svc.total)} so'm (1 dona ${fmt(svc.perCatalog)} so'm)`;
    } else {
      res.innerHTML = `<div style="font-size:12px;color:var(--text3)">Ma'lumotlarni kiriting</div><div style="font-size:28px;font-weight:700;color:var(--blue)">—</div>`;
    }
  }
}

function calcOfset(){
  const son      = parseInt(document.getElementById('of-son').value)||0;
  const mahEni   = parseFloat(document.getElementById('of-eni').value)||0;
  const mahBoyi  = parseFloat(document.getElementById('of-boyi').value)||0;
  const ishFmt   = document.getElementById('of-ishformat').value;
  const preladka = parseInt(document.getElementById('of-preladka').value)||100;
  const formaTur = parseInt(document.getElementById('of-forma-tur').value)||0;
  const formaSon = parseInt(document.getElementById('of-forma-son').value)||0;
  const pechatTur= document.getElementById('of-pechat-tur').value;
  const qogozNarx= parseInt(document.getElementById('of-qogoz-tur').value)||0;

  const ishInfo = ISH_FORMAT[ishFmt]||ISH_FORMAT['44x31'];

  // Avtomatik hisoblash
  const autoSig = autoSigim(mahEni, mahBoyi, ishInfo.eni, ishInfo.boyi);
  const sigimHint = document.getElementById('of-sigim-hint');
  const sigimAuto = document.getElementById('of-sigim-auto');
  if(sigimAuto) sigimAuto.value = autoSig||'';
  if(sigimHint) sigimHint.textContent = autoSig ? 'Avtomatik: '+autoSig+' ta (bosing)' : '';

  const sigim = parseInt(document.getElementById('of-sigim').value)||autoSig||1;
  const ishSonAuto = son>0&&sigim>0 ? Math.ceil(son/sigim) : 0;
  const ishSonAutoEl = document.getElementById('of-ishson-auto');
  if(ishSonAutoEl) ishSonAutoEl.value = ishSonAuto||'';
  const ishSonHint = document.getElementById('of-ishson-hint');
  if(ishSonHint) ishSonHint.textContent = ishSonAuto ? 'Avtomatik: '+ishSonAuto+' ta (bosing)' : '';

  const ishSon = parseInt(document.getElementById('of-ishson').value)||ishSonAuto;
  const jami_ish = ishSon + preladka;
  const qogozAuto = jami_ish>0 ? Math.ceil(jami_ish/ishInfo.bolinish) : 0;
  const qogozAutoEl = document.getElementById('of-qogoz-auto');
  if(qogozAutoEl) qogozAutoEl.value = qogozAuto||'';
  const qogozHint = document.getElementById('of-qogoz-hint');
  if(qogozHint) qogozHint.textContent = qogozAuto ? '('+ishSon+'+'+preladka+')/'+ishInfo.bolinish+' = '+qogozAuto+' (bosing)' : '';

  const qogozSon = parseInt(document.getElementById('of-qogoz').value)||qogozAuto;

  // FORMA
  const formaJami = formaTur*formaSon;
  const setSum = (id,v) => { const e=document.getElementById(id); if(e) e.textContent = v>0 ? fmt(v)+" so'm" : '—'; };
  setSum('of-forma-jami', formaJami);

  // PECHAT
  const pechatJami = calcPechatNarx(ishSon, pechatTur);
  setSum('of-pechat-jami', pechatJami);

  // QOG'OZ
  const qogozJami = qogozNarx * qogozSon;
  setSum('of-qogoz-jami', qogozJami);

  // LAMINATSIYA
  let lamJami = 0;
  if(document.getElementById('of-lam-check').checked){
    const lamSon = parseInt(document.getElementById('of-lam-son').value)||0;
    const lamNarx = parseInt(document.getElementById('of-lam-narx').value)||500;
    lamJami = lamSon*lamNarx;
    setSum('of-lam-jami', lamJami);
  }

  // VISICHKA
  let visJami = 0;
  if(document.getElementById('of-vis-check').checked){
    const visSon = parseInt(document.getElementById('of-vis-son').value)||0;
    visJami = Math.ceil(visSon/1000)*120000;
    setSum('of-vis-jami', visJami);
  }

  // PICHOQ
  let pichJami = 0;
  if(document.getElementById('of-pich-check').checked){
    pichJami = parseInt(document.getElementById('of-pich-sum').value)||0;
    setSum('of-pich-jami', pichJami);
  }

  // PEREPLOT
  let perJami = 0;
  if(document.getElementById('of-per-check').checked){
    const perSon = parseInt(document.getElementById('of-per-son').value)||0;
    const perNarx = parseInt(document.getElementById('of-per-narx').value)||2000;
    perJami = perSon*perNarx;
    setSum('of-per-jami', perJami);
  }

  // TERMOKLEY
  let termJami = 0;
  if(document.getElementById('of-term-check').checked){
    termJami = parseInt(document.getElementById('of-term-sum').value)||0;
    setSum('of-term-jami', termJami);
  }

  // ZBORKA
  let zborJami = 0;
  if(document.getElementById('of-zbor-check').checked){
    const zborSon = parseInt(document.getElementById('of-zbor-son').value)||0;
    const zborNarx = parseInt(document.getElementById('of-zbor-narx').value)||500;
    zborJami = zborSon*zborNarx;
    setSum('of-zbor-jami', zborJami);
  }

  // REZKA VA UPAKOVKA
  let rezkaJami = 0;
  if(document.getElementById('of-rezka-check').checked){
    rezkaJami = parseInt(document.getElementById('of-rezka-sum').value)||0;
    setSum('of-rezka-jami', rezkaJami);
  }

  // QO'SHIMCHA RASXOD
  let rasxodJami = 0;
  if(document.getElementById('of-rasxod-check').checked){
    rasxodJami = parseInt(document.getElementById('of-rasxod-sum').value)||0;
    setSum('of-rasxod-jami', rasxodJami);
  }

  const jami = formaJami+pechatJami+qogozJami+lamJami+visJami+pichJami+perJami+termJami+zborJami+rezkaJami+rasxodJami;

  // FOYDA
  const foizEl = document.getElementById('of-foyda-foiz');
  const foydaJamiEl = document.getElementById('of-foyda-jami');
  const foiz = parseFloat(foizEl ? foizEl.value : 0)||0;
  const mijozNarx = foiz > 0 ? Math.round(jami * (1 + foiz/100)) : 0;
  if(foydaJamiEl) foydaJamiEl.textContent = foiz > 0 && jami > 0 ? fmt(mijozNarx)+" so'm (+"+foiz+"%)" : '—';
  const el = document.getElementById('kalk-of-result');
  if(!el) return;

  if(!son){
    el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Ma\'lumotlarni kiriting</div><div style="font-size:28px;font-weight:700;color:var(--blue)">—</div>';
    return;
  }

  const nom = document.getElementById('of-nom').value||'Mahsulot';
  kalkLastResult = nom+': '+son+' dona\n'+'Toza pechat: '+ishSon+"\nQog'oz: "+qogozSon+' list\n'+
    'Tannarx: '+fmt(jami)+" so'm"+(foiz>0?'\nMijozga ('+foiz+'%): '+fmt(mijozNarx)+" so'm":'');

  const parts = [
    {n:'Forma',v:formaJami},{n:'Pechat',v:pechatJami},{n:"Qog'oz",v:qogozJami},
    {n:'Laminatsiya',v:lamJami},{n:'Visichka',v:visJami},
    {n:'Pichoq',v:pichJami},{n:'Pereplot',v:perJami},{n:'Termokley',v:termJami},
    {n:'Zborka',v:zborJami},{n:'Rezka',v:rezkaJami},{n:"Qo'sh.rasxod",v:rasxodJami}
  ].filter(p=>p.v>0);

  el.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-bottom:10px;font-size:11px">'+
    parts.map(p=>'<div style="text-align:center;background:var(--blue-light);padding:4px 6px;border-radius:var(--radius-sm)"><div style="color:var(--text3)">'+p.n+'</div><div style="font-weight:700;color:var(--blue)">'+fmt(p.v)+"</div></div>").join('')+
    '</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">'+son+" dona | "+qogozSon+" list qog'oz</div>"+
    '<div style="font-size:13px;color:var(--text3);margin-bottom:4px">Tannarx: <b>'+fmt(jami)+" so'm</b></div>"+
    (foiz>0&&mijozNarx>0?'<div style="font-size:13px;color:var(--green);margin-bottom:6px">Mijozga (+'+foiz+'%): <b>'+fmt(mijozNarx)+" so'm</b></div>":'') +
    '<div style="font-size:30px;font-weight:700;color:var(--blue)">'+fmt(foiz>0&&mijozNarx>0?mijozNarx:jami)+" so'm</div>";
}

