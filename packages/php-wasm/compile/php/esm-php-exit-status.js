/**
 * Overrides Emscripten's default ExitStatus object which gets
 * thrown on failure. Unfortunately, the default object is not
 * a subclass of Error and does not provide any stack trace.
 *
 * This is a deliberate behavior on Emscripten's end to prevent
 * memory leaks after the program exits. See:
 *
 * https://github.com/emscripten-core/emscripten/pull/9108
 *
 * In case of WordPress Playground, the worker in which the PHP
 * runs will typically exit after the PHP program finishes, so
 * we don't have to worry about memory leaks.
 *
 * As for assigning to a previously undeclared ExitStatus variable here,
 * the Emscripten module declares `ExitStatus` as `function ExitStatus`
 * which means it gets hoisted to the top of the scope and can be
 * reassigned here – before the actual declaration is reached.
 *
 * If that sounds weird, try this example:
 *
 * ExitStatus = () => { console.log("reassigned"); }
 * function ExitStatus() {}
 * ExitStatus();
 * // logs "reassigned"
 */
ExitStatus = class PHPExitStatus extends Error {
	constructor(status) {
		super(status);
		this.name = "ExitStatus";
		this.message = "Program terminated with exit(" + status + ")";
		this.status = status;
	}
}