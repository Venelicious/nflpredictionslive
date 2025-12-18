"""Fantasy scoring utilities aligned with the existing PHP backend.

The rules mirror `calculateProjectionFantasyPoints` in ``api.php``:
- QB: 4-pt passing TDs, -2 per INT, 1 pt per 25 pass yards,
  rushing at 0.1/yd, rushing TD 6, -2 lost fumble.
- RB/WR/TE: rushing 0.1/yd, rushing TD 6, receiving 0.5 PPR,
  0.1/rec yd, receiving TD 6, -2 lost fumble.
- K: 3 per FG (all distances aggregated), 1 per XP.
- DEF: TD 6, INT 2, FUM_REC 2, SACK 1, SAFETY 2, points-allowed tiers.
"""
from __future__ import annotations

from typing import Mapping


def calculate_fantasy_points(stats: Mapping[str, float] | None, position: str) -> float:
    """Calculate fantasy points for a player projection/stat line.

    Parameters
    ----------
    stats: Mapping[str, float] | None
        Dict-like structure with stat keys from Sleeper/nflverse conventions.
    position: str
        Player position (QB/RB/WR/TE/K/DEF). Case-insensitive.

    Returns
    -------
    float
        Rounded fantasy points (2 decimals) following the UI's scoring rules.
    """

    stats = stats or {}
    pts = 0.0
    pos = position.upper()

    if pos == "QB":
        pts += stats.get("pass_yd", 0) / 25
        pts += stats.get("pass_td", 0) * 4
        pts -= stats.get("pass_int", 0) * 2
        pts += stats.get("rush_yd", 0) / 10
        pts += stats.get("rush_td", 0) * 6
        pts -= stats.get("fumbles_lost", 0) * 2
    elif pos in {"RB", "WR", "TE"}:
        pts += stats.get("rush_yd", 0) / 10
        pts += stats.get("rush_td", 0) * 6
        pts += stats.get("rec", 0) * 0.5
        pts += stats.get("rec_yd", 0) / 10
        pts += stats.get("rec_td", 0) * 6
        pts -= stats.get("fumbles_lost", 0) * 2
    elif pos == "K":
        fgm = (
            stats.get("fgm", 0)
            + stats.get("fgm_0_19", 0)
            + stats.get("fgm_20_29", 0)
            + stats.get("fgm_30_39", 0)
            + stats.get("fgm_40_49", 0)
            + stats.get("fgm_50p", 0)
        )
        pts += fgm * 3
        pts += stats.get("xpm", 0) * 1
    elif pos == "DEF":
        pts += stats.get("def_st_td", 0) * 6
        pts += stats.get("int", 0) * 2
        pts += stats.get("fum_rec", 0) * 2
        pts += stats.get("sack", 0) * 1
        pts += stats.get("safety", 0) * 2

        points_allowed = stats.get("pts_allowed")
        if points_allowed is not None:
            if points_allowed == 0:
                pts += 5
            elif points_allowed <= 6:
                pts += 4
            elif points_allowed <= 13:
                pts += 3
            elif points_allowed <= 20:
                pts += 1
            elif points_allowed >= 35:
                pts -= 3
    else:  # fallback
        pts += stats.get("pts_ppr", stats.get("pts_std", 0))

    return round(pts, 2)


def merge_projection_row(row: Mapping[str, float]) -> dict[str, float]:
    """Flatten nflverse projection rows to the stat keys the scorer expects.

    This helper lets you pass polars/nflreadpy rows into ``calculate_fantasy_points``
    without manual renaming each time.
    """

    merged = {
        "pass_yd": row.get("pass_yards", 0),
        "pass_td": row.get("pass_td", 0),
        "pass_int": row.get("int", 0) or row.get("pass_int", 0),
        "rush_yd": row.get("rush_yards", 0),
        "rush_td": row.get("rush_td", 0),
        "rec": row.get("rec", 0) or row.get("receptions", 0),
        "rec_yd": row.get("rec_yards", 0),
        "rec_td": row.get("rec_td", 0),
        "fumbles_lost": row.get("fumbles_lost", 0) or row.get("fumbles", 0),
        "fgm": row.get("fgm", 0),
        "fgm_0_19": row.get("fgm_0_19", 0),
        "fgm_20_29": row.get("fgm_20_29", 0),
        "fgm_30_39": row.get("fgm_30_39", 0),
        "fgm_40_49": row.get("fgm_40_49", 0),
        "fgm_50p": row.get("fgm_50p", 0),
        "xpm": row.get("xpm", 0),
        "def_st_td": row.get("def_st_td", 0) or row.get("defense_td", 0),
        "int": row.get("def_int", 0) or row.get("int", 0),
        "fum_rec": row.get("fum_rec", 0) or row.get("fumbles_rec", 0),
        "sack": row.get("sack", 0),
        "safety": row.get("safety", 0),
        "pts_allowed": row.get("points_allowed"),
        "pts_ppr": row.get("fantasy_points_ppr", 0),
    }

    return merged
