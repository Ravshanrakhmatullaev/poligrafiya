// ═══════════════════════════════════════
// auth.js — Login va rol boshqaruvi
// Depends on: config.js, utils.js, db.js
// ═══════════════════════════════════════

let currentUser = null;
let currentRole = null;
let isSaving    = false;
let loginSetupPromise = null;


// ── LOGIN ──
async function doLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  err.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Kirilmoqda...';
  try {
    if(!email || !pass){
      err.textContent = 'Email va parolni kiriting';
      err.classList.remove('hidden');
      return;
    }
    await runSupabaseRequest('login', 'sign_in', () => sb.auth.signInWithPassword({ email, password: pass }), { timeoutMs: 12_000 });
  } catch(error){
    const kind = classifyRequestError(error);
    err.textContent = kind === 'credentials' ? 'Email yoki parol noto\'g\'ri'
      : kind === 'timeout' ? 'Server javobi kechikdi. Internetni tekshirib qayta urining.'
      : kind === 'network' ? 'Internet yoki DNS bilan aloqa yo\'q. Ulanishni tekshiring.'
      : kind === 'rate_limit' ? 'Juda ko\'p urinish. Biroz kutib qayta urining.'
      : 'Kirish xizmatida vaqtinchalik xato. Qayta urinib ko\'ring.';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Kirish';
  }
}

async function doLogout(){
  await sb.auth.signOut();
  sessionStorage.clear();
  window.location.reload();
}

// crm_profiles.role -> ERP role. Xatolik yoki qator topilmasa (masalan
// tarmoq xatosi) null qaytadi — bu holatda ishonchli fallback sifatida
// LEGACY_ROLE_FALLBACK (faqat uvdtf uchun) tekshiriladi, aks holda ruxsat
// berilmaydi (onLogin quyida chiqarib yuboradi).
async function resolveCurrentRole(){
  try {
    const result = await runSupabaseRequest('login', 'role_lookup', () => sb.from('crm_profiles')
      .select('role').eq('id', currentUser.id).maybeSingle(), { timeoutMs: 8_000 });
    const data = result.data;
    if(data && CRM_ROLE_TO_ERP_ROLE[data.role]){
      return CRM_ROLE_TO_ERP_ROLE[data.role];
    }
  } catch(e){
    console.error('[resolveCurrentRole]', {
      kind: classifyRequestError(e), code: e.code || null, elapsedMs: e.erpElapsedMs || null,
    });
    throw e;
  }
  return LEGACY_ROLE_FALLBACK[currentUser.email] || null;
}

async function onLogin(){
  // Page restore can emit SIGNED_IN while init() is also restoring the same
  // session. Both paths used to run the role/profile query concurrently; a
  // late timeout from the second copy could throw the user back to Login even
  // after the first copy had already opened the ERP.
  if(loginSetupPromise) return loginSetupPromise;
  loginSetupPromise = performLoginSetup();
  try {
    return await loginSetupPromise;
  } finally {
    loginSetupPromise = null;
  }
}

async function performLoginSetup(){
  try {
    currentRole = await resolveCurrentRole();
  } catch (error) {
    // A temporary network/profile lookup failure is not "wrong password" and
    // must not destroy an otherwise valid Supabase session.
    showScreen('login');
    const err = document.getElementById('login-error');
    if(err){
      err.textContent = classifyRequestError(error) === 'timeout'
        ? 'Profilni yuklash kechikdi. Qayta urinib ko\'ring.'
        : 'Profilni yuklab bo\'lmadi. Internetni tekshirib qayta kiring.';
      err.classList.remove('hidden');
    }
    return;
  }
  if(!currentRole){
    showNotify("Ruxsat yo'q — administratorga murojaat qiling");
    await doLogout();
    return;
  }
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
  ['nb-owner','nb-admin','nb-ishlab','nb-dizayner','nb-dashboard','nb-davomat','nb-tarix',
   'nb-xabarlar','nb-sklad','nb-kalk','nb-bozorlik','nb-stopwatch','nb-foiz','nb-uvdtf'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('hidden');
  });

  if(currentRole === 'owner'){
    // Owner: admin, ishlab, dizayner, stopwatch, uvdtf yashir
    // (davomat yashirilmaydi — owner davomat manager Ro'yxat tabini ko'radi)
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
    // UV DTF: faqat uvdtf ko'rsatiladi (davomat bundan mustasno — UV DTF ham xodim)
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

