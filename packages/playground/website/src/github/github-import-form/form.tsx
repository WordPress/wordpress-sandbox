import React from 'react';
import { useState } from 'react';
import { Notice, Button as WPButton } from '@wordpress/components';
import { PlaygroundClient } from '@wp-playground/client';

import css from './style.module.css';
import forms from '../../forms.module.css';
import Button from '../../components/button';
import {
	GitHubURLInformation,
	staticAnalyzeGitHubURL,
} from '../analyze-github-url';
import {
	GetFilesProgress,
	GithubClient,
	createClient,
	getFilesFromDirectory,
} from '@wp-playground/storage';
import { oAuthState, setOAuthToken } from '../state';
import { ContentType, importFromGitHub } from '../import-from-github';
import { Spinner } from '../../components/spinner';
import GitHubOAuthGuard from '../github-oauth-guard';
import { basename, normalizePath } from '@php-wasm/util';
import { logger } from '@php-wasm/logger';

export interface GitHubImportFormProps {
	playground: PlaygroundClient;
	onImported: (details: {
		url: string;
		urlInformation: GitHubURLInformation;
		branch: string;
		path: string;
		contentType: ContentType;
		pluginOrThemeName: string;
		files: any[];
	}) => void;
	onClose: () => void;
}

let octokitClient: any;
function getClient() {
	if (!octokitClient) {
		octokitClient = createClient(oAuthState.value.token!);
	}
	return octokitClient;
}

export default function GitHubImportForm({
	playground,
	onImported,
}: GitHubImportFormProps) {
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
	const [isImporting, setIsImporting] = useState<boolean>(false);
	const [importProgress, setImportProgress] = useState<GetFilesProgress>({
		downloadedFiles: 0,
		foundFiles: 0,
	});
	const [showExample, setShowExample] = useState<boolean>(false);

	const [url, setUrl] = useState<string>('');
	const [urlInformation, setUrlInformation] = useState<
		GitHubURLInformation | undefined
	>();
	const [contentType, setContentType] = useState<ContentType | undefined>(
		undefined
	);
	const [path, setPath] = useState<string>('');
	const [branch, setBranch] = useState<string>('');

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const newUrl = url.trim();
		setUrl(newUrl);
		setErrors({});
		if (!newUrl) {
			setErrors({
				url: 'Please enter a URL',
			});
			return;
		}
		if (!urlInformation) {
			const info = staticAnalyzeGitHubURL(newUrl);
			if (info.type === 'unknown') {
				setErrors({
					url: 'This URL is not supported',
				});
			}
			logger.log(info);
			setUrlInformation(info);
			const octokit = getClient();
			setIsAnalyzing(true);
			try {
				if (!info.ref) {
					info.ref = (await guessDefaultBranch(octokit, info))!;
				}
				if (info.path) {
					setPath(info.path);
				}
				setBranch(info.ref);
				setContentType(await guessContentType(octokit, info));
				return;
			} catch (e: any) {
				logger.error(e);
				// Handle the "Bad Credentials" error
				if (e && e.status) {
					switch (e.status) {
						case 401:
							setOAuthToken(undefined);
							return;
						case 404:
							setErrors({
								url: "This repo (or the resource in it) doesn't exist",
							});
							return;
					}
				}
				setErrors({ url: e.message });
				throw e;
			} finally {
				setIsAnalyzing(false);
			}
		}
		if (!contentType) {
			setErrors({
				contentType: 'Please select what you want to import',
			});
			return;
		}
		setIsImporting(true);
		setImportProgress({ downloadedFiles: 0, foundFiles: 0 });
		try {
			const octokit = getClient();
			const pluginOrThemeName = basename(path!) || urlInformation!.repo!;

			const relativeRepoPath = path!.replace(/^\//g, '');
			const ghFiles = await getFilesFromDirectory(
				octokit,
				urlInformation!.owner!,
				urlInformation!.repo!,
				branch!,
				relativeRepoPath,
				{
					onProgress: (progress) =>
						setImportProgress({ ...progress }),
				}
			);
			await importFromGitHub(
				playground,
				ghFiles,
				contentType!,
				relativeRepoPath,
				pluginOrThemeName
			);
			onImported({
				url: newUrl,
				urlInformation: urlInformation!,
				path: path!,
				contentType,
				branch: branch!,
				pluginOrThemeName,
				files: ghFiles,
			});
		} catch (e) {
			let eMessage = (e as any)?.message;
			eMessage = eMessage ? `(${eMessage})` : '';
			setErrors({
				url: `There was an unexpected error ${eMessage}, please try again. If the problem persists, please report it at https://github.com/WordPress/wordpress-playground/issues.`,
			});
			throw e;
		} finally {
			setIsImporting(false);
		}
	}

	return (
		<GitHubOAuthGuard>
			<form
				id="import-playground-form"
				onSubmit={handleSubmit}
				className="typography"
			>
				<p>
					You may import WordPress plugins, themes, and entire
					wp-content directories from any public GitHub repository.
				</p>
				<div className={`${forms.formGroup} ${forms.formGroupLast}`}>
					<label>
						{' '}
						I want to import from this GitHub URL:
						<input
							type="text"
							value={url}
							className={css.repoInput}
							onChange={(
								e: React.ChangeEvent<HTMLInputElement>
							) => {
								setUrl(e.target.value);
								setUrlInformation(undefined);
							}}
							placeholder="https://github.com/my-org/my-repo/..."
							autoFocus
						/>
					</label>
					{'url' in errors ? (
						<div className={forms.error}>{errors.url}</div>
					) : null}
					<WPButton
						variant="link"
						style={{ marginTop: 5 }}
						onClick={() => setShowExample(!showExample)}
					>
						{showExample ? 'Hide examples' : 'Need an example?'}
					</WPButton>
				</div>
				{showExample ? (
					<Notice isDismissible={false} className={css.notice}>
						<p style={{ marginTop: 0 }}>
							Here's a few examples of URLs you can use:
						</p>
						<dl className={css.examplesDl}>
							<dt>A repository:</dt>
							<dd>https://github.com/org/repo-name</dd>

							<dt>A path inside a repository:</dt>
							<dd>
								https://github.com/org/repo-name/tree/trunk/my-theme
							</dd>

							<dt>A Pull Request:</dt>
							<dd>https://github.com/org/repo-name/pull/733</dd>
						</dl>
					</Notice>
				) : (
					false
				)}
				{urlInformation && !isAnalyzing ? (
					<>
						{urlInformation ? (
							<div>
								<h3>
									{urlInformation.type === 'pr' ? (
										<>
											Importing from Pull Request #
											{urlInformation.pr} at{' '}
											{urlInformation.owner}/
											{urlInformation.repo}
										</>
									) : urlInformation.type === 'branch' ? (
										<>
											Importing from branch{' '}
											{urlInformation.ref} at{' '}
											{urlInformation.owner}/
											{urlInformation.repo}
										</>
									) : urlInformation.type === 'repo' ? (
										<>
											Importing from the{' '}
											{urlInformation.owner}/
											{urlInformation.repo} repository
										</>
									) : (
										false
									)}
								</h3>
							</div>
						) : (
							false
						)}
						{['pr', 'branch', 'repo'].includes(
							urlInformation.type
						) ? (
							<>
								<div
									className={`${forms.formGroup} ${forms.formGroupLast}`}
								>
									<label>
										I am importing a:
										<select
											value={contentType}
											className={css.repoInput}
											onChange={(e) =>
												setContentType(
													e.target
														.value as ContentType
												)
											}
										>
											<option value="">
												-- Select an option --
											</option>
											<option value="theme">Theme</option>
											<option value="plugin">
												Plugin
											</option>
											<option value="wp-content">
												wp-content directory
											</option>
										</select>
									</label>
									{'contentType' in errors ? (
										<div className={forms.error}>
											{errors.contentType}
										</div>
									) : null}
								</div>
								<div
									className={`${forms.formGroup} ${forms.formGroupLast}`}
								>
									<label>
										From the following path in the repo:
										<input
											type="text"
											className={css.repoInput}
											value={normalizePath('/' + path)}
											onChange={(e) => {
												setPath(
													e.target.value.replace(
														/^\/+/,
														''
													)
												);
											}}
										/>
									</label>
									{'path' in errors ? (
										<div className={forms.error}>
											{errors.path}
										</div>
									) : null}
								</div>
							</>
						) : (
							false
						)}
					</>
				) : (
					false
				)}
				<div className={forms.submitRow}>
					<Button
						disabled={!url || isAnalyzing || isImporting}
						type="submit"
						variant="primary"
						size="large"
					>
						{isAnalyzing ? (
							<>
								<Spinner size={20} />
								Analyzing the repository...
							</>
						) : isImporting ? (
							<>
								<Spinner size={20} />
								{` Importing... ${importProgress.downloadedFiles}/${importProgress.foundFiles} files downloaded`}
							</>
						) : (
							'Import'
						)}
					</Button>
				</div>
			</form>
		</GitHubOAuthGuard>
	);
}

async function guessDefaultBranch(
	octokit: GithubClient,
	urlDetails: GitHubURLInformation
): Promise<string | undefined> {
	if (urlDetails.type === 'pr') {
		const prDetails = await octokit.rest.pulls.get({
			owner: urlDetails.owner!,
			repo: urlDetails.repo!,
			pull_number: urlDetails.pr!,
		});
		return prDetails.data.head.ref;
	}
	if (urlDetails.type === 'repo') {
		const {
			data: { default_branch },
		} = await octokit.rest.repos.get({
			owner: urlDetails.owner!,
			repo: urlDetails.repo!,
		});
		return default_branch;
	}
}

async function guessContentType(
	octokit: GithubClient,
	{ owner, repo, path, ref }: GitHubURLInformation
): Promise<ContentType | undefined> {
	// Guess the content type
	const { data: files } = await octokit.rest.repos.getContent({
		owner: owner!,
		repo: repo!,
		path: path!,
		ref,
	});
	if (Array.isArray(files)) {
		if (files.some(({ name }) => name === 'theme.json')) {
			return 'theme';
		} else if (
			files.some(({ name }) =>
				['plugins', 'themes', 'mu-plugins'].includes(name)
			)
		) {
			return 'wp-content';
		} else if (files.some(({ name }) => name.endsWith('.php'))) {
			return 'plugin';
		}
	}
}
