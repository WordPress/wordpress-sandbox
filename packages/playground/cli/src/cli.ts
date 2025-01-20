import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { startServer } from './server';
import {
	PHP,
	PHPRequest,
	PHPRequestHandler,
	PHPResponse,
	SupportedPHPVersion,
	SupportedPHPVersions,
} from '@php-wasm/universal';
import { logger, errorLogPath } from '@php-wasm/logger';
import {
	Blueprint,
	compileBlueprint,
	runBlueprintSteps,
} from '@wp-playground/blueprints';
import { isValidWordPressSlug } from './is-valid-wordpress-slug';
import { EmscriptenDownloadMonitor, ProgressTracker } from '@php-wasm/progress';
import { createNodeFsMountHandler, loadNodeRuntime } from '@php-wasm/node';
import { RecommendedPHPVersion, zipDirectory } from '@wp-playground/common';
import { bootWordPress } from '@wp-playground/wordpress';
import { rootCertificates } from 'tls';
import {
	CACHE_FOLDER,
	cachedDownload,
	fetchSqliteIntegration,
	readAsFile,
} from './download';
import { resolveWordPressRelease } from '@wp-playground/wordpress';
export interface Mount {
	hostPath: string;
	vfsPath: string;
}

async function run() {
	/**
	 * @TODO This looks similar to Query API args https://wordpress.github.io/wordpress-playground/developers/apis/query-api/
	 *       Perhaps the two could be handled by the same code?
	 */
	const yargsObject = await yargs(process.argv.slice(2))
		.usage('Usage: wp-playground <command> [options]')
		.positional('command', {
			describe: 'Command to run',
			type: 'string',
			choices: ['server', 'run-blueprint', 'build-snapshot'],
		})
		.option('outfile', {
			describe: 'When building, write to this output file.',
			type: 'string',
			default: 'wordpress.zip',
		})
		.option('port', {
			describe: 'Port to listen on when serving.',
			type: 'number',
			default: 9400,
		})
		.option('php', {
			describe: 'PHP version to use.',
			type: 'string',
			default: RecommendedPHPVersion,
			choices: SupportedPHPVersions,
		})
		.option('wp', {
			describe: 'WordPress version to use.',
			type: 'string',
			default: 'latest',
		})
		// @TODO: Support read-only mounts, e.g. via WORKERFS, a custom
		// ReadOnlyNODEFS, or by copying the files into MEMFS
		.option('mount', {
			describe:
				'Mount a directory to the PHP runtime. You can provide --mount multiple times. Format: /host/path:/vfs/path',
			type: 'array',
			string: true,
		})
		.option('mountBeforeInstall', {
			describe:
				'Mount a directory to the PHP runtime before installing WordPress. You can provide --mount-before-install multiple times. Format: /host/path:/vfs/path',
			type: 'array',
			string: true,
		})
		.option('login', {
			describe: 'Should log the user in',
			type: 'boolean',
			default: false,
		})
		.option('blueprint', {
			describe: 'Blueprint to execute.',
			type: 'string',
		})
		.option('skipWordPressSetup', {
			describe:
				'Do not download, unzip, and install WordPress. Useful for mounting a pre-configured WordPress directory at /wordpress.',
			type: 'boolean',
			default: false,
		})
		.option('quiet', {
			describe: 'Do not output logs and progress messages.',
			type: 'boolean',
			default: false,
		})
		.option('debug', {
			describe:
				'Print PHP error log content if an error occurs during Playground boot.',
			type: 'boolean',
			default: false,
		})
		.showHelpOnFail(false)
		.check((args) => {
			if (args.wp !== undefined && !isValidWordPressSlug(args.wp)) {
				try {
					// Check if is valid URL
					new URL(args.wp);
				} catch (e) {
					throw new Error(
						'Unrecognized WordPress version. Please use "latest", a URL, or a numeric version such as "6.2", "6.0.1", "6.2-beta1", or "6.2-RC1"'
					);
				}
			}
			if (args.blueprint !== undefined) {
				let blueprintPath = path.resolve(process.cwd(), args.blueprint);
				if (!fs.existsSync(blueprintPath)) {
					throw new Error('Blueprint file does not exist');
				}

				if (fs.lstatSync(blueprintPath).isDirectory()) {
					const blueprintPackageDir = blueprintPath;

					blueprintPath = path.join(
						blueprintPath,
						'META-INF',
						'blueprint.json'
					);
					if (!fs.existsSync(blueprintPath)) {
						throw new Error(
							'Blueprint file does not exist in the package'
						);
					}

					args.mountBeforeInstall = args.mountBeforeInstall || [];
					args.mountBeforeInstall.push(
						`${blueprintPackageDir}:/internal/shared/blueprint-assets`
					);
				}

				const content = fs.readFileSync(blueprintPath, 'utf-8');
				try {
					args.blueprint = JSON.parse(content);
				} catch (e) {
					throw new Error('Blueprint file is not a valid JSON file');
				}
			}
			return true;
		});

	yargsObject.wrap(yargsObject.terminalWidth());
	const args = await yargsObject.argv;

	if (args.quiet) {
		// @ts-ignore
		logger.handlers = [];
	}

	/**
	 * TODO: This exact feature will be provided in the PHP Blueprints library.
	 *       Let's use it when it ships. Let's also use it in the web Playground
	 *       app.
	 */
	async function zipSite(outfile: string) {
		// Fake URL for the build
		const { php, reap } =
			await requestHandler.processManager.acquirePHPInstance();
		try {
			await php.run({
				code: `<?php
				$zip = new ZipArchive();
				if(false === $zip->open('/tmp/build.zip', ZipArchive::CREATE | ZipArchive::OVERWRITE)) {
					throw new Exception('Failed to create ZIP');
				}
				$files = new RecursiveIteratorIterator(
					new RecursiveDirectoryIterator('/wordpress')
				);
				foreach ($files as $file) {
					echo $file . PHP_EOL;
					if (!$file->isFile()) {
						continue;
					}
					$zip->addFile($file->getPathname(), $file->getPathname());
				}
				$zip->close();

			`,
			});
			const zip = php.readFileAsBuffer('/tmp/build.zip');
			fs.writeFileSync(outfile, zip);
		} finally {
			reap();
		}
	}

	function mountResources(php: PHP, rawMounts: string[]) {
		const parsedMounts = rawMounts.map((mount) => {
			const [source, vfsPath] = mount.split(':');
			return {
				hostPath: path.resolve(process.cwd(), source),
				vfsPath,
			};
		});
		for (const mount of parsedMounts) {
			php.mkdir(mount.vfsPath);
			php.mount(mount.vfsPath, createNodeFsMountHandler(mount.hostPath));
		}
	}

	function compileInputBlueprint() {
		/**
		 * @TODO This looks similar to the resolveBlueprint() call in the website package:
		 * 	     https://github.com/WordPress/wordpress-playground/blob/ce586059e5885d185376184fdd2f52335cca32b0/packages/playground/website/src/main.tsx#L41
		 *
		 * 		 Also the Blueprint Builder tool does something similar.
		 *       Perhaps all these cases could be handled by the same function?
		 */
		let blueprint: Blueprint | undefined;
		if (args.blueprint) {
			blueprint = args.blueprint as Blueprint;
		} else {
			blueprint = {
				preferredVersions: {
					php: args.php as SupportedPHPVersion,
					wp: args.wp,
				},
				login: args.login,
			};
		}

		const tracker = new ProgressTracker();
		let lastCaption = '';
		let progress100 = false;
		tracker.addEventListener('progress', (e: any) => {
			if (progress100) {
				return;
			} else if (e.detail.progress === 100) {
				progress100 = true;
			}
			lastCaption =
				e.detail.caption || lastCaption || 'Running the Blueprint';
			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			process.stdout.write(
				'\r\x1b[K' + `${lastCaption.trim()} – ${e.detail.progress}%`
			);
			if (progress100) {
				process.stdout.write('\n');
			}
		});
		return compileBlueprint(blueprint as Blueprint, {
			progress: tracker,
		});
	}

	const command = args._[0] as string;
	if (!['run-blueprint', 'server', 'build-snapshot'].includes(command)) {
		yargsObject.showHelp();
		process.exit(1);
	}

	const compiledBlueprint = compileInputBlueprint();

	let requestHandler: PHPRequestHandler;
	let wordPressReady = false;

	logger.log('Starting a PHP server...');

	startServer({
		port: args['port'] as number,
		onBind: async (port: number) => {
			const absoluteUrl = `http://127.0.0.1:${port}`;

			logger.log(`Setting up WordPress ${args.wp}`);
			let wpDetails: any = undefined;
			const monitor = new EmscriptenDownloadMonitor();
			if (!args.skipWordPressSetup) {
				// @TODO: Rename to FetchProgressMonitor. There's nothing Emscripten
				// about that class anymore.
				monitor.addEventListener('progress', ((
					e: CustomEvent<ProgressEvent & { finished: boolean }>
				) => {
					// @TODO Every progres bar will want percentages. The
					//       download monitor should just provide that.
					const percentProgress = Math.round(
						Math.min(100, (100 * e.detail.loaded) / e.detail.total)
					);
					if (!args.quiet) {
						process.stdout.clearLine(0);
						process.stdout.cursorTo(0);
						process.stdout.write(
							`Downloading WordPress ${percentProgress}%...`
						);
					}
				}) as any);

				wpDetails = await resolveWordPressRelease(args.wp);
			}
			logger.log(
				`Resolved WordPress release URL: ${wpDetails?.releaseUrl}`
			);

			const preinstalledWpContentPath =
				wpDetails &&
				path.join(
					CACHE_FOLDER,
					`prebuilt-wp-content-for-wp-${wpDetails.version}.zip`
				);
			const wordPressZip = !wpDetails
				? undefined
				: fs.existsSync(preinstalledWpContentPath)
				? readAsFile(preinstalledWpContentPath)
				: await cachedDownload(
						wpDetails.releaseUrl,
						`${wpDetails.version}.zip`,
						monitor
				  );

			const constants: Record<string, string | number | boolean | null> =
				{
					WP_DEBUG: true,
					WP_DEBUG_LOG: true,
					WP_DEBUG_DISPLAY: false,
				};

			logger.log(`Booting WordPress...`);
			requestHandler = await bootWordPress({
				siteUrl: absoluteUrl,
				createPhpRuntime: async () =>
					await loadNodeRuntime(compiledBlueprint.versions.php),
				wordPressZip,
				sqliteIntegrationPluginZip: fetchSqliteIntegration(monitor),
				sapiName: 'cli',
				createFiles: {
					'/internal/shared/ca-bundle.crt':
						rootCertificates.join('\n'),
				},
				constants,
				phpIniEntries: {
					'openssl.cafile': '/internal/shared/ca-bundle.crt',
					allow_url_fopen: '1',
					disable_functions: '',
				},
				hooks: {
					async beforeWordPressFiles(php) {
						if (args.mountBeforeInstall) {
							mountResources(php, args.mountBeforeInstall);
						}
					},
				},
			});
			logger.log(`Booted!`);

			const php = await requestHandler.getPrimaryPhp();
			try {
				if (
					wpDetails &&
					!args.mountBeforeInstall &&
					!fs.existsSync(preinstalledWpContentPath)
				) {
					logger.log(
						`Caching preinstalled WordPress for the next boot...`
					);
					fs.writeFileSync(
						preinstalledWpContentPath,
						await zipDirectory(php, '/wordpress')
					);
					logger.log(`Cached!`);
				}

				if (args.mount) {
					mountResources(php, args.mount);
				}

				wordPressReady = true;

				if (compiledBlueprint) {
					const { php, reap } =
						await requestHandler.processManager.acquirePHPInstance();
					try {
						logger.log(`Running the Blueprint...`);
						await runBlueprintSteps(compiledBlueprint, php);
						logger.log(`Finished running the blueprint`);
					} finally {
						reap();
					}
				}

				if (command === 'build-snapshot') {
					await zipSite(args.outfile as string);
					logger.log(`WordPress exported to ${args.outfile}`);
					process.exit(0);
				} else if (command === 'run-blueprint') {
					logger.log(`Blueprint executed`);
					process.exit(0);
				} else {
					logger.log(`WordPress is running on ${absoluteUrl}`);
				}
			} catch (error) {
				if (!args.debug) {
					throw error;
				}
				const phpLogs = php.readFileAsText(errorLogPath);
				throw new Error(phpLogs, { cause: error });
			}
		},
		async handleRequest(request: PHPRequest) {
			if (!wordPressReady) {
				return PHPResponse.forHttpCode(
					502,
					'WordPress is not ready yet'
				);
			}
			return await requestHandler.request(request);
		},
	});
}

run();
