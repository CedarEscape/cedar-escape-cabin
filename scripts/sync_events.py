#!/usr/bin/env python3
"""Sync the "What's Happening at Massanutten" section from Massanutten Resort's
official live-events page into explore-massanutten.html.

Source of truth: https://www.massresort.com/play/live-events/ — a plain,
server-rendered page (no JS rendering needed) that lists named festivals/events
with dates, and links out to each event's own detail page for a short
description. This script does NOT touch Massanutten's day-to-day
"Entertainment & Dining Calendar" widget, which is rendered client-side by a
third-party vendor and isn't safely scrapable server-side.

Behavior:
  - Discovers event detail pages dynamically from the index page (no
    hardcoded event names), so new/renamed events show up automatically and
    a page Massanutten removes just disappears next run.
  - Skips any linked page where no parseable date is found (e.g. a vendor
    interest form) rather than guessing.
  - Excludes events whose date has already passed.
  - Merges in data/events-overrides.json: hide an event, feature a specific
    one, or add fully custom local events -- see that file's "_instructions".
  - Never downloads or references Massanutten's own event photography (see
    project conversation history for why); uses a category icon instead.
  - Writes the normalized, deduplicated event list to
    data/massanutten-events.json as a cache, and only overwrites that cache
    on a *successful* fetch+parse -- if Massanutten's page is unreachable or
    unrecognizable, the last good cache (and therefore the last good page
    content) is left alone rather than blanking the section.

Run manually or on a schedule (see .github/workflows/sync-events.yml).
"""
import html
import json
import re
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

INDEX_URL = "https://www.massresort.com/play/live-events/"
ROOT = Path(__file__).resolve().parent.parent
SITE_HTML = ROOT / "explore-massanutten.html"
CACHE_JSON = ROOT / "data" / "massanutten-events.json"
OVERRIDES_JSON = ROOT / "data" / "events-overrides.json"

EVENTS_START = "<!-- EVENTS:AUTO:START -->"
EVENTS_END = "<!-- EVENTS:AUTO:END -->"

MAX_COMING_UP = 4

# Non-event utility pages that sometimes show up alongside real events in the
# same nav/section list. Matched case-insensitively against the link title.
SKIP_TITLES = {"event vendor interest form"}

MONTH_RE = r"January|February|March|April|May|June|July|August|September|October|November|December"
WEEKDAY_RE = r"Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday"
# "Saturday, October 10, 2026"
DATE_RE = re.compile(rf"(?:({WEEKDAY_RE}),\s*)?({MONTH_RE})\s+(\d{{1,2}}),?\s+(\d{{4}})")
# "October 24 - 25, 2026" / "October 24-25, 2026"
DATE_RANGE_RE = re.compile(rf"({MONTH_RE})\s+(\d{{1,2}})\s*-\s*(\d{{1,2}}),?\s+(\d{{4}})")
TIME_RE = re.compile(r"\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)[^.<|]*")

ATTR_KEYWORDS = [
    (("music", "band", "acoustic", "dj "), "Live Music"),
    (("food", "drink", "beer", "wine", "truck"), "Food + Drinks"),
    (("artisan", "vendor", "craft", "market"), "Local Artisans"),
    (("family", "kids", "children"), "Family Fun"),
]


def normalize_ampm(text: str) -> str:
    return re.sub(r"\b(am|pm)\b", lambda m: m.group(1).upper(), text)


def infer_attrs(text: str):
    text = text.lower()
    found = []
    for keys, label in ATTR_KEYWORDS:
        if any(k in text for k in keys) and label not in found:
            found.append(label)
    return found[:4]

CATEGORY_ICONS = {
    "race": '<path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"/>',
    "festival": '<path d="M4 21V10l8-6 8 6v11"/><path d="M9 21v-6h6v6"/><path d="M4 10h16"/>',
    "market": '<path d="M4 8h16l-1.5 11a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    "music": '<circle cx="7" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M10 18V4l11-2v14"/>',
    "default": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
}

SUMMARY_TEMPLATES = [
    (("spartan", "race"), "{title} brings obstacle racing to the mountain{when} — expect extra energy (and traffic) around the resort."),
    (("festival",), "{title} brings local music, food and vendors to the mountain{when}."),
    (("market",), "{title} brings local vendors and artisans to the resort{when}."),
    (("concert", "music", "jam"), "{title} brings live music to the resort{when}."),
]
DEFAULT_SUMMARY = "{title} is happening at Massanutten Resort{when}. See official details for the full schedule."


def http_get(url: str) -> str:
    # massresort.com's bot-protection blocks requests whose headers look like
    # a *spoofed* real browser (full Chrome UA + Accept-Language, etc.) but
    # allows a bare "Mozilla/5.0" UA through -- confirmed by testing both.
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_date(text: str):
    """Return (start_date, end_date, display_str) or None."""
    m = DATE_RANGE_RE.search(text)
    if m:
        month, d1, d2, year = m.groups()
        try:
            start = datetime.strptime(f"{month} {d1} {year}", "%B %d %Y").date()
            end = datetime.strptime(f"{month} {d2} {year}", "%B %d %Y").date()
            return start, end, f"{month} {d1}–{d2}, {year}"
        except ValueError:
            pass
    m = DATE_RE.search(text)
    if m:
        weekday, month, day, year = m.groups()
        try:
            start = datetime.strptime(f"{month} {day} {year}", "%B %d %Y").date()
            display = f"{weekday}, {month} {day}, {year}" if weekday else f"{month} {day}, {year}"
            return start, start, display
        except ValueError:
            pass
    return None


def parse_time(text: str) -> str:
    m = TIME_RE.search(text)
    return normalize_ampm(m.group(0).strip(" -")) if m else ""


def category_for(title: str, summary: str) -> str:
    text = f"{title} {summary}".lower()
    for keys, _ in SUMMARY_TEMPLATES:
        if any(k in text for k in keys):
            return keys[0]
    return "default"


def make_summary(title: str, when: str) -> str:
    text = title.lower()
    when_str = f" on {when}" if when else ""
    for keys, template in SUMMARY_TEMPLATES:
        if any(k in text for k in keys):
            return template.format(title=title, when=when_str)
    return DEFAULT_SUMMARY.format(title=title, when=when_str)


def discover_events(index_html: str):
    """Find every event detail-page link on the index, resolve each one's
    date (from the index summary paragraph if present, else its own page),
    and return a list of normalized event dicts."""
    links = re.findall(r'<h2 class="my-0"><a[^>]*href="([^"]+)"[^>]*>([^<]+)</a></h2>', index_html)

    # The index page's own summary paragraph often lists "Title | Date | Time"
    # for the flagship festivals -- use it as a fast-path so we don't have to
    # fetch every detail page just to get a date we already have.
    summary_dates = {}
    p_match = re.search(r"<p[^>]*><strong>.*?</p>", index_html, re.DOTALL)
    if p_match:
        for chunk in p_match.group(0).split("<br"):
            title_m = re.search(r"<strong>([^<]+)</strong>\s*\|?\s*([^<]*)", chunk)
            if title_m:
                t = html.unescape(title_m.group(1)).strip()
                rest = html.unescape(title_m.group(2))
                parsed = parse_date(rest)
                if parsed:
                    summary_dates[t.lower()] = (parsed, parse_time(rest))

    events = []
    for url, raw_title in links:
        title = html.unescape(raw_title).strip()
        if title.lower() in SKIP_TITLES:
            continue
        full_url = url if url.startswith("http") else f"https://www.massresort.com{url}"

        date_info = summary_dates.get(title.lower())

        # Always fetch the detail page: even when we already have a date
        # from the index summary, the detail page's own description is what
        # lets us infer factual tags (Live Music, Food + Drinks, ...)
        # without fabricating anything.
        try:
            detail_html = http_get(full_url)
        except Exception as exc:  # noqa: BLE001 - report and skip this one event
            print(f"  ! could not fetch {full_url}: {exc}")
            if not date_info:
                continue
            detail_html = ""

        summary_text = ""
        if detail_html:
            info_m = re.search(r"Event Info</h2>\s*<p>(.*?)</p>", detail_html, re.DOTALL)
            if not info_m:
                info_m = re.search(r'page-title-js">[^<]*</h2>.*?</(?:h[23]|p)>\s*<p>(.*?)</p>', detail_html, re.DOTALL)
            if info_m:
                summary_text = html.unescape(re.sub(r"<[^>]+>", "", info_m.group(1))).strip()

        if date_info:
            (start, end, display), time_str = date_info
        else:
            block_m = re.search(r'page-title-js">[^<]*</h2>\s*(<h[23]>.*?</(?:h[23])>|<p>.*?</p>)', detail_html, re.DOTALL)
            date_block = block_m.group(1) if block_m else ""
            date_text = html.unescape(re.sub(r"<[^>]+>", " ", date_block))
            parsed = parse_date(date_text)
            if not parsed:
                print(f"  - skipping '{title}': no parseable date found")
                continue
            start, end, display = parsed
            time_str = parse_time(date_text)

        if end < date.today():
            continue  # expired

        events.append({
            "title": title,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "when_display": display,
            "time_display": time_str,
            "summary": make_summary(title, display),
            "category": category_for(title, summary_text),
            "attrs": infer_attrs(f"{title} {summary_text}"),
            "source_url": full_url,
            "last_verified": date.today().isoformat(),
        })

    events.sort(key=lambda e: e["start_date"])
    return events


def apply_overrides(events, overrides):
    hidden = set(t.lower() for t in overrides.get("hidden", []))
    events = [e for e in events if e["title"].lower() not in hidden]

    for custom in overrides.get("customEvents", []):
        events.append(custom)

    priority = overrides.get("priority", {})
    events.sort(key=lambda e: (priority.get(e["title"], 999), e.get("start_date", "9999-12-31")))

    featured_title = overrides.get("featured")
    featured = None
    if featured_title:
        featured = next((e for e in events if e["title"].lower() == featured_title.lower()), None)
    if not featured and events:
        featured = min(events, key=lambda e: e.get("start_date", "9999-12-31"))

    coming_up = [e for e in events if e is not featured][:MAX_COMING_UP]
    return featured, coming_up


def escape_html(text: str) -> str:
    return html.escape(text, quote=False)


def render_featured(event) -> str:
    icon_path = CATEGORY_ICONS.get(event.get("category", "default"), CATEGORY_ICONS["default"])
    when = escape_html(event["when_display"])
    time_part = f" &nbsp;|&nbsp; {escape_html(event['time_display'])}" if event.get("time_display") else ""
    attrs_html = "".join(f"<span>{escape_html(a)}</span>" for a in event.get("attrs", []))
    return (
        '    <div class="featured-event">\n'
        '      <div class="fe-media">\n'
        f'        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">{icon_path}</svg>\n'
        '      </div>\n'
        '      <div class="fe-body">\n'
        '        <div class="fe-eyebrow">Featured Event</div>\n'
        f'        <h3>{escape_html(event["title"])}</h3>\n'
        '        <div class="fe-when">\n'
        '          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>\n'
        f'          {when}{time_part}\n'
        '        </div>\n'
        f'        <p class="fe-desc">{escape_html(event["summary"])}</p>\n'
        + (f'        <div class="fe-attrs">{attrs_html}</div>\n' if attrs_html else "")
        + f'        <a href="{event["source_url"]}" target="_blank" rel="noopener" class="fe-cta">See Official Details →</a>\n'
        '      </div>\n'
        '    </div>'
    )


def render_coming_up(events) -> str:
    cards = []
    for e in events:
        when = escape_html(e["when_display"])
        if e.get("time_display"):
            when = f"{when} &nbsp;|&nbsp; {escape_html(e['time_display'])}"
        cards.append(
            '      <div class="cu-card">\n'
            f'        <div class="cu-when">{when}</div>\n'
            f'        <h4>{escape_html(e["title"])}</h4>\n'
            f'        <p>{escape_html(e["summary"])}</p>\n'
            f'        <a href="{e["source_url"]}" target="_blank" rel="noopener" class="cu-go">See Details →</a>\n'
            '      </div>'
        )
    return "\n".join(cards)


def render_section(featured, coming_up) -> str:
    today_display = date.today().strftime("%b. %-d")
    parts = []
    if featured:
        parts.append(render_featured(featured))
    if coming_up:
        parts.append('    <div class="coming-up-label">Coming Up on the Mountain</div>')
        parts.append(f'    <div class="coming-up-grid">\n{render_coming_up(coming_up)}\n    </div>')
    parts.append(
        '    <div class="happening-footer">\n'
        f'      <a href="{INDEX_URL}" target="_blank" rel="noopener" class="full-cal">See the Full Massanutten Event Calendar →</a>\n'
        f'      <span class="updated">Updated from Massanutten Resort · {today_display}</span>\n'
        '    </div>'
    )
    return "\n".join(parts)


def replace_marker(site_html: str, inner: str) -> str:
    pattern = re.compile(re.escape(EVENTS_START) + r".*?" + re.escape(EVENTS_END), re.DOTALL)
    if not pattern.search(site_html):
        print("Could not find EVENTS:AUTO markers in explore-massanutten.html — aborting.")
        sys.exit(1)
    replacement = f"{EVENTS_START}\n{inner}\n    {EVENTS_END}"
    return pattern.sub(replacement, site_html)


def load_overrides() -> dict:
    if not OVERRIDES_JSON.exists():
        return {}
    data = json.loads(OVERRIDES_JSON.read_text(encoding="utf-8"))
    data.pop("_instructions", None)
    return data


def main():
    overrides = load_overrides()

    try:
        index_html = http_get(INDEX_URL)
        events = discover_events(index_html)
    except Exception as exc:  # noqa: BLE001
        print(f"Fetch/parse failed ({exc}) — falling back to last known-good cache.")
        if not CACHE_JSON.exists():
            print("No cache available either — leaving explore-massanutten.html untouched.")
            return
        events = json.loads(CACHE_JSON.read_text(encoding="utf-8"))

    if not events and not overrides.get("customEvents"):
        print("No current events found (real or override) — leaving section as-is rather than blanking it.")
        return

    CACHE_JSON.parent.mkdir(parents=True, exist_ok=True)
    CACHE_JSON.write_text(json.dumps(events, indent=2), encoding="utf-8")

    featured, coming_up = apply_overrides(events, overrides)
    if not featured:
        print("Nothing to feature after overrides/hiding — leaving section as-is.")
        return

    site_html = SITE_HTML.read_text(encoding="utf-8")
    updated_html = replace_marker(site_html, render_section(featured, coming_up))

    if updated_html == site_html:
        print(f"No changes — {len(coming_up) + 1} event(s) already up to date.")
        return

    SITE_HTML.write_text(updated_html, encoding="utf-8")
    print(f"Updated explore-massanutten.html: featured '{featured['title']}' + {len(coming_up)} upcoming.")


if __name__ == "__main__":
    main()
