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
// Kanonik funksiya — dizayner komissiya bosqichini SUMMA bo'yicha aniqlaydi.
// FOIZ jadvali (config.js) yagona haqiqat manbai: bu yerda yoki boshqa
// hech qayerda foizlar qayta hisoblanmaydi/ikkilanmaydi (masalan hech qachon
// /100 qo'shimcha bo'linish yo'q — decimal to'g'ridan-to'g'ri FOIZ dan olinadi).
function getDesignerRate(summa) {
  const amount = Number(summa) || 0;
  for (let i = 0; i < FOIZ.length; i++) {
    const [min, max, decimal] = FOIZ[i];
    if (amount >= min && amount <= max) {
      return { percent: Math.round(decimal * 1000) / 10, decimal, label: FL[i] ?? '' };
    }
  }
  // FOIZ jadvali 0 dan Infinity gacha to'liq qamrab oladi — bu yerga
  // yetib kelish mumkin emas, faqat manfiy/NaN summalar uchun xavfsizlik to'ri.
  const last = FOIZ[FOIZ.length - 1];
  return { percent: Math.round(last[2] * 1000) / 10, decimal: last[2], label: FL[FL.length - 1] ?? '' };
}

function getFoiz(summa) {
  return getDesignerRate(summa).decimal;
}

// ── Zakaz daromadi/summasi (YAGONA MANBA) ──
// Bitta zakaz yozuvidan xodim daromadini (va zakaz summasini) qaytaradi.
// Butun ilova shu funksiyalarni ishlatishi kerak — dashboard, owner report,
// hisob berish — shunda panellar bir-biridan farq qilib qolmaydi.
// Qoida: admin turi total_daromad da; qolgan barcha turlar (ishlab, dizayner
// va kelajakdagilar) total_jami da saqlanadi.
function orderEarning(h) {
  if (!h) return 0;
  return h.type === 'admin' ? (h.total_daromad || 0) : (h.total_jami || 0);
}
function orderZakaz(h) {
  if (!h) return 0;
  return h.type === 'admin' ? (h.total_zakaz || 0) : (h.total_jami || 0);
}

// ── bonus_50 ("+50%" / "Jarayoni bilan") ruxsati — YAGONA MANBA ──
// Email bo'yicha barqaror identifikatsiya (config.js BONUS50_EMAILS). Butun
// ilova (dizayner paneli, hisobot, saqlash) shu predikatni ishlatishi kerak —
// shunda ruxsat qoidasi bir joyda va xodimlar orasida farq qilmaydi.
function canUseBonus50(email) {
  return !!email && Array.isArray(BONUS50_EMAILS) && BONUS50_EMAILS.indexOf(email) !== -1;
}

// ── KPI daraja/bonus (YAGONA MANBA) ──
// getKpi(email) -> {daraja, maqsad, fiks} (KPI_DARAJALAR, config.js) yoki null.
// getCurrentBonus/getNextBonus oylik sotuv (summa) bo'yicha bonus bosqichini
// aniqlaydi. Dashboard va istalgan hisobot shu funksiyalarni chaqiradi —
// hisob-kitob farq qilib qolmaydi.
function getKpi(email) { return (typeof KPI_DARAJALAR !== 'undefined' && KPI_DARAJALAR[email]) || null; }

function getCurrentBonus(email, summa) {
  const kpi = getKpi(email);
  if (!kpi) return null;
  const jadval = KPI_BONUS[kpi.daraja] || [];
  for (let i = jadval.length - 1; i >= 0; i--) { if (summa >= jadval[i].min) return jadval[i]; }
  return jadval[0] || null;
}

function getNextBonus(email, summa) {
  const kpi = getKpi(email);
  if (!kpi) return null;
  const jadval = KPI_BONUS[kpi.daraja] || [];
  for (let i = 0; i < jadval.length; i++) { if (summa < jadval[i].min) return jadval[i]; }
  return null;
}

// ── XODIM HISOB BALANSI (YAGONA MANBA) ──
// Xodim dashboardi ("QOLGAN DAROMAD") va owner hisoboti AYNAN shu funksiyani
// ishlatadi — shunda farq qilmaydi.
//   baseEarnings = ishlab topilgan (orderEarning yig'indisi)
//   paidOut      = hisob_kitob dan berilgan pul (summa yig'indisi)
//   remaining    = baseEarnings - paidOut
// state: 'remaining' (qarz bor) | 'closed' (0 va faoliyat bor) |
//        'none' (umuman faoliyat yo'q) | 'over' (ortiqcha to'langan)
function calculateEmployeeBalance(baseEarnings, paidOut) {
  const base = Number(baseEarnings) || 0;
  const paid = Number(paidOut) || 0;
  const remaining = base - paid;
  const hasActivity = base > 0 || paid > 0;
  let state;
  if (remaining > 0) state = 'remaining';
  else if (remaining < 0) state = 'over';
  else state = hasActivity ? 'closed' : 'none';
  return { baseEarnings: base, paidOut: paid, remaining, hasActivity, state,
           overpaid: remaining < 0 ? -remaining : 0 };
}

// Balansni matn+rang ko'rinishida qaytaradi (dashboard va owner panel birga ishlatadi).
function employeeBalanceView(bal) {
  const color = { remaining: 'var(--red)', over: '#6366F1', closed: 'var(--green)', none: 'var(--text3)' };
  let text;
  if (bal.state === 'remaining') text = fmt(bal.remaining) + " so'm";
  else if (bal.state === 'over') text = "Ortiqcha to'lov: " + fmt(bal.overpaid) + " so'm";
  else if (bal.state === 'closed') text = '✅ Hisob yopiq';
  else text = '—';
  return { text, color: color[bal.state] };
}

// ── OY CHEGARALARI — Asia/Tashkent (YAGONA MANBA) ──────────────────────────
// O'zbekiston UTC+5, yil bo'yi DST yo'q. Sana ob'ektidan Tashkent bo'yicha
// yil/oyni aniqlab, [start, end) UTC ms diapazonini qaytaradi (end = keyingi oy
// boshlanishi). Barcha panel shu funksiyani ishlatishi kerak — oy mantig'i
// takrorlanmaydi. Argumentsiz "hozir" (test uchun har doim aniq sana bering).
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
function getTashkentMonthRange(date) {
  const d = date != null ? new Date(date) : new Date();
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS); // Tashkent "mahalliy" vaqti UTC sifatida
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const start = Date.UTC(y, m, 1)     - TASHKENT_OFFSET_MS; // Tashkent oy boshlanishi -> UTC ms
  const end   = Date.UTC(y, m + 1, 1) - TASHKENT_OFFSET_MS; // keyingi oy boshlanishi (Dek->Yan avtomatik)
  return { start, end, year: y, month: m };
}
function prevTashkentMonthRange(date) {
  const cur = getTashkentMonthRange(date);
  return getTashkentMonthRange(cur.start - 1); // joriy oy boshlanishidan 1ms oldin = o'tgan oy
}
// Kanonik biznes sanasi = created_at (timestamptz). `sana` (matn) ishonchsiz.
function orderBusinessTime(order) {
  return order && order.created_at ? new Date(order.created_at).getTime() : NaN;
}
function isOrderInMonth(order, range) {
  const t = orderBusinessTime(order);
  return Number.isFinite(t) && t >= range.start && t < range.end;
}

// Bir oydagi xodim ko'rsatkichlari (summa / sof daromad / soni). Faqat shu oy
// buyurtmalari. Hech narsa chiqarib tashlanmaydi (is_brak ustuni mavjud emas).
function calculateMonthlyEmployeeStats(orders, range) {
  let total = 0, earnings = 0, count = 0;
  (orders || []).forEach(o => {
    if (!isOrderInMonth(o, range)) return;
    total    += orderZakaz(o);
    earnings += orderEarning(o);
    count++;
  });
  return { total, earnings, count };
}

// To'lanadigan qoldiq va oldingi davrdan qoldiq (jadval o'zgarishisiz — mavjud
// allHistory + hisob_kitob dan). payable = butun davr ishlab topilgan − berilgan.
// carryover = payable − shu oy daromadi (oldingi davrlardan qolgan qarz).
function calculateEmployeeCarryover(baseEarningsAllTime, paidOutAllTime, currentMonthEarnings) {
  const payable = (Number(baseEarningsAllTime) || 0) - (Number(paidOutAllTime) || 0);
  const cur = Number(currentMonthEarnings) || 0;
  const carryover = Math.max(0, payable - cur); // salbiy = ortiqcha to'langan -> 0
  return { payable, currentMonthEarnings: cur, carryover, totalDue: Math.max(0, payable),
           overpaid: payable < 0 ? -payable : 0 };
}

// Oy taqqoslash (motivatsiya). O'tgan oy 0 bo'lsa foiz null (Infinity% ko'rsatilmaydi).
function monthComparison(cur, prev) {
  const growth = (a, b) => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);
  return {
    countDiff:      cur.count    - prev.count,
    countGrowth:    growth(cur.count,    prev.count),
    totalDiff:      cur.total    - prev.total,
    totalGrowth:    growth(cur.total,    prev.total),
    earningsDiff:   cur.earnings - prev.earnings,
    earningsGrowth: growth(cur.earnings, prev.earnings),
    reachRemaining: Math.max(0, prev.count - cur.count), // o'tgan oyga yetish uchun yana N ta
    exceeded:       cur.count > prev.count,
    prevEmpty:      prev.count === 0 && prev.total === 0 && prev.earnings === 0,
  };
}

// ── Taklif qiymatini maydonga qo'yish (YAGONA MEXANIZM) ──
// "Avtomatik" hint va katalog takliflari shu funksiya orqali maydonni to'ldiradi:
// qiymatni o'rnatadi va input/change hodisalarini bir marta yuboradi (bog'liq
// hisob-kitob shular orqali ishga tushadi). Qayta-qayta bosish qiymatni
// ko'paytirmaydi (to'g'ridan-to'g'ri set, += emas).
function applySuggestedValue(inputId, value) {
  const el = document.getElementById(inputId);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// ── KATALOG KALKULYATORI (sof funksiyalar — DOM ga bog'liq emas, test qilinadi) ──
// Ishlab chiqarish qoidasi: 1 varoq = 2 bet; katalog varog'i 4 varoqqa (ya'ni
// bet 8 betga) yuqoriga yaxlitlanadi. forma = varoq soni (1 forma / varoq).
function calculateCatalogLayout(pagesEntered) {
  const p = Math.max(0, Math.floor(Number(pagesEntered) || 0));
  const pagesProd = Math.ceil(p / 8) * 8;   // 8 betga yaxlitlash
  const leaves = pagesProd / 2;             // 1 varoq = 2 bet -> 4 ga karrali
  const forms = leaves;                     // 1 forma / varoq (layout qoidasi)
  return { pagesEntered: p, pagesProd, leaves, forms, rounded: pagesProd !== p };
}

// Qog'oz miqdori. piecesPerSheet = bitta katta varaqdan chiqadigan katalog
// varog'i soni (autoSigim, kalk.js). makeready (preladka) = forma boshiga list.
function calculateCatalogPaper(leaves, piecesPerSheet, forms, makereadyPerForm, copies) {
  const pieces = Math.max(1, Number(piecesPerSheet) || 1);
  const cps = Number(copies) || 0;
  const lv = Number(leaves) || 0;
  const cleanPerCatalog = lv / pieces;                 // 1 katalog uchun list
  const cleanSheets = Math.ceil(cleanPerCatalog * cps);
  const makeready = (Number(makereadyPerForm) || 0) * (Number(forms) || 0);
  const totalSheets = cleanSheets + makeready;
  return { cleanPerCatalog, cleanSheets, makeready, totalSheets };
}

// Qog'oz narxi A1 (to'liq bosma varaq) uchun beriladi; ishchi list (masalan
// 44×31) A1 dan kesiladi. piecesPerA1 = bitta A1 ga sig'adigan ishchi list soni
// (ISH_FORMAT[fmt].bolinish — oddiy rejim ham shuni ishlatadi, 44×31 -> 4).
// a1Quantity = ceil(ishchiList / piecesPerA1). Narx = a1Quantity × A1narx.
function catalogA1Sheets(workingSheets, piecesPerA1) {
  const per = Math.max(1, Number(piecesPerA1) || 1);
  const ws = Math.max(0, Number(workingSheets) || 0);
  return Math.ceil(ws / per);
}

// Xarajatlar. pechatPerForm = calcPechatNarx(copies, tur) (mavjud manba, oborot
// va nusxa bosqichini o'zi hisobga oladi). formaNarx — forma narxi; paperUnit —
// 1 A1 varaq narxi; a1Sheets — A1 ekvivalenti (catalogA1Sheets). lamRate/bindRate
// — 1 katalog uchun narx.
function calculateCatalogServices(o) {
  o = o || {};
  const forms = Number(o.forms) || 0;
  const copies = Number(o.copies) || 0;
  const formCost  = forms * (Number(o.formaNarx) || 0);
  const printCost = forms * (Number(o.pechatPerForm) || 0);
  const paperCost = (Number(o.a1Sheets) || 0) * (Number(o.paperUnit) || 0); // A1 ekvivalenti × A1 narx
  const lamCost   = o.lamination ? copies * (Number(o.lamRate)  || 0) : 0;
  const bindCost  = o.bind       ? copies * (Number(o.bindRate) || 0) : 0;
  const total = formCost + printCost + paperCost + lamCost + bindCost;
  return { formCost, printCost, paperCost, lamCost, bindCost, total,
           perCatalog: copies > 0 ? Math.round(total / copies) : 0 };
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
