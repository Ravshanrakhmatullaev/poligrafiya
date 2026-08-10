// PRICE unit/smoke tests use in-memory pages and never call production.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'price-module.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name:'chromium', use:{ ...devices['Desktop Chrome'] } }],
  outputDir: 'test-results/price-module/',
});
