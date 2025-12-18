"""Thin wrappers around nflreadpy endpoints needed for lineup scoring."""
from __future__ import annotations

from typing import Any, Iterable, Mapping, Tuple

import math

DEPENDENCY_HINT = "Install via `pip install -r python_service/requirements.txt`."
NFLREADPY_DOCS = "\n".join(
    [
        "Bitte prüfe die nflreadpy Installation.",
        "Beispiel: import nflreadpy as nfl; pbp = nfl.load_pbp().",
        "Häufige load functions: load_pbp, load_player_stats, load_team_stats, load_schedules, load_players.",
        "Weitere Funktionen: https://nflreadpy.nflverse.com/api/load_functions/.",
        "Konfiguration: https://nflreadpy.nflverse.com/api/configuration/.",
        "Caching: https://nflreadpy.nflverse.com/api/cache/.",
        "Utilities: https://nflreadpy.nflverse.com/api/utils/.",
    ]
)


def _raise_missing_dependency(module: str, extra: str | None = None) -> None:
    """Raise an ImportError with clear installation instructions."""

    message = f"Missing dependency '{module}'. {DEPENDENCY_HINT}"
    if extra:
        message = f"{message}\n{extra}"
    raise ImportError(message)

try:
    import polars as pl
except Exception as e:
    raise ImportError(
        f"polars ist installiert, aber der Import ist fehlgeschlagen: {e}"
    )

try:
    import nflreadpy as nfl
except Exception as e:
    raise ImportError(
        f"nflreadpy ist installiert, aber der Import ist fehlgeschlagen:\n{e}\n{NFLREADPY_DOCS}"
    )

import polars as pl
import nflreadpy as nfl


DEFAULT_SEASON_TYPE = "regular"


def load_ff_playerids() -> pl.DataFrame:
    """Load nflverse fantasy player ids (ffid, gsis, sportradar, etc.)."""

    return nfl.load_ff_playerids(output_format="polars")


def load_ff_rankings(season: int, week: int | None = None) -> pl.DataFrame:
    """Load weekly fantasy rankings (projections) for a given season/week."""

    return nfl.load_ff_rankings(
        season=season,
        week=week,
        season_type=DEFAULT_SEASON_TYPE,
        output_format="polars",
    )


def load_ff_opportunity(season: int, weeks: Iterable[int] | None = None) -> pl.DataFrame:
    """Load opportunity data (snaps, routes, targets, carries) for weeks."""

    return nfl.load_ff_opportunity(
        season=season,
        weeks=weeks,
        season_type=DEFAULT_SEASON_TYPE,
        output_format="polars",
    )


def _normalize_id(value: Any) -> str | None:
    """Normalize IDs to comparable strings and drop NaNs."""

    if value is None:
        return None

    if isinstance(value, float) and math.isnan(value):
        return None

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    return str(value).strip()


def _build_sleeper_lookup(player_ids: pl.DataFrame) -> Tuple[dict[str, str], dict[str, str]]:
    """Create fast lookup maps (id -> sleeper_id, name -> sleeper_id)."""

    id_columns = [
        "player_id",
        "sleeper_id",
        "gsis_id",
        "sportradar_id",
        "espn_id",
        "yahoo_id",
        "cbs_id",
        "pfr_id",
        "fantasypros_id",
        "rotowire_id",
        "rotoworld_id",
        "ktc_id",
        "pff_id",
    ]

    id_lookup: dict[str, str] = {}
    name_lookup: dict[str, str] = {}

    for row in player_ids.iter_rows(named=True):
        sleeper_id = _normalize_id(row.get("sleeper_id"))
        if not sleeper_id:
            continue

        for col in id_columns:
            value = _normalize_id(row.get(col))
            if value:
                id_lookup[value] = sleeper_id

        full_name = row.get("full_name")
        if isinstance(full_name, str) and full_name.strip():
            name_lookup[full_name.strip().lower()] = sleeper_id

    return id_lookup, name_lookup


def _resolve_sleeper_id(
    row: Mapping[str, Any], id_lookup: dict[str, str], name_lookup: dict[str, str]
) -> str | None:
    """Best-effort mapping from nflverse projections to Sleeper player IDs."""

    candidate_keys = [
        "sleeper_id",
        "player_id",
        "gsis_id",
        "sportradar_id",
        "fantasypros_id",
        "espn_id",
        "yahoo_id",
        "cbs_id",
        "pfr_id",
        "rotowire_id",
        "rotoworld_id",
        "ktc_id",
        "pff_id",
    ]

    for key in candidate_keys:
        value = _normalize_id(row.get(key))
        if value and value in id_lookup:
            return id_lookup[value]

    for key in ["player", "player_name", "full_name"]:
        name = row.get(key)
        if isinstance(name, str) and name.strip():
            mapped = name_lookup.get(name.strip().lower())
            if mapped:
                return mapped

    return None


def attach_lineup_scores(rankings: pl.DataFrame) -> pl.DataFrame:
    """Add fantasy points based on existing scoring rules to ranking rows.

    The ranking rows are expected to contain position and common stat columns.
    """

    from .scoring import calculate_fantasy_points, merge_projection_row

    return rankings.with_columns(
        pl.struct(pl.all()).map_elements(
            lambda row: calculate_fantasy_points(merge_projection_row(row), row.get("pos", ""))
        ).alias("fantasy_points")
    )


def summarize_lineup_projection(season: int, week: int | None = None) -> pl.DataFrame:
    """Convenience pipeline: fetch rankings and annotate with scores."""

    rankings = load_ff_rankings(season=season, week=week)
    return attach_lineup_scores(rankings)


def export_lineup_json(season: int, week: int | None = None) -> list[dict[str, Any]]:
    """Return a JSON-serializable list with the computed lineup scores."""

    df = summarize_lineup_projection(season=season, week=week)
    player_ids = load_ff_playerids()
    id_lookup, name_lookup = _build_sleeper_lookup(player_ids)

    records: list[dict[str, Any]] = []
    for row in df.iter_rows(named=True):
        sleeper_id = _resolve_sleeper_id(row, id_lookup, name_lookup)
        record = {
            "player_id": _normalize_id(row.get("player_id")) or _normalize_id(row.get("gsis_id")),
            "sleeper_id": sleeper_id,
            "pos": row.get("pos") or row.get("position"),
            "fantasy_points": float(row.get("fantasy_points", 0) or 0),
            "team": row.get("team") or row.get("recent_team") or row.get("current_team"),
            "player": row.get("player") or row.get("player_name") or row.get("full_name"),
        }

        records.append(record)

    return records
