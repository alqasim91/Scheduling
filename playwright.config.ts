import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/** The preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH (never download one). */
function chromiumPath(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(base)) return undefined
  const dirs = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse()
  for (const dir of dirs) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const path = join(base, dir, rel)
      if (existsSync(path)) return path
    }
  }
  return undefined
}

const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 1100 },
    launchOptions: { executablePath: chromiumPath() },
    trace: 'retain-on-failure',
  },
  // The production build, served by vite preview (`npm run e2e` builds first).
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
