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
let dvBusy = false;        // true = RPC javobini kutyapmiz yoki modal ochiq — yangi skan qabul qilinmaydi
let dvPendingToken = null; // "noaniq holat" davomida saqlanadigan token
let dvBranchCache = null;  // {id: {id,name,code}} — Ro'yxat tabidagi filial filtri uchun

async function initDavomatScanner() {
  dvBusy = false;
  dvPendingToken = null;
  hideDavomatModals();
  dvShowTab('scan');

  // Manager/owner uchun "Ro'yxat" tabini ko'rsatish
  const listBtn = document.getElementById('dv-tab-list-btn');
  if (listBtn) {
    const isStaff = await checkIsAttendanceStaff();
    listBtn.classList.toggle('hidden', !isStaff);
  }

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

      if (text) await handleScannedText(text.trim());
    }
  }

  if (dvScanning) dvRafId = requestAnimationFrame(dvScanFrame);
}

async function handleScannedText(text) {
  if (!DV_UUID_RE.test(text)) {
    setDavomatStatus("Noma'lum QR kod — filial QR kodini skanerlang", 'error');
    return;
  }

  dvBusy = true;
  setDavomatStatus('Tekshirilmoqda...', 'info');

  try {
    const res = await scanAttendance(text);
    renderDavomatResult(res, text);
  } catch (e) {
    console.error('[davomat] scan xatosi', e);
    setDavomatStatus('Xatolik: ' + (e.message || "noma'lum xato"), 'error');
    dvBusy = false;
  }
}

function renderDavomatResult(res, token) {
  if (!res) {
    setDavomatStatus("Javob olinmadi, qayta urinib ko'ring", 'error');
    dvBusy = false;
    return;
  }

  if (res.action === 'ambiguous_choice_required') {
    dvPendingToken = token;
    setDavomatStatus('Tanlov kutilmoqda...', 'info');
    showAmbiguousModal();
    return; // dvBusy=true qoladi — modal yopilguncha qayta skan qilinmaydi
  }

  if (res.ok) {
    if (res.action === 'check_in') {
      const lateMsg = res.late_minutes > 0 ? ` (${res.late_minutes} daqiqa kech)` : '';
      setDavomatStatus('✅ Kelish qayd etildi' + lateMsg, 'success');
    } else if (res.action === 'check_out') {
      const soat = res.worked_minutes != null ? Math.round(res.worked_minutes / 60 * 10) / 10 : null;
      const workedMsg = soat != null ? ` — ${soat} soat ishladingiz` : '';
      setDavomatStatus('✅ Ketish qayd etildi' + workedMsg, 'success');
    } else {
      setDavomatStatus('✅ Bajarildi', 'success');
    }
  } else {
    setDavomatStatus(res.message || 'Xatolik yuz berdi', 'error');
  }

  // Natijani ko'rish uchun vaqt beramiz, keyin qayta skanerlashga ruxsat
  setTimeout(() => {
    dvBusy = false;
    setDavomatStatus("QR kodni kameraga ko'rsating", 'info');
  }, 3000);
}

function setDavomatStatus(text, type) {
  const el = document.getElementById('dv-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'dv-status-' + (type || 'info');
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
  setDavomatStatus('Yuborilmoqda...', 'info');

  try {
    const res = await resolveAttendance(token, 'came_in');
    dvPendingToken = null;
    renderDavomatResult(res, token);
  } catch (e) {
    console.error('[davomat] resolve xatosi', e);
    setDavomatStatus('Xatolik: ' + (e.message || "noma'lum xato"), 'error');
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
  setDavomatStatus('Yuborilmoqda...', 'info');

  try {
    const res = await resolveAttendance(token, 'leaving', sabab, matn ? matn.value.trim() : null);
    dvPendingToken = null;
    renderDavomatResult(res, token);
  } catch (e) {
    console.error('[davomat] resolve xatosi', e);
    setDavomatStatus('Xatolik: ' + (e.message || "noma'lum xato"), 'error');
    dvBusy = false;
  }
}

function dvSababCancel() {
  document.getElementById('dv-sabab-modal')?.classList.add('hidden');
  dvPendingToken = null;
  dvBusy = false;
  setDavomatStatus("QR kodni kameraga ko'rsating", 'info');
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
  const listTab = document.getElementById('dv-tab-list');
  const scanBtn = document.getElementById('dv-tab-scan-btn');
  const listBtn = document.getElementById('dv-tab-list-btn');
  if (scanTab) scanTab.classList.toggle('hidden', tab !== 'scan');
  if (listTab) listTab.classList.toggle('hidden', tab !== 'list');
  if (scanBtn) { scanBtn.classList.toggle('btn-primary', tab === 'scan'); scanBtn.classList.toggle('btn-secondary', tab !== 'scan'); }
  if (listBtn) { listBtn.classList.toggle('btn-primary', tab === 'list'); listBtn.classList.toggle('btn-secondary', tab !== 'list'); }

  if (tab === 'scan') {
    if (!dvScanning) dvStartCamera();
  } else {
    stopDavomatScanner();
    dvSetToday(false);
    loadDavomatList();
  }
}

function dvSetToday(reload = true) {
  const sanaInput = document.getElementById('dv-list-sana');
  if (sanaInput && !sanaInput.value) {
    const d = new Date();
    sanaInput.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  if (reload) loadDavomatList();
}

async function loadDavomatList() {
  const tbody = document.getElementById('dv-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3)">Yuklanmoqda...</td></tr>';

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

  const rows = await getDavomatList(filters);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3)">Ma\'lumot topilmadi</td></tr>';
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
    return '<tr>' +
      '<td style="' + td + '">' + name + '</td>' +
      '<td style="' + td + '">' + branchName + '</td>' +
      '<td style="' + td + '">' + fmtTime(r.check_in) + '</td>' +
      '<td style="' + td + '">' + fmtTime(r.check_out) + '</td>' +
      '<td style="' + td + '">' + statusLabel + '</td>' +
      '<td style="' + td + '">' + worked + '</td>' +
      '</tr>';
  }).join('');
}
