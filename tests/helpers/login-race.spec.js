// @ts-check
const { test, expect } = require('@playwright/test');
const { dismissOnboarding, ONBOARDING } = require('./login');

/**
 * Race-condition regression test for dismissOnboarding().
 *
 * tests/fixtures/onboarding-race.html reproduces the exact shape that broke
 * CI: the onboarding screen is hidden when the page loads and only becomes
 * visible after a delay (simulating the app's async login round-trip).
 * dismissOnboarding() must wait for it and close it — a one-shot
 * isVisible() check would see it still hidden and no-op, exactly like the
 * bug this test guards against.
 */
const DELAY_CASES_MS = [1000, 2000, 3000];

for (const delayMs of DELAY_CASES_MS) {
  test(`dismissOnboarding onboarding ${delayMs}ms kechikib chiqsa ham topadi va yopadi`, async ({ page }) => {
    const onboarding = ONBOARDING.admin;
    const screenId = onboarding.screen.slice(1);
    await page.goto(`/tests/fixtures/onboarding-race.html?screen=${screenId}&delay=${delayMs}`);

    // At load time the screen must still be hidden — this is the exact
    // instant a one-shot isVisible() check used to race and lose.
    await expect(page.locator(onboarding.screen)).toBeHidden();

    await dismissOnboarding(page, onboarding);

    await expect(page.locator(onboarding.screen)).toBeHidden();
    await expect(page.locator('#app-screen')).toBeVisible();
  });
}

test('dismissOnboarding onboarding hech qachon chiqmasa xato bermasdan davom etadi', async ({ page }) => {
  const onboarding = ONBOARDING.admin;
  // No ?screen= param — the fixture never reveals any onboarding screen.
  await page.goto('/tests/fixtures/onboarding-race.html');

  await expect(dismissOnboarding(page, onboarding)).resolves.toBeUndefined();
  await expect(page.locator(onboarding.screen)).toBeHidden();
});

test('admin, dizayner va production uchun bir xil helper ishlaydi', async ({ page }) => {
  for (const [role, onboarding] of Object.entries(ONBOARDING)) {
    const screenId = onboarding.screen.slice(1);
    await page.goto(`/tests/fixtures/onboarding-race.html?screen=${screenId}&delay=1500`);

    await expect(page.locator(onboarding.screen), `${role}: onboarding hali ko'rinmasligi kerak`).toBeHidden();

    await dismissOnboarding(page, onboarding);

    await expect(page.locator(onboarding.screen), `${role}: onboarding yopilishi kerak`).toBeHidden();
    await expect(page.locator('#app-screen'), `${role}: app-screen ko'rinishi kerak`).toBeVisible();
  }
});
