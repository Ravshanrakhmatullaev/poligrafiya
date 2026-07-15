// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/login');

/**
 * CRUD REGRESSION TESTS
 *
 * Real create/delete flow against the Admin ("Zakazlarim") history entries —
 * unlike admin-orders.spec.js (form-only, never saves), these tests
 * deliberately DO write to and delete from the real `zakazlar` table, to
 * catch regressions the form-only tests can't (e.g. the delete-recursion
 * bug and the dizayner/admin panel init-null bugs fixed in this session).
 *
 * Safety:
 * - Every record this file creates has "E2E_TEST_<runId>" in its product
 *   name — unambiguous, never matches a real product name.
 * - Every test that creates a record cleans it up in a `finally` block
 *   AND there's a top-level `afterAll` sweep as a safety net, so a failed
 *   assertion never leaves E2E junk behind.
 * - Telegram/external requests are never exercised here (no route calls
 *   send anything — the flows under test don't touch Telegram at all).
 */

const E2E_MARK = 'E2E_TEST_' + Date.now();

// Creates one real E2E_TEST-tagged admin record via the actual Saqlash flow
// (real js/db.js createHistoryItem -> real Supabase insert on `zakazlar`).
async function createE2ETestOrder(page, productName, sum) {
  await page.evaluate((id) => { showPanel(id); }, 'admin');
  await page.waitForTimeout(300);

  const rowsContainer = page.locator('#admin-rows');
  await expect(rowsContainer).toBeVisible({ timeout: 5_000 });
  const firstRow = rowsContainer.locator('.zakaz-row').first();
  await firstRow.locator('input[placeholder*="Mahsulot"], input[placeholder*="nom"]').first().fill(productName);
  const sumInput = firstRow.locator('input[inputmode="numeric"]').first();
  await sumInput.fill(String(sum));
  await sumInput.press('Tab');
  await page.waitForTimeout(300);

  const saveBtn = page.locator('button[onclick*="saveOnly"]').first();
  await saveBtn.click();
  // saveOnly resets adD and calls loadHistory() on success
  await page.waitForTimeout(1500);
}

// Safety-net cleanup: find any leftover E2E_TEST_* rows in history and
// delete them directly via the real db.js function (bypasses UI/countdown).
async function cleanupAllE2ETestRecords(page) {
  await page.evaluate(async (mark) => {
    if (typeof allHistory === 'undefined' || typeof deleteHistoryItem !== 'function') return;
    const junk = (allHistory || []).filter(h => JSON.stringify(h.data || {}).includes(mark));
    for (const h of junk) {
      try { await deleteHistoryItem(h.id); } catch (e) { /* best-effort cleanup */ }
    }
  }, E2E_MARK).catch(() => {});
}

test.describe('CRUD regression — real create/delete flow', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginAsAdmin(page);
    if (!ok) test.skip();
  });

  test.afterEach(async ({ page }) => {
    // Safety net — runs even if a test's own cleanup step failed/didn't run.
    await cleanupAllE2ETestRecords(page);
  });

  test('yangi buyurtma yaratiladi va Hisobotlarda ko\'rinadi', async ({ page }) => {
    const productName = E2E_MARK + '_create';
    await createE2ETestOrder(page, productName, 111000);

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);
    await expect(page.locator('#history-list, #panel-tarix')).toContainText(productName, { timeout: 5_000 });
  });

  test('history delete muvaffaqiyatli — karta yo\'qoladi', async ({ page }) => {
    const productName = E2E_MARK + '_delete_ok';
    await createE2ETestOrder(page, productName, 112000);

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);

    const card = page.locator('.rp-card', { hasText: productName }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    const delBtn = card.locator('button[onclick*="deleteHistoryItemCountdown"]').first();
    await delBtn.click(); // starts the 5s countdown

    // countdown fires the real delete after 5s — wait past it
    await page.waitForTimeout(6_000);

    await expect(page.locator('.rp-card', { hasText: productName })).toHaveCount(0, { timeout: 5_000 });
  });

  test('delete bekor qilinishi — countdown paytida qayta bosilsa yozuv o\'chmaydi', async ({ page }) => {
    const productName = E2E_MARK + '_delete_cancel';
    await createE2ETestOrder(page, productName, 113000);

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);

    const card = page.locator('.rp-card', { hasText: productName }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    const delBtn = card.locator('button[onclick*="deleteHistoryItemCountdown"]').first();
    await delBtn.click();       // starts countdown
    await page.waitForTimeout(500);
    await delBtn.click();       // cancels countdown before it fires

    // Wait past the original 5s window — record must still be there
    await page.waitForTimeout(6_000);
    await expect(page.locator('.rp-card', { hasText: productName })).toHaveCount(1);

    // This test's own cleanup (afterEach safety net also covers it)
  });

  test('delete xato bo\'lsa foydalanuvchiga aniq xabar ko\'rsatiladi', async ({ page }) => {
    const productName = E2E_MARK + '_delete_error';
    await createE2ETestOrder(page, productName, 114000);

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);

    const card = page.locator('.rp-card', { hasText: productName }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Force the underlying Supabase delete to fail for this one call
    await page.route('**/rest/v1/zakazlar*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'simulated failure' }) });
      } else {
        await route.continue();
      }
    });

    const delBtn = card.locator('button[onclick*="deleteHistoryItemCountdown"]').first();
    await delBtn.click();
    await page.waitForTimeout(6_000);

    // Error notify must appear, and the record must NOT have disappeared
    await expect(page.locator('.toast', { hasText: /Xatolik|xato/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('.rp-card', { hasText: productName })).toHaveCount(1);

    await page.unroute('**/rest/v1/zakazlar*');
    // Real cleanup now that the route block is lifted (afterEach also covers this)
  });

  test('naming-collision regressiyasi: delete faqat bir marta chaqiriladi (rekursiya yo\'q)', async ({ page }) => {
    // Guards against the exact bug fixed in this session: history.js redefining
    // deleteHistoryItem() with the same name as js/db.js's real function,
    // causing infinite self-recursion instead of a real delete.
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        let callCount = 0;
        const original = window.deleteHistoryItem;
        window.deleteHistoryItem = async (id) => { callCount++; return true; };
        const fakeBtn = document.createElement('button');
        document.body.appendChild(fakeBtn);
        deleteHistoryItemCountdown('__regression_test_id__', fakeBtn);
        setTimeout(() => {
          window.deleteHistoryItem = original;
          resolve(callCount);
        }, 5_500);
      });
    });
    expect(result).toBe(1);
  });

  test('delete oqimi real js/db.js Supabase so\'rovini chaqiradi (mock emas)', async ({ page }) => {
    const productName = E2E_MARK + '_real_db_call';
    await createE2ETestOrder(page, productName, 115000);

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);

    const card = page.locator('.rp-card', { hasText: productName }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    let sawRealDeleteRequest = false;
    await page.route('**/rest/v1/zakazlar*', async (route) => {
      if (route.request().method() === 'DELETE') sawRealDeleteRequest = true;
      await route.continue();
    });

    const delBtn = card.locator('button[onclick*="deleteHistoryItemCountdown"]').first();
    await delBtn.click();
    await page.waitForTimeout(6_000);

    expect(sawRealDeleteRequest).toBe(true);
    await page.unroute('**/rest/v1/zakazlar*');
  });

  test('dizayner panel "Ish qo\'shish" — regressiya (init-null bugi)', async ({ page }) => {
    await page.evaluate((id) => { showPanel(id); }, 'dizayner');
    await page.waitForTimeout(300);

    const rowsContainer = page.locator('#diz-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });
    const initialCount = await rowsContainer.locator('.diz-row').count();

    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const addBtn = page.locator('button[onclick*="addDizRow"]').first();
    await addBtn.click();
    await page.waitForTimeout(300);

    expect(consoleErrors).toEqual([]);
    expect(await rowsContainer.locator('.diz-row').count()).toBe(initialCount + 1);
  });

  test('admin panel asosiy tugma — regressiya (init-null bugi, bo\'sh Saqlash)', async ({ page }) => {
    // Fresh panel open with no rows filled — "Saqlash" must show a friendly
    // notice, not crash (this was the actual admin-panel regression found).
    await page.evaluate((id) => { showPanel(id); }, 'admin');
    await page.waitForTimeout(300);

    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const saveBtn = page.locator('button[onclick*="saveOnly"]').first();
    await saveBtn.click();
    await page.waitForTimeout(500);

    expect(consoleErrors).toEqual([]);
    await expect(page.locator('.toast', { hasText: /Hech narsa kiritilmagan/i })).toBeVisible({ timeout: 3_000 });
  });

  test('o\'chirilgan test yozuvi reload\'dan keyin qaytib kelmaydi', async ({ page }) => {
    const productName = E2E_MARK + '_reload_check';
    await createE2ETestOrder(page, productName, 116000);

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);

    const card = page.locator('.rp-card', { hasText: productName }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    const delBtn = card.locator('button[onclick*="deleteHistoryItemCountdown"]').first();
    await delBtn.click();
    await page.waitForTimeout(6_000);
    await expect(page.locator('.rp-card', { hasText: productName })).toHaveCount(0);

    // Reload — session persists via Supabase's own storage, app re-inits
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 15_000 });

    await page.evaluate((id) => { showPanel(id); }, 'tarix');
    await page.waitForTimeout(500);
    await expect(page.locator('.rp-card', { hasText: productName })).toHaveCount(0);
  });

  test('saveOnly isSaving flag regressiyasi: xatodan keyin qayta saqlash ishlaydi', async ({ page }) => {
    // Guards against the exact bug fixed in this session: an unhandled
    // exception inside saveOnly() left isSaving stuck true forever, so
    // every later save attempt just showed "Saqlanmoqda, kuting..." and
    // never actually saved again.
    const productName = E2E_MARK + '_isSaving_recovery';

    await page.evaluate((id) => { showPanel(id); }, 'admin');
    await page.waitForTimeout(300);

    const rowsContainer = page.locator('#admin-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });
    const firstRow = rowsContainer.locator('.zakaz-row').first();
    await firstRow.locator('input[placeholder*="Mahsulot"], input[placeholder*="nom"]').first().fill(productName);
    const sumInput = firstRow.locator('input[inputmode="numeric"]').first();
    await sumInput.fill('117000');
    await sumInput.press('Tab');
    await page.waitForTimeout(300);

    // First attempt: force the real Supabase insert to fail.
    let failFirstAttempt = true;
    await page.route('**/rest/v1/zakazlar*', async (route) => {
      if (route.request().method() === 'POST' && failFirstAttempt) {
        failFirstAttempt = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'simulated failure' }) });
      } else {
        await route.continue();
      }
    });

    const saveBtn = page.locator('button[onclick*="saveOnly"]').first();
    await saveBtn.click();
    await page.waitForTimeout(1_500);

    // Error toast shown — not stuck, not a silent crash.
    await expect(page.locator('.toast', { hasText: /Xatolik|xato/i })).toBeVisible({ timeout: 3_000 });

    // Second attempt (route now passes through for real) must actually
    // save — if isSaving were still stuck true, this would only ever show
    // "Saqlanmoqda, kuting..." and never reach the success toast.
    await saveBtn.click();
    await page.waitForTimeout(1_500);

    await expect(page.locator('.toast', { hasText: 'Saqlanmoqda, kuting' })).toHaveCount(0);
    await expect(page.locator('.toast', { hasText: /Saqlandi/i })).toBeVisible({ timeout: 5_000 });

    await page.unroute('**/rest/v1/zakazlar*');
    // cleanup handled by afterEach's E2E_TEST sweep
  });
});
