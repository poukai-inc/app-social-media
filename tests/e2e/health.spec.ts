import { test, expect } from '@playwright/test';

/**
 * Placeholder E2E to prove the Playwright harness works. Real user journeys
 * (signup → org → connect → generate → schedule → publish) land in BACKLOG #79.
 * Skipped unless E2E_BASE_URL is set, so CI without a running app stays green.
 */
test('health endpoint responds ok', async ({ request }) => {
  test.skip(!process.env.E2E_BASE_URL, 'E2E_BASE_URL not set — skipping live E2E');

  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});
