const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sqlCode = (text) => text.replace(/--.*$/gm, '');

test('combined ERP shell keeps PRICE and calculator/navigation wiring', async () => {
  const html = read('index.html');

  expect(html).toContain('href="price.css?v=20260811"');
  expect(html).toContain('id="nb-price"');
  expect(html).toContain('id="panel-price"');
  expect(html).toContain('js/panels/price.js?v=20260811');

  expect(html).toContain('data-type="orakal"');
  expect(html).toContain('id="kalk-orakal"');
  expect(html).not.toContain('data-type="pechat"');
  expect(html).not.toContain('id="kalk-pechat"');
  expect(html).toContain('js/panels/kalk_engines.js?v=20260811');
  expect(html).toContain('js/panels/kalk.js?v=20260811');
  expect(html).toContain('js/nav_prefs.js?v=20260811');

  expect(html).toContain('id="nb-xabarlar"');
  expect(html).toContain('id="bell-btn"');
  expect(read('js/nav_prefs.js')).toContain('#nb-xabarlar{display:none !important}');
});

test('DTF engine keeps the accepted 1×20×100 boundary result', async () => {
  const { calculateDtf } = require('../js/panels/kalk_engines.js');
  const result = calculateDtf({ width: 1, height: 20, qty: 100 });

  expect(result.ok).toBe(true);
  expect(result.across).toBe(39);
  expect(result.rows).toBe(3);
  expect(result.lengthCm).toBe(61);
  expect(result.total).toBe(61000);
});

test('calculator UI renders Orakal and the accepted DTF result', async ({ page }) => {
  await page.setContent(`
    <input id="kalk-dtf-eni" value="1">
    <input id="kalk-dtf-boyi" value="20">
    <input id="kalk-dtf-son" value="100">
    <div id="kalk-dtf-result"></div>
    <input id="kalk-orakal-eni" value="100">
    <input id="kalk-orakal-boyi" value="100">
    <input id="kalk-orakal-son" value="1">
    <select id="kalk-orakal-tur"><option value="oddiy" selected>Oddiy</option></select>
    <div id="kalk-orakal-result"></div>
  `);
  await page.evaluate(() => { window.fmt = (value) => String(value); });
  await page.addScriptTag({ path: path.join(root, 'js/panels/kalk_engines.js') });
  await page.addScriptTag({ path: path.join(root, 'js/panels/kalk.js') });
  await page.evaluate(() => { calcDtf(); calcOrakal(); });

  const dtf = await page.locator('#kalk-dtf-result').innerText();
  expect(dtf).toContain('39 dona');
  expect(dtf).toContain('3 qator');
  expect(dtf).toContain('61 sm');
  expect(dtf).toContain('61000');
  await expect(page.locator('#kalk-orakal-result')).toContainText('100000');
});

test('monthly dashboard and KPI helpers keep shared calculations', async ({ page }) => {
  await page.setContent('<div></div>');
  await page.addScriptTag({ path: path.join(root, 'js/config.js') });
  await page.addScriptTag({ path: path.join(root, 'js/utils.js') });
  const result = await page.evaluate(() => {
    const range = getTashkentMonthRange('2026-08-12T12:00:00Z');
    const monthly = calculateMonthlyEmployeeStats([
      { type: 'admin', created_at: '2026-07-31T19:00:00.000Z', total_zakaz: 100, total_daromad: 25 },
      { type: 'admin', created_at: '2026-08-15T10:00:00.000Z', total_zakaz: 200, total_daromad: 50 },
      { type: 'admin', created_at: '2026-08-31T19:00:00.000Z', total_zakaz: 999, total_daromad: 999 },
    ], range);
    const email = 'ra.ravshan1998+umidjon@gmail.com';
    return {
      monthly,
      kpi: getKpi(email),
      current: getCurrentBonus(email, 30000000),
      next: getNextBonus(email, 30000000),
    };
  });

  expect(result.monthly).toEqual({ total: 300, earnings: 75, count: 2 });
  expect(result.kpi).toEqual({ daraja: 'boshlangich', maqsad: 30000000, fiks: 1500000 });
  expect(result.current.bonus).toBe(800000);
  expect(result.next.min).toBe(40000000);
});

test('saved nav order keeps newly introduced PRICE items', async () => {
  const { reconcile } = require('../js/nav_prefs.js');
  expect(reconcile(
    ['nb-dashboard', 'nb-kalk', 'nb-price'],
    ['nb-kalk', 'nb-dashboard'],
  )).toEqual(['nb-kalk', 'nb-dashboard', 'nb-price']);
});

test('nav drag ordering and reset work while Xabarlar hides and bell remains', async ({ page }) => {
  await page.setContent(`
    <style>
      #main-nav, .kc-tabs { display:flex; gap:4px }
      .nav-btn, .kc-tab { width:100px; height:40px }
    </style>
    <button id="bell-btn">Bell</button>
    <div id="main-nav">
      <button class="nav-btn" id="nb-dashboard">Dashboard</button>
      <button class="nav-btn" id="nb-xabarlar">Xabarlar</button>
      <button class="nav-btn" id="nb-price">PRICE</button>
    </div>
    <div class="kc-tabs">
      <button class="kc-tab" data-type="sigim">Sigim</button>
      <button class="kc-tab" data-type="orakal">Orakal</button>
    </div>
  `);
  await page.evaluate(() => {
    window.currentUser = { id: 'compat-user' };
    window.sb = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
        upsert: () => Promise.resolve({}),
      }),
      auth: { onAuthStateChange: () => ({ data: null }) },
    };
  });
  await page.addScriptTag({ path: path.join(root, 'js/nav_prefs.js') });

  await expect(page.locator('#nb-xabarlar')).toBeHidden();
  await expect(page.locator('#bell-btn')).toBeVisible();

  const dashboard = page.locator('#nb-dashboard');
  const price = page.locator('#nb-price');
  const from = await dashboard.boundingBox();
  const to = await price.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width + 20, to.y + to.height / 2, { steps: 4 });
  await page.mouse.up();

  const moved = await page.locator('#main-nav .nav-btn:not([data-noreorder])').evaluateAll(
    (els) => els.map((el) => el.id),
  );
  expect(moved).toEqual(['nb-xabarlar', 'nb-price', 'nb-dashboard']);

  await page.evaluate(() => window.resetNavOrder());
  const reset = await page.locator('#main-nav .nav-btn:not([data-noreorder])').evaluateAll(
    (els) => els.map((el) => el.id),
  );
  expect(reset).toEqual(['nb-dashboard', 'nb-xabarlar', 'nb-price']);
});

test('PRICE and nav preference migrations remain isolated', async () => {
  const price = read('supabase/migrations/20260811090000_price_module.sql');
  const priceDown = read('supabase/price_module/20260811090000_price_module_rollback.sql');
  const nav = read('supabase/nav_prefs/0001_erp_user_prefs_up.sql');
  const navDown = read('supabase/nav_prefs/0001_erp_user_prefs_down.sql');

  expect(price).not.toContain('erp_user_prefs');
  expect(priceDown).not.toContain('erp_user_prefs');
  expect(nav).not.toContain('public.pricing_');
  expect(navDown).not.toContain('public.pricing_');
  expect(sqlCode(priceDown).toLowerCase()).not.toContain('cascade');
  expect(sqlCode(navDown).toLowerCase()).not.toContain('cascade');
  expect(nav).toContain('revoke all on table public.erp_user_prefs from anon, authenticated');
  expect(nav).toContain('grant select, insert, update, delete on table public.erp_user_prefs to authenticated');
});
