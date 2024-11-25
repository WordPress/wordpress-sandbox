import { StepHandler } from '.';
import { unzipFile } from '@wp-playground/common';
import { logger } from '@php-wasm/logger';
import { resolveWordPressRelease } from '@wp-playground/wordpress';

/**
 * @inheritDoc setSiteLanguage
 * @hasRunnableExample
 * @example
 *
 * <code>
 * {
 * 		"step": "setSiteLanguage",
 * 		"language": "en_US"
 * }
 * </code>
 */
export interface SetSiteLanguageStep {
	step: 'setSiteLanguage';
	/** The language to set, e.g. 'en_US' */
	language: string;
}

/**
 * Infers the translation package URL for a given WordPress version.
 *
 * If it cannot be inferred, the latest translation package will be used instead.
 */
export const getWordPressTranslationUrl = async (
	wpVersion: string,
	language: string,
	latestBetaWordPressVersion?: string,
	latestStableWordPressVersion?: string
) => {
	/**
	 * Infer a WordPress version we can feed into the translations API based
	 * on the requested fully-qualified WordPress version.
	 *
	 * The translation API provides translations for:
	 *
	 * - all major.minor WordPress releases
	 * - all major.minor.patch WordPress releases
	 * - Latest beta/RC version – under a label like "6.6-RC". It's always "-RC".
	 *   There's no "-BETA1", "-RC1", "-RC2", etc.
	 *
	 * The API does not provide translations for "nightly", "latest", or
	 * old beta/RC versions.
	 *
	 * For example translations for WordPress 6.6-BETA1 or 6.6-RC1 are found under
	 * https://downloads.wordpress.org/translation/core/6.6-RC/en_GB.zip
	 */
	let resolvedVersion = null;
	if (wpVersion.match(/^(\d.\d(.\d)?)-(alpha|beta|nightly|rc).*$/i)) {
		// Translate "6.4-alpha", "6.5-beta", "6.6-nightly", "6.6-RC" etc.
		// to "6.6-RC"
		if (latestBetaWordPressVersion) {
			resolvedVersion = latestBetaWordPressVersion;
		} else {
			const resolved = await resolveWordPressRelease('beta');
			resolvedVersion = resolved!.version;
		}
		resolvedVersion = resolvedVersion
			// Remove the patch version, e.g. 6.6.1-RC1 -> 6.6-RC1
			.replace(/^(\d.\d)(.\d+)/i, '$1')
			// Replace "rc" and "beta" with "RC", e.g. 6.6-nightly -> 6.6-RC
			.replace(/(rc|beta).*$/i, 'RC');
	} else if (wpVersion.match(/^(\d+\.\d+)(?:\.\d+)?$/)) {
		// Use the version directly if it's a major.minor or major.minor.patch.
		resolvedVersion = wpVersion;
	} else {
		/**
		 * Use the latest stable version otherwise.
		 *
		 * We could actually fail at this point, but we'll take a wild guess instead
		 * and fall back to translations from the last official WordPress version.
		 *
		 * That may not always be useful. Let's reconsider this whenever someone
		 * reports a related issue.
		 */
		if (latestStableWordPressVersion) {
			resolvedVersion = latestStableWordPressVersion;
		} else {
			const resolved = await resolveWordPressRelease('latest');
			resolvedVersion = resolved!.version;
		}
	}
	if (!resolvedVersion) {
		throw new Error(
			`WordPress version ${wpVersion} is not supported by the setSiteLanguage step`
		);
	}
	return `https://downloads.wordpress.org/translation/core/${resolvedVersion}/${language}.zip`;
};

/**
 * Sets the site language and download translations.
 */
export const setSiteLanguage: StepHandler<SetSiteLanguageStep> = async (
	playground,
	{ language },
	progress
) => {
	progress?.tracker.setCaption(progress?.initialCaption || 'Translating');

	await playground.defineConstant('WPLANG', language);

	const docroot = await playground.documentRoot;

	const wpVersion = (
		await playground.run({
			code: `<?php
			require '${docroot}/wp-includes/version.php';
			echo $wp_version;
		`,
		})
	).text;

	const translations = [
		{
			url: await getWordPressTranslationUrl(wpVersion, language),
			type: 'core',
		},
	];

	const pluginListResponse = await playground.run({
		code: `<?php
		require_once('${docroot}/wp-load.php');
		require_once('${docroot}/wp-admin/includes/plugin.php');
		echo json_encode(
			array_values(
				array_map(
					function($plugin) {
						return [
							'slug'    => $plugin['TextDomain'],
							'version' => $plugin['Version']
						];
					},
					array_filter(
						get_plugins(),
						function($plugin) {
							return !empty($plugin['TextDomain']);
						}
					)
				)
			)
		);`,
	});

	const plugins = pluginListResponse.json;
	for (const { slug, version } of plugins) {
		translations.push({
			url: `https://downloads.wordpress.org/translation/plugin/${slug}/${version}/${language}.zip`,
			type: 'plugin',
		});
	}

	const themeListResponse = await playground.run({
		code: `<?php
		require_once('${docroot}/wp-load.php');
		require_once('${docroot}/wp-admin/includes/theme.php');
		echo json_encode(
			array_values(
				array_map(
					function($theme) {
						return [
							'slug'    => $theme->get('TextDomain'),
							'version' => $theme->get('Version')
						];
					},
					wp_get_themes()
				)
			)
		);`,
	});

	const themes = themeListResponse.json;
	for (const { slug, version } of themes) {
		translations.push({
			url: `https://downloads.wordpress.org/translation/theme/${slug}/${version}/${language}.zip`,
			type: 'theme',
		});
	}

	if (!(await playground.isDir(`${docroot}/wp-content/languages/plugins`))) {
		await playground.mkdir(`${docroot}/wp-content/languages/plugins`);
	}
	if (!(await playground.isDir(`${docroot}/wp-content/languages/themes`))) {
		await playground.mkdir(`${docroot}/wp-content/languages/themes`);
	}

	for (const { url, type } of translations) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(
					`Failed to download translations for ${type}: ${response.statusText}`
				);
			}

			let destination = `${docroot}/wp-content/languages`;
			if (type === 'plugin') {
				destination += '/plugins';
			} else if (type === 'theme') {
				destination += '/themes';
			}

			await unzipFile(
				playground,
				new File([await response.blob()], `${language}-${type}.zip`),
				destination
			);
		} catch (error) {
			/**
			 * If a core translation wasn't found we should throw an error because it
			 * means the language is not supported or the language code isn't correct.
			 */
			if (type === 'core') {
				throw new Error(
					`Failed to download translations for WordPress. Please check if the language code ${language} is correct. You can find all available languages and translations on https://translate.wordpress.org/.`
				);
			}
			/**
			 * Some languages don't have translations for themes and plugins and will
			 * return a 404 and a CORS error. In this case, we can just skip the
			 * download because Playground can still work without them.
			 */
			logger.warn(`Error downloading translations for ${type}: ${error}`);
		}
	}
};
