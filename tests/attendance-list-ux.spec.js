const { test, expect } = require('@playwright/test');
const path = require('path');

const rows = [
  { id:'r1', user_id:'p1', branch_id:'b1', sana:'2026-08-29', check_in:'2026-08-29T05:31:00Z', check_out:'2026-08-29T16:07:00Z', status:'late', late_minutes:31, worked_minutes:636 },
  { id:'r2', user_id:'p2', branch_id:'b1', sana:'2026-08-29', check_in:'2026-08-29T04:00:00Z', check_out:'2026-08-29T12:00:00Z', status:'on_time', late_minutes:0, worked_minutes:480 },
  { id:'r3', user_id:'p3', branch_id:'b2', sana:'2026-08-28', check_in:null, check_out:'2026-08-28T13:00:00Z', status:'missing_check_in', late_minutes:0, worked_minutes:null },
  { id:'r4', user_id:'p1', branch_id:'b1', sana:'2026-08-28', check_in:'2026-08-28T04:10:00Z', check_out:null, status:'pending_approval', late_minutes:10, worked_minutes:null },
  { id:'r5', user_id:'p2', branch_id:'b1', sana:'2026-08-27', check_in:'2026-08-27T04:00:00Z', check_out:'2026-08-27T12:00:00Z', status:'checked_out', late_minutes:0, worked_minutes:480 },
];

// Determinizm: "previous_week" UI presetlari jonli tizim soatiga bog'liq bo'lmasligi
// uchun sanani muzlatamiz (faqat test; Davomat/product kodiga tegilmaydi).
// 2026-08-31T07:00:00Z = 2026-08-31 12:00 Asia/Tashkent (dushanba) -> previous_week = 2026-08-24..29.
// setFixedTime faqat Date.now()/new Date()ni muzlatadi, timerlar ishlashda davom etadi.
const DV_FIXED_NOW = new Date('2026-08-31T07:00:00Z');

async function openList(page, customRows = rows) {
  await page.clock.setFixedTime(DV_FIXED_NOW);
  await page.goto('/');
  await page.evaluate(data => {
    currentUser = { id:'manager-1', email:'manager@example.com' };
    currentRole = 'admin';
    USER_ID_TO_EMAIL.p1 = 'parvina@example.com';
    USER_ID_TO_EMAIL.p2 = 'mohlaroy@example.com';
    USER_ID_TO_EMAIL.p3 = 'bayramali@example.com';
    XODIMLAR['parvina@example.com'] = 'Parvina';
    XODIMLAR['mohlaroy@example.com'] = 'Mohlaroy';
    XODIMLAR['bayramali@example.com'] = 'Bayramali';
    getBranches = async () => [{id:'b1',name:'Sotuv',code:'sales'},{id:'b2',name:'Ishlab chiqarish',code:'production'}];
    window.__dvRows = data;
    window.__dvLastFilters = null;
    getDavomatList = async filters => { window.__dvLastFilters = filters; return window.__dvRows; };
    showScreen('app');
    showPanel('davomat');
    document.getElementById('dv-tab-list').classList.remove('hidden');
    document.getElementById('dv-tab-scan').classList.add('hidden');
    dvSelectPeriod('previous_week', false);
  }, customRows);
  await page.evaluate(() => loadDavomatList());
  await expect(page.locator('#dv-list-tbody tr')).toHaveCount(customRows.length);
}

test('desktop premium list renders summaries, badges, grouping and compact actions', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await openList(page);
  await expect(page.locator('#dv-summary-arrived')).toHaveText('4');
  await expect(page.locator('#dv-summary-ontime')).toHaveText('2');
  await expect(page.locator('#dv-summary-late')).toHaveText('2');
  await expect(page.locator('#dv-summary-absent')).toHaveText('1');
  await expect(page.locator('#dv-summary-worked')).toHaveText('26 soat 36 daq');
  await expect(page.getByText('+31 daq',{exact:true})).toHaveCount(1);
  await expect(page.locator('#dv-list-tbody')).toContainText('10 soat 36 daq');
  await expect(page.locator('.dv-date-divider')).toHaveCount(2);
  await expect(page.locator('.dv-status-badge')).toHaveCount(5);
  await expect(page.locator('.dv-actions-cell .dv-approve-btn')).toHaveCount(2);
  await expect(page.locator('#dv-list-employee option')).toHaveCount(4);
  expect(await page.locator('#dv-days-view .dv-attendance-table thead').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.DV_PREVIEW_DIR) await page.screenshot({path:path.join(process.env.DV_PREVIEW_DIR,'davomat-list-desktop.png'),fullPage:true});
});

test('period, branch, employee and employee-summary views stay functional', async ({ page }) => {
  await page.setViewportSize({width:1280,height:800});
  await openList(page);
  await page.locator('[data-dv-period="previous_week"]').click();
  await expect(page.locator('#dv-period-caption')).toContainText('6 ish kuni');
  await expect(page.locator('#dv-list-from')).toHaveValue('2026-08-24');
  await expect(page.locator('#dv-list-to')).toHaveValue('2026-08-29');

  await page.locator('[data-dv-period="custom"]').click();
  await page.locator('#dv-list-from').fill('2026-08-01');
  await page.locator('#dv-list-to').fill('2026-08-20');
  await page.getByRole('button',{name:'Ko‘rsatish'}).click();
  await expect(page.locator('#dv-period-caption')).toContainText('20 avg 2026');

  await page.locator('#dv-list-branch').selectOption('production');
  expect(await page.evaluate(() => window.__dvLastFilters.branch_id)).toBe('b2');
  await page.locator('#dv-list-employee').selectOption('p1');
  await expect(page.locator('#dv-result-count')).toHaveText('2 ta yozuv');
  await expect(page.locator('#dv-summary-arrived')).toHaveText('2');

  await page.locator('[data-dv-view="employees"]').click();
  await expect(page.locator('#dv-employees-view')).toBeVisible();
  await expect(page.locator('#dv-employees-tbody')).toContainText('Parvina');
  await expect(page.locator('#dv-days-view')).toBeHidden();
});

test('empty and error states are distinct', async ({ page }) => {
  await openList(page);
  await page.evaluate(() => { window.__dvRows = []; });
  await page.locator('[data-dv-period="today"]').click();
  await expect(page.locator('#dv-days-view')).toContainText('Tanlangan davr uchun davomat topilmadi');

  await page.evaluate(() => { getDavomatList = async () => { throw new Error('offline'); }; });
  await page.locator('[data-dv-period="month"]').click();
  await expect(page.locator('#dv-days-view')).toContainText('Davomat ma’lumotlarini yuklab bo‘lmadi');
  await expect(page.locator('#dv-days-view').getByRole('button',{name:'Qayta urinish'})).toHaveCount(1);
});

test('pending menu preserves existing actions', async ({ page }) => {
  await openList(page);
  const pendingMenuButton = page.locator('button[onclick*="dv-menu-table-r4"]');
  await expect(pendingMenuButton).toHaveCount(1);
  await pendingMenuButton.click();
  const openMenu = page.locator('.dv-actions-cell .dv-action-menu:not(.hidden)');
  await expect(openMenu).toHaveCount(1);
  await expect(openMenu).toContainText('Tasdiqlash');
  await expect(openMenu).toContainText('Rad etish');
  await expect(openMenu).toContainText('Tuzatish');
  await expect(openMenu).toContainText('O‘chirish');
});

test('many rows remain compact with a sticky scrollable table', async ({ page }) => {
  const manyRows = Array.from({length:30}, (_, index) => ({
    id:`many-${index}`, user_id:['p1','p2','p3'][index % 3], branch_id:index % 4 ? 'b1' : 'b2',
    sana:`2026-08-${String(29 - Math.floor(index / 3)).padStart(2,'0')}`,
    check_in:'2026-08-20T04:00:00Z', check_out:'2026-08-20T12:00:00Z',
    status:index % 5 ? 'on_time' : 'late', late_minutes:index % 5 ? 0 : 12, worked_minutes:480,
  }));
  await page.setViewportSize({width:1280,height:800});
  await openList(page, manyRows);
  await expect(page.locator('#dv-list-tbody tr')).toHaveCount(30);
  expect(await page.locator('#dv-days-view .dv-table-scroll').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await page.locator('#dv-list-tbody tr').nth(0).evaluate(el => el.getBoundingClientRect().height < 64)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('loading state uses skeleton rows before the request settles', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    currentUser = {id:'manager-1',email:'manager@example.com'};
    currentRole = 'admin';
    getBranches = async () => [];
    getDavomatList = () => new Promise(() => {});
    showScreen('app'); showPanel('davomat');
    document.getElementById('dv-tab-list').classList.remove('hidden');
    document.getElementById('dv-tab-scan').classList.add('hidden');
    dvSelectPeriod('today', false);
    loadDavomatList();
  });
  await expect(page.locator('#dv-list-tbody .dv-skeleton-row')).toHaveCount(6);
  await expect(page.locator('#dv-mobile-list .dv-mobile-card')).toHaveCount(3);
});

test('390px mobile uses cards, remains readable and supports dark mode', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await openList(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme','dark'));
  await expect(page.locator('#dv-days-view .dv-table-scroll')).toBeHidden();
  await expect(page.locator('#dv-mobile-list')).toBeVisible();
  await expect(page.locator('#dv-mobile-list .dv-mobile-card')).toHaveCount(5);
  await expect(page.locator('#dv-mobile-list')).toContainText('Parvina');
  await expect(page.locator('#dv-mobile-list')).toContainText('Kech qolgan +31 daq');
  await expect(page.locator('#dv-mobile-list')).toContainText('10 soat 36 daq');
  expect(await page.locator('#dv-tab-list').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const badge = page.locator('.dv-mobile-card .dv-person-name');
  expect(await badge.count()).toBe(5);
  expect(await badge.nth(0).evaluate(el => getComputedStyle(el).color)).not.toBe('rgba(0, 0, 0, 0)');
  if (process.env.DV_PREVIEW_DIR) await page.screenshot({path:path.join(process.env.DV_PREVIEW_DIR,'davomat-list-mobile-dark.png'),fullPage:true});
});
