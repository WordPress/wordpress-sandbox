import { Sidebar } from './sidebar';
import { useMediaQuery } from '@wordpress/compose';
import { useAppDispatch, useActiveSite } from '../../lib/state/redux/store';
import { removeSite } from '../../lib/state/redux/slice-sites';

import css from './style.module.css';
import { SiteInfoPanel } from './site-info-panel';
import classNames from 'classnames';

import React, { forwardRef, useState } from 'react';
import { useCurrentUrl } from '../../lib/state/url/router-hooks';
import { SiteInfo } from '../../lib/state/redux/slice-sites';

export const SiteManager = forwardRef<
	HTMLDivElement,
	{
		className?: string;
	}
>(({ className }, ref) => {
	const [, setUrlComponents] = useCurrentUrl();

	const activeSite = useActiveSite()!;
	const [activeSection, setActiveSection] = useState<'sites' | 'site-info'>(
		activeSite ? 'site-info' : 'sites'
	);

	const dispatch = useAppDispatch();

	const onRemoveSite = async (siteToRemove: SiteInfo) => {
		const removingSelectedSite = siteToRemove.slug === activeSite?.slug;
		await dispatch(removeSite(siteToRemove.slug));
		if (removingSelectedSite) {
			setUrlComponents(
				{ searchParams: { 'site-slug': undefined } },
				'replace'
			);
			setActiveSection('sites');
		}
	};

	const fullScreenSections = useMediaQuery('(max-width: 875px)');
	const sitesList = (
		<Sidebar
			className={css.sidebar}
			afterSiteClick={() => setActiveSection('site-info')}
		/>
	);
	const siteInfoPanel = activeSite && (
		<SiteInfoPanel
			key={activeSite.slug}
			className={css.siteManagerSiteInfo}
			site={activeSite}
			removeSite={onRemoveSite}
			mobileUi={fullScreenSections}
			onBackButtonClick={() => {
				setActiveSection('sites');
			}}
		/>
	);
	return (
		<div className={classNames(css.siteManager, className)} ref={ref}>
			{fullScreenSections ? (
				activeSection === 'site-info' ? (
					siteInfoPanel
				) : (
					sitesList
				)
			) : (
				<>
					{sitesList}
					{siteInfoPanel}
				</>
			)}
		</div>
	);
});
