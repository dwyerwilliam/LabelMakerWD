import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  timeout: 45000,
  retries: 0,
});
