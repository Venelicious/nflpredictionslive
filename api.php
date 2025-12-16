<?php
// ----------------------------------------
// Fehler anzeigen (Strato versteckt sonst alles)
// ----------------------------------------
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// ----------------------------------------
// CORS + JSON Header
// ----------------------------------------
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// ----------------------------------------
// DB Verbindung
// ----------------------------------------
$DB_HOST = "database-5019178721.webspace-host.com";
$DB_USER = "dbu5771551";
$DB_PASS = "Wosini16.10.10!";
$DB_NAME = "dbs15059918";

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "Datenbankfehler: " . $conn->connect_error]);
    exit;
}

// ----------------------------------------
// JSON Body einlesen
// ----------------------------------------
$input = json_decode(file_get_contents("php://input"), true);

// ----------------------------------------
// Session starten
// ----------------------------------------
session_start();

// ----------------------------------------
// Routing
// ----------------------------------------
$path = $_SERVER["REQUEST_URI"];
$path = str_replace("/api.php", "", $path);

// ----------------------------------------
// Helper: JSON Antwort
// ----------------------------------------
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// ----------------------------------------
// AUTH: /auth/register
// ----------------------------------------
if ($path === "/auth/register" && $_SERVER["REQUEST_METHOD"] === "POST") {

    global $conn, $input;

    if (!$input["email"] || !$input["password"] || !$input["name"]) {
        respond(["error" => "Name, Email und Passwort sind erforderlich"], 400);
    }

    // Prüfen ob Nutzer existiert
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $input["email"]);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows > 0) {
        respond(["error" => "E-Mail ist bereits registriert"], 409);
    }

    // Passwort hashen
    $hash = password_hash($input["password"], PASSWORD_BCRYPT);

    // Nutzer anlegen
    $stmt = $conn->prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)");
    $stmt->bind_param("sss", $input["name"], $input["email"], $hash);
    $stmt->execute();

    $_SESSION["user_id"] = $stmt->insert_id;

    respond([
        "success" => true,
        "user" => [
            "id" => $stmt->insert_id,
            "name" => $input["name"],
            "email" => $input["email"]
        ]
    ]);
}


// ----------------------------------------
// AUTH: /auth/login
// ----------------------------------------
if ($path === "/auth/login" && $_SERVER["REQUEST_METHOD"] === "POST") {

    global $conn, $input;

    if (!$input["email"] || !$input["password"]) {
        respond(["error" => "E-Mail und Passwort sind erforderlich"], 400);
    }

    $stmt = $conn->prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?");
    $stmt->bind_param("s", $input["email"]);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows === 0) {
        respond(["error" => "Anmeldung fehlgeschlagen"], 401);
    }

    $user = $res->fetch_assoc();

    if (!password_verify($input["password"], $user["password_hash"])) {
        respond(["error" => "Anmeldung fehlgeschlagen"], 401);
    }

    $_SESSION["user_id"] = $user["id"];

    respond(["success" => true, "user" => $user]);
}


// ----------------------------------------
// AUTH: /auth/me
// ----------------------------------------
if ($path === "/auth/me") {

    if (!isset($_SESSION["user_id"])) {
        respond(["error" => "Nicht eingeloggt"], 401);
    }

    $id = $_SESSION["user_id"];

    $stmt = $conn->prepare("SELECT id, name, email, favorite_team FROM users WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();

    $res = $stmt->get_result()->fetch_assoc();

    respond(["user" => $res]);
}


// ----------------------------------------
// AUTH: /auth/logout
// ----------------------------------------
if ($path === "/auth/logout") {
    session_destroy();
    respond(["success" => true]);
}


// ----------------------------------------
// PROFILE UPDATE
// ----------------------------------------
if ($path === "/auth/profile" && $_SERVER["REQUEST_METHOD"] === "PUT") {
    global $conn, $input;

    if (!isset($_SESSION["user_id"])) {
        respond(["error" => "Nicht eingeloggt"], 401);
    }

    $userId = $_SESSION["user_id"];
    $name = $input["name"];
    $fav = $input["favorite_team"];

    $stmt = $conn->prepare("UPDATE users SET name = ?, favorite_team = ? WHERE id = ?");
    $stmt->bind_param("ssi", $name, $fav, $userId);
    $stmt->execute();

    respond(["success" => true]);
}


// ----------------------------------------
// TIPPS: /tips (GET)
// ----------------------------------------
if ($path === "/tips" && $_SERVER["REQUEST_METHOD"] === "GET") {

    if (!isset($_SESSION["user_id"])) {
        respond(["tips" => []]);
    }

    $uid = $_SESSION["user_id"];

    $res = $conn->query("SELECT season, payload FROM tips WHERE user_id = $uid");

    $tips = [];
    while ($row = $res->fetch_assoc()) {
        $row["payload"] = json_decode($row["payload"], true);
        $tips[] = $row;
    }

    respond(["tips" => $tips]);
}


// ----------------------------------------
// TIPPS: /tips (POST)
// ----------------------------------------
if ($path === "/tips" && $_SERVER["REQUEST_METHOD"] === "POST") {

    if (!isset($_SESSION["user_id"])) {
        respond(["error" => "Nicht eingeloggt"], 401);
    }

    $uid = $_SESSION["user_id"];
    $season = $input["season"];
    $payload = json_encode($input["payload"], JSON_UNESCAPED_UNICODE);

    // REPLACE = bereits vorhandenen Eintrag überschreiben
    $stmt = $conn->prepare("REPLACE INTO tips (user_id, season, payload) VALUES (?, ?, ?)");
    $stmt->bind_param("iss", $uid, $season, $payload);
    $stmt->execute();

    respond(["success" => true]);
}


// ----------------------------------------
// Fallback
// ----------------------------------------
respond(["error" => "Route nicht gefunden"], 404);

?>
