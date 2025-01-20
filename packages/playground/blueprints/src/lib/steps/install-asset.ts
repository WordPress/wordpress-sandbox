import type { UniversalPHP } from '@php-wasm/universal';
import { joinPaths, randomString } from '@php-wasm/util';
import { unzip } from './unzip';

export interface InstallAssetOptions {
	/**
	 * The zip file to install.
	 */
	zipFile: File;
	/**
	 * Target path to extract the main folder.
	 * @example
	 *
	 * <code>
	 * const targetPath = `${await playground.documentRoot}/wp-content/plugins`;
	 * </code>
	 */
	targetPath: string;
	/**
	 * Target folder name to install the asset into.
	 */
	targetFolderName?: string;
	/**
	 * What to do if the asset already exists.
	 */
	ifAlreadyInstalled?: 'overwrite' | 'skip' | 'error';
}

/**
 * Install asset: Extract folder from zip file and move it to target
 */
export async function installAsset(
	playground: UniversalPHP,
	{
		targetPath,
		zipFile,
		ifAlreadyInstalled = 'overwrite',
		targetFolderName = '',
	}: InstallAssetOptions
): Promise<{
	assetFolderPath: string;
	assetFolderName: string;
}> {
	// Extract to temporary folder so we can find asset folder name
	const zipFileName = zipFile.name;
	let assetNameGuess = zipFileName.replace(/\.zip$/, '');
	/**
	 * Some resource types like GitDirectoryReference and UrlReference
	 * don't have a name, so we need to generate a random name to ensure
	 * the asset folder name exists.
	 */
	if (!zipFileName) {
		assetNameGuess = `${randomString(32, '')}`;
	}

	const wpContent = joinPaths(await playground.documentRoot, 'wp-content');
	const tmpDir = joinPaths(wpContent, randomString());
	const tmpUnzippedFilesPath = joinPaths(tmpDir, 'assets', assetNameGuess);

	if (await playground.fileExists(tmpUnzippedFilesPath)) {
		await playground.rmdir(tmpDir, {
			recursive: true,
		});
	}
	await playground.mkdir(tmpDir);

	try {
		await unzip(playground, {
			zipFile,
			extractToPath: tmpUnzippedFilesPath,
		});

		// Find the path asset folder name
		let files = await playground.listFiles(tmpUnzippedFilesPath, {
			prependPath: true,
		});
		// _unzip_file_ziparchive in WordPress skips the __MACOSX files, and so
		// should we here.
		files = files.filter((name) => !name.endsWith('/__MACOSX'));

		/**
		 * If the zip only contains a single entry that is directory,
		 * we assume that's the asset folder. Otherwise, the zip
		 * probably contains the plugin files without an intermediate folder.
		 */
		const zipHasRootFolder =
			files.length === 1 && (await playground.isDir(files[0]));
		let assetFolderName;
		let tmpAssetPath = '';
		if (zipHasRootFolder) {
			tmpAssetPath = files[0];
			assetFolderName = files[0].split('/').pop()!;
		} else {
			tmpAssetPath = tmpUnzippedFilesPath;
			assetFolderName = assetNameGuess;
		}

		// If a specific slug was requested be used, use that.
		if (targetFolderName && targetFolderName.length) {
			assetFolderName = targetFolderName;
		}

		// Move asset folder to target path
		const assetFolderPath = `${targetPath}/${assetFolderName}`;

		// Handle the scenario when the asset is already installed.
		if (await playground.fileExists(assetFolderPath)) {
			if (!(await playground.isDir(assetFolderPath))) {
				throw new Error(
					`Cannot install asset ${assetFolderName} to ${assetFolderPath} because a file with the same name already exists. Note it's a file, not a directory! Is this by mistake?`
				);
			}
			if (ifAlreadyInstalled === 'overwrite') {
				await playground.rmdir(assetFolderPath, {
					recursive: true,
				});
			} else if (ifAlreadyInstalled === 'skip') {
				return {
					assetFolderPath,
					assetFolderName,
				};
			} else {
				throw new Error(
					`Cannot install asset ${assetFolderName} to ${targetPath} because it already exists and ` +
						`the ifAlreadyInstalled option was set to ${ifAlreadyInstalled}`
				);
			}
		}
		await playground.mv(tmpAssetPath, assetFolderPath);

		return {
			assetFolderPath,
			assetFolderName,
		};
	} finally {
		await playground.rmdir(tmpDir, {
			recursive: true,
		});
	}
}
