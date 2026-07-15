// @ts-check
const { expect } = require('@playwright/test');

/**
 * Shared real-login flow for every spec file.
 *
 * A fresh Playwright browser context has no sessionStorage "seen" flag, so
 * the app's first-time "yo'riqnoma" (onboarding) screen shows on every CI
 * run for every role — this was the actual root cause of every test
 * timing out on `#app-screen` in the previous run (login itself always
 * succeeded; the onboarding screen was just in the way). This helper
 * handles that screen as part of the real UI flow — it never pre-seeds
 * sessionStorage to skip it artificially.
 *
 * Onboarding screen ids are read directly from index.html (DOM-based, not
 * text-matched, so this doesn't break if copy wording changes):
 *   - admin:      #admin-yoriq-screen    / #admin-agree-chk / #admin-agree-btn (enterAdminApp())
 *   - designer:   #dizayner-yoriq-screen / #diz-agree-chk   / #diz-agree-btn   (enterDizaynerApp())
 *   - production: #yoriq-screen          / #agree-chk       / #agree-btn      (enterApp()) — the
 *     generic onboarding screen, shown for any role without its own dedicated one.
 */
const ONBOARDING = {
  admin:      { screen: '#admin-yoriq-screen',    checkbox: '#admin-agree-chk', button: '#admin-agree-btn' },
  designer:   { screen: '#dizayner-yoriq-screen',  checkbox: '#diz-agree-chk',   button: '#diz-agree-btn' },
  production: { screen: '#yoriq-screen',           checkbox: '#agree-chk',       button: '#agree-btn' },
};

// If the given onboarding screen is showing, check its agreement checkbox
// and click through it. If it never shows (returning session, or this
// role doesn't get one), this is a no-op — not an error.
async function dismissOnboarding(page, onboarding) {
  if (!onboarding) return;
  const screenEl = page.locator(onboarding.screen);
  const isShown = await screenEl.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!isShown) return;

  const chk = page.locator(onboarding.checkbox);
  if (await chk.isVisible().catch(() => false)) await chk.check();
  await page.locator(onboarding.button).click();
  await expect(screenEl).toBeHidden({ timeout: 5_000 });
}

// Low-level: perform the real login UI flow with explicit credentials and
// an explicit onboarding descriptor (or none). Does not read env vars or
// skip — callers that want a specific skip message (e.g. login.spec.js)
// call this directly after their own env-var check.
async function login(page, email, password, onboarding) {
  await page.goto('');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[type="email"], #email').first().fill(email);
  await page.locator('input[type="password"], #password').first().fill(password);
  await page.locator('button[onclick*="doLogin"]').first().click();

  await dismissOnboarding(page, onboarding);

  await expect(page.locator('#app-screen')).toBeVisible({ timeout: 15_000 });
}

// Convenience role wrappers — read the matching env vars, return `false`
// (no navigation attempted) if either is missing so callers can
// `test.skip()`, otherwise perform the full real login flow and return
// `true`. This is the pattern every beforeEach-style caller wants.
async function loginAsAdmin(page) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return false;
  await login(page, email, password, ONBOARDING.admin);
  return true;
}

async function loginAsDesigner(page) {
  const email = process.env.DESIGNER_EMAIL;
  const password = process.env.DESIGNER_PASSWORD;
  if (!email || !password) return false;
  await login(page, email, password, ONBOARDING.designer);
  return true;
}

async function loginAsProduction(page) {
  const email = process.env.PRODUCTION_EMAIL;
  const password = process.env.PRODUCTION_PASSWORD;
  if (!email || !password) return false;
  await login(page, email, password, ONBOARDING.production);
  return true;
}

module.exports = { login, loginAsAdmin, loginAsDesigner, loginAsProduction, ONBOARDING };
