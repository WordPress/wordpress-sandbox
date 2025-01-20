FROM playground-php-wasm:base

ARG WITH_JSPI="no"

# The PHP version to build.
# This value must point to an existing branch of the
# https://github.com/php/php-src.git repository when prefixed
# with "PHP-".
# For example, "7.4.0" is valid because the branch PHP-7.4.0 exists,
# but just "7" is invalid because there's no branch PHP-7.
ARG PHP_VERSION

# Clone PHP
RUN git clone https://github.com/php/php-src.git php-src \
	--branch PHP-$PHP_VERSION   \
	--single-branch          \
	--depth 1;

# Work around memory leak due to PHP using Emscripten's incomplete mmap/munmap support
COPY ./php-wasm-memory-storage /root/php-src/ext/wasm_memory_storage

RUN cd php-src && ./buildconf --force

# Bring in the libraries
RUN mkdir -p /root/lib/include /root/lib/lib /libs
COPY ./bison2.7/dist/ /libs/bison2.7
COPY ./libiconv/ /root/builds/libiconv
COPY ./libcurl/ /root/builds/libcurl
COPY ./libopenssl/ /root/builds/libopenssl
COPY ./libpng16/ /root/builds/libpng16
COPY ./libjpeg/ /root/builds/libjpeg
COPY ./libwebp/ /root/builds/libwebp
COPY ./libsqlite3/ /root/builds/libsqlite3
COPY ./libxml2/ /root/builds/libxml2
COPY ./libz/ /root/builds/libz
COPY ./oniguruma/ /root/builds/oniguruma

RUN if [ "$WITH_JSPI" = "yes" ]; then \
	cp -r /root/builds/*/jspi/dist/root/lib/* /root/lib; \
else \
	cp -r /root/builds/*/asyncify/dist/root/lib/* /root/lib; \
fi

COPY ./libzip/ /root/builds-libzip/
RUN mkdir -p /libs/libzip
RUN if [ "$WITH_JSPI" = "yes" ]; then \
	cp -r /root/builds-libzip/jspi/dist/1.2.0/root/lib /libs/libzip/1.2.0; \
	cp -r /root/builds-libzip/jspi/dist/1.9.2/root/lib /libs/libzip/1.9.2; \
else \
	cp -r /root/builds-libzip/asyncify/dist/1.2.0/root/lib /libs/libzip/1.2.0; \
	cp -r /root/builds-libzip/asyncify/dist/1.9.2/root/lib /libs/libzip/1.9.2; \
fi

COPY ./libopenssl/ /root/builds-libopenssl/
RUN mkdir -p /libs/libopenssl
RUN if [ "$WITH_JSPI" = "yes" ]; then \
	cp -r /root/builds-libopenssl/jspi/dist/1.1.0h/root/lib /libs/libopenssl/1.1.0h; \
	cp -r /root/builds-libopenssl/jspi/dist/1.1.1/root/lib /libs/libopenssl/1.1.1; \
else \
	cp -r /root/builds-libopenssl/asyncify/dist/1.1.0h/root/lib /libs/libopenssl/1.1.0h; \
	cp -r /root/builds-libopenssl/asyncify/dist/1.1.1/root/lib /libs/libopenssl/1.1.1; \
fi

# Build PHP

# The PHP extensions to build:
ARG WITH_CURL
ARG WITH_FILEINFO
ARG WITH_LIBXML
ARG WITH_LIBZIP
ARG WITH_GD
ARG WITH_MBSTRING
ARG WITH_MBREGEX
ARG WITH_CLI_SAPI
ARG WITH_SQLITE
ARG WITH_MYSQL
ARG WITH_OPENSSL
ARG WITH_ICONV
ARG WITH_SOURCEMAPS
ARG WITH_WS_NETWORKING_PROXY

# The platform to build for: web or node
ARG EMSCRIPTEN_ENVIRONMENT=web

RUN touch /root/.configure-flags && \
	touch /root/.emcc-php-wasm-flags && \
	touch /root/.emcc-php-wasm-sources && \
	touch /root/.emcc-php-wasm-flags && \
	touch /root/.EXPORTED_FUNCTIONS

# Grab Bison 2.7 patch in case we need it
COPY ./bison2.7/bison27.patch /root/bison27.patch

# PHP <= 7.3 requires Bison 2.7
# PHP >= 7.4 and Bison 3.0
RUN if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]]; then \
		if /libs/bison2.7/usr/local/bison/bin/bison -h >/dev/null; then \
			mv /libs/bison2.7/usr/local/bison /usr/local/bison && \
			ln -s /usr/local/bison/bin/bison /usr/bin/bison && \
			ln -s /usr/local/bison/bin/yacc /usr/bin/yacc; \
		else \
			wget https://ftp.gnu.org/gnu/bison/bison-2.7.tar.gz && \
			tar -xvf bison-2.7.tar.gz && \
			rm bison-2.7.tar.gz && \
			cd bison-2.7 && \
			git apply --no-index /root/bison27.patch && \
			./configure --prefix=/usr/local && \
			make && \
			make install; \
			if [[ $? -ne 0 ]]; then \
				echo 'Failed to build Bison 2.7 dependency.'; \
				exit -1; \
			fi; \
		fi; \
	else \
		apt install -y bison; \
	fi;

# Add libzip and zlib files if needed
RUN if [ "$WITH_LIBZIP" = "yes" ]; then \
		if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]]; then \
			apt install -y zlib1g zlib1g-dev; \
            cp -r /libs/libzip/1.2.0/* /root/lib; \
			# https://php-legacy-docs.zend.com/manual/php5/en/zlib.installation
			echo -n ' --with-zlib --with-zlib-dir=/root/lib --enable-zip --with-libzip=/root/lib ' >> /root/.php-configure-flags; \
			echo -n ' -I /root/lib -I /root/lib ' >> /root/.emcc-php-wasm-flags; \
			echo -n ' /root/lib/lib/libzip.a /root/lib/lib/libz.a' >> /root/.emcc-php-wasm-sources; \
			cp /root/lib/lib/libzip/include/zipconf.h /root/lib/lib; \
			cp /root/lib/lib/libzip/include/zipconf.h /root/lib/include; \
			echo '#define LIBZIP_VERSION "1.2.0"' >> /root/lib/include/zipconf.h; \
			cp /root/lib/include/*.h /root/php-src; \
		else \
            cp -r /libs/libzip/1.9.2/* /root/lib; \
			# https://www.php.net/manual/en/zlib.installation.php
			echo -n ' --with-zlib --with-zlib-dir=/root/lib --with-zip' >> /root/.php-configure-flags; \
			echo -n ' -I /root/lib -I /root/lib' >> /root/.emcc-php-wasm-flags; \
			echo -n ' /root/lib/lib/libzip.a /root/lib/lib/libz.a' >> /root/.emcc-php-wasm-sources; \
		fi && \
		/root/replace.sh 's/pharcmd=pharcmd/pharcmd=/g' /root/php-src/configure && \
		/root/replace.sh 's/pharcmd_install=install-pharcmd/pharcmd_install=/g' /root/php-src/configure; \
	fi;


# Add ncurses if needed and libedit if needed
RUN if [ "$WITH_CLI_SAPI" = "yes" ]; \
	then \
		# Configure build flags
		echo -n ' --enable-phar --enable-cli=static ' >> /root/.php-configure-flags && \
		echo -n ' sapi/cli/php_cli_process_title.c sapi/cli/ps_title.c sapi/cli/php_http_parser.c sapi/cli/php_cli_server.c sapi/cli/php_cli.c ' \
			>> /root/.emcc-php-wasm-sources && \
		echo -n ', "_run_cli", "_wasm_add_cli_arg"' >> /root/.EXPORTED_FUNCTIONS && \
		echo -n ' -DWITH_CLI_SAPI=1 ' >> /root/.emcc-php-wasm-flags && \
		/root/replace.sh 's/GET_SHELL_CB\(cb\);/(cb) = php_cli_get_shell_callbacks();/g' /root/php-src/ext/readline/readline_cli.c; \
	else \
		echo -n ' --disable-cli ' >> /root/.php-configure-flags; \
	fi;

# Add Libxml2 if needed
RUN if [ "$WITH_LIBXML" = "yes" ]; \
	then \
		set -euxo pipefail;\
		echo -n ' --enable-libxml --with-libxml --with-libxml-dir=/root/lib --enable-dom --enable-xml --enable-simplexml --enable-xmlreader --enable-xmlwriter' >> /root/.php-configure-flags && \
		echo -n ' -I /root/lib -I /root/lib/include/libxml2 -lxml2' >> /root/.emcc-php-wasm-flags && \
		echo -n ' /root/lib/lib/libxml2.a' >> /root/.emcc-php-wasm-sources && \
		# Libxml check is wrong in PHP < 7.4.0.
		# In the regular cc it's just a warning, but in the emscripten's emcc that's an error:
		perl -pi.bak -e 's/char xmlInitParser/void xmlInitParser/g' /root/php-src/configure; \
		# On PHP < 7.1.0, the dom_iterators.c file implicitly converts *char to const *char causing emcc error
		if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "0" ]]; then \
			/root/replace.sh 's/xmlHashScan\(ht, itemHashScanner, iter\);/xmlHashScan(ht, (xmlHashScanner)itemHashScanner, iter);/g' /root/php-src/ext/dom/dom_iterators.c; \
		fi; \
	else \
		echo -n ' --disable-libxml --without-libxml --disable-dom --disable-xml --disable-simplexml --disable-xmlreader --disable-xmlwriter' >> /root/.php-configure-flags; \
	fi

# Add sqlite3 if needed
RUN if [ "$WITH_SQLITE" = "yes" ]; \
	then \
		echo -n ' --with-sqlite3 --enable-pdo --with-pdo-sqlite=/root/lib ' >> /root/.php-configure-flags && \
		echo -n ' -I ext/pdo_sqlite ' >> /root/.emcc-php-wasm-flags; \
		if [[ "${PHP_VERSION:0:1}" -eq "7" && "${PHP_VERSION:2:1}" -ge "4" ]] || [ "${PHP_VERSION:0:1}" -eq "8" ]; then \
			echo -n ' -lsqlite3 ' >> /root/.emcc-php-wasm-flags; \
		fi; \
	fi;

# Add GD if needed
RUN if [ "$WITH_GD" = "yes" ]; \
	then \
		if [[ "${PHP_VERSION:0:1}" -eq "7" ]] && [ "${PHP_VERSION:0:3}" != "7.4" ]; then \
			# @TODO support webp for PHP 7.0 – 7.3
			echo -n ' --with-png-dir=/root/lib --with-jpeg-dir=/root/lib --with-gd --enable-gd ' >> /root/.php-configure-flags; \
		else \
			echo -n ' --with-png-dir=/root/lib --with-jpeg --with-webp --with-gd --enable-gd ' >> /root/.php-configure-flags; \
		fi; \
		echo -n ' -I /root/lib -I /root/install -lz -lpng16 -lwebp -ljpeg ' >> /root/.emcc-php-wasm-flags; \
	fi;

# Add openssl if needed
RUN if [ "$WITH_OPENSSL" = "yes" ]; \
	then \
		if [[ "${PHP_VERSION:0:1}" -lt "8" || ("${PHP_VERSION:0:1}" -eq "8" && "${PHP_VERSION:2:1}" -lt "4") ]]; then \
			cp -r /libs/libopenssl/1.1.0h/* /root/lib; \
		else \
			cp -r /libs/libopenssl/1.1.1/* /root/lib; \
		fi; \
		echo -n ' --with-openssl --with-openssl-dir=/root/lib ' >> /root/.php-configure-flags; \
		echo -n ' -lssl -lcrypto ' >> /root/.emcc-php-wasm-flags; \
	fi;

# Remove fileinfo if needed
RUN if [ "$WITH_FILEINFO" = "yes" ]; \
    then \
		echo -n ' --enable-fileinfo' >> /root/.php-configure-flags; \
	else \
        # light bundle should compile without fileinfo and libmagic
        echo -n ' --disable-fileinfo' >> /root/.php-configure-flags; \
    fi;

# Add iconv if needed
RUN if [ "$WITH_ICONV" = "yes" ]; \
	then \
		echo -n ' --with-iconv=/root/lib ' >> /root/.php-configure-flags; \
		echo -n ' /root/lib/lib/libiconv.a ' >> /root/.emcc-php-wasm-sources; \
		# PHP >= 8.0 posix is no longer supported.
		# PHP ≤= 7.4 posix is supported.
	else \
		echo -n ' --without-iconv ' >> /root/.php-configure-flags; \
	fi;

# Add curl if needed
RUN if [ "$WITH_CURL" = "yes" ]; \
	then \
		# libcurl version check fails in PHP <= 7.3 even though
		# the version is correct. Let's make the check always pass.
		/root/replace.sh 's/\$PKG_CONFIG --atleast-version 7.\d+.\d+ \$PKNAME/test "1" = "1"/g' /root/php-src/configure; \
		/root/replace.sh 's/test "\$curl_version" -ge 7010005/test "1" = "1"/g' /root/php-src/configure; \
		echo -n ' --with-curl=/root/lib ' >> /root/.php-configure-flags; \
		echo -n ' /root/lib/lib/libcurl.a ' >> /root/.emcc-php-wasm-sources; \
		# The way we build libcurl doesn't produce a `.pc` file that seems
		# to be required by PHP <= 7.3. Let's create  manually.
		echo 'prefix=/root/lib \
exec_prefix=${prefix} \
libdir=${exec_prefix}/lib \
includedir=${prefix}/include \
modules=1 \
\
Name: libcurl\
Version: 7.69.1\
Description: libcurl.\
Requires:\
Libs: -L${libdir} -lcurl\
Cflags: -I${includedir}' > /root/lib/lib/pkgconfig/libcurl.pc; \
	fi;

# Add mbstring if needed
RUN if [ "$WITH_MBSTRING" = "yes" ]; \
	then echo -n ' --enable-mbstring ' >> /root/.php-configure-flags; \
	else echo -n ' --disable-mbstring ' >> /root/.php-configure-flags; \
	fi;

# Add mbregex if needed
# PHP == 7.0 likely needs an older version of oniguruma and isn't supported for now.
RUN if [ "$WITH_MBREGEX" = "yes" ] && [ "${PHP_VERSION:0:3}" != "7.0" ]; \
	then \
		echo -n ' --enable-mbregex ' >> /root/.php-configure-flags; \
		# PHP >= 8.0 and 7.4 use the system oniguruma library.
		# PHP < 7.4 ship their own oniguruma library.
		if [[ "${PHP_VERSION:0:1}" -ge "8" ]] || [ "${PHP_VERSION:0:3}" = "7.4" ]; then \
			echo -n ' --with-onig=/root/lib ' >> /root/.php-configure-flags; \
			echo -n ' /root/lib/lib/libonig.a ' >> /root/.emcc-php-wasm-sources; \
		fi; \
	else \
		echo -n ' --disable-mbregex ' >> /root/.php-configure-flags; \
	fi;

# Get and patch PHP
COPY ./php/php*.patch /root/
RUN cd /root && \
	git apply --no-index /root/php${PHP_VERSION:0:3}*.patch -v && \
	( [[ "${PHP_VERSION:0:3}" == '8.3' ]] && \
		git apply --no-index /root/php-chunk-alloc-zend-assert-8.3.patch -v || \
		( [[ "${PHP_VERSION:0:3}" == '8.4' ]] && \
			git apply --no-index /root/php-chunk-alloc-zend-assert-8.4.patch -v || \
			git apply --no-index /root/php-chunk-alloc-zend-assert.patch -v \
		) \
	) && \
	touch php-src/patched

# Install Mysql support if needed
RUN if [ "$WITH_MYSQL" = "yes" ]; then \
		echo -n ' --enable-mysql --enable-pdo --with-mysql=mysqlnd --with-mysqli=mysqlnd --with-pdo-mysql=mysqlnd ' >> /root/.php-configure-flags; \
	fi

# Build the patched PHP
WORKDIR /root/php-src
RUN source /root/emsdk/emsdk_env.sh && \
CURL_CFLAGS="-I/root/lib/include" \
WEBP_LIBS="-L/root/lib/lib" \
WEBP_CFLAGS="-I/root/lib/include" \
CURL_LIBS="-I/root/lib/lib -L/root/lib/lib" \
	emconfigure ./configure \
	PKG_CONFIG_PATH=$PKG_CONFIG_PATH \
	# Fibers are a PHP 8.1+ feature. They are compiled as
	# a custom assembly implementation by default. However,
	# that implementation does not work with emscripten.
	#
	# The line below disables it, forcing PHP to use the
	# C implementation instead.
	#
	# See https://github.com/WordPress/wordpress-playground/issues/92
	# for more context.
	--disable-fiber-asm \
	--enable-phar \
	# --enable-json for PHP < 8.0:
	--enable-json      \
	--enable-embed=static \
	--with-layout=GNU  \
	--disable-cgi      \
	--disable-opcache  \
	--disable-posix    \
	--enable-hash      \
	--enable-static=yes \
	--enable-shared=no \
	--enable-session   \
	--enable-filter    \
	--enable-calendar  \
	--disable-rpath    \
	--disable-phpdbg   \
	--without-pear     \
	--with-valgrind=no \
	--without-pcre-jit \
	--enable-bcmath    \
	--enable-ctype     \
	--enable-tokenizer \
	--enable-wasm_memory_storage \
	$(cat /root/.php-configure-flags)

# Silence the errors "munmap() failed: [28] Invalid argument"
# @TODO: Identify the root cause behind these errors and fix them properly
RUN echo '#define ZEND_MM_ERROR 0' >> /root/php-src/main/php_config.h;

# With HAVE_UNISTD_H=1 PHP complains about the missing getdtablesize() function
RUN /root/replace.sh 's/define php_sleep sleep/define php_sleep wasm_sleep/g' /root/php-src/main/php.h
RUN echo 'extern unsigned int wasm_sleep(unsigned int time);' >> /root/php-src/main/php.h;

RUN /root/replace.sh 's/define HAVE_UNISTD_H 1/define HAVE_UNISTD_H 0/g' /root/php-src/main/php_config.h

# PHP <= 7.3 is not very good at detecting the presence of the POSIX readdir_r function
# so we need to force it to be enabled.
RUN if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]]; then \
		echo '#define HAVE_POSIX_READDIR_R 1' >> /root/php-src/main/php_config.h; \
	fi;

# Rename the original php_pollfd_for() implementation so that we can link our own version.
RUN /root/replace.sh 's/static inline int php_pollfd_for\(/int php_pollfd_for(php_socket_t fd, int events, struct timeval *timeouttv); static inline int __real_php_pollfd_for(/g' /root/php-src/main/php_network.h

RUN echo 'extern ssize_t wasm_read(int fd, void *buf, size_t count);' >> /root/php-src/main/php.h;
RUN /root/replace.sh 's/ret = read/ret = wasm_read/g' /root/php-src/main/streams/plain_wrapper.c

# Provide a custom implementation of the php_exec() function that handles spawning
# the process inside exec(), passthru(), system(), etc.
# We effectively remove the php_exec() implementation from the build by renaming it
# to an unused identifier "php_exec_old", and then we mark php_exec as extern.
RUN /root/replace.sh 's/PHPAPI int php_exec(.+)$/PHPAPI extern int php_exec\1; int php_exec_old\1/g' /root/php-src/ext/standard/exec.c

# Provide a custom implementation of the VCWD_POPEN() function that handles spawning
# the process inside PHP_FUNCTION(popen).
RUN /root/replace.sh 's/#define VCWD_POPEN.+/#define VCWD_POPEN(command, type) wasm_popen(command,type)/g' /root/php-src/Zend/zend_virtual_cwd.h
RUN echo 'extern FILE *wasm_popen(const char *cmd, const char *mode);' >> /root/php-src/Zend/zend_virtual_cwd.h

# Provide a custom implementation of the shutdown() function.
RUN perl -pi.bak -e $'s/(\s+)shutdown\(/$1 wasm_shutdown(/g' /root/php-src/sapi/cli/php_cli_server.c
RUN perl -pi.bak -e $'s/(\s+)closesocket\(/$1 wasm_close(/g' /root/php-src/sapi/cli/php_cli_server.c
RUN echo 'extern int wasm_shutdown(int fd, int how);' >> /root/php-src/main/php_config.h;
RUN echo 'extern int wasm_close(int fd);' >> /root/php-src/main/php_config.h;

# Don't ship PHP_FUNCTION(proc_open) with the PHP build
# so that we can ship a patched version with php_wasm.c
RUN echo '' > /root/php-src/ext/standard/proc_open.h;
RUN echo '' > /root/php-src/ext/standard/proc_open.c;

RUN source /root/emsdk/emsdk_env.sh && \
	# We're compiling PHP as emscripten's side module...
	export JSPI_FLAGS=$(if [ "$WITH_JSPI" = "yes" ]; then echo "-sSUPPORT_LONGJMP=wasm -fwasm-exceptions"; else echo ""; fi) && \
	EMCC_FLAGS=" -sSIDE_MODULE -Dsetsockopt=wasm_setsockopt -Dphp_exec=wasm_php_exec $JSPI_FLAGS " \
	# ...which means we must skip all the libraries - they will be provided in the final linking step.
	EMCC_SKIP="-lz -ledit -ldl -lncurses -lzip -lpng16 -lssl -lcrypto -lxml2 -lc -lm -lsqlite3 /root/lib/lib/libxml2.a /root/lib/lib/libsqlite3.so /root/lib/lib/libsqlite3.a /root/lib/lib/libsqlite3.a /root/lib/lib/libpng16.so /root/lib/lib/libwebp.a /root/lib/lib/libjpeg.a" \
	emmake make -j1

RUN cp -v /root/php-src/.libs/libphp*.la /root/lib/libphp.la
RUN cp -v /root/php-src/.libs/libphp*.a /root/lib/libphp.a

COPY ./php/php_wasm.c /root/
COPY ./php/dns_polyfill.c /root/
COPY ./php/dns_polyfill.h /root/
COPY ./php/proc_open* /root/

RUN if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]]; then \
		 cp /root/proc_open7.0.c /root/proc_open.c; \
		 cp /root/proc_open7.0.h /root/proc_open.h; \
	else \
		 cp /root/proc_open7.4.c /root/proc_open.c; \
		 cp /root/proc_open7.4.h /root/proc_open.h; \
	fi


ARG WITH_SOURCEMAPS
RUN set -euxo pipefail; \
	if [ "$EMSCRIPTEN_ENVIRONMENT" = "node" ]; then \
		# Add nodefs when building for node.js
		echo -n ' -lnodefs.js ' >> /root/.emcc-php-wasm-flags; \
	fi; \
	if [ "${WITH_SOURCEMAPS}" = "yes" ]; then \
		echo -n ' -g3 -gsource-map' >> /root/.emcc-php-wasm-flags; \
		# Ensure source maps are loaded from the correct URL on the web.
		# Without this, browsers will try the wasm:// protocol and never load the source map.
		if [ "$EMSCRIPTEN_ENVIRONMENT" = "web" ]; then \
			export PHP_VERSION_ESCAPED="${PHP_VERSION//./_}"; \
			echo -n ' --source-map-base http://127.0.0.1:5400/@fs/Users/cloudnik/www/Automattic/core/plugins/playground/packages/php-wasm/web/public/${PHP_VERSION_ESCAPED}/' >> /root/.emcc-php-wasm-flags; \
		fi; \
	else \
		# Preserve symbol names in node.js build – the bundle size doesn't matter as much
		# as on the web, and this makes debugging **much** easier.
		if [ "$EMSCRIPTEN_ENVIRONMENT" = "node" ]; then \
			echo -n ' -g2 ' >> /root/.emcc-php-wasm-flags; \
		fi; \
	fi;

# PHP < 8.0 errors out with "null function or function signature mismatch"
# unless EMULATE_FUNCTION_POINTER_CASTS is enabled. The error originates in
# the rc_dtor_func which traces back to calling the zend_list_free function.
# The signatures are the same on the face value, but the wasm runtime is not
# happy somehow. This can probably be patched in PHP, but for now we just
# enable the flag and pay the price of the additional overhead.
# https://emscripten.org/docs/porting/guidelines/function_pointer_issues.html
RUN if [ "${PHP_VERSION:0:1}" -lt "8" ]; then \
		echo -n ' -s EMULATE_FUNCTION_POINTER_CASTS=1' >> /root/.emcc-php-wasm-flags; \
	fi

# Add ws networking proxy support if needed
RUN if [ "$WITH_WS_NETWORKING_PROXY" = "yes" ]; \
	then \
		echo -n ' -lwebsocket.js ' >> /root/.emcc-php-wasm-flags; \
	fi

# Emscripten supports yielding from sync functions to JavaScript event loop, but all
# the synchronous functions doing that must be explicitly listed here. This is an
# exhaustive list that was created by compiling PHP with ASYNCIFY, running code that
# uses networking, observing the error, and listing the missing functions.
#
# If you a get an error similar to the one below, you need to add all the function on
# the stack to the "ASYNCIFY_ONLY" list below (in this case, it's php_mysqlnd_net_open_tcp_or_unix_pub):
#
# RuntimeError: unreachable
# at php_mysqlnd_net_open_tcp_or_unix_pub (<anonymous>:wasm-function[9341]:0x5e42b8)
# at byn$fpcast-emu$php_mysqlnd_net_open_tcp_or_unix_pub (<anonymous>:wasm-function[17222]:0x7795e9)
# at php_mysqlnd_net_connect_ex_pub (<anonymous>:wasm-function[9338]:0x5e3f02)
#
# Node cuts the trace short by default so use the --stack-trace-limit=50 CLI flag
# to get the entire stack.
#
# -------
#
# Related: Any errors like Fatal error: Cannot redeclare function ...
# are caused by dispatching a PHP request while an execution is paused
# due to an async call – it means the same PHP files are loaded before
# the previous request, where they're already loaded, is concluded.
RUN export ASYNCIFY_IMPORTS=$'["_dlopen_js",\n\
"invoke_i",\n\
"invoke_ii",\n\
"invoke_iii",\n\
"invoke_iiii",\n\
"invoke_iiiii",\n\
"invoke_iiiiii",\n\
"invoke_iiiiiii",\n\
"invoke_iiiiiiii",\n\
"invoke_iiiiiiiiii",\n\
"invoke_v",\n\
"invoke_vi",\n\
"invoke_vii",\n\
"invoke_viidii",\n\
"invoke_viii",\n\
"invoke_viiii",\n\
"invoke_viiiii",\n\
"invoke_viiiiii",\n\
"invoke_viiiiiii",\n\
"invoke_viiiiiiiii",\n\
"js_open_process",\n\
"_js_open_process",\n\
"_asyncjs__js_open_process",\n\
"js_popen_to_file",\n\
"_js_popen_to_file",\n\
"_asyncjs__js_popen_to_file",\n\
"js_fd_read",\n\
"_js_fd_read",\n\
"js_module_onMessage",\n\
"_js_module_onMessage",\n\
"_asyncjs__js_module_onMessage",\n\
"js_waitpid",\n\
"_js_waitpid",\n\
"_asyncjs__js_waitpid",\n\
"wasm_poll_socket",\n\
"_wasm_poll_socket",\n\
"_asyncjs__wasm_poll_socket",\n\
"wasm_shutdown",\n\
"_wasm_shutdown",\n\
"_asyncjs__wasm_shutdown"]'; \
	echo -n " -s ASYNCIFY_IMPORTS=$ASYNCIFY_IMPORTS " | tr -d "\n" >> /root/.emcc-php-asyncify-flags; \
	export ASYNCIFY_ONLY_UNPREFIXED=$'"dynCall_dd",\
"dynCall_i",\
"dynCall_ii",\
"dynCall_iidiiii",\
"dynCall_iii",\
"dynCall_iiid",\
"dynCall_iiii",\
"dynCall_iiiii",\
"dynCall_iiiiii",\
"dynCall_iiiiiii",\
"dynCall_iiiiiiii",\
"dynCall_iiiiiiiii",\
"dynCall_iiiiiiiiii",\
"dynCall_iiij",\
"dynCall_iiiji",\
"dynCall_ji",\
"dynCall_jii",\
"dynCall_jiiiji",\
"dynCall_jiij",\
"dynCall_jiiji",\
"dynCall_jiji",\
"dynCall_jj",\
"dynCall_v",\
"dynCall_vi",\
"dynCall_vii",\
"dynCall_viidii",\
"dynCall_viii",\
"dynCall_viiii",\
"dynCall_viiiii",\
"dynCall_viiiiiii",\
"dynCall_viiiiiiii",'; \

export ASYNCIFY_ONLY=$'"zif_phar_fopen",\
"zif_phar_file_get_contents",\
"zend_execute_script",\
"php_execute_script_ex",\
"rc_dtor_func",\
"zif_curl_exec",\
"curl_easy_perform",\
"Curl_wait_ms",\
"Curl_http_connect",\
"Curl_proxy_connect",\
"RAND_status",\
"rand_status",\
"call_extract_if_dead",\
"__wrap_select",\
"Curl_socket_check",\
"Curl_conncache_foreach",\
"Curl_is_connected",\
"multi_runsingle",\
"curl_multi_perform",\
"easy_transfer",\
"Curl_poll",\
"Curl_multi_wait",\
"curl_multi_poll",\
"easy_perform",\
"RAND_poll",\
"rand_bytes",\
"RAND_bytes",\
"SSL_CTX_new",\
"rand_nopseudo_bytes",\
"rand_enough",\
"Curl_ossl_seed",\
"zif_curl_multi_exec",\
"zif_curl_multi_select",\
"ossl_connect_common",\
"Curl_ossl_connect_nonblocking",\
"Curl_ssl_connect_nonblocking",\
"https_connecting",\
"Curl_readwrite",\
"zend_generator_iterator_move_forward",\
"ZEND_FE_FETCH_R_SPEC_VAR_HANDLER",\
"zend_generator_resume",\
"zend_generator_iterator_rewind",\
"zend_fe_reset_iterator",\
"ZEND_FE_RESET_R_SPEC_VAR_HANDLER",\
"zend_user_it_get_new_iterator",\
"ZEND_ADD_ARRAY_UNPACK_SPEC_HANDLER",\
"__fwritex",\
"read",\
"zif_sleep",\
"zif_stream_get_contents",\
"zif_stream_select",\
"_php_stream_fill_read_buffer",\
"_php_stream_read",\
"php_stream_read_to_str",\
"php_userstreamop_read",\
"zif_fread",\
"wasm_read",\
"php_stdiop_read",\
"fwrite",\
"zif_fwrite",\
"php_stdiop_write",\
"zif_array_filter",\
"zend_call_known_instance_method_with_2_params",\
"zend_fetch_dimension_address_read_R",\
"_zval_dtor_func_for_ptr",\
"ZEND_ASSIGN_DIM_SPEC_CV_CONST_HANDLER",\
"zend_fetch_dimension_address_read",\
"php_if_fopen",\
"_php_stream_cast",\
"php_stream_temp_cast",\
"php_stream_temp_flush",\
"_php_stream_flush",\
"php_stream_flush",\
"_php_stream_write",\
"php_stream_write",\
"_php_stream_free",\
"_php_stream_free_enclosed",\
"stream_resource_persistent_dtor",\
"stream_resource_regular_dtor",\
"zend_std_has_dimension",\
"zend_isset_isempty_dim_prop_obj_handler_SPEC_CV_CONST",\
"zend_assign_to_object",\
"zif_file_put_contents",\
"ZEND_ASSIGN_OBJ_SPEC_CV_CONST_HANDLER",\
"ZEND_FETCH_OBJ_R_SPEC_CV_CV_HANDLER",\
"zend_std_call_user_call",\
"zend_objects_store_del_ref_by_handle_ex",\
"zend_objects_store_del_ref",\
"_zval_dtor_func",\
"_zval_ptr_dtor",\
"zend_hash_del_key_or_index",\
"zend_delete_variable",\
"ZEND_UNSET_VAR_SPEC_CV_UNUSED_HANDLER",\
"zend_std_unset_dimension",\
"ZEND_UNSET_DIM_SPEC_CV_CONST_HANDLER",\
"zend_std_read_dimension",\
"zend_fetch_dimension_address_read_R_slow",\
"ZEND_FETCH_DIM_R_SPEC_CV_CONST_HANDLER",\
"zend_call_method",\
"zend_assign_to_object_dim",\
"ZEND_ASSIGN_DIM_SPEC_CV_CONST_OP_DATA_CONST_HANDLER",\
"zend_std_write_dimension",\
"zend_isset_dim_slow",\
"ZEND_ISSET_ISEMPTY_DIM_OBJ_SPEC_CV_CONST_HANDLER",\
"zend_std_write_property",\
"ZEND_ASSIGN_OBJ_SPEC_CV_CONST_OP_DATA_CONST_HANDLER",\
"zend_objects_store_del",\
"ZEND_UNSET_CV_SPEC_CV_UNUSED_HANDLER",\
"ZEND_DO_FCALL_BY_NAME_SPEC_HANDLER",\
"ZEND_DO_FCALL_BY_NAME_SPEC_OBSERVER_HANDLER",\
"ZEND_DO_FCALL_BY_NAME_SPEC_RETVAL_UNUSED_HANDLER",\
"ZEND_DO_FCALL_BY_NAME_SPEC_RETVAL_USED_HANDLER",\
"ZEND_DO_FCALL_SPEC_CONST_HANDLER",\
"ZEND_DO_FCALL_SPEC_HANDLER",\
"ZEND_DO_FCALL_SPEC_OBSERVER_HANDLER",\
"ZEND_DO_FCALL_SPEC_RETVAL_UNUSED_HANDLER",\
"ZEND_DO_FCALL_SPEC_RETVAL_USED_HANDLER",\
"ZEND_DO_ICALL_SPEC_HANDLER",\
"ZEND_DO_ICALL_SPEC_RETVAL_UNUSED_HANDLER",\
"ZEND_DO_ICALL_SPEC_RETVAL_USED_HANDLER",\
"ZEND_DO_UCALL_SPEC_OBSERVER_HANDLER",\
"ZEND_FETCH_OBJ_FUNC_ARG_SPEC_CV_CONST_HANDLER",\
"ZEND_FETCH_OBJ_R_SPEC_CV_CONST_HANDLER",\
"ZEND_FETCH_OBJ_R_SPEC_TMPVAR_CONST_HANDLER",\
"ZEND_ISSET_ISEMPTY_PROP_OBJ_SPEC_CV_CONST_HANDLER",\
"ZEND_ISSET_ISEMPTY_PROP_OBJ_SPEC_CV_HANDLER",\
"ZEND_ISSET_ISEMPTY_PROP_OBJ_SPEC_CV_TMPVAR_HANDLER",\
"ZEND_ISSET_ISEMPTY_PROP_OBJ_SPEC_TMPVAR_CONST_HANDLER",\
"ZEND_ISSET_ISEMPTY_PROP_OBJ_SPEC_TMPVAR_HANDLER",\
"cli",\
"wasm_sleep",\
"wasm_php_stream_flush",\
"wasm_php_stream_read",\
"php_crc32_stream_bulk_update",\
"phar_parse_zipfile",\
"get_http_body",\
"wasm_php_exec",\
"wasm_sapi_handle_request",\
"wasm_sapi_request_shutdown",\
"_call_user_function_ex",\
"_call_user_function_impl",\
"_mysqlnd_run_command",\
"_php_stream_copy_to_mem",\
"_php_stream_copy_to_stream_ex",\
"_php_stream_eof",\
"_php_stream_fill_read_buffer",\
"_php_stream_free",\
"_php_stream_get_line",\
"_php_stream_open_wrapper_ex",\
"_php_stream_read",\
"_php_stream_set_option",\
"_php_stream_write",\
"_php_stream_xport_create",\
"zif_stream_socket_enable_crypto",\
"do_cli",\
"do_cli_server",\
"execute_ex",\
"EVP_PKEY_encrypt",\
"list_entry_destructor",\
"main",\
"mysql_handle_begin",\
"mysql_handle_closer",\
"mysql_handle_commit",\
"mysql_handle_doer",\
"mysql_handle_preparer",\
"mysql_handle_quoter",\
"mysql_handle_rollback",\
"mysql_stmt_execute",\
"mysqli_commit_or_rollback_libmysql",\
"mysqli_common_connect",\
"mysqlnd_caching_sha2_handle_server_response",\
"mysqlnd_com_handshake_run",\
"mysqlnd_com_init_db_run",\
"mysqlnd_com_stmt_execute_run",\
"mysqlnd_com_stmt_prepare_run",\
"mysqlnd_connect",\
"mysqlnd_connection_connect",\
"mysqlnd_mysqlnd_command_handshake_pub",\
"mysqlnd_mysqlnd_command_init_db_pub",\
"mysqlnd_mysqlnd_command_reap_result_pub",\
"mysqlnd_mysqlnd_conn_connect_pub",\
"mysqlnd_mysqlnd_conn_data_connect_handshake_pub",\
"mysqlnd_mysqlnd_conn_data_connect_pub",\
"mysqlnd_mysqlnd_conn_data_next_result_pub",\
"mysqlnd_mysqlnd_conn_data_query_pub",\
"mysqlnd_mysqlnd_conn_data_reap_query_pub",\
"mysqlnd_mysqlnd_conn_data_select_db_pub",\
"mysqlnd_mysqlnd_conn_data_set_charset_pub",\
"mysqlnd_mysqlnd_conn_data_store_result_pub",\
"mysqlnd_mysqlnd_conn_data_tx_commit_or_rollback_pub",\
"mysqlnd_mysqlnd_pfc_receive_pub",\
"mysqlnd_mysqlnd_pfc_send_pub",\
"mysqlnd_mysqlnd_protocol_send_command_handle_OK_pub",\
"mysqlnd_mysqlnd_protocol_send_command_handle_response_pub",\
"mysqlnd_mysqlnd_protocol_send_command_pub",\
"mysqlnd_mysqlnd_res_store_result_fetch_data_pub",\
"mysqlnd_mysqlnd_res_store_result_pub",\
"mysqlnd_mysqlnd_stmt_execute_pub",\
"mysqlnd_mysqlnd_stmt_prepare_pub",\
"mysqlnd_mysqlnd_stmt_send_execute_pub",\
"mysqlnd_mysqlnd_vio_connect_pub",\
"mysqlnd_mysqlnd_vio_network_read_pub",\
"mysqlnd_mysqlnd_vio_network_write_pub",\
"mysqlnd_mysqlnd_vio_open_tcp_or_unix_pub",\
"mysqlnd_query_read_result_set_header",\
"mysqlnd_read_body_name",\
"mysqlnd_read_buffer",\
"mysqlnd_read_buffer_is_empty",\
"mysqlnd_read_header",\
"mysqlnd_read_header_name",\
"mysqlnd_read_packet_header_and_body",\
"mysqlnd_run_authentication",\
"mysqlnd_stmt_execute",\
"mysqlnd_stmt_execute_parse_response",\
"pdo_mysql_handle_factory",\
"pdo_mysql_stmt_col_meta",\
"pdo_mysql_stmt_describe",\
"pdo_mysql_stmt_execute",\
"pdo_mysql_stmt_execute_prepared",\
"pdo_mysql_stmt_fetch",\
"pdo_mysql_stmt_get_col",\
"phar_file_get_contents",\
"phar_fopen",\
"php_call_shutdown_functions",\
"php_cli_server_do_event_for_each_fd_callback",\
"php_cli_server_poller_poll",\
"php_cli_server_recv_event_read_request",\
"php_exec",\
"php_execute_script",\
"php_execute_script_ex",\
"php_fsockopen_stream",\
"php_getimagesize_from_any",\
"php_mysqlnd_auth_response_read",\
"php_mysqlnd_cached_sha2_result_read",\
"php_mysqlnd_cmd_write",\
"php_mysqlnd_conn_connect_pub",\
"php_mysqlnd_conn_data_connect_handshake_pub",\
"php_mysqlnd_conn_data_connect_pub",\
"php_mysqlnd_conn_data_next_result_pub",\
"php_mysqlnd_conn_data_query_pub",\
"php_mysqlnd_conn_data_reap_query_pub",\
"php_mysqlnd_conn_data_select_db_pub",\
"php_mysqlnd_conn_data_set_charset_pub",\
"php_mysqlnd_conn_data_simple_command_pub",\
"php_mysqlnd_conn_data_simple_command_send_request_pub",\
"php_mysqlnd_conn_data_store_result_pub",\
"php_mysqlnd_conn_data_tx_commit_or_rollback_pub",\
"php_mysqlnd_eof_read",\
"php_mysqlnd_greet_read",\
"php_mysqlnd_net_connect_ex_pub",\
"php_mysqlnd_net_network_read_ex_pub",\
"php_mysqlnd_net_network_write_ex_pub",\
"php_mysqlnd_net_open_tcp_or_unix_pub",\
"php_mysqlnd_net_receive_ex_pub",\
"php_mysqlnd_net_send_ex_pub",\
"php_mysqlnd_ok_read",\
"php_mysqlnd_prepare_read",\
"php_mysqlnd_res_meta_read_metadata_pub",\
"php_mysqlnd_res_read_result_metadata_pub",\
"php_mysqlnd_res_store_result_fetch_data_pub",\
"php_mysqlnd_res_store_result_pub",\
"php_mysqlnd_rowp_read",\
"php_mysqlnd_rset_field_read",\
"php_mysqlnd_rset_header_read",\
"php_mysqlnd_sha256_pk_request_response_read",\
"php_mysqlnd_stmt_execute_pub",\
"php_mysqlnd_stmt_prepare_pub",\
"php_network_accept_incoming",\
"php_network_connect_socket",\
"php_network_connect_socket_to_host",\
"php_openssl_enable_crypto",\
"php_openssl_sockop_close",\
"php_openssl_sockop_io",\
"php_openssl_sockop_read",\
"php_openssl_sockop_set_option",\
"php_openssl_sockop_write",\
"php_pollfd_for",\
"php_replace_in_subject_func",\
"php_request_shutdown",\
"php_sock_stream_wait_for_data",\
"php_sockop_read",\
"php_sockop_read_close",\
"php_sockop_set_option",\
"php_sockop_write",\
"php_stream_read_to_str",\
"php_stream_url_wrap_http",\
"php_stream_url_wrap_http_ex",\
"php_stream_xport_crypto_enable",\
"php_stream_xport_crypto_setup",\
"php_tcp_sockop_set_option",\
"pkey_rsa_encrypt",\
"preg_replace_func_impl",\
"readline_shell_run",\
"reflection_method_invoke",\
"run_cli",\
"RSA_padding_add_PKCS1_OAEP_mgf1",\
"user_shutdown_function_call",\
"shutdown_executor",\
"shutdown_destructors",\
"stream_resource_regular_dtor",\
"stream_array_from_fd_set",\
"zend_call_function",\
"zend_call_method_if_exists",\
"zend_call_known_function",\
"php_userstreamop_set_option",\
"zend_close_rsrc_list",\
"zend_deactivate",\
"zend_destroy_rsrc_list",\
"zend_do_fcall_common_helper_SPEC",\
"zend_eval_string_ex",\
"zend_eval_string",\
"zend_eval_stringl",\
"zend_execute",\
"zend_execute_scripts",\
"zend_error",\
"zend_deprecated_function",\
"zend_error_va_list",\
"zend_hash_apply",\
"zend_hash_graceful_reverse_destroy",\
"zend_internal_type_error",\
"zend_objects_destroy_object",\
"zend_objects_store_call_destructors",\
"zend_parse_parameters",\
"zend_parse_va_args",\
"zend_std_call_getter",\
"zend_std_has_property",\
"zend_std_read_property",\
"zif_array_map",\
"zif_array_reduce",\
"zif_call_user_func",\
"zif_json_encode",\
"zif_call_user_func_array",\
"zend_user_it_get_current_data",\
"zif_fclose",\
"zif_feof",\
"zif_file_get_contents",\
"zif_post_message_to_js",\
"zif_fopen",\
"zif_fread",\
"zif_fsockopen",\
"zif_getimagesize",\
"zif_mysqli_begin_transaction",\
"zif_mysqli_connect",\
"zif_mysqli_data_seek",\
"zif_mysqli_errno",\
"zif_mysqli_error",\
"zif_mysqli_fetch_fields",\
"zif_mysqli_fetch_object",\
"zif_mysqli_fetch_row",\
"zif_mysqli_get_charset",\
"zif_mysqli_multi_query",\
"zif_mysqli_next_result",\
"zif_mysqli_prepare",\
"zif_mysqli_query",\
"zif_mysqli_real_connect",\
"zif_mysqli_reap_async_query",\
"zif_mysqli_select_db",\
"zif_mysqli_set_charset",\
"zif_mysqli_stmt_execute",\
"zif_mysqli_stmt_fetch",\
"zif_preg_replace_callback",\
"zif_popen",\
"php_exec_ex",\
"wasm_popen",\
"zif_wasm_popen",\
"zif_system",\
"zif_exec",\
"zif_passthru",\
"zif_shell_exec",\
"zif_proc_open",\
"proc_open_rsrc_dtor",\
"zend_list_close",\
"zif_proc_close",\
"zif_stream_socket_client",\
"zim_PDOStatement_execute",\
"zim_PDO___construct",\
"zim_PDO_beginTransaction",\
"zim_PDO_commit",\
"zim_PDO_commitTransaction",\
"zim_PDO_dbh_constructor",\
"zim_PDO_exec",\
"zim_PDO_query",\
"zim_PDO_rollBack",\
"zim_ReflectionMethod_invoke",\
"zim_ReflectionMethod_invokeArgs",\
"zim_ReflectionClass_newInstanceArgs",\
"zim_reflection_class_newInstanceArgs",\
"zim_reflection_method_invoke",\
"zim_reflection_method_invokeArgs",\
"ZEND_INCLUDE_OR_EVAL_SPEC_CV_HANDLER",\
"ZEND_NEW_SPEC_CONST_UNUSED_HANDLER",\
"compile_file",\
"file_handle_dtor",\
"open_file_for_scanning",\
"phar_compile_file",\
"php_zend_stream_closer",\
"zend_fetch_class_by_name",\
"zend_file_handle_dtor",\
"zend_free_extra_named_params",\
"zend_include_or_eval",\
"zend_llist_del_element",\
"zend_lookup_class_ex",\
"zend_stream_fixup",\
"zif_spl_autoload_call",\
"php_error_docref",\
"php_pcre_replace_func_impl",\
"php_verror"'; \
	# If pointer casts are enabled, we need to asyncify both the prefixed and unprefixed names
	if [ "${PHP_VERSION:0:1}" -lt "8" ]; then \
		export ASYNCIFY_ONLY="$ASYNCIFY_ONLY,"$(echo "$ASYNCIFY_ONLY" | sed -E $'s/"([a-zA-Z])/"byn$fpcast-emu$\\1/g'); \
	fi; \
	echo -n ' -s ASYNCIFY_ONLY=['$ASYNCIFY_ONLY_UNPREFIXED$ASYNCIFY_ONLY'] '| tr -d "\n" >> /root/.emcc-php-asyncify-flags;

# Build the final .wasm file
RUN mkdir /root/output
COPY ./php/phpwasm-emscripten-library.js /root/phpwasm-emscripten-library.js
ARG WITH_SOURCEMAPS
RUN set -euxo pipefail; \
	mkdir -p /build/output; \
	source /root/emsdk/emsdk_env.sh; \
	if [ "$WITH_JSPI" = "yes" ]; then \
		export ASYNCIFY_FLAGS=" -s ASYNCIFY=2 -sSUPPORT_LONGJMP=wasm -fwasm-exceptions -sJSPI_IMPORTS=js_open_process,js_waitpid,js_process_status,js_create_input_device,wasm_setsockopt,wasm_shutdown,wasm_close -sJSPI_EXPORTS=wasm_sleep,wasm_read,emscripten_sleep,wasm_sapi_handle_request,wasm_sapi_request_shutdown,wasm_poll_socket,wrap_select,__wrap_select,select,php_pollfd_for,fflush,wasm_popen,wasm_read,wasm_php_exec,run_cli -s EXTRA_EXPORTED_RUNTIME_METHODS=ccall,PROXYFS,wasmExports,_malloc "; \
		echo '#define PLAYGROUND_JSPI 1' > /root/php_wasm_asyncify.h; \
	else \
		export ASYNCIFY_FLAGS=" -s ASYNCIFY=1 -s ASYNCIFY_IGNORE_INDIRECT=1 -s EXPORTED_RUNTIME_METHODS=ccall,PROXYFS,wasmExports $(cat /root/.emcc-php-asyncify-flags)  "; \
		echo '' > /root/php_wasm_asyncify.h; \
	fi; \	
	export EXPORTED_FUNCTIONS=$'["_exit", \n\
"UTF8ToString", \n\
"stringToUTF8", \n\
"lengthBytesUTF8", \n\
"FS", \n\
"___wrap_select", \n\
"_wasm_set_sapi_name", \n\
"_php_wasm_init", \n\
"_emscripten_sleep", \n\
"_wasm_sleep", \n\
"_wasm_set_phpini_path", \n\
"_wasm_add_SERVER_entry", \n\
"_wasm_add_ENV_entry", \n\
"_wasm_read", \n\
"_wasm_free", \n\
"_wasm_sapi_handle_request", \n\
"_wasm_sapi_request_shutdown", \n\
"_wasm_set_content_length", \n\
"_wasm_set_content_type", \n\
"_wasm_set_cookies", \n\
"_wasm_set_path_translated", \n\
"_wasm_set_query_string", \n\
"_wasm_set_request_body", \n\
"_wasm_set_request_host", \n\
"_wasm_set_request_method", \n\
"_wasm_set_request_port", \n\
"_wasm_set_request_uri", \n\
"_wasm_set_skip_shebang" '"$(cat /root/.EXPORTED_FUNCTIONS)"']'; \
	export OPTIMIZATION_FLAGS="-O3"; \
	if [ "${WITH_SOURCEMAPS}" = "yes" ]; then \
		export OPTIMIZATION_FLAGS="-O0"; \
	fi; \
	emcc $OPTIMIZATION_FLAGS \
	--js-library /root/phpwasm-emscripten-library.js \
	-I .  \
	-I ext   \
	-I ext/json   \
	-I Zend  \
	-I main  \
	-I TSRM/ \
	-I /root/lib/include \
	-L/root/lib -L/root/lib/lib/ \
	-lproxyfs.js \
	$ASYNCIFY_FLAGS \
	$(cat /root/.emcc-php-wasm-flags) \
	-s EXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS" \
	-s INITIAL_MEMORY=1024MB \
	-s ALLOW_MEMORY_GROWTH=1         \
	-s ASSERTIONS=0                  \
	-s ERROR_ON_UNDEFINED_SYMBOLS=0  \
	-s NODEJS_CATCH_EXIT=0           \
	-s NODEJS_CATCH_REJECTION=0      \
	-s INVOKE_RUN=0                  \
	-o /build/output/php.js \
	-s EXIT_RUNTIME=1                \
	-Wl,--wrap=select \
		/root/lib/libphp.a \
		/root/proc_open.c \
		/root/php_wasm.c \
		/root/dns_polyfill.c \
		$(cat /root/.emcc-php-wasm-sources) \
	-s ENVIRONMENT=$EMSCRIPTEN_ENVIRONMENT \
	-s FORCE_FILESYSTEM=1 \
	-s EXPORT_NAME="'PHPLoader'"
	# Emscripten complains it can't find some Asyncify functions
	# listed in ASYNCIFY_IMPORTS. The culprit is those functions
	# are actually used and delisting them breaks php_pollfd_for().
	# Sooo... just ignore Emscripten's warnings.

# # At the moment terminfo is baked into the repository in
# # src/php-cli/terminfo, but if we ever need to update it, we can
# # use the terminfo database produced by the ncurses make script:
# RUN if [ "$EMSCRIPTEN_ENVIRONMENT" = "node" ]; then \
#         mkdir -p /root/output/terminfo/x && \
#         cp -v /root/lib/share/terminfo/x/xterm* /root/output/terminfo/x/; \
#     fi

# Postprocess the build php.js module:
COPY ./php/esm-prefix.js /root/esm-prefix.js
COPY ./php/esm-suffix.js /root/esm-suffix.js
COPY ./php/esm-php-exit-status.js /root/esm-php-exit-status.js
RUN apt-get install -y nodejs npm
COPY ./php/override-php-exit-status.js /root/override-php-exit-status.js
RUN set -euxo pipefail; \
	cp -rfv /build/output/* /root/output/; \
	# Figure out the target file names and URLs
		# The .js and .wasm filenames should reflect the build configuration, e.g.:
		# * `php-7.4.node.js` and `php-7.4.node.wasm`
		# * `php-8.0.js` and `php-8.0.wasm`
		# In addition, the `.wasm` file URL should have a "cache busting" query string on the
		# web, so that web browsers will reload it when the file contents change.
	# Precompute export variables:
		export FILE_SIZE=$(stat -c%s "/root/output/php.wasm") && \
		export PHP_VERSION_ESCAPED="${PHP_VERSION//./_}" && \
		export FILENAME_PREFIX="php_${PHP_VERSION_ESCAPED:0:3}"; \
		export EXT_PREFIX=""; \
		export JS_FILENAME="${FILENAME_PREFIX}${EXT_PREFIX}.js"; \
		export WASM_FILENAME="${FILENAME_PREFIX}${EXT_PREFIX}.wasm"; \
	# Make the php.wasm URL configurable via the dependencyFilename loader argument:
		/root/replace.sh $'s/["\']php\.wasm[\'"]/dependencyFilename/g' /root/output/php.js; \
	# Patch a "property undefined" error
		# Emscripten produces an if that checks a stream.stream_ops.poll property. However,
		# stream.stream_ops is sometimes undefined and the check fails. Let's adjust it to
		# tolerate a null stream.stream_ops value.
		/root/replace.sh "s/if\s*\(stream\.stream_ops\.poll\)/if (stream.stream_ops?.poll)/g" /root/output/php.js; \
	# Make Emscripten websockets configurable
		# Emscripten makes the Websocket proxy connect to a fixed URL.
		# This assumes the traffic is always forwarded to the same target.
		# However, we want to support arbitrary targets, so we need to
		# replace the hardcoded websocket target URL with a dynamic callback.
		/root/replace.sh $'s/if\s*\(\s*SOCKFS\.websocketArgs\["url"\]\s*\)/if("function"===typeof SOCKFS.websocketArgs["url"]) {\nurl = SOCKFS.websocketArgs["url"](...arguments);\n}else if ("string" === typeof SOCKFS.websocketArgs["url"])/g' \
			/root/output/php.js; \
		# Enable custom WebSocket constructors to support socket options.
		/root/replace.sh "s/ws\s*=\s*new WebSocketConstructor/if (Module['websocket']['decorator']) {WebSocketConstructor = Module['websocket']['decorator'](WebSocketConstructor);}ws = new WebSocketConstructor/g" /root/output/php.js && \
		if [ "$EMSCRIPTEN_ENVIRONMENT" = "node" ]; then \
		if [ "$WITH_WS_NETWORKING_PROXY" = "yes" ]; then \
			/root/replace.sh "s/sock\.server\s*=\s*new WebSocketServer/if (Module['websocket']['serverDecorator']) {WebSocketServer = Module['websocket']['serverDecorator'](WebSocketServer);}sock.server = new WebSocketServer/g" /root/output/php.js; \
		fi; \
		fi; \
	# Add MSG_PEEK flag support in recvfrom
		#
		# Emscripten ignores the flags argument to ___syscall_recvfrom.
		# However, PHP relies on passing the MSG_PEEK (== integer 2) flag when polling
		# the stream for data.
		# MSG_PEEK enables reading bytes without moving the stream pointer forward.
		# Without the patch below, PHP consumes the first byte from the top of the
		# response stream, typically "H" in "HTTP/1.1 200 OK", and then fails after
		# reading the remaining "TTP/1.1 200 OK" and not recognizing it as a valid
		# status line.
		# We need to patch the syscall to support the MSG_PEEK flag.
		if [ "$WITH_WS_NETWORKING_PROXY" = "yes" ]; then \
			/root/replace.sh 's/sock\.sock_ops\.recvmsg\(sock,\s*len\);/sock.sock_ops.recvmsg(sock, len, typeof flags !== "undefined" ? flags : 0);/g' /root/output/php.js; \
			/root/replace.sh 's/recvmsg\(sock,\s*length\)\s*{/recvmsg(sock, length, flags) {/g' /root/output/php.js; \
			/root/replace.sh 's/if\s*\(sock\.type\s*===\s*1\s*&&\s*bytesRead\s*<\s*queuedLength\)/if (flags&2) {bytesRead = 0;} if (sock.type === 1 && bytesRead < queuedLength)/g' /root/output/php.js; \
		fi ; \
	# Replace the hardcoded ENVIRONMENT variable with a dynamic computation
		#
		# The JavaScript code of the web loader and web worker loader is identical,
		# but Emscripten forces running different code paths by setting
		#
		# ENVIRONMENT_IS_WEB = true; ENVIRONMENT_IS_WORKER = false
		#
		# This project supports both environments and would have to maintain two
		# separate copies of the code. Instead, we use a dynamic computation of the
		# environment, based on the `RuntimeName` variable, which is an argument to the
		# wrapper function.
		/root/replace.sh $'s/ENVIRONMENT_IS_([A-Z]+)\s*=\s*(true|false)/ENVIRONMENT_IS_$1=RuntimeName==="$1"/g' /root/output/php.js; \
		/root/replace.sh 's/var ENV\s*=\s*\{/var ENV = PHPLoader.ENV || {/g' /root/output/php.js; \
	# Turn the php.js file into an ES module
		# Manually turn the output into a esm module instead of relying on -s MODULARIZE=1.
		# which pollutes the global namespace and does not play well with import() mechanics.
		if [ "$EMSCRIPTEN_ENVIRONMENT" = "node" ]; then \
			echo "const dependencyFilename = __dirname + '/${PHP_VERSION_ESCAPED}/$WASM_FILENAME'; " >> /root/output/php-module.js; \
		else \
			echo "import dependencyFilename from './${PHP_VERSION_ESCAPED}/$WASM_FILENAME'; " >> /root/output/php-module.js; \
		fi; \
		echo "export { dependencyFilename }; " >> /root/output/php-module.js && \
		echo "export const dependenciesTotalSize = $FILE_SIZE; " >> /root/output/php-module.js && \
		cat /root/esm-prefix.js >> /root/output/php-module.js && \
		cat /root/output/php.js >> /root/output/php-module.js && \
		cat /root/esm-suffix.js >> /root/output/php-module.js && \
		npm install estree-toolkit meriyah && \
		node /root/override-php-exit-status.js /root/output/php-module.js && \
		\
		# Remove the old php.js file
		rm /root/output/php.js && \
		\
		# Rename the build files to their final names
		mv /root/output/php-module.js "/root/output/$JS_FILENAME"; \
		mkdir -p /root/output/${PHP_VERSION_ESCAPED}/; \
		mv /root/output/php.wasm "/root/output/${PHP_VERSION_ESCAPED}/$WASM_FILENAME"; \
		if [ "${WITH_SOURCEMAPS}" = "yes" ]; then \
			# Make the source map paths relative to the .wasm file, not the build directory
			sed -i 's#"\.\./\.\./root/#"#g' /root/output/php.wasm.map; \
			mv /root/output/php.wasm.map "/root/output/${PHP_VERSION_ESCAPED}/php.wasm.map"; \
			rm -rf /root/php-src/.git; \
			cp -r /root/php-src "/root/output/${PHP_VERSION_ESCAPED}/php-src"; \
			cp -r /root/emsdk/upstream/emscripten/system "/root/output/${PHP_VERSION_ESCAPED}/php-src/system"; \
		fi;
