<?php

$referrer = $_SERVER['HTTP_REFERER'];
$prNumber = null;

if (preg_match('/github\.com\/WordPress\/gutenberg\/pull\/(?<prNumber>\d+)/i', $referrer, $matches)) {
    $prNumber = $matches['prNumber'];
    header('Location: ./gutenberg.html?pr=' . $prNumber);
    exit;
} else if (preg_match('/github\.com\/WordPress\/wordpress-develop\/pull\/(?<prNumber>\d+)/i', $referrer, $matches)) {
    $prNumber = $matches['prNumber'];
    header('Location: ./wordpress.html?pr=' . $prNumber);
    exit;
} else {
    header('HTTP/1.1 403 Forbidden');
    echo 'Invalid referrer';
    exit;
}
