import { dirname, joinPaths } from '@php-wasm/util';
import { UniversalPHP } from './universal-php';

export interface WriteFilesOptions {
	/**
	 * Whether to wipe out the contents of the
	 * root directory before writing the new files.
	 */
	rmRoot?: boolean;
}

type FileContent = Uint8Array | string | FileTree;
type MaybePromise<T> = T | Promise<T>;

export interface FileTree extends Record<string, FileContent> {}

export interface FileTreeAsync
	extends Record<string, MaybePromise<FileContent>> {}

/**
 * Writes multiple files to a specified directory in the Playground
 * filesystem.
 *
 * @example ```ts
 * await writeFiles(php, '/test', {
 * 	'file.txt': 'file',
 * 	'sub/file.txt': 'file',
 * 	'sub1/sub2/file.txt': 'file',
 * });
 * ```
 *
 * @param php
 * @param root
 * @param newFiles
 * @param options
 */
export async function writeFiles(
	php: UniversalPHP,
	root: string,
	newFiles: MaybePromise<FileTreeAsync>,
	{ rmRoot = false }: WriteFilesOptions = {}
) {
	if (rmRoot) {
		if (await php.isDir(root)) {
			await php.rmdir(root, { recursive: true });
		}
	}
	newFiles = await newFiles;
	for (const relativePath of Object.keys(newFiles)) {
		const content = await newFiles[relativePath];

		const filePath = joinPaths(root, relativePath);
		if (!(await php.fileExists(dirname(filePath)))) {
			await php.mkdir(dirname(filePath));
		}
		if (content instanceof Uint8Array || typeof content === 'string') {
			await php.writeFile(filePath, content);
		} else {
			await writeFiles(php, filePath, content);
		}
	}
}
