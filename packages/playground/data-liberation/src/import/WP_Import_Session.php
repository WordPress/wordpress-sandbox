<?php

/**
 * Manages import session data in the WordPress database.
 * 
 * Each import session is stored as a post of type 'import_session'.
 * Progress, stage, and other metadata are stored as post meta.
 */
class WP_Import_Session {
    const POST_TYPE = 'import_session';
    /**
     * @TODO: Make it extendable
     * @TODO: Reuse the same entities list as WP_Stream_Importer
     */
    const PROGRESS_ENTITIES = array(
        'site_option',
        'user',
        'category',
        'tag',
        'term',
        'post',
        'post_meta',
        'comment',
        'comment_meta',
        'file'
    );
    private $post_id;
    private $cached_stage;

    /**
     * Creates a new import session.
     *
     * @param array $args {
     *     @type string $data_source     The data source (e.g. 'wxr_file', 'wxr_url', 'markdown_zip')
     *     @type string $source_url      Optional. URL of the source file for remote imports
     *     @type int    $attachment_id   Optional. ID of the uploaded file attachment
     *     @type string $file_name       Optional. Original name of the uploaded file
     * }
     * @return WP_Import_Model|WP_Error The import model instance or error if creation failed
     */
    public static function create($args) {
        // Validate the required arguments for each data source.
        // @TODO: Leave it up to filters to make it extendable.
        switch($args['data_source']) {
            case 'wxr_file':
                if(empty($args['file_name'])) {
                    _doing_it_wrong(
                        __METHOD__,
                        'File name is required for WXR file imports',
                        '1.0.0'
                    );
                    return false;
                }
                break;
            case 'wxr_url':
                if(empty($args['source_url'])) {
                    _doing_it_wrong(
                        __METHOD__,
                        'Source URL is required for remote imports',
                        '1.0.0'
                    );
                    return false;
                }
                break;
            case 'markdown_zip':
                if(empty($args['file_name'])) {
                    _doing_it_wrong(
                        __METHOD__,
                        'File name is required for Markdown ZIP imports',
                        '1.0.0'
                    );
                    return false;
                }
                break;
        }

        $post_id = wp_insert_post(
            array(
                'post_type' => self::POST_TYPE,
                'post_status' => 'publish',
                'post_title' => sprintf(
                    'Import from %s - %s',
                    $args['data_source'],
                    $args['file_name'] ?? $args['source_url'] ?? 'Unknown source'
                ),
                'meta_input' => array(
                    'data_source' => $args['data_source'],
                    'started_at' => current_time('mysql'),
                    'source_url' => $args['source_url'] ?? null,
                    'attachment_id' => $args['attachment_id'] ?? null,
                ),
            ),
            true
        );
        if (is_wp_error($post_id)) {
            _doing_it_wrong(
                __METHOD__,
                'Error creating an import session: ' . $post_id->get_error_message(),
                '1.0.0'
            );
            return false;
        }
        
        if (!empty($args['attachment_id'])) {
            wp_update_post(array(
                'ID' => $post_id,
                'post_parent' => $args['attachment_id']
            ));
        }

        return new self($post_id);
    }

    /**
     * Gets an existing import session by ID.
     *
     * @param int $post_id The import session post ID
     * @return WP_Import_Model|null The import model instance or null if not found
     */
    public static function by_id($post_id) {
        $post = get_post($post_id);
        if (!$post || $post->post_type !== self::POST_TYPE) {
            return false;
        }
        return new self($post_id);
    }

    /**
     * Gets the most recent active import session.
     *
     * @return WP_Import_Session|null The most recent import or null if none found
     */
    public static function get_active() {
        $posts = get_posts(array(
            'post_type' => self::POST_TYPE,
            'posts_per_page' => 1,
            'orderby' => 'date',
            'order' => 'DESC',
            'meta_query' => array(
                // @TODO: This somehow makes $post empty.
                // array(
                //     'key' => 'current_stage',
                //     'value' => WP_Stream_Importer::STAGE_FINISHED,
                //     'compare' => '!='
                // )
            )
        ));

        if (empty($posts)) {
            return false;
        }

        return new self($posts[0]->ID);
    }

    private function __construct($post_id) {
        $this->post_id = $post_id;
    }

    /**
     * Gets the import session ID.
     *
     * @return int The post ID
     */
    public function get_id() {
        return $this->post_id;
    }

    public function get_metadata() {
        return [
            'data_source' => get_post_meta($this->post_id, 'data_source', true),
            'source_url' => get_post_meta($this->post_id, 'source_url', true),
            'attachment_id' => get_post_meta($this->post_id, 'attachment_id', true),
        ];
    }

    /**
     * Gets the current progress information.
     *
     * @return array The progress data
     */
    public function count_imported_entities() {
        $progress = array();
        foreach(self::PROGRESS_ENTITIES as $entity) {
            $progress[$entity] = (int) get_post_meta($this->post_id, 'imported_' . $entity, true);
        }
        return $progress;
    }
    /**
     * Cache of imported entity counts to avoid repeated database queries
     * @var array
     */
    private $cached_imported_counts = array();

    /**
     * Updates the progress information.
     *
     * @param array $newly_imported_entities The new progress data with keys: posts, comments, terms, attachments, users
     */
    public function bump_imported_entities_counts($newly_imported_entities) {
        foreach($newly_imported_entities as $field => $count) {
            if(!in_array($field, static::PROGRESS_ENTITIES)) {
                _doing_it_wrong(
                    __METHOD__,
                    'Cannot bump imported entities count for unknown entity type: ' . $field,
                    '1.0.0'
                );
                continue;
            }

            // Get current count from cache or database
            if (!isset($this->cached_imported_counts[$field])) {
                $this->cached_imported_counts[$field] = (int) get_post_meta($this->post_id, 'imported_' . $field, true);
            }

            // Add new count to total
            $new_count = $this->cached_imported_counts[$field] + $count;
            
            // Update database and cache
            update_post_meta($this->post_id, 'imported_' . $field, $new_count);
            $this->cached_imported_counts[$field] = $new_count;
            /*
            @TODO run an atomic query instead:
            $sql = $wpdb->prepare(
                "INSERT INTO {$wpdb->postmeta} (post_id, meta_key, meta_value) 
                VALUES (%d, %s, %d)
                ON DUPLICATE KEY UPDATE meta_value = meta_value + %d",
                $this->post_id,
                'imported_' . $field,
                $count,
                $count
            );
            $wpdb->query($sql);
            */
        }
    }

    public function get_total_number_of_entities() {
        $totals = array();
        foreach(static::PROGRESS_ENTITIES as $field) {
            $totals[$field] = (int) get_post_meta($this->post_id, 'total_' . $field, true);
        }
        return $totals;
    }
    /**
     * Sets the total number of entities to import for each type.
     *
     * @param array $totals The total number of entities for each type
     */
    private $cached_totals = array();

    public function bump_total_number_of_entities($newly_indexed_entities) {
        foreach($newly_indexed_entities as $field => $count) {
            if(!in_array($field, static::PROGRESS_ENTITIES)) {
                _doing_it_wrong(
                    __METHOD__,
                    'Cannot set total number of entities for unknown entity type: ' . $field,
                    '1.0.0'
                );
                continue;
            }

            // Get current total from cache or database
            if (!isset($this->cached_totals[$field])) {
                $this->cached_totals[$field] = (int) get_post_meta($this->post_id, 'total_' . $field, true);
            }

            // Add new count to total
            $new_total = $this->cached_totals[$field] + $count;
            
            // Update database and cache
            update_post_meta($this->post_id, 'total_' . $field, $new_total);
            $this->cached_totals[$field] = $new_total;
        }
    }

    /**
     * Saves an array of [$url => ['received' => $downloaded_bytes, 'total' => $total_bytes | null]]
     * of the currently fetched files. The list is ephemeral and changes as we stream the data. There
     * will never be more than $concurrency_limit files in the list at any given time.
     */
    public function bump_frontloading_progress($frontloading_progress, $events=[]) {
        update_post_meta($this->post_id, 'frontloading_progress', $frontloading_progress);

        $successes = 0;
        foreach($events as $event) {
            if($event->type === WP_Attachment_Downloader_Event::SUCCESS) {
                ++$successes;
            } else {
                // @TODO: Store error.
            }
        }
        if($successes > 0) {
            // @TODO: Consider not treating files as a special case.
            $this->bump_imported_entities_counts([
                'file' => $successes
            ]);
        }
    }

    public function get_frontloading_progress() {
        return get_post_meta($this->post_id, 'frontloading_progress', true) ?? array();
    }

    public function is_stage_completed($stage) {
        $current_stage = $this->get_stage();
        $stage_index = array_search($stage, WP_Stream_Importer::STAGES_IN_ORDER);
        $current_stage_index = array_search($current_stage, WP_Stream_Importer::STAGES_IN_ORDER);
        return $current_stage_index > $stage_index;
    }

    /**
     * Gets the current import stage.
     *
     * @return string The current stage
     */
    public function get_stage() {
        if(!isset($this->cached_stage)) {
            $this->cached_stage = get_post_meta($this->post_id, 'current_stage', true);
        }
        return $this->cached_stage;
    }

    /**
     * Updates the current import stage.
     *
     * @param string $stage The new stage
     */
    public function set_stage($stage) {
        update_post_meta($this->post_id, 'current_stage', $stage);
        $this->cached_stage = $stage;
    }

    /**
     * Gets the importer cursor for resuming imports.
     *
     * @return string|null The cursor data
     */
    public function get_reentrancy_cursor() {
        return get_post_meta($this->post_id, 'importer_cursor', true);
    }

    /**
     * Updates the importer cursor.
     *
     * @param string $cursor The new cursor data
     */
    public function set_reentrancy_cursor($cursor) {
        update_post_meta($this->post_id, 'importer_cursor', $cursor);
    }

}