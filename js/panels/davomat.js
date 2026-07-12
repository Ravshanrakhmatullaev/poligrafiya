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

async function initDavomatScanner() {
  dvBusy = false;
  dvPendingToken = null;
  hideDavomatModals();
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
    console.log('[davomat][debug] getUserMedia: success'); // VAQTINCHALIK DEBUG
  } catch (e) {
    console.error('[davomat] kamera xatosi', e);
    setDavomatStatus('Kameraga ruxsat berilmadi yoki kamera topilmadi', 'error');
    return;
  }

  // VAQTINCHALIK DEBUG — faqat diagnostika, kamera oqimiga ta'sir qilmaydi
  const dvTrack = dvStream.getVideoTracks()[0];
  console.log('[davomat][debug] track.readyState =', dvTrack && dvTrack.readyState);
  console.log('[davomat][debug] track.muted =', dvTrack && dvTrack.muted);
  console.log('[davomat][debug] track.enabled =', dvTrack && dvTrack.enabled);

  video.srcObject = dvStream;

  let dvPlayErrorName = null; // VAQTINCHALIK DEBUG
  try {
    await video.play();
    console.log('[davomat][debug] video.play(): success'); // VAQTINCHALIK DEBUG
  } catch (e) {
    dvPlayErrorName = e && e.name; // VAQTINCHALIK DEBUG
    console.error('[davomat][debug] video.play(): FAILED', e && e.name, e && e.message); // VAQTINCHALIK DEBUG
    /* autoplay bloklansa ham davom etamiz */
  }

  // VAQTINCHALIK DEBUG — video haqiqiy o'lchamini/holatini log qilish va ekranda ko'rsatish
  const dvLogVideoState = (label) => {
    console.log('[davomat][debug]', label,
      'videoWidth =', video.videoWidth,
      'videoHeight =', video.videoHeight,
      'readyState =', video.readyState);
    dvRenderDebugBox({
      width: video.videoWidth,
      height: video.videoHeight,
      readyState: video.readyState,
      trackReadyState: dvTrack && dvTrack.readyState,
      trackMuted: dvTrack && dvTrack.muted,
      trackEnabled: dvTrack && dvTrack.enabled,
      playErrorName: dvPlayErrorName,
    });
  };
  dvLogVideoState('play() dan keyin darhol');
  video.addEventListener('loadedmetadata', () => dvLogVideoState('loadedmetadata hodisasida'), { once: true });
  video.addEventListener('playing', () => dvLogVideoState('playing hodisasida'), { once: true });

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

// ═══════════════════════════════════════
// VAQTINCHALIK DEBUG BLOK — faqat diagnostika uchun, keyin olib tashlanadi
// ═══════════════════════════════════════
function dvRenderDebugBox(info) {
  let box = document.getElementById('dv-debug-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'dv-debug-box';
    box.style.cssText = 'margin-top:10px;padding:8px 10px;font:11px/1.5 monospace;' +
      'background:#111;color:#0f0;border-radius:6px;white-space:pre-wrap;word-break:break-word';
    const panel = document.getElementById('panel-davomat');
    if (panel) panel.appendChild(box);
  }
  box.textContent =
    'DEBUG (vaqtinchalik)\n' +
    'video: ' + info.width + ' x ' + info.height + '\n' +
    'video.readyState: ' + info.readyState + '\n' +
    'track.readyState: ' + info.trackReadyState + '\n' +
    'track.muted: ' + info.trackMuted + '\n' +
    'track.enabled: ' + info.trackEnabled + '\n' +
    'play() error: ' + (info.playErrorName || '(yo\'q)');
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
