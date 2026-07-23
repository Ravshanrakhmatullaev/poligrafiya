// ═══════════════════════════════════════
// davomat.js — Xodim QR skaner (Davomat moduli, 1-qism: skanerlash)
// Depends on: db.js (scanAttendance, resolveAttendance)
// Owner/attendance_manager paneli keyingi sprintda qo'shiladi
// ═══════════════════════════════════════

const DV_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let dvStream = null;
let dvDetector = null;
let dvRafId = null;
let dvCanvas = null;
let dvCtx = null;
let dvScanning = false;    // true = kadr tsikli faol
let dvBusy = false;        // true = RPC javobini kutyapmiz yoki modal/kartochka ochiq — yangi skan qabul qilinmaydi
let dvPendingToken = null; // "noaniq holat" davomida saqlanadigan token (attendance_resolve uchun)
let dvPreviewToken = null;       // attendance_preview orqali ko'rilgan, hali tasdiqlanmagan token
let dvPreviewBranchName = null;  // preview javobidan olingan filial nomi — tasdiqlangan natijada qayta ishlatiladi
let dvBranchCache = null;  // {id: {id,name,code}} — Ro'yxat tabidagi filial filtri uchun (faqat staff)
let dvLastScannedToken = null;
let dvLastScannedAt = 0;
const DV_DUPLICATE_WINDOW_MS = 3000; // bir xil QR shu vaqt ichida qayta o'qilsa e'tiborga olinmaydi
let dvAudioCtx = null;
const DV_ACTION_LABELS = { check_in: 'Kelish (Check-in)', check_out: 'Ketish (Check-out)' };
const DV_PREVIEW_TITLES = {
  check_in: 'Kelish (Check-in) sifatida qayd etiladi',
  check_out: 'Ketish (Check-out) sifatida qayd etiladi',
  ambiguous: "Bugungi birinchi skaningiz — tasdiqlashda tanlov so'raladi",
  already_completed: 'Bugungi davomat allaqachon yakunlangan',
};
const DV_PREVIEW_ACTION_LABELS = {
  check_in: 'Kelish (Check-in)',
  check_out: 'Ketish (Check-out)',
  ambiguous: "Aniqlanmagan",
  already_completed: '—',
};

async function initDavomatScanner() {
  dvBusy = false;
  dvPendingToken = null;
  dvPreviewToken = null;
  dvPreviewBranchName = null;
  dvLastScannedToken = null;
  dvLastScannedAt = 0;
  hideDavomatModals();
  dvShowTab('scan');

  // Manager/owner uchun "Ro'yxat" tabini ko'rsatish
  const listBtn = document.getElementById('dv-tab-list-btn');
  if (listBtn) {
    const isStaff = await checkIsAttendanceStaff();
    listBtn.classList.toggle('hidden', !isStaff);
  }
}

// ── SKAN OYNASI HOLATLARI: bo'sh (tugma) / kamera / tasdiqlash kartochkasi ──
function dvShowScanIdle() {
  stopDavomatScanner();
  dvBusy = false;
  document.getElementById('dv-scan-idle')?.classList.remove('hidden');
  document.getElementById('dv-scan-camera')?.classList.add('hidden');
  document.getElementById('dv-confirm-card')?.classList.add('hidden');
}

async function dvOpenScannerClicked() {
  // Foydalanuvchi gesti — audio kontekstini shu yerda ochamiz (autoplay siyosati uchun)
  const ctx = dvGetAudioCtx();
  if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* jim */ } }

  document.getElementById('dv-scan-idle')?.classList.add('hidden');
  document.getElementById('dv-confirm-card')?.classList.add('hidden');
  document.getElementById('dv-scan-camera')?.classList.remove('hidden');
  await dvStartCamera();
}

async function dvStartCamera() {
  setDavomatStatus('Kamera ochilmoqda...', 'info');

  const video = document.getElementById('dv-video');
  if (!video) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setDavomatStatus("Bu brauzer kamerani qo'llab-quvvatlamaydi", 'error');
    return;
  }

  try {
    dvStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (e) {
    console.error('[davomat] kamera xatosi', e);
    setDavomatStatus('Kameraga ruxsat berilmadi yoki kamera topilmadi', 'error');
    return;
  }

  video.srcObject = dvStream;
  try { await video.play(); } catch (e) { /* autoplay bloklansa ham davom etamiz */ }

  dvDetector = null;
  if ('BarcodeDetector' in window) {
    try { dvDetector = new BarcodeDetector({ formats: ['qr_code'] }); }
    catch (e) { dvDetector = null; }
  }

  if (!dvDetector) {
    dvCanvas = document.getElementById('dv-canvas');
    dvCtx = dvCanvas ? dvCanvas.getContext('2d', { willReadFrequently: true }) : null;
    if (!dvCtx || typeof jsQR !== 'function') {
      setDavomatStatus('QR skaner ishga tushmadi (jsQR topilmadi)', 'error');
      return;
    }
  }

  setDavomatStatus("QR kodni kameraga ko'rsating", 'info');
  dvScanning = true;
  dvRafId = requestAnimationFrame(dvScanFrame);
}

function stopDavomatScanner() {
  dvScanning = false;
  if (dvRafId) { cancelAnimationFrame(dvRafId); dvRafId = null; }
  if (dvStream) { dvStream.getTracks().forEach(t => t.stop()); dvStream = null; }
  dvDetector = null;
  const video = document.getElementById('dv-video');
  if (video) video.srcObject = null;
}

async function dvScanFrame() {
  if (!dvScanning) return;

  if (!dvBusy) {
    const video = document.getElementById('dv-video');
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      let text = null;
      try {
        if (dvDetector) {
          const codes = await dvDetector.detect(video);
          if (codes && codes.length) text = codes[0].rawValue;
        } else if (dvCtx && typeof jsQR === 'function') {
          dvCanvas.width = video.videoWidth;
          dvCanvas.height = video.videoHeight;
          dvCtx.drawImage(video, 0, 0, dvCanvas.width, dvCanvas.height);
          const imageData = dvCtx.getImageData(0, 0, dvCanvas.width, dvCanvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result) text = result.data;
        }
      } catch (e) {
        // Kadr darajasidagi dekodlash xatosi — jim o'tkazamiz, keyingi kadrda qayta urinamiz
      }

      if (text) {
        const token = text.trim();
        const now = Date.now();
        const isDuplicate = dvLastScannedToken === token && (now - dvLastScannedAt) < DV_DUPLICATE_WINDOW_MS;
        if (!isDuplicate) {
          dvLastScannedToken = token;
          dvLastScannedAt = now;
          await handleScannedText(token);
        }
      }
    }
  }

  if (dvScanning) dvRafId = requestAnimationFrame(dvScanFrame);
}

async function handleScannedText(text) {
  if (!DV_UUID_RE.test(text)) {
    setDavomatStatus("Noma'lum QR kod — filial QR kodini skanerlang", 'error');
    return;
  }

  // QR topildi: kamera va skan tsikli darhol to'xtaydi, bitta oqimda faqat bir marta yuboriladi.
  // Bu bosqichda faqat READ-ONLY attendance_preview chaqiriladi — bazaga hech narsa yozilmaydi.
  stopDavomatScanner();
  dvPlayBeep('found');
  dvBusy = true;
  dvShowConfirmLoading();

  try {
    const res = await previewAttendance(text);
    renderPreview(res, text);
  } catch (e) {
    console.error('[davomat] preview xatosi', e);
    dvPlayBeep('error');
    renderScanError('Xatolik: ' + (e.message || "noma'lum xato"));
    dvBusy = false;
  }
}

function renderPreview(res, token) {
  if (!res || !res.ok) {
    dvPlayBeep('error');
    renderScanError((res && res.message) || "Javob olinmadi, qayta urinib ko'ring");
    dvBusy = false;
    return;
  }

  dvPreviewToken = token;
  dvPreviewBranchName = res.branch_name || '—';

  const icon = document.getElementById('dv-confirm-icon'); if (icon) icon.textContent = '🔍';
  const title = document.getElementById('dv-confirm-title');
  if (title) title.textContent = DV_PREVIEW_TITLES[res.action] || 'Tasdiqlaysizmi?';
  const branchEl = document.getElementById('dv-confirm-branch'); if (branchEl) branchEl.textContent = dvPreviewBranchName;
  const actionEl = document.getElementById('dv-confirm-action');
  if (actionEl) actionEl.textContent = DV_PREVIEW_ACTION_LABELS[res.action] || res.action || '—';
  const detailEl = document.getElementById('dv-confirm-detail'); if (detailEl) detailEl.textContent = '';

  const isActionable = res.action === 'check_in' || res.action === 'check_out' || res.action === 'ambiguous';
  dvSetConfirmButtonsDisabled(false);
  dvSetOkButtonVisible(isActionable);
  dvSetCancelButtonLabel(isActionable ? '❌ Bekor qilish' : 'Yopish');
}

function dvShowConfirmLoading() {
  document.getElementById('dv-scan-idle')?.classList.add('hidden');
  document.getElementById('dv-scan-camera')?.classList.add('hidden');
  document.getElementById('dv-confirm-card')?.classList.remove('hidden');
  dvSetCardLoading('Tekshirilmoqda...');
  const branchEl = document.getElementById('dv-confirm-branch'); if (branchEl) branchEl.textContent = '—';
  const actionEl = document.getElementById('dv-confirm-action'); if (actionEl) actionEl.textContent = '—';
  const detailEl = document.getElementById('dv-confirm-detail'); if (detailEl) detailEl.textContent = '';
  dvSetOkButtonVisible(false);
}

function dvSetCardLoading(title) {
  const icon = document.getElementById('dv-confirm-icon'); if (icon) icon.textContent = '⏳';
  const titleEl = document.getElementById('dv-confirm-title'); if (titleEl) titleEl.textContent = title;
  dvSetConfirmButtonsDisabled(true);
}

function dvSetConfirmButtonsDisabled(disabled) {
  ['dv-confirm-ok-btn', 'dv-confirm-rescan-btn', 'dv-confirm-cancel-btn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

function dvSetOkButtonVisible(visible) {
  document.getElementById('dv-confirm-ok-btn')?.classList.toggle('hidden', !visible);
}

function dvSetCancelButtonLabel(text) {
  const btn = document.getElementById('dv-confirm-cancel-btn');
  if (btn) btn.textContent = text;
}

// Faqat shu funksiya attendance_scan'ni chaqiradi — "Tasdiqlash" bosilgandagina, bir marta
async function dvConfirmApprove() {
  if (!dvPreviewToken) { dvConfirmCancel(); return; }
  const token = dvPreviewToken;
  dvSetCardLoading('Yuborilmoqda...');

  try {
    const res = await scanAttendance(token);
    dvPreviewToken = null;
    await renderDavomatResult(res, token);
  } catch (e) {
    console.error('[davomat] scan xatosi', e);
    dvPlayBeep('error');
    renderScanError('Xatolik: ' + (e.message || "noma'lum xato"));
    dvBusy = false;
  }
}

async function renderDavomatResult(res, token) {
  dvSetConfirmButtonsDisabled(false);

  if (!res) {
    dvPlayBeep('error');
    renderScanError("Javob olinmadi, qayta urinib ko'ring");
    dvBusy = false;
    return;
  }

  if (res.action === 'ambiguous_choice_required') {
    dvPendingToken = token;
    document.getElementById('dv-confirm-card')?.classList.add('hidden');
    showAmbiguousModal();
    return; // dvBusy=true qoladi — modal yopilguncha qayta skan qilinmaydi
  }

  if (!res.ok) {
    dvPlayBeep('error');
    renderScanError(res.message || 'Xatolik yuz berdi');
    dvBusy = false;
    return;
  }

  dvPlayBeep('success');

  const icon = document.getElementById('dv-confirm-icon'); if (icon) icon.textContent = '✅';
  const title = document.getElementById('dv-confirm-title'); if (title) title.textContent = 'Bajarildi';
  dvSetOkButtonVisible(false);

  const actionEl = document.getElementById('dv-confirm-action');
  if (actionEl) actionEl.textContent = DV_ACTION_LABELS[res.action] || res.action || '—';

  const branchEl = document.getElementById('dv-confirm-branch');
  if (branchEl) branchEl.textContent = dvPreviewBranchName || '—';

  const detailEl = document.getElementById('dv-confirm-detail');
  if (detailEl) {
    if (res.action === 'check_in') {
      detailEl.textContent = res.late_minutes > 0 ? `${res.late_minutes} daqiqa kech qoldingiz` : "O'z vaqtida keldingiz";
    } else if (res.action === 'check_out') {
      const soat = res.worked_minutes != null ? Math.round(res.worked_minutes / 60 * 10) / 10 : null;
      detailEl.textContent = soat != null ? `${soat} soat ishladingiz` : '';
    } else {
      detailEl.textContent = '';
    }
  }

  dvPreviewBranchName = null;
  dvBusy = false; // yozuv amalga oshdi, kartochka faqat ma'lumot ko'rsatmoqda
  dvSetCancelButtonLabel('✅ Yakunlash');
}

function renderScanError(message) {
  dvPreviewToken = null;
  dvPreviewBranchName = null;
  document.getElementById('dv-scan-camera')?.classList.add('hidden');
  document.getElementById('dv-confirm-card')?.classList.remove('hidden');

  const icon = document.getElementById('dv-confirm-icon'); if (icon) icon.textContent = '❌';
  const title = document.getElementById('dv-confirm-title'); if (title) title.textContent = message;
  const branchEl = document.getElementById('dv-confirm-branch'); if (branchEl) branchEl.textContent = '—';
  const actionEl = document.getElementById('dv-confirm-action'); if (actionEl) actionEl.textContent = '—';
  const detailEl = document.getElementById('dv-confirm-detail'); if (detailEl) detailEl.textContent = '';
  dvSetConfirmButtonsDisabled(false);
  dvSetOkButtonVisible(false);
  dvSetCancelButtonLabel('Yopish');
}

// "Bekor qilish" — attendance_scan hech qachon chaqirilmagan, bazaga hech narsa yozilmagan
function dvConfirmCancel() {
  dvPreviewToken = null;
  dvPreviewBranchName = null;
  dvShowScanIdle();
}

async function dvConfirmRescan() {
  dvBusy = false;
  dvPreviewToken = null;
  dvPreviewBranchName = null;
  document.getElementById('dv-confirm-card')?.classList.add('hidden');
  document.getElementById('dv-scan-idle')?.classList.add('hidden');
  document.getElementById('dv-scan-camera')?.classList.remove('hidden');
  await dvStartCamera();
}

function setDavomatStatus(text, type) {
  const el = document.getElementById('dv-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'dv-status-' + (type || 'info');
}

// ── AUDIO: Web Audio API orqali qisqa beep (tashqi fayl yo'q, vibratsiya yo'q) ──
function dvGetAudioCtx() {
  if (dvAudioCtx) return dvAudioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    dvAudioCtx = new Ctx();
    return dvAudioCtx;
  } catch (e) { return null; }
}

const DV_BEEP_FREQ = { found: 880, success: 1046, error: 220 };

function dvPlayBeep(kind) {
  try {
    const ctx = dvGetAudioCtx();
    if (!ctx || ctx.state === 'suspended') return; // audio ishlamasa ham tizim davom etadi
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = DV_BEEP_FREQ[kind] || 660;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const dur = kind === 'error' ? 0.28 : 0.12;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch (e) {
    // Audio ishlamasa ham tizim ishlashda davom etsin
  }
}

// ── NOANIQ HOLAT: "Ishga keldim" / "Ishdan ketyapman" ──
function showAmbiguousModal() {
  document.getElementById('dv-ambiguous-modal')?.classList.remove('hidden');
}

function hideDavomatModals() {
  document.getElementById('dv-ambiguous-modal')?.classList.add('hidden');
  document.getElementById('dv-sabab-modal')?.classList.add('hidden');
  const sababSelect = document.getElementById('dv-sabab-select');
  const sababMatn = document.getElementById('dv-sabab-matn');
  const sababErr = document.getElementById('dv-sabab-error');
  if (sababSelect) sababSelect.value = '';
  if (sababMatn) { sababMatn.value = ''; sababMatn.classList.add('hidden'); }
  if (sababErr) sababErr.classList.add('hidden');
}

async function dvChoiceKeldim() {
  const token = dvPendingToken;
  document.getElementById('dv-ambiguous-modal')?.classList.add('hidden');
  dvShowConfirmLoading();

  try {
    const res = await resolveAttendance(token, 'came_in');
    dvPendingToken = null;
    await renderDavomatResult(res, token);
  } catch (e) {
    console.error('[davomat] resolve xatosi', e);
    dvPlayBeep('error');
    renderScanError('Xatolik: ' + (e.message || "noma'lum xato"));
    dvBusy = false;
  }
}

function dvChoiceKetyapman() {
  document.getElementById('dv-ambiguous-modal')?.classList.add('hidden');
  document.getElementById('dv-sabab-modal')?.classList.remove('hidden');
}

function dvSababChanged() {
  const select = document.getElementById('dv-sabab-select');
  const matn = document.getElementById('dv-sabab-matn');
  if (!select || !matn) return;
  matn.classList.toggle('hidden', select.value !== 'Boshqa');
}

async function dvSababConfirm() {
  const select = document.getElementById('dv-sabab-select');
  const matn = document.getElementById('dv-sabab-matn');
  const err = document.getElementById('dv-sabab-error');
  const sabab = select ? select.value : '';

  if (!sabab) {
    if (err) { err.textContent = 'Sababni tanlang'; err.classList.remove('hidden'); }
    return;
  }
  if (sabab === 'Boshqa' && (!matn || !matn.value.trim())) {
    if (err) { err.textContent = 'Sababni yozing'; err.classList.remove('hidden'); }
    return;
  }
  if (err) err.classList.add('hidden');

  const token = dvPendingToken;
  document.getElementById('dv-sabab-modal')?.classList.add('hidden');
  dvShowConfirmLoading();

  try {
    const res = await resolveAttendance(token, 'leaving', sabab, matn ? matn.value.trim() : null);
    dvPendingToken = null;
    await renderDavomatResult(res, token);
  } catch (e) {
    console.error('[davomat] resolve xatosi', e);
    dvPlayBeep('error');
    renderScanError('Xatolik: ' + (e.message || "noma'lum xato"));
    dvBusy = false;
  }
}

function dvSababCancel() {
  document.getElementById('dv-sabab-modal')?.classList.add('hidden');
  dvPendingToken = null;
  dvShowScanIdle();
}

// ═══════════════════════════════════════
// MANAGER PANELI — "Ro'yxat" tabi (faqat attendance_manager/owner uchun ko'rinadi)
// ═══════════════════════════════════════

const DV_STATUS_LABELS = {
  on_time: 'O\'z vaqtida', late: 'Kech qolgan', checked_out: 'Ketgan',
  missing_check_in: 'Kelish qayd etilmagan', missing_check_out: 'Ketish qayd etilmagan',
  absent: 'Kelmagan', day_off: 'Dam olish', pending_approval: 'Tasdiq kutilmoqda',
  approved: 'Tasdiqlangan', rejected: 'Rad etilgan',
};
const DV_WARN_STATUSES = ['missing_check_in', 'missing_check_out'];

function dvShowTab(tab) {
  const scanTab = document.getElementById('dv-tab-scan');
  const mineTab = document.getElementById('dv-tab-mine');
  const listTab = document.getElementById('dv-tab-list');
  const scanBtn = document.getElementById('dv-tab-scan-btn');
  const mineBtn = document.getElementById('dv-tab-mine-btn');
  const listBtn = document.getElementById('dv-tab-list-btn');
  if (scanTab) scanTab.classList.toggle('hidden', tab !== 'scan');
  if (mineTab) mineTab.classList.toggle('hidden', tab !== 'mine');
  if (listTab) listTab.classList.toggle('hidden', tab !== 'list');
  if (scanBtn) { scanBtn.classList.toggle('btn-primary', tab === 'scan'); scanBtn.classList.toggle('btn-secondary', tab !== 'scan'); }
  if (mineBtn) { mineBtn.classList.toggle('btn-primary', tab === 'mine'); mineBtn.classList.toggle('btn-secondary', tab !== 'mine'); }
  if (listBtn) { listBtn.classList.toggle('btn-primary', tab === 'list'); listBtn.classList.toggle('btn-secondary', tab !== 'list'); }

  if (tab === 'scan') {
    dvShowScanIdle();
  } else if (tab === 'mine') {
    stopDavomatScanner();
    loadMyDavomatTab();
  } else {
    stopDavomatScanner();
    dvSetToday(false);
    loadDavomatList();
  }
}

// Server har doim Asia/Tashkent bo'yicha "sana" hisoblaydi (attendance_scan RPC) —
// mijoz tomonida qurilma vaqt zonasi boshqacha bo'lsa ham shu bilan mos kelishi uchun
// bu yerda ham aniq Asia/Tashkent ishlatiladi, qurilmaning lokal soati emas.
function dvTashkentDateStr(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  return `${p.year}-${p.month}-${p.day}`;
}

function dvTodayStr() {
  return dvTashkentDateStr(new Date());
}

function dvMonthStartStr() {
  const today = dvTodayStr();
  return today.slice(0, 7) + '-01';
}

async function loadMyDavomatTab() {
  const today = dvTodayStr();
  let rows;
  try {
    rows = await getMyDavomat(dvMonthStartStr(), today);
  } catch (e) {
    const statusEl = document.getElementById('dv-mine-status');
    if (statusEl) statusEl.textContent = 'Xatolik — yuklab bo\'lmadi';
    showNotify?.('❌ Davomat maʼlumotini yuklashda xatolik: ' + (e.message || "noma'lum xato"));
    return;
  }
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—';

  const todayRow = rows.find(r => r.sana === today);
  const statusEl = document.getElementById('dv-mine-status');
  if (statusEl) statusEl.textContent = todayRow ? (DV_STATUS_LABELS[todayRow.status] || todayRow.status) : "Yozuv yo'q";
  const checkinEl = document.getElementById('dv-mine-checkin');
  if (checkinEl) checkinEl.textContent = todayRow ? fmtTime(todayRow.check_in) : '—';
  const checkoutEl = document.getElementById('dv-mine-checkout');
  if (checkoutEl) checkoutEl.textContent = todayRow ? fmtTime(todayRow.check_out) : '—';
  const workedEl = document.getElementById('dv-mine-worked');
  if (workedEl) workedEl.textContent = (todayRow && todayRow.worked_minutes != null) ? (Math.round(todayRow.worked_minutes / 6) / 10) + ' soat' : '—';
  const lateEl = document.getElementById('dv-mine-late');
  if (lateEl) lateEl.textContent = (todayRow && todayRow.late_minutes != null) ? todayRow.late_minutes + ' daq' : '—';

  // Shu oy statistikasi
  const daysPresent = rows.filter(r => r.check_in).length;
  const daysLate = rows.filter(r => r.status === 'late' || (r.late_minutes || 0) > 0).length;
  const totalMinutes = rows.reduce((sum, r) => sum + (r.worked_minutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 6) / 10;

  // Shu oyning bugungacha bo'lgan ish kunlari (yakshanbadan tashqari) — Asia/Tashkent bo'yicha
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  let workDays = 0;
  for (let d = 1; d <= todayDay; d++) {
    if (new Date(Date.UTC(todayYear, todayMonth - 1, d)).getUTCDay() !== 0) workDays++;
  }
  const percent = workDays > 0 ? Math.round((daysPresent / workDays) * 100) : 0;

  const dp = document.getElementById('dv-mine-days-present'); if (dp) dp.textContent = daysPresent;
  const dl = document.getElementById('dv-mine-days-late'); if (dl) dl.textContent = daysLate;
  const th = document.getElementById('dv-mine-total-hours'); if (th) th.textContent = totalHours + ' soat';
  const pc = document.getElementById('dv-mine-percent'); if (pc) pc.textContent = percent + '%';
}

function dvSetToday(reload = true) {
  const sanaInput = document.getElementById('dv-list-sana');
  if (sanaInput && !sanaInput.value) {
    sanaInput.value = dvTodayStr();
  }
  if (reload) loadDavomatList();
}

let dvListRowsCache = {}; // id -> row, Amallar tugmalari (tuzatish/o'chirish) uchun

async function loadDavomatList() {
  const tbody = document.getElementById('dv-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3)">Yuklanmoqda...</td></tr>';

  let rows;
  try {
    if (!dvBranchCache) {
      const branches = await getBranches();
      dvBranchCache = {};
      branches.forEach(b => { dvBranchCache[b.id] = b; });
    }

    const sanaInput = document.getElementById('dv-list-sana');
    const branchSelect = document.getElementById('dv-list-branch');
    const sana = sanaInput ? sanaInput.value : '';
    const branchCode = branchSelect ? branchSelect.value : '';

    const filters = {};
    if (sana) filters.sana = sana;
    if (branchCode) {
      const match = Object.values(dvBranchCache).find(b => b.code === branchCode);
      if (match) filters.branch_id = match.id;
    }

    rows = await getDavomatList(filters);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--danger, #e03131)">Xatolik — ro\'yxatni yuklab bo\'lmadi</td></tr>';
    showNotify?.('❌ Davomat ro\'yxatini yuklashda xatolik: ' + (e.message || "noma'lum xato"));
    return;
  }
  dvListRowsCache = {};
  rows.forEach(r => { dvListRowsCache[r.id] = r; });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3)">Ma\'lumot topilmadi</td></tr>';
    return;
  }

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—';

  tbody.innerHTML = rows.map(r => {
    const email = USER_ID_TO_EMAIL[r.user_id];
    const name = email ? (typeof getName === 'function' ? getName(email) : email) : (r.user_id ? r.user_id.slice(0, 8) : '—');
    const branch = dvBranchCache[r.branch_id];
    const branchName = branch ? branch.name : '—';
    const worked = r.worked_minutes != null ? (Math.round(r.worked_minutes / 6) / 10) + ' soat' : '—';
    const isWarn = DV_WARN_STATUSES.includes(r.status);
    const statusLabel = (isWarn ? '⚠️ ' : '') + (DV_STATUS_LABELS[r.status] || r.status);
    const td = 'padding:8px;border-bottom:1px solid var(--gray-border)';
    const actions =
      '<button class="btn btn-secondary btn-sm" onclick="dvOpenAction(\'' + r.id + '\',\'approve\')">Tasdiqlash</button> ' +
      '<button class="btn btn-secondary btn-sm" onclick="dvOpenAction(\'' + r.id + '\',\'reject\')">Rad etish</button> ' +
      '<button class="btn btn-secondary btn-sm" onclick="dvOpenEdit(\'' + r.id + '\')">Tuzatish</button> ' +
      '<button class="btn btn-danger btn-sm" onclick="dvOpenAction(\'' + r.id + '\',\'delete\')">O\'chirish</button>';
    return '<tr>' +
      '<td style="' + td + '">' + name + '</td>' +
      '<td style="' + td + '">' + branchName + '</td>' +
      '<td style="' + td + '">' + fmtTime(r.check_in) + '</td>' +
      '<td style="' + td + '">' + fmtTime(r.check_out) + '</td>' +
      '<td style="' + td + '">' + statusLabel + '</td>' +
      '<td style="' + td + '">' + worked + '</td>' +
      '<td style="' + td + ';white-space:nowrap">' + actions + '</td>' +
      '</tr>';
  }).join('');
}

// ── MANAGER AMALLARI: tasdiqlash / rad etish / o'chirish (sabab so'raladi) ──
let dvActionTarget = null; // {id, action}

function dvOpenAction(davomatId, action) {
  dvActionTarget = { id: davomatId, action: action };
  const titles = { approve: 'Tasdiqlash', reject: 'Rad etish', delete: "O'chirish" };
  const titleEl = document.getElementById('dv-action-title');
  if (titleEl) titleEl.textContent = titles[action] || action;

  const warnEl = document.getElementById('dv-action-warning');
  if (warnEl) {
    if (action === 'delete') {
      warnEl.textContent = "Diqqat: bu amal davomat yozuvini butunlay o'chiradi, qaytarib bo'lmaydi.";
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
  }

  const btn = document.getElementById('dv-action-confirm-btn');
  if (btn) { btn.className = action === 'delete' ? 'btn btn-danger' : 'btn btn-primary'; btn.style.flex = '1'; }

  const sababEl = document.getElementById('dv-action-sabab');
  if (sababEl) sababEl.value = '';
  document.getElementById('dv-action-error')?.classList.add('hidden');
  document.getElementById('dv-action-modal')?.classList.remove('hidden');
}

function dvActionCancel() {
  document.getElementById('dv-action-modal')?.classList.add('hidden');
  dvActionTarget = null;
}

async function dvActionConfirm() {
  const sababEl = document.getElementById('dv-action-sabab');
  const err = document.getElementById('dv-action-error');
  const sabab = sababEl ? sababEl.value.trim() : '';

  if (!sabab) {
    if (err) { err.textContent = 'Sababni yozing'; err.classList.remove('hidden'); }
    return;
  }
  if (err) err.classList.add('hidden');

  const target = dvActionTarget;
  document.getElementById('dv-action-modal')?.classList.add('hidden');
  if (!target) return;

  try {
    let res;
    if (target.action === 'approve') res = await approveDavomat(target.id, sabab);
    else if (target.action === 'reject') res = await rejectDavomat(target.id, sabab);
    else if (target.action === 'delete') res = await deleteDavomat(target.id, sabab);

    if (res && res.ok === false) {
      showNotify(res.message || 'Bajarilmadi', 'error');
    } else {
      showNotify('Bajarildi', 'success');
    }
    loadDavomatList();
  } catch (e) {
    console.error('[davomat] action xatosi', e);
    showNotify('Xatolik: ' + (e.message || "noma'lum xato"), 'error');
  }
  dvActionTarget = null;
}

// ── MANAGER AMALI: vaqtni qo'lda tuzatish (check_in, check_out, sabab — barchasi majburiy) ──
let dvEditTarget = null;

function dvToLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function dvOpenEdit(davomatId) {
  const row = dvListRowsCache[davomatId];
  dvEditTarget = davomatId;
  const checkinEl = document.getElementById('dv-edit-checkin');
  const checkoutEl = document.getElementById('dv-edit-checkout');
  if (checkinEl) checkinEl.value = row && row.check_in ? dvToLocalInputValue(row.check_in) : '';
  if (checkoutEl) checkoutEl.value = row && row.check_out ? dvToLocalInputValue(row.check_out) : '';
  const sababEl = document.getElementById('dv-edit-sabab');
  if (sababEl) sababEl.value = '';
  document.getElementById('dv-edit-error')?.classList.add('hidden');
  document.getElementById('dv-edit-modal')?.classList.remove('hidden');
}

function dvEditCancel() {
  document.getElementById('dv-edit-modal')?.classList.add('hidden');
  dvEditTarget = null;
}

async function dvEditConfirm() {
  const checkinEl = document.getElementById('dv-edit-checkin');
  const checkoutEl = document.getElementById('dv-edit-checkout');
  const sababEl = document.getElementById('dv-edit-sabab');
  const err = document.getElementById('dv-edit-error');

  const checkinVal = checkinEl ? checkinEl.value : '';
  const checkoutVal = checkoutEl ? checkoutEl.value : '';
  const sabab = sababEl ? sababEl.value.trim() : '';

  if (!checkinVal || !checkoutVal) {
    if (err) { err.textContent = 'Kelgan va ketgan vaqt majburiy'; err.classList.remove('hidden'); }
    return;
  }
  if (!sabab) {
    if (err) { err.textContent = 'Sababni yozing'; err.classList.remove('hidden'); }
    return;
  }
  if (err) err.classList.add('hidden');

  const id = dvEditTarget;
  document.getElementById('dv-edit-modal')?.classList.add('hidden');
  if (!id) return;

  try {
    const res = await manualEditDavomat(id, new Date(checkinVal).toISOString(), new Date(checkoutVal).toISOString(), sabab);
    if (res && res.ok === false) showNotify(res.message || 'Saqlanmadi', 'error');
    else showNotify('Saqlandi', 'success');
    loadDavomatList();
  } catch (e) {
    console.error('[davomat] edit xatosi', e);
    showNotify('Xatolik: ' + (e.message || "noma'lum xato"), 'error');
  }
  dvEditTarget = null;
}
