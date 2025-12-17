-- phpMyAdmin SQL Dump
-- version 4.9.11
-- https://www.phpmyadmin.net/
--
-- Host: database-5019178721.webspace-host.com
-- Erstellungszeit: 17. Dez 2025 um 06:44
-- Server-Version: 8.0.36
-- PHP-Version: 7.4.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Datenbank: `dbs15059918`
--
CREATE DATABASE IF NOT EXISTS `dbs15059918` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `dbs15059918`;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `games`
--

CREATE TABLE `games` (
  `id` int NOT NULL,
  `home_team` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `away_team` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `game_time` datetime DEFAULT NULL,
  `season` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `seasons`
--

CREATE TABLE `seasons` (
  `season` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `label` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `lock_date` datetime DEFAULT NULL,
  `completed` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Daten für Tabelle `seasons`
--

INSERT INTO `seasons` (`season`, `label`, `lock_date`, `completed`) VALUES
('2024', 'Saison 2024/2025 🔒', '2024-09-06 02:20:00', 1),
('2025', 'Saison 2025/2026', '2025-09-05 02:20:00', 0),
('2026', 'Saison 2026/2027', '2026-09-10 02:20:00', 0);

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `sessions`
--

CREATE TABLE `sessions` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `token_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `teams`
--

CREATE TABLE `teams` (
  `id` int NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `conference` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `division` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `league` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'NFL',
  `logo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Daten für Tabelle `teams`
--

INSERT INTO `teams` (`id`, `name`, `conference`, `division`, `league`, `logo_url`) VALUES
(1, 'Arizona Cardinals', 'NFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png'),
(2, 'Atlanta Falcons', 'NFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png'),
(3, 'Baltimore Ravens', 'AFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png'),
(4, 'Buffalo Bills', 'AFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png'),
(5, 'Carolina Panthers', 'NFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png'),
(6, 'Chicago Bears', 'NFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png'),
(7, 'Cincinnati Bengals', 'AFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png'),
(8, 'Cleveland Browns', 'AFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png'),
(9, 'Dallas Cowboys', 'NFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png'),
(10, 'Denver Broncos', 'AFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png'),
(11, 'Detroit Lions', 'NFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png'),
(12, 'Green Bay Packers', 'NFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png'),
(13, 'Houston Texans', 'AFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png'),
(14, 'Indianapolis Colts', 'AFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png'),
(15, 'Jacksonville Jaguars', 'AFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/jac.png'),
(16, 'Kansas City Chiefs', 'AFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png'),
(17, 'Las Vegas Raiders', 'AFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png'),
(18, 'Los Angeles Chargers', 'AFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png'),
(19, 'Los Angeles Rams', 'NFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png'),
(20, 'Miami Dolphins', 'AFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png'),
(21, 'Minnesota Vikings', 'NFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png'),
(22, 'New England Patriots', 'AFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png'),
(23, 'New Orleans Saints', 'NFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png'),
(24, 'New York Giants', 'NFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png'),
(25, 'New York Jets', 'AFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png'),
(26, 'Philadelphia Eagles', 'NFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png'),
(27, 'Pittsburgh Steelers', 'AFC', 'North', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png'),
(28, 'San Francisco 49ers', 'NFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'),
(29, 'Seattle Seahawks', 'NFC', 'West', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png'),
(30, 'Tampa Bay Buccaneers', 'NFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png'),
(31, 'Tennessee Titans', 'AFC', 'South', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png'),
(32, 'Washington Commanders', 'NFC', 'East', 'NFL', 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `tips`
--

CREATE TABLE `tips` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `season` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `game_id` int DEFAULT NULL,
  `predicted_winner` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `payload` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Daten für Tabelle `tips`
--

INSERT INTO `tips` (`id`, `user_id`, `season`, `game_id`, `predicted_winner`, `payload`, `created_at`) VALUES
(88, 2, '2025', NULL, NULL, '{\"Buffalo Bills\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Chicago Bears\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Detroit Lions\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"New York Jets\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"Dallas Cowboys\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Denver Broncos\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Houston Texans\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Miami Dolphins\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Atlanta Falcons\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"New York Giants\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Baltimore Ravens\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Cleveland Browns\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Los Angeles Rams\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Seattle Seahawks\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"Tennessee Titans\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"Arizona Cardinals\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Carolina Panthers\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Green Bay Packers\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Las Vegas Raiders\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Minnesota Vikings\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"Cincinnati Bengals\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Indianapolis Colts\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Kansas City Chiefs\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"New Orleans Saints\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Philadelphia Eagles\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Pittsburgh Steelers\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"San Francisco 49ers\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Jacksonville Jaguars\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Los Angeles Chargers\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"New England Patriots\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Tampa Bay Buccaneers\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"Washington Commanders\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}}', '2025-12-11 02:40:03'),
(136, 3, '2025', NULL, NULL, '{\"Buffalo Bills\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"Chicago Bears\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 1}, \"Detroit Lions\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 2}, \"New York Jets\": {\"wins\": 0, \"losses\": 17, \"divisionRank\": 4}, \"Dallas Cowboys\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 1}, \"Denver Broncos\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 1}, \"Houston Texans\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 1}, \"Miami Dolphins\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 2}, \"Atlanta Falcons\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 1}, \"New York Giants\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 2}, \"Baltimore Ravens\": {\"wins\": 0, \"losses\": 10, \"divisionRank\": 2}, \"Cleveland Browns\": {\"wins\": 10, \"losses\": 7, \"divisionRank\": 4}, \"Los Angeles Rams\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 2}, \"Seattle Seahawks\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 4}, \"Tennessee Titans\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 4}, \"Arizona Cardinals\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 1}, \"Carolina Panthers\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 2}, \"Green Bay Packers\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 3}, \"Las Vegas Raiders\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 3}, \"Minnesota Vikings\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 4}, \"Cincinnati Bengals\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Indianapolis Colts\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 2}, \"Kansas City Chiefs\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 2}, \"New Orleans Saints\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 3}, \"Philadelphia Eagles\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 3}, \"Pittsburgh Steelers\": {\"wins\": 17, \"losses\": 0, \"divisionRank\": 1}, \"San Francisco 49ers\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 3}, \"Jacksonville Jaguars\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 3}, \"Los Angeles Chargers\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 4}, \"New England Patriots\": {\"wins\": 7, \"losses\": 10, \"divisionRank\": 3}, \"Tampa Bay Buccaneers\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 4}, \"Washington Commanders\": {\"wins\": 0, \"losses\": 0, \"divisionRank\": 4}}', '2025-12-17 02:52:52');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `role` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'user',
  `favorite_team` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Daten für Tabelle `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `favorite_team`, `created_at`) VALUES
(2, 'Venelicious', 'bastian.hamm@live.de', '$2y$12$1h/fad5ysSFKujtawK81IOwAeD9nwNu.m0dAxzSLcHgUm6Hel/PTS', 'admin', 'New Orleans Saints', '2025-12-11 00:02:22'),
(3, 'Test-Dummy', 'test@dummy.de', '$2y$12$ipVyT7ELFSdJ5UWOBssQmOEJoQY8mFMrMUKD/88USObVK6yvu/tMe', 'user', 'Buffalo Bills', '2025-12-17 02:45:03');

--
-- Indizes der exportierten Tabellen
--

--
-- Indizes für die Tabelle `games`
--
ALTER TABLE `games`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `seasons`
--
ALTER TABLE `seasons`
  ADD PRIMARY KEY (`season`);

--
-- Indizes für die Tabelle `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_token` (`token_hash`),
  ADD KEY `fk_sessions_user` (`user_id`);

--
-- Indizes für die Tabelle `teams`
--
ALTER TABLE `teams`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_team_name` (`name`);

--
-- Indizes für die Tabelle `tips`
--
ALTER TABLE `tips`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_season` (`user_id`,`season`),
  ADD KEY `fk_tips_game` (`game_id`);

--
-- Indizes für die Tabelle `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT für exportierte Tabellen
--

--
-- AUTO_INCREMENT für Tabelle `games`
--
ALTER TABLE `games`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `sessions`
--
ALTER TABLE `sessions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `teams`
--
ALTER TABLE `teams`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=33;

--
-- AUTO_INCREMENT für Tabelle `tips`
--
ALTER TABLE `tips`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=137;

--
-- AUTO_INCREMENT für Tabelle `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints der exportierten Tabellen
--

--
-- Constraints der Tabelle `sessions`
--
ALTER TABLE `sessions`
  ADD CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints der Tabelle `tips`
--
ALTER TABLE `tips`
  ADD CONSTRAINT `fk_tips_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_tips_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
