import {
	GettextExtractor,
	HtmlExtractors,
	JsExtractors,
} from 'gettext-extractor';

export function extractWordPressI18nGettext({
	scriptGlobs,
	htmlGlobs,
	outputFile: outputFile,
}: {
	scriptGlobs: string[];
	htmlGlobs: string[];
	outputFile: string;
}) {
	const extractor = new GettextExtractor();

	const comments = {
		otherLineLeading: true,
		sameLineLeading: true,
		sameLineTrailing: true,
		regex: /translators.*/is,
	};
	const jsParser = extractor.createJsParser([
		JsExtractors.callExpression('__', {
			arguments: {
				text: 0,
			},
			comments,
		}),
		JsExtractors.callExpression('_x', {
			arguments: {
				text: 0,
				context: 1,
			},
			comments,
		}),
		JsExtractors.callExpression('_n', {
			arguments: {
				text: 0,
				textPlural: 1,
			},
			comments,
		}),
		JsExtractors.callExpression('_nx', {
			arguments: {
				text: 0,
				textPlural: 1,
				context: 3,
			},
			comments,
		}),
	]);

	for (const scriptGlob of scriptGlobs) {
		jsParser.parseFilesGlob(scriptGlob);
	}

	const htmlParser = extractor.createHtmlParser([
		HtmlExtractors.embeddedJs('script', jsParser),
	]);

	for (const htmlGlob of htmlGlobs) {
		htmlParser.parseFilesGlob(htmlGlob);
	}

	extractor.savePotFile(outputFile);

	return extractor.getStats();
}
