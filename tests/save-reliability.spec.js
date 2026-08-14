// @ts-check
const { test, expect } = require('@playwright/test');

async function openAppCode(page) {
  await page.goto('');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    currentUser = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com' };
    currentRole = 'admin';
    window.loadHistory = async () => {};
  });
}

test.describe('Hisobot/zakaz save reliability', () => {
  test.beforeEach(async ({ page }) => openAppCode(page));

  test('6 ta rapid click faqat bitta INSERT oqimini boshlaydi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let calls = 0;
      let release;
      const delayed = new Promise(resolve => { release = resolve; });
      window.createHistoryItem = async () => {
        calls++;
        await delayed;
        return { id: 101 };
      };
      adD = [{ nom: 'Rapid click test', sum: '100000', bonus_50: false }];
      renderAdmin();

      const attempts = Array.from({ length: 6 }, () => saveOnly('admin'));
      await new Promise(resolve => setTimeout(resolve, 50));
      const disabledWhileSaving = document.getElementById('admin-save-btn').disabled;
      release();
      await Promise.all(attempts);
      return {
        calls,
        disabledWhileSaving,
        disabledAfter: document.getElementById('admin-save-btn').disabled,
        stateLeft: ErpSaveFlow.states.has('history_create_admin'),
      };
    });

    expect(result).toEqual({ calls: 1, disabledWhileSaving: true, disabledAfter: false, stateLeft: false });
  });

  test('30 ta ketma-ket save: 30 click = 30 write, stuck va duplicate yo\'q', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let calls = 0;
      const operationIds = [];
      window.createHistoryItem = async (_row, options) => {
        calls++;
        operationIds.push(options.operationId);
        return { id: calls };
      };
      for (let i = 0; i < 30; i++) {
        adD = [{ nom: 'Stress ' + i, sum: String(100000 + i), bonus_50: false }];
        await saveOnly('admin');
      }
      return {
        calls,
        uniqueOperations: new Set(operationIds).size,
        disabled: document.getElementById('admin-save-btn').disabled,
        activeStates: [...ErpSaveFlow.states.values()].filter(state => state.active).length,
      };
    });

    expect(result.calls).toBe(30);
    expect(result.uniqueOperations).toBe(30);
    expect(result.disabled).toBe(false);
    expect(result.activeStates).toBe(0);
  });

  test('delayed success formani faqat javobdan keyin tozalaydi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let release;
      window.createHistoryItem = () => new Promise(resolve => { release = () => resolve({ id: 202 }); });
      adD = [{ nom: 'Delayed', sum: '200000', bonus_50: false }];
      const promise = saveOnly('admin');
      await new Promise(resolve => setTimeout(resolve, 30));
      const before = { value: adD[0].nom, disabled: document.getElementById('admin-save-btn').disabled };
      release();
      await promise;
      return { before, after: adD[0].nom, disabledAfter: document.getElementById('admin-save-btn').disabled };
    });

    expect(result.before).toEqual({ value: 'Delayed', disabled: true });
    expect(result.after).toBe('');
    expect(result.disabledAfter).toBe(false);
  });

  test('RLS/rejected requestdan keyin button va state idle holatiga qaytadi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      window.createHistoryItem = async () => {
        const error = new Error('row-level security policy');
        error.code = '42501';
        throw error;
      };
      adD = [{ nom: 'RLS', sum: '300000', bonus_50: false }];
      await saveOnly('admin');
      return {
        disabled: document.getElementById('admin-save-btn').disabled,
        ariaBusy: document.getElementById('admin-save-btn').getAttribute('aria-busy'),
        stateLeft: ErpSaveFlow.states.has('history_create_admin'),
        formPreserved: adD[0].nom,
      };
    });

    expect(result).toEqual({ disabled: false, ariaBusy: null, stateLeft: false, formPreserved: 'RLS' });
    await expect(page.locator('.toast', { hasText: /ruxsat yo'q/i })).toBeVisible();
  });

  test('never-settling request timeout bilan yakunlanadi, cheksiz kutmaydi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const started = performance.now();
      let kind = null;
      try {
        await runSupabaseRequest('test_save', 'insert', () => new Promise(() => {}), { timeoutMs: 80, write: true });
      } catch (error) {
        kind = error.erpKind;
      }
      return { kind, elapsed: performance.now() - started };
    });

    expect(result.kind).toBe('timeout');
    expect(result.elapsed).toBeGreaterThanOrEqual(70);
    expect(result.elapsed).toBeLessThan(1_000);
  });

  test('offline/ambiguous retry o\'sha operatsiyani reconcile qiladi, yangi forma esa yangi id oladi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const calls = [];
      window.createHistoryItem = async (_row, options) => {
        calls.push({ ...options });
        if (calls.length === 1) {
          const error = new TypeError('Failed to fetch');
          error.erpKind = 'network';
          error.erpAmbiguous = true;
          throw error;
        }
        return { id: 303 };
      };

      adD = [{ nom: 'Same payload', sum: '400000', bonus_50: false }];
      await saveOnly('admin');
      await saveOnly('admin');

      const firstId = calls[0].operationId;
      const retryId = calls[1].operationId;
      const sameRetry = calls[1].reconcileFirst;

      // Build a retained ambiguous state, then change the form payload. The
      // coordinator must not reconcile a different logical report.
      const button = document.getElementById('admin-save-btn');
      const first = ErpSaveFlow.begin('fingerprint_test', button);
      ErpSaveFlow.prepare(first, { rows: [{ nom: 'A' }] });
      const ambiguous = Object.assign(new Error('timeout'), { erpKind: 'timeout', erpAmbiguous: true });
      ErpSaveFlow.finish(first, 'error', ambiguous);
      const changed = ErpSaveFlow.begin('fingerprint_test', button);
      const retainedId = changed.operationId;
      ErpSaveFlow.prepare(changed, { rows: [{ nom: 'B' }] });
      const changedId = changed.operationId;
      const changedReconcile = changed.reconcileFirst;
      ErpSaveFlow.finish(changed, 'error', Object.assign(new Error('validation'), { erpKind: 'validation' }));

      return { firstId, retryId, sameRetry, retainedId, changedId, changedReconcile };
    });

    expect(result.retryId).toBe(result.firstId);
    expect(result.sameRetry).toBe(true);
    expect(result.changedId).not.toBe(result.retainedId);
    expect(result.changedReconcile).toBe(false);
  });

  test('token tugashiga yaqin bo\'lsa save oldidan session bir marta refresh qilinadi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalGetSession = sb.auth.getSession;
      const originalRefresh = sb.auth.refreshSession;
      let refreshCalls = 0;
      sb.auth.getSession = async () => ({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 5 } }, error: null,
      });
      sb.auth.refreshSession = async () => {
        refreshCalls++;
        return { data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null };
      };
      try {
        await ensureWritableSession('session_refresh_test');
        return { refreshCalls };
      } finally {
        sb.auth.getSession = originalGetSession;
        sb.auth.refreshSession = originalRefresh;
      }
    });

    expect(result.refreshCalls).toBe(1);
  });

  test('Admin, Ishlab chiqarish va Dizayner bir xil state protectiondan foydalanadi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const calls = [];
      window.createHistoryItem = async row => { calls.push(row.type); return { id: calls.length }; };

      currentRole = 'admin';
      adD = [{ nom: 'Admin', sum: '100000', bonus_50: true }];
      await saveOnly('admin');

      currentRole = 'ishlab';
      prD = [{ key: 'Futbolka DTF (old)', miq: '1', brak: '', ex: false }];
      uvD = []; ekoD = [];
      await saveOnly('ishlab');

      currentRole = 'dizayner';
      dizD = [{ nom: 'Dizayn', summa: '150000', tolovchi: 'offis', tolov: true, kontakt: '' }];
      await saveDizayner();

      return {
        calls,
        buttons: ['admin-save-btn', 'ishlab-save-btn', 'dizayner-save-btn'].map(id => document.getElementById(id).disabled),
      };
    });

    expect(result.calls).toEqual(['admin', 'ishlab', 'dizayner']);
    expect(result.buttons).toEqual([false, false, false]);
  });

  test('edit/update xatosi buttonni stuck qoldirmaydi va ma\'lumotni saqlab qoladi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      allHistory = [{
        id: 77, type: 'admin', user_email: 'test@example.com',
        data: { rows: [{ nom: 'Edit', sum: '100000', bonus_50: false }] },
      }];
      editingHistoryId = 77;
      editingHistoryData = JSON.parse(JSON.stringify(allHistory[0].data));
      document.getElementById('edit-history-modal').classList.remove('hidden');
      window.updateHistoryItem = async () => { throw Object.assign(new Error('simulated 500'), { status: 500 }); };
      await saveEditedHistory();
      return {
        disabled: document.getElementById('history-edit-save-btn').disabled,
        editingHistoryId,
        modalOpen: !document.getElementById('edit-history-modal').classList.contains('hidden'),
      };
    });

    expect(result).toEqual({ disabled: false, editingHistoryId: 77, modalOpen: true });
  });
});

test.describe('Login error classification', () => {
  test.beforeEach(async ({ page }) => openAppCode(page));

  test('invalid credential va network xatosi bir xil xabar bo\'lib ko\'rinmaydi', async ({ page }) => {
    const messages = await page.evaluate(async () => {
      document.getElementById('login-email').value = 'user@example.com';
      document.getElementById('login-pass').value = 'password';
      const original = sb.auth.signInWithPassword;

      sb.auth.signInWithPassword = async () => ({ data: null, error: { message: 'Invalid login credentials', status: 400 } });
      await doLogin();
      const credentials = document.getElementById('login-error').textContent;

      sb.auth.signInWithPassword = async () => { throw new TypeError('Failed to fetch'); };
      await doLogin();
      const network = document.getElementById('login-error').textContent;
      const buttonRestored = !document.getElementById('login-btn').disabled;
      sb.auth.signInWithPassword = original;
      return { credentials, network, buttonRestored };
    });

    expect(messages.credentials).toMatch(/parol noto'g'ri/i);
    expect(messages.network).toMatch(/Internet|DNS/i);
    expect(messages.network).not.toBe(messages.credentials);
    expect(messages.buttonRestored).toBe(true);
  });

  test('init va SIGNED_IN bir vaqtda kelsa profile faqat bir marta yuklanadi', async ({ page }) => {
    const result = await page.evaluate(async () => {
      let roleCalls = 0;
      currentUser = { id: '00000000-0000-4000-8000-000000000002', email: 'race@example.com' };
      sessionStorage.setItem('admin_yoriq_' + currentUser.id, '1');
      window.resolveCurrentRole = async () => {
        roleCalls++;
        await new Promise(resolve => setTimeout(resolve, 80));
        return 'admin';
      };
      window.loadHistory = async () => [];
      await Promise.all([onLogin(), onLogin()]);
      // A later duplicate SIGNED_IN event must also be ignored after the
      // first setup completed successfully.
      await onLogin();
      return {
        roleCalls,
        appVisible: !document.getElementById('app-screen').classList.contains('hidden'),
        loginHidden: document.getElementById('login-screen').classList.contains('hidden'),
      };
    });

    expect(result).toEqual({ roleCalls: 1, appVisible: true, loginHidden: true });
  });
});
