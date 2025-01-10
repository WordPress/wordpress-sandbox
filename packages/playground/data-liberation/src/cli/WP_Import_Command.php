<?php

/**
 * Implements the `wp data-liberation` command.
 *
 * ## EXAMPLES
 *
 *     # Import a WXR file.
 *     wp data-liberation import /path/to/file.xml
 *
 *     # Import all files inside a folder.
 *     wp data-liberation import /path/to/folder
 *
 *     # Import a WXR file from a URL.
 *     wp data-liberation import http://example.com/file.xml
 *
 *     # Import a WXR file from a URL, dry run.
 *     wp data-liberation import http://example.com/file.xml --dry-run
 *
 *     # Import a WXR file from a URL, verbose.
 *     wp data-liberation import http://example.com/file.xml --verbose
 *
 *     Success: Imported data.
 */
class WP_Import_Command {
	/**
	 * @var bool $dry_run Whether to perform a dry run.
	 */
	private $dry_run = false;

	/**
	 * @var bool $verbose Whether to show verbose output.
	 */
	private $verbose = false;

	/**
	 * @var WP_Stream_Importer $importer The importer instance.
	 */
	private $importer = null;

	/**
	 * @var string $wxr_path The path to the WXR file.
	 */
	private $wxr_path = '';

	/**
	 * @var int $count The number of items to import in one go.
	 */
	private $count;

	/**
	 * @var WP_Import_Session $import_session The import session.
	 */
	private $import_session;

	/**
	 * Import a WXR file.
	 *
	 * ## OPTIONS
	 *
	 * <path>
	 * : The path to the WXR file. Either a file, a directory or a URL.
	 *
	 * [--count=<count>]
	 * : The number of items to import in one go. Default is 10,000.
	 *
	 * [--dry-run]
	 * : Perform a dry run if set.
	 *
	 * [--verbose]
	 * : Show more detailed output.
	 *
	 * ## EXAMPLES
	 *
	 *     wp data-liberation import /path/to/file.xml
	 *
	 * @param array $args
	 * @param array $assoc_args
	 * @return void
	 */
	public function import( $args, $assoc_args ) {
		$path          = $args[0];
		$this->dry_run = WP_CLI\Utils\get_flag_value( $assoc_args, 'dry-run', false );
		$this->verbose = WP_CLI\Utils\get_flag_value( $assoc_args, 'verbose', false );
		$this->count   = isset( $assoc_args['count'] ) ? (int) $assoc_args['count'] : 10000;

		if ( extension_loaded( 'pcntl' ) ) {
			// Set the signal handler.
			$this->register_handlers();
		}

		if ( $this->verbose ) {
			$this->register_verbose_callbacks();
		}

		if ( filter_var( $path, FILTER_VALIDATE_URL ) ) {
			// Import URL.
			$this->import_wxr_url( $path );
		} elseif ( is_dir( $path ) ) {
			$count = 0;
			// Get all the WXR files in the directory.
			foreach ( wp_visit_file_tree( $path ) as $event ) {
				foreach ( $event->files as $file ) {
					if ( $file->isFile() && 'xml' === pathinfo( $file->getPathname(), PATHINFO_EXTENSION ) ) {
						++$count;

						// Import the WXR file.
						$this->import_wxr_file( $file->getPathname() );
					}
				}
			}

			if ( ! $count ) {
				WP_CLI::error( WP_CLI::colorize( "No WXR files found in the %R{$path}%n directory" ) );
			}
		} else {
			if ( ! is_file( $path ) ) {
				WP_CLI::error( WP_CLI::colorize( "File not found: %R{$path}%n" ) );
			}

			// Import the WXR file.
			$this->import_wxr_file( $path );
		}
	}

	private function register_verbose_callbacks() {
		// Add all the callbacks for the importer.
		add_action(
			'wxr_importer_process_failed_user',
			function ( $error, $data ) {
				WP_CLI::debug(
					sprintf(
						/* translators: %s: user login */
						__( 'Failed to import user "%1$s": %2$s', 'wordpress-importer' ),
						$data['user_login'],
						$error->get_error_message()
					)
				);
			},
			10,
			2
		);

		add_action(
			'wxr_importer_process_failed_term',
			function ( $error, $data ) {
				WP_CLI::log(
					sprintf(
						/* translators: 1: taxonomy name, 2: term name, 3: error message */
						__( 'Failed to import %1$s "%2$s": %3$s', 'wordpress-importer' ),
						$data['taxonomy'],
						$data['name'],
						$error->get_error_message()
					)
				);
			},
			10,
			2
		);

		add_action(
			'wxr_importer_process_failed_post',
			function ( $error, $data, $meta, $post_type_object ) {
				WP_CLI::log(
					sprintf(
						/* translators: 1: post title, 2: post type name */
						__( 'Failed to import post "%1$s" (%2$s): %3$s', 'wordpress-importer' ),
						$data['post_title'],
						$post_type_object->labels->singular_name,
						$error->get_error_message()
					)
				);
			},
			10,
			4
		);
	}

	private function start_session( $args ) {
		if ( $this->dry_run ) {
			WP_CLI::line( 'Dry run enabled. No session created.' );

			return;
		}

		$active_session = WP_Import_Session::get_active();

		if ( $active_session ) {
			$this->import_session = $active_session;

			$id = $this->import_session->get_id();
			WP_CLI::line( WP_CLI::colorize( "Current session: %g{$id}%n" ) );
		} else {
			$this->import_session = WP_Import_Session::create( $args );

			$id = $this->import_session->get_id();
			WP_CLI::line( WP_CLI::colorize( "New session: %g{$id}%n" ) );
		}
	}

	/**
	 * Import a WXR file.
	 *
	 * @param string $file_path The path to the WXR file.
	 * @return void
	 */
	private function import_wxr_file( $file_path, $options = array() ) {
		$this->wxr_path = $file_path;

		$this->start_session(
			array(
				'data_source' => 'wxr_file',
				'file_name'   => $file_path,
			)
		);

		// Pass the session ID.
		$options['session_id'] = $this->import_session->get_id();

		$this->importer = WP_Stream_Importer::create_for_wxr_file( $file_path, $options );
		$this->import_wxr();
	}

	/**
	 * Import a WXR file from a URL.
	 *
	 * @param string $url The URL to the WXR file.
	 * @return void
	 */
	private function import_wxr_url( $url, $options = array() ) {
		$this->wxr_path = $url;

		$this->start_session(
			array(
				'data_source' => 'wxr_url',
				'file_name'   => $url,
			)
		);

		// Pass the session ID.
		$options['session_id'] = $this->import_session->get_id();

		$this->importer = WP_Stream_Importer::create_for_wxr_url( $url, $options );
		$this->import_wxr();
	}

	/**
	 * Import the WXR file.
	 */
	private function import_wxr() {
		if ( ! $this->importer ) {
			WP_CLI::error( 'Could not create importer' );
		}

		if ( ! $this->import_session ) {
			WP_CLI::error( 'Could not create session' );
		}

		WP_CLI::line( "Importing {$this->wxr_path}" );

		if ( $this->dry_run ) {
			// @TODO: do something with the dry run.
			WP_CLI::line( 'Dry run enabled.' );
		} else {
			$progresses = array();
			do {
				$current_stage = $this->importer->get_stage();
				WP_CLI::line( WP_CLI::colorize( "Stage %g{$current_stage}%n" ) );
				$step_count = 0;

				while ( $this->importer->next_step() ) {
					++$step_count;

					if ( $this->verbose ) {
						WP_CLI::line( WP_CLI::colorize( "Step %g{$step_count}%n" ) );
					}
				}
			} while ( $this->importer->advance_to_next_stage() );
		}

		WP_CLI::success( 'Import finished' );
	}

	/**
	 * Callback function registered to `pcntl_signal` to handle signals.
	 *
	 * @param int $signal The signal number.
	 * @return void
	 */
	protected function signal_handler( $signal ) {
		switch ( $signal ) {
			case SIGINT:
				WP_CLI::line( 'Received SIGINT signal' );
				exit( 0 );

			case SIGTERM:
				WP_CLI::line( 'Received SIGTERM signal' );
				exit( 0 );
		}
	}

	/**
	 * Register signal handlers for the command.
	 *
	 * @return void
	 */
	private function register_handlers() {
		// Handle the Ctrl + C signal to terminate the program.
		pcntl_signal( SIGINT, array( $this, 'signal_handler' ) );

		// Handle the `kill` command to terminate the program.
		pcntl_signal( SIGTERM, array( $this, 'signal_handler' ) );
	}
}
