import { expect, test } from '@playwright/test';

const VALID_REF =
  process.env.E2E_VERIFY_REF ?? '964c73d1cede13b0ea3ac5451aa570c633a9747d3306a085';

test('a valid reference renders the frozen service report', async ({ page }) => {
  await page.goto(`/verify/${VALID_REF}`);
  await expect(page.getByRole('heading', { name: 'Verify a service report' })).toBeVisible();
  await expect(page.getByText('Reference verified')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Service hours report' })).toBeVisible();
  await expect(page.getByText('Approved total')).toBeVisible();
  await expect(page.getByText('Service days')).toBeVisible();
});

test('an unknown reference renders the single invalid state', async ({ page }) => {
  await page.goto('/verify/0000000000000000000000000000000000000000000000000000000000000000');
  await expect(page.getByText('Reference not found')).toBeVisible();
  await expect(page.getByText(/does not exist, was revoked, or is malformed/)).toBeVisible();
});

test('pasting a reference into the search box verifies it', async ({ page }) => {
  await page.goto('/verify/0000000000000000000000000000000000000000000000000000000000000000');
  await expect(page.getByText('Reference not found')).toBeVisible();
  const box = page.getByRole('textbox', { name: 'Reference' });
  await box.fill(VALID_REF);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Reference verified')).toBeVisible();
  await expect(page.getByText('Reference not found')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/verify/${VALID_REF}$`));
});