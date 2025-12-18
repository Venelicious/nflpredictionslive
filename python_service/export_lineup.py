#!/usr/bin/env python3
"""CLI helper to export nflverse lineup projections as JSON."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure local imports work when executed from project root
ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from python_service.data_loader import export_lineup_json  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export lineup projections with fantasy scores")
    parser.add_argument("--season", type=int, required=True, help="NFL season (e.g., 2024)")
    parser.add_argument("--week", type=int, help="NFL week (regular season)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = export_lineup_json(season=args.season, week=args.week)
    json.dump(records, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
