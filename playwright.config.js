// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Poligrafiya CRM — Playwright konfiguratsiya
 * Parollar: GitHub Secrets orqali environment variable sifatida keladi
 * Lokal: .env fayliga yozing (git ignore da bo'lsin)
 */

module.exports = defineConfig({
  testDir: './tests',

  // Barcha testlar parallel emas — Supabase rate limit uchun
  fullyParallel: false,
  workers: 1,

  // CI da retry
  retries: process.env.CI ? 2 : 0,

  // Har test uchun timeout
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-results.json' }],
  ],

  use: {
    // Base URL: GitHub Secret yoki lokal
    baseURL: process.env.BASE_URL || 'https://ravshanrakhmatullaev.github.io/poligrafiya',

    // Screenshot va video faqat xato bo'lsa
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    trace:      'retain-on-failure',

    // Headless mode (CI da)
    headless: true,

    // Viewport
    viewport: { width: 1280, height: 800 },

    // Network xatolarni loglash uchun
    ignoreHTTPSErrors: false,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile test (ixtiyoriy, CI da o'chirish mumkin)
    // {
    //   name: 'mobile-chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  // Artifact saqlash papkasi
  outputDir: 'test-results/',
});
