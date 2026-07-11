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
  ['sigim','banner','bekprint','uvdtf','dtf','pechat','ofset'].forEach(t => {
    const el2 = document.getElementById('kalk-'+t);
    if(el2) el2.classList.toggle('hidden', t !== type);
  });
  if(type === 'ofset') updateOfsetFormats();
}

function clearKalk(){
  // Clear all inputs in current kalk section
  const section = document.getElementById('kalk-'+kalkType);
  if(section){
    section.querySelectorAll('input[type=text]').forEach(i=>i.value='');
    section.querySelectorAll('input[type=checkbox]').forEach(i=>{ if(i.classList.contains('kc-switch-input')) i.checked=false; });
    section.querySelectorAll('[id$="-body"]').forEach(b=>b.style.display='none');
    // Reset results
    ['kalk-banner-result','kalk-bek-result','kalk-uv-result','kalk-dtf-result','kalk-pech-result','kalk-of-result','sig-result'].forEach(id=>{
      const e=document.getElementById(id);
      if(e && section.contains(e)){
        e.style.display='none';
        const valEl = e.querySelector && e.querySelector('[style*="font-size:24px"]'); if(valEl) valEl.textContent='—';
      }
    });
    const sigEmpty = document.getElementById('sig-empty');
    if(sigEmpty && section.contains(sigEmpty)) sigEmpty.style.display='block';
  }
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
  const mahEni  = parseFloat(document.getElementById('sig-mah-eni').value)||0;
  const mahBoyi = parseFloat(document.getElementById('sig-mah-boyi').value)||0;
  const matEni  = parseFloat(document.getElementById('sig-mat-eni').value)||0;
  const matBoyi = parseFloat(document.getElementById('sig-mat-boyi').value)||0;
  const kesish  = document.getElementById('sig-kesish').checked;
  const oraliq  = kesish ? 0.5 : 0;

  const resEl   = document.getElementById('sig-result');
  const emptyEl = document.getElementById('sig-empty');
  const infoEl  = document.getElementById('sig-kesish-info');
  if(infoEl) infoEl.style.display = kesish ? 'block' : 'none';

  if(!mahEni || !mahBoyi || !matEni || !matBoyi){
    if(resEl) resEl.style.display = 'none';
    if(emptyEl) emptyEl.style.display = 'block';
    return;
  }

  function sigDir(matO, mahO){
    if(oraliq === 0) return Math.floor(matO / mahO);
    return Math.floor((matO + oraliq) / (mahO + oraliq));
  }

  const normEni  = sigDir(matEni, mahEni);
  const normBoyi = sigDir(matBoyi, mahBoyi);
  const normSon  = normEni * normBoyi;
  const normEniFiz  = normEni  > 0 ? normEni  * mahEni  + (normEni -1)*oraliq : 0;
  const normBoyiFiz = normBoyi > 0 ? normBoyi * mahBoyi + (normBoyi-1)*oraliq : 0;

  const rotEni  = sigDir(matEni, mahBoyi);
  const rotBoyi = sigDir(matBoyi, mahEni);
  const rotSon  = rotEni * rotBoyi;
  const rotEniFiz  = rotEni  > 0 ? rotEni  * mahBoyi + (rotEni -1)*oraliq : 0;
  const rotBoyiFiz = rotBoyi > 0 ? rotBoyi * mahEni  + (rotBoyi-1)*oraliq : 0;

  const best    = Math.max(normSon, rotSon);
  const bestWay = normSon >= rotSon ? "(to'g'ri)" : "(aylantirib)";

  if(resEl) resEl.style.display = 'block';
  if(emptyEl) emptyEl.style.display = 'none';

  // kalkLastResult yangilash
  kalkLastResult = 'Sig\'im hisoblash\n'+
    'Mahsulot: '+mahEni+'×'+mahBoyi+' sm\n'+
    'Material: '+matEni+'×'+matBoyi+' sm\n'+
    (kesish?'Kesish oralig\': +0.5 sm\n':'')+
    'To\'g\'ri joylashganda: '+normSon+' ta ('+normEni+'×'+normBoyi+')\n'+
    'Aylantirib: '+rotSon+' ta ('+rotEni+'×'+rotBoyi+')\n'+
    'Eng ko\'p: '+best+' ta '+bestWay;

  const set = (id, val) => { const e=document.getElementById(id); if(e) e.textContent=val; };

  set('sig-normal',   normSon + ' ta');
  set('sig-normal-info', normEni+'×'+normBoyi + (kesish?' ('+normEniFiz.toFixed(1)+'×'+normBoyiFiz.toFixed(1)+' sm)':''));
  set('sig-rotated',  rotSon + ' ta');
  set('sig-rotated-info', rotEni+'×'+rotBoyi + (kesish?' ('+rotEniFiz.toFixed(1)+'×'+rotBoyiFiz.toFixed(1)+' sm)':''));
  set('sig-best',     best + ' ta');
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

function calcDtf(){
  const eni = parseFloat(document.getElementById('kalk-dtf-eni').value)||0;
  const boyi = parseFloat(document.getElementById('kalk-dtf-boyi').value)||0;
  const son = parseInt(document.getElementById('kalk-dtf-son').value)||0;
  const tur = parseFloat(document.getElementById('kalk-dtf-tur').value)||1;
  if(!eni||!boyi||!son) return;
  const kvM = (eni * boyi) / 10000;
  const birlikNarx = Math.max(8000, Math.round(kvM * 12000 * tur));
  const jami = birlikNarx * son;
  const izoh = eni+'×'+boyi+' sm, '+son+' dona'+(tur>1?' (ikki tomonlama)':'');
  kalkLastResult = 'DTF: '+izoh+'\nNarx: '+fmt(birlikNarx)+" so'm/dona\nJami: "+fmt(jami)+" so'm";
  const el = document.getElementById('kalk-dtf-result');
  if(!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:4px">'+izoh+'</div>'+
    '<div style="font-size:28px;font-weight:700;color:#EF4444">'+fmt(jami)+" so'm</div>"+
    '<div style="font-size:11px;color:var(--text3);margin-top:4px">'+fmt(birlikNarx)+" so'm/dona</div>";
}


function calcPechat(){
  const son = parseInt(document.getElementById('kalk-pech-son').value)||0;
  const olch = document.getElementById('kalk-pech-olch').value;
  if(!son) return;
  const narxlar = { 'A4': 500, 'A3': 900, 'A5': 300 };
  const narx = narxlar[olch] || 500;
  const jami = narx * son;
  const izoh = olch + ' format, ' + son + ' dona';
  kalkLastResult = 'Pechat: '+izoh+'\nNarx: '+fmt(narx)+" so'm/dona\nJami: "+fmt(jami)+" so'm";
  const el = document.getElementById('kalk-pech-result');
  if(!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:4px">'+izoh+'</div>'+
    '<div style="font-size:28px;font-weight:700;color:#22C55E">'+fmt(jami)+" so'm</div>"+
    '<div style="font-size:11px;color:var(--text3);margin-top:4px">'+fmt(narx)+" so'm/dona</div>";
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
  // Focus: avtomatik qiymatni ko'rsatish uchun hint bosiladi
}

function ofUseAuto(inputId, hiddenId){
  const autoVal = document.getElementById(hiddenId).value;
  if(autoVal){ document.getElementById(inputId).value = autoVal; calcOfset(); }
}

function toggleOfBlok(key){
  const body = document.getElementById('of-'+key+'-body');
  const check = document.getElementById('of-'+key+'-check');
  if(body && check) body.style.display = check.checked ? 'grid' : 'none';
}

function updateOfsetFormats(){ calcOfset(); }
function updateOfsetQogoz(){ calcOfset(); }

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

