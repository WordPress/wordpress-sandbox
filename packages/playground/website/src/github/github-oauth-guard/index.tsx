import { Icon, Spinner } from '@wordpress/components';
import { oAuthState } from '../state';
import { GitHubIcon } from '../github';
import css from './style.module.css';
import { useState } from 'react';
import classNames from 'classnames';
import { useActiveSite } from '../../lib/state/redux/store';
import { Modal } from '../../components/modal';

const OAUTH_FLOW_URL = 'oauth.php?redirect=1';
const urlParams = new URLSearchParams(window.location.search);
export const oauthCode = urlParams.get('code');

export function GitHubOAuthGuardModal({ children }: GitHubOAuthGuardProps) {
	const [isModalOpen, setIsModalOpen] = useState(!oAuthState.value.token);

	if (oAuthState.value.token && !children) {
		return null;
	}

	if (!isModalOpen) {
		return null;
	}

	return (
		<Modal
			title="Connect to GitHub"
			onRequestClose={() => {
				setIsModalOpen(false);
			}}
		>
			<GitHubOAuthGuard mayLoseProgress={false}>
				{children}
			</GitHubOAuthGuard>
		</Modal>
	);
}

interface GitHubOAuthGuardProps {
	children?: React.ReactNode;
	mayLoseProgress?: boolean;
}
export default function GitHubOAuthGuard({
	children,
	mayLoseProgress,
}: GitHubOAuthGuardProps) {
	if (oAuthState.value.isAuthorizing) {
		return (
			<div>
				<Spinner />
				Authorizing...
			</div>
		);
	}

	if (oAuthState.value.token) {
		return <div>{children}</div>;
	}

	const urlParams = new URLSearchParams();
	urlParams.set('redirect_uri', window.location.href);
	const oauthUrl = `${OAUTH_FLOW_URL}&${urlParams.toString()}`;
	return (
		<Authenticate
			authenticateUrl={oauthUrl}
			mayLoseProgress={mayLoseProgress}
		/>
	);
}

interface AuthenticateProps {
	authenticateUrl: string;
	mayLoseProgress?: boolean;
}

function Authenticate({
	authenticateUrl,
	mayLoseProgress = undefined,
}: AuthenticateProps) {
	const storage = useActiveSite()?.metadata?.storage;

	if (mayLoseProgress === undefined) {
		mayLoseProgress = storage === 'none';
	}
	const [exported, setExported] = useState(false);
	const buttonClass = classNames(css.githubButton, {
		[css.disabled]: mayLoseProgress && !exported,
	});
	return (
		<div className="typography">
			<p>
				Importing plugins, themes, and wp-content directories directly
				from your public GitHub repositories.
			</p>
			<p>
				To enable this feature, connect your GitHub account with
				WordPress Playground.
			</p>
			{mayLoseProgress ? (
				<>
					<p>
						<b>You will lose your progress.</b> Your Playground is
						temporary and the authentication flow will redirect you
						to GitHub and erase all your changes. Be sure to export
						your Playground to a zip file before proceeding.
					</p>
					<label style={{ cursor: 'pointer' }}>
						<input
							type="checkbox"
							checked={exported}
							onChange={() => setExported(!exported)}
						/>
						I understand, and I have exported my Playground as a zip
						if needed.
					</label>
				</>
			) : null}
			<p>
				<a
					aria-label="Connect your GitHub account"
					className={buttonClass}
					href={authenticateUrl}
					onClick={(e) => {
						if (mayLoseProgress && !exported) {
							e.preventDefault();
						}
					}}
				>
					<Icon icon={GitHubIcon} />
					Connect your GitHub account
				</a>
			</p>
			<p>
				Your access token is not stored anywhere, which means you'll
				have to re-authenticate after every page refresh.
			</p>
		</div>
	);
}
