// panels/account.js — "Profil va xavfsizlik": employee self-service login mgmt.
// Depends: config.js, utils.js (showNotify), db.js (saveErrorMessage), auth.js (currentUser/currentRole/doLogout), supabase client `sb`.
//
// SECURITY MODEL:
//  - Operates ONLY on the current authenticated user's own Supabase Auth account
//    (publishable key + the user's session). No service-role, no other user.
//  - Never changes role/UUID/identity (those live in crm_profiles, UUID-keyed,
//    and are protected server-side by migration 0001). Role is shown read-only.
//  - Passwords/tokens are never logged or stored; password fields cleared after use.
//  - Email-change and password-recovery require Supabase Auth Dashboard config
//    (redirect allowlist, secure email change, SMTP). Until the Owner confirms
//    that config, those flows are FEATURE-GATED OFF so we never ship a
//    half-enabled insecure flow. Password change needs no Dashboard config → ON.
const SELF_SERVICE = {
  password: true,    // authenticated password change — no Dashboard dependency
  email:    false,   // GATED: needs secure email-change + redirect allowlist + SMTP
  recovery: false,   // GATED: needs recovery redirect allowlist + SMTP
  signOutOthers: false, // GATED: enable only if global/others scope is confirmed safe
};
const PASSWORD_MIN = 8; // client policy; server policy is the Supabase project setting
// Approved callback origin for (gated) email/recovery flows — same-origin only,
// no user-supplied redirect → no open redirect.
function accRedirectUrl(){ try { return location.origin + location.pathname; } catch(e){ return ''; } }

function initAccountPanel(){ renderAccountPanel(); }

function renderAccountPanel(){
  const el = document.getElementById('panel-account');
  if(!el || !currentUser) return;
  const email = currentUser.email || '';
  const name = (typeof XODIMLAR !== 'undefined' && XODIMLAR[email]) ||
               ((email.split('+')[1] || '').split('@')[0]) || email.split('@')[0] || '—';
  const roleLabel = (typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS[currentRole]) || currentRole || '—';
  const set = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  set('acc-name', name);
  set('acc-email', email);            // OWN email only (never another employee's)
  set('acc-role', roleLabel);
  // gated sections: show a clear "pending config" note instead of a half-enabled flow
  const gate = (sectionId, enabled) => {
    const s = document.getElementById(sectionId); if(!s) return;
    const note = s.querySelector('[data-gated-note]'); const body = s.querySelector('[data-gated-body]');
    if(body) body.style.display = enabled ? '' : 'none';
    if(note) note.style.display = enabled ? 'none' : '';
  };
  gate('acc-email-section', SELF_SERVICE.email);
  gate('acc-sessions-section', SELF_SERVICE.signOutOthers);
}

function accClearPwFields(){
  ['acc-cur-pw','acc-new-pw','acc-new-pw2'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
}
function accMsg(id, text, ok){
  const e = document.getElementById(id); if(!e) return;
  e.textContent = text || ''; e.style.display = text ? 'block' : 'none';
  e.style.color = ok ? 'var(--green)' : 'var(--red)';
}

// ── Authenticated PASSWORD CHANGE ──
let _accPwBusy = false;
async function accChangePassword(){
  if(_accPwBusy) return;                              // block double submit
  if(!SELF_SERVICE.password){ accMsg('acc-pw-msg','Parol o\'zgartirish hozircha o\'chirilgan', false); return; }
  const cur = (document.getElementById('acc-cur-pw')||{}).value || '';
  const neu = (document.getElementById('acc-new-pw')||{}).value || '';
  const neu2 = (document.getElementById('acc-new-pw2')||{}).value || '';
  accMsg('acc-pw-msg','', false);
  if(!cur || !neu || !neu2){ accMsg('acc-pw-msg','Barcha maydonlarni to\'ldiring', false); return; }
  if(neu.length < PASSWORD_MIN){ accMsg('acc-pw-msg','Yangi parol kamida '+PASSWORD_MIN+' belgidan iborat bo\'lsin', false); return; }
  if(neu !== neu2){ accMsg('acc-pw-msg','Yangi parollar mos kelmadi', false); return; }
  if(neu === cur){ accMsg('acc-pw-msg','Yangi parol eskisidan farq qilishi kerak', false); return; }

  _accPwBusy = true;
  const btn = document.getElementById('acc-pw-btn'); const orig = btn ? btn.textContent : null;
  if(btn){ btn.disabled = true; btn.textContent = 'Saqlanmoqda...'; }
  try {
    // Re-authenticate with the CURRENT password (do not trust a client-only flag).
    const re = await sb.auth.signInWithPassword({ email: currentUser.email, password: cur });
    if(re && re.error){ accMsg('acc-pw-msg','Joriy parol noto\'g\'ri', false); return; }
    const up = await sb.auth.updateUser({ password: neu });
    if(up && up.error){ accMsg('acc-pw-msg', saveErrorMessage(up.error) || 'Parolni yangilashda xato', false); return; }
    accMsg('acc-pw-msg','✅ Parol yangilandi', true);
  } catch(e){
    // generic, safe error — never echo password or raw internals
    accMsg('acc-pw-msg','Xatolik yuz berdi. Qayta urinib ko\'ring yoki qayta kiring.', false);
  } finally {
    accClearPwFields();                                // clear secrets from DOM immediately
    if(btn){ btn.disabled = false; btn.textContent = orig; }
    _accPwBusy = false;
  }
}

// ── EMAIL CHANGE (GATED) ──
let _accEmailBusy = false;
async function accRequestEmailChange(){
  if(!SELF_SERVICE.email){ accMsg('acc-email-msg','Email o\'zgartirish administrator sozlamasidan keyin yoqiladi', false); return; }
  if(_accEmailBusy) return;
  const neu = ((document.getElementById('acc-new-email')||{}).value || '').trim().toLowerCase();
  const cur = (document.getElementById('acc-email-pw')||{}).value || '';
  accMsg('acc-email-msg','', false);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neu)){ accMsg('acc-email-msg','Email formati noto\'g\'ri', false); return; }
  if(neu === (currentUser.email||'').toLowerCase()){ accMsg('acc-email-msg','Bu allaqachon joriy email', false); return; }
  if(!cur){ accMsg('acc-email-msg','Joriy parolni kiriting', false); return; }
  _accEmailBusy = true;
  try {
    const re = await sb.auth.signInWithPassword({ email: currentUser.email, password: cur });
    if(re && re.error){ accMsg('acc-email-msg','Joriy parol noto\'g\'ri', false); return; }
    // Secure double-confirmation flow (Auth sends confirmation to BOTH addresses).
    const up = await sb.auth.updateUser({ email: neu }, { emailRedirectTo: accRedirectUrl() });
    if(up && up.error){ accMsg('acc-email-msg','Emailni yangilab bo\'lmadi', false); return; } // no account-existence leak
    accMsg('acc-email-msg','Tasdiqlash xati eski va yangi emailga yuborildi. Ikkalasini ham tasdiqlagach yangi email faollashadi. UUID/rol/tarix o\'zgarmaydi.', true);
  } catch(e){ accMsg('acc-email-msg','Xatolik yuz berdi. Qayta urinib ko\'ring.', false); }
  finally { const p=document.getElementById('acc-email-pw'); if(p) p.value=''; _accEmailBusy = false; }
}

// ── PASSWORD RECOVERY (login screen; GATED) ──
async function accForgotPassword(){
  const email = ((document.getElementById('login-email')||{}).value || '').trim().toLowerCase();
  if(!SELF_SERVICE.recovery){ showNotify('Parolni tiklash administrator sozlamasidan keyin yoqiladi'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showNotify('Avval emailingizni kiriting'); return; }
  try { await sb.auth.resetPasswordForEmail(email, { redirectTo: accRedirectUrl() }); } catch(e){}
  // generic response — never reveal whether an account exists
  showNotify('Agar bu email tizimda bo\'lsa, tiklash havolasi yuborildi.');
}

// ── SIGN OUT OTHER SESSIONS (GATED) ──
async function accSignOutOthers(){
  if(!SELF_SERVICE.signOutOthers){ showNotify('Bu imkoniyat hozircha mavjud emas'); return; }
  try { await sb.auth.signOut({ scope: 'others' }); showNotify('Boshqa qurilmalardan chiqildi'); }
  catch(e){ showNotify('Bajarib bo\'lmadi'); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SELF_SERVICE, PASSWORD_MIN, accRedirectUrl };
}
