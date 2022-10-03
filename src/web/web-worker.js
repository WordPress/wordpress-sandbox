console.log( '[WebWorker] Spawned' );

const noop = function()	{};
const wasmTable = new WebAssembly.Table( {
	initial: 2435,
	maximum: 2435,
	element: 'anyfunc',
} );
const WASM_PAGE_SIZE = 65536;
const INITIAL_INITIAL_MEMORY = 1073741824;
const wasmMemory = new WebAssembly.Memory( {
	initial: INITIAL_INITIAL_MEMORY / WASM_PAGE_SIZE,
} );

const info = {
	env: {
		// System functions – they must be provided but don't have to be implemented to cause the crash.
		"___assert_fail": noop, "___buildEnvironment": noop, "___clock_gettime": noop, "___map_file": noop, "___sys__newselect": noop, "___sys_access": noop, "___sys_chdir": noop, "___sys_chmod": noop, "___sys_chown32": noop, "___sys_dup": noop, "___sys_dup2": noop, "___sys_fchmod": noop, "___sys_fchown32": noop, "___sys_fcntl64": noop, "___sys_fstat64": noop, "___sys_ftruncate64": noop, "___sys_getcwd": noop, "___sys_getdents64": noop, "___sys_getegid32": noop, "___sys_geteuid32": noop, "___sys_getgid32": noop, "___sys_getgroups32": noop, "___sys_getpid": noop, "___sys_getrusage": noop, "___sys_getuid32": noop, "___sys_ioctl": noop, "___sys_lchown32": noop, "___sys_link": noop, "___sys_lstat64": noop, "___sys_madvise1": noop, "___sys_mkdir": noop, "___sys_mmap2": noop, "___sys_mremap": noop, "___sys_munmap": noop, "___sys_nice": noop, "___sys_open": noop, "___sys_pipe": noop, "___sys_poll": noop, "___sys_read": noop, "___sys_readlink": noop, "___sys_rename": noop, "___sys_rmdir": noop, "___sys_socketcall": noop, "___sys_stat64": noop, "___sys_statfs64": noop, "___sys_symlink": noop, "___sys_umask": noop, "___sys_uname": noop, "___sys_unlink": noop, "___sys_wait4": noop, "___syscall10": noop, "___syscall102": noop, "___syscall114": noop, "___syscall12": noop, "___syscall122": noop, "___syscall142": noop, "___syscall15": noop, "___syscall163": noop, "___syscall168": noop, "___syscall183": noop, "___syscall192": noop, "___syscall194": noop, "___syscall195": noop, "___syscall196": noop, "___syscall197": noop, "___syscall198": noop, "___syscall199": noop, "___syscall20": noop, "___syscall200": noop, "___syscall201": noop, "___syscall205": noop, "___syscall207": noop, "___syscall212": noop, "___syscall219": noop, "___syscall220": noop, "___syscall221": noop, "___syscall268": noop, "___syscall3": noop, "___syscall33": noop, "___syscall34": noop, "___syscall38": noop, "___syscall39": noop, "___syscall40": noop, "___syscall41": noop, "___syscall42": noop, "___syscall5": noop, "___syscall54": noop, "___syscall60": noop, "___syscall63": noop, "___syscall77": noop, "___syscall83": noop, "___syscall85": noop, "___syscall9": noop, "___syscall91": noop, "___syscall94": noop, "___wasi_fd_close": noop, "___wasi_fd_fdstat_get": noop, "___wasi_fd_read": noop, "___wasi_fd_seek": noop, "___wasi_fd_sync": noop, "___wasi_fd_write": noop, "__addDays": noop, "__arraySum": noop, "__exit": noop, "__getExecutableName": noop, "__inet_ntop4_raw": noop, "__inet_ntop6_raw": noop, "__inet_pton4_raw": noop, "__inet_pton6_raw": noop, "__isLeapYear": noop, "__read_sockaddr": noop, "__write_sockaddr": noop, "_abort": noop, "_asctime_r": noop, "_chroot": noop, "_clock_gettime": noop, "_difftime": noop, "_dlclose": noop, "_dlerror": noop, "_dlopen": noop, "_dlsym": noop, "_emscripten_get_heap_size": noop, "_emscripten_get_now": noop, "_emscripten_memcpy_big": noop, "_emscripten_resize_heap": noop, "_execl": noop, "_execle": noop, "_execvp": noop, "_exit": noop, "_fd_close": noop, "_fd_fdstat_get": noop, "_fd_read": noop, "_fd_seek": noop, "_fd_sync": noop, "_fd_write": noop, "_flock": noop, "_fork": noop, "_gai_strerror": noop, "_getaddrinfo": noop, "_getdtablesize": noop, "_getenv": noop, "_getgrnam": noop, "_gethostbyaddr": noop, "_gethostbyname": noop, "_gethostbyname_r": noop, "_getloadavg": noop, "_getprotobyname": noop, "_getprotobynumber": noop, "_getpwnam": noop, "_getpwuid": noop, "_gettimeofday": noop, "_gmtime_r": noop, "_kill": noop, "_llvm_bswap_i64": noop, "_llvm_log10_f32": noop, "_llvm_log10_f64": noop, "_llvm_log2_f32": noop, "_llvm_log2_f64": noop, "_llvm_stackrestore": noop, "_llvm_stacksave": noop, "_llvm_trap": noop, "_localtime_r": noop, "_longjmp": noop, "_mktime": noop, "_nanosleep": noop, "_popen": noop, "_pthread_create": noop, "_pthread_join": noop, "_pthread_mutexattr_destroy": noop, "_pthread_mutexattr_init": noop, "_pthread_mutexattr_settype": noop, "_pthread_setcancelstate": noop, "_putenv": noop, "_setTempRet0": noop, "_setitimer": noop, "_setprotoent": noop, "_sigaction": noop, "_sigaddset": noop, "_sigdelset": noop, "_sigemptyset": noop, "_sigfillset": noop, "_signal": noop, "_sigprocmask": noop, "_strftime": noop, "_strptime": noop, "_sysconf": noop, "_time": noop, "_tzset": noop, "_unsetenv": noop, "_usleep": noop, "_utime": noop, "_wait": noop, "_waitpid": noop, "abort": noop, "getTempRet0": noop, "invoke_i": noop, "invoke_ii": noop, "invoke_iii": noop, "invoke_iiii": noop, "invoke_iiiii": noop, "invoke_iiiiiii": noop, "invoke_iiiiiiiiii": noop, "invoke_v": noop, "invoke_vi": noop, "invoke_vii": noop, "invoke_viidii": noop, "invoke_viii": noop, "invoke_viiii": noop, "invoke_viiiii": noop, "invoke_viiiiii": noop, "setTempRet0": noop, "nullFunc_d": noop,"nullFunc_di": noop,"nullFunc_dii": noop,"nullFunc_i": noop,"nullFunc_ii": noop,"nullFunc_iii": noop,"nullFunc_iidiiii": noop, "nullFunc_iiii": noop, "nullFunc_iiiii": noop, "nullFunc_iiiiid": noop, "nullFunc_iiiiiid": noop, "nullFunc_iiiiii": noop,
		nullFunc_iiiiiii: noop,
		nullFunc_iiiiiiii: noop,
		nullFunc_iiiiiiiii: noop,
		nullFunc_iiiiiiiiii: noop,
		nullFunc_iiiiiiiiiii: noop,
		nullFunc_iiiiiiiiiiii: noop,
		nullFunc_iiiiiiiiiiiii: noop,
		nullFunc_iiiiiiiiiiiiii: noop,
		nullFunc_iiiiiiiiiiiiiii: noop,
		nullFunc_iiiiij: noop,
		nullFunc_jiji: noop,
		nullFunc_v: noop,
		nullFunc_vi: noop,
		nullFunc_vii: noop,
		nullFunc_viii: noop,
		nullFunc_viiii: noop,
		nullFunc_viiiii: noop,
		nullFunc_viiiiii: noop,
		nullFunc_viijii: noop,
		nullFunc_viidii: noop,
		nullFunc_viiiiiiii: noop,
		_strftime_l: noop,
		abortStackOverflow: noop,
		tempDoublePtr: 2303696,
		"__memory_base": 1024,
		__table_base: 0,
		memory: wasmMemory,
		table: wasmTable,
	},
	global: { NaN, Infinity },
	asm2wasm: {
		'f64-rem'() {},
	},
};

fetch( 'webworker-sapi_startup.wasm' ).then( async ( response ) => {
	WebAssembly.instantiate(
		await response.arrayBuffer(),
		info,
	).then(() => {
		console.log("Instantiated!")
	});
	console.log( 'Called instantiate' );
} );

console.log( 'Called fetch', { info } );
