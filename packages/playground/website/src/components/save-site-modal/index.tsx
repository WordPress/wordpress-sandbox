import { useDispatch } from 'react-redux';
import SiteNameForm from '../site-name-form';
import { Modal } from '../modal';
import { PlaygroundDispatch, useActiveSite } from '../../lib/state/redux/store';
import { updateSiteMetadata } from '../../lib/state/redux/slice-sites';
import { useState } from 'react';
import { SiteStorageType } from '../../lib/site-metadata';
import { persistTemporarySite } from '../../lib/state/redux/persist-temporary-site';

interface SaveSiteModalProps {
	storageType: Extract<SiteStorageType, 'opfs' | 'local-fs'>;
	onClose: () => void;
}

export const SaveSiteModal = ({ storageType, onClose }: SaveSiteModalProps) => {
	const dispatch: PlaygroundDispatch = useDispatch();
	const [isSaving, setIsSaving] = useState(false);

	const activeSite = useActiveSite();

	const closeModal = () => {
		onClose();
	};

	async function handleSubmit(newName: string) {
		if (!activeSite || !activeSite.slug) {
			return null;
		}
		setIsSaving(true);
		await dispatch(
			updateSiteMetadata({
				slug: activeSite.slug,
				changes: {
					name: newName,
				},
			})
		);
		await dispatch(persistTemporarySite(activeSite.slug, storageType));
		setIsSaving(false);
		closeModal();
	}

	return (
		<Modal
			title="Save Playground"
			contentLabel='This is a dialog window which overlays the main content of the
				page. The modal begins with a heading 2 called "Save
				Playground". Pressing the Cancel button will close
				the modal and bring you back to where you were on the page.'
			onRequestClose={closeModal}
		>
			<SiteNameForm
				onClose={closeModal}
				onSubmit={handleSubmit}
				isBusy={isSaving}
				siteName={activeSite?.metadata.name ?? ''}
			/>
		</Modal>
	);
};
