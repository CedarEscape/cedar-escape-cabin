#!/usr/bin/env python3
"""Sync guest reviews (Airbnb, VRBO and direct) from the Hospitable API into index.html.

Pulls every public review for the property, newest first, and replaces the content
between the REVIEWS:HERO / REVIEWS:CARDS markers in index.html. Reviewers are shown
as "Verified <platform> guest" because the API does not return names by default.

Requires the HOSPITABLE_API_TOKEN environment variable (same token the dashboard
sync uses). Run manually or on a schedule (see .github/workflows/sync-reviews.yml).
"""
import html
import json
import os
import re
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

API_BASE = "https://public.api.hospitable.com/v2"
PROPERTY_ID = "4f05e11c-f631-4f21-9a9f-282819425722"
INDEX_HTML = Path(__file__).resolve().parent.parent / "index.html"
HERO_START = "<!-- REVIEWS:HERO:START -->"
HERO_END = "<!-- REVIEWS:HERO:END -->"
CARDS_START = "<!-- REVIEWS:CARDS:START -->"
CARDS_END = "<!-- REVIEWS:CARDS:END -->"

PLATFORM_LABELS = {"airbnb": "Airbnb", "vrbo": "VRBO", "direct": "direct"}
MIN_RATING = 4

TOKEN = os.environ.get("HOSPITABLE_API_TOKEN")
if not TOKEN:
    print("HOSPITABLE_API_TOKEN not set — aborting.")
    sys.exit(1)


def api_get(path, params=None):
    url = f"{API_BASE}{path}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_all_pages(path):
    items, page = [], 1
    while True:
        data = api_get(path, {"per_page": 100, "page": page})
        items.extend(data.get("data", []))
        meta = data.get("meta", {})
        if not meta.get("has_more_pages") and page >= meta.get("last_page", 1):
            break
        page += 1
    return items


def fetch_reviews():
    reviews = []
    for item in get_all_pages(f"/properties/{PROPERTY_ID}/reviews"):
        public = item.get("public") or {}
        comment = (public.get("review") or "").strip()
        rating = public.get("rating") or 0
        reviewed_at = item.get("reviewed_at")
        if not comment or rating < MIN_RATING or not reviewed_at:
            continue
        platform = (item.get("platform") or "").lower()
        label = f"Verified {PLATFORM_LABELS[platform]} guest" if platform in PLATFORM_LABELS else "Verified guest"
        when = datetime.fromisoformat(reviewed_at.replace("Z", "+00:00"))
        reviews.append((when, label, when.strftime("%B %Y"), comment, int(round(rating))))
    reviews.sort(key=lambda r: r[0], reverse=True)
    return [(label, date, comment, rating) for _, label, date, comment, rating in reviews]


def escape_html(text: str) -> str:
    return html.escape(text, quote=False)


def first_sentence(text: str) -> str:
    match = re.search(r'^.*?[.!?](?=\s|$)', text.strip())
    return match.group(0).strip() if match else text.strip()


def stars(rating: int) -> str:
    return "★" * rating


def render_hero(reviews) -> str:
    label, date, comment, rating = reviews[0]
    parts = [
        '    <div class="quote-mark">"</div>',
        f'    <p class="quote">{escape_html(first_sentence(comment))}</p>',
        f'    <div class="who">{stars(rating)} {escape_html(label)} · {escape_html(date)}</div>',
    ]
    return "\n".join(parts)


def render_cards(reviews) -> str:
    cards = []
    for label, date, comment, rating in reviews:
        cards.append(
            "      <div class=\"review-card\">\n"
            f"        <div class=\"stars\">{stars(rating)}</div>\n"
            f"        <p class=\"quote quote-clamp\">{escape_html(comment)}</p>\n"
            "        <button class=\"review-toggle\" type=\"button\">Read full review</button>\n"
            f"        <div class=\"who\">{escape_html(label)} — {escape_html(date)}</div>\n"
            "      </div>"
        )
    return "\n".join(cards)


def replace_marker(site_html: str, start: str, end: str, inner: str, label: str) -> str:
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if not pattern.search(site_html):
        print(f"Could not find {label} markers in index.html — aborting.")
        sys.exit(1)
    replacement = f"{start}\n{inner}\n      {end}"
    return pattern.sub(lambda _: replacement, site_html)


def main():
    reviews = fetch_reviews()
    if not reviews:
        print("No qualifying reviews returned — leaving index.html untouched.")
        return

    site_html = INDEX_HTML.read_text(encoding="utf-8")
    updated_html = replace_marker(site_html, HERO_START, HERO_END, render_hero(reviews), "REVIEWS:HERO")
    updated_html = replace_marker(updated_html, CARDS_START, CARDS_END, render_cards(reviews), "REVIEWS:CARDS")

    if updated_html == site_html:
        print(f"No changes — {len(reviews)} review(s) already up to date.")
        return

    INDEX_HTML.write_text(updated_html, encoding="utf-8")
    print(f"Updated index.html with {len(reviews)} review(s).")


if __name__ == "__main__":
    main()
