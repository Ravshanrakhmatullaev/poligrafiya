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

function uvNarx(metr) {
  const tiers = [[0,.5,150000],[.5,5,250000],[5,10,230000],[10,20,200000],[20,50,180000],[50,Infinity,150000]];
  for (const [min, max, n] of tiers) if (metr >= min && metr < max) return n;
  return 150000;
}

function calcUv(sig, don) {
  if (!sig || !don) return { metr:0, narx:0, jami:0, birNarx:0 };
  const metr    = Math.ceil(don / Math.floor(29 / sig));
  const narx    = uvNarx(metr);
  const jami    = metr * narx;
  const birNarx = don > 0 ? Math.round(jami / don) : 0;
  return { metr, narx, jami, birNarx };
}

function ekoNarx(kv) {
  const tiers = [[0,1,100000],[1,5,50000],[5,10,40000],[10,20,35000],[20,30,30000],[30,50,28000],[50,100,27000],[100,Infinity,25000]];
  for (const [min, max, n] of tiers) if (kv >= min && kv < max) return n;
  return 25000;
}

function calcEko(kv) {
  if (!kv) return { narx:0, jami:0 };
  const narx = ekoNarx(kv);
  return { narx, jami: Math.round(kv * narx) };
}

function gUN(key, miq) {
  if (!PR || !PR[key]) return 0;
  const tiers = PR[key].tiers || [];
  for (const [min, max, narx] of tiers) if (miq >= min && miq <= max) return narx;
  return PR[key].default || 0;
}

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
const PR = {};
