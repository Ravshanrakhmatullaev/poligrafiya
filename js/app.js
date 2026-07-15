// ═══════════════════════════════════════
// app.js — Asosiy controller
// LOAD ORDER: config → utils → db → auth → panels → app
// Depends on: ALL files
// ═══════════════════════════════════════

// Global state (auth.js dan olinadi)
// currentUser, currentRole — auth.js da e'lon qilingan


// ── THEME SYSTEM ──
let currentTheme = 'light'; // JS variable only, no localStorage per requirement

function getSystemTheme(){
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme){
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  // Sync all toggle buttons
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    const sun = btn.querySelector('.theme-icon-sun');
    const moon = btn.querySelector('.theme-icon-moon');
    if(sun) sun.style.display = theme === 'dark' ? 'none' : 'block';
    if(moon) moon.style.display = theme === 'dark' ? 'block' : 'none';
    btn.setAttribute('aria-pressed', theme === 'dark');
    btn.title = theme === 'dark' ? 'Light modega otish' : 'Dark modega otish';
  });
}

function toggleTheme(){
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// Shift time detection (08:00-20:00 = light, else dark) — auto only at init
function getAutoTheme(){
  const h = new Date().getHours();
  return (h >= 8 && h < 20) ? 'light' : 'dark';
}

function getCurrentShift(){
  return currentTheme === 'light' ? 'day' : 'night';
}

function getShiftLabel(){
  return currentTheme === 'light' ? '☀️ Kunduzgi' : '🌙 Tungi';
}

function initShift(){
  // Apply auto theme based on time
  applyTheme(getAutoTheme());

  // Every hour re-check (only if user hasn't manually changed)
  let autoCheck = setInterval(() => {
    applyTheme(getAutoTheme());
  }, 60 * 60 * 1000);

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    applyTheme(getAutoTheme());
  });
}




// ── HAMBURGER MOBILE ──
function toggleMobileNav(){
  const nav = document.getElementById('main-nav');
  const btn = document.getElementById('hamburger-btn');
  if(!nav||!btn) return;
  const isOpen = nav.classList.toggle('mobile-open');
  btn.classList.toggle('open', isOpen);
  btn.setAttribute('aria-expanded', isOpen);
}

// Close mobile nav when clicking outside
document.addEventListener('click', e => {
  const nav = document.getElementById('main-nav');
  const btn = document.getElementById('hamburger-btn');
  if(nav && btn && !nav.contains(e.target) && !btn.contains(e.target)){
    nav.classList.remove('mobile-open');
    btn.classList.remove('open');
  }
});

// ── GLOBAL SEARCH (Ctrl+K) ──
const GS_PAGES = [
  {label:'Dashboard', desc:'Shaxsiy hisobot', icon:'📊', panel:'dashboard'},
  {label:'Sklad', desc:'Mahsulotlar omborxonasi', icon:'🏠', panel:'sklad'},
  {label:'Kalkulyator', desc:'Narx hisoblash', icon:'🧮', panel:'kalk'},
  {label:'Hisobotlar', desc:'Zakaz tarixi', icon:'📋', panel:'tarix'},
  {label:'Xabarlar', desc:'Ichki xabarlar', icon:'✉️', panel:'xabarlar'},
  {label:'Bozorlik', desc:'Bozor ro\'yxati', icon:'🛒', panel:'bozorlik'},
  {label:'Admin', desc:'Admin panel', icon:'👤', panel:'admin'},
  {label:'Ishlab chiqarish', desc:'Ishlab chiqarish paneli', icon:'🏭', panel:'ishlab'},
  {label:'Foiz jadvali', desc:'Foiz jadval', icon:'📈', panel:'foiz'},
];

let gsSelectedIdx = 0;

function openGlobalSearch(){
  const wrap = document.getElementById('global-search-wrap');
  const input = document.getElementById('global-search-input');
  if(!wrap) return;
  wrap.style.display = 'flex';
  wrap.classList.remove('hidden');
  if(input){ input.value=''; input.focus(); }
  globalSearch('');
}

function closeGlobalSearch(){
  const wrap = document.getElementById('global-search-wrap');
  if(wrap) wrap.style.display = 'none';
}

function globalSearch(query){
  const results = document.getElementById('global-search-results');
  if(!results) return;
  const q = query.toLowerCase().trim();
  const filtered = q ? GS_PAGES.filter(p =>
    p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
  ) : GS_PAGES;

  gsSelectedIdx = 0;
  results.innerHTML = filtered.map((p,i) =>
    '<div class="gs-item'+(i===0?' active':'')+'" onclick="gsGo(\'"+p.panel+"\')">'+
      '<div class="gs-icon">'+p.icon+'</div>'+
      '<div><div class="gs-label">'+p.label+'</div><div class="gs-desc">'+p.desc+'</div></div>'+
    '</div>'
  ).join('') || '<div class="gs-item"><div class="gs-desc" style="padding:4px 0">Hech narsa topilmadi</div></div>';
}

function gsGo(panel){
  showPanel(panel);
  closeGlobalSearch();
}

// Keyboard for global search
document.addEventListener('keydown', e => {
  const wrap = document.getElementById('global-search-wrap');
  const isOpen = wrap && wrap.style.display !== 'none';

  if((e.ctrlKey || e.metaKey) && e.key === 'k'){
    e.preventDefault();
    isOpen ? closeGlobalSearch() : openGlobalSearch();
    return;
  }
  if(e.key === 'Escape' && isOpen){ closeGlobalSearch(); return; }
  if(!isOpen) return;

  const items = document.querySelectorAll('.gs-item');
  if(!items.length) return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); gsSelectedIdx = Math.min(gsSelectedIdx+1, items.length-1); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); gsSelectedIdx = Math.max(gsSelectedIdx-1, 0); }
  else if(e.key === 'Enter'){
    const active = items[gsSelectedIdx];
    if(active) active.click();
    return;
  }
  items.forEach((el,i) => el.classList.toggle('active', i===gsSelectedIdx));
});

// Click outside to close search
document.addEventListener('click', e => {
  const wrap = document.getElementById('global-search-wrap');
  if(wrap && wrap.style.display !== 'none' && e.target === wrap) closeGlobalSearch();
});



// ── QUICK ACTION ──
function toggleQuickAction(){
  const menu = document.getElementById('quick-action-menu');
  if(menu) menu.classList.toggle('hidden');
}
document.addEventListener('click', e => {
  const menu = document.getElementById('quick-action-menu');
  const btn = document.getElementById('quick-action-btn');
  if(menu && btn && !menu.contains(e.target) && !btn.contains(e.target)){
    menu.classList.add('hidden');
  }
});

sb.auth.onAuthStateChange((event, session) => {
  if(event === 'SIGNED_IN' && session && session.user){
    currentUser = session.user;
    document.getElementById('loading').classList.add('hidden');
    onLogin();
  } else if(event === 'SIGNED_OUT'){
    currentUser = null;
    showScreen('login');
  }
});


// ── NAVIGATION ──
function showPanel(id) {
  const prevPanel = document.querySelector('.panel.active');
  if (prevPanel && prevPanel.id === 'panel-davomat' && typeof stopDavomatScanner === 'function') {
    stopDavomatScanner();
  }

  saveLastPanel(id);
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });

  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');

  const navBtn = document.getElementById('nb-' + id);
  if (navBtn) navBtn.classList.add('active');

  // Panel-specific actions — all wrapped in safeInitPanel
  const actions = {
    'foiz':      () => safeInitPanel('Foiz jadvali', () => { setTimeout(renderFoizTable, 50); }),
    'tarix':     () => safeInitPanel('Hisobotlar',   () => { renderHistory(); if(currentRole==='owner') renderBiDashboard(); }),
    'owner':     () => safeInitPanel('Owner panel',  renderOwnerPanel),
    'admin':     () => safeInitPanel('Admin',         initAdminPanel),
    'xabarlar':  () => safeInitPanel('Xabarlar',     async () => { await loadMessages(); renderMessages(); }),
    'ishlab':    () => safeInitPanel('Ishlab',        initIshlabPanel),
    'dizayner':  () => safeInitPanel('Dizayner',      initDizaynerPanel),
    'sklad':     () => safeInitPanel('Sklad',         loadSklad),
    'stopwatch': () => safeInitPanel('Stopwatch',     renderDizayner),
    'davomat':   () => safeInitPanel('Davomat',       initDavomatScanner),
    'dashboard': () => safeInitPanel('Dashboard',     renderDashboard),
    'bozorlik':  () => safeInitPanel('Bozorlik',      async () => { await loadBozorlik(); if (!skladData.length) await loadSklad(); }),
    'uvdtf':     () => safeInitPanel('UV DTF',        async () => { await loadUvdtfHisobot(); document.getElementById('nb-uvdtf')?.classList.add('active'); }),
    'kalk':      () => safeInitPanel('Kalkulyator',   () => { setKalkType('sigim', document.querySelector('.kc-tab[data-type="sigim"]')); }),
  };

  if (actions[id]) actions[id]();
  saveCurrentPanel(id);
}

function showScreen(id) {
  ['login-screen','yoriq-screen','dizayner-yoriq-screen','admin-yoriq-screen','app-screen'].forEach(s => {
    document.getElementById(s)?.classList.add('hidden');
  });
  const map = {
    login: 'login-screen', yoriq: 'yoriq-screen',
    dizayner_yoriq: 'dizayner-yoriq-screen', admin_yoriq: 'admin-yoriq-screen',
    app: 'app-screen',
  };
  document.getElementById(map[id] || id)?.classList.remove('hidden');
}

function saveCurrentPanel(id) {
  try { sessionStorage.setItem('lastPanel_' + (currentUser?.id || 'guest'), id); } catch {}
}

function saveLastPanel(id) {
  try { sessionStorage.setItem('lastPanel_' + (currentUser?.id || 'guest'), id); } catch {}
}

function getLastPanel(def) {
  try { return sessionStorage.getItem('lastPanel_' + (currentUser?.id || 'guest')) || def; } catch { return def; }
}

// ── INIT ──
async function init() {
  initShift();
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await onLogin();
    } else {
      showScreen('login');
    }
  } catch (e) {
    console.error('[init]', e);
    showScreen('login');
  } finally {
    // Loading spinner har qanday holatda yashiriladi
    const loadEl = document.getElementById('loading');
    if (loadEl) loadEl.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
