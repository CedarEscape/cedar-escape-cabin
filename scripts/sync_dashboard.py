#!/usr/bin/env python3
"""Refresh the owner dashboard's auto-computed sections from live Hospitable data.

Read-only: this script only ever calls GET endpoints on Hospitable's public API.
It never creates, updates, or cancels reservations, and never touches the calendar.

Requires the HOSPITABLE_API_TOKEN environment variable (a Personal Access Token
with at least pat:read scope). Run manually or on a schedule (see
.github/workflows/sync-dashboard.yml).
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API_BASE = "https://public.api.hospitable.com/v2"
PROPERTY_ID = "4f05e11c-f631-4f21-9a9f-282819425722"
DASHBOARD_HTML = Path(__file__).resolve().parent.parent / "owner-dashboard.html"

TOKEN = os.environ.get("HOSPITABLE_API_TOKEN")
if not TOKEN:
    print("HOSPITABLE_API_TOKEN not set — aborting.")
    sys.exit(1)


def api_get(path, params=None):
    url = f"{API_BASE}{path}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_all_pages(path, params=None):
    params = dict(params or {})
    params.setdefault("per_page", 100)
    page = 1
    items = []
    while True:
        params["page"] = page
        data = api_get(path, params)
        items.extend(data.get("data", []))
        meta = data.get("meta", {})
        if not meta.get("has_more_pages") and page >= meta.get("last_page", 1):
            break
        page += 1
    return items


def cents_to_dollars(amount_cents):
    return (amount_cents or 0) / 100.0


def fmt_money(dollars):
    return f"${dollars:,.2f}"


def main():
    today = datetime.now(timezone.utc).date()
    start_date = (today - timedelta(days=365)).isoformat()
    end_date = (today + timedelta(days=365)).isoformat()

    reservations = get_all_pages(
        "/reservations",
        {
            "properties[]": PROPERTY_ID,
            "start_date": start_date,
            "end_date": end_date,
            "date_query": "checkin",
            "status[]": "accepted",
            "include": "financials,guest",
        },
    )

    inquiries = get_all_pages("/inquiries", {"properties[]": PROPERTY_ID})

    reviews = get_all_pages(f"/properties/{PROPERTY_ID}/reviews")

    # --- Revenue by channel (real guest stays only, excludes owner stays) ---
    channels = {"direct": [], "airbnb": [], "booking": [], "homeaway": []}
    guest_emails = {}
    total_nights = 0
    total_bookings = 0

    for r in reservations:
        if r.get("stay_type") != "guest_stay":
            continue
        platform = r.get("platform")
        if platform not in channels:
            continue
        financials = r.get("financials") or {}
        host = financials.get("host") or {}
        revenue = host.get("revenue")
        accommodation = host.get("accommodation")
        if revenue is None or accommodation is None:
            continue
        revenue_dollars = cents_to_dollars(revenue["amount"])
        accommodation_dollars = cents_to_dollars(accommodation["amount"])
        fees_dollars = sum(cents_to_dollars(f["amount"]) for f in host.get("host_fees", []))
        nights = r.get("nights", 0)

        channels[platform].append({
            "revenue": revenue_dollars,
            "accommodation": accommodation_dollars,
            "fees": abs(fees_dollars),
            "nights": nights,
        })
        total_nights += nights
        total_bookings += 1

        guest = r.get("guest") or {}
        email = guest.get("email")
        if email and platform == "direct":
            guest_emails[email] = guest_emails.get(email, 0) + 1

    rows_html = []
    grand_bookings = 0
    grand_nights = 0
    grand_revenue = 0.0

    badge_labels = [
        ("direct", "Direct"),
        ("airbnb", "Airbnb"),
        ("booking", "Booking.com"),
        ("homeaway", "VRBO"),
    ]

    for key, label in badge_labels:
        entries = channels[key]
        n_bookings = len(entries)
        n_nights = sum(e["nights"] for e in entries)
        n_revenue = sum(e["revenue"] for e in entries)
        n_accommodation = sum(e["accommodation"] for e in entries)
        n_fees = sum(e["fees"] for e in entries)
        avg = n_revenue / n_bookings if n_bookings else None
        fee_pct = (n_fees / n_accommodation * 100) if n_accommodation else None

        grand_bookings += n_bookings
        grand_nights += n_nights
        grand_revenue += n_revenue

        if n_bookings == 0:
            row = (
                f'        <tr>\n'
                f'          <td><span class="badge {key}">{label}</span></td>\n'
                f'          <td class="num">0</td>\n'
                f'          <td class="num">0</td>\n'
                f'          <td class="num">—</td>\n'
                f'          <td class="num">—</td>\n'
                f'          <td class="num">—</td>\n'
                f'        </tr>'
            )
        else:
            fee_str = f"~{fee_pct:.0f}%" if fee_pct is not None else "—"
            row = (
                f'        <tr>\n'
                f'          <td><span class="badge {key}">{label}</span></td>\n'
                f'          <td class="num">{n_bookings}</td>\n'
                f'          <td class="num">{n_nights}</td>\n'
                f'          <td class="num">{fmt_money(n_revenue)}</td>\n'
                f'          <td class="num">{fmt_money(avg)}</td>\n'
                f'          <td class="num">{fee_str}</td>\n'
                f'        </tr>'
            )
        rows_html.append(row)

    grand_avg = grand_revenue / grand_bookings if grand_bookings else 0
    rows_html.append(
        f'        <tr class="total">\n'
        f'          <td>Total</td>\n'
        f'          <td class="num">{grand_bookings}</td>\n'
        f'          <td class="num">{grand_nights}</td>\n'
        f'          <td class="num">{fmt_money(grand_revenue)}</td>\n'
        f'          <td class="num">{fmt_money(grand_avg)}</td>\n'
        f'          <td class="num">—</td>\n'
        f'        </tr>'
    )
    revenue_table_html = "\n".join(rows_html)

    # --- Booking funnel (Booking.com inquiries vs bookings) ---
    booking_inquiries = [i for i in inquiries if i.get("platform") == "booking"]
    direct_inquiries = [i for i in inquiries if i.get("platform") == "direct"]
    booking_bookings = len(channels["booking"])
    direct_bookings = len(channels["direct"])
    conv_rate = (booking_bookings / len(booking_inquiries) * 100) if booking_inquiries else 0

    funnel_html = (
        '    <div class="stat-row">\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Booking.com Inquiries</div>\n'
        f'        <div class="value">{len(booking_inquiries)}</div>\n'
        '        <div class="sub">all time</div>\n'
        '      </div>\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Booking.com Bookings</div>\n'
        f'        <div class="value">{booking_bookings}</div>\n'
        '        <div class="sub">accepted reservations</div>\n'
        '      </div>\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Est. Conversion Rate</div>\n'
        f'        <div class="value">~{conv_rate:.0f}%</div>\n'
        '        <div class="sub">most inquiries did not book</div>\n'
        '      </div>\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Direct Inquiries</div>\n'
        f'        <div class="value">{len(direct_inquiries)}</div>\n'
        f'        <div class="sub">{direct_bookings} total direct bookings (not all follow an inquiry)</div>\n'
        '      </div>\n'
        '    </div>'
    )

    # --- Guest stats ---
    repeat_guests = sum(1 for count in guest_emails.values() if count > 1)
    avg_group = 0
    real_guest_reservations = [r for r in reservations if r.get("stay_type") == "guest_stay" and r.get("platform") in channels]
    if real_guest_reservations:
        avg_group = sum((r.get("guests") or {}).get("total", 0) for r in real_guest_reservations) / len(real_guest_reservations)

    guest_html = (
        '    <div class="stat-row">\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Total Real Bookings</div>\n'
        f'        <div class="value">{grand_bookings}</div>\n'
        '      </div>\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Total Nights Booked</div>\n'
        f'        <div class="value">{grand_nights}</div>\n'
        '      </div>\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Avg Group Size</div>\n'
        f'        <div class="value">{avg_group:.2f}</div>\n'
        '      </div>\n'
        '      <div class="stat-card">\n'
        '        <div class="label">Repeat Direct Guests</div>\n'
        f'        <div class="value">{repeat_guests}</div>\n'
        '        <div class="sub">guests who booked direct more than once</div>\n'
        '      </div>\n'
        '    </div>'
    )

    # --- Reviews (direct/Hospitable only — Google stays manual) ---
    direct_review_count = len(reviews)

    # --- Write it all back ---
    html = DASHBOARD_HTML.read_text(encoding="utf-8")

    def replace_marker(html, name, new_inner):
        pattern = re.compile(
            r"(<!-- DASHBOARD:" + name + r":START -->)(.*?)(<!-- DASHBOARD:" + name + r":END -->)",
            re.DOTALL,
        )
        if not pattern.search(html):
            print(f"WARNING: marker {name} not found, skipping.")
            return html
        return pattern.sub(lambda m: m.group(1) + new_inner + m.group(3), html)

    timestamp_str = f"Last updated {today.strftime('%b %-d, %Y')} (auto)"
    html = replace_marker(html, "TIMESTAMP", timestamp_str)
    html = replace_marker(html, "BOOKING_FUNNEL", "\n" + funnel_html + "\n    ")
    html = replace_marker(html, "REVENUE_TABLE", "\n" + revenue_table_html + "\n        ")
    html = replace_marker(html, "GUEST_STATS", "\n" + guest_html + "\n    ")
    html = replace_marker(html, "DIRECT_REVIEWS", f'<div class="value">{direct_review_count}</div>')

    DASHBOARD_HTML.write_text(html, encoding="utf-8")
    print(f"Dashboard refreshed: {grand_bookings} bookings, {fmt_money(grand_revenue)} total revenue, {direct_review_count} direct review(s).")


if __name__ == "__main__":
    main()
