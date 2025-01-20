import * as path from 'path';
import * as fs from 'fs';
import { traverse } from 'estree-toolkit';
import { parseModule } from 'meriyah';

const thisScriptDir = path.dirname(process.argv[1]);

const phpJsPath = process.argv[2];
const phpJs = fs.readFileSync(phpJsPath, 'utf8');
const enhancedExitStatusJsPath = path.resolve(
	thisScriptDir,
	'esm-php-exit-status.js'
);
const enhancedExitStatusJs = fs.readFileSync(enhancedExitStatusJsPath, 'utf8');

const phpJsAst = parseModule(phpJs, { ranges: true });
console.log(phpJsAst);

traverse(phpJsAst, {
  ClassDeclaration(path) {
	  console.log(path.node);
    if (path.node?.id?.name === 'ExitStatus') {
		const endOfClassDeclaration = path.node.range[1];
		const head = phpJs.substring(0, endOfClassDeclaration);
		const tail = phpJs.substring(endOfClassDeclaration);

		const output = `${head}\n${enhancedExitStatusJs}\n${tail}`;
		console.log(output);
		fs.writeFileSync(phpJsPath, output);
		process.exit(0);
    }
  }
});

console.error('Did not find ExitStatus declaration to override.');
process.exit(-1);
