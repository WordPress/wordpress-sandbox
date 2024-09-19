import { expect, Page } from '../playground-fixtures.ts';

export const expandSiteView = async (page: Page) => {
	const openSiteButton = page.locator('div[title="Open site"]');
	await expect(openSiteButton).toBeVisible();
	await openSiteButton.click();
};

export const openNewSiteModal = async (page: Page) => {
	const addPlaygroundButton = page.locator('button.components-button', {
		hasText: 'Add Playground',
	});
	await expect(addPlaygroundButton).toBeVisible();
	await addPlaygroundButton.click();
};

export const clickCreateInNewSiteModal = async (page: Page) => {
	const createTempPlaygroundButton = page.locator(
		'button.components-button',
		{
			hasText: 'Create a temporary Playground',
		}
	);
	await expect(createTempPlaygroundButton).toBeVisible();
	await createTempPlaygroundButton.click();
};

export const getSiteTitle = async (page: Page) => {
	return await page
		.locator('h1[class*="_site-info-header-details-name"]')
		.innerText();
};

export const openEditSettings = async (page: Page) => {
	const editSettingsButton = page.locator('button.components-button', {
		hasText: 'Edit Playground settings',
	});
	await expect(editSettingsButton).toBeVisible();
	await editSettingsButton.click();
};

export const selectPHPVersion = async (page: Page, version: string) => {
	const phpVersionSelect = page.locator('select[name=phpVersion]');
	await expect(phpVersionSelect).toBeVisible();
	await phpVersionSelect.selectOption(version);
};

export const clickSaveInEditSettings = async (page: Page) => {
	const saveSettingsButton = page.locator(
		'button.components-button.is-primary',
		{
			hasText: 'Update',
		}
	);
	await expect(saveSettingsButton).toBeVisible();
	await saveSettingsButton.click();
};

export const selectWordPressVersion = async (page: Page, version: string) => {
	const wordpressVersionSelect = page.locator('select[name=wpVersion]');
	await expect(wordpressVersionSelect).toBeVisible();
	await wordpressVersionSelect.selectOption(version);
};

export const getSiteInfoRowValue = async (page: Page, key: string) => {
	return await page.locator('.site-info-row-value-' + key).innerText();
};

export const setNetworkingEnabled = async (page: Page, enabled: boolean) => {
	const checkbox = page.locator('input[name="withNetworking"]');
	await expect(checkbox).toBeVisible();
	if (enabled) {
		await checkbox.check();
	} else {
		await checkbox.uncheck();
	}
};

export const hasNetworkingEnabled = async (page: Page) => {
	return (await getSiteInfoRowValue(page, 'network-access')) === 'Yes';
};