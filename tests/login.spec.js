// @ts-check
const { test, expect } = require('@playwright/test');
const { login, ONBOARDING } = require('./helpers/login');

/**
 * LOGIN TESTLAR
 * Parollar: GitHub Secrets → env variable
 * DESIGNER_EMAIL, DESIGNER_PASSWORD
 * ADMIN_EMAIL, ADMIN_PASSWORD
 * PRODUCTION_EMAIL, PRODUCTION_PASSWORD
 */

test.describe('Login sahifasi', () => {

  test('sayt ochiladi va login forma ko\'rinadi', async ({ page }) => {
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');

    // Login ekrani ko'rinishi kerak
    const loginScreen = page.locator('#login-screen');
    await expect(loginScreen).toBeVisible({ timeout: 10_000 });

    // App ekrani yashirin bo'lishi kerak
    const appScreen = page.locator('#app-screen');
    await expect(appScreen).toBeHidden();

    // Email va parol inputlari
    await expect(page.locator('input[type="email"], #email, input[placeholder*="mail"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"], #password').first()).toBeVisible();

    // Login tugmasi
    await expect(page.locator('button[onclick*="doLogin"], button[type="submit"]').first()).toBeVisible();
  });

  test('noto\'g\'ri login xato xabar chiqaradi', async ({ page }) => {
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');

    // Noto'g'ri ma'lumot kiritish
    const emailInput = page.locator('input[type="email"], #email').first();
    const passInput  = page.locator('input[type="password"], #password').first();

    await emailInput.fill('notexist@example.com');
    await passInput.fill('wrongpassword123');

    // Login tugmasini bosish
    const loginBtn = page.locator('button[onclick*="doLogin"]').first();
    await loginBtn.click();

    // Xato xabar yoki login ekrani hali ko'rinib turishi kerak
    await page.waitForTimeout(3000);
    const loginStillVisible = await page.locator('#login-screen').isVisible();
    expect(loginStillVisible).toBeTruthy();
  });

  test('dizayner akkaunti bilan login muvaffaqiyatli', async ({ page }) => {
    const email    = process.env.DESIGNER_EMAIL;
    const password = process.env.DESIGNER_PASSWORD;

    if (!email || !password) {
      test.skip(true, 'DESIGNER_EMAIL yoki DESIGNER_PASSWORD env variable yo\'q');
      return;
    }

    await login(page, email, password, ONBOARDING.designer);
    await expect(page.locator('#login-screen')).toBeHidden();

    // Dizayner uchun nav tekshiruv
    await expect(page.locator('#nb-dizayner')).toBeVisible();

    // Logout
    await page.locator('button[onclick*="doLogout"], .logout-btn').first().click();
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 5_000 });
  });

  test('admin akkaunti bilan login muvaffaqiyatli', async ({ page }) => {
    const email    = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      test.skip(true, 'ADMIN_EMAIL yoki ADMIN_PASSWORD env variable yo\'q');
      return;
    }

    await login(page, email, password, ONBOARDING.admin);

    // Admin uchun nav itemlar
    await expect(page.locator('#nb-dashboard, [onclick*="dashboard"]').first()).toBeVisible();
    await expect(page.locator('#nb-tarix, [onclick*="tarix"]').first()).toBeVisible();

    await page.locator('button[onclick*="doLogout"], .logout-btn').first().click();
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 5_000 });
  });

  test('ishlab chiqarish akkaunti bilan login muvaffaqiyatli', async ({ page }) => {
    const email    = process.env.PRODUCTION_EMAIL;
    const password = process.env.PRODUCTION_PASSWORD;

    if (!email || !password) {
      test.skip(true, 'PRODUCTION_EMAIL yoki PRODUCTION_PASSWORD env variable yo\'q');
      return;
    }

    await login(page, email, password, ONBOARDING.production);

    await page.locator('button[onclick*="doLogout"], .logout-btn').first().click();
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 5_000 });
  });
});
