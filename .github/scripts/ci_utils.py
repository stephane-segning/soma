#!/usr/bin/env python3
"""
Small CI helper utilities to keep workflow bash clean.

Usage:
  python .github/scripts/ci_utils.py workspace-version --path backend/Cargo.toml
  python .github/scripts/ci_utils.py desktop-version --path desktop/soma/package.json
"""

import argparse
import json
import pathlib
import sys
import tomllib


def read_workspace_version(path: pathlib.Path) -> str:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    try:
        return data["workspace"]["package"]["version"]
    except KeyError as exc:  # pragma: no cover - guardrail for CI diagnostics
        raise SystemExit(f"workspace/package/version not found in {path}") from exc


def read_desktop_version(path: pathlib.Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    try:
        return data["version"]
    except KeyError as exc:  # pragma: no cover - guardrail for CI diagnostics
        raise SystemExit(f"version not found in {path}") from exc


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    ws = sub.add_parser("workspace-version", help="Read version from workspace Cargo.toml")
    ws.add_argument("--path", required=True, type=pathlib.Path)

    desk = sub.add_parser("desktop-version", help="Read version from desktop package.json")
    desk.add_argument("--path", required=True, type=pathlib.Path)

    args = parser.parse_args(argv)

    if args.cmd == "workspace-version":
        print(read_workspace_version(args.path))
    elif args.cmd == "desktop-version":
        print(read_desktop_version(args.path))
    else:  # pragma: no cover
        parser.error(f"unknown command {args.cmd}")

    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
