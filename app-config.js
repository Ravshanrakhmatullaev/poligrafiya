
// ══════════════════════════════════════
// SUPABASE CONFIG
// ══════════════════════════════════════
const SUPABASE_URL = 'https://jxxmbgmbaqausqunfyna.supabase.co';
// Eslatma: bu fayl index.html tomonidan yuklanmaydi (js/config.js ishlatiladi) —
// shunga qaramay, 2026-07 kalit migratsiyasiga mos qilib yangilandi.
const SUPABASE_KEY = 'sb_publishable_FEqgX7REH1r-cJPfQK8a5w_-5V_-RYG';
const OWNER_EMAIL  = 'ra.ravshan1998@gmail.com';

// Rollar — email bo'yicha
const ROLES = {
  'ra.ravshan1998@gmail.com': 'owner',
  'ra.ravshan1998+bayramali@gmail.com': 'ishlab',
  'ra.ravshan1998+umar@gmail.com': 'ishlab',
  'ra.ravshan1998+parvina@gmail.com': 'ishlab',
  'ra.ravshan1998+mohlaroy@gmail.com': 'admin',
  'ra.ravshan1998+abror@gmail.com': 'admin',
  'ra.ravshan1998+umidjon@gmail.com': 'admin',
  'ra.ravshan1998+ulugbek@gmail.com': 'admin',
  'ra.ravshan1998+zuhriddin@gmail.com': 'ishlab',
  'ra.ravshan1998+jorabek@gmail.com': 'ishlab',
  'ra.ravshan1998+rashidulloh@gmail.com': 'admin',
  'ra.ravshan1998+ulugbekdesign@gmail.com': 'dizayner',
  'ra.ravshan1998+begzodbek@gmail.com': 'dizayner',
  'ra.ravshan1998+gaybulloh@gmail.com': 'dizayner',
  'adsuzuvdtf@gmail.com': 'uvdtf',
};

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


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
const fmt = n => Math.round(n).toLocaleString('uz-UZ');

let currentUser = null;
let currentRole = null;
let allHistory = [];
let histFilter = 'all';

// ── INIT ──
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

async function init(){
  initShift(); // Shift va dark mode ni ishga tushirish
  const { data: { session } } = await sb.auth.getSession();
  document.getElementById('loading').classList.add('hidden');
  if(session && session.user){
    currentUser = session.user;
    onLogin();
  } else {
    showScreen('login');
  }
}

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

// ── LOGIN ──
async function doLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  err.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Kirilmoqda...';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if(error){
    err.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Kirish';
  }
}

async function doLogout(){
  await sb.auth.signOut();
  sessionStorage.clear();
  window.location.reload();
}

function onLogin(){
  currentRole = ROLES[currentUser.email] || 'admin';
  const name = ((currentUser.email.split('+')[1] || '').split('@')[0]) || currentUser.email.split('@')[0];

  document.getElementById('user-name-chip').textContent = name;
  const rb = document.getElementById('role-badge-chip');
  rb.className = 'role-badge ' + currentRole;
  rb.textContent = currentRole === 'owner' ? 'Owner' : currentRole === 'admin' ? 'Admin' : currentRole === 'dizayner' ? 'Dizayner' : currentRole === 'uvdtf' ? 'UV DTF' : 'Ishlab chiqarish';
  


  // Avval barchasini ko'rsat, keyin rolga qarab yashir
  const nbOwner  = document.getElementById('nb-owner');
  const nbAdmin  = document.getElementById('nb-admin');
  const nbIshlab = document.getElementById('nb-ishlab');

  // Hammani ko'rsat
  ['nb-owner','nb-admin','nb-ishlab','nb-dizayner','nb-dashboard','nb-tarix',
   'nb-xabarlar','nb-sklad','nb-kalk','nb-bozorlik','nb-stopwatch','nb-foiz','nb-uvdtf'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('hidden');
  });

  if(currentRole === 'owner'){
    // Owner: admin, ishlab, dizayner, stopwatch, uvdtf yashir
    ['nb-admin','nb-ishlab','nb-dizayner','nb-stopwatch','nb-uvdtf'].forEach(id => {
      const el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    showScreen('app');
    loadHistory().then(() => showPanel('owner'));
    setInterval(() => loadMessages(), 30000);
  } else if(currentRole === 'admin'){
    // Admin: owner, ishlab, dizayner, stopwatch, uvdtf yashir
    ['nb-owner','nb-ishlab','nb-dizayner','nb-stopwatch','nb-uvdtf'].forEach(id => {
      const el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    const seen = sessionStorage.getItem('admin_yoriq_'+currentUser.id);
    if(seen){ showScreen('app'); loadHistory().then(()=>showPanel(getLastPanel('dashboard'))); setInterval(() => loadMessages(), 30000); }
    else { showScreen('admin_yoriq'); }
  } else if(currentRole === 'dizayner'){
    // Dizayner: owner, admin, ishlab, foiz, bozorlik, sklad, uvdtf yashir
    ['nb-owner','nb-admin','nb-ishlab','nb-foiz','nb-bozorlik','nb-sklad','nb-uvdtf'].forEach(id => {
      const el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    document.getElementById('nb-stopwatch').classList.remove('hidden');
    const seen = sessionStorage.getItem('diz_yoriq_'+currentUser.id);
    if(seen){
      loadTimers();
      showScreen('app');
      loadHistory().then(()=>showPanel(getLastPanel('dashboard')));
      setInterval(() => loadMessages(), 30000);
    }
    else { showScreen('dizayner_yoriq'); }
  } else if(currentRole === 'uvdtf'){
    // UV DTF: faqat uvdtf ko'rsatiladi
    ['nb-owner','nb-admin','nb-ishlab','nb-dizayner','nb-dashboard','nb-tarix',
     'nb-xabarlar','nb-sklad','nb-kalk','nb-bozorlik','nb-stopwatch','nb-foiz'].forEach(id => {
      const el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    showScreen('app');
    showPanel('uvdtf');
    loadUvdtfHisobot();
    return;
  } else {
    // Ishlab chiqarish: owner, admin, dizayner, foiz, stopwatch, uvdtf yashir
    ['nb-owner','nb-admin','nb-dizayner','nb-foiz','nb-stopwatch','nb-uvdtf'].forEach(id => {
      const el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    if(!(currentUser && currentUser.email === SKLAD_EDITOR)){
      const el = document.getElementById('nb-bozorlik'); if(el) el.classList.add('hidden');
    }
    const seen = sessionStorage.getItem('yoriq_'+currentUser.id);
    if(seen){ showScreen('app'); loadHistory().then(()=>showPanel(getLastPanel('dashboard'))); setInterval(() => loadMessages(), 30000); }
    else { showScreen('yoriq'); }
  }
}

function enterApp(){
  sessionStorage.setItem('yoriq_'+currentUser.id, '1');
  showScreen('app');
  const defaultPanel = currentRole === 'admin' ? 'admin' : currentRole === 'ishlab' ? 'ishlab' : 'tarix';
  showPanel('dashboard');
  loadHistory();
  setInterval(() => loadMessages(), 30000);
}

function enterAdminApp(){
  sessionStorage.setItem('admin_yoriq_'+currentUser.id, '1');
  showScreen('app');
  showPanel('dashboard');
  loadHistory();
  setInterval(() => loadMessages(), 30000);
}

function enterDizaynerApp(){
  sessionStorage.setItem('diz_yoriq_'+currentUser.id, '1');
  document.getElementById('nb-stopwatch').classList.remove('hidden');
  loadTimers();
  showScreen('app');
  showPanel('dashboard');
  loadHistory();
  setInterval(() => loadMessages(), 30000);
}
