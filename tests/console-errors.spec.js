// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * CONSOLE VA NETWORK XATO TESTLAR
 * Login qilmasdan:
 *   - sahifa yuklanadi
 *   - JS xatolari yo'q
 * Login qilib:
 *   - panellar ochilganda xato yo'q
 *   - network 400/404/500 log qilinadi
 */

// Muhim xatolar — bular FAIL qiladi
const CRITICAL_ERRORS = [
  /ReferenceError/i,
  /TypeError/i,
  /SyntaxError/i,
  /Uncaught/i,
  /is not defined/i,
  /Cannot read properties/i,
  /Cannot set properties/i,
];

// E'tiborsiz xatolar — bular FAIL qilmaydi
const IGNORED_ERRORS = [
  /favicon/i,
  /manifest\.json/i,
  /Not allowed to load local resource/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /net::ERR_ABORTED/i,
  /CORS/i,            // Login qilinmagan holda Supabase CORS — kutilgan
];

function isCritical(msg) {
  if (IGNORED_ERRORS.some(re => re.test(msg))) return false;
  return CRITICAL_ERRORS.some(re => re.test(msg));
}

test.describe('Console va Network — Login qilinmagan holat', () => {

  test('sahifa yuklanishida kritik JS xato yo\'q', async ({ page }) => {
    const criticalErrors = [];
    const networkErrors  = [];

    page.on('pageerror', err => {
      const msg = err.message || String(err);
      if (isCritical(msg)) criticalErrors.push(msg);
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (isCritical(text)) criticalErrors.push(text);
      }
    });

    page.on('response', resp => {
      const status = resp.status();
      const url    = resp.url();
      if (status >= 400 && !url.includes('favicon') && !url.includes('manifest')) {
        networkErrors.push(`HTTP ${status}: ${url}`);
      }
    });

    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Kritik JS xatolar bo'lmasligi
    if (criticalErrors.length > 0) {
      console.log('KRITIK XATOLAR:', criticalErrors);
    }
    expect(criticalErrors, `Kritik JS xatolar: ${criticalErrors.join('\n')}`).toHaveLength(0);

    // Network xatolar log qilinadi (fail qilmaydi, faqat yoziladi)
    if (networkErrors.length > 0) {
      console.warn('Network xatolar (login qilinmagan holda kutilgan bo\'lishi mumkin):');
      networkErrors.forEach(e => console.warn(' -', e));
    }
  });

  test('barcha JS fayllar 200 qaytaradi', async ({ page }) => {
    const failedScripts = [];

    page.on('response', resp => {
      const url    = resp.url();
      const status = resp.status();
      if ((url.includes('.js') || url.includes('.css')) && status >= 400) {
        failedScripts.push(`${status}: ${url}`);
      }
    });

    await page.goto('');
    await page.waitForLoadState('networkidle');

    expect(failedScripts, `Yuklanmagan fayllar:\n${failedScripts.join('\n')}`).toHaveLength(0);
  });

  test('AppStore va asosiy funksiyalar aniqlanadi', async ({ page }) => {
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const checks = await page.evaluate(() => {
      return {
        AppStore:       typeof AppStore !== 'undefined',
        fmt:            typeof fmt !== 'undefined',
        showPanel:      typeof showPanel !== 'undefined',
        showNotify:     typeof showNotify !== 'undefined',
        safeInitPanel:  typeof safeInitPanel !== 'undefined',
        getFoiz:        typeof getFoiz !== 'undefined',
        loadSklad:      typeof loadSklad !== 'undefined',
        renderFoizTable:typeof renderFoizTable !== 'undefined',
      };
    });

    const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    expect(missing, `Aniqlanmagan funksiyalar: ${missing.join(', ')}`).toHaveLength(0);
  });
});

test.describe('Console va Network — Login qilingan holat', () => {

  test.beforeEach(async ({ page }) => {
    const email    = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) { test.skip(); return; }

    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('input[type="email"], #email').first().fill(email);
    await page.locator('input[type="password"], #password').first().fill(password);
    await page.locator('button[onclick*="doLogin"]').first().click();
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 15_000 });

    // Yoriq screendan o'tish
    const yoriqBtn = page.locator('#admin-agree-btn, button[onclick*="enterAdminApp"]').first();
    if (await yoriqBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const chk = page.locator('#admin-agree-chk').first();
      if (await chk.isVisible()) await chk.check();
      await yoriqBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('panel ochilishida kritik xato yo\'q', async ({ page }) => {
    const criticalErrors  = [];
    const networkFailures = [];

    page.on('pageerror', err => {
      const msg = err.message || '';
      if (isCritical(msg)) criticalErrors.push(msg);
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (isCritical(text)) criticalErrors.push(text);
      }
    });

    page.on('response', resp => {
      const status = resp.status();
      const url    = resp.url();
      if (status === 400 || status === 404 || status === 500) {
        networkFailures.push(`HTTP ${status}: ${url.slice(0, 120)}`);
        if (status === 400 || status === 500) {
          console.warn(`[NETWORK] ${status}:`, url);
        }
      }
    });

    // Asosiy panellarni ochish
    const panelsToTest = [
      '#nb-dashboard, [onclick*="showPanel(\'dashboard\')"]',
      '#nb-tarix, [onclick*="showPanel(\'tarix\')"]',
      '#nb-kalk, [onclick*="showPanel(\'kalk\')"]',
      '#nb-foiz, [onclick*="showPanel(\'foiz\')"]',
    ];

    for (const sel of panelsToTest) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    }

    // Kritik JS xatolar tekshiruvi
    expect(criticalErrors, `Kritik xatolar:\n${criticalErrors.join('\n')}`).toHaveLength(0);

    // Network xatolar faqat log (FAIL qilmaydi — Supabase RLS sabab ba'zan 4xx bo'lishi mumkin)
    if (networkFailures.length > 0) {
      console.log(`[INFO] Network ${networkFailures.length} xato (RLS/auth bilan bog'liq bo'lishi mumkin):`);
      networkFailures.forEach(e => console.log(' -', e));
    }
  });

  test('Telegram so\'rovlari mock qilinganda real xabar ketmaydi', async ({ page }) => {
    let realTgCall = false;

    // Haqiqiy Telegram API ni block qilish
    await page.route('**/api.telegram.org/**', async route => {
      realTgCall = true;
      await route.abort();
    });

    // Webhook mock
    await page.route('**/*.vercel.app/api/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    // Bu test faqat kuzatish — agar real TG call ketsa warn
    await page.waitForTimeout(2000);
    if (realTgCall) {
      console.warn('[WARN] Sahifa yuklanganda real Telegram API ga so\'rov ketdi!');
    }
    // Fail qilmaydi — faqat warning
  });
});
