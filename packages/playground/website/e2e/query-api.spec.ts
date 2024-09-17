import { test, expect } from './wordpress-fixtures';

// We can't import the WordPress versions directly from the remote package
// because of ESModules vs CommonJS incompatibilities. Let's just import the
// JSON file directly. @ts-ignore
// eslint-disable-next-line @nx/enforce-module-boundaries
import * as MinifiedWordPressVersions from '../../wordpress-builds/src/wordpress/wp-versions.json';

const LatestSupportedWordPressVersion = Object.keys(
	MinifiedWordPressVersions
).filter((x) => !['nightly', 'beta'].includes(x))[0];

test('should load PHP 8.0 by default', async ({ page, wordpressPage }) => {
	// Navigate to the page
	await page.goto('./?url=/phpinfo.php');

	// Find the h1 element and check its content
	const h1 = wordpressPage.locator('h1.p').first();
	await expect(h1).toContainText('PHP Version 8.0');
});

test.only('should load WordPress latest by default', async ({
	page,
	wordpressPage,
}) => {
	await page.goto('./?url=/wp-admin/');

	const expectedBodyClass =
		'branch-' + LatestSupportedWordPressVersion.replace('.', '-');
	console.log(expectedBodyClass);
	const body = wordpressPage.locator(`body.${expectedBodyClass}`);
	await expect(body).toContainText('Dashboard');
});
