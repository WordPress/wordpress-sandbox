import { useDispatch } from 'react-redux';
import SiteNameForm from '../site-name-form';
import { Modal } from '../modal';
import { setActiveModal } from '../../lib/state/redux/slice-ui';
import { PlaygroundDispatch, useActiveSite } from '../../lib/state/redux/store';
import { updateSiteMetadata } from '../../lib/state/redux/slice-sites';
import { useState } from 'react';

export const RenameSiteModal = () => {
	const dispatch: PlaygroundDispatch = useDispatch();
	const [isUpdating, setIsUpdating] = useState(false);

	const activeSite = useActiveSite();

	const closeModal = () => {
		dispatch(setActiveModal(null));
	};

	async function handleSubmit(newName: string) {
		if (!activeSite || !activeSite.slug) {
			return null;
		}
		setIsUpdating(true);
		await dispatch(
			updateSiteMetadata({
				slug: activeSite.slug,
				changes: {
					name: newName,
				},
			})
		);
		setIsUpdating(false);
		closeModal();
	}

	return (
		<Modal
			title="Rename Playground"
			contentLabel='This is a dialog window which overlays the main content of the
				page. The modal begins with a heading 2 called "Rename
				Playground". Pressing the Cancel button will close
				the modal and bring you back to where you were on the page.'
			onRequestClose={closeModal}
		>
			<SiteNameForm
				onClose={closeModal}
				onSubmit={handleSubmit}
				isBusy={isUpdating}
				siteName={activeSite?.metadata.name ?? ''}
			/>
		</Modal>
	);
};
