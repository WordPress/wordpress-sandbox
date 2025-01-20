import { directoryHandleFromMountDevice } from '@wp-playground/storage';
import { loadDirectoryHandle } from '../opfs/opfs-directory-handle-storage';
import {
	getDirectoryPathForSlug,
	legacyOpfsPathSymbol,
	deleteDirectory,
} from '../opfs/opfs-site-storage';
import {
	addClientInfo,
	removeClientInfo,
	updateClientInfo,
} from './slice-clients';
import {
	logBlueprintEvents,
	logErrorEvent,
	logTrackingEvent,
} from '../../tracking';
import { Blueprint } from '@wp-playground/blueprints';
import { logger } from '@php-wasm/logger';
import { setupPostMessageRelay } from '@php-wasm/web';
import { startPlaygroundWeb } from '@wp-playground/client';
import { PlaygroundClient } from '@wp-playground/remote';
import { getRemoteUrl } from '../../config';
import { setActiveModal, setActiveSiteError } from './slice-ui';
import { PlaygroundDispatch, PlaygroundReduxState } from './store';
import { selectSiteBySlug } from './slice-sites';
// @ts-ignore
import { corsProxyUrl } from 'virtual:cors-proxy-url';
import { modalSlugs } from '../../../components/layout';

export function bootSiteClient(
	siteSlug: string,
	iframe: HTMLIFrameElement,
	{ signal }: { signal: AbortSignal }
) {
	return async (
		dispatch: PlaygroundDispatch,
		getState: () => PlaygroundReduxState
	) => {
		signal.onabort = () => {
			dispatch(removeClientInfo(siteSlug));
		};
		const site = selectSiteBySlug(getState(), siteSlug);

		let mountDescriptor = undefined;
		if (site.metadata.storage === 'opfs') {
			mountDescriptor = {
				device: {
					type: 'opfs',
					// @TODO: Remove backcompat code after 2024-12-01.
					path: (site.metadata as any)[legacyOpfsPathSymbol]
						? (site.metadata as any)[legacyOpfsPathSymbol]
						: getDirectoryPathForSlug(site.slug),
				},
				mountpoint: '/wordpress',
			} as const;
		} else if (site.metadata.storage === 'local-fs') {
			let localDirectoryHandle;
			try {
				localDirectoryHandle = await loadDirectoryHandle(site.slug);
			} catch (e) {
				logger.error(e);
				dispatch(
					setActiveSiteError(
						'directory-handle-not-found-in-indexeddb'
					)
				);
				return;
			}
			mountDescriptor = {
				device: {
					type: 'local-fs',
					handle: localDirectoryHandle,
				},
				mountpoint: '/wordpress',
			} as const;
		}

		let isWordPressInstalled = false;
		if (mountDescriptor) {
			try {
				isWordPressInstalled = await playgroundAvailableInOpfs(
					await directoryHandleFromMountDevice(mountDescriptor.device)
				);
			} catch (e) {
				logger.error(e);
				if (e instanceof DOMException && e.name === 'NotFoundError') {
					dispatch(
						setActiveSiteError(
							'directory-handle-not-found-in-indexeddb'
						)
					);
					return;
				}
				dispatch(setActiveSiteError('directory-handle-unknown-error'));
				return;
			}
		}

		let blueprint: Blueprint;
		if (isWordPressInstalled) {
			blueprint = site.metadata.runtimeConfiguration;
		} else {
			blueprint = site.metadata.originalBlueprint;
		}

		logTrackingEvent('load');
		logBlueprintEvents(blueprint);

		let playground: PlaygroundClient;
		try {
			playground = await startPlaygroundWeb({
				iframe: iframe!,
				remoteUrl: getRemoteUrl().toString(),
				scope: site.slug,
				blueprint,
				// Intercept the Playground client even if the
				// Blueprint fails.
				onClientConnected: (playground) => {
					(window as any)['playground'] = playground;
				},
				mounts: mountDescriptor
					? [
							{
								...mountDescriptor,
								initialSyncDirection: 'opfs-to-memfs',
							},
					  ]
					: [],
				shouldInstallWordPress: !isWordPressInstalled,
				corsProxy: corsProxyUrl,
			});

			// @TODO: Remove backcompat code after 2024-12-01.
			if (
				(site.metadata as any)[legacyOpfsPathSymbol] &&
				site.metadata.storage === 'opfs' &&
				mountDescriptor?.device.type === 'opfs'
			) {
				const sourcePath = mountDescriptor.device.path;
				const targetPath = getDirectoryPathForSlug(site.slug);
				logger.info(
					`Migrating legacy OPFS site from ${sourcePath} to ${targetPath}`
				);
				// Move the legacy site to the new OPFS sites location.
				mountDescriptor = {
					device: {
						type: 'opfs',
						path: targetPath,
					},
					mountpoint: '/wordpress',
				} as const;
				try {
					await playground.mountOpfs(
						{
							...mountDescriptor,
							initialSyncDirection: 'memfs-to-opfs',
						} as const
						// TODO: show progress indicator?
					);
					await deleteDirectory(sourcePath);
					logger.info(
						`Completed migration of legacy OPFS site from ${sourcePath} to ${targetPath}`
					);
				} catch (e) {
					logger.info(
						`Failed migration of legacy OPFS site from ${sourcePath} to ${targetPath}`
					);
					throw e;
				}
			}
		} catch (e) {
			logger.error(e);
			logErrorEvent('bootSiteClient');
			dispatch(setActiveSiteError('site-boot-failed'));
			dispatch(setActiveModal(modalSlugs.ERROR_REPORT));
			return;
		}

		if (signal.aborted) {
			return;
		}

		setupPostMessageRelay(iframe, document.location.origin);

		dispatch(
			addClientInfo({
				siteSlug: site.slug,
				url: '/',
				client: playground,
				opfsMountDescriptor: mountDescriptor,
			})
		);

		playground.onNavigation((url) => {
			dispatch(
				updateClientInfo({
					siteSlug: site.slug,
					changes: {
						url,
					},
				})
			);
		});

		signal.onabort = null;
	};
}

/**
 * Check if the given directory handle directory is a Playground directory.
 *
 * @TODO: Create a shared package like @wp-playground/wordpress for such utilities
 * and bring in the context detection logic from wp-now – only express it in terms of
 * either abstract FS operations or isomorphic PHP FS operations.
 * (we can't just use Node.js require('fs') in the browser, for example)
 *
 * @TODO: Reuse the "isWordPressInstalled" logic implemented in the boot protocol.
 *        Perhaps mount OPFS first, and only then check for the presence of the
 *        WordPress installation? Or, if not, perhaps implement a shared file access
 * 		  abstraction that can be used both with the PHP module and OPFS directory handles?
 *
 * @param dirHandle
 */
export async function playgroundAvailableInOpfs(
	dirHandle: FileSystemDirectoryHandle
) {
	// Run this loop just to trigger an exception if the directory handle is no good.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for await (const _ of dirHandle.keys()) {
		break;
	}

	try {
		/**
		 * Assume it's a Playground directory if these files exist:
		 * - wp-config.php
		 * - wp-content/database/.ht.sqlite
		 */
		await dirHandle.getFileHandle('wp-config.php', { create: false });
		const wpContent = await dirHandle.getDirectoryHandle('wp-content', {
			create: false,
		});
		const database = await wpContent.getDirectoryHandle('database', {
			create: false,
		});
		await database.getFileHandle('.ht.sqlite', { create: false });
	} catch (e) {
		return false;
	}
	return true;
}
