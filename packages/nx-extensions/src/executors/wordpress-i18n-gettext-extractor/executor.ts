import { ExecutorContext } from '@nx/devkit';
import * as path from 'path';
import { WordPressI18nGettextExtractorSchema } from './schema';
import { extractWordPressI18nGettext } from '../../../../meta/src/wordpress-i18n-gettext-extractor';

/**
 * Extract a POT file from WordPress i18n calls in scripts and HTML files.
 *
 * @param options
 * @param context
 * @returns
 */
export default async function runExecutor(
	options: WordPressI18nGettextExtractorSchema,
	context: ExecutorContext
) {
	const outputFile = path.isAbsolute(options.outputFile)
		? options.outputFile
		: path.join(context.root, options.outputFile);

	const extractionStats = extractWordPressI18nGettext({
		scriptGlobs: options.scriptGlobs,
		htmlGlobs: options.htmlGlobs,
		outputFile: outputFile,
	});

	console.log('Extraction stats:');
	console.log(extractionStats);

	return { success: true };
}
