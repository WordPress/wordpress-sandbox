import { MenuItem } from '@wordpress/components';
import { setActiveModal } from '../../lib/state/redux/slice-ui';
import { PlaygroundDispatch } from '../../lib/state/redux/store';
import { useDispatch } from 'react-redux';
import { modalSlugs } from '../layout';

interface Props {
	onClose: () => void;
	disabled?: boolean;
}
export function RenameMenuItem({ onClose, disabled }: Props) {
	const dispatch: PlaygroundDispatch = useDispatch();
	return (
		<MenuItem
			aria-label="Rename this Playground"
			disabled={disabled}
			onClick={() => {
				dispatch(setActiveModal(modalSlugs.RENAME_SITE));
				onClose();
			}}
		>
			Rename
		</MenuItem>
	);
}
