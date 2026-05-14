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
});
