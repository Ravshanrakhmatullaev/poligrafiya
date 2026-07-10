
// ── DIZAYNER ──
let dizD = [{nom:'', summa:'', tolovchi:'offis', tolov:null, kontakt:''}];

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
  if(isSaving){ showNotify('Saqlanmoqda, kuting...'); return; }
  const rows = dizD.filter(r=>r.nom||(parseInt(r.summa)||0));
  if(!rows.length){ showNotify('Hech narsa kiritilmagan'); return; }
  isSaving = true;
  const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
  let jami=0, tolandi=0, tolanmadi=0;
  rows.forEach(r=>{ const s=parseInt(r.summa)||0; jami+=s; if(r.tolov===true) tolandi+=s; else if(r.tolov===false) tolanmadi+=s; });
  const sanaVaqt = getSanaVaqt();
  const row = {
    user_id: currentUser.id,
    user_email: currentUser.email,
    user_name: name,
    type: 'dizayner',
    data: { rows },
    total_zakaz: jami,
    total_daromad: tolandi,
    total_jami: jami,
    sana: sanaVaqt,
  };
  const { error } = await sb.from('zakazlar').insert(row);
  isSaving = false;
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }
  showNotify('✅ Saqlandi! — '+sanaVaqt);
  // Avval tarixni yangilab, keyin formani tozalaymiz
  await loadHistory();
  dizD = [{nom:'', summa:'', tolovchi:'offis', tolov:null, kontakt:''}];
  dizTimers = {};
  renderDizayner();
}

async function sendWeeklyDizayner(){
  const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
  const { data, error } = await sb.from('zakazlar').select('*').eq('user_id', currentUser.id).eq('type','dizayner').order('created_at',{ascending:true});
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

function renderAdmin(){
  const el=document.getElementById('admin-rows'); el.innerHTML='';
  let tz=0,td=0,soni=0;
  adD.forEach((r,i)=>{
    const s=parseInt(r.sum)||0; const foiz=getFoiz(s); const dr=Math.round(s*foiz);
    if(r.nom||s){tz+=s;td+=dr;soni++;}
    const row=document.createElement('div'); row.className='zakaz-row';
    row.innerHTML=`
      <input type="text" placeholder="Mahsulot nomi" value="${r.nom}" oninput="adD[${i}].nom=this.value">
      <input type="text" inputmode="numeric" placeholder="Summa" value="${r.sum}" style="text-align:right" id="asum${i}">
      <div class="fzbadge">${s?Math.round(foiz*100)+'%':'—'}</div>
      <div class="drbadge">${s?fmt(dr)+" so'm":'—'}</div>
      ${delIcon(`delAdmin(${i})`)}`;
    el.appendChild(row);
    numInput(row.querySelector(`#asum${i}`),v=>{adD[i].sum=v;renderAdmin();});
  });
  // Joriy (hali saqlanmagan) forma yig'indisi — faqat pastdagi "Sof daromad" tugmasi yonida
  document.getElementById('admin-grand').textContent=fmt(td)+" so'm";

  // Statistika kartalari endi TARIXDAN hisoblanadi (renderAdminStats orqali)
  renderAdminStats();
}

function renderAdminStats(){
  // Tarixdagi barcha "admin" turdagi yozuvlarni shu user uchun yig'amiz
  if(!currentUser) return;
  const myHistory = (allHistory||[]).filter(h => h.user_email===currentUser.email && h.type==='admin');
  let tz=0, tdJami=0, tdQoldiq=0, soni=0;
  myHistory.forEach(h=>{
    tz += h.total_zakaz||0;
    const daromad = h.total_daromad||0;
    tdJami += daromad;
    // To'langan yoki brak bo'lsa qolgan to'lovdan ayriladi
    if(!h.is_paid && !h.is_brak) tdQoldiq += daromad;
    soni += (h.data&&h.data.rows ? h.data.rows.filter(r=>r.nom||(parseInt(r.sum)||0)).length : 0);
  });
  const zEl=document.getElementById('adm-zakaz'), dEl=document.getElementById('adm-daromad'),
        sEl=document.getElementById('adm-soni'), tEl=document.getElementById('adm-total');
  if(zEl) zEl.textContent=fmt(tz)+" so'm";
  if(dEl) dEl.textContent=fmt(tdQoldiq)+" so'm";
  if(sEl) sEl.textContent=soni+' ta';
  if(tEl) tEl.textContent=fmt(tdQoldiq)+" so'm";
}

function renderIshlabStats(){
  // Tarixdagi barcha "ishlab" turdagi yozuvlarni shu user uchun yig'amiz
  if(!currentUser) return;
  const myHistory = (allHistory||[]).filter(h => h.user_email===currentUser.email && h.type==='ishlab');
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

const FL=['100 000 gacha','100 000 – 249 000','250 000 – 499 000','500 000 – 999 000','1 000 000 – 1 999 000','2 000 000 – 2 999 000','3 000 000 – 3 999 000','4 000 000 – 4 999 000','5 000 000 – 9 999 000','10 000 000 – 29 999 000','30 000 000 – 49 999 000','50 000 000 – 99 999 000','100 000 000 +'];
let ftBuilt=false;
function renderFoizTable(){ const tb=document.getElementById('foiz-tbody'); if(!tb) return; tb.innerHTML=''; FOIZ.forEach(([,,f],i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${FL[i]}</td><td class="fp">${Math.round(f*100)}%</td>`; tb.appendChild(tr); }); }
function calcFoiz(){ const v=parseInt(document.getElementById('calc-inp').value.replace(/\D/g,''))||0; const f=getFoiz(v); document.getElementById('calc-foiz').textContent=v?Math.round(f*100)+'%':'— %'; document.getElementById('calc-daromad').textContent=v?fmt(Math.round(v*f))+" so'm":'— so\'m'; document.querySelectorAll('#foiz-tbody tr').forEach((tr,i)=>{ const[lo,hi]=FOIZ[i]; tr.className=(v>=lo&&v<=hi)?'hl':''; }); }

function showScreen(id){ ['login-screen','yoriq-screen','dizayner-yoriq-screen','admin-yoriq-screen','app-screen'].forEach(s=>{ document.getElementById(s) && document.getElementById(s).classList.add('hidden'); }); const map={login:'login-screen',yoriq:'yoriq-screen',dizayner_yoriq:'dizayner-yoriq-screen',admin_yoriq:'admin-yoriq-screen',app:'app-screen'}; document.getElementById(map[id]) && document.getElementById(map[id]).classList.remove('hidden'); }
function showPanel(id){ saveLastPanel(id); document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active')); document.querySelectorAll('.nav-btn').forEach(b=>{b.classList.remove('active');b.removeAttribute('aria-current')}); document.getElementById('panel-'+id) && document.getElementById('panel-'+id).classList.add('active'); document.getElementById('nb-'+id) && document.getElementById('nb-'+id).classList.add('active'); if(id==='foiz')renderFoizTable(); if(id==='tarix'){renderHistory();if(currentRole==='owner')renderBiDashboard();} if(id==='owner')renderOwnerPanel(); if(id==='xabarlar'){loadMessages();renderMessages();} if(id==='ishlab')loadHiddenSections(); if(id==='sklad')loadSklad(); if(id==='stopwatch')renderDizayner(); if(id==='dashboard')renderDashboard(); if(id==='bozorlik'){loadBozorlik();if(!skladData.length)loadSklad();} if(id==='uvdtf'){loadUvdtfHisobot(); document.getElementById('nb-uvdtf') && document.getElementById('nb-uvdtf').classList.add('active');} if(id==='kalk'){setKalkType('sigim', document.querySelector('.kc-tab[data-type="sigim"]'));} saveCurrentPanel(id); }
function showNotify(msg, type){
  const container = document.getElementById('toast-container');
  if(!container){ alert(msg); return; }

  // Auto-detect type
  if(!type){
    if(msg.includes('✅')||msg.includes('Saqlandi')||msg.includes('olindi')||msg.includes('yuborildi')) type='success';
    else if(msg.includes('❌')||msg.includes('Xato')||msg.includes('xatolik')||msg.includes('topilmadi')) type='error';
    else if(msg.includes('⚠️')) type='warning';
    else type='info';
  }

  const toast = document.createElement('div');
  toast.className = 'toast '+type;
  toast.innerHTML = '<span style="flex:1">'+msg+'</span><button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;padding:0 0 0 8px;line-height:1">×</button>';
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => { if(toast.parentNode) toast.remove(); }, 220);
  }, 3000);
}

function showConfirm(title, msg, onConfirm, onCancel){
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML =
    '<div class="confirm-box">'+
      '<div class="confirm-title">'+title+'</div>'+
      '<div class="confirm-msg">'+msg+'</div>'+
      '<div class="confirm-actions">'+
        '<button class="btn btn-secondary" id="conf-cancel">Bekor qilish</button>'+
        '<button class="btn btn-danger" id="conf-ok">Tasdiqlash</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('conf-ok').onclick = () => { overlay.remove(); if(onConfirm) onConfirm(); };
  document.getElementById('conf-cancel').onclick = () => { overlay.remove(); if(onCancel) onCancel(); };
  overlay.addEventListener('click', e => { if(e.target===overlay){ overlay.remove(); if(onCancel) onCancel(); } });
}

renderAdmin();
renderIshlab();
renderDizayner();
renderMessages();

// ── PERSONAL DASHBOARD ──
let dbMode = 'oylik';
let dbChart = null;
const OY_NOMI = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];

function setDbMode(mode, el){
  dbMode = mode;
  document.querySelectorAll('#panel-dashboard .filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderDashboard();
}

function renderDashboard(){
  if(!currentUser || !allHistory) return;
  const myData = allHistory.filter(h => h.user_email === currentUser.email);
  if(!myData.length){
    document.getElementById('db-recent-list').innerHTML = '<div class="empty-state"><p>Hali yozuvlar yoq</p></div>';
    return;
  }

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  // Hisoblash
  let jamiZakaz = 0, sofDaromad = 0, buOy = 0, utganOy = 0, brakSoni = 0;

  myData.forEach(h => {
    const d = new Date(h.created_at);
    const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
    jamiZakaz += (h.type === 'admin' ? (h.total_zakaz||0) : val);
    if(!h.is_paid && !h.is_brak) sofDaromad += val;
    if(d.getMonth() === thisMonth && d.getFullYear() === thisYear) buOy += val;
    if(d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) utganOy += val;
    if(h.is_brak) brakSoni++;
  });

  const osish = utganOy > 0 ? Math.round(((buOy - utganOy) / utganOy) * 100) : (buOy > 0 ? 100 : 0);

  // Stat kartalar
  const el = id => document.getElementById(id);
  el('db-jami').textContent = myData.length + ' ta';
  el('db-daromad').textContent = fmt(sofDaromad) + " so'm";
  el('db-bu-oy').textContent = fmt(buOy) + " so'm";
  el('db-utgan-oy').textContent = fmt(utganOy) + " so'm";
  el('db-osish').textContent = (osish >= 0 ? '+' : '') + osish + '%';
  el('db-osish').style.color = osish >= 0 ? 'var(--green)' : 'var(--red)';
  el('db-brak').textContent = brakSoni + ' ta';

  // Grafik
  renderDbChart(myData, thisMonth, thisYear);

  // KPI progress (faqat sotuvchilar uchun)
  const kpiCard = document.getElementById('db-kpi-card');
  const kpi = getKpi(currentUser.email);
  if(kpi && kpiCard && currentRole === 'admin'){
    kpiCard.classList.remove('hidden');
    
    // Bu oylik summa
    const now2 = new Date();
    const oylikSumma = myData
      .filter(h => { const d=new Date(h.created_at); return d.getMonth()===now2.getMonth()&&d.getFullYear()===now2.getFullYear(); })
      .reduce((s,h)=>s+(h.total_zakaz||h.total_daromad||0), 0);
    
    const pct = Math.min(Math.round((oylikSumma/kpi.maqsad)*100), 100);
    const curBonus = getCurrentBonus(currentUser.email, oylikSumma);
    const nxtBonus = getNextBonus(currentUser.email, oylikSumma);
    
    const el2 = id => document.getElementById(id);
    if(el2('db-kpi-daraja-label')) el2('db-kpi-daraja-label').textContent = DARAJA_LABELS[kpi.daraja] || kpi.daraja;
    if(el2('db-kpi-current')) el2('db-kpi-current').textContent = fmt(oylikSumma)+" so'm";
    if(el2('db-kpi-maqsad')) el2('db-kpi-maqsad').textContent = fmt(kpi.maqsad)+" so'm";
    if(el2('db-kpi-pct')) el2('db-kpi-pct').textContent = pct+'%';
    if(el2('db-kpi-bar')) el2('db-kpi-bar').style.width = pct+'%';
    if(el2('db-kpi-bar')) el2('db-kpi-bar').style.background = pct>=100?'var(--green)':pct>=70?'linear-gradient(90deg,var(--blue),var(--green))':'linear-gradient(90deg,var(--amber),var(--blue))';
    if(el2('db-kpi-fiks')) el2('db-kpi-fiks').textContent = fmt(kpi.fiks)+" so'm";
    
    if(curBonus){
      if(el2('db-kpi-bonus-label')) el2('db-kpi-bonus-label').textContent = curBonus.label;
      if(el2('db-kpi-bonus-sum')) el2('db-kpi-bonus-sum').textContent = fmt(curBonus.bonus)+" so'm";
      const totalDaromad = kpi.fiks + curBonus.bonus;
      if(el2('db-kpi-bonus-info')) el2('db-kpi-bonus-info').querySelector('div:last-child') && (el2('db-kpi-bonus-info').innerHTML = 
        '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Joriy bonus bosqichi</div>'+
        '<div style="font-size:14px;font-weight:700;color:var(--green)">'+curBonus.label+'</div>'+
        '<div style="font-size:13px;color:var(--text2);margin-top:4px">Fiks: <b>'+fmt(kpi.fiks)+" so'm</b> + Bonus: <b style='color:var(--green)'>"+fmt(curBonus.bonus)+" so'm</b> = <b style='color:var(--blue)'>"+fmt(totalDaromad)+" so'm</b></div>");
    }
    
    if(nxtBonus && el2('db-kpi-next')){
      const qoldi = nxtBonus.min - oylikSumma;
      el2('db-kpi-next').innerHTML = "⬆️ Keyingi bosqich (<b>"+nxtBonus.label+"</b>): yana <b style='color:var(--blue)'>"+fmt(qoldi)+" so'm</b> qoldi → bonus <b>"+fmt(nxtBonus.bonus)+" so'm</b> bo'ladi";
    } else if(!nxtBonus && el2('db-kpi-next')){
      el2('db-kpi-next').innerHTML = "🏆 <b style='color:var(--green)'>Eng yuqori bosqichdasiz!</b>";
    }

    // Jarima tizimini ko'rsatish
    const jarimalar = KPI_JARIMA[kpi.daraja] || [];
    const jarimarEl = el2('db-kpi-jarima-list');
    if(jarimarEl){
      jarimarEl.innerHTML = jarimalar.map(j =>
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:4px 8px;border-radius:var(--radius-sm);background:var(--red-light);border:1px solid var(--red-border);font-size:11px">'+
          '<span style="color:var(--text2);flex:1;margin-right:8px">'+j.sabab+'</span>'+
          '<span style="font-weight:700;color:var(--red);white-space:nowrap">'+fmt(j.miqdor)+" so'm</span>"+
        '</div>'
      ).join('');
    }
  } else if(kpiCard){
    kpiCard.classList.add('hidden');
  }

  // So'nggi 5 ta zakaz
  const recent = [...myData].slice(0, 5);
  const listEl = el('db-recent-list');
  if(!listEl) return;
  listEl.innerHTML = recent.map(h => {
    const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
    const statusColor = h.is_brak ? 'var(--red)' : h.is_paid ? 'var(--green)' : 'var(--amber)';
    const statusText = h.is_brak ? 'Brak' : h.is_paid ? "To'landi" : 'Kutilmoqda';
    const typeLabel = h.type === 'admin' ? '👤' : h.type === 'ishlab' ? '🏭' : '🎨';
    return `<div class="db-recent-item">
      <div>
        <div class="db-recent-label">${typeLabel} ${h.sana || ''}</div>
        <div class="db-recent-date">${h.sana || ''}</div>
      </div>
      <div style="text-align:right">
        <div class="db-recent-sum" style="color:var(--blue)">${fmt(val)} so'm</div>
        <span class="db-recent-status" style="background:${statusColor}22;color:${statusColor}">${statusText}</span>
      </div>
    </div>`;
  }).join('');
  // Avans (hodimlar uchun)
  if(currentRole !== 'owner') loadMyAvans();
}

async function loadMyAvans(){
  const card = document.getElementById('db-avans-card');
  const list = document.getElementById('db-avans-list');
  if(!card || !list || !currentUser) return;

  const { data, error } = await sb.from('avanslar')
    .select('*')
    .eq('user_email', currentUser.email)
    .order('created_at', { ascending: false })
    .limit(10);

  if(error || !data || !data.length){
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  const jami = data.reduce((s, a) => s + (a.summa || 0), 0);

  list.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 12px;border-bottom:1px solid var(--gray-border);margin-bottom:8px">'+
      '<span style="font-size:12px;color:var(--text3)">Jami avans</span>'+
      '<span style="font-size:16px;font-weight:700;color:var(--green)">'+fmt(jami)+" so'm</span>"+
    '</div>'+
    data.map(a => {
      const sana = new Date(a.created_at).toLocaleDateString('uz-UZ');
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-border)">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:600;color:var(--text)">'+fmt(a.summa)+" so'm</div>"+
          '<div style="font-size:11px;color:var(--text3)">'+(a.izoh||'')+'</div>'+
        '</div>'+
        '<div style="font-size:11px;color:var(--text3)">'+sana+'</div>'+
      '</div>';
    }).join('');
}


function renderDbChart(myData, thisMonth, thisYear){
  const canvas = document.getElementById('db-chart');
  if(!canvas || typeof Chart === 'undefined') return;

  let labels = [], data = [];

  if(dbMode === 'oylik'){
    // Bu yilning har oyi
    const monthly = Array(12).fill(0);
    myData.forEach(h => {
      const d = new Date(h.created_at);
      if(d.getFullYear() === thisYear){
        const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
        monthly[d.getMonth()] += val;
      }
    });
    labels = OY_NOMI;
    data = monthly;

  } else if(dbMode === 'haftalik'){
    // So'nggi 8 hafta
    const weeks = {};
    myData.forEach(h => {
      const d = new Date(h.created_at);
      const weekNum = Math.floor((new Date() - d) / (7*24*60*60*1000));
      if(weekNum < 8){
        if(!weeks[weekNum]) weeks[weekNum] = 0;
        const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
        weeks[weekNum] += val;
      }
    });
    labels = Array.from({length:8},(_,i) => i===0?'Bu hafta':(i+' hafta oldin')).reverse();
    data = Array.from({length:8},(_,i)=>weeks[7-i]||0);

  } else {

    const yearly = {};
    myData.forEach(h => {
      const y = new Date(h.created_at).getFullYear();
      if(!yearly[y]) yearly[y] = 0;
      const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
      yearly[y] += val;
    });
    const years = Object.keys(yearly).sort();
    labels = years;
    data = years.map(y => yearly[y]);
  }

  if(dbChart) dbChart.destroy();

  // Gradient
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(37,99,235,0.3)');
  gradient.addColorStop(1, 'rgba(37,99,235,0.02)');

  dbChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: "Daromad",
        data,
        borderColor: '#2563eb',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#2563eb',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#94a3b8',
          bodyColor: '#fff',
          callbacks: {
            label: ctx => fmt(ctx.parsed.y) + " so'm"
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}


init();

// ── RASM YUKLASH ──
function previewRasm(input){
  const file = input && input.files && input.files[0];
  if(!file) return;
  showRasmPreview(file);
}

function handleRasmDrop(event){
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if(!file || !file.type.startsWith('image/')) return;
  const input = document.getElementById('sk-rasm-input');
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch(e){}
  showRasmPreview(file);
}

function showRasmPreview(file){
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('sk-rasm-preview');
    if(preview) preview.innerHTML = '<img src="'+e.target.result+'" style="width:100%;max-height:150px;object-fit:cover;border-radius:var(--radius-md)"><p style="margin:4px 0 0;font-size:11px;color:var(--text3)">'+file.name+'</p>';
  };
  reader.readAsDataURL(file);
}

function openRasmModal(url){
  const modal = document.createElement('div');
  modal.className = 'sklad-img-modal';
  modal.innerHTML = '<img src="'+url+'" alt="Rasm">';
  modal.onclick = () => document.body.removeChild(modal);
  document.body.appendChild(modal);
}
