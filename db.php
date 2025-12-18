<?php
$host = "database-5019178721.webspace-host.com";
$db   = "dbs15059918";
$user = "dbu5771551";
$pass = "Wosini16.10.10!";

$dsn = "mysql:host=$host;dbname=$db;charset=utf8mb4";

$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (Exception $e) {
    die(json_encode(["error" => "DB Error: " . $e->getMessage()]));
}
