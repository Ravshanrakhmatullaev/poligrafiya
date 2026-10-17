// @ts-check
const { test, expect } = require('@playwright/test');

const USERS = {
  boshlangich: 'ra.ravshan1998+umidjon@gmail.com',
  tajriba: 'ra.ravshan1998+rashidulloh@gmail.com',
  professional: 'ra.ravshan1998+abror@gmail.com',
};

const TABLES = {
  tajriba: [
    [0, 24999999, 0],
    [25000000, 39999999, 400000],
    [40000000, 49999999, 800000],
    [50000000, 69999999, 1200000],
    [70000000, 89999999, 1800000],
    [90000000, Infinity, 2500000],
  ],
  professional: [
    [0, 24999999, 0],
    [25000000, 39999999, 1200000],
    [40000000, 49999999, 1500000],
    [50000000, 69999999, 1800000],
    [70000000, 89999999, 2400000],
    [90000000, Infinity, 3000000],
  ],
};

test.describe('KPI bonus daraja mappingi', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
  });

  for (const level of ['tajriba', 'professional']) {
    test(`${level}: getCurrentBonus barcha tier chegaralarida to'g'ri`, async ({ page }) => {
      const actual = await page.evaluate(({ email, points }) => points.map((amount) => ({
        amount,
        bonus: getCurrentBonus(email, amount)?.bonus ?? null,
      })), {
        email: USERS[level],
        points: TABLES[level].flatMap(([min, max]) => max === Infinity ? [min] : [min, max]),
      });

      const expected = TABLES[level].flatMap(([min, max, bonus]) =>
        max === Infinity ? [{ amount: min, bonus }] : [{ amount: min, bonus }, { amount: max, bonus }]
      );
      expect(actual).toEqual(expected);
    });

    test(`${level}: getNextBonus exact o'tish nuqtalarini qaytaradi`, async ({ page }) => {
      const actual = await page.evaluate(({ email, points }) => points.map((amount) => {
        const next = getNextBonus(email, amount);
        return next ? { min: next.min, bonus: next.bonus } : null;
      }), {
        email: USERS[level],
        points: TABLES[level].map(([min]) => min),
      });

      const expected = TABLES[level].map((_, index) => {
        const next = TABLES[level][index + 1];
        return next ? { min: next[0], bonus: next[2] } : null;
      });
      expect(actual).toEqual(expected);
    });
  }

  test('dashboard formulasi fiksa + joriy bonusni qo‘shadi', async ({ page }) => {
    const result = await page.evaluate(({ tajribaEmail, professionalEmail }) => {
      const calculate = (email, amount) => {
        const kpi = getKpi(email);
        const tier = getCurrentBonus(email, amount);
        return { daraja: kpi.daraja, maqsad: kpi.maqsad, fiks: kpi.fiks, bonus: tier.bonus, total: kpi.fiks + tier.bonus };
      };
      return {
        tajriba: calculate(tajribaEmail, 60000000),
        professional: calculate(professionalEmail, 70000000),
      };
    }, { tajribaEmail: USERS.tajriba, professionalEmail: USERS.professional });

    expect(result).toEqual({
      tajriba: { daraja: 'tajriba', maqsad: 45000000, fiks: 1800000, bonus: 1200000, total: 3000000 },
      professional: { daraja: 'professional', maqsad: 60000000, fiks: 1000000, bonus: 2400000, total: 3400000 },
    });
  });

  // Owner tasdiqlagan (2026-10-15) tajriba fiksa+bonus jami har bir bosqichda to'g'ri.
  // Fiksa doim 1 800 000; jami: 1.8M / 2.2M / 2.6M / 3.0M / 3.6M / 4.3M.
  test('tajriba fiksa + joriy bonus jami Owner jadvaliga mos', async ({ page }) => {
    const rows = await page.evaluate(({ email, points }) => points.map((amount) => {
      const kpi = getKpi(email);
      const tier = getCurrentBonus(email, amount);
      return { amount, fiks: kpi.fiks, bonus: tier.bonus, total: kpi.fiks + tier.bonus };
    }), {
      email: USERS.tajriba,
      points: [0, 24999999, 25000000, 39999999, 40000000, 49999999,
               50000000, 69999999, 70000000, 89999999, 90000000, 150000000],
    });
    expect(rows).toEqual([
      { amount: 0,         fiks: 1800000, bonus: 0,       total: 1800000 },
      { amount: 24999999,  fiks: 1800000, bonus: 0,       total: 1800000 },
      { amount: 25000000,  fiks: 1800000, bonus: 400000,  total: 2200000 },
      { amount: 39999999,  fiks: 1800000, bonus: 400000,  total: 2200000 },
      { amount: 40000000,  fiks: 1800000, bonus: 800000,  total: 2600000 },
      { amount: 49999999,  fiks: 1800000, bonus: 800000,  total: 2600000 },
      { amount: 50000000,  fiks: 1800000, bonus: 1200000, total: 3000000 },
      { amount: 69999999,  fiks: 1800000, bonus: 1200000, total: 3000000 },
      { amount: 70000000,  fiks: 1800000, bonus: 1800000, total: 3600000 },
      { amount: 89999999,  fiks: 1800000, bonus: 1800000, total: 3600000 },
      { amount: 90000000,  fiks: 1800000, bonus: 2500000, total: 4300000 },
      { amount: 150000000, fiks: 1800000, bonus: 2500000, total: 4300000 },
    ]);
  });

  // Professional jadvali bu commitda o'zgarmaganini himoyalaydi (regressiya).
  test("professional bonus jadvali o'zgarmagan (regressiya)", async ({ page }) => {
    const pro = await page.evaluate(() => KPI_BONUS.professional.map((t) => [t.min, t.max === Infinity ? 'Infinity' : t.max, t.bonus, t.label]));
    expect(pro).toEqual([
      [0, 24999999, 0, 'Minimal natija'],
      [25000000, 39999999, 1200000, "Rag'bat darajasi"],
      [40000000, 49999999, 1500000, 'Barqaror natija'],
      [50000000, 69999999, 1800000, 'Reja bajarilgan'],
      [70000000, 89999999, 2400000, 'Yuqori daraja'],
      [90000000, 'Infinity', 3000000, 'Elita natija'],
    ]);
  });

  test("tajriba oxirgi tier labeli 'Professionalga tayyor'; professional 'Elita natija'", async ({ page }) => {
    const labels = await page.evaluate(() => ({
      pro: KPI_BONUS.professional[KPI_BONUS.professional.length - 1].label,
      taj: KPI_BONUS.tajriba[KPI_BONUS.tajriba.length - 1].label,
    }));
    expect(labels.pro).toBe('Elita natija');
    expect(labels.taj).toBe('Professionalga tayyor');
  });

  test("boshlang'ich tier regressiya olmadi", async ({ page }) => {
    const bonuses = await page.evaluate((email) => [0, 15000000, 25000000, 30000000, 40000000, 60000000]
      .map((amount) => getCurrentBonus(email, amount).bonus), USERS.boshlangich);
    expect(bonuses).toEqual([0, 300000, 500000, 800000, 1200000, 1500000]);
  });

  test('dizayner FOIZ va bonus_50 ruxsat konfiguratsiyasi o‘zgarmadi', async ({ page }) => {
    const contracts = await page.evaluate(() => ({
      foiz: FOIZ.map(([min, max, rate]) => [min, max === Infinity ? 'Infinity' : max, rate]),
      bonus50: [...BONUS50_EMAILS],
    }));
    expect(contracts.foiz).toHaveLength(13);
    expect(contracts.foiz[0]).toEqual([0, 99000, 0.20]);
    expect(contracts.foiz[12]).toEqual([100000000, 'Infinity', 0.03]);
    expect(contracts.bonus50).toEqual([
      'ra.ravshan1998+abror@gmail.com',
      'ra.ravshan1998+rashidulloh@gmail.com',
    ]);
  });
});
