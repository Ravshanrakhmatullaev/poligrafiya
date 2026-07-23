// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * FOIZ TIER TESTS
 *
 * Pure calculation tests against the real getDesignerRate()/getFoiz()
 * functions (config.js FOIZ table + utils.js) — loaded exactly as the app
 * loads them, via a real page navigation, not a re-implementation. Catches
 * the 2026-07-22 bug: top 4 tiers had wrong percentages (3%/2.5%/2%/1.5%
 * instead of 3.5%/3.3%/3.2%/3%) and boundaries didn't match the required
 * tier table. No login needed — these are pure functions with no Supabase
 * dependency.
 */

test.describe('Dizayner komissiya foizi bosqichlari', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
  });

  const EXAMPLES = [
    [50000, 0.20, 10000],
    [100000, 0.15, 15000],
    [300000, 0.12, 36000],
    [700000, 0.10, 70000],
    [1500000, 0.08, 120000],
    [2500000, 0.06, 150000],
    [3500000, 0.055, 192500],
    [4500000, 0.05, 225000],
    [7000000, 0.04, 280000],
    [20000000, 0.035, 700000],
    [40000000, 0.033, 1320000],
    [70000000, 0.032, 2240000],
    [100000000, 0.03, 3000000],
  ];

  for (const [amount, expectedDecimal, expectedResult] of EXAMPLES) {
    test(`${amount} so'm -> decimal ${expectedDecimal}, natija ${expectedResult}`, async ({ page }) => {
      const result = await page.evaluate((a) => {
        const r = getDesignerRate(a);
        return { decimal: r.decimal, amount: Math.round(a * r.decimal) };
      }, amount);
      expect(result.decimal).toBe(expectedDecimal);
      expect(result.amount).toBe(expectedResult);
    });
  }

  const BOUNDARIES = [
    [99000, 20], [99001, 15],
    [249000, 15], [249001, 12],
    [499000, 12], [499001, 10],
    [999000, 10], [999001, 8],
    [1999000, 8], [1999001, 6],
    [2999000, 6], [2999001, 5.5],
    [3999000, 5.5], [3999001, 5],
    [4999000, 5], [4999001, 4],
    [9999000, 4], [9999001, 3.5],
    [29999000, 3.5], [29999001, 3.3],
    [49999000, 3.3], [49999001, 3.2],
    [99999000, 3.2], [100000000, 3],
  ];

  for (const [amount, expectedPercent] of BOUNDARIES) {
    test(`chegara: ${amount} -> ${expectedPercent}%`, async ({ page }) => {
      const percent = await page.evaluate((a) => getDesignerRate(a).percent, amount);
      expect(percent).toBe(expectedPercent);
    });
  }

  test('bo\'shliq yoki ustma-ustlik yo\'q — barcha 13 bosqich ketma-ket', async ({ page }) => {
    const gaps = await page.evaluate(() => {
      const problems = [];
      for (let i = 0; i < FOIZ.length - 1; i++) {
        if (FOIZ[i + 1][0] !== FOIZ[i][1] + 1) problems.push(`tier ${i} max=${FOIZ[i][1]} vs tier ${i+1} min=${FOIZ[i+1][0]}`);
      }
      return problems;
    });
    expect(gaps).toEqual([]);
  });

  test('0/manfiy summa uchun getFoiz orqaga muvofiqlik ishlaydi', async ({ page }) => {
    const result = await page.evaluate(() => ({
      zero: getFoiz(0),
      backCompat: getFoiz(50000),
    }));
    expect(result.zero).toBe(0.20);
    expect(result.backCompat).toBe(0.20);
  });

  test('20% hech qachon 0.002 emas (regressiya: /100 ikki marta bo\'linish bugi)', async ({ page }) => {
    const decimal = await page.evaluate(() => getDesignerRate(50000).decimal);
    expect(decimal).toBe(0.20);
    expect(decimal).not.toBe(0.002);
  });
});
