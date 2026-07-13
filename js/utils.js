// ═══════════════════════════════════════
// utils.js — Yordamchi funksiyalar
// Depends on: config.js (FOIZ)
// ═══════════════════════════════════════

// ── Formatlash ──
const fmt = n => Math.round(n).toLocaleString('uz-UZ');

function getSanaVaqt() {
  const now    = new Date();
  const kunlar = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  return `${kunlar[now.getDay()]} ${now.toLocaleDateString('uz-UZ')} ${now.toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})}`;
}

// ── Notifications ──
function showNotify(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) { console.warn('[showNotify] toast-container topilmadi'); return; }
  if (!type) {
    if (msg.includes('✅') || msg.includes('Saqlandi') || msg.includes('olindi')) type = 'success';
    else if (msg.includes('❌') || msg.includes('Xato') || msg.includes('xatolik')) type = 'error';
    else if (msg.includes('⚠️')) type = 'warning';
    else type = 'info';
  }
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `<span style="flex:1">${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;padding:0 0 0 8px">×</button>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.parentNode && toast.remove(), 220);
  }, 3000);
}

function showConfirm(title, msg, onConfirm, onCancel) {
  document.querySelectorAll('.confirm-overlay').forEach(e => e.remove());
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<div class="confirm-box">
    <div class="confirm-title">${title}</div>
    <div class="confirm-msg">${msg}</div>
    <div class="confirm-actions">
      <button class="btn btn-secondary" id="conf-cancel">Bekor qilish</button>
      <button class="btn btn-danger" id="conf-ok">Tasdiqlash</button>
    </div></div>`;
  document.body.appendChild(overlay);
  document.getElementById('conf-ok').onclick    = () => { overlay.remove(); onConfirm && onConfirm(); };
  document.getElementById('conf-cancel').onclick = () => { overlay.remove(); onCancel  && onCancel();  };
  overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); onCancel && onCancel(); } };
}

// ── Hisoblash (bir joyda!) ──
function getFoiz(summa) {
  for (const [min, max, f] of FOIZ) {
    if (summa >= min && summa <= max) return f;
  }
  return 0.015;
}

// NOTE: quyidagi uvNarx/calcUv/ekoNarx/calcEko/gUN — app-history.js (commit b9bb5bb)
// dagi tasdiqlangan ishlaydigan formulalar bilan almashtirildi (Ishlab chiqarish
// panelidagi ko'rsatilgan narxlarga mos: UV list-asosli, Eko kv.m-asosli)
function uvNarx(n){ return n<=5?40000:n<=10?25000:20000; }

function calcUv(sig, don){
  if(!sig||!don||sig<=0||don<=0) return {ls:0, lsReal:0, lsFull:0, lsFrac:0, np:0, jami:0};

  const fullLists = Math.floor(don / sig); // to'liq listlar
  const remainder = don % sig;             // qolgan dona

  let frac = 0;
  if(remainder > 0){
    const pct = remainder / sig;
    if(pct <= 0.125)    frac = 0.2;
    else if(pct <= 0.5) frac = 0.5;
    else                frac = 1.0;
  }

  const lsReal = fullLists + frac;
  const totalListsForPrice = Math.ceil(lsReal); // narx bosqichi uchun
  const npPerList = uvNarx(totalListsForPrice);

  // Har bir qism alohida narx
  const jamiToliq = fullLists * npPerList;
  let jamiFrac = 0;
  if(frac === 0.2)      jamiFrac = 20000;
  else if(frac === 0.5) jamiFrac = 30000;
  else if(frac === 1.0) jamiFrac = npPerList;

  const jami = jamiToliq + jamiFrac;
  return {ls: lsReal, lsReal, lsFull: fullLists, lsFrac: frac, np: npPerList, jami};
}

function ekoNarx(kv){ if(kv<=10)return 5000; if(kv<=50)return 4000; if(kv<=100)return 3700; return 3500; }
function calcEko(kv){ if(!kv||kv<=0)return{narx:0,jami:0}; const narx=ekoNarx(kv); return{narx,jami:Math.round(kv*narx)}; }

function gUN(key,m){ const p=PR[key]; if(!p||m<=0)return 0; if(p.fixed) return p.fixed; for(const[lo,hi,n]of p.t)if(m>=lo&&m<=hi)return n; return p.t[p.t.length-1][2]; }

// ── Clipboard ──
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotify('✅ Nusxa olindi!');
  } catch {
    showNotify('Nusxa olishda xato');
  }
}

// ── Session ──
function saveSession(key, val) { try { sessionStorage.setItem(key, val); } catch {} }
function getSession(key, def = null) { try { return sessionStorage.getItem(key) ?? def; } catch { return def; } }

// ── Safe panel init ──
async function safeInitPanel(panelName, initFn) {
  if (typeof initFn !== 'function') {
    console.error(`[safeInitPanel] ${panelName}: initFn funksiya emas`, initFn);
    return;
  }
  try {
    const result = initFn();
    // async va sync funksiyalarni ikkalasini ham handle qilish
    if (result && typeof result.catch === 'function') {
      await result;
    }
  } catch (err) {
    console.error(`[${panelName}]`, err);
    // Foydalanuvchiga tushunarli xabar
    const panelEl = document.querySelector('.panel.active');
    if (panelEl && !panelEl.children.length) {
      // Panel bo'sh qolgan bo'lsa minimal xabar ko'rsat
      panelEl.innerHTML = `<div class="empty-state" style="padding:40px">
        <p>${panelName} yuklanmadi. Sahifani yangilang.</p></div>`;
    }
    showNotify(`${panelName} yuklashda xato: ${err.message || err}`, 'error');
  }
}

// ── Telegram (server orqali) ──
async function sendTgViaWebhook(text) {
  const MAX = 4000;
  const msg = text.length > MAX ? text.slice(0, MAX) + '\n...(qisqartirildi)' : text;
  try {
    const res = await fetch(TG_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg }),
    });
    if (res.ok) { showNotify('✅ Telegram ga yuborildi!'); return true; }
    throw new Error('HTTP ' + res.status);
  } catch (e) {
    console.warn('[Telegram] Webhook xato, share link ishlatiladi:', e.message);
    window.open('https://t.me/share/url?url=%20&text=' + encodeURIComponent(msg), '_blank');
    return false;
  }
}

// ── PR (mahsulot narxlar) — global ──
// app-history.js (commit b9bb5bb) dagi tasdiqlangan katalogdan so'zma-so'z ko'chirildi
const PR={
  'Futbolka DTF (old)':{u:'dona',cat:'termopress',t:[[1,100,2000],[101,500,2500],[501,Infinity,2000]]},
  'Futbolka DTF (old+orqa)':{u:'dona',cat:'termopress',t:[[1,100,3000],[101,500,2500],[501,Infinity,2000]]},
  'Finka (old)':{u:'dona',cat:'termopress',t:[[1,100,4000],[101,500,3000],[501,Infinity,2500]]},
  'Finka (old+orqa)':{u:'dona',cat:'termopress',t:[[1,100,5000],[101,500,4000],[501,Infinity,3500]]},
  'Futbolka Vinil (old)':{u:'dona',cat:'termopress',note:'Vinil kesish+tozalash bilan.',t:[[1,100,4000],[101,500,3000],[501,Infinity,2500]]},
  'Futbolka Vinil (old+orqa)':{u:'dona',cat:'termopress',t:[[1,100,8000],[101,500,6000],[501,Infinity,5000]]},
  'Lenta press':{u:'metr',cat:'termopress',t:[[1,10,1500],[11,50,1200],[51,100,1000],[101,200,900],[201,500,800],[501,Infinity,700]]},
  'Kepka DTF':{u:'dona',cat:'termopress',t:[[1,10,2000],[11,20,1500],[21,100,1000],[101,500,900],[501,Infinity,800]]},
  'Lenta aparat pechat (Godex)':{u:'metr',cat:'boshqa',t:[[0,50,1000],[51,200,800],[201,500,500],[501,1000,400]]},

  'Konturniy (pechat+kesish)':{u:'metr',cat:'ekosalvent',t:[[1,10,20000],[11,20,15000],[21,40,12000],[41,100,10000]]},

  'Rangli printer (old+orqa, 1-500ta)':{u:'dona',cat:'printer',t:[[1,500,500],[501,Infinity,400]]},
  'Rangli printer (old, 1-500ta)':{u:'dona',cat:'printer',t:[[1,500,300],[501,Infinity,250]]},
  'Bloknot ichi (80gr qog\'oz)':{u:'dona',cat:'printer',t:[[1,Infinity,100]]},

  'Roll-up ustanovka':{u:'dona',cat:'boshqa',t:[[1,10,20000],[11,30,15000],[31,Infinity,12000]]},
  'UF Ruchka':{u:'dona',cat:'boshqa',t:[[1,50,500],[51,500,400],[501,1000,350],[1001,Infinity,300]]},
  'Pauk rezka':{u:'dona',cat:'boshqa',t:[[1,5,15000],[6,10,12000],[11,20,10000],[21,50,9000],[51,Infinity,8000]]},
  'Znachok yasash':{u:'dona',cat:'boshqa',t:[[1,10,2000],[11,30,1500],[31,50,1000],[51,100,800]]},
  'Beyjik yasash/tikish':{u:'dona',cat:'boshqa',note:'2 tomonli bo\'lsa +200 so\'m/dona',extra:1,t:[[1,50,1000],[51,100,800],[101,500,700],[501,Infinity,600]]},
  'Krujka sublimatsiya':{u:'dona',cat:'printer',t:[[1,10,3000],[11,30,2500],[31,100,2000],[101,Infinity,1500]]},
  'Sifra pechat':{u:'dona',cat:'printer',t:[[1,10,1500],[11,50,1000],[51,Infinity,800]]},
  'Bloknot zborka':{u:'dona',cat:'printer',fixed:2000,t:[[1,Infinity,2000]]},
};

const CATEGORIES = {
  'termopress': {label: '🔥 Termopress', color: 'var(--red)'},
  'ekosalvent': {label: '🖨️ Ekosalvent', color: 'var(--amber)'},
  'printer': {label: '🖨️ Printer', color: 'var(--blue)'},
  'boshqa': {label: '📦 Boshqa', color: 'var(--purple)'},
  'qolda': {label: '✏️ Qo\'lda kiritish', color: 'var(--gray)'},
};
