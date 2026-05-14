import { test, expect } from '@playwright/test';

const routes = [
  { hash: '#dashboard', title: 'Dashboard' },
  { hash: '#providers', title: 'Providers' },
  { hash: '#models', title: 'Models' },
  { hash: '#traffic', title: 'Traffic' },
  { hash: '#keys', title: 'Keys' },
  { hash: '#chat', title: 'Chat' },
  { hash: '#config', title: 'Config' },
];

test.describe('web-panel smoke', () => {
  for (const route of routes) {
    test(`opens ${route.hash}`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', message => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', error => {
        consoleErrors.push(String(error));
      });

      await page.goto(`/${route.hash}`);
      await expect(page.locator('#page-title')).toHaveText(route.title);
      await expect(page.locator('#content')).toBeVisible();
      await expect(page.locator('.empty-state-title')).not.toHaveText(/template is missing/i);
      expect(consoleErrors, `Console errors on ${route.hash}: ${consoleErrors.join('\n')}`).toEqual([]);
    });
  }

  test('chat view shows core controls', async ({ page }) => {
    await page.goto('/#chat');

    await expect(page.getByText('History')).toBeVisible();
    await expect(page.getByLabel('Model')).toBeVisible();
    await expect(page.getByLabel('System prompt')).toBeVisible();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('providers view shows live OAuth connecting state without reload', async ({ page }) => {
    let authFilesState = [];
    let authStatusPolls = 0;

    await page.route('**/v0/management/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          'api-keys': ['test-client-key'],
          'openai-compatibility': [],
        }),
      });
    });

    await page.route('**/v0/management/auth-files', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: authFilesState }),
      });
    });

    await page.route('**/v0/management/codex-auth-url', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'http://127.0.0.1:8317/codex/login?state=test-oauth-state',
        }),
      });
    });

    await page.route('**/v0/management/get-auth-status?state=test-oauth-state', async route => {
      authStatusPolls += 1;
      if (authStatusPolls >= 2) {
        authFilesState = [{ provider: 'codex', name: 'codex' }];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'wait' }),
      });
    });

    await page.addInitScript(() => {
      window.open = () => ({ close() {} });
    });

    await page.goto('/#providers');

    const oauthHeading = page.getByRole('heading', { name: 'OAuth Providers' });
    await expect(oauthHeading).toBeVisible();
    const oauthHeader = oauthHeading.locator('..');
    await expect(oauthHeader).toContainText('0 connected');
    await expect(oauthHeader).toContainText('7 available');

    await page.getByRole('button', { name: '+ Add OAuth Provider' }).click();
    await page.locator('#modal-root').getByRole('button', { name: 'Connect' }).click();

    await expect(page.locator('#modal-overlay')).toBeHidden();
    await expect(page.getByText('OAuth authorization in progress')).toBeVisible();
    await expect(page.getByText('Waiting', { exact: true })).toBeVisible();

    const codexCard = page.locator('.card', { hasText: 'OpenAI (ChatGPT/Codex)' });
    await expect(codexCard.getByRole('button', { name: 'Connecting…' })).toBeVisible();
    await expect(codexCard.getByText('Waiting for callback and token save')).toBeVisible();
    await expect(codexCard.getByText('CONNECTED')).toBeVisible();
    await expect(page.getByText('1 connected · 7 available')).toBeVisible();
  });
});
