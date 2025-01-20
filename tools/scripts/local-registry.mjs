#!/usr/bin/env node

import { execSync, spawnSync } from 'child_process';

const localRegistryUrl = 'http://localhost:4873/';

const [, , command] = process.argv;
if (!['enable', 'disable'].includes(command)) {
	console.error(`unknown command: ${command}`);
}

const result = spawnSync('npm', ['config', 'get', 'registry'], {});
const currentRegistry = result.stdout.toString().trim();

if (command === 'enable' && currentRegistry === localRegistryUrl) {
	console.log(`Local registry is already enabled: ${localRegistryUrl}`);
	process.exit(0);
} else if (command === 'disable' && currentRegistry !== localRegistryUrl) {
	console.log('Local registry is already disabled');
	console.log(`Active registry is ${currentRegistry}`);
	process.exit(0);
}

// Modifies .npmrc at the repo root.
if (command === 'enable') {
	console.log(`Setting registry to ${localRegistryUrl}`);
	spawnSync(
		'npm',
		[
			'config',
			'set',
			'registry',
			localRegistryUrl,
			'--location',
			'project',
		],
		{}
	);
	console.log(
		'Make sure to start the local registry with: npm run local-registry:start'
	);
} else if (command === 'disable') {
	console.log(`Disabling local registry`);
	spawnSync(
		'npm',
		['config', 'delete', 'registry', '--location', 'project'],
		{}
	);
}
