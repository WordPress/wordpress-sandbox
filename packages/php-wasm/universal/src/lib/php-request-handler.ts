import { joinPaths } from '@php-wasm/util';
import {
	ensurePathPrefix,
	toRelativeUrl,
	removePathPrefix,
	DEFAULT_BASE_URL,
} from './urls';
import { PHP, PHPExecutionFailureError, normalizeHeaders } from './php';
import { PHPResponse } from './php-response';
import { PHPRequest, PHPRunOptions } from './universal-php';
import { encodeAsMultipart } from './encode-as-multipart';
import {
	MaxPhpInstancesError,
	PHPFactoryOptions,
	PHPProcessManager,
	SpawnedPHP,
} from './php-process-manager';
import mimeTypes from './mime-types.json';

export type RewriteRule = {
	match: RegExp;
	replacement: string;
};

export type FileNotFoundToResponse = {
	type: 'response';
	response: PHPResponse;
};
export type FileNotFoundToInternalRedirect = {
	type: 'internal-redirect';
	uri: string;
};
export type FileNotFoundTo404 = { type: '404' };

export type FileNotFoundAction =
	| FileNotFoundToResponse
	| FileNotFoundToInternalRedirect
	| FileNotFoundTo404;

export type FileNotFoundGetActionCallback = (
	relativePath: string
) => FileNotFoundAction;

interface BaseConfiguration {
	/**
	 * The directory in the PHP filesystem where the server will look
	 * for the files to serve. Default: `/var/www`.
	 */
	documentRoot?: string;
	/**
	 * Request Handler URL. Used to populate $_SERVER details like HTTP_HOST.
	 */
	absoluteUrl?: string;

	/**
	 * Rewrite rules
	 */
	rewriteRules?: RewriteRule[];

	/**
	 * A callback that decides how to handle a file-not-found condition for a
	 * given request URI.
	 */
	getFileNotFoundAction?: FileNotFoundGetActionCallback;
}

export type PHPRequestHandlerFactoryArgs = PHPFactoryOptions & {
	requestHandler: PHPRequestHandler;
};

export type PHPRequestHandlerConfiguration = BaseConfiguration &
	(
		| {
				/**
				 * PHPProcessManager is required because the request handler needs
				 * to make a decision for each request.
				 *
				 * Static assets are served using the primary PHP's filesystem, even
				 * when serving 100 static files concurrently. No new PHP interpreter
				 * is ever created as there's no need for it.
				 *
				 * Dynamic PHP requests, however, require grabbing an available PHP
				 * interpreter, and that's where the PHPProcessManager comes in.
				 */
				processManager: PHPProcessManager;
		  }
		| {
				phpFactory: (
					requestHandler: PHPRequestHandlerFactoryArgs
				) => Promise<PHP>;
				/**
				 * The maximum number of PHP instances that can exist at
				 * the same time.
				 */
				maxPhpInstances?: number;
		  }
	);

/**
 * Handles HTTP requests using PHP runtime as a backend.
 *
 * @public
 * @example Use PHPRequestHandler implicitly with a new PHP instance:
 * ```js
 * import { PHP } from '@php-wasm/web';
 *
 * const php = await PHP.load( '7.4', {
 *     requestHandler: {
 *         // PHP FS path to serve the files from:
 *         documentRoot: '/www',
 *
 *         // Used to populate $_SERVER['SERVER_NAME'] etc.:
 *         absoluteUrl: 'http://127.0.0.1'
 *     }
 * } );
 *
 * php.mkdirTree('/www');
 * php.writeFile('/www/index.php', '<?php echo "Hi from PHP!"; ');
 *
 * const response = await php.request({ path: '/index.php' });
 * console.log(response.text);
 * // "Hi from PHP!"
 * ```
 *
 * @example Explicitly create a PHPRequestHandler instance and run a PHP script:
 * ```js
 * import {
 *   loadPHPRuntime,
 *   PHP,
 *   PHPRequestHandler,
 *   getPHPLoaderModule,
 * } from '@php-wasm/web';
 *
 * const runtime = await loadPHPRuntime( await getPHPLoaderModule('7.4') );
 * const php = new PHP( runtime );
 *
 * php.mkdirTree('/www');
 * php.writeFile('/www/index.php', '<?php echo "Hi from PHP!"; ');
 *
 * const server = new PHPRequestHandler(php, {
 *     // PHP FS path to serve the files from:
 *     documentRoot: '/www',
 *
 *     // Used to populate $_SERVER['SERVER_NAME'] etc.:
 *     absoluteUrl: 'http://127.0.0.1'
 * });
 *
 * const response = server.request({ path: '/index.php' });
 * console.log(response.text);
 * // "Hi from PHP!"
 * ```
 */
export class PHPRequestHandler {
	#DOCROOT: string;
	#PROTOCOL: string;
	#HOSTNAME: string;
	#PORT: number;
	#HOST: string;
	#PATHNAME: string;
	#ABSOLUTE_URL: string;
	rewriteRules: RewriteRule[];
	processManager: PHPProcessManager;
	getFileNotFoundAction: FileNotFoundGetActionCallback;

	/**
	 * The request handler needs to decide whether to serve a static asset or
	 * run the PHP interpreter. For static assets it should just reuse the primary
	 * PHP even if there's 50 concurrent requests to serve. However, for
	 * dynamic PHP requests, it needs to grab an available interpreter.
	 * Therefore, it cannot just accept PHP as an argument as serving requests
	 * requires access to ProcessManager.
	 *
	 * @param  php    - The PHP instance.
	 * @param  config - Request Handler configuration.
	 */
	constructor(config: PHPRequestHandlerConfiguration) {
		const {
			documentRoot = '/www/',
			absoluteUrl = typeof location === 'object' ? location?.href : '',
			rewriteRules = [],
			getFileNotFoundAction = () => ({ type: '404' }),
		} = config;
		if ('processManager' in config) {
			this.processManager = config.processManager;
		} else {
			this.processManager = new PHPProcessManager({
				phpFactory: async (info) => {
					const php = await config.phpFactory!({
						...info,
						requestHandler: this,
					});
					// @TODO: Decouple PHP and request handler
					(php as any).requestHandler = this;
					return php;
				},
				maxPhpInstances: config.maxPhpInstances,
			});
		}
		this.#DOCROOT = documentRoot;

		const url = new URL(absoluteUrl);
		this.#HOSTNAME = url.hostname;
		this.#PORT = url.port
			? Number(url.port)
			: url.protocol === 'https:'
			? 443
			: 80;
		this.#PROTOCOL = (url.protocol || '').replace(':', '');
		const isNonStandardPort = this.#PORT !== 443 && this.#PORT !== 80;
		this.#HOST = [
			this.#HOSTNAME,
			isNonStandardPort ? `:${this.#PORT}` : '',
		].join('');
		this.#PATHNAME = url.pathname.replace(/\/+$/, '');
		this.#ABSOLUTE_URL = [
			`${this.#PROTOCOL}://`,
			this.#HOST,
			this.#PATHNAME,
		].join('');
		this.rewriteRules = rewriteRules;
		this.getFileNotFoundAction = getFileNotFoundAction;
	}

	async getPrimaryPhp() {
		return await this.processManager.getPrimaryPhp();
	}

	/**
	 * Converts a path to an absolute URL based at the PHPRequestHandler
	 * root.
	 *
	 * @param  path The server path to convert to an absolute URL.
	 * @returns The absolute URL.
	 */
	pathToInternalUrl(path: string): string {
		return `${this.absoluteUrl}${path}`;
	}

	/**
	 * Converts an absolute URL based at the PHPRequestHandler to a relative path
	 * without the server pathname and scope.
	 *
	 * @param  internalUrl An absolute URL based at the PHPRequestHandler root.
	 * @returns The relative path.
	 */
	internalUrlToPath(internalUrl: string): string {
		const url = new URL(internalUrl);
		if (url.pathname.startsWith(this.#PATHNAME)) {
			url.pathname = url.pathname.slice(this.#PATHNAME.length);
		}
		return toRelativeUrl(url);
	}

	/**
	 * The absolute URL of this PHPRequestHandler instance.
	 */
	get absoluteUrl() {
		return this.#ABSOLUTE_URL;
	}

	/**
	 * The directory in the PHP filesystem where the server will look
	 * for the files to serve. Default: `/var/www`.
	 */
	get documentRoot() {
		return this.#DOCROOT;
	}

	/**
	 * Serves the request – either by serving a static file, or by
	 * dispatching it to the PHP runtime.
	 *
	 * The request() method mode behaves like a web server and only works if
	 * the PHP was initialized with a `requestHandler` option (which the online
	 * version of WordPress Playground does by default).
	 *
	 * In the request mode, you pass an object containing the request information
	 * (method, headers, body, etc.) and the path to the PHP file to run:
	 *
	 * ```ts
	 * const php = PHP.load('7.4', {
	 * 	requestHandler: {
	 * 		documentRoot: "/www"
	 * 	}
	 * })
	 * php.writeFile("/www/index.php", `<?php echo file_get_contents("php://input");`);
	 * const result = await php.request({
	 * 	method: "GET",
	 * 	headers: {
	 * 		"Content-Type": "text/plain"
	 * 	},
	 * 	body: "Hello world!",
	 * 	path: "/www/index.php"
	 * });
	 * // result.text === "Hello world!"
	 * ```
	 *
	 * The `request()` method cannot be used in conjunction with `cli()`.
	 *
	 * @example
	 * ```js
	 * const output = await php.request({
	 * 	method: 'GET',
	 * 	url: '/index.php',
	 * 	headers: {
	 * 		'X-foo': 'bar',
	 * 	},
	 * 	body: {
	 * 		foo: 'bar',
	 * 	},
	 * });
	 * console.log(output.stdout); // "Hello world!"
	 * ```
	 *
	 * @param  request - PHP Request data.
	 */
	async request(request: PHPRequest): Promise<PHPResponse> {
		const isAbsolute = URL.canParse(request.url);
		const requestedUrl = new URL(
			// Remove the hash part of the URL as it's not meant for the server.
			request.url.split('#')[0],
			isAbsolute ? undefined : DEFAULT_BASE_URL
		);

		const normalizedRequestedPath = applyRewriteRules(
			removePathPrefix(
				decodeURIComponent(requestedUrl.pathname),
				this.#PATHNAME
			),
			this.rewriteRules
		);

		const primaryPhp = await this.getPrimaryPhp();

		let fsPath = joinPaths(this.#DOCROOT, normalizedRequestedPath);

		if (primaryPhp.isDir(fsPath)) {
			// Ensure directory URIs have a trailing slash. Otherwise,
			// relative URIs in index.php or index.html files are relative
			// to the next directory up.
			//
			// Example:
			// For an index page served for URI "/settings", we naturally expect
			// links to be relative to "/settings", but without the trailing
			// slash, a relative link "edit.php" resolves to "/edit.php"
			// rather than "/settings/edit.php".
			//
			// This treatment of relative links is correct behavior for the browser:
			// https://www.rfc-editor.org/rfc/rfc3986#section-5.2.3
			//
			// But user intent for `/settings/index.php` is that its relative
			// URIs are relative to `/settings/`. So we redirect to add a
			// trailing slash to directory URIs to meet this expecatation.
			//
			// This behavior is also necessary for WordPress to function properly.
			// Otherwise, when viewing the WP admin dashboard at `/wp-admin`,
			// links to other admin pages like `edit.php` will incorrectly
			// resolve to `/edit.php` rather than `/wp-admin/edit.php`.
			if (!fsPath.endsWith('/')) {
				return new PHPResponse(
					301,
					{ Location: [`${requestedUrl.pathname}/`] },
					new Uint8Array(0)
				);
			}

			// We can only satisfy requests for directories with a default file
			// so let's first resolve to a default path when available.
			for (const possibleIndexFile of ['index.php', 'index.html']) {
				const possibleIndexPath = joinPaths(fsPath, possibleIndexFile);
				if (primaryPhp.isFile(possibleIndexPath)) {
					fsPath = possibleIndexPath;
					break;
				}
			}
		}

		if (!primaryPhp.isFile(fsPath)) {
			const fileNotFoundAction = this.getFileNotFoundAction(
				normalizedRequestedPath
			);
			switch (fileNotFoundAction.type) {
				case 'response':
					return fileNotFoundAction.response;
				case 'internal-redirect':
					fsPath = joinPaths(this.#DOCROOT, fileNotFoundAction.uri);
					break;
				case '404':
					return PHPResponse.forHttpCode(404);
				default:
					throw new Error(
						'Unsupported file-not-found action type: ' +
							// Cast because TS asserts the remaining possibility is `never`
							`'${
								(fileNotFoundAction as FileNotFoundAction).type
							}'`
					);
			}
		}

		// We need to confirm that the current target file exists because
		// file-not-found fallback actions may redirect to non-existent files.
		if (primaryPhp.isFile(fsPath)) {
			if (fsPath.endsWith('.php')) {
				const effectiveRequest: PHPRequest = {
					...request,
					// Pass along URL with the #fragment filtered out
					url: requestedUrl.toString(),
				};
				return this.#spawnPHPAndDispatchRequest(
					effectiveRequest,
					fsPath
				);
			} else {
				return this.#serveStaticFile(primaryPhp, fsPath);
			}
		} else {
			return PHPResponse.forHttpCode(404);
		}
	}

	/**
	 * Serves a static file from the PHP filesystem.
	 *
	 * @param  fsPath - Absolute path of the static file to serve.
	 * @returns The response.
	 */
	#serveStaticFile(php: PHP, fsPath: string): PHPResponse {
		const arrayBuffer = php.readFileAsBuffer(fsPath);
		return new PHPResponse(
			200,
			{
				'content-length': [`${arrayBuffer.byteLength}`],
				// @TODO: Infer the content-type from the arrayBuffer instead of the
				// file path. The code below won't return the correct mime-type if the
				// extension was tampered with.
				'content-type': [inferMimeType(fsPath)],
				'accept-ranges': ['bytes'],
				'cache-control': ['public, max-age=0'],
			},
			arrayBuffer
		);
	}

	/**
	 * Spawns a new PHP instance and dispatches a request to it.
	 */
	async #spawnPHPAndDispatchRequest(
		request: PHPRequest,
		scriptPath: string
	): Promise<PHPResponse> {
		let spawnedPHP: SpawnedPHP | undefined = undefined;
		try {
			spawnedPHP = await this.processManager!.acquirePHPInstance();
		} catch (e) {
			if (e instanceof MaxPhpInstancesError) {
				return PHPResponse.forHttpCode(502);
			} else {
				return PHPResponse.forHttpCode(500);
			}
		}
		try {
			return await this.#dispatchToPHP(
				spawnedPHP.php,
				request,
				scriptPath
			);
		} finally {
			spawnedPHP.reap();
		}
	}

	/**
	 * Runs the requested PHP file with all the request and $_SERVER
	 * superglobals populated.
	 *
	 * @param  request - The request.
	 * @returns The response.
	 */
	async #dispatchToPHP(
		php: PHP,
		request: PHPRequest,
		scriptPath: string
	): Promise<PHPResponse> {
		let preferredMethod: PHPRunOptions['method'] = 'GET';

		const headers: Record<string, string> = {
			host: this.#HOST,
			...normalizeHeaders(request.headers || {}),
		};

		let body = request.body;
		if (typeof body === 'object' && !(body instanceof Uint8Array)) {
			preferredMethod = 'POST';
			const { bytes, contentType } = await encodeAsMultipart(body);
			body = bytes;
			headers['content-type'] = contentType;
		}

		try {
			const response = await php.run({
				relativeUri: ensurePathPrefix(
					toRelativeUrl(new URL(request.url)),
					this.#PATHNAME
				),
				protocol: this.#PROTOCOL,
				method: request.method || preferredMethod,
				$_SERVER: {
					REMOTE_ADDR: '127.0.0.1',
					DOCUMENT_ROOT: this.#DOCROOT,
					HTTPS: this.#ABSOLUTE_URL.startsWith('https://')
						? 'on'
						: '',
				},
				body,
				scriptPath,
				headers,
			});
			return response;
		} catch (error) {
			const executionError = error as PHPExecutionFailureError;
			if (executionError?.response) {
				return executionError.response;
			}
			throw error;
		}
	}
}

/**
 * Naively infer a file mime type from its path.
 *
 * @todo Infer the mime type based on the file contents.
 *       A naive function like this one can be inaccurate
 *       and potentially have negative security consequences.
 *
 * @param  path - The file path
 * @returns The inferred mime type.
 */
function inferMimeType(path: string): string {
	const extension = path.split('.').pop() as keyof typeof mimeTypes;
	// @TODO: Consider not sending a default mime type to let the browser guess
	return mimeTypes[extension] || mimeTypes['_default'];
}

/**
 * Applies the given rewrite rules to the given path.
 *
 * @param  path  The path to apply the rules to.
 * @param  rules The rules to apply.
 * @returns The path with the rules applied.
 */
export function applyRewriteRules(path: string, rules: RewriteRule[]): string {
	for (const rule of rules) {
		if (new RegExp(rule.match).test(path)) {
			return path.replace(rule.match, rule.replacement);
		}
	}
	return path;
}
