// ═══════════════════════════════════════
// panels/uvdtf.js — UV DTF Sherik paneli
// Depends on: config.js, utils.js, db.js
// ═══════════════════════════════════════

// TODO: sb.from() calls bu faylda db.js service funksiyalariga ko'chirilishi kerak
// AppStore subscription: uvdtf paneli tarixni yangilaydi
AppStore.on('historyChanged', () => {
  const panel = document.getElementById('panel-uvdtf');
  if (panel && panel.classList.contains('active')) {
    loadUvdtfHisobot();
  }
});


// ── UV DTF SHERIK TIZIMI ──

function calcUvdtfSof(){
  const sotuvNarx  = parseInt(document.getElementById('uvdtf-sotuv-narx').value)||0;
  const metr       = parseInt(document.getElementById('uvdtf-metr').value)||0;
  const adminFoiz  = parseFloat(document.getElementById('uvdtf-admin-foiz').value)||0;
  const arenda     = parseInt(document.getElementById('uvdtf-arenda').value)||0;
  const elektr     = parseInt(document.getElementById('uvdtf-elektr').value)||0;
  const reklama    = parseInt(document.getElementById('uvdtf-reklama').value)||0;
  const adminH     = parseInt(document.getElementById('uvdtf-admin-harajat').value)||0;
  const material   = parseInt(document.getElementById('uvdtf-material').value)||0;
  const pechatnik  = parseInt(document.getElementById('uvdtf-pechatnik').value)||0;

  // Tushum
  const tushum = sotuvNarx * metr;

  // Admin ulushi (sotuvdan foiz)
  const adminUlush = Math.round(tushum * adminFoiz / 100);
  const sherikQolgan = tushum - adminUlush;

  // Harajatlar
  const oylikH = arenda + elektr + reklama + adminH;
  const metrH  = (material + pechatnik) * metr;
  const jH     = oylikH + metrH;

  // Sof daromad
  const sof = sherikQolgan - jH;

  const setEl = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };

  setEl('uvdtf-tushum-calc',   fmt(tushum)+" so'm");
  setEl('uvdtf-admin-sum',     fmt(adminUlush)+" so'm");
  setEl('uvdtf-sherik-qolgan', fmt(sherikQolgan)+" so'm");
  setEl('uvdtf-oylik-sum',     fmt(oylikH)+" so'm");
  setEl('uvdtf-metr-sum',      fmt(metrH)+" so'm");
  setEl('uvdtf-harajat-jami',  fmt(jH)+" so'm");

  // Summary
  setEl('uvdtf-res-tushum',  tushum > 0 ? fmt(tushum)+" so'm" : '—');
  setEl('uvdtf-res-admin',   adminUlush > 0 ? fmt(adminUlush)+" so'm" : '—');
  setEl('uvdtf-res-harajat', jH > 0 ? fmt(jH)+" so'm" : '—');
  setEl('uvdtf-res-sof',     tushum > 0 ? fmt(sof)+" so'm" : '—');

  // KPI kartalar
  setEl('uvdtf-jami-tushum',   fmt(tushum)+" so'm");
  setEl('uvdtf-jami-harajat',  fmt(jH)+" so'm");
  setEl('uvdtf-sof-daromad',   fmt(sof)+" so'm");

  // Color coding
  const sofEl = document.getElementById('uvdtf-res-sof');
  if(sofEl) sofEl.style.color = sof >= 0 ? '#22C55E' : '#EF4444';
}

async function saveUvdtfHisobot(){
  const sana = new Date().toISOString().slice(0,7); // YYYY-MM
  const metr = parseInt(document.getElementById('uvdtf-metr').value)||0;
  if(!metr){ showNotify('Avval metr kiriting'); return; }

  const data = {
    sotuv_narx:    parseInt(document.getElementById('uvdtf-sotuv-narx').value)||0,
    metr,
    admin_foiz:    parseFloat(document.getElementById('uvdtf-admin-foiz').value)||0,
    arenda:        parseInt(document.getElementById('uvdtf-arenda').value)||0,
    elektr:        parseInt(document.getElementById('uvdtf-elektr').value)||0,
    reklama:       parseInt(document.getElementById('uvdtf-reklama').value)||0,
    admin_harajat: parseInt(document.getElementById('uvdtf-admin-harajat').value)||0,
    material:      parseInt(document.getElementById('uvdtf-material').value)||0,
    pechatnik:     parseInt(document.getElementById('uvdtf-pechatnik').value)||0,
  };

  // Hisoblash
  const tushum     = data.sotuv_narx * data.metr;
  const adminUlush = Math.round(tushum * data.admin_foiz / 100);
  const jH         = (data.arenda + data.elektr + data.reklama + data.admin_harajat) +
                     (data.material + data.pechatnik) * data.metr;
  const sof        = (tushum - adminUlush) - jH;

  const row = {
    user_id:      currentUser.id,
    user_email:   currentUser.email,
    sana,
    data,
    tushum,
    admin_ulush:  adminUlush,
    jami_harajat: jH,
    sof_daromad:  sof,
    created_at:   new Date().toISOString(),
  };

  const error = (await upsertUvdtfHisobot(row)) ? null : new Error('upsert failed');
  if(error){ showNotify('Xatolik: '+error.message); return; }
  showNotify('✅ Saqlandi!');
  await loadUvdtfHisobot();
}

async function loadUvdtfHisobot(){
  if (!currentUser) return;
  const list = document.getElementById('uvdtf-tarix-list');
  
  let data, error;
  try {
    const res = await getUvdtfHisobot(currentUser.email).then(d => ({data:d,error:null})).catch(e=>({data:null,error:e}));
    data = res.data;
    error = res.error;
  } catch(e) {
    error = e;
  }

  if(error || !data || !data.length){
    if(list) list.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Hali yozuvlar yo\'q</p></div>';
    return;
  }

  if(list) list.innerHTML = data.map(r => {
    const sof = r.sof_daromad || 0;
    return '<div class="rp-card" style="margin-bottom:10px">'+
      '<div class="rp-card-top">'+
        '<div style="font-size:14px;font-weight:700;color:var(--text)">'+r.sana+'</div>'+
        '<div style="font-size:12px;color:var(--text3)">'+fmt(r.data?.metr||0)+' metr</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 16px">'+
        '<div style="text-align:center"><div style="font-size:10px;color:var(--text3)">Tushum</div><div style="font-weight:700;color:#F59E0B">'+fmt(r.tushum)+" so'm"+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:10px;color:var(--text3)">Admin</div><div style="font-weight:700;color:#6366F1">'+fmt(r.admin_ulush)+" so'm"+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:10px;color:var(--text3)">Harajat</div><div style="font-weight:700;color:#EF4444">'+fmt(r.jami_harajat)+" so'm"+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:10px;color:var(--text3)">Sof</div><div style="font-size:16px;font-weight:700;color:'+(sof>=0?'#22C55E':'#EF4444')+'">'+fmt(sof)+" so'm"+'</div></div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function copyKalkResult(){
  if(!kalkLastResult){ showNotify('Avval hisoblang'); return; }
  navigator.clipboard.writeText(kalkLastResult)
    .then(()=>showNotify('Nusxa olindi!'))
    .catch(()=>showNotify('Xato'));
}
