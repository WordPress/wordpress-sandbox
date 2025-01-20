import { PHP, PHPRequest } from '@php-wasm/universal';
import { RecommendedPHPVersion } from '@wp-playground/common';
import {
	getSqliteDatabaseModule,
	getWordPressModule,
} from '@wp-playground/wordpress-builds';
import { login } from './login';
import { PHPRequestHandler, HttpCookieStore } from '@php-wasm/universal';
import { bootWordPress } from '@wp-playground/wordpress';
import { loadNodeRuntime } from '@php-wasm/node';
import { defineWpConfigConsts } from './define-wp-config-consts';
import { joinPaths, phpVar } from '@php-wasm/util';

describe('Blueprint step login', () => {
	let php: PHP;
	let handler: PHPRequestHandler;
	let cookieStore: HttpCookieStore;
	beforeEach(async () => {
		handler = await bootWordPress({
			createPhpRuntime: async () =>
				await loadNodeRuntime(RecommendedPHPVersion),
			siteUrl: 'http://playground-domain/',

			wordPressZip: await getWordPressModule(),
			sqliteIntegrationPluginZip: await getSqliteDatabaseModule(),
		});
		cookieStore = new HttpCookieStore();
		php = await handler.getPrimaryPhp();
	});

	const requestFollowRedirectsWithCookies = async (request: PHPRequest) => {
		let response = await handler.request(request);
		while (response.httpStatusCode === 302) {
			cookieStore.rememberCookiesFromResponseHeaders(response.headers);

			const cookieHeader = cookieStore.getCookieRequestHeader();
			response = await handler.request({
				url: response.headers['location'][0],
				headers: {
					...(cookieHeader && { cookie: cookieHeader }),
				},
			});
		}
		return response;
	};

	it('should log the user in', async () => {
		await login(php, {});
		const response = await requestFollowRedirectsWithCookies({
			url: '/',
		});
		expect(response.httpStatusCode).toBe(200);
		expect(response.text).toContain('Edit site');
	});

	it('should log the user into wp-admin', async () => {
		await login(php, {});
		const response = await requestFollowRedirectsWithCookies({
			url: '/wp-admin/',
		});
		expect(response.httpStatusCode).toBe(200);
		expect(response.text).toContain('Dashboard');
	});

	it('should log the user in if the playground_force_auto_login_as_user query parameter is set', async () => {
		await defineWpConfigConsts(php, {
			consts: {
				PLAYGROUND_FORCE_AUTO_LOGIN_ENABLED: true,
			},
		});
		const response = await requestFollowRedirectsWithCookies({
			url: '/?playground_force_auto_login_as_user=admin',
		});
		expect(response.httpStatusCode).toBe(200);
		expect(response.text).toContain('Dashboard');
	});

	it('should set WordPress login cookie after login', async () => {
		await login(php, {});
		await php.writeFile(
			'/wordpress/nonce-test.php',
			`<?php
				require_once ${phpVar(joinPaths(handler.documentRoot, 'wp-load.php'))};
				if (!empty($_COOKIE) && array_filter(array_keys($_COOKIE), function($key) {
						return strpos($key, 'wordpress_logged_in_') === 0;
					})
				) {
					echo '1';
				}
			`
		);
		const response = await requestFollowRedirectsWithCookies({
			url: '/nonce-test.php',
		});
		expect(response.text).toBe('1');
	});
});
