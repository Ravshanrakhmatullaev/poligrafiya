// @ts-check
// Self-service account security: feature gating, profile render (own data only,
// role read-only), and the password-change flow (stubbed sb.auth — validates
// client logic, NOT real Supabase Auth). No service-role key in the bundle.
const { test, expect } = require('@playwright/test');

test.describe('Account self-service security', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForLoadState('domcontentloaded'); });

  test('publishable key only — no service-role secret in bundle', async ({ page }) => {
    const r = await page.evaluate(() => ({
      keyPrefix: (typeof SUPABASE_KEY === 'string') ? SUPABASE_KEY.slice(0, 15) : null,
    }));
    expect(r.keyPrefix).toBe('sb_publishable_');
  });

  test('feature gating: password ON, email+recovery OFF', async ({ page }) => {
    const f = await page.evaluate(() => ({ ...SELF_SERVICE, min: PASSWORD_MIN }));
    expect(f.password).toBe(true);
    expect(f.email).toBe(false);
    expect(f.recovery).toBe(false);
    expect(f.min).toBe(8);
  });

  test('anonymous: app screen hidden, login shown, forgot link present', async ({ page }) => {
    const r = await page.evaluate(() => ({
      login: !document.getElementById('login-screen').classList.contains('hidden'),
      appHidden: document.getElementById('app-screen')?.classList.contains('hidden'),
      forgot: !!document.getElementById('forgot-pw-link'),
    }));
    expect(r.login).toBe(true);
    expect(r.appHidden).toBe(true);
    expect(r.forgot).toBe(true);
  });

  test('profile renders own email + read-only role; email section gated', async ({ page }) => {
    const r = await page.evaluate(() => {
      currentUser = { id: 'u1', email: 'ra.ravshan1998+abror@gmail.com' }; currentRole = 'admin';
      showScreen('app'); showPanel('account');
      const sec = document.getElementById('acc-email-section');
      return {
        email: document.getElementById('acc-email').textContent,
        role: document.getElementById('acc-role').textContent,
        roleTag: document.getElementById('acc-role').tagName,   // not INPUT => read-only
        pwForm: !!(document.getElementById('acc-cur-pw') && document.getElementById('acc-new-pw') && document.getElementById('acc-pw-btn')),
        gatedNoteVisible: sec.querySelector('[data-gated-note]').style.display !== 'none',
        gatedBodyHidden: sec.querySelector('[data-gated-body]').style.display === 'none',
        panelLaidOut: document.getElementById('panel-account').offsetHeight > 0,
        atCount: (document.getElementById('panel-account').innerText.match(/@/g) || []).length,
      };
    });
    expect(r.email).toBe('ra.ravshan1998+abror@gmail.com');
    expect(r.role).toBe('Admin');
    expect(r.roleTag).not.toBe('INPUT');
    expect(r.pwForm).toBe(true);
    expect(r.gatedNoteVisible).toBe(true);
    expect(r.gatedBodyHidden).toBe(true);
    expect(r.panelLaidOut).toBe(true);
    expect(r.atCount).toBeLessThanOrEqual(1); // only the current user's own email
  });

  test('password change: reauth + updateUser, wrong-current blocked, fields cleared, no password logged', async ({ page }) => {
    const r = await page.evaluate(async () => {
      currentUser = { id: 'u1', email: 'ra.ravshan1998+abror@gmail.com' }; currentRole = 'admin';
      showScreen('app'); showPanel('account');
      const logs = []; const calls = [];
      const _log = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
      // stub sb.auth (NOT real Auth): first signIn is wrong, then correct
      let signInOk = false;
      sb.auth.signInWithPassword = async () => { calls.push('signIn'); return signInOk ? { error: null } : { error: { message: 'Invalid login credentials' } }; };
      sb.auth.updateUser = async (a) => { calls.push('updateUser:' + Object.keys(a).join(',')); return { error: null }; };
      const setv = (id, v) => { document.getElementById(id).value = v; };
      // wrong current password
      setv('acc-cur-pw', 'wrongpw'); setv('acc-new-pw', 'newpass12'); setv('acc-new-pw2', 'newpass12');
      await accChangePassword();
      const afterWrong = { msg: document.getElementById('acc-pw-msg').textContent, updateCalled: calls.some(c => c.startsWith('updateUser')), curCleared: document.getElementById('acc-cur-pw').value === '' };
      // correct current password
      signInOk = true; calls.length = 0;
      setv('acc-cur-pw', 'correctpw'); setv('acc-new-pw', 'newpass12'); setv('acc-new-pw2', 'newpass12');
      await accChangePassword();
      const afterOk = { msg: document.getElementById('acc-pw-msg').textContent, reauth: calls.includes('signIn'), update: calls.includes('updateUser:password'), cleared: document.getElementById('acc-new-pw').value === '' };
      console.log = _log;
      return { afterWrong, afterOk, leaked: /newpass12|correctpw|wrongpw/.test(logs.join('\n')) };
    });
    expect(r.afterWrong.msg).toMatch(/Joriy parol noto/);
    expect(r.afterWrong.updateCalled).toBe(false);
    expect(r.afterWrong.curCleared).toBe(true);
    expect(r.afterOk.reauth).toBe(true);
    expect(r.afterOk.update).toBe(true);
    expect(r.afterOk.msg).toMatch(/yangilandi/);
    expect(r.afterOk.cleared).toBe(true);
    expect(r.leaked).toBe(false);
  });
});
