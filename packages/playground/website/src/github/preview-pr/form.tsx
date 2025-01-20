import React, { useEffect } from 'react';
import { useState } from 'react';
import { Spinner, TextControl } from '@wordpress/components';
import css from './style.module.css';
import { logger } from '@php-wasm/logger';
import ModalButtons from '../../components/modal/modal-buttons';
import type { Blueprint } from '@wp-playground/blueprints';

interface PreviewPRFormProps {
	onClose: () => void;
	target: 'wordpress' | 'gutenberg';
}

const urlParams = new URLSearchParams(window.location.search);

// This structure is from plugin-proxy.php
// where we set allowed inputs for WordPress and Gutenberg repositories
export const targetParams = {
	wordpress: {
		repo: 'wordpress-develop',
		workflow: 'Test%20Build%20Processes',
		artifact: 'wordpress-build-',
		pull: 'github.com/wordpress/wordpress-develop/pull'
	},
	gutenberg: {
		repo: 'gutenberg',
		workflow: 'Build%20Gutenberg%20Plugin%20Zip',
		artifact: 'gutenberg-plugin',
		pull: 'github.com/wordpress/gutenberg/pull'
	},
};

export default function PreviewPRForm({
	onClose,
	target = 'wordpress',
}: PreviewPRFormProps) {
	const [value, setValue] = useState<string>('');
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [errorMsg, setError] = useState<string>('');

	useEffect(() => {
		const query = new URLSearchParams(window.location.search);
		if (query.has('core-pr')) {
			const prNumber = query.get('core-pr');
			prNumber && setValue(prNumber);
		}
	}, []);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!value) {
			return;
		}

		await previewPr(value);
	}

	function renderRetryIn(retryIn: number) {
		setError(
			`Waiting for GitHub to finish building PR ${value}. This might take 15 minutes or more! Retrying in ${
				retryIn / 1000
			}...`
		);
	}

	async function previewPr(prValue: string) {
		let cleanupRetry = () => {};
		if (cleanupRetry) {
			cleanupRetry();
		}

		let prNumber: string = prValue;
		setSubmitting(true);

		// Extract number from a GitHub URL
		if (
			prNumber
				.toLowerCase()
				.includes(targetParams[target].pull)
		) {
			prNumber = prNumber.match(/\/pull\/(\d+)/)![1];
		}

		// Verify that the PR exists and that GitHub CI finished building it
		const zipArtifactUrl = `https://playground.wordpress.net/plugin-proxy.php?org=WordPress&repo=${
			targetParams[target].repo
		}&workflow=${targetParams[target].workflow}&artifact=${
			targetParams[target].artifact
		}${target === 'wordpress' ? prNumber : ''}&pr=${prNumber}`;
		// Send the HEAD request to zipArtifactUrl to confirm the PR and the artifact both exist
		const response = await fetch(zipArtifactUrl + '&verify_only=true');
		if (response.status !== 200) {
			let error = 'invalid_pr_number';
			try {
				const json = await response.json();
				if (json.error) {
					error = json.error;
				}
			} catch (e) {
				logger.error(e);
				setError('An unexpected error occurred. Please try again.');
				return;
			}

			if (error === 'invalid_pr_number') {
				setError(`The PR ${prNumber} does not exist.`);
			} else if (
				error === 'artifact_not_found' ||
				error === 'artifact_not_available'
			) {
				if (parseInt(prNumber) < 5749) {
					setError(
						`The PR ${prNumber} predates the Pull Request previewer and requires a rebase before it can be previewed.`
					);
				} else {
					let retryIn = 30000;
					renderRetryIn(retryIn);
					const timerInterval = setInterval(() => {
						retryIn -= 1000;
						if (retryIn <= 0) {
							retryIn = 0;
						}
						renderRetryIn(retryIn);
					}, 1000);
					const scheduledRetry = setTimeout(() => {
						previewPr(prNumber);
					}, retryIn);
					cleanupRetry = () => {
						clearInterval(timerInterval);
						clearTimeout(scheduledRetry);
						cleanupRetry = () => {};
					};
				}
			} else if (error === 'artifact_invalid') {
				setError(
					`The PR ${prNumber} requires a rebase before it can be previewed.`
				);
			} else {
				setError(
					`The PR ${prNumber} couldn't be previewed due to an unexpected error. Please try again later or fill an issue in the WordPress Playground repository.`
				);
				// https://github.com/WordPress/wordpress-playground/issues/new
			}

			setSubmitting(false);

			return;
		}

		// Redirect to the Playground site with the Blueprint to download and apply the PR
		const blueprint: Blueprint = {
			landingPage: urlParams.get('url') || '/wp-admin',
			login: true,
			features: {
				networking: true,
			},
			steps: [],
		};

		if (target === 'wordpress') {
			// [wordpress] Passthrough the mode query parameter if it exists
			const targetParams = new URLSearchParams();
			if (urlParams.has('mode')) {
				targetParams.set('mode', urlParams.get('mode') as string);
			}
			targetParams.set('core-pr', prNumber);

			const blueprintJson = JSON.stringify(blueprint);
			const urlWithPreview = new URL(
				window.location.pathname,
				window.location.href
			);
			urlWithPreview.search = targetParams.toString();
			urlWithPreview.hash = encodeURI(blueprintJson);

			window.location.href = urlWithPreview.toString();
		} else if (target === 'gutenberg') {
			// [gutenberg] If there's a import-site query parameter, pass that to the blueprint
			const urlParams = new URLSearchParams(window.location.search);
			try {
				const importSite = new URL(
					urlParams.get('import-site') as string
				);
				if (importSite) {
					// Add it as the first step in the blueprint
					blueprint.steps!.unshift({
						step: 'importWordPressFiles',
						wordPressFilesZip: {
							resource: 'url',
							url: importSite.origin + importSite.pathname,
						},
					});
				}
			} catch {
				logger.error('Invalid import-site URL');
			}

			const blueprintJson = JSON.stringify(blueprint);

			const urlWithPreview = new URL(
				window.location.pathname,
				window.location.href
			);
			urlWithPreview.searchParams.set('gutenberg-pr', prNumber);
			urlWithPreview.hash = encodeURI(blueprintJson);

			window.location.href = urlWithPreview.toString();
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<div className={css.content}>
				{submitting && (
					<div className={css.overlay}>
						<Spinner />
					</div>
				)}
				<TextControl
					disabled={submitting}
					label="Pull request number or URL"
					value={value}
					autoFocus
					onChange={(e) => {
						setError('');
						setValue(e);
					}}
				/>
				{errorMsg && <div className={css.error}>{errorMsg}</div>}
			</div>
			<ModalButtons
				areDisabled={submitting}
				onCancel={onClose}
				onSubmit={handleSubmit}
				submitText="Preview"
			/>
		</form>
	);
}
