# Python lineup scoring with `nflreadpy`

Dieser Ordner enthält einen schlanken Vorschlag, wie das Lineup-Scoring aus `api.php` auf Python umgezogen werden kann, während
die für Euch relevanten nflverse-Endpunkte genutzt werden:

- `load_ff_playerids` – Identifier-Mapping für Fantasy-Player (ffid/gsis/sportradar …).
- `load_ff_rankings` – wöchentliche Fantasy-Rankings/Projections.
- `load_ff_opportunity` – Opportunity-Daten (Snaps, Routes, Targets, Carries) zur Kontext-Anreicherung.

## Inhalte

- `requirements.txt` – fixiert `nflreadpy==0.3.3` und `polars`.
- `scoring.py` – Abbild der PHP-Scoring-Logik (`calculateProjectionFantasyPoints`).
- `data_loader.py` – Helper, um die genannten nflverse-Funktionen aufzurufen und die Scoring-Funktion auf die geladenen Rankings
 anzuwenden. Enthält auch ein Mapping auf `sleeper_id`, damit das bestehende PHP-Frontend die Projektionen direkt den Roster-IDs
 zuordnen kann.
- `export_lineup.py` – kleines CLI, das die aufbereiteten Projektionen als JSON an `stdout` schreibt.

## Schnelleinstieg

1. Abhängigkeiten installieren (am besten in einem virtuellen Env):

   ```bash
   pip install -r python_service/requirements.txt
   ```

2. Rankings mit Fantasy-Punkten für eine Saison/Woche berechnen (z. B. Regular Season 2024, Week 1):

   ```bash
   python - <<'PY'
   from python_service.data_loader import summarize_lineup_projection

   df = summarize_lineup_projection(season=2024, week=1)
   print(df[["player", "pos", "team", "fantasy_points"]].head())
   PY
   ```

3. Opportunity-Daten zusätzlich laden, falls ihr Snaps/Routes in der UI anzeigen wollt:

   ```bash
   python - <<'PY'
   from python_service.data_loader import load_ff_opportunity

   opp = load_ff_opportunity(season=2024, weeks=[1])
   print(opp.head())
   PY
   ```

4. Direkter Export als JSON (wird von `api.php` aufgerufen):

   ```bash
   python python_service/export_lineup.py --season 2024 --week 1 > lineup.json
   ```

   Alternativ könnt ihr das Modul direkt ausführen, damit automatisch das aktive
   Python-Environment genutzt wird:

   ```bash
   python -m python_service.export_lineup --season 2024 --week 1 > lineup.json
   ```

   Falls ihr einen ImportError zu `polars` oder `nflreadpy` seht, vergewissert euch,
   dass das Virtualenv aktiv ist und die Requirements installiert wurden:

   ```bash
   source /home/www/home/www/bin/activate
   python -m pip install -r python_service/requirements.txt
   ```

   Danach lässt sich das CLI erneut ausführen.

## Nutzung im bestehenden Frontend

- Die Funktion `export_lineup_json` liefert eine JSON-ähnliche Liste mit `player_id`, `pos`, `fantasy_points`, `team`, `player`,
  die ihr im PHP-API als Proxy ausliefern könnt.
- Die Scoring-Regeln sind identisch zur UI: 4-Punkt-Pass-TDs, 0.5 PPR, DEF-Staffelung nach Points Allowed usw. (siehe `scoring.py`).

Damit habt ihr einen direkten Weg, die drei nflverse-Quellen zu nutzen und das Lineup-Scoring konsistent zur aktuellen Oberfläche zu berechnen.
