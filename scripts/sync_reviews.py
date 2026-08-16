#!/usr/bin/env python3
"""Sync guest reviews from the public Hospitable direct-booking page into index.html.

Reads the public HTML at SOURCE_URL, extracts each guest review (name, date,
comment), and replaces the content between the REVIEWS:AUTO:START/END markers
in index.html. Run manually or on a schedule (see .github/workflows/sync-reviews.yml).
"""
import html
import re
import sys
import urllib.request
from pathlib import Path

SOURCE_URL = "https://cedarretreat.directstays.com/"
INDEX_HTML = Path(__file__).resolve().parent.parent / "index.html"
START_MARKER = "<!-- REVIEWS:AUTO:START -->"
END_MARKER = "<!-- REVIEWS:AUTO:END -->"

NAME_RE = re.compile(r'<div class="mb-1 font-medium ">(.*?)</div>', re.DOTALL)
DATE_RE = re.compile(r'<div class="mt-3 mb-2 text-sm text-gray-500">\s*(.*?)\s*</div>', re.DOTALL)
COMMENT_RE = re.compile(r'<span x-show="!showingOriginal">(.*?)</span>', re.DOTALL)


def fetch_reviews(html_text: str):
    names = NAME_RE.findall(html_text)
    dates = DATE_RE.findall(html_text)
    comments = COMMENT_RE.findall(html_text)

    reviews = []
    for name, date, comment in zip(names, dates, comments):
        clean_comment = html.unescape(comment.strip())
        clean_name = html.unescape(name.strip())
        clean_date = html.unescape(date.strip())
        if clean_comment and clean_name:
            reviews.append((clean_name, clean_date, clean_comment))
    return reviews


def escape_html(text: str) -> str:
    return html.escape(text, quote=False)


def first_sentence(text: str) -> str:
    match = re.search(r'^.*?[.!?](?=\s|$)', text.strip())
    return match.group(0).strip() if match else text.strip()


def render_reviews(reviews) -> str:
    featured_name, featured_date, featured_comment = reviews[0]
    featured_who = f"★★★★★ {escape_html(featured_name)} · {escape_html(featured_date)}" if featured_date else f"★★★★★ {escape_html(featured_name)}"
    parts = [
        '    <div class="quote-mark">"</div>',
        f'    <p class="quote">{escape_html(first_sentence(featured_comment))}</p>',
        f'    <div class="who">{featured_who}</div>',
    ]

    if reviews:
        more_cards = []
        for name, date, comment in reviews:
            who = f"{escape_html(name)} — {escape_html(date)}" if date else escape_html(name)
            more_cards.append(
                "      <div class=\"review-card\">\n"
                "        <div class=\"stars\">★★★★★</div>\n"
                f"        <p class=\"quote\">{escape_html(comment)}</p>\n"
                f"        <div class=\"who\">{who}</div>\n"
                "      </div>"
            )
        parts.append('    <div class="reviews-more">')
        parts.extend(more_cards)
        parts.append('    </div>')

    return "\n".join(parts)


def main():
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        source_html = resp.read().decode("utf-8", errors="replace")

    reviews = fetch_reviews(source_html)
    if not reviews:
        # Not a failure: the property may simply have no reviews live on the
        # source page right now (e.g. between guests). Only a fetch/parse
        # exception above should fail this job loudly.
        print("No reviews found on source page — leaving index.html untouched.")
        return

    new_block = render_reviews(reviews)

    site_html = INDEX_HTML.read_text(encoding="utf-8")
    pattern = re.compile(
        re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER), re.DOTALL
    )
    if not pattern.search(site_html):
        print("Could not find REVIEWS:AUTO markers in index.html — aborting.")
        sys.exit(1)

    replacement = f"{START_MARKER}\n{new_block}\n      {END_MARKER}"
    updated_html = pattern.sub(replacement, site_html)

    if updated_html == site_html:
        print(f"No changes — {len(reviews)} review(s) already up to date.")
        return

    INDEX_HTML.write_text(updated_html, encoding="utf-8")
    print(f"Updated index.html with {len(reviews)} review(s).")


if __name__ == "__main__":
    main()
