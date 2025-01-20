import { useEffect, useState } from 'react';
import { resolveBlueprintFromURL } from '../../lib/state/url/resolve-blueprint-from-url';
import { useCurrentUrl } from '../../lib/state/url/router-hooks';
import { opfsSiteStorage } from '../../lib/state/opfs/opfs-site-storage';
import {
	OPFSSitesLoaded,
	selectSiteBySlug,
	setTemporarySiteSpec,
	deriveSiteNameFromSlug,
} from '../../lib/state/redux/slice-sites';
import {
	selectActiveSite,
	setActiveSite,
	useAppDispatch,
	useAppSelector,
} from '../../lib/state/redux/store';
import { redirectTo } from '../../lib/state/url/router';
import { logger } from '@php-wasm/logger';
import { Blueprint } from '@wp-playground/blueprints';
import { usePrevious } from '../../lib/hooks/use-previous';
import { modalSlugs } from '../layout';
import { setActiveModal } from '../../lib/state/redux/slice-ui';
import { selectClientBySiteSlug } from '../../lib/state/redux/slice-clients';

/**
 * Ensures the redux store always has an activeSite value.
 *
 * It has two routing modes:
 * * When `site-slug` is provided, it load an existing site
 * * When `site-slug` is missing, it creates a new site using the Query API and Blueprint API
 *   data sourced from the current URL.
 */
export function EnsurePlaygroundSiteIsSelected({
	children,
}: {
	children: React.ReactNode;
}) {
	const siteListingStatus = useAppSelector(
		(state) => state.sites.opfsSitesLoadingState
	);
	const activeSite = useAppSelector((state) => selectActiveSite(state));
	const dispatch = useAppDispatch();
	const url = useCurrentUrl();
	const requestedSiteSlug = url.searchParams.get('site-slug');
	const requestedSiteObject = useAppSelector((state) =>
		selectSiteBySlug(state, requestedSiteSlug!)
	);
	const requestedClientInfo = useAppSelector(
		(state) =>
			requestedSiteSlug &&
			selectClientBySiteSlug(state, requestedSiteSlug)
	);
	const [needMissingSitePromptForSlug, setNeedMissingSitePromptForSlug] =
		useState<false | string>(false);

	const promptIfSiteMissing =
		url.searchParams.get('if-stored-site-missing') === 'prompt';
	const prevUrl = usePrevious(url);

	useEffect(() => {
		if (!opfsSiteStorage) {
			logger.error('Error loading sites: OPFS not available');
			dispatch(OPFSSitesLoaded([]));
			return;
		}
		opfsSiteStorage.list().then(
			(sites) => dispatch(OPFSSitesLoaded(sites)),
			(error) => {
				logger.error('Error loading sites:', error);
				dispatch(OPFSSitesLoaded([]));
			}
		);
	}, [dispatch]);

	useEffect(() => {
		async function ensureSiteIsSelected() {
			// Don't create a new temporary site until the site listing settles.
			// Otherwise, the status change from "loading" to "loaded" would
			// re-run this entire effect, potentially leading to multiple
			// sites being created since we couldn't look for duplicates yet.
			if (!['loaded', 'error'].includes(siteListingStatus)) {
				return;
			}

			// If the site slug is provided, try to load the site.
			if (requestedSiteSlug) {
				// If the site does not exist, redirect to a new temporary site.
				if (!requestedSiteObject) {
					if (promptIfSiteMissing) {
						logger.log(
							'The requested site was not found. Creating a new temporary site.'
						);

						await createNewTemporarySite(
							dispatch,
							requestedSiteSlug
						);
						setNeedMissingSitePromptForSlug(requestedSiteSlug);
						return;
					} else {
						// @TODO: Notification: 'The requested site was not found. Redirecting to a new temporary site.'
						logger.log(
							'The requested site was not found. Redirecting to a new temporary site.'
						);
						const currentUrl = new URL(window.location.href);
						currentUrl.searchParams.delete('site-slug');
						redirectTo(currentUrl.toString());
						return;
					}
				}

				dispatch(setActiveSite(requestedSiteSlug, { redirect: false }));
				return;
			}

			// If only the 'modal' parameter changes in searchParams, don't reload the page
			const notRefreshingParam = 'modal';
			const oldParams = new URLSearchParams(prevUrl?.search);
			const newParams = new URLSearchParams(url?.search);
			oldParams.delete(notRefreshingParam);
			newParams.delete(notRefreshingParam);
			const avoidUnnecessaryTempSiteReload =
				activeSite && oldParams.toString() === newParams.toString();
			if (avoidUnnecessaryTempSiteReload) {
				return;
			}

			await createNewTemporarySite(dispatch);
		}

		ensureSiteIsSelected();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url.href, requestedSiteSlug, siteListingStatus]);

	useEffect(() => {
		if (
			needMissingSitePromptForSlug &&
			needMissingSitePromptForSlug === requestedSiteSlug &&
			requestedClientInfo
		) {
			dispatch(setActiveModal(modalSlugs.MISSING_SITE_PROMPT));
			setNeedMissingSitePromptForSlug(false);
		}
	}, [
		needMissingSitePromptForSlug,
		requestedSiteSlug,
		requestedClientInfo,
		dispatch,
	]);

	return children;
}

function parseSearchParams(searchParams: URLSearchParams) {
	const params: Record<string, any> = {};
	for (const key of searchParams.keys()) {
		const value = searchParams.getAll(key);
		params[key] = value.length > 1 ? value : value[0];
	}
	return params;
}

async function createNewTemporarySite(
	dispatch: ReturnType<typeof useAppDispatch>,
	requestedSiteSlug?: string
) {
	// If the site slug is missing, create a new temporary site.
	// Lean on the Query API parameters and the Blueprint API to
	// create the new site.
	const newUrl = new URL(window.location.href);
	let blueprint: Blueprint | undefined = undefined;
	try {
		blueprint = await resolveBlueprintFromURL(newUrl);
	} catch (e) {
		logger.error('Error resolving blueprint:', e);
	}
	// Create a new site otherwise
	const newSiteInfo = await dispatch(
		setTemporarySiteSpec({
			metadata: {
				originalBlueprint: blueprint,
				name: requestedSiteSlug
					? deriveSiteNameFromSlug(requestedSiteSlug)
					: undefined,
			},
			originalUrlParams: {
				searchParams: parseSearchParams(newUrl.searchParams),
				hash: newUrl.hash,
			},
		})
	);
	await dispatch(setActiveSite(newSiteInfo.slug));
}
