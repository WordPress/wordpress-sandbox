import { Blueprint } from '@wp-playground/client';
import { makeBlueprint } from './make-blueprint';

const query = new URL(document.location.href).searchParams;
const fragment = decodeURI(document.location.hash || '#').substring(1);

export function urlContainsSiteConfiguration() {
	const queryKeys = new Set(Array.from(query.keys()));
	const ignoredQueryKeys = new Set(['storage']);
	const differentKeys = new Set(
		[...queryKeys].filter((key) => !ignoredQueryKeys.has(key))
	);
	return fragment.length > 0 || differentKeys.size > 0;
}

export async function resolveBlueprint() {
	let blueprint: Blueprint;
	/*
	 * Support passing blueprints via query parameter, e.g.:
	 * ?blueprint-url=https://example.com/blueprint.json
	 */
	if (query.has('blueprint-url')) {
		const url = query.get('blueprint-url');
		const response = await fetch(url!, {
			credentials: 'omit',
		});
		blueprint = await response.json();
	} else if (fragment.length) {
		/*
		 * Support passing blueprints in the URI fragment, e.g.:
		 * /#{"landingPage": "/?p=4"}
		 */
		try {
			try {
				blueprint = JSON.parse(atob(fragment));
			} catch (e) {
				blueprint = JSON.parse(fragment);
			}
			// Allow overriding the preferred versions using query params
			// generated by the version switchers.
			if (query.get('php') || query.get('wp')) {
				if (!blueprint.preferredVersions) {
					blueprint.preferredVersions = {} as any;
				}
				blueprint.preferredVersions!.php =
					(query.get('php') as any) ||
					blueprint.preferredVersions!.php ||
					'8.0';
				blueprint.preferredVersions!.wp =
					query.get('wp') ||
					blueprint.preferredVersions!.wp ||
					'latest';
			}
		} catch (e) {
			// Noop
		}
	}

	// If no blueprint was passed, prepare one based on the query params.
	// @ts-ignore
	if (typeof blueprint === 'undefined') {
		const features: Blueprint['features'] = {};
		/**
		 * Networking is disabled by default, so we only need to enable it
		 * if the query param is explicitly set to "yes".
		 */
		if (query.get('networking') === 'yes') {
			features['networking'] = true;
		}
		blueprint = makeBlueprint({
			php: query.get('php') || '8.0',
			wp: query.get('wp') || 'latest',
			theme: query.get('theme') || undefined,
			login: !query.has('login') || query.get('login') === 'yes',
			multisite: query.get('multisite') === 'yes',
			features,
			plugins: query.getAll('plugin'),
			landingPage: query.get('url') || undefined,
			phpExtensionBundles: query.getAll('php-extension-bundle') || [],
			importSite: query.get('import-site') || undefined,
			importWxr:
				query.get('import-wxr') ||
				query.get('import-content') ||
				undefined,
			language: query.get('language') || undefined,
		});
	}

	return blueprint;
}
