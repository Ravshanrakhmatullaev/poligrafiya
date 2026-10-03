// @ts-check
// Ishlab chiqarish ishchi to'lovi: Plotter kesish & Konturniy pechat+kesish.
// Pure engine funksiyalari sahifada global (utils.js) — login shart emas.
const { test, expect } = require('@playwright/test');

const PLOTTER = [
  // [m², expected rate, expected payment]
  [0.1, 10000, 1000], [0.5, 10000, 5000], [1, 10000, 10000], [9.9, 10000, 99000],
  [9.999, 10000, 99990], [10, 8000, 80000], [19.9, 8000, 159200], [19.999, 8000, 159992],
  [20, 7000, 140000], [100, 7000, 700000],
];
const KONTUR = [
  // [m², rate, payment, minApplied]
  [0.1, 20000, 20000, true], [0.3, 20000, 20000, true], [0.5, 20000, 20000, true], [0.999, 20000, 20000, true],
  [1, 20000, 20000, false], [9.9, 20000, 198000, false], [9.999, 20000, 199980, false],
  [10, 15000, 150000, false], [19.9, 15000, 298500, false], [19.999, 15000, 299985, false],
  [20, 12000, 240000, false], [39.9, 12000, 478800, false], [39.999, 12000, 479988, false],
  [40, 10000, 400000, false], [99.9, 10000, 999000, false], [100, 10000, 1000000, false],
  [100.1, 10000, 1001000, false], [120, 10000, 1200000, false],
];
const INVALID = ['', 0, -5, 'abc', null, undefined];

test.describe('Ishlab chiqarish ishchi to\'lovi — plotter & kontur', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForLoadState('domcontentloaded'); });

  test('Plotter kesish: butun-ish tarif chegaralari (minimal qoida YO\'Q)', async ({ page }) => {
    const actual = await page.evaluate(pts => pts.map(([a]) => {
      const r = calcPlotterKesish(a); return { rate: r.rate, payment: r.payment, min: r.minApplied, ok: r.ok };
    }), PLOTTER);
    const expected = PLOTTER.map(([, rate, payment]) => ({ rate, payment, min: false, ok: true }));
    expect(actual).toEqual(expected);
  });

  test('Plotter kesish: noto\'g\'ri kiritish rad etiladi', async ({ page }) => {
    const bad = await page.evaluate(vals => vals.map(v => calcPlotterKesish(v).ok), INVALID);
    expect(bad).toEqual(INVALID.map(() => false));
  });

  test('Konturniy pechat+kesish: tarif chegaralari + 1 m² dan kichikda min 20 000', async ({ page }) => {
    const actual = await page.evaluate(pts => pts.map(([a]) => {
      const r = calcKonturPechatKesish(a); return { rate: r.rate, payment: r.payment, min: r.minApplied, ok: r.ok };
    }), KONTUR);
    const expected = KONTUR.map(([, rate, payment, min]) => ({ rate, payment, min, ok: true }));
    expect(actual).toEqual(expected);
  });

  test('Konturniy: noto\'g\'ri kiritish rad etiladi', async ({ page }) => {
    const bad = await page.evaluate(vals => vals.map(v => calcKonturPechatKesish(v).ok), INVALID);
    expect(bad).toEqual(INVALID.map(() => false));
  });

  test('cm → m² konvertatsiya (eni×bo\'yi×soni / 10000)', async ({ page }) => {
    const r = await page.evaluate(() => ({
      a: areaFromCm(100, 100, 1), b: areaFromCm(50, 40, 3), c: areaFromCm(200, 150, 2),
      z1: areaFromCm(0, 100, 1), z2: areaFromCm(100, 100, 0),
    }));
    expect(r).toEqual({ a: 1, b: 0.6, c: 6, z1: 0, z2: 0 });
  });

  test('tarif yagona manba — utils.js dagi jadvallar (boshqa joyda dublikat yo\'q)', async ({ page }) => {
    const src = await page.evaluate(() => ({
      plotter: typeof PLOTTER_KESISH_TIERS !== 'undefined' ? PLOTTER_KESISH_TIERS.length : null,
      kontur: typeof KONTUR_PK_TIERS !== 'undefined' ? KONTUR_PK_TIERS.length : null,
      min: typeof KONTUR_PK_MIN !== 'undefined' ? KONTUR_PK_MIN : null,
    }));
    expect(src).toEqual({ plotter: 3, kontur: 4, min: 20000 });
  });

  // Ishlab chiqarish UI: jonli preview + jami + doimiy ogohlantirish + save payload.
  test('ishlab UI: plotter/kontur preview, jami, ogohlantirish va save payload', async ({ page }) => {
    const r = await page.evaluate(() => {
      currentUser = { id: 'ui-test', email: 'ra.ravshan1998+jorabek@gmail.com' };
      currentRole = 'ishlab';
      initIshlabPanel();
      showScreen('app'); showPanel('ishlab');
      plkD = [{ nom: 'A', kv: '9.9' }, { nom: 'B', kv: '20' }]; // 99000 + 140000 = 239000
      kpkD = [{ nom: 'C', kv: '0.3' }, { nom: 'D', kv: '10' }]; // 20000(min) + 150000 = 170000
      ekoD = [{ nom: '', kv: '' }]; prD = [{ key: Object.keys(PR)[0], miq: '', ex: false }]; uvD = [{ nom: '', sig: '', don: '' }];
      renderIshlab();
      const warn = document.getElementById('plotter-kontur-warning');
      let captured = null; createHistoryItem = async (row) => { captured = row; return { id: 'x' }; };
      showNotify = () => {}; loadHistory = async () => {};
      return {
        plotterRows: document.querySelectorAll('#plotter-rows .ui').length,
        konturRows: document.querySelectorAll('#kontur-rows .ui').length,
        plotterGrand: document.getElementById('plotter-grand').textContent.replace(/[^0-9]/g, ''),
        konturGrand: document.getElementById('kontur-grand').textContent.replace(/[^0-9]/g, ''),
        warnVisible: !!warn && getComputedStyle(warn).display !== 'none' && warn.offsetHeight > 0,
        warnTexts: document.querySelectorAll('#plotter-kontur-warning li').length,
        minBadge: /min 20 000/.test(document.getElementById('kontur-rows').innerHTML),
      };
    });
    expect(r.plotterRows).toBe(2);
    expect(r.konturRows).toBe(2);
    expect(r.plotterGrand).toBe('239000');
    expect(r.konturGrand).toBe('170000');
    expect(r.warnVisible).toBe(true);
    expect(r.warnTexts).toBe(3);
    expect(r.minBadge).toBe(true);

    const saved = await page.evaluate(async () => {
      let captured = null; createHistoryItem = async (row) => { captured = row; return { id: 'x' }; };
      showNotify = () => {}; loadHistory = async () => {};
      plkD = [{ nom: 'A', kv: '9.9' }]; kpkD = [{ nom: 'C', kv: '0.3' }];
      ekoD = [{ nom: '', kv: '' }]; prD = [{ key: Object.keys(PR)[0], miq: '', ex: false }]; uvD = [{ nom: '', sig: '', don: '' }];
      renderIshlab();
      await saveOnly('ishlab');
      return captured && { type: captured.type, total: captured.total_jami,
        plk: captured.data.plkRows, kpk: captured.data.kpkRows };
    });
    expect(saved.type).toBe('ishlab');
    expect(saved.total).toBe(119000); // 99000 + 20000(min), no duplicate contour lines
    expect(saved.plk).toEqual([{ nom: 'A', kv: 9.9, rate: 10000, payment: 99000 }]);
    expect(saved.kpk).toEqual([{ nom: 'C', kv: 0.3, rate: 20000, payment: 20000, minApplied: true }]);
  });
});
