import React, { useEffect, useState, useCallback } from '@wordpress/element';
import { FileNode, FilePickerTree } from './components/FilePickerTree';
import { store as editorStore } from '@wordpress/editor';
import { store as preferencesStore } from '@wordpress/preferences';
import {
	register,
	createReduxStore,
	dispatch,
	useDispatch,
	useSelect,
} from '@wordpress/data';
import apiFetch from '@wordpress/api-fetch';
import { addLoadingOverlay, addLocalFilesTab } from './add-local-files-tab';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { Spinner, Button } from '@wordpress/components';
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import css from './style.module.css';
import { FileTree } from 'components/FilePickerTree/types';

// Pre-populated by plugin.php
const WP_LOCAL_FILE_POST_TYPE = window.WP_LOCAL_FILE_POST_TYPE;

let fileTreePromise = apiFetch({
	path: '/static-files-editor/v1/get-files-tree',
});

// Create a custom store for transient UI state
const STORE_NAME = 'static-files-editor/ui';
const uiStore = createReduxStore(STORE_NAME, {
	reducer(state = { isPostLoading: false }, action) {
		switch (action.type) {
			case 'SET_POST_LOADING':
				return { ...state, isPostLoading: action.isLoading };
			default:
				return state;
		}
	},
	actions: {
		setPostLoading(isLoading) {
			return { type: 'SET_POST_LOADING', isLoading };
		},
	},
	selectors: {
		isPostLoading(state) {
			return state.isPostLoading;
		},
	},
});

register(uiStore);

function ConnectedFilePickerTree() {
	const [fileTree, setFileTree] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Get the current post's file path from meta
	const [meta] = useEntityProp('postType', WP_LOCAL_FILE_POST_TYPE, 'meta');
	const [selectedPath, setSelectedPath] = useState(
		meta?.local_file_path || '/'
	);
	// interface-interface-skeleton__content
	useEffect(() => {
		async function refreshPostId() {
			setPostLoading(true);
			const { post_id } = (await apiFetch({
				path: '/static-files-editor/v1/get-or-create-post-for-file',
				method: 'POST',
				data: { path: selectedPath },
			})) as { post_id: string };
			setSelectedPostId(post_id);
		}
		refreshPostId();
	}, [selectedPath]);

	const initialPostId = useSelect(
		(select) => select(editorStore).getCurrentPostId(),
		[]
	);
	const [selectedPostId, setSelectedPostId] = useState(initialPostId);

	const { post, hasLoadedPost, onNavigateToEntityRecord } = useSelect(
		(select) => {
			const { getEntityRecord, isResolving, hasFinishedResolution } =
				select(coreStore);
			return {
				onNavigateToEntityRecord:
					select(blockEditorStore).getSettings()
						.onNavigateToEntityRecord,
				post: getEntityRecord(
					'postType',
					WP_LOCAL_FILE_POST_TYPE,
					selectedPostId
				),
				hasLoadedPost: hasFinishedResolution('getEntityRecord', [
					'postType',
					WP_LOCAL_FILE_POST_TYPE,
					selectedPostId,
				]),
			};
		},
		[selectedPostId]
	);

	const { setPostLoading } = useDispatch(STORE_NAME);

	useEffect(() => {
		// Only navigate once the post has been loaded. Otherwise the editor
		// will disappear for a second – the <Editor> component renders its
		// children conditionally on having the post available.
		setPostLoading(!hasLoadedPost);
		if (hasLoadedPost && post) {
			onNavigateToEntityRecord({
				postId: selectedPostId,
				postType: WP_LOCAL_FILE_POST_TYPE,
			});
		}
	}, [hasLoadedPost, post, setPostLoading]);

	const refreshFileTree = useCallback(async () => {
		fileTreePromise = apiFetch({
			path: '/static-files-editor/v1/get-files-tree',
		});
		setFileTree(await fileTreePromise);
	}, []);

	useEffect(() => {
		fileTreePromise
			.then((tree) => {
				setFileTree(tree);
			})
			.catch((error) => {
				console.error('Failed to load file tree:', error);
			})
			.finally(() => {
				setIsLoading(false);
			});
	}, []);

	const handleNodeDeleted = async (path: string) => {
		try {
			await apiFetch({
				path: '/static-files-editor/v1/delete-path',
				method: 'POST',
				data: { path },
			});
			await refreshFileTree();
		} catch (error) {
			console.error('Failed to delete file:', error);
		}
	};

	const handleFileClick = async (filePath: string, node: FileNode) => {
		setSelectedPath(filePath);
	};

	const handleNodesCreated = async (tree: FileTree) => {
		try {
			const formData = new FormData();
			formData.append('path', tree.path);

			// Convert nodes to JSON, but extract files to separate form fields
			const processNode = (node: FileNode, prefix: string): any => {
				const nodeData = { ...node };
				if (node.content instanceof File) {
					formData.append(`${prefix}_content`, node.content);
					nodeData.content = `@file:${prefix}_content`;
				}
				if (node.children) {
					nodeData.children = node.children.map((child, index) =>
						processNode(child, `${prefix}_${index}`)
					);
				}
				return nodeData;
			};

			const processedNodes = tree.nodes.map((node, index) =>
				processNode(node, `file_${index}`)
			);
			formData.append('nodes', JSON.stringify(processedNodes));

			const response = (await apiFetch({
				path: '/static-files-editor/v1/create-files',
				method: 'POST',
				body: formData,
			})) as { created_files: Array<{ path: string; post_id: string }> };

			await refreshFileTree();

			if (response.created_files.length > 0) {
				onNavigateToEntityRecord({
					postId: response.created_files[0].post_id,
					postType: WP_LOCAL_FILE_POST_TYPE,
				});
			}
		} catch (error) {
			console.error('Failed to create files:', error);
		}
	};

	const handleNodeMoved = async ({
		fromPath,
		toPath,
	}: {
		fromPath: string;
		toPath: string;
	}) => {
		try {
			console.log('Moving file from', fromPath, 'to', toPath);
			await apiFetch({
				path: '/static-files-editor/v1/move-file',
				method: 'POST',
				data: {
					fromPath,
					toPath,
				},
			});
			await refreshFileTree();
		} catch (error) {
			console.error('Failed to move file:', error);
		}
	};

	if (isLoading) {
		return <Spinner />;
	}

	if (!fileTree) {
		return <div>No files found</div>;
	}

	return (
		<FilePickerTree
			files={fileTree}
			onSelect={handleFileClick}
			initialPath={selectedPath}
			onNodesCreated={handleNodesCreated}
			onNodeDeleted={handleNodeDeleted}
			onNodeMoved={handleNodeMoved}
		/>
	);
}

addLocalFilesTab({
	name: 'local-files',
	title: 'Local Files',
	panel: (
		<div className={css['file-picker-tree-container']}>
			<ConnectedFilePickerTree />
		</div>
	),
});

function PostLoadingOverlay() {
	const isLoading = useSelect(
		(select) => select(STORE_NAME).isPostLoading(),
		[]
	);
	if (!isLoading) {
		return null;
	}
	return (
		<div
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: 'rgba(0, 0, 0, 0.5)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1000,
			}}
		>
			<Spinner />
		</div>
	);
}

addLoadingOverlay(<PostLoadingOverlay />);

dispatch(preferencesStore).set('welcomeGuide', false);
dispatch(preferencesStore).set('enableChoosePatternModal', false);
dispatch(editorStore).setIsListViewOpened(true);
