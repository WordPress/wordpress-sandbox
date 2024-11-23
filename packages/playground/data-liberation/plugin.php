<?php
/**
 * Plugin Name: Data Liberation
 * Description: Data parsing and importing primitives.
 */

require_once __DIR__ . '/bootstrap.php';

/**
 * Don't run KSES on the attribute values during the import.
 *
 * Without this filter, WP_HTML_Tag_Processor::set_attribute() will
 * assume the value is a URL and run KSES on it, which will incorrectly
 * prefix relative paths with http://.
 *
 * For example:
 *
 * > $html = new WP_HTML_Tag_Processor( '<img>' );
 * > $html->next_tag();
 * > $html->set_attribute( 'src', './_assets/log-errors.png' );
 * > echo $html->get_updated_html();
 * <img src="http://./_assets/log-errors.png">
 */
add_filter('wp_kses_uri_attributes', function() {
    return [];
});

/**
 * Development debug code to run the import manually.
 * @TODO: Remove this in favor of a CLI command.
 */
add_action('init', function() {
    return;
    // $wxr_path = __DIR__ . '/tests/fixtures/wxr-simple.xml';
    $wxr_path = __DIR__ . '/tests/wxr/a11y-unit-test-data.xml';
    $importer = WP_Stream_Importer::create_for_wxr_file(
        $wxr_path
    );

    echo '<plaintext>';
    
    do {
        while($importer->next_step()) {
            switch($importer->get_stage()) {
                case WP_Stream_Importer::STAGE_INDEX_ENTITIES:
                    print_r($importer->get_indexed_entities_counts());
                    print_r($importer->get_indexed_assets_urls());
                    break;
                case WP_Stream_Importer::STAGE_FRONTLOAD_ASSETS:
                    if($importer->get_frontloading_progress()) {
                        var_dump($importer->get_frontloading_progress());
                    }
                    if($importer->get_frontloading_events()) {
                        var_dump($importer->get_frontloading_events());
                    }
                    break;
            }
        }

        if($importer->get_stage() === WP_Stream_Importer::STAGE_FRONTLOAD_ASSETS) {
            break;
        }
    } while ( $importer->advance_to_next_stage() );
    var_dump($importer->get_next_stage());

    die("Done");
    var_dump($importer->get_stage());
    var_dump($importer->get_next_stage());
    
    $importer->next_step();
    switch($importer->get_stage()) {
        case WP_Stream_Importer::STAGE_INDEX_ENTITIES:
            var_dump($importer->get_entities_counts());
            var_dump($importer->get_found_assets_urls());
            break;
    }
    die();
    while($importer->next_step()) {
        // ...
    }
    return;
    $importer->next_step();
    $paused_importer_state = $importer->get_reentrancy_cursor();

    echo "\n\n";
    echo "moving to importer2\n";
    echo "\n\n";

    $importer2 = WP_Stream_Importer::create_for_wxr_file(
        $wxr_path,
        array(),
        $paused_importer_state
    );
    $importer2->next_step();
    $importer2->next_step();
    $importer2->next_step();
    // $importer2->next_step();
    // var_dump($importer2);

    die("YAY");
});

// Register admin menu
add_action('admin_menu', function() {
    add_menu_page(
        'Data Liberation',
        'Data Liberation',
        'manage_options',
        'data-liberation',
        'data_liberation_admin_page',
        'dashicons-database-import'
    );
});

add_action('admin_enqueue_scripts', 'enqueue_data_liberation_scripts');

function enqueue_data_liberation_scripts() {
    wp_register_script_module(
        '@data-liberation/import-screen',
        plugin_dir_url( __FILE__ ) . 'import-screen.js',
        array( '@wordpress/interactivity' )
    );
    wp_enqueue_script_module(
        '@data-liberation/import-screen',
        plugin_dir_url( __FILE__ ) . 'import-screen.js',
        array( '@wordpress/interactivity' )
    );
}
function data_liberation_add_minute_schedule( $schedules ) {
    // add a 'weekly' schedule to the existing set
    $schedules['data_liberation_minute'] = array(
        'interval' => 60,
        'display' => __('Once a Minute')
    );
    return $schedules;
}
add_filter( 'cron_schedules', 'data_liberation_add_minute_schedule' );

// Render admin page
function data_liberation_admin_page() {

    // Populates the initial global state values.
    wp_interactivity_state( 'dataLiberation', array(
        'selectedImportType' => 'wxr_file',
        'isImportTypeSelected' => function() {
            // @TODO Figure out why this function is not hiding the form rows
            $state   = wp_interactivity_state();
            $context = wp_interactivity_get_context();
            return $context['importType'] === $state['selectedImportType'];
        },
    ));
    ?>
    <div class="wrap">
        <h1>Data Liberation</h1>
    <?php

    $current_import = get_option('data_liberation_active_import');
    if(isset($_GET['run-step']) && $current_import) {
        echo '<h2>Next import step stdout output:</h2>';
        echo '<pre>';
        data_liberation_process_import();
        echo '</pre>';
    }

    ?>
        <?php
        // Show import status if one is active
        $import_session = WP_Import_Session::get_active();
        if ($import_session) {
            $stage = $import_session->get_stage();
            $totals = $import_session->get_total_number_of_entities();
            $imported = $import_session->count_imported_entities();
            ?>
            <div>
                <h2>Active import</h2>
                <div class="import-stages">
                    <?php if ($import_session->is_stage_completed(WP_Stream_Importer::STAGE_INITIAL)): ?>
                        <div class="stage current">
                            <h4>New Import Created</h4>
                            <p>Import session initialized and ready to begin processing.</p>
                        </div>
                    <?php else: ?>
                        <div class="stage completed">✓ New Import Created</div>
                    <?php endif; ?>

                    <?php if ($stage === WP_Stream_Importer::STAGE_INDEX_ENTITIES || $import_session->is_stage_completed(WP_Stream_Importer::STAGE_INDEX_ENTITIES)): ?>
                        <div class="stage current">
                            <?php if($import_session->is_stage_completed(WP_Stream_Importer::STAGE_INDEX_ENTITIES)): ?>
                                <h4>✓ Indexed Entities</h4>
                            <?php else: ?>
                                <h4>Indexing Entities</h4>
                            <?php endif; ?>
                            <p>Found so far:</p>
                            <ul>
                                <?php foreach($totals as $field => $count): ?>
                                    <li><?php echo ucfirst($field); ?>: <?php echo $count ?></li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                    <?php else: ?>
                        <div class="stage pending">Index Entities</div>
                    <?php endif; ?>

                    <?php if ($stage === WP_Stream_Importer::STAGE_TOPOLOGICAL_SORT): ?>
                        <div class="stage current">
                            <h4>Sorting Entities</h4>
                            <p>Determining optimal import order...</p>
                        </div>
                    <?php elseif ($import_session->is_stage_completed(WP_Stream_Importer::STAGE_TOPOLOGICAL_SORT)): ?>
                        <div class="stage completed">✓ Sorted Entities</div>
                    <?php else: ?>
                        <div class="stage pending">Sort Entities</div>
                    <?php endif; ?>

                    <?php if (
                        $stage === WP_Stream_Importer::STAGE_FRONTLOAD_ASSETS ||
                        $import_session->is_stage_completed(WP_Stream_Importer::STAGE_FRONTLOAD_ASSETS)
                    ): ?>
                        <div class="stage current">
                            <?php if($import_session->is_stage_completed(WP_Stream_Importer::STAGE_FRONTLOAD_ASSETS)): ?>
                                <h4>✓ Downloaded Assets</h4>
                            <?php else: ?>
                                <h4>Downloading Assets</h4>
                            <?php endif; ?>
                            <?php 
                            $frontloading_progress = $import_session->get_frontloading_progress();
                            foreach ($frontloading_progress as $url => $progress): ?>
                                <div>
                                    <small><?php echo esc_html(basename($url)); ?></small>
                                    <progress value="<?php echo $progress['received']; ?>" max="<?php echo $progress['total'] ?? 100; ?>"></progress>
                                </div>
                            <?php endforeach; ?>
                            <p>Files downloaded: <?php echo $imported['file'] ?? 0; ?> / <?php echo $totals['file'] ?? 0; ?></p>
                        </div>
                    <?php else: ?>
                        <div class="stage pending">Download Assets</div>
                    <?php endif; ?>

                    <?php if (
                        $stage === WP_Stream_Importer::STAGE_IMPORT_ENTITIES ||
                        $import_session->is_stage_completed(WP_Stream_Importer::STAGE_IMPORT_ENTITIES)
                    ): ?>
                        <div class="stage current">
                            <?php if($import_session->is_stage_completed(WP_Stream_Importer::STAGE_IMPORT_ENTITIES)): ?>
                                <h4>✓ Imported Content</h4>
                            <?php else: ?>
                                <h4>Importing Content</h4>
                            <?php endif; ?>
                            <ul>
                                <?php foreach($imported as $field => $count): ?>
                                    <li><?php echo ucfirst($field); ?>: <?php echo $count; ?> / <?php echo $totals[$field] ?? 0; ?></li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                    <?php else: ?>
                        <div class="stage pending">Import Content</div>
                    <?php endif; ?>
                </div>

                <?php if($stage === WP_Stream_Importer::STAGE_IMPORT_ENTITIES): ?>
                    <p>
                        Import finished!
                    </p>
                <?php else: ?>
                    <a href="<?php echo esc_url(add_query_arg('run-step', 'true', admin_url('admin.php?page=data-liberation'))); ?>" class="button">
                        Run next import step
                    </a>
                <?php endif; ?>
            </div>
            <?php
        } else {
            echo '<p>No import is currently in progress.</p>';
        }
        ?>

        <h2>Start a new import session</h2>
        <form
            method="post"
            enctype="multipart/form-data"
            action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
            data-wp-interactive="dataLiberation"
        >
            <?php wp_nonce_field('data_liberation_import'); ?>
            <input type="hidden" name="action" value="data_liberation_import">
            <table class="form-table">
                <tr>
                    <th scope="row">Import Type</th>
                    <td>
                        <label data-wp-context='{ "importType": "wxr_file" }'>
                            <input type="radio" name="data_source" value="wxr_file" checked
                                data-wp-bind--checked="state.isImportTypeSelected"
                                data-wp-on--change="actions.setImportType">
                            Upload WXR File
                        </label><br>
                        <label data-wp-context='{ "importType": "wxr_url" }'>
                            <input type="radio" name="data_source" value="wxr_url"
                                data-wp-bind--checked="state.isImportTypeSelected"
                                data-wp-on--change="actions.setImportType">
                            WXR File URL
                        </label><br>
                        <label data-wp-context='{ "importType": "markdown_zip" }'>
                            <input type="radio" name="data_source" value="markdown_zip"
                                data-wp-bind--checked="state.isImportTypeSelected"
                                data-wp-on--change="actions.setImportType">
                            Markdown ZIP Archive
                        </label>
                    </td>
                </tr>

                <tr data-wp-context='{ "importType": "wxr_file" }'
                    data-wp-class--hidden="!state.isImportTypeSelected">
                    <th scope="row">WXR File</th>
                    <td>
                        <input type="file" name="wxr_file" accept=".xml">
                        <p class="description">Upload a WordPress eXtended RSS (WXR) file</p>
                    </td>
                </tr>

                <tr data-wp-context='{ "importType": "wxr_url" }'
                data-wp-class--hidden="!state.isImportTypeSelected">
                    <th scope="row">WXR URL</th>
                    <td>
                        <input type="url" name="wxr_url" class="regular-text">
                        <p class="description">Enter the URL of a WXR file</p>
                    </td>
                </tr>

                <tr data-wp-context='{ "importType": "markdown_zip" }'
                    data-wp-class--hidden="!state.isImportTypeSelected">
                    <th scope="row">Markdown ZIP</th>
                    <td>
                        <input type="file" name="markdown_zip" accept=".zip">
                        <p class="description">Upload a ZIP file containing markdown files</p>
                    </td>
                </tr>
            </table>

            <?php submit_button('Start Import'); ?>
        </form>

        <h2>Previous Import Sessions</h2>

        <p>TODO: Show a table of previous imports.</p>

        <table class="form-table">
            <tr>
                <th scope="row">Date</th>
                <th scope="row">Data source</th>
                <th scope="row">Time taken</th>
                <th scope="row">Entities imported</th>
                <th scope="row">Result</th>
            </tr>
            <tr>
                <td>2024-01-01</td>
                <td>WXR file</td>
                <td>10 minutes</td>
                <td>1000</td>
                <td>Success</td>
            </tr>
        </table>
    </div>
    <?php
}

// Handle form submission
add_action('admin_post_data_liberation_import', function() {
    if (!current_user_can('manage_options')) {
        wp_die('Unauthorized');
    }

    // @TODO: check nonce
    // check_admin_nonce('data_liberation_import');
    $data_source = $_POST['data_source'];
    $attachment_id = null;
    $file_name = '';

    switch ($data_source) {
        case 'wxr_file':
            if (empty($_FILES['wxr_file']['tmp_name'])) {
                wp_die('Please select a file to upload');
            }
            if (!in_array($_FILES['wxr_file']['type'], ['text/xml', 'application/xml'])) {
                wp_die('Invalid file type');
            }
            /**
             * @TODO: Reconsider storing the file in the media library where everyone
             *        can access it via a public URL.
             */
            $attachment_id = media_handle_upload(
                'wxr_file',
                0,
                array(),
                array(
                    'mimes' => array(
                        'xml' => 'text/xml',
                        'xml-application' => 'application/xml',
                    ),
                    // test_form checks:
                    // Whether to test that the $_POST['action'] parameter is as expected.
                    // It seems useless here and it causes cryptic error "Invalid form submission".
                    // Let's just disable it.
                    'test_form' => false,

                    // @TODO: Find a way to make this type check work.
                    'test_type' => false,
                )
            );
            if (is_wp_error($attachment_id)) {
                wp_die($attachment_id->get_error_message());
            }
            $file_name = $_FILES['wxr_file']['name'];
            $import_session = WP_Import_Session::create(array(
                'data_source' => 'wxr_file',
                'attachment_id' => $attachment_id,
                'file_name' => $file_name,
            ));
            break;

        case 'wxr_url':
            if (empty($_POST['wxr_url']) || !filter_var($_POST['wxr_url'], FILTER_VALIDATE_URL)) {
                wp_die('Please enter a valid URL');
            }
            // Don't download the file, it could be 300GB or so. The
            // import callback will stream it as needed.
            $import_session = WP_Import_Session::create(array(
                'data_source' => 'wxr_url',
                'source_url' => $_POST['wxr_url'],
            ));
            break;

        case 'markdown_zip':
            if (empty($_FILES['markdown_zip']['tmp_name'])) {
                wp_die('Please select a file to upload');
            }
            if ($_FILES['markdown_zip']['type'] !== 'application/zip') {
                wp_die('Invalid file type');
            }
            $attachment_id = media_handle_upload('markdown_zip', 0);
            if (is_wp_error($attachment_id)) {
                wp_die($attachment_id->get_error_message());
            }
            $file_name = $_FILES['markdown_zip']['name'];
            $import_session = WP_Import_Session::create(array(
                'data_source' => 'markdown_zip',
                'attachment_id' => $attachment_id,
                'file_name' => $file_name,
            ));
            break;

        default:
            wp_die('Invalid import type');
    }

    if ( false === $import_session ) {
        // @TODO: More user friendly error message – maybe redirect back to the import screen and
        //        show the error there.
        wp_die('Failed to create an import session');
    }

    // Schedule the next import step every minute, so 30 seconds more than the
    // default PHP max_execution_time.

    /**
     * @TODO: The schedule doesn't seem to be actually running.
     */
    // if(is_wp_error(wp_schedule_event(time(), 'data_liberation_minute', 'data_liberation_process_import'))) {
    //     wp_delete_attachment($attachment_id, true);
    //     // @TODO: More user friendly error message – maybe redirect back to the import screen and
    //     //        show the error there.
    //     wp_die('Failed to schedule import – the "data_liberation_minute" schedule may not be registered.');
    // }

    wp_redirect(add_query_arg(
        'message', 'import-scheduled',
        admin_url('admin.php?page=data-liberation')
    ));
    exit;
});

// Process import in the background
function data_liberation_process_import() {
    $session = WP_Import_Session::get_active();
    if (!$session) {
        _doing_it_wrong(
            __METHOD__,
            'No active import session',
            '1.0.0'
        );
        return false;
    }
    return data_liberation_import_step($session);
}
add_action('data_liberation_process_import', 'data_liberation_process_import');

function data_liberation_import_step($session) {
    $importer = data_liberation_create_importer($session->get_metadata());
    if(!$importer) {
        return;
    }

    do {
        while($importer->next_step()) {
            switch($importer->get_stage()) {
                case WP_Stream_Importer::STAGE_INDEX_ENTITIES:
                    // Bump the total number of entities to import.
                    $session->bump_total_number_of_entities([
                        ...$importer->get_indexed_entities_counts(),
                        'file' => count($importer->get_indexed_assets_urls())
                    ]);
                    break;
                case WP_Stream_Importer::STAGE_FRONTLOAD_ASSETS:
                    $session->bump_frontloading_progress(
                        $importer->get_frontloading_progress(),
                        $importer->get_frontloading_events()
                    );
                    break;
                case WP_Stream_Importer::STAGE_IMPORT_ENTITIES:
                    $session->bump_imported_entities_counts(
                        $importer->get_imported_entities_counts()
                    );
                    break;
            }
        }

        if($importer->get_next_stage()) {
            $session->set_stage($importer->get_next_stage());
        }
        $cursor = $importer->get_reentrancy_cursor();
        if($cursor) {
            $session->set_reentrancy_cursor($cursor);
        }
    } while ( $importer->advance_to_next_stage() );

    // @TODO: Do not echo things. Append to an import log where we can retrace the steps.
    //        Also, store specific import events in the database so the user can react and
    //        make decisions.
    echo '<br/>Import finished. TODO: Summary: Time taken, number of entities imported, etc. Also, preserve something tabular for the user to review the historical results.';
}

function data_liberation_create_importer($import) {
    switch($import['data_source']) {
        case 'wxr_file':
            $wxr_path = get_attached_file($import['attachment_id']);
            if(false === $wxr_path) {
                // @TODO: Save the error, report it to the user.
                return;
            }
            return WP_Stream_Importer::create_for_wxr_file(
                $wxr_path
            );

        case 'wxr_url':
            return WP_Stream_Importer::create_for_wxr_url(
                $import['wxr_url']
            );

        case 'markdown_zip':
            // @TODO: Don't unzip. Stream data directly from the ZIP file.
            $zip_path = get_attached_file($import['attachment_id']);
            $temp_dir = sys_get_temp_dir() . '/data-liberation-markdown-' . $import['attachment_id'];
            if (!file_exists($temp_dir)) {
                mkdir($temp_dir, 0777, true);
                $zip = new ZipArchive();
                if ($zip->open($zip_path) === TRUE) {
                    $zip->extractTo($temp_dir);
                    $zip->close();
                } else {
                    // @TODO: Save the error, report it to the user
                    return;
                }
            }
            $markdown_root = $temp_dir;
            return WP_Markdown_Importer::create_for_markdown_directory(
                $markdown_root, [
                    'source_site_url' => 'file://' . $markdown_root,
                    'local_markdown_assets_root' => $markdown_root,
                    'local_markdown_assets_url_prefix' => '@site/',
                ]
            );
    }
}
