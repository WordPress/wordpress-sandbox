import { StepHandler } from '.';
import { logger } from '@php-wasm/logger';
/**
 * @inheritDoc activatePlugin
 * @example
 *
 * <code>
 * {
 * 		"step": "activatePlugin",
 * 		"pluginName": "Gutenberg",
 * 		"pluginPath": "/wordpress/wp-content/plugins/gutenberg"
 * }
 * </code>
 */
export interface ActivatePluginStep {
	step: 'activatePlugin';
	/**
	 * Path to the plugin directory as absolute path
	 * (/wordpress/wp-content/plugins/plugin-name); or the plugin entry file
	 * relative to the plugins directory (plugin-name/plugin-name.php).
	 */
	pluginPath: string;
	/** Optional. Plugin name to display in the progress bar. */
	pluginName?: string;
}

/**
 * Activates a WordPress plugin (if it's installed).
 *
 * @param playground The playground client.
 */
export const activatePlugin: StepHandler<ActivatePluginStep> = async (
	playground,
	{ pluginPath, pluginName },
	progress
) => {
	progress?.tracker.setCaption(`Activating ${pluginName || pluginPath}`);

	const docroot = await playground.documentRoot;
	const activatePluginResult = await playground.run({
		code: `<?php
			define( 'WP_ADMIN', true );
			require_once( getenv('DOCROOT') . "/wp-load.php" );
			require_once( getenv('DOCROOT') . "/wp-admin/includes/plugin.php" );

			// Set current user to admin
			wp_set_current_user( get_users(array('role' => 'Administrator') )[0]->ID );

			$plugin_path = getenv('PLUGIN_PATH');
			$response = false;
			if ( ! is_dir( $plugin_path)) {
				$response = activate_plugin($plugin_path);
			}

			// Activate plugin by name if activation by path wasn't successful
			if ( null !== $response ) {
				foreach ( ( glob( $plugin_path . '/*.php' ) ?: array() ) as $file ) {
					$info = get_plugin_data( $file, false, false );
					if ( ! empty( $info['Name'] ) ) {
						$response = activate_plugin( $file );
						break;
					}
				}
			}

			if ( is_wp_error($response) ) {
				die( $response->get_error_message() );
			} else if ( false === $response ) {
				die( "The activatePlugin step wasn't able to find the plugin $plugin_path." );
			} else if ( $response === null ) {
			 	// When the response is null, the plugin was successfully activated
				die( 'true' );
			}
		`,
		env: {
			PLUGIN_PATH: pluginPath,
			DOCROOT: docroot,
		},
	});
	if (activatePluginResult.text) {
		/**
		 * If the plugin was successfully activated, we can return early.
		 */
		if (activatePluginResult.text === 'true') {
			return;
		}
		logger.warn(
			`Plugin ${pluginPath} activation printed the following bytes: ${activatePluginResult.text}`
		);
	}

	/**
	 * Instead of checking the plugin activation response,
	 * check if the plugin is active by looking at the active plugins list.
	 *
	 * We have to split the activation and the check into two PHP runs
	 * because some plugins might redirect during activation,
	 * which would prevent any output that happens after activation from being returned.
	 *
	 * Relying on the plugin activation response is not reliable because if the plugin activation
	 * produces any output, WordPress will assume it's an activation error and return a WP_Error.
	 * WordPress will still activate the plugin and load the required page,
	 * but it will also show the error as a notice in wp-admin.
	 * See WordPress source code for more details:
	 * https://github.com/WordPress/wordpress-develop/blob/6.7/src/wp-admin/includes/plugin.php#L733
	 *
	 * Because some plugins can create an output, we need to use output buffering
	 * to ensure the 'true' response is not polluted by other outputs.
	 * If the plugin activation fails, we will return the buffered output as it might
	 * contain more information about the failure.
	 */
	const isActiveCheckResult = await playground.run({
		code: `<?php
			ob_start();
			require_once( getenv( 'DOCROOT' ) . "/wp-load.php" );

			/**
			 * Extracts the relative plugin path from either an absolute or relative plugin path.
			 *
			 * Absolute paths starting with plugin directory (e.g., '/wordpress/wp-content/plugins/test-plugin/index.php')
			 * should be converted to relative paths (e.g., 'test-plugin/index.php')
			 *
			 * Directories should finish with a trailing slash to ensure we match the full plugin directory name.
			 *
			 * Examples:
			 * - '/wordpress/wp-content/plugins/test-plugin/index.php' → 'test-plugin/index.php'
			 * - '/wordpress/wp-content/plugins/test-plugin/' → 'test-plugin/'
			 * - '/wordpress/wp-content/plugins/test-plugin' → 'test-plugin/'
			 * - 'test-plugin/index.php' → 'test-plugin/index.php'
			 * - 'test-plugin/' → 'test-plugin/'
			 * - 'test-plugin' → 'test-plugin/'
			 */
			$plugin_directory = WP_PLUGIN_DIR . '/';
			$relative_plugin_path = getenv( 'PLUGIN_PATH' );
			if (strpos($relative_plugin_path, $plugin_directory) === 0) {
				$relative_plugin_path = substr($relative_plugin_path, strlen($plugin_directory));
			}

			if ( is_dir( $plugin_directory . $relative_plugin_path ) ) {
				$relative_plugin_path = rtrim( $relative_plugin_path, '/' ) . '/';
			}

			$active_plugins = get_option( 'active_plugins' );
			foreach ( $active_plugins as $plugin ) {
				if ( substr( $plugin, 0, strlen( $relative_plugin_path ) ) === $relative_plugin_path ) {
					ob_end_clean();
					die( 'true' );
				}
			}
			die( ob_get_flush() ?: 'false' );
		`,
		env: {
			DOCROOT: docroot,
			PLUGIN_PATH: pluginPath,
		},
	});

	if (isActiveCheckResult.text === 'true') {
		// Plugin activation was successful, yay!
		return;
	}

	if (isActiveCheckResult.text !== 'false') {
		logger.debug(isActiveCheckResult.text);
	}
	throw new Error(
		`Plugin ${pluginPath} could not be activated – WordPress exited with no error. ` +
			`Sometimes, when $_SERVER or site options are not configured correctly, ` +
			`WordPress exits early with a 301 redirect. ` +
			`Inspect the "debug" logs in the console for more details.`
	);
};
