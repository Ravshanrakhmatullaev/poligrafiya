// @ts-check
const { test, expect } = require('@playwright/test');

const USERS = {
  boshlangich: 'ra.ravshan1998+umidjon@gmail.com',
  tajriba: 'ra.ravshan1998+rashidulloh@gmail.com',
  professional: 'ra.ravshan1998+abror@gmail.com',
};

const TABLES = {
  tajriba: [
    [0, 29999999, 0],
    [30000000, 44999999, 200000],
    [45000000, 59999999, 400000],
    [60000000, 79999999, 700000],
    [80000000, 99999999, 1000000],
    [100000000, Infinity, 1500000],
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
      tajriba: { daraja: 'tajriba', maqsad: 45000000, fiks: 1800000, bonus: 700000, total: 2500000 },
      professional: { daraja: 'professional', maqsad: 60000000, fiks: 1000000, bonus: 2400000, total: 3400000 },
    });
  });

  // Biznes inварianti: professional faqat lavozim uchun ortiqcha olmaydi (<25mln da
  // tajribadan kam), lekin >=25mln sotuvda AYNI sotuv summasida tajriba darajasidagi
  // xodimdan DOIM ko'proq topadi (fiksa + joriy bonus jami bo'yicha).
  test('invariant: >=25mln da professional jami > tajriba jami; <25mln da kam', async ({ page }) => {
    const rows = await page.evaluate(({ proEmail, tajEmail, points }) => points.map((amount) => {
      const pk = getKpi(proEmail), tk = getKpi(tajEmail);
      const pro = pk.fiks + getCurrentBonus(proEmail, amount).bonus;
      const taj = tk.fiks + getCurrentBonus(tajEmail, amount).bonus;
      return { amount, pro, taj };
    }), {
      proEmail: USERS.professional, tajEmail: USERS.tajriba,
      // tajriba (30/45/60/80/100M) va professional (25/40/50/70/90M) chegaralari
      // kesishgan barcha sub-intervallarni qamrab oluvchi nuqtalar:
      points: [0, 10000000, 24999999, 25000000, 30000000, 39999999, 40000000, 44999999,
               45000000, 49999999, 50000000, 59999999, 60000000, 69999999, 70000000,
               79999999, 80000000, 89999999, 90000000, 99999999, 100000000, 150000000],
    });
    for (const r of rows) {
      if (r.amount < 25000000) expect(r.pro, `@${r.amount}`).toBeLessThan(r.taj);
      else expect(r.pro, `@${r.amount}`).toBeGreaterThan(r.taj);
    }
  });

  test("professional oxirgi tier labeli 'Elita natija' (tajriba 'Elita daraja' tegilmagan)", async ({ page }) => {
    const labels = await page.evaluate(() => ({
      pro: KPI_BONUS.professional[KPI_BONUS.professional.length - 1].label,
      taj: KPI_BONUS.tajriba[KPI_BONUS.tajriba.length - 1].label,
    }));
    expect(labels.pro).toBe('Elita natija');
    expect(labels.taj).toBe('Elita daraja');
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
