// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PRICE_SCRIPT = path.join(ROOT, 'js', 'panels', 'price.js');
const BASE_STYLE = path.join(ROOT, 'styles.css');
const PRICE_STYLE = path.join(ROOT, 'price.css');

async function mountPriceModule(page, role = 'admin') {
  await page.setContent(`<!doctype html><html><body>
    <button id="price-add-btn" class="hidden"></button>
    <input id="price-search"><select id="price-status-filter"><option value="active">active</option><option value="favorites">favorites</option><option value="all">all</option></select>
    <select id="price-sort"><option value="updated">updated</option><option value="name">name</option><option value="price">price</option></select>
    <datalist id="price-category-options"></datalist>
    <div id="price-category-strip"></div><div id="price-catalog-state"></div><div id="price-grid"></div>
    <span id="price-stat-active"></span><span id="price-stat-categories"></span><span id="price-stat-updated"></span>
    <div id="price-detail-modal" class="modal-overlay price-modal-overlay hidden"><div class="price-modal price-detail-modal"><div id="price-detail-content"></div></div></div>
    <div id="price-editor-modal" class="hidden"></div>
  </body></html>`);
  await page.addStyleTag({ path: BASE_STYLE });
  await page.addStyleTag({ path: PRICE_STYLE });
  await page.addScriptTag({ content: `
    var currentRole = ${JSON.stringify(role)};
    var currentUser = { id: '00000000-0000-0000-0000-000000000001' };
    var notifications = [];
    function showNotify(message, type){ notifications.push({message,type}); }
    var sb = {
      rpc: async function(name, args){
        if(name === 'pricing_quote') return { data:{ available:true, product_id:1, product_name:'Soft Touch krujka', pricing_mode:'quantity_tier', quantity:args.p_quantity, basis:args.p_quantity, unit:'dona', unit_price:54000, setup_price:0, tier_label:'20–49 dona', total:args.p_quantity*54000, currency:'UZS' }, error:null };
        return { data:null, error:null };
      },
      from: function(){
        var chain = { select:function(){return chain}, eq:function(){return chain}, order:function(){return chain}, limit:async function(){return {data:[],error:null}}, insert:async function(){return {error:null}}, delete:function(){return chain} };
        return chain;
      }
    };
    Object.defineProperty(navigator, 'clipboard', { value:{ writeText:async function(text){ window.__copiedPrice = text; } }, configurable:true });
  `});
  await page.addScriptTag({ path: PRICE_SCRIPT });
  await page.evaluate(() => {
    priceState.loaded = true;
    priceState.products = [{
      id:1, name:'Soft Touch krujka', category:'Suvenir',
      aliases:['bakal','chashka','mug'], tags:['premium','sovg‘a'],
      description:'Korporativ sovg‘a uchun yumshoq qoplamali krujka.',
      customer_note:'Dizayn alohida kelishiladi.', sku:'KR-ST', image_url:null,
      status:'active', pricing_mode:'quantity_tier', currency:'UZS', unit:'dona', base_price:0,
      min_quantity:5, production_time:'3–4 ish kuni', updated_at:'2026-08-11T08:00:00Z',
      pricing_price_tiers:[
        {id:1,min_value:5,max_value:9,unit_price:82300,setup_price:0,label:'5–9 dona',is_active:true},
        {id:2,min_value:10,max_value:19,unit_price:72000,setup_price:0,label:'10–19 dona',is_active:true},
        {id:3,min_value:20,max_value:49,unit_price:54000,setup_price:0,label:'20–49 dona',is_active:true},
        {id:4,min_value:50,max_value:null,unit_price:41400,setup_price:0,label:'50+ dona',is_active:true}
      ]
    }];
    priceState.favoriteIds = new Set();
    renderPriceCatalog();
  });
}

test.describe('PRICE usable MVP', () => {
  test('katalog card, boshlang‘ich narx va alias qidiruvi ishlaydi', async ({ page }) => {
    await mountPriceModule(page);
    await expect(page.locator('.price-card')).toHaveCount(1);
    await expect(page.locator('.price-card')).toContainText('Soft Touch krujka');
    await expect(page.locator('.price-card')).toContainText('82');
    await expect(page.locator('.price-card')).toContainText('Faol');
    await expect(page.locator('.price-card-summary')).toContainText('Korporativ sovg‘a');

    await page.locator('#price-search').fill('chashka');
    await page.evaluate(() => priceApplyFilters());
    await expect(page.locator('.price-card')).toHaveCount(1);

    await page.locator('#price-search').fill('topilmaydi');
    await page.evaluate(() => priceApplyFilters());
    await expect(page.locator('#price-catalog-state')).toContainText('Mos mahsulot topilmadi');
  });

  test('quantity tier quote mos tarifni va jami narxni qaytaradi', async ({ page }) => {
    await mountPriceModule(page);
    await page.evaluate(() => openPriceDetail(1));
    await page.locator('#price-quote-quantity').fill('20');
    await page.evaluate(() => calculatePriceQuote());
    await expect(page.locator('#price-quote-result')).toContainText('1');
    await expect(page.locator('#price-quote-result')).toContainText('080');
    await expect(page.locator('#price-quote-result')).toContainText('54');

    await page.evaluate(() => copyPriceCustomerSummary());
    const copied = await page.evaluate(() => window.__copiedPrice);
    expect(copied).toContain('Soft Touch krujka');
    expect(copied).toContain('Miqdor: 20 dona');
    expect(copied).toContain('Jami:');
    expect(copied).toContain('3–4 ish kuni');
  });

  test('employee editor huquqiga ega emas', async ({ page }) => {
    await mountPriceModule(page, 'ishlab');
    expect(await page.evaluate(() => priceCanEdit())).toBe(false);
    await page.evaluate(() => initPricePanel());
    await expect(page.locator('#price-add-btn')).toHaveClass(/hidden/);
  });

  test('bir miqdorga mos keladigan ikki tarif client validatsiyasida rad etiladi', async ({ page }) => {
    await mountPriceModule(page);
    const error = await page.evaluate(() => priceValidateTiers([
      {min_value:5,max_value:20,unit_price:100},
      {min_value:20,max_value:50,unit_price:90},
    ]));
    expect(error).toContain('bir xil miqdorni');
  });

  test('mobil katalog va detail viewportdan chiqmaydi', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await mountPriceModule(page);
    const catalogFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(catalogFits).toBe(true);
    await page.evaluate(() => openPriceDetail(1));
    const bounds = await page.locator('.price-detail-modal').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  });
});

test('PRICE migration RLS, aliases, history va kanonik RPCni o‘z ichiga oladi', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260811090000_price_module.sql'), 'utf8');
  expect(sql).toContain('aliases text[]');
  expect(sql).toContain("'quantity_tier', 'area', 'linear_meter', 'calculator', 'manual'");
  expect(sql).toContain('alter table public.pricing_products enable row level security');
  expect(sql).toContain('create or replace function public.pricing_quote');
  expect(sql).toContain('create or replace function public.pricing_save_product');
  expect(sql).toContain("'tier_set'");
  expect(sql).toContain('changed_by_name');
  expect(sql).not.toContain('grant select, insert, update, delete on public.pricing_products');
});

test('ERP actual role mapping va PRICE server authorization bir xil', () => {
  const config = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260811090000_price_module.sql'), 'utf8');
  expect(config).toMatch(/director:\s*'owner'/);
  expect(config).toMatch(/manager:\s*'admin'/);
  expect(config).toMatch(/designer:\s*'dizayner'/);
  expect(config).toMatch(/production:\s*'ishlab'/);
  expect(sql).toContain("role in ('director', 'manager')");
  expect(sql).not.toMatch(/from\s+public\.user_roles/i);
});

test('quantity-tier exact boundary contract deterministik', () => {
  const tiers = [
    { min:5, max:9, price:100 },
    { min:10, max:19, price:90 },
    { min:20, max:49, price:80 },
    { min:50, max:99, price:70 },
    { min:100, max:499, price:60 },
    { min:500, max:999, price:50 },
    { min:1000, max:null, price:40 },
  ];
  const resolve = quantity => tiers.find(t => t.min <= quantity && (t.max === null || t.max >= quantity));
  expect([5,10,20,50,100,500,1000].map(q => resolve(q)?.price)).toEqual([100,90,80,70,60,50,40]);
  expect(resolve(37)?.price).toBe(80);
  expect(resolve(4)).toBeUndefined();
  expect([{min:5,max:9},{min:20,max:null}].find(t => t.min <= 15 && (t.max === null || t.max >= 15))).toBeUndefined();

  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260811090000_price_module.sql'), 'utf8');
  expect(sql).toContain('min_value <= v_basis');
  expect(sql).toContain('(max_value is null or max_value >= v_basis)');
  expect(sql).toContain('pricing_reject_tier_range_collision');
});

test('quote inactive, calculator, manual va no-tier holatlarini yopadi', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260811090000_price_module.sql'), 'utf8');
  const statusGuard = sql.indexOf("if v_product.status <> 'active'");
  const calculatorGuard = sql.indexOf("if v_product.pricing_mode = 'calculator'");
  expect(statusGuard).toBeGreaterThan(0);
  expect(calculatorGuard).toBeGreaterThan(statusGuard);
  expect(sql).toContain("'requires_calculator', true");
  expect(sql).toContain("'requires_manual_price', true");
  expect(sql).toContain("'Bu miqdor uchun tasdiqlangan tarif topilmadi'");
  expect(sql).toContain("pricing_mode not in ('calculator', 'manual', 'quantity_tier') or base_price = 0");
  expect(sql).toContain("Calculator/manual mahsulot PRICE tariflarini saqlamasligi kerak");
});

test('history actor, product/tier/archive contracti va recursion himoyasi mavjud', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260811090000_price_module.sql'), 'utf8');
  expect(sql).toContain('create trigger pricing_products_history');
  expect(sql).not.toContain('create trigger pricing_price_tiers_history');
  expect(sql).toContain("'tier_set', p.id, 'update'");
  expect(sql).toContain('auth.uid(), coalesce(v_changed_by_name');
  expect(sql).toContain("set status = case when p_archived then 'archived' else 'active' end");
  expect(sql).toContain('after insert or update or delete on public.pricing_products');
  expect(sql).toContain("to_jsonb(old) - 'updated_at' - 'updated_by'");
  expect(sql).toContain("to_jsonb(t) - 'id' - 'product_id' - 'created_at' - 'updated_at'");
});

test('migration grants, RLS, SECURITY DEFINER va rollback hardening', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260811090000_price_module.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(ROOT, 'supabase', 'price_module', '20260811090000_price_module_rollback.sql'), 'utf8');
  expect((sql.match(/security definer/g) || []).length).toBe(4);
  expect((sql.match(/security definer\r?\nset search_path = pg_catalog, public/g) || []).length).toBe(4);
  expect(sql).toContain('revoke all on table public.pricing_products from authenticated');
  expect(sql).toContain('revoke all on table public.pricing_price_tiers from authenticated');
  expect(sql).toContain('revoke all on table public.pricing_price_history from authenticated');
  expect(sql).toContain('revoke all on function public.pricing_write_history() from anon, authenticated');
  expect(sql).toContain('grant select, insert, delete on public.pricing_favorites to authenticated');
  expect(sql).not.toMatch(/grant\s+(?:[^;]*\b)?(?:insert|update|delete)[^;]*pricing_products/i);
  expect(sql).not.toMatch(/grant\s+(?:[^;]*\b)?(?:insert|update|delete)[^;]*pricing_price_tiers/i);
  expect(sql).not.toMatch(/grant\s+(?:[^;]*\b)?insert[^;]*pricing_price_history/i);
  expect(sql).toContain('user_id = auth.uid()');
  expect(sql).toContain("where p.id = product_id and p.status = 'active'");
  expect(rollback).not.toMatch(/drop\s+table[^;]*\bcascade\b/i);
});

test('ERP HTML PRICE assetlari va highlight navigatsiyasini yuklaydi', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  expect(html).toContain('id="nb-price"');
  expect(html).toContain('price-nav-btn');
  expect(html).toContain('id="panel-price"');
  expect(html).toContain('js/panels/price.js');
  expect(html).toContain('price.css');
});

test('haqiqiy index barcha lokal PRICE assetlarini JS xatosiz yuklaydi', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#nb-price')).toHaveCount(1);
  const globals = await page.evaluate(() => ({
    initPricePanel:typeof initPricePanel,
    calculatePriceQuote:typeof calculatePriceQuote,
    showPanel:typeof showPanel,
  }));
  expect(globals).toEqual({ initPricePanel:'function', calculatePriceQuote:'function', showPanel:'function' });
  expect(errors).toEqual([]);
});
