// ═══════════════════════════════════════
// auth.js — Login va rol boshqaruvi
// Depends on: config.js, utils.js, db.js
// ═══════════════════════════════════════

let currentUser = null;
let currentRole = null;
let isSaving    = false;


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
  loadHistory().then(()=>showPanel('dashboard'));
  setInterval(() => loadMessages(), 30000);
}

function enterAdminApp(){
  sessionStorage.setItem('admin_yoriq_'+currentUser.id, '1');
  showScreen('app');
  loadHistory().then(()=>showPanel('dashboard'));
  setInterval(() => loadMessages(), 30000);
}

function enterDizaynerApp(){
  sessionStorage.setItem('diz_yoriq_'+currentUser.id, '1');
  document.getElementById('nb-stopwatch').classList.remove('hidden');
  loadTimers();
  showScreen('app');
  loadHistory().then(()=>showPanel('dashboard'));
  setInterval(() => loadMessages(), 30000);
}

