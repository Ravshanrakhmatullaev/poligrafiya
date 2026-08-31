const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const Period = require('../js/attendance_period.js');

test('period presets use Asia/Tashkent work-week boundaries', () => {
  expect(Period.range('today', '2026-08-31')).toEqual({ from: '2026-08-31', to: '2026-08-31' });
  expect(Period.range('week', '2026-08-31')).toEqual({ from: '2026-08-31', to: '2026-08-31' });
  expect(Period.range('week', '2026-08-30')).toEqual({ from: '2026-08-24', to: '2026-08-29' });
  expect(Period.range('previous_week', '2026-08-31')).toEqual({ from: '2026-08-24', to: '2026-08-29' });
  expect(Period.range('month', '2026-08-31')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  expect(Period.range('previous_month', '2026-01-04')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  expect(Period.normalize('2026-08-20', '2026-08-01')).toEqual({ from: '2026-08-01', to: '2026-08-20' });
});

test('Davomat query supports non-destructive date bounds', () => {
  const db = fs.readFileSync(path.join(__dirname, '..', 'js/db.js'), 'utf8');
  expect(db).toContain("q.gte('sana', filters.from)");
  expect(db).toContain("q.lte('sana', filters.to)");
});

test('signed-in period toolbar works on desktop and 390px', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    currentUser = { id: 'manager-1', email: 'manager@example.com' };
    currentRole = 'admin';
    getBranches = async () => [];
    getDavomatList = async filters => [{
      id: 'row-1', user_id: 'user-1', sana: filters.from, branch_id: null,
      check_in: '2026-08-24T04:00:00Z', check_out: null, status: 'on_time', worked_minutes: null,
    }];
    showScreen('app');
    showPanel('davomat');
    document.getElementById('dv-tab-list').classList.remove('hidden');
    document.getElementById('dv-tab-scan').classList.add('hidden');
  });

  await page.locator('[data-dv-period="previous_week"]').click();
  await expect(page.locator('#dv-list-from')).toHaveValue('2026-08-24');
  await expect(page.locator('#dv-list-to')).toHaveValue('2026-08-29');
  await expect(page.locator('#dv-list-tbody')).toContainText('24 avg');

  await page.locator('[data-dv-period="custom"]').click();
  await expect(page.locator('#dv-period-custom')).toBeVisible();
  await page.locator('#dv-list-from').fill('2026-08-01');
  await page.locator('#dv-list-to').fill('2026-08-20');
  await page.getByRole('button', { name: 'Ko‘rsatish' }).click();
  await expect(page.locator('#dv-period-caption')).toContainText('1 avg 2026 — 20 avg 2026');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-dv-period="previous_week"]')).toBeVisible();
  await expect(page.locator('#dv-period-custom')).toBeVisible();
  expect(await page.locator('.dv-period-presets').evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
});
