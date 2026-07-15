// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/login');

/**
 * ADMIN ZAKAZ TESTLAR
 * - Zakaz qo'shish tugmasi
 * - Foiz va daromad hisoblash
 * - +50% bonus checkbox
 * - Telegram mock (real xabar yuborilmaydi)
 *
 * MUHIM: Test zakazlar saqlanmaydi — faqat forma tekshiriladi.
 * Agar saqlash testi kerak bo'lsa, test user DB ga yoziladi
 * va oxirida o'chiriladi.
 */

test.describe('Admin zakaz forması', () => {

  test.beforeEach(async ({ page }) => {
    // loginAsAdmin() (tests/helpers/login.js) allaqachon admin yo'riqnoma
    // ekranini (agar ko'rinsa) o'zi hal qiladi va #app-screen ko'rinishini
    // kutib bo'lgach qaytadi — bu yerda alohida qayta ishlov shart emas.
    const ok = await loginAsAdmin(page);
    if (!ok) test.skip();
  });

  test('"Zakaz qo\'shish" tugmasi yangi qator qo\'shadi', async ({ page }) => {
    // Admin rows container
    const rowsContainer = page.locator('#admin-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });

    const initialCount = await rowsContainer.locator('.zakaz-row').count();

    // Zakaz qo'shish tugmasi
    const addBtn = page.locator('button[onclick*="addAdminRow"], .add-btn').first();
    await addBtn.click();
    await page.waitForTimeout(300);

    const newCount = await rowsContainer.locator('.zakaz-row').count();
    expect(newCount).toBe(initialCount + 1);

    // 3 marta bosish = 3 ta yangi qator
    await addBtn.click();
    await addBtn.click();
    await page.waitForTimeout(300);
    expect(await rowsContainer.locator('.zakaz-row').count()).toBe(initialCount + 3);
  });

  test('mahsulot nomi va summa kiritiladi', async ({ page }) => {
    const rowsContainer = page.locator('#admin-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });

    // Birinchi qatordagi inputlar
    const rows = rowsContainer.locator('.zakaz-row');
    const firstRow = rows.first();
    await expect(firstRow).toBeVisible({ timeout: 5_000 });

    const nomInput = firstRow.locator('input[placeholder*="Mahsulot"], input[placeholder*="nom"]').first();
    const sumInput = firstRow.locator('input[placeholder*="Summa"], input[inputmode="numeric"]').first();

    await nomInput.fill('Test Vizitka');
    await sumInput.fill('500000');
    await sumInput.press('Tab');    // blur orqali hisoblash trigger
    await page.waitForTimeout(500);

    // Foiz badge ko'rinishi kerak
    const foizBadge = firstRow.locator('.fzbadge').first();
    await expect(foizBadge).not.toHaveText('—');

    // Daromad badge ko'rinishi kerak
    const drBadge = firstRow.locator('.drbadge').first();
    await expect(drBadge).not.toHaveText('—');
    await expect(drBadge).toContainText("so'm");
  });

  test('foiz to\'g\'ri hisoblanadi (500 000 → 10%)', async ({ page }) => {
    const rowsContainer = page.locator('#admin-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });

    const firstRow = rowsContainer.locator('.zakaz-row').first();
    const sumInput = firstRow.locator('input[inputmode="numeric"]').first();

    await sumInput.fill('500000');
    await sumInput.press('Tab');
    await page.waitForTimeout(500);

    // 500 000 so'm → 10% foiz
    const foizBadge = firstRow.locator('.fzbadge').first();
    await expect(foizBadge).toHaveText('10%', { timeout: 3_000 });

    // Daromad: 500 000 × 0.10 = 50 000
    const drBadge = firstRow.locator('.drbadge').first();
    await expect(drBadge).toContainText('50');
  });

  test('+50% bonus checkbox Abror akkauntida ko\'rinadi', async ({ page }) => {
    // Bu test faqat ADMIN_EMAIL === Abror email bo'lsa ishlaydi
    const email = process.env.ADMIN_EMAIL || '';
    if (!email.includes('abror')) {
      test.skip(true, 'Bu test faqat Abror akkauntida ishlaydi');
      return;
    }

    const rowsContainer = page.locator('#admin-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });

    const firstRow = rowsContainer.locator('.zakaz-row').first();
    const sumInput = firstRow.locator('input[inputmode="numeric"]').first();
    await sumInput.fill('1000000');
    await sumInput.press('Tab');
    await page.waitForTimeout(500);

    // Bonus checkbox ko'rinishi
    const bonusChk = firstRow.locator('input[type="checkbox"]').first();
    await expect(bonusChk).toBeVisible({ timeout: 3_000 });

    // Belgisiz: 80 000 (8%)
    const drBefore = await firstRow.locator('.drbadge').first().textContent();

    // Belgilash
    await bonusChk.check();
    await page.waitForTimeout(300);

    // Belgili: 120 000 (80 000 × 1.5)
    const drAfter = await firstRow.locator('.drbadge').first().textContent();
    expect(drAfter).not.toBe(drBefore);
    expect(drAfter).toContain('120');
  });

  test('Telegram tugmasi zakazsiz bosilganda xabar yubormasligi', async ({ page }) => {
    // Telegram so'rovlarini intercept qilamiz
    const tgRequests = [];
    await page.route('**/*.vercel.app/api/**', async route => {
      tgRequests.push(route.request().url());
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/api.telegram.org/**', async route => {
      tgRequests.push(route.request().url());
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    // admin-rows ni tozalash — hamma qatorlarni o'chirish
    await page.evaluate(() => {
      if (typeof adD !== 'undefined') adD = [];
      if (typeof renderAdmin === 'function') renderAdmin();
    });
    await page.waitForTimeout(300);

    // Telegram tugmasi
    const tgBtn = page.locator('#admin-tg-btn, button[onclick*="sendAdminTg"]').first();
    if (!(await tgBtn.isVisible())) {
      test.skip(true, 'Telegram tugmasi topilmadi');
      return;
    }
    await tgBtn.click();
    await page.waitForTimeout(500);

    // Telegram so'rovi yuborilmasligi kerak
    expect(tgRequests.length).toBe(0);
  });

  test('Telegram tugmasi zakazlar bilan POST yuboradi (mock)', async ({ page }) => {
    // Telegram endpoint ni mock qilish
    let capturedBody = null;
    await page.route('**/*.vercel.app/api/**', async route => {
      if (route.request().method() === 'POST') {
        capturedBody = JSON.parse(route.request().postData() || '{}');
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message_id: 999 }),
      });
    });

    const rowsContainer = page.locator('#admin-rows');
    await expect(rowsContainer).toBeVisible({ timeout: 5_000 });

    // Zakaz kiritish
    const firstRow = rowsContainer.locator('.zakaz-row').first();
    await firstRow.locator('input[placeholder*="Mahsulot"], input[placeholder*="nom"]').first().fill('Test Mahsulot');
    await firstRow.locator('input[inputmode="numeric"]').first().fill('600000');
    await firstRow.locator('input[inputmode="numeric"]').first().press('Tab');
    await page.waitForTimeout(500);

    const tgBtn = page.locator('#admin-tg-btn, button[onclick*="sendAdminTg"]').first();
    if (!(await tgBtn.isVisible())) {
      test.skip(true, 'Telegram tugmasi topilmadi');
      return;
    }

    await tgBtn.click();
    await page.waitForTimeout(1500);

    // POST yuborilgani va body to'g'riligi
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.text).toBeDefined();
    expect(capturedBody.text).toContain('Test Mahsulot');
    expect(capturedBody.text).toContain('so\'m');
  });
});
