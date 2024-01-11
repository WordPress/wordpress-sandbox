import { UniversalPHP } from '@php-wasm/universal';
import { applyWordPressPatches } from '@wp-playground/blueprints';

export interface RequestData {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	data?: string;
}

export interface RequestMessage {
	type: 'request';
	data: RequestData;
}

/**
 * Allow WordPress to make network requests via the fetch API.
 * On the WordPress side, this is handled by Requests_Transport_Fetch
 *
 * @param playground the Playground instance to set up with network support.
 */
export async function setupFetchNetworkTransport(playground: UniversalPHP) {
	await applyWordPressPatches(playground, {
		addFetchNetworkTransport: true,
	});

	await playground.onMessage(async (message: string) => {
		const envelope: RequestMessage = JSON.parse(message);
		const { type, data } = envelope;
		if (type !== 'request') {
			return '';
		}

		return handleRequest(data);
	});
}

export async function handleRequest(data: RequestData, fetchFn = fetch) {
	const hostname = new URL(data.url).hostname;
	const fetchUrl = ['w.org', 's.w.org'].includes(
		hostname
	)
		? `/plugin-proxy.php?url=${encodeURIComponent(data.url)}`
		: data.url;

	let response;
	try {

		const fetchMethod = data.method || 'GET';
		let fetchHeaders = data.headers;
		if ( fetchMethod == 'POST' ) {
			if ( Array.isArray( fetchHeaders ) ) {
				fetchHeaders = Object.assign( {}, fetchHeaders );
			}
			fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';

			// Workaround for api.wordpress.org/core/version-check/1.7/ which doesn't support CORS preflight requests
			delete fetchHeaders['wp_install'];
			delete fetchHeaders['wp_blog'];
		}

		response = await fetchFn(fetchUrl, {
			method: fetchMethod,
			headers: fetchHeaders,
			body: data.data,
			credentials: 'omit',
		});
	} catch (e) {
		// console.error(e);
		return new TextEncoder().encode(
			`HTTP/1.1 400 Invalid Request\r\ncontent-type: text/plain\r\n\r\nPlayground could not serve the request.`
		);
	}
	const responseHeaders: string[] = [];
	response.headers.forEach((value, key) => {
		responseHeaders.push(key + ': ' + value);
	});

	/*
	 * Technically we should only send ASCII here and ensure we don't send control
	 * characters or newlines. We ought to be very careful with HTTP headers since
	 * some attacks rely on assumed processing of them to let things slip in that
	 * would end the headers section before its done. e.g. we don't want to allow
	 * emoji in a header and we don't want to allow \r\n\r\n in a header.
	 *
	 * That being said, the browser takes care of it for us.
	 * response.headers is an instance of the Headers class, and you just can't
	 * construct the Headers instance if the values are malformed:
	 *
	 * > new Headers({'Content-type': 'text/html\r\n\r\nBreakout!'})
	 * Failed to construct 'Headers': Invalid value
	 */
	const headersText =
		[
			'HTTP/1.1 ' + response.status + ' ' + response.statusText,
			...responseHeaders,
		].join('\r\n') + `\r\n\r\n`;
	const headersBuffer = new TextEncoder().encode(headersText);
	const bodyBuffer = new Uint8Array(await response.arrayBuffer());
	const jointBuffer = new Uint8Array(
		headersBuffer.byteLength + bodyBuffer.byteLength
	);
	jointBuffer.set(headersBuffer);
	jointBuffer.set(bodyBuffer, headersBuffer.byteLength);

	return jointBuffer;
}
