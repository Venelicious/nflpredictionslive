"""Thin wrappers around nflreadpy endpoints needed for lineup scoring."""
from __future__ import annotations

from typing import Any, Iterable, Tuple

import importlib.util

if importlib.util.find_spec("pandas") is None:
    raise ImportError(
        "Missing dependency 'pandas'. Install via `pip install -r python_service/requirements.txt`."
    )

if importlib.util.find_spec("nflreadpy") is None:
    raise ImportError(
        "Missing dependency 'nflreadpy'. Install via `pip install -r python_service/requirements.txt`."
    )

import pandas as pd
from nflreadpy import nflread as nfl


DEFAULT_SEASON_TYPE = "regular"


def load_ff_playerids() -> pd.DataFrame:
    """Load nflverse fantasy player ids (ffid, gsis, sportradar, etc.)."""

    return nfl.load_ff_playerids()


def load_ff_rankings(season: int, week: int | None = None) -> pd.DataFrame:
    """Load weekly fantasy rankings (projections) for a given season/week."""

    return nfl.load_ff_rankings(season=season, week=week, season_type=DEFAULT_SEASON_TYPE)


def load_ff_opportunity(season: int, weeks: Iterable[int] | None = None) -> pd.DataFrame:
    """Load opportunity data (snaps, routes, targets, carries) for weeks."""

    return nfl.load_ff_opportunity(season=season, weeks=weeks, season_type=DEFAULT_SEASON_TYPE)


def _normalize_id(value: Any) -> str | None:
    """Normalize IDs to comparable strings and drop NaNs."""

    if value is None:
        return None

    if isinstance(value, float) and pd.isna(value):
        return None

    if pd.isna(value):
        return None

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    return str(value).strip()


def _build_sleeper_lookup(player_ids: pd.DataFrame) -> Tuple[dict[str, str], dict[str, str]]:
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

    for _, row in player_ids.iterrows():
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


def _resolve_sleeper_id(row: pd.Series, id_lookup: dict[str, str], name_lookup: dict[str, str]) -> str | None:
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


def attach_lineup_scores(rankings: pd.DataFrame) -> pd.DataFrame:
    """Add fantasy points based on existing scoring rules to ranking rows.

    The ranking rows are expected to contain position and common stat columns.
    """

    from .scoring import calculate_fantasy_points, merge_projection_row

    rankings = rankings.copy()
    rankings["fantasy_points"] = rankings.apply(
        lambda row: calculate_fantasy_points(merge_projection_row(row), row.get("pos", "")),
        axis=1,
    )
    return rankings


def summarize_lineup_projection(season: int, week: int | None = None) -> pd.DataFrame:
    """Convenience pipeline: fetch rankings and annotate with scores."""

    rankings = load_ff_rankings(season=season, week=week)
    return attach_lineup_scores(rankings)


def export_lineup_json(season: int, week: int | None = None) -> list[dict[str, Any]]:
    """Return a JSON-serializable list with the computed lineup scores."""

    df = summarize_lineup_projection(season=season, week=week)
    player_ids = load_ff_playerids()
    id_lookup, name_lookup = _build_sleeper_lookup(player_ids)

    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
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
