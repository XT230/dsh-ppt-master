"""Report the running interpreter and whether ppt-master's dependencies import.

Runs as ``<python> -I -B probe.py [--quick] [--requirements FILE]``.

``-I`` keeps the run isolated (no ``PYTHON*`` environment, no user site, the
script directory is not prepended to ``sys.path``) and ``-B`` avoids bytecode
writes, so the same command is safe against a read-only interpreter payload and
never leaves artifacts behind. The report is written to stdout as UTF-8 bytes so
the console code page cannot mangle it.

Tiers: ``core`` is what the ordinary SVG -> PPTX pipeline needs; ``optional``
only gates one input format or capability, so a missing optional package
degrades that feature instead of blocking a deck.
"""

from __future__ import annotations

import argparse
import importlib
import importlib.metadata as metadata
import json
import re
import sys

# (distribution, import name, tier, capability)
REQUIREMENTS = (
    ("PyYAML", "yaml", "core", "YAML manifests and reports"),
    ("python-pptx", "pptx", "core", "SVG -> native DrawingML PPTX"),
    ("XlsxWriter", "xlsxwriter", "core", "native table export"),
    ("skia-pathops", "pathops", "core", "PowerPoint-style merge shapes"),
    ("uharfbuzz", "uharfbuzz", "core", "text shaping and glyph outlines"),
    ("Pillow", "PIL", "core", "image intake and analysis"),
    ("numpy", "numpy", "core", "numeric work and audio/video mixing"),
    ("edge-tts", "edge_tts", "optional", "narration audio"),
    ("PyMuPDF", "fitz", "optional", "PDF -> Markdown"),
    ("mammoth", "mammoth", "optional", "DOCX -> Markdown"),
    ("markdownify", "markdownify", "optional", "HTML/EPUB -> Markdown"),
    ("ebooklib", "ebooklib", "optional", "EPUB -> Markdown"),
    ("nbconvert", "nbconvert", "optional", "IPYNB -> Markdown"),
    ("openpyxl", "openpyxl", "optional", "XLSX -> Markdown"),
    ("requests", "requests", "optional", "web fetch"),
    ("beautifulsoup4", "bs4", "optional", "HTML parsing"),
    ("curl_cffi", "curl_cffi", "optional", "TLS-fingerprinted web fetch"),
    ("google-genai", "google.genai", "optional", "Gemini image backend"),
    ("flask", "flask", "optional", "local preview/confirm server"),
)

REQUIREMENT_LINE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*")


def check(dist: str, module: str, tier: str, capability: str) -> dict:
    entry = {
        "dist": dist,
        "import": module,
        "tier": tier,
        "capability": capability,
        "ok": False,
        "version": None,
        "error": None,
    }
    try:
        importlib.import_module(module)
        entry["ok"] = True
    except Exception as exc:  # noqa: BLE001 - any import failure is a missing capability
        entry["error"] = f"{type(exc).__name__}: {exc}"
    try:
        entry["version"] = metadata.version(dist)
    except Exception:  # noqa: BLE001 - distribution metadata is best effort
        pass
    return entry


def normalize(name: str) -> str:
    return name.strip().strip('"').strip("'").lower().replace("_", "-").replace(".", "-")


def untracked_distributions(path: str) -> list:
    """Return requirement names the built-in table does not cover, so drift is visible."""
    known = {normalize(item[0]) for item in REQUIREMENTS}
    found = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            lines = handle.read().splitlines()
    except OSError:
        return found
    for line in lines:
        text = line.split("#", 1)[0].strip()
        if not text or text.startswith("-"):
            continue
        match = REQUIREMENT_LINE.match(text)
        if not match:
            continue
        name = normalize(match.group(0))
        if name and name not in known and name not in found:
            found.append(name)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="ppt-master dependency probe")
    parser.add_argument("--quick", action="store_true", help="report the interpreter only, skip imports")
    parser.add_argument("--requirements", default=None, help="requirements file to check for untracked distributions")
    args = parser.parse_args()

    report = {
        "python": sys.executable,
        "version": ".".join(str(part) for part in sys.version_info[:3]),
        "implementation": sys.implementation.name,
        "prefix": sys.prefix,
        "basePrefix": getattr(sys, "base_prefix", None),
        "requirementsFile": args.requirements,
        "packages": [],
        "coreMissing": [],
        "optionalMissing": [],
        "untracked": [],
        "ok": None,
    }

    if not args.quick:
        for dist, module, tier, capability in REQUIREMENTS:
            entry = check(dist, module, tier, capability)
            report["packages"].append(entry)
            if not entry["ok"]:
                key = "coreMissing" if tier == "core" else "optionalMissing"
                report[key].append(entry["dist"])
        report["ok"] = not report["coreMissing"]
        if args.requirements:
            report["untracked"] = untracked_distributions(args.requirements)

    payload = json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8")
    try:
        sys.stdout.buffer.write(payload + b"\n")
        sys.stdout.buffer.flush()
    except (AttributeError, OSError):  # pragma: no cover - streams without a buffer
        sys.stdout.write(payload.decode("utf-8") + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
