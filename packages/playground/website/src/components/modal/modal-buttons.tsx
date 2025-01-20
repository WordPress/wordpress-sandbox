import { Button, Flex } from '@wordpress/components';
import React from 'react';
import css from './style.module.css';

interface ModalButtonsProps {
	submitText?: string;
	areDisabled?: boolean;
	areBusy?: boolean;
	onCancel?: () => void;
	onSubmit?: (e: any) => void;
}
export default function ModalButtons({
	submitText = 'Submit',
	areDisabled = false,
	areBusy,
	onCancel,
	onSubmit,
}: ModalButtonsProps) {
	return (
		<Flex justify="end" className={css.modalButtons}>
			<Button
				disabled={areDisabled || areBusy}
				variant="link"
				onClick={onCancel}
			>
				Cancel
			</Button>
			<Button
				isBusy={areBusy}
				disabled={areDisabled}
				variant="primary"
				onClick={onSubmit}
			>
				{submitText}
			</Button>
		</Flex>
	);
}
