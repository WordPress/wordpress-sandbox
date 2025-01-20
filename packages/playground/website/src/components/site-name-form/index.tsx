import React from 'react';
import { useState } from 'react';
import ModalButtons from '../modal/modal-buttons';
import { TextControl } from '@wordpress/components';

interface SiteNameFormProps {
	onClose: () => void;
	onSubmit: (newName: string) => void;
	isBusy: boolean;
	siteName: string;
}

export default function SiteNameForm({
	onClose,
	onSubmit,
	isBusy,
	siteName,
}: SiteNameFormProps) {
	const [newName, setNewName] = useState<string>(siteName);

	function submitOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Enter') {
			onSubmit(newName);
		}
	}

	return (
		<>
			<TextControl
				label="Playground name"
				placeholder="My Playground"
				value={newName}
				onChange={setNewName}
				onKeyDown={submitOnEnter}
			/>

			<ModalButtons
				areDisabled={!newName}
				onCancel={onClose}
				onSubmit={() => onSubmit(newName)}
				submitText="Save"
				areBusy={isBusy}
			/>
		</>
	);
}
