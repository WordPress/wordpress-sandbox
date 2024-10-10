<?php

class PlaygroundCorsProxyTokenBucketConfig {
	public function __construct(
		public int $capacity,
		public int $fill_rate_per_minute,
	) {}
}

function playground_cors_proxy_get_token_bucket_config($remote_proxy_type) {
	// @TODO: Support custom HTTP header to select test bucket config.

	// NOTE: 2024-10-09: These are just guesses for reasonable bucket configs.
	// They are not based on any real-world data. Please adjust them as needed.
	switch ($remote_proxy_type) {
		case 'VPN':
		case 'TOR':
		case 'PUB':
		case 'WEB':
			return new PlaygroundCorsProxyTokenBucketConfig(
				capacity: 1000,
				fill_rate_per_minute: 100,
			);
		case 'SES':
			// If it's even possible to receive CORS proxy requests from
			// search engine bots, let's refuse them because they don't
			// need this service.
			return new PlaygroundCorsProxyTokenBucketConfig(
				capacity: 0,
				fill_rate_per_minute: 0,
			);
		default:
			return new PlaygroundCorsProxyTokenBucketConfig(
				capacity: 1000,
				fill_rate_per_minute: 50,
			);
	}
}

class PlaygroundCorsProxyTokenBucket {
	private $dbh = null;
	private $connected_to_db = false;

	public function __construct() {
		$this->dbh = mysqli_init();
		if ($this->dbh) {
			$this->connected_to_db = mysqli_real_connect(
				$this->dbh,
				DB_HOST,
				DB_USER,
				DB_PASSWORD,
				DB_NAME
			);
		}
	}

	public function dispose() {
		if ($this->dbh && $this->connected_to_db) {
			mysqli_close($this->dbh);
		}
	}

	public function obtain_token($remote_ip, $bucket_config) {
		if (!$this->connected_to_db) {
			return false;
		}

		$cleanup_query = <<<'SQL'
			DELETE FROM cors_proxy_rate_limiting
				WHERE updated_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
			SQL;
		if (mysqli_query($this->dbh, $cleanup_query) === false) {
			error_log(
				'Failed to clean up old token buckets: ' .
				mysqli_error($this->dbh)
			);
			return false;
		}

		// Abort if tokens are never available.
		if ($bucket_config->capacity <= 0) {
			return false;
		}

		$ipv6_remote_ip = $remote_ip;
		if (filter_var($remote_ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
			// Convert IPv4 to IPv6 mapped address for storage
			$ipv6_remote_ip = '::ffff:' . $remote_ip;
		}

		$token_query = <<<'SQL'
			INSERT INTO cors_proxy_rate_limiting (remote_addr, capacity, tokens)
				SELECT
					? as remote_addr,
					? AS capacity,
					capacity - 1 AS tokens,
					? AS fill_rate_per_minute
				WHERE capacity > 0
				ON DUPLICATE KEY UPDATE
					capacity = VALUES(capacity),
					tokens = MIN(
						VALUES(capacity),
						tokens + VALUES(fill_rate_per_minute) * TIMESTAMPDIFF(MINUTE, updated_at, NOW())
					) - 1
			SQL;
		
		$token_statement = mysqli_prepare($this->dbh, $token_query);
		mysqli_stmt_bind_param(
			$token_statement,
			'sii',
			$ipv6_remote_ip,
			$bucket_config->capacity,
			$bucket_config->fill_rate_per_minute
		);

		if (
			mysqli_stmt_execute($token_statement) &&
			mysqli_stmt_affected_rows($token_statement) > 0
		) {
			return true;
		}
		
		return false;
	}
}

function playground_cors_proxy_maybe_rate_limit() {
	// IP metadata from WP Cloud.
	$remote_proxy_type = $_SERVER['HTTP_X_IP_PROXY_TYPE'] ?? 'UNK';
	$bucket_config = playground_cors_proxy_get_token_bucket_config(
		$remote_proxy_type
	);

	// We cannot trust the X-Forwarded-For header everywhere,
	// but we are trusting WP Cloud to provide an accurate value for it.
	$remote_ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'];

	if (filter_var($remote_ip, FILTER_VALIDATE_IP) === false) {
		// Validate the IP address before using it as a key in the database.
		error_log('Invalid IP address: ' . var_export($remote_ip, true));
		return false;
	}
	
	$token_bucket = new PlaygroundCorsProxyTokenBucket();
	try {
		if (!$token_bucket->obtain_token($remote_ip, $bucket_config)) {
			http_response_code(429);
			echo "Rate limit exceeded";
			exit;
		}
	} finally {
		$token_bucket->dispose();
	}
}