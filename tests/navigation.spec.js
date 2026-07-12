// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * NAVIGATSIYA TESTLAR
 * Admin akkaunt bilan barcha panellarni tekshiradi
 */

// Login helper — har testda qayta yozmaslik uchun
async function loginAsAdmin(page) {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return false;

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[type="email"], #email').first().fill(email);
  await page.locator('input[type="password"], #password').first().fill(password);
  await page.locator('button[onclick*="doLogin"]').first().click();
  await expect(page.locator('#app-screen')).toBeVisible({ timeout: 15_000 });
  return true;
}

test.describe('Navigatsiya — Admin rol', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginAsAdmin(page);
    if (!ok) test.skip();
  });

  test('Dashboard paneli ochiladi', async ({ page }) => {
    await page.locator('#nb-dashboard, [onclick*="showPanel(\'dashboard\')"]').first().click();
    await page.waitForTimeout(1000);

    const panel = page.locator('#panel-dashboard');
    await expect(panel).toBeVisible({ timeout: 8_000 });
    // Bo'sh qolmasligi — ichida biror kontent bor
    await expect(panel).not.toBeEmpty();
  });

  test('Hisobotlar paneli ochiladi', async ({ page }) => {
    await page.locator('#nb-tarix, [onclick*="showPanel(\'tarix\')"]').first().click();
    await page.waitForTimeout(1000);

    const panel = page.locator('#panel-tarix');
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel).not.toBeEmpty();
  });

  test('Xabarlar paneli ochiladi', async ({ page }) => {
    await page.locator('#nb-xabarlar, [onclick*="showPanel(\'xabarlar\')"]').first().click();
    await page.waitForTimeout(1000);

    const panel = page.locator('#panel-xabarlar');
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel).not.toBeEmpty();
  });

  test('Sklad paneli ochiladi', async ({ page }) => {
    const btn = page.locator('#nb-sklad, [onclick*="showPanel(\'sklad\')"]').first();
    if (!(await btn.isVisible())) {
      test.skip(true, 'Bu rol uchun Sklad menyu ko\'rinmaydi');
      return;
    }
    await btn.click();
    await page.waitForTimeout(1500);

    const panel = page.locator('#panel-sklad');
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel).not.toBeEmpty();
  });

  test('Kalkulyator paneli ochiladi', async ({ page }) => {
    await page.locator('#nb-kalk, [onclick*="showPanel(\'kalk\')"]').first().click();
    await page.waitForTimeout(500);

    const panel = page.locator('#panel-kalk');
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel).not.toBeEmpty();
  });

  test('Bozorlik paneli ochiladi', async ({ page }) => {
    await page.locator('#nb-bozorlik, [onclick*="showPanel(\'bozorlik\')"]').first().click();
    await page.waitForTimeout(1000);

    const panel = page.locator('#panel-bozorlik');
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel).not.toBeEmpty();
  });

  test('Foiz jadvali paneli ochiladi va jadval render bo\'ladi', async ({ page }) => {
    await page.locator('#nb-foiz, [onclick*="showPanel(\'foiz\')"]').first().click();
    await page.waitForTimeout(1000);

    const panel = page.locator('#panel-foiz');
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // Foiz jadvali render bo'lishi kerak
    const tbody = page.locator('#foiz-tbody');
    await expect(tbody).not.toBeEmpty({ timeout: 5_000 });
  });

  test('panellar 3 marta ketma-ket ochilganda ham ishlaydi', async ({ page }) => {
    const panels = [
      ['#nb-dashboard, [onclick*="showPanel(\'dashboard\')"]',  '#panel-dashboard'],
      ['#nb-tarix, [onclick*="showPanel(\'tarix\')"]',          '#panel-tarix'],
      ['#nb-kalk, [onclick*="showPanel(\'kalk\')"]',            '#panel-kalk'],
    ];

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const [navSel, panelSel] of panels) {
        await page.locator(navSel).first().click();
        await page.waitForTimeout(400);
        await expect(page.locator(panelSel)).toBeVisible({ timeout: 5_000 });
        // Boshqa panellar yashirin bo'lishi
        for (const [, otherPanel] of panels.filter(p => p[1] !== panelSel)) {
          await expect(page.locator(otherPanel)).toBeHidden();
        }
      }
    }
  });
});

test.describe('Navigatsiya — Dizayner rol', () => {

  test.beforeEach(async ({ page }) => {
    const email    = process.env.DESIGNER_EMAIL;
    const password = process.env.DESIGNER_PASSWORD;
    if (!email || !password) { test.skip(); return; }

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('input[type="email"], #email').first().fill(email);
    await page.locator('input[type="password"], #password').first().fill(password);
    await page.locator('button[onclick*="doLogin"]').first().click();
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 15_000 });
  });

  test('Dizayner paneli ochiladi', async ({ page }) => {
    const btn = page.locator('#nb-dizayner, [onclick*="showPanel(\'dizayner\')"], [onclick*="showPanel(\'stopwatch\')"]').first();
    await btn.click();
    await page.waitForTimeout(800);
    const panel = page.locator('#panel-dizayner, #panel-stopwatch').first();
    await expect(panel).toBeVisible({ timeout: 8_000 });
  });

  test('Admin va Owner panellari dizaynerlarga yashirin', async ({ page }) => {
    await expect(page.locator('#nb-owner')).toBeHidden();
    await expect(page.locator('#nb-admin')).toBeHidden();
  });
});
