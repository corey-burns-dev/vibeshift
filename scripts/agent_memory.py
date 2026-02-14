#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any

DOMAINS = {"backend", "frontend", "auth", "websocket", "db", "redis", "infra", "docs"}
SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}

ROOT = Path(__file__).resolve().parents[1]
LESSONS_DIR = ROOT / "docs" / "lessons"
CONTEXT_DIR = ROOT / "docs" / "context"
KNOWN_ISSUES = CONTEXT_DIR / "known-issues.md"
KNOWN_ISSUES_ARCHIVE = CONTEXT_DIR / "known-issues-archive.md"

BACKFILL_MAP: dict[str, list[dict[str, Any]]] = {
    "docs/reports/production-review-2026-02-13.md": [
        {
            "title": "Never ship hardcoded admin credentials",
            "severity": "CRITICAL",
            "domains": ["backend", "auth", "infra"],
            "anti_pattern": "Fallback admin password values in runtime bootstrap logic.",
            "detection": r'rg -n "DevRoot123|password\s*=\s*\"" backend/internal',
            "prevention": "Require explicit env/config value or fail startup for privileged credentials.",
        },
        {
            "title": "Never ignore GORM .Error results",
            "severity": "CRITICAL",
            "domains": ["backend", "db"],
            "anti_pattern": "Discarding GORM operation errors with `_ = ...Error`.",
            "detection": r'rg -n "_ = .*\\.Error" backend/internal backend/cmd',
            "prevention": "Always check and handle GORM errors or document explicit safe ignore rationale.",
        },
    ],
    "docs/reports/2026-02-12-2250-deep-production-review.md": [
        {
            "title": "Rate limit admin and moderation endpoints",
            "severity": "HIGH",
            "domains": ["backend", "auth"],
            "anti_pattern": "Sensitive or high-impact routes without endpoint-specific throttling.",
            "detection": r'rg -n "Group\(\"/admin\"|Report(User|Post|Message)" backend/internal/server',
            "prevention": "Apply explicit Redis-backed limits to admin/moderation/report creation paths.",
        },
        {
            "title": "Add panic recovery for background subscribers",
            "severity": "HIGH",
            "domains": ["backend", "websocket", "infra"],
            "anti_pattern": "Background subscriber goroutines without panic containment.",
            "detection": r'rg -n "go func\(\).*for msg := range" backend/internal/notifications',
            "prevention": "Wrap callback execution with recover and log critical panic context.",
        },
        {
            "title": "Bound list queries with explicit limits",
            "severity": "HIGH",
            "domains": ["backend", "db"],
            "anti_pattern": "List endpoints returning unbounded datasets.",
            "detection": r'rg -n "ListBy|GetFriends|GetPending" backend/internal/repository',
            "prevention": "Enforce max pagination limits and bounded DB query limits.",
        },
    ],
    "docs/reports/2026-02-12-websocket-handshake-fix.md": [
        {
            "title": "Handshake auth must be explicit and ticket-based",
            "severity": "HIGH",
            "domains": ["backend", "frontend", "auth", "websocket"],
            "anti_pattern": "Implicit or stale auth assumptions during websocket connect.",
            "detection": r'rg -n "ws|ticket|handshake" backend/internal/server frontend/src',
            "prevention": "Use short-lived ticket exchange and validate ticket consume path deterministically.",
        }
    ],
    "docs/reports/2026-02-12-websocket-ticket-loop-fix.md": [
        {
            "title": "Ticket consume flow must avoid re-use loops",
            "severity": "HIGH",
            "domains": ["backend", "auth", "websocket"],
            "anti_pattern": "Racey ticket validation/consumption causing reconnect loops.",
            "detection": r'rg -n "ticket|Consume|Validate" backend/internal/server',
            "prevention": "Consume tickets atomically with clear one-time semantics and reconnect-safe handling.",
        }
    ],
    "docs/reports/2026-02-11-2144-onboarding-crash-review.md": [
        {
            "title": "Contain unknown realtime events on the client",
            "severity": "HIGH",
            "domains": ["frontend", "websocket"],
            "anti_pattern": "Processing unknown room events as normal conversation updates.",
            "detection": r'rg -n "room_message|unknown conversation|invalidate" frontend/src',
            "prevention": "Drop unknown-room events and throttle invalidation to prevent UI pressure loops.",
        }
    ],
}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "lesson"


def parse_report_date(report_path: Path) -> str:
    m = re.search(r"(\d{4}-\d{2}-\d{2})", report_path.name)
    if m:
        return m.group(1)
    return dt.date.today().isoformat()


def extract_structured_signals(text: str) -> dict[str, Any] | None:
    section = re.search(r"##\s+Structured Signals.*?```json\s*(\{.*?\})\s*```", text, re.S | re.I)
    if not section:
        return None
    try:
        data = json.loads(section.group(1))
    except json.JSONDecodeError:
        return None
    return data


def validate_structured_signals(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if "Report-Version" not in data:
        errors.append("missing Report-Version")
    domains = data.get("Domains")
    if not isinstance(domains, list) or not domains:
        errors.append("Domains must be a non-empty array")
    else:
        bad = [d for d in domains if d not in DOMAINS]
        if bad:
            errors.append(f"Domains contains invalid values: {', '.join(bad)}")

    lessons = data.get("Lessons")
    if not isinstance(lessons, list):
        errors.append("Lessons must be an array")
        return errors

    required = {"title", "severity", "anti_pattern", "detection", "prevention"}
    for i, lesson in enumerate(lessons, start=1):
        if not isinstance(lesson, dict):
            errors.append(f"lesson #{i} must be an object")
            continue
        missing = sorted(required - set(lesson.keys()))
        if missing:
            errors.append(f"lesson #{i} missing fields: {', '.join(missing)}")
        severity = str(lesson.get("severity", "")).upper()
        if severity and severity not in SEVERITIES:
            errors.append(f"lesson #{i} has invalid severity: {severity}")
    return errors


def lesson_path(report_date: str, title: str) -> Path:
    return LESSONS_DIR / f"{report_date}-{slugify(title)}.md"


def lesson_id(report_date: str, title: str) -> str:
    return f"lesson-{report_date}-{slugify(title)}"


def write_lesson(report_path: Path, lesson: dict[str, Any], inherited_domains: list[str] | None = None) -> Path:
    report_date = parse_report_date(report_path)
    title = str(lesson["title"]).strip()
    severity = str(lesson["severity"]).upper().strip()
    domains = lesson.get("domains") or inherited_domains or ["docs"]
    src = str(report_path.relative_to(ROOT))
    lid = lesson_id(report_date, title)
    detect = str(lesson["detection"]).strip()
    anti = str(lesson["anti_pattern"]).strip()
    prevent = str(lesson["prevention"]).strip()
    path = lesson_path(report_date, title)

    content = "\n".join(
        [
            "---",
            f"lesson_id: {lid}",
            f"severity: {severity}",
            "domains:",
            *[f"  - {d}" for d in domains],
            f"source_report: {src}",
            "status: active",
            f"detection: {json.dumps(detect)}",
            "---",
            "",
            f"# Lesson: {title}",
            "",
            "## Problem",
            anti,
            "",
            "## Trigger",
            anti,
            "",
            "## Fix",
            prevent,
            "",
            "## Guardrail",
            f"Use detection pattern in review/automation: `{detect}`",
            "",
            "## References",
            f"- Source report: `{src}`",
            "",
        ]
    )

    path.write_text(content, encoding="utf-8")
    return path


def parse_frontmatter(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}
    raw = text[4:end].splitlines()
    result: dict[str, Any] = {}
    current_key = None
    list_acc: list[str] | None = None
    for line in raw:
        if re.match(r"^\s*-\s+", line) and current_key and list_acc is not None:
            list_acc.append(re.sub(r"^\s*-\s+", "", line).strip())
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key = key.strip()
        val = val.strip()
        if val == "":
            current_key = key
            list_acc = []
            result[key] = list_acc
            continue
        current_key = None
        list_acc = None
        result[key] = val.strip('"')
    return result


def read_lessons() -> list[tuple[Path, dict[str, Any], str]]:
    rows: list[tuple[Path, dict[str, Any], str]] = []
    for path in sorted(LESSONS_DIR.glob("*.md")):
        if path.name in {"INDEX.md", "TEMPLATE.md"}:
            continue
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"^#\s+Lesson:\s+(.+)$", text, re.M)
        title = title_match.group(1).strip() if title_match else path.stem
        rows.append((path, parse_frontmatter(path), title))
    return rows


def regenerate_index() -> None:
    rows = read_lessons()
    by_severity: dict[str, list[tuple[str, Path]]] = {k: [] for k in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]}
    by_domain: dict[str, list[tuple[str, Path]]] = {k: [] for k in sorted(DOMAINS)}

    for path, fm, title in rows:
        sev = str(fm.get("severity", "MEDIUM")).upper()
        rel = path.relative_to(LESSONS_DIR)
        if sev not in by_severity:
            by_severity.setdefault(sev, [])
        by_severity[sev].append((title, rel))
        for domain in fm.get("domains", []):
            by_domain.setdefault(domain, []).append((title, rel))

    out: list[str] = ["# Lessons Index", "", f"Last Updated: {dt.date.today().isoformat()}", ""]
    out.append("## By Severity")
    out.append("")
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        out.append(f"### {sev}")
        items = sorted(by_severity.get(sev, []), key=lambda x: x[0].lower())
        if not items:
            out.append("- _None_")
        else:
            for title, rel in items:
                out.append(f"- [{title}]({rel.as_posix()})")
        out.append("")

    out.append("## By Domain")
    out.append("")
    for domain in sorted(by_domain.keys()):
        out.append(f"### {domain}")
        items = sorted(by_domain.get(domain, []), key=lambda x: x[0].lower())
        if not items:
            out.append("- _None_")
        else:
            for title, rel in items:
                out.append(f"- [{title}]({rel.as_posix()})")
        out.append("")

    (LESSONS_DIR / "INDEX.md").write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def regenerate_known_issues() -> None:
    rows = read_lessons()
    today = dt.date.today()
    active: list[dict[str, str]] = []
    archived: list[dict[str, str]] = []

    for path, fm, title in rows:
        sev = str(fm.get("severity", "")).upper()
        if sev not in {"CRITICAL", "HIGH"}:
            continue
        src = str(fm.get("source_report", ""))
        status = str(fm.get("status", "active")).lower()
        lid = str(fm.get("lesson_id", path.stem))
        opened = parse_report_date(path)
        opened_date = dt.date.fromisoformat(opened)
        expires = opened_date + dt.timedelta(days=45)
        issue = {
            "Issue-ID": f"ISSUE-{slugify(lid).upper().replace('-', '_')}",
            "Status": status,
            "Owner": "unassigned",
            "Opened": opened,
            "Expires-On": expires.isoformat(),
            "Workaround": f"Follow lesson `{path.relative_to(ROOT).as_posix()}`.",
            "Source-Report": src,
            "Title": title,
        }
        if status == "resolved" and today >= expires:
            archived.append(issue)
        elif status in {"active", "monitoring"} and today <= expires:
            active.append(issue)
        else:
            archived.append(issue)

    lines = [
        "# Known Issues",
        "",
        "Active and monitoring issues for agent sessions.",
        "",
        "## Rules",
        "",
        "- Every issue must include: `Issue-ID`, `Status`, `Owner`, `Opened`, `Expires-On`, `Workaround`, `Source-Report`.",
        "- Status must be one of: `active`, `monitoring`, `resolved`.",
        "- Resolved or expired issues are archived after 45 days unless explicitly pinned.",
        "",
        "## Active Issues",
        "",
    ]

    if not active:
        lines.append("- _None_")
    else:
        for issue in sorted(active, key=lambda x: x["Opened"], reverse=True):
            lines.extend(
                [
                    f"### {issue['Title']}",
                    f"- Issue-ID: `{issue['Issue-ID']}`",
                    f"- Status: `{issue['Status']}`",
                    f"- Owner: `{issue['Owner']}`",
                    f"- Opened: `{issue['Opened']}`",
                    f"- Expires-On: `{issue['Expires-On']}`",
                    f"- Workaround: {issue['Workaround']}",
                    f"- Source-Report: `{issue['Source-Report']}`",
                    "",
                ]
            )

    KNOWN_ISSUES.parent.mkdir(parents=True, exist_ok=True)
    KNOWN_ISSUES.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    archive_lines = ["# Known Issues Archive", "", "Archived known issues moved from `docs/context/known-issues.md`.", ""]
    if not archived:
        archive_lines.append("- _None_")
    else:
        for issue in sorted(archived, key=lambda x: x["Opened"], reverse=True):
            archive_lines.extend(
                [
                    f"### {issue['Title']}",
                    f"- Issue-ID: `{issue['Issue-ID']}`",
                    f"- Status: `{issue['Status']}`",
                    f"- Owner: `{issue['Owner']}`",
                    f"- Opened: `{issue['Opened']}`",
                    f"- Expires-On: `{issue['Expires-On']}`",
                    f"- Workaround: {issue['Workaround']}",
                    f"- Source-Report: `{issue['Source-Report']}`",
                    "",
                ]
            )
    KNOWN_ISSUES_ARCHIVE.write_text("\n".join(archive_lines).rstrip() + "\n", encoding="utf-8")


def command_update(report: Path) -> int:
    if not report.exists():
        print(f"missing report: {report}", file=sys.stderr)
        return 1
    text = report.read_text(encoding="utf-8")
    signals = extract_structured_signals(text)
    if not signals:
        print(f"no structured signals found in {report}", file=sys.stderr)
        return 1
    errors = validate_structured_signals(signals)
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1

    LESSONS_DIR.mkdir(parents=True, exist_ok=True)
    domains = [str(d) for d in signals.get("Domains", [])]
    for lesson in signals.get("Lessons", []):
        write_lesson(report, lesson, inherited_domains=domains)

    regenerate_index()
    regenerate_known_issues()
    print(f"updated memory from report: {report.relative_to(ROOT)}")
    return 0


def command_backfill(reports_dir: Path) -> int:
    LESSONS_DIR.mkdir(parents=True, exist_ok=True)
    for rel_report, lessons in BACKFILL_MAP.items():
        report = ROOT / rel_report
        if not report.exists():
            continue
        for lesson in lessons:
            write_lesson(report, lesson, inherited_domains=lesson.get("domains"))
    regenerate_index()
    regenerate_known_issues()
    print("backfill complete")
    return 0


def validate_lesson_schema() -> list[str]:
    errors: list[str] = []
    ids: set[str] = set()
    for path, fm, _title in read_lessons():
        required = ["lesson_id", "severity", "domains", "source_report", "status", "detection"]
        for key in required:
            if key not in fm:
                errors.append(f"{path}: missing frontmatter key '{key}'")
        lid = str(fm.get("lesson_id", ""))
        if lid:
            if lid in ids:
                errors.append(f"duplicate lesson_id: {lid}")
            ids.add(lid)
        sev = str(fm.get("severity", "")).upper()
        if sev and sev not in SEVERITIES:
            errors.append(f"{path}: invalid severity '{sev}'")
    return errors


def validate_report(report: Path, require_structured: bool) -> list[str]:
    errors: list[str] = []
    if not report.exists():
        return [f"report does not exist: {report}"]
    signals = extract_structured_signals(report.read_text(encoding="utf-8"))
    if not signals:
        if require_structured:
            errors.append("missing structured signals section")
        return errors
    errors.extend(validate_structured_signals(signals))
    return errors


def command_validate(report: Path | None, require_structured: bool) -> int:
    errors: list[str] = []
    if report is not None:
        errors.extend(validate_report(report, require_structured=require_structured))
    else:
        errors.extend(validate_lesson_schema())
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1
    print("validation passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sanctum agent memory maintenance")
    sub = parser.add_subparsers(dest="command", required=True)

    p_backfill = sub.add_parser("backfill", help="Backfill lessons/context from high-signal reports")
    p_backfill.add_argument("--reports-dir", default="docs/reports")
    p_backfill.add_argument("--lessons-dir", default="docs/lessons")

    p_update = sub.add_parser("update", help="Update lessons/context from one report with structured signals")
    p_update.add_argument("--report", required=True)

    p_validate = sub.add_parser("validate", help="Validate memory schema or report structured signals")
    p_validate.add_argument("--report")
    p_validate.add_argument("--require-structured", action="store_true")

    args = parser.parse_args()

    global LESSONS_DIR
    LESSONS_DIR = ROOT / args.lessons_dir if hasattr(args, "lessons_dir") else LESSONS_DIR

    if args.command == "backfill":
        return command_backfill(ROOT / args.reports_dir)
    if args.command == "update":
        return command_update(ROOT / args.report)
    if args.command == "validate":
        report = ROOT / args.report if args.report else None
        return command_validate(report, require_structured=args.require_structured)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
