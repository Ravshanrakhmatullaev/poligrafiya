const { test, expect } = require('@playwright/test');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { calculateSigim } = require('../js/panels/kalk_engines.js');

test.describe('Sigim engine', () => {
  test('normal valid dimensions return columns, rows and best total', () => {
    const r = calculateSigim({ pieceWidth: 9, pieceHeight: 5, materialWidth: 44, materialHeight: 31 });
    expect(r.ok).toBe(true);
    expect(r.normal).toMatchObject({ columns: 4, rows: 6, total: 24 });
    expect(r.rotated).toMatchObject({ columns: 8, rows: 3, total: 24 });
    expect(r.bestTotal).toBe(24);
  });

  test('rotation can be better', () => {
    const r = calculateSigim({ pieceWidth: 6, pieceHeight: 4, materialWidth: 10, materialHeight: 12 });
    expect(r.normal.total).toBe(3);
    expect(r.rotated.total).toBe(4);
    expect(r.bestOrientation).toBe('rotated');
  });

  test('rotation can be worse', () => {
    const r = calculateSigim({ pieceWidth: 2, pieceHeight: 3, materialWidth: 10, materialHeight: 12 });
    expect(r.normal.total).toBe(20);
    expect(r.rotated.total).toBe(18);
    expect(r.bestOrientation).toBe('normal');
  });

  test('0.5 cm gap changes only space between pieces', () => {
    const off = calculateSigim({ pieceWidth: 10, pieceHeight: 10, materialWidth: 20, materialHeight: 20 });
    const on = calculateSigim({ pieceWidth: 10, pieceHeight: 10, materialWidth: 20, materialHeight: 20, withGap: true });
    expect(off.bestTotal).toBe(4);
    expect(on.bestTotal).toBe(1);
    expect(on.gap).toBe(0.5);
  });

  test('decimal dot and comma inputs are equivalent', () => {
    const dot = calculateSigim({ pieceWidth: '9.5', pieceHeight: '5.5', materialWidth: '44', materialHeight: '31' });
    const comma = calculateSigim({ pieceWidth: '9,5', pieceHeight: '5,5', materialWidth: '44', materialHeight: '31' });
    expect(comma).toEqual(dot);
    expect(dot.bestTotal).toBeGreaterThan(0);
  });

  test('empty, zero, negative and invalid inputs fail explicitly', () => {
    expect(calculateSigim({ pieceWidth: '', pieceHeight: 5, materialWidth: 44, materialHeight: 31 }).error).toBe('non_positive');
    expect(calculateSigim({ pieceWidth: 0, pieceHeight: 5, materialWidth: 44, materialHeight: 31 }).error).toBe('non_positive');
    expect(calculateSigim({ pieceWidth: -1, pieceHeight: 5, materialWidth: 44, materialHeight: 31 }).error).toBe('non_positive');
    expect(calculateSigim({ pieceWidth: 'abc', pieceHeight: 5, materialWidth: 44, materialHeight: 31 }).error).toBe('invalid');
  });

  test('reported 120x240 product cannot fit in 20x2 material', () => {
    const r = calculateSigim({ pieceWidth: 120, pieceHeight: 240, materialWidth: 20, materialHeight: 2 });
    expect(r.ok).toBe(true);
    expect(r.noFit).toBe(true);
    expect(r.normal).toMatchObject({ columns: 0, rows: 0, total: 0 });
    expect(r.rotated).toMatchObject({ columns: 0, rows: 0, total: 0 });
  });
});

async function mountSigim(page) {
  await page.setContent(`
    <div id="kalk-sigim">
      <input id="sig-mah-eni" type="text" oninput="calcSigim()">
      <input id="sig-mah-boyi" type="text" oninput="calcSigim()">
      <input id="sig-mat-eni" type="text" oninput="calcSigim()">
      <input id="sig-mat-boyi" type="text" oninput="calcSigim()">
      <input id="sig-kesish" class="kc-switch-input" type="checkbox" onchange="calcSigim()">
      <div id="sig-message" style="display:none"></div>
      <div id="sig-result" style="display:none">
        <span id="sig-normal"></span><span id="sig-normal-info"></span>
        <span id="sig-rotated"></span><span id="sig-rotated-info"></span>
        <span id="sig-best"></span><span id="sig-best-way"></span>
      </div>
      <div id="sig-empty">Olchamlarni kiriting</div>
    </div>
  `);
  await page.evaluate(() => {
    window.currentUser = { id: 'sigim-test' };
    window.showNotify = message => { window.lastNotice = message; };
    window.copiedText = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: text => { window.copiedText = text; return Promise.resolve(); },
    }});
  });
  await page.addScriptTag({ path: path.join(root, 'js/panels/kalk_engines.js') });
  await page.addScriptTag({ path: path.join(root, 'js/panels/kalk.js') });
  await page.addScriptTag({ path: path.join(root, 'js/panels/uvdtf.js') });
}

test('Sigim UI recalculates in real time, resets and copies', async ({ page }) => {
  await mountSigim(page);
  await page.locator('#sig-mah-eni').fill('6');
  await page.locator('#sig-mah-boyi').fill('4');
  await page.locator('#sig-mat-eni').fill('10');
  await page.locator('#sig-mat-boyi').fill('12');
  await expect(page.locator('#sig-normal')).toHaveText('3 ta');
  await expect(page.locator('#sig-rotated')).toHaveText('4 ta');
  await expect(page.locator('#sig-best')).toHaveText('4 ta');

  await page.evaluate(() => copyKalkResult());
  await expect.poll(() => page.evaluate(() => window.copiedText)).toContain("Eng ko'p: 4 ta");

  await page.evaluate(() => clearKalk());
  await expect(page.locator('#sig-mah-eni')).toHaveValue('');
  await expect(page.locator('#sig-result')).toBeHidden();
  await expect(page.locator('#sig-message')).toBeHidden();
  await page.evaluate(() => copyKalkResult());
  await expect.poll(() => page.evaluate(() => window.lastNotice)).toBe('Avval hisoblang');
});

test('Sigim UI explains a physically impossible layout', async ({ page }) => {
  await mountSigim(page);
  await page.locator('#sig-mah-eni').fill('120');
  await page.locator('#sig-mah-boyi').fill('240');
  await page.locator('#sig-mat-eni').fill('20');
  await page.locator('#sig-mat-boyi').fill('2');
  await expect(page.locator('#sig-best')).toHaveText('0 ta');
  await expect(page.locator('#sig-message')).toContainText('Mahsulot materialdan katta');
});

test('Sigim UI stays usable at 390px in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await mountSigim(page);
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.locator('#sig-mah-eni').fill('9,5');
  await page.locator('#sig-mah-boyi').fill('5,5');
  await page.locator('#sig-mat-eni').fill('44');
  await page.locator('#sig-mat-boyi').fill('31');
  await expect(page.locator('#sig-best')).not.toHaveText('0 ta');
  const overflow = await page.locator('#kalk-sigim').evaluate(el => el.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
