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
    // Base URL: agar BASE_URL aniq berilmasa, pastdagi webServer ishga
    // tushiradigan lokal statik serverga qarab test qilinadi — shu bilan
    // CI GitHub Pages'ning eski (hali deploy bo'lmagan) holatiga emas,
    // aynan shu commitdagi kodga qarab test qiladi.
    baseURL: process.env.BASE_URL || 'http://localhost:4173',

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

  // Lokal statik server — CI'da ham, lokalda ham avtomatik ishga tushadi
  // (agar allaqachon shu portda server ishlab tursa, lokalda qayta
  // ishlatiladi). BASE_URL aniq berilgan bo'lsa ham bu server baribir
  // ishga tushadi, lekin testlar shunda ham `use.baseURL` orqali BASE_URL'ga
  // qarab ishlaydi.
  webServer: {
    // Node-based (npx) — Windows'da ham, Ubuntu CI'da ham bir xil ishlaydi
    // (system Python nomlanishiga bog'liq emas — "python" Windows'da,
    // "python3" Ubuntu'da, ikkalasi ham bo'lmasligi mumkin).
    command: 'npx http-server . -p 4173 -s',
    url: 'http://localhost:4173',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
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
