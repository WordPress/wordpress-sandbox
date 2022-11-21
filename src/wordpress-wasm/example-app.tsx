import { bootWordPress } from './index';
import { login, installPlugin } from './macros';
import {
	cloneResponseMonitorProgress,
	responseTo,
} from '../php-wasm-browser/index';
import React from 'react';
import { render } from 'react-dom';

import WordPressPluginIDE from './wordpress-plugin-ide/WordPressPluginIDE';
import createBlockPluginFixture from './wordpress-plugin-ide/php-fixtures/create-block-plugin';

const query = new URL(document.location.href).searchParams;

const wpFrame = document.querySelector('#wp') as HTMLIFrameElement;

function setupAddressBar(wasmWorker) {
	// Manage the address bar
	const addressBar = document.querySelector(
		'#address-bar'
	)! as HTMLInputElement;
	wpFrame.addEventListener('load', (e: any) => {
		addressBar.value = wasmWorker.internalUrlToPath(
			e.currentTarget!.contentWindow.location.href
		);
	});

	document
		.querySelector('#address-bar-form')!
		.addEventListener('submit', (e) => {
			e.preventDefault();
			let requestedPath = addressBar.value;
			// Ensure a trailing slash when requesting directory paths
			const isDirectory = !requestedPath.split('/').pop()!.includes('.');
			if (isDirectory && !requestedPath.endsWith('/')) {
				requestedPath += '/';
			}
			wpFrame.src = wasmWorker.pathToInternalUrl(requestedPath);
		});
}

class FetchProgressBar {
	expectedRequests;
	progress;
	min;
	max;
	el;
	constructor({ expectedRequests, min = 0, max = 100 }) {
		this.expectedRequests = expectedRequests;
		this.progress = {};
		this.min = min;
		this.max = max;
		this.el = document.querySelector('.progress-bar.is-finite');

		// Hide the progress bar when the page is first loaded.
		const HideProgressBar = () => {
			document
				.querySelector('body.is-loading')!
				.classList.remove('is-loading');
			wpFrame.removeEventListener('load', HideProgressBar);
		};
		wpFrame.addEventListener('load', HideProgressBar);
	}

	onDataChunk = ({ file, loaded, total }) => {
		if (Object.keys(this.progress).length === 0) {
			this.setFinite();
		}

		this.progress[file] = loaded / total;
		const progressSum = Object.entries(this.progress).reduce(
			(acc, [_, percentFinished]) => acc + (percentFinished as number),
			0
		);
		const totalProgress = Math.min(1, progressSum / this.expectedRequests);
		const scaledProgressPercentage =
			this.min + (this.max - this.min) * totalProgress;

		this.setProgress(scaledProgressPercentage);
	};

	setProgress(percent) {
		this.el.style.width = `${percent}%`;
	}

	setFinite() {
		const classList = document.querySelector(
			'.progress-bar-wrapper.mode-infinite'
		)!.classList;
		classList.remove('mode-infinite');
		classList.add('mode-finite');
	}
}

async function main() {
	const preinstallPlugin = query.get('plugin');
	let progressBar;
	let pluginResponse;
	if (preinstallPlugin) {
		pluginResponse = await fetch(
			'/plugin-proxy?plugin=' + preinstallPlugin
		);
		progressBar = new FetchProgressBar({
			expectedRequests: 3,
			max: 80,
		});
	} else {
		progressBar = new FetchProgressBar({ expectedRequests: 2 });
	}

	const workerThread = await bootWordPress({
		onWasmDownloadProgress: progressBar.onDataChunk,
	});
	const appMode = query.get('mode') === 'seamless' ? 'seamless' : 'browser';
	if (appMode === 'browser') {
		setupAddressBar(workerThread);
	}

	if (preinstallPlugin) {
		// Download the plugin file
		const progressPluginResponse = cloneResponseMonitorProgress(
			pluginResponse,
			(progress) =>
				progressBar.onDataChunk({ file: preinstallPlugin, ...progress })
		);
		const blob = await progressPluginResponse.blob();
		const pluginFile = new File([blob], preinstallPlugin);

		// We can't tell how long the operations below
		// will take. Let's slow down the CSS width transition
		// to at least give some impression of progress.
		progressBar.el.classList.add('indeterminate');
		// We're at 80 already, but it's a nice reminder.
		progressBar.setProgress(80);

		progressBar.setProgress(85);
		await login(workerThread, 'admin', 'password');

		progressBar.setProgress(100);
		await installPlugin(workerThread, pluginFile);
	} else if (query.get('login')) {
		await login(workerThread, 'admin', 'password');
	}

	if (query.get('rpc')) {
		console.log('Registering an RPC handler');
		async function handleMessage(event) {
			if (event.data.type === 'rpc') {
				return await workerThread[event.data.method](
					...event.data.args
				);
			} else if (event.data.type === 'go_to') {
				wpFrame.src = workerThread.pathToInternalUrl(event.data.path);
			} else if (event.data.type === 'is_alive') {
				return true;
			}
		}
		window.addEventListener('message', async (event) => {
			const result = await handleMessage(event.data);

			// When `requestId` is present, the other thread expects a response:
			if (event.data.requestId) {
				const response = responseTo(event.data.requestId, result);
				window.parent.postMessage(response, '*');
			}
		});
	}

	let doneFirstBoot = false;
	render(
		<WordPressPluginIDE
			plugin={createBlockPluginFixture}
			workerThread={workerThread}
			initialFileName="edit.js"
			onBundleReady={(bundleContents: string) => {
				if (doneFirstBoot) {
					(wpFrame.contentWindow as any).eval(bundleContents);
				} else {
					doneFirstBoot = true;
					wpFrame.src = workerThread.pathToInternalUrl(
						query.get('url') || '/'
					);
				}
			}}
		/>,
		document.getElementById('test-snippets')!
	);
}
main();
