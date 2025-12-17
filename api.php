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
$isSecure = (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') || ($_SERVER['SERVER_PORT'] ?? null) === 443;
$defaultOrigin = isset($_SERVER['HTTP_HOST'])
    ? sprintf('%s://%s', $isSecure ? 'https' : 'http', $_SERVER['HTTP_HOST'])
    : '*';

$allowedOrigin = $origin ?: $defaultOrigin;
header("Access-Control-Allow-Origin: " . $allowedOrigin);
header("Vary: Origin");
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
$cookieOptions = [
    'lifetime' => 0,
    'path' => '/',
    'domain' => $_SERVER['HTTP_HOST'] ?? '',
    'secure' => $isSecure,
    'httponly' => true,
    'samesite' => $isSecure ? 'None' : 'Lax',
];
session_set_cookie_params($cookieOptions);
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

function parseRosterSource($value)
{
    $clean = trim((string)$value);
    if ($clean === '') {
        return [null, null];
    }

    if (preg_match('#/roster/(\d+)(?:/(\d+))?#', $clean, $matches)) {
        $leagueId = $matches[1] ?? null;
        $rosterId = $matches[2] ?? $leagueId;
        return [$rosterId, $leagueId];
    }

    if (preg_match('/^(\d{3,})$/', $clean, $matches)) {
        return [$matches[1], null];
    }

    if (preg_match('/(\d{3,})/', $clean, $matches)) {
        return [$matches[1], null];
    }

    return [null, null];
}

function httpGetJson($url)
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($response === false || $status >= 400) {
        return null;
    }

    $decoded = json_decode($response, true);
    return is_array($decoded) ? $decoded : null;
}

function fetchSleeperRoster($rosterId, $leagueId = null)
{
    if ($leagueId) {
        $leagueRosters = httpGetJson("https://api.sleeper.app/v1/league/{$leagueId}/rosters");
        if (!is_array($leagueRosters)) {
            return [null, "Roster konnte nicht aus der Liga geladen werden."];
        }

        if ($rosterId) {
            foreach ($leagueRosters as $entry) {
                if ((string)($entry['roster_id'] ?? '') === (string)$rosterId) {
                    return [$entry, null];
                }
            }
            return [null, "Roster-ID wurde in der Liga nicht gefunden."];
        }

        return [$leagueRosters[0] ?? null, null];
    }

    if (!$rosterId) {
        return [null, "Keine gültige Roster-ID angegeben."];
    }

    $roster = httpGetJson("https://api.sleeper.app/v1/roster/{$rosterId}");
    if (!$roster) {
        return [null, "Roster konnte nicht geladen werden."];
    }

    return [$roster, null];
}

function fetchSleeperPlayers()
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $data = httpGetJson("https://api.sleeper.app/v1/players/nfl");
    $cache = is_array($data) ? $data : [];
    return $cache;
}

function fetchCurrentNflWeek()
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $state = httpGetJson("https://api.sleeper.app/v1/state/nfl");
    $week = (int)($state['week'] ?? 0);
    $cached = $week > 0 ? $week : null;

    return $cached;
}

function fetchSleeperProjections($week = null)
{
    static $cache = [];

    $weekKey = $week ?: 'current';
    if (array_key_exists($weekKey, $cache)) {
        return $cache[$weekKey];
    }

    if ($week === null) {
        $week = fetchCurrentNflWeek();
    }

    $params = [
        'season_type' => 'regular',
    ];

    if ($week) {
        $params['week'] = $week;
    }

    $query = http_build_query($params);
    $url = "https://api.sleeper.app/v1/players/nfl/projections" . ($query ? "?{$query}" : '');

    $data = httpGetJson($url);
    $cache[$weekKey] = is_array($data) ? $data : [];

    return $cache[$weekKey];
}

function calculateProjectionFantasyPoints(array $projection, string $position)
{
    $stats = $projection['stats'] ?? [];
    $pts = 0.0;

    switch (strtoupper($position)) {
        case 'QB':
            $pts += ($stats['pass_yd'] ?? 0) / 25;
            $pts += ($stats['pass_td'] ?? 0) * 4;
            $pts -= ($stats['pass_int'] ?? 0) * 2;
            $pts += ($stats['rush_yd'] ?? 0) / 10;
            $pts += ($stats['rush_td'] ?? 0) * 6;
            $pts -= ($stats['fumbles_lost'] ?? 0) * 2;
            break;
        case 'RB':
        case 'WR':
        case 'TE':
            $pts += ($stats['rush_yd'] ?? 0) / 10;
            $pts += ($stats['rush_td'] ?? 0) * 6;
            $pts += ($stats['rec'] ?? 0) * 0.5;
            $pts += ($stats['rec_yd'] ?? 0) / 10;
            $pts += ($stats['rec_td'] ?? 0) * 6;
            $pts -= ($stats['fumbles_lost'] ?? 0) * 2;
            break;
        case 'K':
            $fgm = ($stats['fgm'] ?? 0)
                + ($stats['fgm_0_19'] ?? 0)
                + ($stats['fgm_20_29'] ?? 0)
                + ($stats['fgm_30_39'] ?? 0)
                + ($stats['fgm_40_49'] ?? 0)
                + ($stats['fgm_50p'] ?? 0);
            $pts += $fgm * 3;
            $pts += ($stats['xpm'] ?? 0) * 1;
            break;
        case 'DEF':
            $pts += ($stats['def_st_td'] ?? 0) * 6; // defensive/special teams TDs
            $pts += ($stats['int'] ?? 0) * 2;
            $pts += ($stats['fum_rec'] ?? 0) * 2;
            $pts += ($stats['sack'] ?? 0) * 1;
            $pts += ($stats['safety'] ?? 0) * 2;
            $pointsAllowed = $stats['pts_allowed'] ?? null;
            if ($pointsAllowed !== null) {
                if ($pointsAllowed === 0) {
                    $pts += 5;
                } elseif ($pointsAllowed <= 6) {
                    $pts += 4;
                } elseif ($pointsAllowed <= 13) {
                    $pts += 3;
                } elseif ($pointsAllowed <= 20) {
                    $pts += 1;
                } elseif ($pointsAllowed >= 35) {
                    $pts -= 3;
                }
            }
            break;
        default:
            $pts += ($stats['pts_ppr'] ?? $stats['pts_std'] ?? 0);
            break;
    }

    return round($pts, 2);
}

function buildProjectionLookup($week = null)
{
    static $cache = [];
    $weekKey = $week ?: 'current';
    if (array_key_exists($weekKey, $cache)) {
        return $cache[$weekKey];
    }

    $projections = fetchSleeperProjections($week);
    $byPlayer = [];
    $positionScores = [];

    foreach ($projections as $playerId => $projection) {
        $position = strtoupper($projection['position'] ?? ($projection['fantasy_positions'][0] ?? ''));
        $score = calculateProjectionFantasyPoints($projection, $position);

        $byPlayer[(string)$playerId] = [
            'position' => $position,
            'score' => $score,
            'projection' => $projection,
        ];

        if (!isset($positionScores[$position])) {
            $positionScores[$position] = [];
        }
        $positionScores[$position][] = $score;
    }

    // Sort scores for percentile lookup
    foreach ($positionScores as $pos => $scores) {
        sort($scores);
        $positionScores[$pos] = $scores;
    }

    $cache[$weekKey] = [
        'by_player' => $byPlayer,
        'position_scores' => $positionScores,
    ];

    return $cache[$weekKey];
}

function percentileRank(array $sortedScores, float $value)
{
    if (!count($sortedScores)) {
        return null;
    }

    $count = count($sortedScores);
    $index = 0;
    foreach ($sortedScores as $i => $score) {
        if ($score <= $value) {
            $index = $i + 1;
        } else {
            break;
        }
    }

    return $index / $count;
}

function normalizePlayerEntry($playerId, $playerData)
{
    $fullName = $playerData['full_name'] ?? trim(($playerData['first_name'] ?? '') . ' ' . ($playerData['last_name'] ?? ''));
    $positions = $playerData['fantasy_positions'] ?? [];
    $primaryPosition = $playerData['position'] ?? ($positions[0] ?? '');

    return [
        'id' => (string)$playerId,
        'name' => $fullName ?: "Unbekannter Spieler {$playerId}",
        'team' => $playerData['team'] ?? ($playerData['last_team'] ?? null),
        'position' => $primaryPosition,
        'fantasy_positions' => $positions,
        'status' => $playerData['status'] ?? null,
        'injury_status' => $playerData['injury_status'] ?? null,
        'bye_week' => $playerData['bye_week'] ?? null,
        'age' => $playerData['age'] ?? null,
    ];
}

function resolveRosterPlayers($roster, $leagueId = null)
{
    $playerIds = $roster['players'] ?? [];
    if (!is_array($playerIds) || !count($playerIds)) {
        return [];
    }

    $playerMap = fetchSleeperPlayers();

    return array_map(function ($pid) use ($playerMap) {
        $meta = $playerMap[$pid] ?? [];
        return normalizePlayerEntry($pid, $meta);
    }, $playerIds);
}

function scorePlayer($player)
{
    $base = [
        'QB' => 16,
        'RB' => 13,
        'WR' => 13,
        'TE' => 9,
        'K' => 8,
        'DEF' => 8,
    ];

    $position = strtoupper($player['position'] ?? '');
    $score = $base[$position] ?? 7;
    $reasons = ["Basis-Score für Position {$position}: {$score}"];

    $status = strtolower((string)($player['status'] ?? ''));
    if (in_array($status, ['out', 'inactive'])) {
        $score -= 6;
        $reasons[] = 'Status Out/Inactive (hoher Malus)';
    } elseif (in_array($status, ['questionable', 'doubtful'])) {
        $score -= 2;
        $reasons[] = 'Status fraglich';
    }

    $injury = strtolower((string)($player['injury_status'] ?? ''));
    if ($injury === 'ir') {
        $score -= 5;
        $reasons[] = 'Injured Reserve';
    } elseif (in_array($injury, ['questionable', 'doubtful'])) {
        $score -= 1.5;
        $reasons[] = 'Verletzungswarnung';
    }

    $age = $player['age'] ?? null;
    if ($age && $age < 25 && in_array($position, ['RB', 'WR', 'TE'])) {
        $score += 0.5;
        $reasons[] = 'Junger Skill-Player (leichter Bonus)';
    }

    $projectionLookup = buildProjectionLookup();
    $projectionData = $projectionLookup['by_player'][(string)$player['id']] ?? null;
    $currentWeek = fetchCurrentNflWeek();
    $projectionScore = null;
    $projectionPercentile = null;
    $averageScore = $score;

    if ($currentWeek && isset($player['bye_week']) && (int)$player['bye_week'] === (int)$currentWeek) {
        $score -= 8;
        $reasons[] = sprintf('Bye Week (%s) – starker Malus', $player['bye_week']);
    }

    if ($projectionData) {
        $projScore = $projectionData['score'];
        $projectionScore = round($projScore, 2);
        $positionScores = $projectionLookup['position_scores'][$position] ?? [];
        $percentile = percentileRank($positionScores, $projScore);
        if ($percentile !== null) {
            $projectionPercentile = round($percentile * 100, 1);
            $percentBonus = round(($percentile - 0.5) * 8, 2); // approximately -4 to +4
            $projectionWeight = round($projScore * 0.25, 2); // direkte Punkte aus Projection stärker gewichten

            $score += $percentBonus + $projectionWeight;

            $percentLabel = round($percentile * 100);
            $reasons[] = sprintf(
                'Projection-Score %.1f Punkte (%d. Perzentil, Bonus %.2f, gewichteter Zuschlag %.2f)',
                $projScore,
                $percentLabel,
                $percentBonus,
                $projectionWeight
            );
        }

        $averageScore = round(($score + $projectionScore) / 2, 2);
        $reasons[] = sprintf(
            'Durchschnitt aus Score (%.2f) und Sleeper-Projektion (%.2f): %.2f',
            $score,
            $projectionScore,
            $averageScore
        );
    } else {
        $score -= 2;
        $reasons[] = 'Keine Projection gefunden (leichter Malus)';
        $reasons[] = 'Durchschnitt entspricht aktuellem Score (keine Sleeper-Projektion verfügbar)';
    }

    $averageScore = round($averageScore, 2);

    return [
        'score' => round($score, 2),
        'reasons' => $reasons,
        'projection_score' => $projectionScore,
        'projection_percentile' => $projectionPercentile,
        'average_score' => $averageScore,
    ];
}

function buildRecommendation($players)
{
    $slots = [
        'QB' => 1,
        'RB' => 2,
        'WR' => 2,
        'TE' => 1,
        'FLEX' => 1,
        'K' => 1,
        'DEF' => 1,
    ];

    $scored = array_map(function ($player) {
        $eval = scorePlayer($player);
        return array_merge($player, [
            'score' => $eval['score'],
            'reasons' => $eval['reasons'],
            'projection_score' => $eval['projection_score'],
            'projection_percentile' => $eval['projection_percentile'],
            'average_score' => $eval['average_score'],
        ]);
    }, $players);

    usort($scored, function ($a, $b) {
        return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
    });

    $starters = [];
    $usedIds = [];

    foreach ($slots as $slot => $count) {
        if ($slot === 'FLEX') {
            $eligible = array_filter($scored, function ($player) use ($usedIds) {
                $pos = strtoupper($player['position'] ?? '');
                return !in_array($player['id'], $usedIds, true) && in_array($pos, ['RB', 'WR', 'TE']);
            });
        } else {
            $eligible = array_filter($scored, function ($player) use ($slot, $usedIds) {
                return !in_array($player['id'], $usedIds, true) && strtoupper($player['position'] ?? '') === $slot;
            });
        }

        $eligible = array_slice(array_values($eligible), 0, $count);
        foreach ($eligible as $player) {
            $player['slot'] = $slot;
            $starters[] = $player;
            $usedIds[] = $player['id'];
        }
    }

    $bench = array_values(array_filter($scored, function ($player) use ($usedIds) {
        return !in_array($player['id'], $usedIds, true);
    }));

    return [
        'starters' => $starters,
        'bench' => $bench,
    ];
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

function loadSeasons($conn)
{
    $result = $conn->query("SELECT season, label, lock_date, completed FROM seasons ORDER BY season ASC");
    if (!$result) {
        respond(["error" => "Seasons konnten nicht geladen werden."], 500);
    }

    $seasons = [];
    while ($row = $result->fetch_assoc()) {
        $lockDate = $row["lock_date"];
        $isoLockDate = null;
        if ($lockDate) {
            try {
                $dt = new DateTime($lockDate);
                $isoLockDate = $dt->format(DateTime::ATOM);
            } catch (Exception $e) {
                $isoLockDate = $lockDate;
            }
        }

        $seasons[] = [
            "season" => $row["season"],
            "label" => $row["label"],
            "lock_date" => $isoLockDate,
            "completed" => (bool)($row["completed"] ?? false),
        ];
    }

    return $seasons;
}

function loadTeams($conn)
{
    $result = $conn->query("SELECT id, name, conference, division, league, logo_url FROM teams ORDER BY conference, division, name ASC");
    if (!$result) {
        respond(["error" => "Teams konnten nicht geladen werden."], 500);
    }

    $teams = [];
    while ($row = $result->fetch_assoc()) {
        $teams[] = $row;
    }

    return $teams;
}

function resolveRosterParams()
{
    $raw = $_GET['roster'] ?? ($_GET['roster_url'] ?? '');
    [$rosterId, $leagueId] = parseRosterSource($raw);

    if (!$rosterId && isset($_SESSION['sleeper_roster_id'])) {
        $rosterId = $_SESSION['sleeper_roster_id'];
        $leagueId = $_SESSION['sleeper_league_id'] ?? null;
    }

    return [$rosterId, $leagueId, $raw];
}

// ----------------------------------------
// LINEUP: Sleeper Roster speichern/lesen
// ----------------------------------------
if ($path === "/lineup/source" && $_SERVER["REQUEST_METHOD"] === "GET") {
    respond([
        "roster_id" => $_SESSION['sleeper_roster_id'] ?? null,
        "league_id" => $_SESSION['sleeper_league_id'] ?? null,
    ]);
}

if ($path === "/lineup/source" && $_SERVER["REQUEST_METHOD"] === "POST") {
    $raw = $input['roster'] ?? ($input['roster_url'] ?? '');
    [$rosterId, $leagueId] = parseRosterSource($raw);

    if (!$rosterId) {
        respond(["error" => "Bitte eine gültige Sleeper-Roster-URL oder ID angeben."], 400);
    }

    $remember = !isset($input['remember']) || (bool)$input['remember'];
    if ($remember) {
        $_SESSION['sleeper_roster_id'] = $rosterId;
        if ($leagueId) {
            $_SESSION['sleeper_league_id'] = $leagueId;
        }
    }

    respond([
        "success" => true,
        "roster_id" => $rosterId,
        "league_id" => $leagueId,
        "remembered" => $remember,
    ]);
}

// ----------------------------------------
// LINEUP: Roster abrufen
// ----------------------------------------
if ($path === "/lineup/roster" && $_SERVER["REQUEST_METHOD"] === "GET") {
    [$rosterId, $leagueId, $raw] = resolveRosterParams();
    if (!$rosterId) {
        respond(["error" => "Keine Roster-ID gefunden. Bitte URL/ID angeben oder speichern."], 400);
    }

    [$roster, $err] = fetchSleeperRoster($rosterId, $leagueId);
    if ($err || !$roster) {
        respond(["error" => $err ?: "Roster konnte nicht geladen werden."], 502);
    }

    $players = resolveRosterPlayers($roster, $leagueId);

    respond([
        "roster_id" => $rosterId,
        "league_id" => $leagueId,
        "source" => $raw,
        "players" => $players,
    ]);
}

// ----------------------------------------
// LINEUP: Empfehlungen
// ----------------------------------------
if ($path === "/lineup/recommendations" && $_SERVER["REQUEST_METHOD"] === "GET") {
    [$rosterId, $leagueId, $raw] = resolveRosterParams();
    if (!$rosterId) {
        respond(["error" => "Keine Roster-ID gefunden. Bitte URL/ID angeben oder speichern."], 400);
    }

    [$roster, $err] = fetchSleeperRoster($rosterId, $leagueId);
    if ($err || !$roster) {
        respond(["error" => $err ?: "Roster konnte nicht geladen werden."], 502);
    }

    $players = resolveRosterPlayers($roster, $leagueId);
    $lineup = buildRecommendation($players);

    respond([
        "roster_id" => $rosterId,
        "league_id" => $leagueId,
        "source" => $raw,
        "players" => $players,
        "starters" => $lineup['starters'],
        "bench" => $lineup['bench'],
    ]);
}

// ----------------------------------------
// AUTH: /auth/register
// ----------------------------------------
if ($path === "/metadata" && $_SERVER["REQUEST_METHOD"] === "GET") {
    $seasons = loadSeasons($conn);
    $teams = loadTeams($conn);
    respond(["seasons" => $seasons, "teams" => $teams]);
}

if ($path === "/metadata/seasons" && $_SERVER["REQUEST_METHOD"] === "POST") {
    requireAdmin($conn);

    $season = trim($input["season"] ?? "");
    $label = trim($input["label"] ?? "");
    $lockDate = $input["lock_date"] ?? null;
    $completed = isset($input["completed"]) ? (int) !!$input["completed"] : 0;

    if (!$season || !$label) {
        respond(["error" => "season und label sind erforderlich."], 400);
    }

    $lockDateValue = null;
    if ($lockDate) {
        try {
            $dt = new DateTime($lockDate);
            $lockDateValue = $dt->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            respond(["error" => "Ungültiges Datumsformat."], 400);
        }
    }

    $stmt = $conn->prepare("INSERT INTO seasons (season, label, lock_date, completed) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("sssi", $season, $label, $lockDateValue, $completed);

    if (!$stmt->execute()) {
        if ($stmt->errno === 1062) {
            respond(["error" => "Die Saison existiert bereits."], 409);
        }
        respond(["error" => "Saison konnte nicht gespeichert werden."], 500);
    }

    $response = [
        "season" => $season,
        "label" => $label,
        "lock_date" => $lockDateValue ? (new DateTime($lockDateValue))->format(DateTime::ATOM) : null,
        "completed" => (bool)$completed,
    ];

    respond(["success" => true, "season" => $response], 201);
}

if (preg_match('/^\/metadata\/seasons\/([^\/]+)$/', $path, $matches) && $_SERVER["REQUEST_METHOD"] === "PUT") {
    requireAdmin($conn);

    $season = $matches[1];
    $checkStmt = $conn->prepare("SELECT season FROM seasons WHERE season = ?");
    $checkStmt->bind_param("s", $season);
    $checkStmt->execute();
    $exists = $checkStmt->get_result()->num_rows > 0;

    if (!$exists) {
        respond(["error" => "Saison wurde nicht gefunden."], 404);
    }

    $fields = [];
    $params = [];
    $types = '';

    if (array_key_exists("label", $input)) {
        $fields[] = "label = ?";
        $params[] = $input["label"];
        $types .= 's';
    }

    if (array_key_exists("lock_date", $input)) {
        $lockDateValue = null;
        $lockDate = $input["lock_date"];
        if ($lockDate) {
            try {
                $dt = new DateTime($lockDate);
                $lockDateValue = $dt->format('Y-m-d H:i:s');
            } catch (Exception $e) {
                respond(["error" => "Ungültiges Datumsformat."], 400);
            }
        }
        $fields[] = "lock_date = ?";
        $params[] = $lockDateValue;
        $types .= 's';
    }

    if (array_key_exists("completed", $input)) {
        $fields[] = "completed = ?";
        $params[] = (int) !!$input["completed"];
        $types .= 'i';
    }

    if (!$fields) {
        respond(["error" => "Es wurden keine Felder zum Aktualisieren übergeben."], 400);
    }

    $params[] = $season;
    $types .= 's';

    $query = "UPDATE seasons SET " . implode(', ', $fields) . " WHERE season = ?";
    $stmt = $conn->prepare($query);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();

    respond(["success" => true]);
}

if (preg_match('/^\/metadata\/seasons\/([^\/]+)\/lock-date$/', $path, $matches) && $_SERVER["REQUEST_METHOD"] === "PUT") {
    requireAdmin($conn);

    $season = $matches[1];
    $lockDate = $input["lock_date"] ?? null;
    if (!$lockDate) {
        respond(["error" => "lock_date ist erforderlich."], 400);
    }

    try {
        $dt = new DateTime($lockDate);
        $lockDate = $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        respond(["error" => "Ungültiges Datumsformat."], 400);
    }

    $stmt = $conn->prepare("UPDATE seasons SET lock_date = ? WHERE season = ?");
    $stmt->bind_param("ss", $lockDate, $season);
    $stmt->execute();

    if ($stmt->affected_rows === 0) {
        respond(["error" => "Saison wurde nicht gefunden."], 404);
    }

    respond(["success" => true, "lock_date" => $dt->format(DateTime::ATOM)]);
}

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

    $seasonFilter = $_GET['season'] ?? null;

    if ($seasonFilter) {
        $stmt = $conn->prepare("SELECT t.user_id, t.season, t.payload, u.name, u.email, u.favorite_team, u.role AS user_group FROM tips t LEFT JOIN users u ON u.id = t.user_id WHERE t.season = ? ORDER BY u.name ASC");
        $stmt->bind_param("s", $seasonFilter);
        $stmt->execute();
        $result = $stmt->get_result();

        $tips = [];
        while ($row = $result->fetch_assoc()) {
            $tips[] = [
                "user_id" => (int) $row["user_id"],
                "season" => $row["season"],
                "payload" => json_decode($row["payload"], true),
                "user_name" => $row["name"] ?? null,
                "user_email" => $row["email"] ?? null,
                "favorite_team" => $row["favorite_team"] ?? null,
                "user_group" => $row["user_group"] ?? null,
            ];
        }

        respond(["tips" => $tips]);
    }

    if (!isset($_SESSION["user_id"])) {
        respond(["tips" => []]);
    }

    $uid = $_SESSION["user_id"];

    $res = $conn->prepare("SELECT season, payload FROM tips WHERE user_id = ?");
    $res->bind_param("i", $uid);
    $res->execute();
    $result = $res->get_result();

    $tips = [];
    while ($row = $result->fetch_assoc()) {
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

    // Bestehenden Eintrag (pro Season) aktualisieren statt neue Zeilen anzulegen
    $stmt = $conn->prepare("INSERT INTO tips (user_id, season, payload) VALUES (?, ?, ?)\n        ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP");
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
      CASE WHEN COUNT(t.id) > 0 THEN 1 ELSE 0 END AS has_tip, t.payload AS tip_payload
      FROM users u
      LEFT JOIN tips t ON u.id = t.user_id AND t.season = ?
      GROUP BY u.id, u.name, u.email, u.favorite_team, u.role, t.payload
      ORDER BY u.name ASC");
    $stmt->bind_param("s", $season);
    $stmt->execute();
    $result = $stmt->get_result();

    $users = [];
    while ($row = $result->fetch_assoc()) {
        $row['has_tip'] = (bool)$row['has_tip'];
        $row['tip_payload'] = $row['tip_payload'] ? json_decode($row['tip_payload'], true) : null;
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
