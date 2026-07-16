// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/login');

/**
 * Regression test for the enterAdminApp() dashboard-override race
 * (js/auth.js, app-config.js): loadHistory() used to call
 * showPanel('dashboard') once it resolved, unconditionally snapping the
 * user back to Dashboard even if they had already navigated elsewhere
 * while the fetch was still in flight. Delaying the real `zakazlar`
 * request here reproduces that race deterministically against the real
 * app — no production code is touched by this test.
 */
test('boshqa panelga o\'tilgandan keyin loadHistory tugasa ham panel o\'zgarmasligi kerak', async ({ page }) => {
  await page.route('**/rest/v1/zakazlar*', async route => {
    await new Promise(resolve => setTimeout(resolve, 2_500));
    await route.continue();
  });

  const ok = await loginAsAdmin(page);
  if (!ok) {
    test.skip(true, 'ADMIN_EMAIL yoki ADMIN_PASSWORD env variable yo\'q');
    return;
  }

  // loadHistory() hali (2.5s kechikish bilan) javob kutayotgan paytda
  // boshqa panelga o'tamiz.
  await page.locator('#nb-tarix, [onclick*="showPanel(\'tarix\')"]').first().click();
  await expect(page.locator('#panel-tarix')).toBeVisible({ timeout: 5_000 });

  // loadHistory() tugashi uchun yetarlicha kutamiz (2.5s kechikish + zaxira).
  await page.waitForTimeout(3_500);

  // Panel Dashboard'ga majburan qaytarilmagan bo'lishi kerak.
  await expect(page.locator('#panel-tarix')).toBeVisible();
  await expect(page.locator('#panel-dashboard')).toBeHidden();
});
