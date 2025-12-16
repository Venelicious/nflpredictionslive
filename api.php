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
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Vary: Origin");
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");
}
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
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$path = str_replace("/api.php", "", $path);

// ----------------------------------------
// Helper: JSON Antwort
// ----------------------------------------
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fetchUserById($id, $conn)
{
    $stmt = $conn->prepare("SELECT id, name, email, favorite_team, role AS user_group FROM users WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    return $stmt->get_result()->fetch_assoc();
}

function getCurrentUser($conn)
{
    if (!isset($_SESSION["user_id"])) {
        return null;
    }

    return fetchUserById($_SESSION["user_id"], $conn);
}

function requireLogin($conn)
{
    $user = getCurrentUser($conn);
    if (!$user) {
        respond(["error" => "Nicht eingeloggt"], 401);
    }
    return $user;
}

function requireAdmin($conn)
{
    $user = requireLogin($conn);
    if (strtolower($user["user_group"] ?? "") !== "admin") {
        respond(["error" => "Nur Admins dürfen diese Aktion ausführen."], 403);
    }
    return $user;
}

// ----------------------------------------
// AUTH: /auth/register
// ----------------------------------------
if ($path === "/auth/register" && $_SERVER["REQUEST_METHOD"] === "POST") {

    global $conn, $input;

    if (!$input["email"] || !$input["password"] || !$input["name"] || !$input["password_confirmation"]) {
        respond(["error" => "Name, Email, Passwort und Passwortbestätigung sind erforderlich"], 400);
    }

    if ($input["password"] !== $input["password_confirmation"]) {
        respond(["error" => "Passwörter stimmen nicht überein"], 400);
    }

    // Prüfen ob Nutzer existiert
    $stmt = $conn->prepare("SELECT id, email, name FROM users WHERE email = ? OR name = ?");
    $stmt->bind_param("ss", $input["email"], $input["name"]);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows > 0) {
        $existing = $res->fetch_assoc();
        if ($existing["email"] === $input["email"]) {
            respond(["error" => "E-Mail ist bereits registriert"], 409);
        }
        if ($existing["name"] === $input["name"]) {
            respond(["error" => "Benutzername ist bereits vergeben"], 409);
        }
    }

    // Passwort hashen
    $hash = password_hash($input["password"], PASSWORD_BCRYPT);

    // Nutzer anlegen
    $stmt = $conn->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')");
    $stmt->bind_param("sss", $input["name"], $input["email"], $hash);
    $stmt->execute();

    $_SESSION["user_id"] = $stmt->insert_id;

    $user = fetchUserById($stmt->insert_id, $conn);

    respond([
        "success" => true,
        "user" => $user
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

    $stmt = $conn->prepare("SELECT id, name, email, password_hash, favorite_team, role AS user_group FROM users WHERE email = ?");
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

    unset($user["password_hash"]);

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

    $stmt = $conn->prepare("SELECT id, name, email, favorite_team, role AS user_group FROM users WHERE id = ?");
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

    $updatedUser = fetchUserById($userId, $conn);

    respond(["success" => true, "user" => $updatedUser]);
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
// USERS: /users (GET)
// ----------------------------------------
if ($path === "/users" && $_SERVER["REQUEST_METHOD"] === "GET") {

    requireLogin($conn);

    $season = $_GET['season'] ?? '';
    if (!$season) {
        $season = date("Y");
    }

    $stmt = $conn->prepare("SELECT u.id, u.name, u.email, u.favorite_team, u.role AS user_group,
      CASE WHEN COUNT(t.id) > 0 THEN 1 ELSE 0 END AS has_tip
      FROM users u
      LEFT JOIN tips t ON u.id = t.user_id AND t.season = ?
      GROUP BY u.id, u.name, u.email, u.favorite_team, u.role
      ORDER BY u.name ASC");
    $stmt->bind_param("s", $season);
    $stmt->execute();
    $result = $stmt->get_result();

    $users = [];
    while ($row = $result->fetch_assoc()) {
        $row['has_tip'] = (bool)$row['has_tip'];
        $users[] = $row;
    }

    respond(["users" => $users, "season" => $season]);
}


// ----------------------------------------
// USERS: /users/{id}/role (PUT)
// ----------------------------------------
if (preg_match('#^/users/(\d+)/role$#', $path, $matches) && $_SERVER["REQUEST_METHOD"] === "PUT") {

    $admin = requireAdmin($conn);
    $userId = intval($matches[1]);
    $newRole = strtolower(trim($input['role'] ?? ''));

    if (!in_array($newRole, ['admin', 'user'])) {
        respond(["error" => "Ungültige Rolle"], 422);
    }

    $targetUser = fetchUserById($userId, $conn);
    if (!$targetUser) {
        respond(["error" => "Benutzer nicht gefunden"], 404);
    }

    $stmt = $conn->prepare("UPDATE users SET role = ? WHERE id = ?");
    $stmt->bind_param("si", $newRole, $userId);
    $stmt->execute();

    $updated = fetchUserById($userId, $conn);

    respond(["success" => true, "user" => $updated]);
}


// ----------------------------------------
// Fallback
// ----------------------------------------
respond(["error" => "Route nicht gefunden"], 404);

?>
