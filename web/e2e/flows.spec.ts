import { expect, test } from '@playwright/test';

test('an administrator generates a report and its reference verifies', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Administrator' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('admin');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin123!');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Headquarters Administrator' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Volunteers' }).click();
  await page.getByRole('button', { name: 'Records' }).click();
  await page.getByRole('button', { name: 'Generate service report' }).click();

  await expect(page.getByRole('heading', { name: 'Service report' })).toBeVisible();
  const openLink = page.getByRole('link', { name: 'Open verification page' });
  const href = await openLink.getAttribute('href');
  expect(href).toMatch(/^\/verify\/[0-9a-f]{48}$/);

  await page.goto(href!);
  await expect(page.getByText('Reference verified')).toBeVisible();
});

test('a volunteer signs in and sees the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Volunteer' }).click();
  await page.getByRole('textbox', { name: 'Registered number' }).fill('ERC-1000');
  await page.getByRole('textbox', { name: 'Password' }).fill('volunteer-pass-123');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Demo Volunteer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'My time' })).toBeVisible();
});