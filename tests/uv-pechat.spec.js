// @ts-check
// UV pechat — YANGI "List soni" rejimi (biznes qoidasi 2026-10-17).
// Pechatnik bevosita bosilgan LIST sonini kiritadi; jami = list × uvNarx(list).
// Eski yozuvlar (sig/don) 0.2/0.5 list tariflari bilan O'ZGARMASDAN qoladi.
const { test, expect } = require('@playwright/test');

test.describe('UV pechat — list soni rejimi', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  // Talab #8: 1, 2, 5, 6, 10, 11, 30, 50 list
  test('calcUvList: tier chegaralari to\'g\'ri (1,2,5,6,10,11,30,50)', async ({ page }) => {
    const got = await page.evaluate((lists) => lists.map(n => {
      const r = calcUvList(n);
      return { list: r.list, np: r.np, jami: r.jami };
    }), [1, 2, 5, 6, 10, 11, 30, 50]);

    expect(got).toEqual([
      { list: 1,  np: 40000, jami: 40000 },   // 1-5 → 40 000
      { list: 2,  np: 40000, jami: 80000 },
      { list: 5,  np: 40000, jami: 200000 },
      { list: 6,  np: 25000, jami: 150000 },  // 6-10 → 25 000
      { list: 10, np: 25000, jami: 250000 },
      { list: 11, np: 20000, jami: 220000 },  // 11+ → 20 000
      { list: 30, np: 20000, jami: 600000 },  // menejer talabi: 30 list = 600 000
      { list: 50, np: 20000, jami: 1000000 },
    ]);
  });

  test('30 list = 600 000 (menejer talabi)', async ({ page }) => {
    const jami = await page.evaluate(() => calcUvList(30).jami);
    expect(jami).toBe(600000);
  });

  test('faqat butun list qabul qilinadi (floor); 0/bo\'sh = 0', async ({ page }) => {
    const r = await page.evaluate(() => ({
      frac: calcUvList(30.9).jami,   // floor(30.9)=30
      zero: calcUvList(0).jami,
      neg:  calcUvList(-5).jami,
      empty: calcUvList('').jami,
      str:  calcUvList('11').jami,
    }));
    expect(r.frac).toBe(600000);
    expect(r.zero).toBe(0);
    expect(r.neg).toBe(0);
    expect(r.empty).toBe(0);
    expect(r.str).toBe(220000);
  });

  // Talab #6/#7: eski yozuvlar (sig/don) O'ZGARMAYDI — router ularni calcUv ga yo'naltiradi.
  test('router: yangi (list) va eski (sig/don) yozuvlar farqlanadi', async ({ page }) => {
    const r = await page.evaluate(() => ({
      yangi30:   calcUvRow({ list: 30 }).jami,        // yangi → 600 000
      yangiMode: calcUvRow({ list: 30 }).mode,
      eski1_30:  calcUvRow({ sig: 1,  don: 30 }).jami, // eski → 600 000 (30 to'liq list)
      eski60_30: calcUvRow({ sig: 60, don: 30 }).jami, // eski → 30 000 (0.5 list saqlanadi)
      eskiMode:  calcUvRow({ sig: 60, don: 30 }).mode,
    }));
    expect(r.yangi30).toBe(600000);
    expect(r.yangiMode).toBe('list');
    expect(r.eski1_30).toBe(600000);
    expect(r.eski60_30).toBe(30000);   // eski 0.2/0.5 tarif saqlangan
    expect(r.eskiMode).toBe('sigdon');
  });

  test('eski 0.2/0.5 list tariflari saqlangan (regressiya)', async ({ page }) => {
    const r = await page.evaluate(() => ({
      half: calcUvRow({ sig: 60, don: 30 }).jami,   // 0.5 list = 30 000
      fifth: calcUvRow({ sig: 100, don: 10 }).jami,  // 0.1 -> <=0.125 -> 0.2 list = 20 000
    }));
    expect(r.half).toBe(30000);
    expect(r.fifth).toBe(20000);
  });

  // Talab #5: panel/saqlash/tarix/hisobot bir xil mantiq (calcUvRow) ishlatadi.
  test('UI render: list kiritilganda natija to\'g\'ri ko\'rsatiladi', async ({ page }) => {
    const out = await page.evaluate(() => {
      // renderIshlab currentUser va bir nechta massivga bog'liq — to'liq holat beramiz.
      currentUser = { id: 'u1', email: 'x@example.com' };
      allHistory = [];
      dizD = []; prD = []; adD = []; ekoD = [];
      try { plkD = []; } catch (e) {}
      try { kpkD = []; } catch (e) {}
      showScreen('app');
      uvD = [{ nom: 'Test', list: 30, brak: '' }];
      renderIshlab();
      return {
        grand: (document.getElementById('uv-grand') || {}).textContent || '',
        rowsText: (document.getElementById('uv-rows') || {}).innerText || '',
      };
    });
    expect(out.grand.replace(/[\s,]/g, '')).toContain('600000');
    expect(out.rowsText).toContain('30 list');
  });
});
