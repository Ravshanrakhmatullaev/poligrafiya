// ═══════════════════════════════════════
// panels/dizayner.js — Dizayner va Stopwatch
// Depends on: config.js, utils.js, db.js, auth.js
// ═══════════════════════════════════════

// TODO: sb.from() calls bu faylda db.js service funksiyalariga ko'chirilishi kerak
let dizTimers      = {};
let swRowIntervals = {};
let hiddenSections = {};
let dizD = null, prD = null, adD = null, uvD = null, ekoD = null;
let swMain = { running: false, elapsed: 0, startTime: null };
let swMainInterval = null;


// ── DIZAYNER ──

function initDizaynerPanel(){
  if(dizD===null) dizD=[{nom:'', summa:'', tolovchi:'offis', tolov:null, kontakt:''}];
  renderDizayner();
}
function addDizRow(){ dizD.push({nom:'', summa:'', tolovchi:'offis', tolov:null, kontakt:''}); renderDizayner(); }
function delDiz(i){ dizD.splice(i,1); renderDizayner(); }

function renderDizayner(){
  const el = document.getElementById('diz-rows');
  if(!el) return;
  el.innerHTML = '';
  let jami=0, tolandi=0, tolanmadi=0;

  dizD.forEach((r,i) => {
    const s = parseInt(r.summa)||0;
    if(s){ jami+=s; if(r.tolov===true) tolandi+=s; else if(r.tolov===false) tolanmadi+=s; }

    // Mini stopwatch state
    const t = dizTimers[i] || {running:false, elapsed:0, start:null};
    const ms = t.running ? t.elapsed + (Date.now()-t.start) : t.elapsed;
    const ts = Math.floor(ms/1000);
    const swTime = String(Math.floor(ts/3600)).padStart(2,'0')+':'+String(Math.floor((ts%3600)/60)).padStart(2,'0')+':'+String(ts%60).padStart(2,'0');
    const swPrice = ts > 0 ? fmt(Math.round((ms/3600000)*100000)) : '0';

    const tolovchiOpts = '<option value="offis"' + (r.tolovchi==='offis'?' selected':'') + '>' + 'Offis</option>' +
      '<option value="mijoz"' + (r.tolovchi==='mijoz'?' selected':'') + '>' + 'Mijoz</option>';

    const div = document.createElement('div');
    div.className = 'diz-row';
    div.innerHTML =
      '<div class="diz-grid">' +
      '<input type="text" placeholder="Mahsulot / ish nomi" value="' + r.nom + '" oninput="dizD[' + i + '].nom=this.value">' +
      '<input type="text" inputmode="numeric" placeholder="Summa" value="' + r.summa + '" style="text-align:right" id="dsum' + i + '">' +
      '<select class="tolov-select" onchange="dizD[' + i + '].tolovchi=this.value;renderDizayner()">' + tolovchiOpts + '</select>' +
      delIcon('delDiz(' + i + ')') + '</div>' +
      '<div class="diz-mijoz' + (r.tolovchi==='mijoz'?' show':'') + '">' +
      '<input type="text" placeholder="Tel/Telegram" value="' + (r.kontakt||'') + '" oninput="dizD[' + i + '].kontakt=this.value" style="margin-bottom:0"></div>' +
      '<div class="diz-row-tools">' +
      '<div class="sw-mini" id="sw-mini-' + i + '">' +
      '<span class="sw-mini-time">' + swTime + '</span>' +
      '<span class="sw-mini-price">' + swPrice + " so'm" + '</span>' +
      '<button class="sw-mini-btn ' + (t.running?'active':'') + '" onclick="swRowToggle(' + i + ')">' + (t.running?'&#9646;&#9646;':'&#9654;') + '</button>' +
      '<button class="sw-mini-btn" onclick="swRowReset(' + i + ')" title="Qayta">&#8635;</button></div>' +
      '<button class="tasdiq-btn" onclick="showTasdiqXat(' + i + ')">&#x1F4CB; Tasdiq xati</button></div>' +
      '<div class="tolov-toggle">' +
      '<button class="tolov-btn' + (r.tolov===true?' tolandi':'') + '" onclick="dizD[' + i + '].tolov=true;renderDizayner()">To\'landi</button>' +
      '<button class="tolov-btn' + (r.tolov===false?' tolanmadi':'') + '" onclick="dizD[' + i + '].tolov=false;renderDizayner()">To\'lanmadi</button></div>' +
      (s>0?('<div style="font-size:12px;color:var(--text3);margin-top:6px;text-align:right">'+fmt(s)+" so'm</div>"):'');
    el.appendChild(div);
    numInput(div.querySelector('#dsum'+i), v=>{ dizD[i].summa=v; renderDizayner(); });
  });

  const dizJamiEl = document.getElementById('diz-jami');
  const dizTolandiEl = document.getElementById('diz-tolandi');
  const dizTolanmadiEl = document.getElementById('diz-tolanmadi');
  const dizGrandEl = document.getElementById('diz-grand');
  const dizTotalEl = document.getElementById('diz-total-show');
  if(dizJamiEl) dizJamiEl.textContent = fmt(jami)+" so'm";
  if(dizTolandiEl) dizTolandiEl.textContent = fmt(tolandi)+" so'm";
  if(dizTolanmadiEl) dizTolanmadiEl.textContent = fmt(tolanmadi)+" so'm";
  if(dizGrandEl) dizGrandEl.textContent = fmt(jami)+" so'm";
  if(dizTotalEl) dizTotalEl.textContent = fmt(jami)+" so'm";
}


async function saveDizayner(){
  const button = document.getElementById('dizayner-save-btn');
  const saveCtx = ErpSaveFlow.begin('history_create_dizayner', button);
  if(!saveCtx){ showNotify('Saqlanmoqda, kuting...'); return; }
  let outcome = 'error';
  let caughtError = null;
  const rows = dizD.filter(r=>r.nom||(parseInt(r.summa)||0));
  if(!rows.length){
    caughtError = Object.assign(new Error('Hech narsa kiritilmagan'), { erpKind: 'validation' });
    showNotify('Hech narsa kiritilmagan');
    ErpSaveFlow.finish(saveCtx, outcome, caughtError);
    return;
  }

  try {
    const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
    // summa har doim son sifatida saqlanadi — dizD dan kelayotgan xom
    // qatorlar (rows) ham data.rows ichida sonlashtiriladi, matn holida emas.
    const numericRows = rows.map(r=>({ ...r, summa: parseInt(r.summa)||0 }));
    let jami=0, tolandi=0, tolanmadi=0;
    numericRows.forEach(r=>{ jami+=r.summa; if(r.tolov===true) tolandi+=r.summa; else if(r.tolov===false) tolanmadi+=r.summa; });
    const sanaVaqt = getSanaVaqt();
    const row = {
      user_id: currentUser.id,
      user_email: currentUser.email,
      user_name: name,
      type: 'dizayner',
      data: { rows: numericRows },
      total_zakaz: jami,
      total_daromad: tolandi,
      total_jami: jami,
      sana: sanaVaqt,
    };

    ErpSaveFlow.prepare(saveCtx, { type: row.type, data: row.data, total_jami: row.total_jami });
    ErpSaveFlow.saving(saveCtx);
    const saved = await createHistoryItem(row, {
      operationId: saveCtx.operationId,
      reconcileFirst: saveCtx.reconcileFirst,
    });
    if(!saved) throw new Error('insert failed');

    showNotify('✅ Saqlandi! — '+sanaVaqt);

    dizD = [{nom:'', summa:'', tolovchi:'offis', tolov:null, kontakt:''}];
    dizTimers = {};
    renderDizayner();
    outcome = 'success';
    setTimeout(() => loadHistory().catch(() => {}), 0);
  } catch (e) {
    caughtError = e;
    console.error('[saveDizayner]', e);
    showNotify('❌ ' + saveErrorMessage(e), 'error');
  } finally {
    ErpSaveFlow.finish(saveCtx, outcome, caughtError);
  }
}

async function sendWeeklyDizayner(){
  const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
  const data = AppStore.history.filter(h => h.user_id === currentUser?.id); const error = null;
  if(error||!data||!data.length){ showNotify('Haftalik yozuvlar topilmadi'); return; }
  let lines = [`🎨 Dizayner: ${name}`, `📅 Haftalik hisobot`, ''];
  let totalJ=0, totalT=0, totalTM=0;
  data.forEach(h=>{
    lines.push(`📌 ${h.sana}`);
    (h.data.rows||[]).forEach((r,i)=>{
      const s=parseInt(r.summa)||0; totalJ+=s;
      const tolovStatus = r.tolov===true?'✅ To\'landi':r.tolov===false?'❌ To\'lanmadi':'⏳ Belgilanmagan';
      const tolovchi = r.tolovchi==='mijoz'?`👤 Mijoz${r.kontakt?' ('+r.kontakt+')':''}`: '🏢 Offis';
      if(r.tolov===true) totalT+=s; else if(r.tolov===false) totalTM+=s;
      lines.push(`  ${i+1}. ${r.nom}: ${fmt(s)} so'm | ${tolovchi} | ${tolovStatus}`);
    });
    lines.push('');
  });
  lines.push(`💰 Jami: ${fmt(totalJ)} so'm`);
  lines.push(`✅ To'landi: ${fmt(totalT)} so'm`);
  lines.push(`❌ To'lanmadi: ${fmt(totalTM)} so'm`);
  const msg = lines.join('\n');

  // Telegram t.me/share has ~4096 char limit
  // Truncate if needed
  const MAX = 4000;
  const truncated = msg.length > MAX ? msg.slice(0, MAX) + '\n...\n(qisqartirildi)' : msg;
  
  window.open('https://t.me/share/url?url=%20&text='+encodeURIComponent(truncated),'_blank');
}

function initAdminPanel(){
  if(!Array.isArray(adD)) adD=[{nom:'',sum:'',bonus_50:false}];
  renderAdmin();
}

function renderAdmin(){
  const el=document.getElementById('admin-rows'); el.innerHTML='';
  let tz=0,td=0,soni=0;
  const isAbror = canUseBonus50(currentUser && currentUser.email);
  adD.forEach((r,i)=>{
    const s=parseInt(r.sum)||0; const foiz=getFoiz(s);
    const baseDr = Math.round(s*foiz);
    const dr = (isAbror && r.bonus_50) ? Math.round(baseDr*1.5) : baseDr;
    if(r.nom||s){tz+=s;td+=dr;soni++;}
    const row=document.createElement('div'); row.className='zakaz-row';
    const bonusChk = isAbror
      ? `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--green);cursor:pointer;white-space:nowrap"><input type="checkbox" ${r.bonus_50?'checked':''} onchange="adD[${i}].bonus_50=this.checked;renderAdmin()"> +50%</label>`
      : '';
    row.innerHTML=`
      <input type="text" placeholder="Mahsulot nomi" value="${r.nom}" oninput="adD[${i}].nom=this.value">
      <input type="text" inputmode="numeric" placeholder="Summa" value="${r.sum}" style="text-align:right" id="asum${i}">
      <div class="fzbadge">${s?Math.round(foiz*100)+'%':'—'}</div>
      <div class="drbadge" style="${isAbror&&r.bonus_50?'color:var(--green);font-weight:700':''}">${s?fmt(dr)+" so'm":'—'}${isAbror&&r.bonus_50?' ✦':''}</div>
      ${bonusChk}${delIcon(`delAdmin(${i})`)}`;
    el.appendChild(row);
    numInput(row.querySelector(`#asum${i}`),v=>{adD[i].sum=v;renderAdmin();});
  });
  document.getElementById('admin-grand').textContent=fmt(td)+" so'm";
  renderAdminStats();
}

function renderAdminStats(){
  if(!currentUser) return;
  const myHistory = (allHistory||[]).filter(h => h.user_id===currentUser.id && h.type==='admin');

  // Oy chegaralari — Asia/Tashkent (yagona helper). Kartalar FAQAT shu oy.
  const curRange  = getTashkentMonthRange();
  const prevRange = prevTashkentMonthRange();
  const cur  = calculateMonthlyEmployeeStats(myHistory, curRange);
  const prev = calculateMonthlyEmployeeStats(myHistory, prevRange);
  const baseEarningsAllTime = myHistory.reduce((s,h)=>s+orderEarning(h), 0);

  const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  // BU OY kartalari (o'tgan oy hech qachon aralashmaydi)
  set('adm-zakaz',   fmt(cur.total)+" so'm");
  set('adm-daromad', fmt(cur.earnings)+" so'm");
  set('adm-soni',    cur.count+' ta');

  // O'tgan oy + motivatsiya
  const extra = document.getElementById('adm-month-extra');
  if(extra) extra.innerHTML = buildMonthExtra(cur, prev, monthComparison(cur, prev));

  // Top-right = "Bu oy daromadi" (shu oy sof daromadi, yashil) — payout/qarz EMAS.
  const tEl = document.getElementById('adm-total');
  if(tEl){ tEl.textContent = fmt(cur.earnings)+" so'm"; tEl.style.color = 'var(--green)'; }

  // Hisob-kitob (payable) — ALOHIDA bo'lim, "Sof daromad"ga qo'shilmaydi (hisob_kitob, async)
  getHisobKitob(currentUser.email).then(payouts => {
    const paidOut = (payouts||[]).reduce((s,p)=>s+(p.summa||0), 0);
    const carry = calculateEmployeeCarryover(baseEarningsAllTime, paidOut, cur.earnings);
    const cEl = document.getElementById('adm-carryover');
    if(cEl) cEl.innerHTML = buildCarryoverSection(cur.earnings, carry);
  }).catch(()=>{});
}

// O'tgan oy natijasi + motivatsion taqqoslash (foiz null bo'lsa Infinity ko'rsatilmaydi)
function buildMonthExtra(cur, prev, cmp){
  const pct = g => g === null ? '' : (g>=0?'+':'')+g+'%';
  let motiv, color;
  if(cmp.prevEmpty){ motiv = "O'tgan oyda ma'lumot yo'q — yangi oy, zo'r boshlang! 🚀"; color='var(--blue)'; }
  else if(cmp.exceeded){ motiv = `O'tgan oydan <b>${cmp.countDiff} ta ko'p</b> zakaz · O'sish <b>${pct(cmp.countGrowth)}</b> 🎉`; color='var(--green)'; }
  else if(cur.count < prev.count){ motiv = `O'tgan oy natijasiga yetish uchun yana <b>${cmp.reachRemaining} ta</b> zakaz kerak`; color='var(--amber)'; }
  else { motiv = "O'tgan oy bilan bir xil natija"; color='var(--text3)'; }

  const cmpRow = (label, curV, prevV, growth, unit) => {
    const diff = curV - prevV;
    const gp = growth === null ? '—' : (growth>=0?'+':'')+growth+'%';
    const dc = diff>0?'var(--green)':diff<0?'var(--red)':'var(--text3)';
    return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">
      <span style="color:var(--text3)">${label}</span>
      <span>Bu oy <b>${fmt(curV)}${unit}</b> · O'tgan <b>${fmt(prevV)}${unit}</b> · <span style="color:${dc}">${diff>=0?'+':''}${fmt(diff)}${unit} (${gp})</span></span>
    </div>`;
  };

  return `<div class="card" style="margin-top:12px">
    <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">O'tgan oy natijasi</div>
    <div class="stat-row" style="margin-bottom:8px">
      <div class="stat"><div class="stat-label">O'tgan oy summasi</div><div class="stat-val" style="font-size:15px">${fmt(prev.total)} so'm</div></div>
      <div class="stat"><div class="stat-label">O'tgan oy sof daromad</div><div class="stat-val" style="font-size:15px">${fmt(prev.earnings)} so'm</div></div>
      <div class="stat"><div class="stat-label">O'tgan oy zakaz soni</div><div class="stat-val" style="font-size:15px">${prev.count} ta</div></div>
    </div>
    <div style="padding:8px 10px;border-radius:8px;background:var(--gray-light);border:1px solid var(--gray-border);font-size:13px;color:${color};font-weight:600;margin-bottom:8px">${motiv}</div>
    ${cmpRow("Zakaz soni", cur.count, prev.count, cmp.countGrowth, ' ta')}
    ${cmpRow("Zakaz summasi", cur.total, prev.total, cmp.totalGrowth, " so'm")}
    ${cmpRow("Sof daromad", cur.earnings, prev.earnings, cmp.earningsGrowth, " so'm")}
  </div>`;
}

// Oldingi davrdan qoldiq — bu oy daromadi bilan aralashtirmasdan alohida.
function buildCarryoverSection(currentMonthEarnings, carry){
  if(carry.overpaid > 0){
    return `<div style="margin-top:12px;padding:8px 10px;border-radius:8px;background:var(--gray-light);border:1px solid var(--gray-border);font-size:12px">
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text3)">Bu oy sof daromad</span><b>${fmt(currentMonthEarnings)} so'm</b></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text3)">Ortiqcha to'langan</span><b style="color:#6366F1">${fmt(carry.overpaid)} so'm</b></div>
    </div>`;
  }
  if(carry.carryover <= 0){
    return `<div style="margin-top:12px;padding:8px 10px;border-radius:8px;background:var(--gray-light);border:1px solid var(--gray-border);font-size:12px;display:flex;justify-content:space-between">
      <span style="color:var(--text3)">Oldingi davrdan qoldiq</span><b style="color:var(--green)">0 so'm (yopiq)</b></div>`;
  }
  return `<div style="margin-top:12px;padding:8px 10px;border-radius:8px;background:var(--amber-light);border:1px solid var(--amber-border);font-size:12px">
    <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:var(--text3)">Bu oy sof daromad</span><b>${fmt(currentMonthEarnings)} so'm</b></div>
    <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:var(--text3)">Oldingi davrdan qoldiq</span><b style="color:var(--amber)">${fmt(carry.carryover)} so'm</b></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid var(--amber-border);margin-top:3px"><span style="font-weight:700">Jami to'lanishi kerak</span><b>${fmt(carry.totalDue)} so'm</b></div>
  </div>`;
}

function renderIshlabStats(){
  // Tarixdagi barcha "ishlab" turdagi yozuvlarni shu user uchun yig'amiz
  if(!currentUser) return;
  const myHistory = (allHistory||[]).filter(h => h.user_id===currentUser.id && h.type==='ishlab');
  let soni=0, brakSumma=0, qoldiqSumma=0;
  myHistory.forEach(h=>{
    soni++;
    const summa = h.total_jami||0;
    if(h.is_brak) brakSumma += summa;
    else if(!h.is_paid) qoldiqSumma += summa;
  });
  const soniEl=document.getElementById('ish-soni'), brakEl=document.getElementById('ish-brak'), sofEl=document.getElementById('ish-sof');
  if(soniEl) soniEl.textContent = soni+' ta';
  if(brakEl) brakEl.textContent = fmt(brakSumma)+" so'm";
  if(sofEl) sofEl.textContent = fmt(qoldiqSumma)+" so'm";
}

function renderIshlab(){
  const pelP=document.getElementById('prod-rows'); pelP.innerHTML=''; let pt=0;
  prD.forEach((r,i)=>{
    const isQolda = r.key === QOLDA_KEY;
    const p = isQolda ? null : PR[r.key];
    const m = parseInt(r.miq)||0;
    const qoldaNarx = parseInt(r.qolda_narx)||0;
    const un = isQolda ? (r.qolda_birlik||'dona') : (p?p.u:'dona');
    const np = isQolda ? qoldaNarx : (gUN(r.key,m) + (r.ex && p && p.extra ? 200 : 0));
    const jami = m>0 && np>0 ? m*np : 0;
    if(m>0 && np>0) pt += jami;

    const opts = Object.keys(CATEGORIES).map(cat=>{
      if(cat === 'qolda'){
        return '<optgroup label="'+CATEGORIES[cat].label+'"><option value="'+QOLDA_KEY+'"'+(isQolda?' selected':'')+">✏️ Qo'lda kiritish</option></optgroup>";
      }
      const items = Object.keys(PR).filter(k=>PR[k].cat===cat);
      if(!items.length) return '';
      const optionsHtml = items.map(k=>'<option value="'+k+'"'+(k===r.key?' selected':'')+'>'+k+'</option>').join('');
      return '<optgroup label="'+CATEGORIES[cat].label+'">'+optionsHtml+'</optgroup>';
    }).join('');

    const note = p && p.note ? '<div class="note-box">'+p.note+'</div>' : '';
    const exH = p && p.extra ? ('<div style="margin-top:6px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="ex'+i+'" '+(r.ex?'checked':'')+' onchange="prD['+i+'].ex=this.checked;renderIshlab()" style="width:auto;cursor:pointer;accent-color:var(--blue)"><label for="ex'+i+'" style="font-size:12px;color:var(--text3);cursor:pointer">2 tomonli (+200 som/dona)</label></div>') : '';
    const div = document.createElement('div'); div.className='pi';
    const brak = parseInt(r.brak)||0;
    const toza = m > 0 ? m - brak : 0;
    const brakStyle = brak > 0 ? 'border-color:var(--red-border);background:var(--red-light)' : '';

    div.innerHTML = '<div style="display:grid;grid-template-columns:1fr 80px 80px auto;gap:5px;align-items:center;margin-bottom:4px">' +
      '<select onchange="prD['+i+'].key=this.value;prD['+i+'].ex=false;prD['+i+'].qolda_nom=\'\';prD['+i+'].qolda_narx=\'\';renderIshlab()" style="font-size:12px">'+opts+'</select>' +
      '<input type="text" inputmode="numeric" placeholder="Miqdor" value="'+r.miq+'" style="text-align:center;font-size:12px" id="pmiq'+i+'">' +
      '<div class="badge bw" style="text-align:center;font-size:11px;padding:4px">'+(np>0&&m>0?fmt(np)+" so'm":'—')+'</div>' +
      '<div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">' +
        '<div class="badge bo" style="font-size:11px;white-space:nowrap">'+(jami>0?fmt(jami)+" so'm":'—')+'</div>' +
        delIcon('delProd('+i+')') +
      '</div>' +
    '</div>' +
      (isQolda ?
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">' +
          '<div><label style="font-size:11px;color:var(--text3)">Mahsulot nomi</label>' +
          '<input type="text" placeholder="Nomi" value="'+(r.qolda_nom||'')+'" oninput="prD['+i+'].qolda_nom=this.value" style="margin-top:2px"></div>' +
          '<div><label style="font-size:11px;color:var(--text3)">Narx (som/dona)</label>' +
          '<input type="text" inputmode="numeric" placeholder="Narx nomalum" value="'+(r.qolda_narx||'')+'" id="pnarx'+i+'" style="margin-top:2px;'+(r.qolda_narx?'':'border-color:var(--amber-border)')+'">' +
          '</div>' +
        '</div>' +
        (!r.qolda_narx ? '<div style="font-size:11px;color:var(--amber);margin-top:4px">⏳ Narx kiritilmagan — hisobga qoshilmaydi</div>' : '')
      : '') +
      '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">' +
        '<label style="font-size:11px;color:var(--text3)">Brak:</label>' +
        '<input type="text" inputmode="numeric" placeholder="0" value="'+(r.brak||'')+'" style="width:58px;text-align:center;font-size:12px;'+brakStyle+'" id="pbrak'+i+'">' +
        (brak>0?'<span class="badge" style="background:var(--red-light);color:var(--red);border:1px solid var(--red-border)">⚠️ '+brak+' ta brak</span><span class="badge bw">'+toza+' ta toza</span>':'') +
      '</div>' +
    exH+note;

    pelP.appendChild(div);
    numInput(div.querySelector('#pmiq'+i),v=>{prD[i].miq=v;renderIshlab();});
    numInput(div.querySelector('#pbrak'+i),v=>{prD[i].brak=v;renderIshlab();});
    if(isQolda && div.querySelector('#pnarx'+i)) numInput(div.querySelector('#pnarx'+i),v=>{prD[i].qolda_narx=v;renderIshlab();});
  });
  document.getElementById('prod-grand').textContent=fmt(pt)+" so'm";
  const prodSumEl = document.getElementById('prod-sum');
  if(prodSumEl) prodSumEl.textContent=fmt(pt)+" so'm";

  const pelU=document.getElementById('uv-rows'); pelU.innerHTML=''; let ut=0;
  uvD.forEach((r,i)=>{
    const sig=parseInt(r.sig)||0; const don=parseInt(r.don)||0;
    const{ls,lsFull,lsFrac,np,jami}=calcUv(sig,don); if(don>0&&sig>0)ut+=jami;
    
    // List ko'rinishi
    let lsDisplay = '';
    if(sig>0&&don>0){
      if(lsFrac===0) lsDisplay = `${lsFull} list`;
      else if(lsFull===0) lsDisplay = `${lsFrac} list`;
      else lsDisplay = `${lsFull} + ${lsFrac} list`;
    }
    
     const div=document.createElement('div'); div.className='ui';
     div.innerHTML=`<div style="display:grid;grid-template-columns:1fr 60px 64px auto;gap:5px;align-items:center;margin-bottom:4px">
       <input type="text" placeholder="Mahsulot nomi..." value="${r.nom}" oninput="uvD[${i}].nom=this.value" style="font-size:12px">
       <input type="text" inputmode="numeric" placeholder="Sig'im" value="${r.sig}" style="text-align:center;font-size:12px" id="usig${i}">
       <input type="text" inputmode="numeric" placeholder="Dona" value="${r.don}" style="text-align:center;font-size:12px" id="udon${i}">
       <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">
         ${sig>0&&don>0?`<span class="badge bo" style="font-size:11px;white-space:nowrap">${fmt(jami)}</span>`:'<span style="font-size:12px;color:var(--text3)">—</span>'}
         ${delIcon(`delUv(${i})`)}
       </div>
     </div>
     ${sig>0&&don>0?`<div class="ures">
       <span class="badge bp">${lsDisplay}</span>
       <span style="font-size:11px;color:var(--text3)">→</span>
       <span class="badge bo">${fmt(jami)} so'm</span>
       ${lsFrac>0?`<span style="font-size:11px;color:var(--text3)">(${lsFull}×${fmt(np)} + ${lsFrac} list)</span>`:''}
     </div>`:''}
     <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
       <label style="font-size:11px;color:var(--text3)">Brak:</label>
       <input type="text" inputmode="numeric" placeholder="0" value="${r.brak||''}" style="width:58px;text-align:center;font-size:12px;${parseInt(r.brak)>0?'border-color:var(--red-border);background:var(--red-light)':''}" id="ubrak${i}">
       ${parseInt(r.brak)>0?`<span class="badge" style="background:var(--red-light);color:var(--red);border:1px solid var(--red-border)">⚠️ ${r.brak} ta brak</span>`:''}
     </div>`;
    pelU.appendChild(div);
    numInput(div.querySelector(`#usig${i}`),v=>{uvD[i].sig=v;renderIshlab();});
    numInput(div.querySelector(`#udon${i}`),v=>{uvD[i].don=v;renderIshlab();});
    if(div.querySelector(`#ubrak${i}`)) numInput(div.querySelector(`#ubrak${i}`),v=>{uvD[i].brak=v;renderIshlab();});
  });
  document.getElementById('uv-grand').textContent=fmt(ut)+" so'm";
  document.getElementById('uv-sum').textContent=fmt(ut)+" so'm";

  const pelE=document.getElementById('eko-rows'); pelE.innerHTML=''; let et=0;
  ekoD.forEach((r,i)=>{
    const kv=parseFloat(r.kv)||0;
    const{narx,jami}=calcEko(kv); if(kv>0)et+=jami;
     const div=document.createElement('div'); div.className='ui'; div.style.cssText='border-radius:var(--radius-md);padding:10px;margin-bottom:6px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2)';
     div.innerHTML=`<div style="display:grid;grid-template-columns:1fr 80px auto;gap:5px;align-items:center;margin-bottom:4px">
       <input type="text" placeholder="Mahsulot nomi..." value="${r.nom}" oninput="ekoD[${i}].nom=this.value" style="font-size:12px">
       <input type="text" inputmode="decimal" placeholder="Kv.m" value="${r.kv}" style="text-align:center;font-size:12px" id="ekv${i}">
       <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">
         ${kv>0?`<span class="badge" style="background:var(--amber-light);color:var(--amber);border:1px solid var(--amber-border);font-size:11px;white-space:nowrap">${fmt(jami)} so'm</span>`:'<span style="font-size:12px;color:var(--text3)">—</span>'}
         ${delIcon(`delEko(${i})`)}
       </div>
     </div>
     ${kv>0?`<div class="ures" style="border-color:var(--amber-border)">
       <span class="badge" style="background:var(--amber-light);color:var(--amber);border:1px solid var(--amber-border)">${kv} kv.m</span>
       <span style="font-size:11px;color:var(--text3)">×</span>
       <span class="badge bw">${fmt(narx)} so'm/kv.m</span>
       <span style="font-size:11px;color:var(--text3)">=</span>
       <span class="badge bo">${fmt(jami)} so'm</span>
     </div>`:''}
     <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
       <label style="font-size:11px;color:var(--text3)">Brak:</label>
       <input type="text" inputmode="numeric" placeholder="0" value="${r.brak||''}" style="width:58px;text-align:center;font-size:12px;${parseInt(r.brak)>0?'border-color:var(--red-border);background:var(--red-light)':''}" id="ebrak${i}">
       ${parseInt(r.brak)>0?`<span class="badge" style="background:var(--red-light);color:var(--red);border:1px solid var(--red-border)">⚠️ ${r.brak} ta brak</span>`:''}
     </div>`;
    pelE.appendChild(div);
    numInput(div.querySelector(`#ekv${i}`),v=>{ekoD[i].kv=v;renderIshlab();});
    if(div.querySelector(`#ebrak${i}`)) numInput(div.querySelector(`#ebrak${i}`),v=>{ekoD[i].brak=v;renderIshlab();});
  });
  document.getElementById('eko-grand').textContent=fmt(et)+" so'm";

  const grand=pt+ut+et;
  document.getElementById('ishlab-grand').textContent=fmt(grand)+" so'm";
  document.getElementById('ishlab-sum').textContent=fmt(grand)+" so'm";
  document.getElementById('ishlab-total-show').textContent=fmt(grand)+" so'm";
}

function buildAdminMsg(){
  const name=((currentUser.email.split('+')[1] || '').split('@')[0])||currentUser.email.split('@')[0];
  const sana=new Date().toLocaleDateString('uz-UZ');
  let lines=[`👤 Admin: ${name}`,`📅 Sana: ${sana}`,``,`📋 ZAKAZLAR:`];
  let tz=0,td=0,n=0;
  adD.forEach(r=>{ const s=parseInt(r.sum)||0; if(!r.nom&&!s)return; const f=getFoiz(s); const d=Math.round(s*f); tz+=s;td+=d;n++; lines.push(`${n}. ${r.nom||'—'}: ${fmt(s)} so'm → ${Math.round(f*100)}% → ${fmt(d)} so'm`); });
  lines.push(``,`💰 Jami zakaz: ${fmt(tz)} so'm`,`✅ Sof daromad: ${fmt(td)} so'm`);
  return lines.join('\n');
}
function buildIshlabMsg(){
  const name=((currentUser.email.split('+')[1] || '').split('@')[0])||currentUser.email.split('@')[0];
  const sana=new Date().toLocaleDateString('uz-UZ');
  let lines=[`🏭 Xodim: ${name}`,`📅 Sana: ${sana}`];
  let pt=0,ut=0; const pl=[],ul=[];
  prD.forEach(r=>{ const m=parseInt(r.miq)||0; if(!m)return; const p=PR[r.key]; const un=gUN(r.key,m); const np=un+(r.ex && p && p.extra?200:0); const j=m*np; pt+=j; pl.push(`${pl.length+1}. ${r.key}: ${m} ${p?p.u:'dona'} × ${fmt(np)} = ${fmt(j)} so'm`); });
  if(pl.length){lines.push(``,`📦 ODDIY MAHSULOTLAR:`);lines.push(...pl);}
  uvD.forEach(r=>{ const sig=parseInt(r.sig)||0; const don=parseInt(r.don)||0; if(!sig||!don)return; const{ls,np,jami}=calcUv(sig,don); ut+=jami; ul.push(`${ul.length+1}. ${r.nom||'UV'}: ${don} dona (${sig}ta/list) → ${ls} list × ${fmt(np)} = ${fmt(jami)} so'm`); });
  if(ul.length){lines.push(``,`🔆 UV PECHAT:`);lines.push(...ul);}
  lines.push(``,`📊 Oddiy: ${fmt(pt)} so'm`,`📊 UV: ${fmt(ut)} so'm`,`💰 JAMI: ${fmt(pt+ut)} so'm`);
  return lines.join('\n');
}

// renderFoizTable() va calcFoiz() — js/panels/foiz.js ga kochirildi

// ── STOPWATCH ──

// Taymerni saqlash/yuklash
function saveTimers(){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    const snapshot = {};
    Object.keys(dizTimers).forEach(i => {
      const t = dizTimers[i];
      snapshot[i] = { elapsed: t.running ? t.elapsed + (Date.now()-t.start) : t.elapsed };
    });
    localStorage.setItem('dizTimers_'+userId, JSON.stringify(snapshot));
  } catch(e){}
}

function loadTimers(){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    const saved = localStorage.getItem('dizTimers_'+userId);
    if(saved){
      const snap = JSON.parse(saved);
      Object.keys(snap).forEach(i => {
        dizTimers[i] = { running:false, elapsed: snap[i].elapsed||0, start:null };
      });
    }
  } catch(e){}
}

// Panel holatini saqlash
function swToggle(){
  const btn = document.getElementById('sw-btn');
  if(swMain.running){
    swMain.elapsed += Date.now() - swMain.start;
    swMain.running = false;
    clearInterval(swMainInterval);
    if(btn) btn.textContent = 'Boshlash';
  } else {
    swMain.start = Date.now();
    swMain.running = true;
    swMainInterval = setInterval(swMainUpdate, 50);
    if(btn) btn.textContent = "To\'xtatish";
  }
}

function swMainUpdate(){
  const ms = swMain.elapsed + (swMain.running ? Date.now() - swMain.start : 0);
  const totalSec = Math.floor(ms/1000);
  const hh = String(Math.floor(totalSec/3600)).padStart(2,'0');
  const mm = String(Math.floor((totalSec%3600)/60)).padStart(2,'0');
  const ss = String(totalSec%60).padStart(2,'0');
  const msDisp = String(ms%1000).padStart(3,'0');
  const price = Math.round((ms/3600000)*100000);
  const d=document.getElementById('sw-display');
  const m=document.getElementById('sw-ms');
  const p=document.getElementById('sw-price');
  if(d) d.textContent=hh+':'+mm+':'+ss;
  if(m) m.textContent='.'+msDisp;
  if(p) p.textContent=fmt(price)+" so\'m";
}

function swReset(){
  swMain={running:false,elapsed:0,start:null};
  clearInterval(swMainInterval);
  const d=document.getElementById('sw-display');
  const m=document.getElementById('sw-ms');
  const p=document.getElementById('sw-price');
  const b=document.getElementById('sw-btn');
  if(d) d.textContent='00:00:00';
  if(m) m.textContent='.000';
  if(p) p.textContent="0 so\'m";
  if(b) b.textContent='Boshlash';
}

function swCopy(){
  const ms=swMain.elapsed+(swMain.running?Date.now()-swMain.start:0);
  const ts=Math.floor(ms/1000);
  const t=String(Math.floor(ts/3600)).padStart(2,'0')+':'+String(Math.floor((ts%3600)/60)).padStart(2,'0')+':'+String(ts%60).padStart(2,'0');
  const pr=Math.round((ms/3600000)*100000);
  navigator.clipboard.writeText("Vaqt: "+t+"\nNarx: "+fmt(pr)+" so\'m").then(()=>showNotify('Nusxa olindi!')).catch(()=>showNotify('Xato'));
}

function swRowToggle(i){
  if(!dizTimers[i]) dizTimers[i]={running:false,elapsed:0,start:null};
  const t=dizTimers[i];
  if(t.running){
    t.elapsed+=Date.now()-t.start;
    t.running=false;
    clearInterval(swRowIntervals[i]);
    delete swRowIntervals[i];
  } else {
    t.start=Date.now();
    t.running=true;
    swRowIntervals[i]=setInterval(()=>swRowUpdate(i),200);
  }
  saveTimers();
  renderDizayner();
}

function swRowReset(i){
  if(swRowIntervals[i]){clearInterval(swRowIntervals[i]);delete swRowIntervals[i];}
  dizTimers[i]={running:false,elapsed:0,start:null};
  saveTimers();
  renderDizayner();
}

function swRowReset(i){
  if(swRowIntervals[i]){clearInterval(swRowIntervals[i]);delete swRowIntervals[i];}
  dizTimers[i]={running:false,elapsed:0,start:null};
  saveTimers();
  renderDizayner();
}

function swRowUpdate(i){
  const t=dizTimers[i];
  if(!t||!t.running) return;
  const ms=t.elapsed+(Date.now()-t.start);
  const ts=Math.floor(ms/1000);
  const hh=String(Math.floor(ts/3600)).padStart(2,'0');
  const mm=String(Math.floor((ts%3600)/60)).padStart(2,'0');
  const ss=String(ts%60).padStart(2,'0');
  const pr=Math.round((ms/3600000)*100000);
  const el=document.getElementById('sw-mini-'+i);
  if(el){
    const te=el.querySelector('.sw-mini-time');
    const pe=el.querySelector('.sw-mini-price');
    if(te) te.textContent=hh+':'+mm+':'+ss;
    if(pe) pe.textContent=fmt(pr)+" so\'m";
  }
}

// ── TASDIQ XATI ──
function showTasdiqXat(i){
  const r=dizD[i]||{};
  const nom=r.nom||'Dizayn ishi';
  const summa=r.summa?fmt(parseInt(r.summa))+" so\'m":'—';
  const kontakt=r.kontakt||'—';
  const sana=getSanaVaqt();
  const dizaynAdi=document.getElementById('user-name-chip')?document.getElementById('user-name-chip').textContent:'Dizayner';
  const xat="DIZAYN TASDIQLOV XATI\n"+"─".repeat(30)+"\n"+
    "Mahsulot: "+nom+"\n"+
    "Dizayner: "+dizaynAdi+"\n"+
    "Sana: "+sana+"\n"+
    "Narx: "+summa+"\n"+
    "Mijoz kontakt: "+kontakt+"\n"+
    "─".repeat(30)+"\n"+
    "Hurmatli mijoz, sizning buyurtmangiz tayyor.\n"+
    "Iltimos, dizayn faylini ko\'rib chiqing va tasdiqlovingizni bildiring.\n\n"+
    "Tasdiqlash uchun javob yozing yoki qo\'ng\'iroq qiling.\n\n"+
    "Eslatma: Tasdiqlashdan keyin o\'zgartirishlar qilinmaydi.\n"+
    "─".repeat(30)+"\n"+
    "Ads uz Poligrafiya";
  const modal=document.getElementById('tasdiq-modal');
  const textEl=document.getElementById('tasdiq-text');
  if(modal&&textEl){textEl.value=xat;modal.classList.remove('hidden');}
}

function copyTasdiqXat(){
  const t=document.getElementById('tasdiq-text');
  if(!t) return;
  navigator.clipboard.writeText(t.value).then(()=>showNotify('Tasdiq xati nusxa olindi!')).catch(()=>{t.select();document.execCommand('copy');showNotify('Nusxa olindi!');});
}

// ── ERP <-> CRM BUYURTMA BOG'LASH (Ishlab chiqarish paneli) ──
// Hech qanday secret bu yerda yo'q — hammasi joriy foydalanuvchining o'z
// Supabase sessiyasi orqali ishlaydi (js/db.js: searchCrmOrders,
// getErpCrmLinks, createErpCrmLink, deleteErpCrmLink, getCrmWorkflowStatus,
// sendCrmWorkflowTransition).
let erpCrmLinks = [];
let erpCrmStatuses = {};
let crmPickerResults = [];
let crmPickerTimer = null;

const CRM_STATUS_LABELS = {
  NEW: 'Yangi', DESIGN: 'Dizayn', APPROVED: 'Tasdiqlangan', PRODUCTION: 'Ishlab chiqarilmoqda',
  QUALITY_CONTROL: 'Sifat nazorati', READY: 'Tayyor', DELIVERED: 'Yetkazib berildi',
  PICKED_UP: "Olib ketildi", COMPLETED: 'Yakunlangan',
};

async function initCrmLinksSection(){
  erpCrmLinks = await getErpCrmLinks();
  await refreshAllCrmStatuses();
  renderCrmLinksSection();
}

async function refreshAllCrmStatuses(){
  const results = await Promise.all(erpCrmLinks.map(l => getCrmWorkflowStatus(l.crm_order_id)));
  erpCrmStatuses = {};
  erpCrmLinks.forEach((l,i) => { erpCrmStatuses[l.crm_order_id] = results[i]; });
}

function renderCrmLinksSection(){
  const el = document.getElementById('crm-links-rows');
  if(!el) return;
  el.innerHTML = '';
  if(!erpCrmLinks.length){
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">Hali bog\'langan CRM buyurtma yo\'q</div>';
    return;
  }
  erpCrmLinks.forEach(link => {
    const order = link.crm_order || {};
    const status = erpCrmStatuses[link.crm_order_id];
    const statusKnown = status && status.ok;
    const statusLabel = statusKnown ? (CRM_STATUS_LABELS[status.status] || status.status)
      : (status === null ? 'Workflow hali yaratilmagan' : 'Yuklanmoqda...');
    const canProduction = statusKnown && status.status === 'APPROVED';
    const canProgress   = statusKnown && status.status === 'PRODUCTION';
    const canQc         = statusKnown && status.status === 'PRODUCTION';
    const canReady       = statusKnown && status.status === 'QUALITY_CONTROL';

    const div = document.createElement('div');
    div.className = 'crm-link-row';
    div.style.cssText = 'border:1px solid var(--gray-border);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:8px';
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
        '<div>' +
          '<div style="font-size:12px;font-weight:700;color:var(--text)">#' + (order.order_number||'—') + ' — ' + ((order.contact&&order.contact.name)||"Noma'lum mijoz") + '</div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + (order.product||'') + '</div>' +
        '</div>' +
        delIcon("erpUnlinkCrmOrder('" + link.id + "')") +
      '</div>' +
      '<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span class="badge bp">' + statusLabel + '</span>' +
        (statusKnown && typeof status.progress === 'number' ? '<span style="font-size:11px;color:var(--text3)">' + status.progress + '%</span>' : '') +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
        (canProduction ? '<button class="ish-add-btn" onclick="erpSendStatus(\'' + link.crm_order_id + '\',\'PRODUCTION\')">Ishlab chiqarishga berildi</button>' : '') +
        (canProgress ? '<button class="ish-add-btn" onclick="erpOpenProgressPrompt(\'' + link.crm_order_id + '\')">Progress</button>' : '') +
        (canQc ? '<button class="ish-add-btn" onclick="erpSendStatus(\'' + link.crm_order_id + '\',\'QUALITY_CONTROL\')">Tekshiruvga</button>' : '') +
        (canReady ? '<button class="ish-add-btn" onclick="erpSendStatus(\'' + link.crm_order_id + '\',\'READY\')">Tayyor</button>' : '') +
      '</div>';
    el.appendChild(div);
  });
}

async function erpSendStatus(crmOrderId, status){
  const res = await sendCrmWorkflowTransition(crmOrderId, status);
  if(res && res.ok){
    showNotify('✅ Status yangilandi: ' + (CRM_STATUS_LABELS[res.status]||res.status));
    await refreshAllCrmStatuses();
    renderCrmLinksSection();
  }
  // Xato holatida sendCrmWorkflowTransition o'zi showNotify chaqiradi — jim yutilmaydi.
}

function erpOpenProgressPrompt(crmOrderId){
  const val = window.prompt('Progress foizi (40-80):', '50');
  if(val === null) return;
  const n = parseInt(val, 10);
  if(isNaN(n) || n < 40 || n > 80){ showNotify('Progress 40-80 oralig\'ida bo\'lishi kerak', 'error'); return; }
  erpSendProgress(crmOrderId, n);
}

async function erpSendProgress(crmOrderId, manualProgress){
  const res = await sendCrmWorkflowTransition(crmOrderId, 'PRODUCTION', { productionProgress: { manualProgress: manualProgress } });
  if(res && res.ok){
    showNotify('✅ Progress yuborildi: ' + manualProgress + '%');
    await refreshAllCrmStatuses();
    renderCrmLinksSection();
  }
}

function erpUnlinkCrmOrder(linkId){
  showConfirm('Bog\'lanishni o\'chirish', 'Bu CRM buyurtma bilan bog\'lanishni o\'chirmoqchimisiz?', async () => {
    const ok = await deleteErpCrmLink(linkId);
    if(ok){
      erpCrmLinks = erpCrmLinks.filter(l => l.id !== linkId);
      renderCrmLinksSection();
      showNotify('Bog\'lanish o\'chirildi');
    }
  });
}

// ── CRM BUYURTMA PICKER MODAL ──
function openCrmOrderPicker(){
  crmPickerResults = [];
  const modal = document.getElementById('crm-picker-modal');
  const input = document.getElementById('crm-picker-input');
  const results = document.getElementById('crm-picker-results');
  if(input) input.value = '';
  if(results) results.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">Qidirilmoqda...</div>';
  if(modal) modal.classList.remove('hidden');
  searchCrmOrderPickerNow('');
}

function closeCrmOrderPicker(){
  const modal = document.getElementById('crm-picker-modal');
  if(modal) modal.classList.add('hidden');
}

function onCrmPickerInput(value){
  if(crmPickerTimer) clearTimeout(crmPickerTimer);
  crmPickerTimer = setTimeout(() => searchCrmOrderPickerNow(value), 300);
}

async function searchCrmOrderPickerNow(query){
  crmPickerResults = await searchCrmOrders(query);
  const results = document.getElementById('crm-picker-results');
  if(!results) return;
  if(!crmPickerResults.length){
    results.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">Hech narsa topilmadi</div>';
    return;
  }
  results.innerHTML = crmPickerResults.map(o =>
    '<div class="crm-picker-item" style="padding:8px 10px;border:1px solid var(--gray-border);border-radius:var(--radius-md);margin-bottom:6px;cursor:pointer" onclick="selectCrmOrderForLink(\'' + o.id + '\')">' +
      '<div style="font-size:12px;font-weight:700">#' + o.order_number + ' — ' + ((o.contact&&o.contact.name)||"Noma'lum mijoz") + '</div>' +
      '<div style="font-size:11px;color:var(--text3)">' + (o.product||'') + '</div>' +
    '</div>'
  ).join('');
}

async function selectCrmOrderForLink(crmOrderId){
  const link = await createErpCrmLink(crmOrderId);
  closeCrmOrderPicker();
  if(link){
    showNotify('✅ CRM buyurtma bog\'landi');
    await initCrmLinksSection();
  }
}
