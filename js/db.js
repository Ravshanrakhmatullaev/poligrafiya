// ═══════════════════════════════════════
// db.js — Supabase client va Data Store
// Depends on: config.js
// ═══════════════════════════════════════

// Bitta Supabase client — butun app uchun
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── YAGONA DATA STORE ──
// allHistory faqat shu yerda o'zgartiriladi
// Boshqa fayllar faqat o'qiydi, AppStore orqali subscribe bo'ladi
const AppStore = {
  _history:  [],
  _messages: [],
  _listeners: {},

  // Subscribe — unsubscribe funksiya qaytaradi
  // Duplicate listenerlar oldini oladi (bir xil fn ikki marta qo'shilmaydi)
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    // Duplicate check
    if (this._listeners[event].includes(fn)) return () => this.off(event, fn);
    this._listeners[event].push(fn);
    // Return unsubscribe function
    return () => this.off(event, fn);
  },

  // Unsubscribe
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },

  // Listener sonini ko'rish (debug uchun)
  listenerCount(event) {
    return (this._listeners[event] || []).length;
  },

  // Emit — ma'lumot o'zgarganida barcha subscriber'larni xabardor qilish
  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[AppStore]', event, e); }
    });
  },

  // allHistory getter/setter
  get history() { return this._history; },
  setHistory(data) {
    this._history = data;
    this.emit('historyChanged', data);  // Dashboard, Hisobotlar, Owner panel yangilanadi
  },

  // allMessages getter/setter
  get messages() { return this._messages; },
  setMessages(data) {
    this._messages = data;
    this.emit('messagesChanged', data);
  },
};

// Compatibility: history.js va dizayner.js hali allHistory ishlatadi
// Ularni to'liq AppStore.history ga o'tkazilguncha shu proxy saqlanadi
// OLIB TASHLASH UCHUN: history.js va dizayner.js da allHistory -> AppStore.history
Object.defineProperty(window, 'allHistory', {
  get: () => AppStore.history,
  set: (val) => { AppStore.setHistory(val); },
  configurable: true,
});
Object.defineProperty(window, 'allMessages', {
  get: () => AppStore.messages,
  set: (val) => { AppStore.setMessages(val); },
  configurable: true,
});

// ── DATABASE FUNCTIONS ──

async function dbLoadHistory() {
  try {
    const { data, error } = await sb.from('zakazlar')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    AppStore.setHistory(data || []);  // barcha subscriber'lar xabardor bo'ladi
    return data || [];
  } catch (e) {
    console.error('[loadHistory]', e);
    showNotify('Zakazlarni yuklashda xato', 'error');
    return [];
  }
}

async function dbLoadMessages() {
  try {
    const { data, error } = await sb.from('xabarlar')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    AppStore.setMessages(data || []);
    return data || [];
  } catch (e) {
    console.error('[loadMessages]', e);
    return [];
  }
}

// Zakaz saqlash — va barcha bo'limlarni yangilash
async function saveZakaz(rowData) {
  try {
    const { data, error } = await sb.from('zakazlar').insert(rowData).select().single();
    if (error) throw error;
    await dbLoadHistory();  // AppStore yangilanadi → barcha subscriber'lar yangilanadi
    return data;
  } catch (e) {
    console.error('[saveZakaz]', e);
    showNotify('Zakazni saqlashda xato: ' + e.message, 'error');
    return null;
  }
}

async function updateZakaz(id, changes) {
  try {
    const { error } = await sb.from('zakazlar').update(changes).eq('id', id);
    if (error) throw error;
    await dbLoadHistory();
    return true;
  } catch (e) {
    console.error('[updateZakaz]', e);
    showNotify('Tahrirlashda xato: ' + e.message, 'error');
    return false;
  }
}

async function deleteZakaz(id) {
  try {
    const { error } = await sb.from('zakazlar').delete().eq('id', id);
    if (error) throw error;
    await dbLoadHistory();
    return true;
  } catch (e) {
    console.error('[deleteZakaz]', e);
    showNotify('O\'chirishda xato: ' + e.message, 'error');
    return false;
  }
}

// ═══════════════════════════════════════
// DATABASE SERVICE FUNCTIONS
// Barcha panel fayllar faqat shu funksiyalarni chaqiradi
// sb.from() to'g'ridan-to'g'ri panellarda ishlatilmasin
// ═══════════════════════════════════════

// ── HISTORY (zakazlar) ──
// Muhim: xato bo'lsa THROW qiladi — "ma'lumot yo'q" bilan "so'rov
// muvaffaqiyatsiz tugadi" holatlarini chaqiruvchi kod (loadHistory va h.k.)
// aniq ajratishi uchun. Hech qachon xatoni jimgina []ga aylantirmaydi —
// aks holda hisobotlar sahifasi haqiqiy xato paytida ham "ma'lumot yo'q"
// bo'lib ko'rinadi (2026-07-22 topilgan va tuzatilgan xato).
async function getHistory(filter = {}) {
  let q = sb.from('zakazlar').select('*').order('created_at', { ascending: false });
  if (filter.user_id) q = q.eq('user_id', filter.user_id);
  const { data, error } = await q;
  if (error) { console.error('[getHistory]', error); throw error; }
  return data || [];
}

async function createHistoryItem(data) {
  try {
    const { data: res, error } = await sb.from('zakazlar').insert(data).select().single();
    if (error) throw error;
    await loadHistory();
    return res;
  } catch (e) { console.error('[createHistoryItem]', e); throw e; }
}

async function updateHistoryItem(id, changes) {
  try {
    const { error } = await sb.from('zakazlar').update(changes).eq('id', id);
    if (error) throw error;
    await loadHistory();
    return true;
  } catch (e) { console.error('[updateHistoryItem]', e); throw e; }
}

async function deleteHistoryItem(id) {
  try {
    const { error } = await sb.from('zakazlar').delete().eq('id', id);
    if (error) throw error;
    await loadHistory();
    return true;
  } catch (e) { console.error('[deleteHistoryItem]', e); throw e; }
}

// ── SKLAD ──
async function getWarehouse() {
  // 1-urinish: relation bilan bitta so'rov
  try {
    const { data, error } = await sb.from('sklad')
      .select('*, sklad_harakati(id,tur,miqdor,sabab,user_name,sana,created_at)')
      .order('nom');

    if (!error) return data || [];

    // Relation xatosi — 2-urinish: alohida so'rovlar
    console.warn('[getWarehouse] relation query xato, alohida yuklanmoqda:', error);
  } catch (e) {
    console.warn('[getWarehouse] relation query exception:', e.message);
  }

  // 2-urinish: sklad va sklad_harakati alohida, JS da birlashtirish
  try {
    const [skladRes, harakatiRes] = await Promise.all([
      sb.from('sklad').select('*').order('nom'),
      sb.from('sklad_harakati').select('id,sklad_id,tur,miqdor,sabab,user_name,sana,created_at'),
    ]);

    if (skladRes.error) throw skladRes.error;

    const harakatiMap = {};
    (harakatiRes.data || []).forEach(h => {
      if (!harakatiMap[h.sklad_id]) harakatiMap[h.sklad_id] = [];
      harakatiMap[h.sklad_id].push(h);
    });

    return (skladRes.data || []).map(s => ({
      ...s,
      sklad_harakati: harakatiMap[s.id] || [],
    }));

  } catch (e) {
    // Ikkalasi ham xato — foydalanuvchiga aniq xabar
    const msg = e?.message || 'Noma\'lum xato';
    const code = e?.code || '';
    const details = e?.details || '';
    console.error('[getWarehouse] XATO:', { message: msg, code, details, status: e?.status });

    // UI ga xabar
    showNotify("Sklad ma'lumotlarini yuklab bo'lmadi", 'error');
    const listEl = document.getElementById('sklad-list');
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state" style="color:var(--red)">
        <p>⚠️ Yuklashda xato: ${msg}</p>
        <p style="font-size:12px;color:var(--text3)">${code ? 'Kod: ' + code : ''} ${details || ''}</p>
      </div>`;
    }
    return [];
  }
}

async function createWarehouseItem(data) {
  try {
    const { data: res, error } = await sb.from('sklad').insert(data).select().single();
    if (error) throw error;
    return res;
  } catch (e) { console.error('[createWarehouseItem]', e); throw e; }
}

async function updateWarehouseItem(id, changes) {
  try {
    const { error } = await sb.from('sklad').update(changes).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[updateWarehouseItem]', e); throw e; }
}

async function deleteWarehouseItem(id) {
  try {
    const { error } = await sb.from('sklad').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[deleteWarehouseItem]', e); throw e; }
}

async function addWarehouseMovement(data) {
  try {
    const { error } = await sb.from('sklad_harakati').insert(data);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[addWarehouseMovement]', e); throw e; }
}

async function addWarehouseBrak(data) {
  try {
    const { error } = await sb.from('sklad_brak').insert(data);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[addWarehouseBrak]', e); throw e; }
}

// ── XABARLAR ──
async function getMessages(userId, role) {
  try {
    let q = sb.from('xabarlar').select('*').order('created_at', { ascending: false }).limit(50);
    if (role !== 'owner') {
      q = q.or(`receiver_id.eq.${userId},sender_id.eq.${userId},receiver_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw error;
    AppStore.setMessages(data || []);
    return data || [];
  } catch (e) { console.error('[getMessages]', e); return []; }
}

async function createMessage(data) {
  try {
    const { error } = await sb.from('xabarlar').insert(data);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[createMessage]', e); throw e; }
}

async function markMessageRead(id) {
  try {
    const { error } = await sb.from('xabarlar').update({ is_read: true }).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[markMessageRead]', e); throw e; }
}

// ── BOZORLIK ──
async function getShoppingList() {
  try {
    const { data, error } = await sb.from('bozorlik_list')
      .select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[getShoppingList]', e); return []; }
}

async function createShoppingItem(data) {
  try {
    const { data: res, error } = await sb.from('bozorlik_list').insert(data).select().single();
    if (error) throw error;
    return res;
  } catch (e) { console.error('[createShoppingItem]', e); throw e; }
}

async function updateShoppingItem(id, changes) {
  try {
    const { error } = await sb.from('bozorlik_list').update(changes).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[updateShoppingItem]', e); throw e; }
}

async function deleteShoppingItem(id) {
  try {
    const { error } = await sb.from('bozorlik_list').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[deleteShoppingItem]', e); throw e; }
}

// ── AVANS ──
async function getAvans(userEmail) {
  try {
    const { data, error } = await sb.from('avanslar')
      .select('*').eq('user_email', userEmail)
      .order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[getAvans]', e); return []; }
}

async function createAvans(data) {
  try {
    const { error } = await sb.from('avanslar').insert(data);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[createAvans]', e); throw e; }
}

async function deleteAvansById(id) {
  try {
    const { error } = await sb.from('avanslar').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[deleteAvansById]', e); throw e; }
}

// ── HISOB-KITOB ──
async function getHisobKitob(adminEmail) {
  try {
    const { data, error } = await sb.from('hisob_kitob')
      .select('*').eq('admin_email', adminEmail)
      .order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[getHisobKitob]', e); return []; }
}

async function createHisobKitob(data) {
  try {
    const { error } = await sb.from('hisob_kitob').insert(data);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[createHisobKitob]', e); throw e; }
}

async function deleteHisobKitobById(id) {
  try {
    const { error } = await sb.from('hisob_kitob').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[deleteHisobKitobById]', e); throw e; }
}

async function getAllHisobKitob() {
  try {
    const { data, error } = await sb.from('hisob_kitob').select('admin_email, summa');
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[getAllHisobKitob]', e); return []; }
}

// ── TOLOVLAR ──
async function getTolovlar(filter = {}) {
  try {
    let q = sb.from('tolovlar').select('*').order('created_at', { ascending: false });
    if (filter.user_id) q = q.eq('user_id', filter.user_id);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[getTolovlar]', e); return []; }
}

async function createTolov(data) {
  try {
    const { error } = await sb.from('tolovlar').insert(data);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[createTolov]', e); throw e; }
}

async function updateTolov(id, changes) {
  try {
    const { error } = await sb.from('tolovlar').update(changes).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[updateTolov]', e); throw e; }
}

async function deleteTolov(id) {
  try {
    const { error } = await sb.from('tolovlar').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { console.error('[deleteTolov]', e); throw e; }
}

// ── UV DTF ──
async function getUvdtfHisobot(userEmail) {
  try {
    const { data, error } = await sb.from('uvdtf_hisobot')
      .select('*').eq('user_email', userEmail)
      .order('sana', { ascending: false }).limit(24);
    if (error) throw error;
    return data || [];
  } catch (e) { console.error('[getUvdtfHisobot]', e); return []; }
}

async function upsertUvdtfHisobot(data) {
  try {
    const { error } = await sb.from('uvdtf_hisobot')
      .upsert(data, { onConflict: 'user_email,sana' });
    if (error) throw error;
    return true;
  } catch (e) { console.error('[upsertUvdtfHisobot]', e); throw e; }
}

// ── DAVOMAT (QR skanerlash) ──
// attendance_scan/attendance_resolve {ok:true|false, ...} obyektini qaytaradi —
// bu normal oqim (masalan, "allaqachon yakunlangan"), throw qilinmaydi.
// Faqat haqiqiy RPC xatosi (masalan, login yo'q, validatsiya) throw qilinadi.
async function scanAttendance(token) {
  const { data, error } = await sb.rpc('attendance_scan', { p_token: token });
  if (error) throw error;
  return data;
}

// Read-only: QR skanerlanganda, tasdiqlashdan oldin filial nomi/taxminiy amalni ko'rsatish uchun.
// Hech qanday yozish qilmaydi — attendance_scan alohida, faqat "Tasdiqlash" bosilganda chaqiriladi.
async function previewAttendance(token) {
  const { data, error } = await sb.rpc('attendance_preview', { p_token: token });
  if (error) throw error;
  return data;
}

async function resolveAttendance(token, choice, sabab = null, sababMatni = null) {
  const { data, error } = await sb.rpc('attendance_resolve', {
    p_token: token,
    p_choice: choice,
    p_sabab: sabab,
    p_sabab_matni: sababMatni,
  });
  if (error) throw error;
  return data;
}

async function checkIsAttendanceStaff() {
  try {
    const { data, error } = await sb.rpc('is_attendance_staff');
    if (error) throw error;
    return !!data;
  } catch (e) { console.error('[checkIsAttendanceStaff]', e); return false; }
}

async function getBranches() {
  const { data, error } = await sb.from('branches')
    .select('id, name, code, is_active').eq('is_active', true).order('name');
  if (error) { console.error('[getBranches]', error); throw error; }
  return data || [];
}

async function getDavomatList(filters = {}) {
  let q = sb.from('davomat').select('*').order('check_in', { ascending: false });
  if (filters.sana) q = q.eq('sana', filters.sana);
  if (filters.branch_id) q = q.eq('branch_id', filters.branch_id);
  const { data, error } = await q;
  if (error) { console.error('[getDavomatList]', error); throw error; }
  return data || [];
}

// Xodimning o'z davomat yozuvlari — RLS orqali ham himoyalangan, bu yerda .eq('user_id',...)
// bilan qo'shimcha aniq filtr (staff/owner ham shu funksiyani chaqirsa faqat o'zinikini ko'radi)
async function getMyDavomat(fromDate, toDate) {
  if (!currentUser) return [];
  let q = sb.from('davomat').select('*').eq('user_id', currentUser.id).order('sana', { ascending: false });
  if (fromDate) q = q.gte('sana', fromDate);
  if (toDate) q = q.lte('sana', toDate);
  const { data, error } = await q;
  if (error) { console.error('[getMyDavomat]', error); throw error; }
  return data || [];
}

// ── DAVOMAT MANAGER AMALLARI (owner/attendance_manager) ──
async function approveDavomat(davomatId, sabab) {
  const { data, error } = await sb.rpc('attendance_approve', { p_davomat_id: davomatId, p_sabab: sabab });
  if (error) throw error;
  return data;
}

async function rejectDavomat(davomatId, sabab) {
  const { data, error } = await sb.rpc('attendance_reject', { p_davomat_id: davomatId, p_sabab: sabab });
  if (error) throw error;
  return data;
}

async function manualEditDavomat(davomatId, checkIn, checkOut, sabab) {
  const { data, error } = await sb.rpc('attendance_manual_edit', {
    p_davomat_id: davomatId, p_check_in: checkIn, p_check_out: checkOut, p_sabab: sabab,
  });
  if (error) throw error;
  return data;
}

async function deleteDavomat(davomatId, sabab) {
  const { data, error } = await sb.rpc('attendance_delete', { p_davomat_id: davomatId, p_sabab: sabab });
  if (error) throw error;
  return data;
}

// ── ERP <-> CRM BUYURTMA BOG'LASH ──
// service_role yo'q — hammasi joriy foydalanuvchining o'z Supabase
// sessiyasi (sb, RLS orqali) bilan ishlaydi. erp_crm_order_links jadvali
// faqat director/designer/production rolidagi crm_profiles egalari uchun
// ochiq (bog'liq migration: CRM repo,
// supabase/migrations/20260719120000_erp_crm_order_links.sql — applied).

async function searchCrmOrders(query) {
  try {
    let q = sb.from('crm_orders')
      .select('id, order_number, product, contact:crm_contacts(name)')
      .order('created_at', { ascending: false })
      .limit(20);
    if (query && query.trim()) {
      const safe = query.trim().replace(/[%,]/g, '');
      q = q.or(`order_number.ilike.%${safe}%,product.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[searchCrmOrders]', e);
    showNotify('CRM buyurtmalarni qidirishda xato', 'error');
    return [];
  }
}

async function getErpCrmLinks() {
  try {
    const { data, error } = await sb.from('erp_crm_order_links')
      .select('id, erp_item_key, crm_order_id, linked_by, created_at, crm_order:crm_orders(order_number, product, contact:crm_contacts(name))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[getErpCrmLinks]', e);
    showNotify('Bog\'langan buyurtmalarni yuklashda xato', 'error');
    return [];
  }
}

async function createErpCrmLink(crmOrderId) {
  try {
    const itemKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const { data, error } = await sb.from('erp_crm_order_links')
      .insert({ erp_item_key: itemKey, crm_order_id: crmOrderId, linked_by: currentUser.id })
      .select('id, erp_item_key, crm_order_id, created_at')
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('[createErpCrmLink]', e);
    showNotify('Bog\'lashda xato: ' + e.message, 'error');
    return null;
  }
}

async function deleteErpCrmLink(linkId) {
  try {
    const { error } = await sb.from('erp_crm_order_links').delete().eq('id', linkId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[deleteErpCrmLink]', e);
    showNotify('Bog\'lanishni o\'chirishda xato: ' + e.message, 'error');
    return false;
  }
}

// Joriy CRM workflow holati — to'g'ridan-to'g'ri hardened RPC orqali (xuddi
// CRM'ning o'z UI'si kabi), service_role yo'q, faqat joriy sessiya.
async function getCrmWorkflowStatus(crmOrderId) {
  try {
    const { data: wf, error: wfErr } = await sb.from('workflow_orders')
      .select('id, current_status').eq('order_id', crmOrderId).maybeSingle();
    if (wfErr) throw wfErr;
    if (!wf) return null; // workflow hali yaratilmagan yoki ruxsat yo'q — farqlanmaydi
    const { data: progress, error: progErr } = await sb.rpc('workflow_get_progress', { p_workflow_order_id: wf.id });
    if (progErr) throw progErr;
    return progress;
  } catch (e) {
    console.error('[getCrmWorkflowStatus]', e);
    return null;
  }
}

// CRM workflow statusini o'zgartirish / progress yuborish — CRM'ning
// authenticated ERP endpointi orqali (Bearer joriy access_token). Hech
// qanday secret bu yerda yo'q va bo'lmaydi.
async function sendCrmWorkflowTransition(crmOrderId, status, extra) {
  extra = extra || {};
  try {
    const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
    if (sessionErr || !sessionData || !sessionData.session) {
      showNotify('Sessiya topilmadi — qayta kiring', 'error');
      return { ok: false, error: 'no_session' };
    }
    const token = sessionData.session.access_token;

    const res = await fetch(CRM_WORKFLOW_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ crmOrderId: crmOrderId, status: status }, extra)),
    });
    const body = await res.json().catch(() => null);

    if (res.status === 401) {
      showNotify('Sessiya tugagan — qayta kiring', 'error');
      return { ok: false, error: 'unauthorized', status: 401 };
    }
    if (res.status === 403) {
      showNotify((body && body.message) || 'Bu amal uchun ruxsat yo\'q', 'error');
      return { ok: false, error: 'forbidden', status: 403 };
    }
    if (res.status === 404) {
      showNotify((body && body.message) || 'Buyurtma yoki workflow topilmadi', 'error');
      return { ok: false, error: 'not_found', status: 404 };
    }
    if (!res.ok || !body || !body.ok) {
      showNotify((body && body.message) || 'Noto\'g\'ri so\'rov', 'error');
      return { ok: false, error: (body && body.error) || 'unknown', status: res.status };
    }
    return body;
  } catch (e) {
    console.error('[sendCrmWorkflowTransition]', e);
    showNotify('Tarmoq xatosi: ' + e.message, 'error');
    return { ok: false, error: 'network_error' };
  }
}
