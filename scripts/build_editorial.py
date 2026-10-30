#!/usr/bin/env python3
"""Cedar Escape editorial system (no dependencies, run from the repo root).

  python3 scripts/build_editorial.py

What it does
  1. Reads data/articles.json (one entry per article, each assigned to a collection).
  2. Builds every "built": "five" article (The Cedar Escape Five) from its data file in
     data/five/<name>.json using the shared template below -> guides/<slug>.html
  3. Rewrites the grouped "Local Travel Guides" section on /explore-massanutten
     (between the editorial:start / editorial:end markers). A collection with no
     published article is skipped, so an empty series never shows.
  4. Adds a sitemap entry for each published article and an isPartOf/articleSection
     series tag to the hand-built Travel Collection guides' structured data.

To publish a new Five: copy data/five/winter-massanutten.json, edit it, add an entry to
data/articles.json (status "published"), run this script, commit the changed files.
Only articles with "status": "published" appear on the Things to Do page and sitemap.
"""
import json, re, html, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s):
    os.makedirs(os.path.dirname(os.path.join(ROOT, p)), exist_ok=True)
    open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)

SITE = 'https://cedarescapecabin.com'
reg = json.loads(rd('data/articles.json'))
COLL = {c['id']: c for c in reg['collections']}
esc = html.escape

# ----------------------------------------------------------------------------------
# Shared site chrome (header, footer, contact form + their CSS) taken from an existing page
# ----------------------------------------------------------------------------------
CHROME_SOURCE = 'cedar-escape-ski-weekend.html'

def _rules(css):
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        depth, k = 1, j + 1
        while k < n and depth:
            depth += (css[k] == '{') - (css[k] == '}'); k += 1
        out.append(css[i:k].strip()); i = k
    return out

def chrome():
    src = rd(CHROME_SOURCE)
    style = re.sub(r'/\*.*?\*/', '', re.search(r'<style>(.*?)</style>', src, re.S).group(1), flags=re.S)
    keep = re.compile(r'(^:root|^\*|^html|^body|^@media \(prefers-reduced|^a \{|^:focus|^\.wrap|^\.eyebrow|^h1, h2|^p \{|^header|^\.nav|^\.wordmark|^\.btn|^\.burger|^@media \(min-width: 880px\)|^@media \(max-width: 879\.98px\) \{\s*\.nav-links|^footer|^\.foot|^@media \(min-width: 760px\) \{ \.foot|^\.contact|^\.req|^\.floating-message-btn|^@media \(max-width: 879\.98px\) \{ \.floating)', re.S)
    css = '\n'.join(r for r in _rules(style) if keep.match(r) and 'ask-cedar' not in r and 'mobile-sticky' not in r)
    head_top = src[:src.index('<meta charset')]  # analytics + opt-out snippet, same on every page
    nav = src[src.index('<header>'):src.index('</script>', src.index('<header>')) + 9]
    footer = src[src.index('<footer>'):src.index('</footer>') + 9]
    contact = src[src.index('<div class="contact-modal-overlay"'):src.index('</body>')]
    return dict(css=css, head_top=head_top, nav=nav, footer=footer, contact=contact)

# ----------------------------------------------------------------------------------
# Icons
# ----------------------------------------------------------------------------------
def ico(p): return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
                    'stroke-linejoin="round" aria-hidden="true">' + p + '</svg>')
ICONS = {
 'snow': ico('<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9 4.5l3 2 3-2M9 19.5l3-2 3 2"/>'),
 'wave': ico('<path d="M3 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2M3 15c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2"/>'),
 'palette': ico('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a3 3 0 0 0 3-3A9 9 0 0 0 12 3ZM8 11h.01M12 7h.01M16 9h.01"/>'),
 'fork': ico('<path d="M7 3v8a2 2 0 0 0 2 2v8M7 3v5M11 3v5M17 3c-2 1-3 4-3 7h3v11"/>'),
 'mtn': ico('<path d="M3 20 10 7l4 6 2-3 5 10H3Z"/>'),
 'pine': ico('<path d="M12 3 7 11h3l-4 6h5v4h2v-4h5l-4-6h3L12 3Z"/>'),
 'clock': ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
 'arrow': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
}
TREE = '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" d="M20 2 12 14h4l-7 10h6l-6 9h22l-6-9h6l-7-10h4z"/></svg>'

# ----------------------------------------------------------------------------------
# The Cedar Escape Five: page template
# ----------------------------------------------------------------------------------
FIVE_CSS = '''
  html { scroll-padding-top: 84px; }
  .f5-hero { position: relative; color: #fff; min-height: clamp(460px, 58vw, 620px); display: flex; align-items: flex-end; overflow: hidden; background: var(--forest-deep); isolation: isolate; }
  .f5-hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
  .f5-hero::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(15,22,14,0.35) 0%, rgba(15,22,14,0.55) 50%, rgba(15,22,14,0.9) 100%); }
  @media (min-width: 900px) { .f5-hero::before { background: linear-gradient(90deg, rgba(15,22,14,0.86) 0%, rgba(15,22,14,0.55) 48%, rgba(15,22,14,0.05) 100%), linear-gradient(180deg, rgba(15,22,14,0) 62%, rgba(15,22,14,0.4) 100%); } }
  .f5-hero-inner { width: 100%; max-width: var(--wrap); margin: 0 auto; padding: 110px 32px 56px; }
  @media (max-width: 600px) { .f5-hero-inner { padding: 96px 22px 44px; } }
  .f5-tag { display: inline-flex; align-items: center; gap: 9px; background: var(--gold); color: var(--forest-deep); font-family: 'Cinzel', serif; font-weight: 600; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; padding: 9px 14px; border-radius: 2px; }
  .f5-tag svg { width: 15px; height: 15px; flex: none; }
  .f5-hero h1 { font-family: 'Playfair Display', serif; font-weight: 600; line-height: 0.98; letter-spacing: -0.015em; font-size: clamp(42px, 8.2vw, 92px); margin: 20px 0 18px; max-width: 11em; text-shadow: 0 2px 18px rgba(0,0,0,0.45); }
  .f5-sub { font-family: 'Cinzel', serif; font-weight: 500; font-size: clamp(11.5px, 1.5vw, 15px); letter-spacing: 0.22em; text-transform: uppercase; line-height: 1.8; max-width: 38em; color: rgba(250,246,238,0.92); }
  .f5-by { margin-top: 26px; display: flex; align-items: center; gap: 12px; }
  .f5-by svg { width: 38px; height: 38px; color: var(--gold-bright); flex: none; }
  .f5-by span { display: block; font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
  .f5-by span + span { font-size: 9.5px; color: rgba(250,246,238,0.7); margin-top: 3px; }
  .f5-meta { margin-top: 14px; font-size: 12.5px; color: rgba(250,246,238,0.78); }

  .f5-lead { padding: 44px 0 6px; }
  .f5-lead p { max-width: 760px; margin: 0 auto; text-align: center; font-family: 'Playfair Display', serif; font-style: italic; font-size: clamp(19px, 2.2vw, 24px); line-height: 1.5; color: var(--forest-deep); }
  .f5-crumb { font-size: 12.5px; color: var(--taupe); padding: 16px 0 0; }
  .f5-crumb a { color: inherit; }

  .f5-grid { display: grid; grid-template-columns: 1fr; gap: 22px; padding: 30px 0 18px; }
  @media (min-width: 700px) { .f5-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1000px) { .f5-grid { grid-template-columns: repeat(6, 1fr); gap: 24px; } .f5-card.wide { grid-column: span 3; } .f5-card.third { grid-column: span 2; } }
  .f5-card { background: var(--forest-deep); color: var(--cream); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 18px 38px rgba(35,45,29,0.22); scroll-margin-top: 90px; }
  .f5-img { position: relative; aspect-ratio: 16/9; background: linear-gradient(155deg, var(--forest) 0%, #1b2417 100%); overflow: hidden; }
  .f5-card.third .f5-img { aspect-ratio: 4/3; }
  .f5-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .f5-img::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15,22,14,0.5) 0%, rgba(15,22,14,0) 45%); pointer-events: none; }
  .f5-img .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--gold-bright); opacity: 0.9; }
  .f5-img .ph svg { width: 72px; height: 72px; }
  .f5-num { position: absolute; z-index: 2; top: 8px; left: 16px; font-family: 'Playfair Display', serif; font-weight: 500; font-size: clamp(54px, 6vw, 76px); line-height: 1; color: #fff; text-shadow: 0 2px 16px rgba(0,0,0,0.55); }
  .f5-cap { position: absolute; z-index: 2; right: 8px; bottom: 6px; font-size: 10.5px; color: rgba(255,255,255,0.88); background: rgba(15,22,14,0.55); padding: 2px 7px; border-radius: 2px; }
  .f5-body { padding: 20px 24px 24px; display: flex; flex-direction: column; flex: 1; }
  .f5-head { display: flex; gap: 14px; align-items: flex-start; }
  .f5-ic { flex: none; width: 46px; height: 46px; border-radius: 50%; border: 1px solid var(--gold); color: var(--gold-bright); display: flex; align-items: center; justify-content: center; }
  .f5-ic svg { width: 24px; height: 24px; }
  .f5-card h2 { font-family: 'Playfair Display', serif; font-weight: 500; font-size: clamp(21px, 2.1vw, 26px); line-height: 1.15; color: var(--cream); margin-top: 2px; }
  .f5-card p { font-size: 15px; line-height: 1.6; color: rgba(250,246,238,0.86); margin-top: 14px; }
  .f5-notes { list-style: none; margin: 14px 0 0; padding: 0; }
  .f5-notes li { position: relative; padding-left: 16px; font-size: 13.5px; line-height: 1.55; color: rgba(250,246,238,0.74); margin-top: 8px; }
  .f5-notes li::before { content: ''; position: absolute; left: 0; top: 0.62em; width: 6px; height: 6px; background: var(--gold); transform: rotate(45deg); }
  .f5-links { margin-top: auto; padding-top: 18px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
  .f5-links a.t { font-size: 13.5px; font-weight: 700; color: var(--gold-bright); text-decoration: none; border-bottom: 1px solid rgba(214,177,92,0.55); padding-bottom: 2px; }
  .f5-links a.t:hover { color: #fff; border-color: #fff; }
  .f5-links a.go { margin-left: auto; flex: none; width: 46px; height: 46px; border-radius: 50%; background: var(--gold); color: var(--forest-deep); display: flex; align-items: center; justify-content: center; transition: transform .2s; }
  .f5-links a.go:hover { transform: translateX(3px); }
  .f5-links a.go svg { width: 20px; height: 20px; }

  .f5-close { margin-top: 26px; background: linear-gradient(100deg, #FBF7EE 0%, #F2EBDD 100%); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; display: grid; box-shadow: 0 14px 30px rgba(35,45,29,0.12); }
  @media (min-width: 900px) { .f5-close { grid-template-columns: 1.05fr 1fr; } }
  .f5-close .txt { padding: 36px 34px; align-self: center; }
  .f5-close .k { display: flex; align-items: center; gap: 14px; font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--forest-deep); font-weight: 600; }
  .f5-close .k::after { content: ''; flex: 1; max-width: 90px; height: 1px; background: var(--gold); }
  .f5-close h2 { font-family: 'Playfair Display', serif; font-weight: 600; font-size: clamp(30px, 4vw, 44px); line-height: 1.06; color: var(--forest-deep); margin: 16px 0 14px; }
  .f5-close p { font-size: 15.5px; color: #3f3a30; max-width: 40ch; }
  .f5-close .btn { margin-top: 22px; padding: 14px 26px; font-size: 13.5px; }
  .f5-close .save { margin-top: 12px; font-size: 14px; font-style: italic; color: #5a5346; }
  .f5-close .ph { display: grid; grid-template-columns: 1fr 1fr; min-height: 260px; }
  .f5-close .ph figure { margin: 0; position: relative; }
  .f5-close .ph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  @media (max-width: 560px) { .f5-close .ph { grid-template-columns: 1fr; min-height: 0; } .f5-close .ph figure { aspect-ratio: 3/2; } }
  .f5-fine { margin-top: 18px; font-size: 12.5px; color: var(--taupe); text-align: center; }
  .f5-credits { padding: 26px 0 44px; }
  .f5-credits h2 { font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--taupe); margin-bottom: 8px; }
  .f5-credits p { font-size: 12.5px; line-height: 1.6; color: #6b6558; max-width: 90ch; }
  .f5-credits a { color: inherit; }
  .f5-back { display: inline-block; margin-top: 12px; font-size: 14px; font-weight: 700; color: var(--forest-deep); text-decoration-color: var(--gold); text-underline-offset: 3px; }
  .btn-gold, .btn-gold:hover { color: var(--forest-deep); }
'''

def five_page(d):
    c = chrome()
    url = f"{SITE}/guides/{d['slug']}"
    coll = COLL['five']
    img = d['hero']
    og = f"{SITE}/{img['src']}"
    # --- structured data
    article = {
        "@context": "https://schema.org", "@type": "Article", "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "headline": d['title'], "alternativeHeadline": d['subtitle'],
        "description": next(a for a in reg['articles'] if a['slug'] == d['slug'])['description'],
        "image": [og], "datePublished": d['published'], "dateModified": d['updated'], "inLanguage": "en-US",
        "articleSection": coll['name'],
        "isPartOf": {"@type": "CreativeWorkSeries", "name": coll['name']},
        "author": {"@type": "Organization", "name": "Cedar Escape", "url": SITE + "/"},
        "publisher": {"@type": "Organization", "name": "Cedar Escape", "url": SITE + "/",
                      "logo": {"@type": "ImageObject", "url": f"{SITE}/images/guides/jmu-hero-800.jpg"}},
    }
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Things to Do", "item": SITE + "/explore-massanutten"},
        {"@type": "ListItem", "position": 3, "name": d['title'], "item": url}]}
    meta_desc = article['description']
    head = c['head_top'] + f'''<meta charset="UTF-8">
<meta name="google-site-verification" content="fluRb5pqQbRyoYBszjH6r6vUlKDnWXYRyJcgYh6-Ww0" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(d['seo_title'])}</title>
<meta name="description" content="{esc(meta_desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Cedar Escape">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(d['seo_title'])}">
<meta property="og:description" content="{esc(meta_desc)}">
<meta property="og:image" content="{og}">
<meta property="article:published_time" content="{d['published']}">
<meta property="article:modified_time" content="{d['updated']}">
<meta property="article:section" content="{esc(coll['name'])}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{json.dumps(crumbs, ensure_ascii=False)}</script>
<script type="application/ld+json">{json.dumps(article, ensure_ascii=False)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
'''
    # --- cards
    cards = []
    for it in d['items']:
        im = it.get('image')
        if im:
            cap = f'<span class="f5-cap">{esc(im["caption"])}</span>' if im.get('caption') else ''
            media = f'<img src="/{im["src"]}" width="900" height="600" loading="lazy" alt="{esc(im["alt"])}">{cap}'
        else:
            media = f'<div class="ph">{ICONS[it["icon"]]}</div>'
        notes = ''.join(f'<li>{esc(n)}</li>' for n in it['notes'])
        links = ''
        primary = None
        for l in it['links']:
            if l.get('primary'): primary = l
            links += f'<a class="t" href="{l["url"]}" target="_blank" rel="noopener">{esc(l["label"])}</a>'
        go = f'<a class="go" href="{primary["url"]}" target="_blank" rel="noopener" aria-label="{esc(primary["label"])}">{ICONS["arrow"]}</a>' if primary else ''
        cards.append(f'''    <article class="f5-card {it['size']}" id="item-{it['n']}">
      <div class="f5-img"><span class="f5-num">{it['n']}</span>{media}</div>
      <div class="f5-body">
        <div class="f5-head"><span class="f5-ic">{ICONS[it['icon']]}</span><h2>{esc(it['title'])}</h2></div>
        <p>{esc(it['body'])}</p>
        <ul class="f5-notes">{notes}</ul>
        <div class="f5-links">{links}{go}</div>
      </div>
    </article>''')
    cl = d['closing']
    ph = ''.join(f'<figure><img src="/{x["src"]}" width="900" height="600" loading="lazy" alt="{esc(x["alt"])}" style="object-position:{x.get("position","50% 50%")}"></figure>' for x in cl['images'])
    body = f'''<main>
<div class="f5-hero">
  <img src="/{img['src']}" srcset="/{img['src_small']} 800w, /{img['src']} 1600w" sizes="100vw" width="1600" height="1064" alt="{esc(img['alt'])}" style="object-position:{img.get('position','50% 50%')}" fetchpriority="high">
  <div class="f5-hero-inner">
    <span class="f5-tag">{TREE} {esc(coll['name'])} · {esc(d['issue'])}</span>
    <h1>{esc(d['title'])}</h1>
    <p class="f5-sub">{esc(d['subtitle'])}</p>
    <div class="f5-by">{ICONS['mtn']}<div><span>Presented by Cedar Escape</span></div></div>
    <p class="f5-meta">Published <time datetime="{d['published']}">{d['published']}</time></p>
  </div>
</div>

<div class="wrap">
  <p class="f5-crumb"><a href="/">Home</a> / <a href="/explore-massanutten#local-guides">Things to Do</a> / {esc(coll['name'])}</p>
  <div class="f5-lead"><p>{esc(d['intro'])}</p></div>
  <div class="f5-grid">
{chr(10).join(cards)}
  </div>

  <section class="f5-close" aria-labelledby="closing-title">
    <div class="txt">
      <div class="k">{esc(cl['eyebrow'])}</div>
      <h2 id="closing-title">{esc(cl['title'])}</h2>
      <p>{esc(cl['body'])}</p>
      <a class="btn btn-gold" href="{cl['cta_url']}">{esc(cl['cta'])} <span aria-hidden="true">&rarr;</span></a>
      <p class="save">{esc(cl['note'])}</p>
    </div>
    <div class="ph">{ph}</div>
  </section>
  <p class="f5-fine">{esc(d['disclaimer'])}</p>
</div>

<section class="f5-credits" aria-label="Photo credits">
  <div class="wrap">
    <h2>Photo credits</h2>
    <p>{d['credits']}</p>
    <p>Last updated <time datetime="{d['updated']}">{d['updated']}</time>.</p>
    <a class="f5-back" href="/explore-massanutten#local-guides">&larr; Back to Things to Do</a>
  </div>
</section>
</main>'''
    return (head + '<style>\n' + c['css'] + '\n' + FIVE_CSS + '\n</style>\n</head>\n<body>\n\n' + c['nav'] + '\n' + body +
            '\n' + c['footer'] + '\n\n<a href="#" class="js-open-contact floating-message-btn">Message Us</a>\n\n' + c['contact'])

# ----------------------------------------------------------------------------------
# Things to Do: grouped editorial section
# ----------------------------------------------------------------------------------
GUIDES_CSS = '''  .lg-series { max-width: 1020px; margin: 0 auto 46px; }
  .lg-series:last-child { margin-bottom: 0; }
  .lg-series-head { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
  .lg-badge { flex: none; display: inline-flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-weight: 600; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; padding: 6px 10px; border-radius: 2px; }
  .lg-badge.travel-collection { background: var(--forest-deep); color: var(--gold-bright); }
  .lg-badge.five { background: var(--gold); color: var(--forest-deep); }
  .lg-badge.valley-edit { background: var(--cream-deep); color: var(--forest-deep); border: 1px solid var(--gold); }
  .lg-series-head h3 { font-family: 'Cinzel', serif; font-size: 15px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--forest-deep); font-weight: 600; }
  .lg-series > p { font-size: 14.5px; color: #4b453b; margin: 0 0 18px; }
  .lg-card .lg-k { display: flex; align-items: center; gap: 8px; }
'''
def guides_section():
    pub = [a for a in reg['articles'] if a['status'] == 'published']
    blocks = []
    for c in reg['collections']:
        arts = [a for a in pub if a['collection'] == c['id']]
        if not arts: continue            # an empty series is never shown
        arts.sort(key=lambda a: a['published'], reverse=True)
        cards = ''
        for a in arts:
            cards += f'''
        <a class="lg-card" href="/guides/{a['slug']}">
          <div class="lg-img"><img src="{a['image']}" loading="lazy" width="800" height="600" alt="{esc(a['imageAlt'])}"></div>
          <div class="lg-body">
            <div class="lg-k">{esc(a['tag'])}</div>
            <h3>{esc(a['title'])}</h3>
            <p>{esc(a['subtitle'])}</p>
            <span class="lg-go">Read the Guide &rarr;</span>
          </div>
        </a>'''
        blocks.append(f'''
    <div class="lg-series" id="series-{c['id']}">
      <div class="lg-series-head"><span class="lg-badge {c['id']}">{esc(c['label'])}</span><h3>{esc(c['name'])}</h3></div>
      <p>{esc(c['description'])}</p>
      <div class="lg-grid" style="margin:0;">{cards}
      </div>
    </div>''')
    return '\n'.join(blocks)

def update_explore():
    p = 'explore-massanutten.html'
    s = rd(p)
    sec_re = re.compile(r'<section id="local-guides".*?</section>', re.S)
    new = f'''<section id="local-guides" style="background:var(--cream);">
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow2">Cedar Escape Editorial</div>
      <h2>Local Travel Guides</h2>
      <p>In-depth guides and quick reads to help you plan the trip around your stay.</p>
    </div>
    <!-- editorial:start (generated by scripts/build_editorial.py from data/articles.json) -->{guides_section()}
    <!-- editorial:end -->
  </div>
</section>'''
    assert sec_re.search(s), 'local-guides section not found'
    s = sec_re.sub(lambda m: new, s, count=1)
    if '.lg-series {' not in s:
        s = s.replace('  .lg-card .lg-go {', GUIDES_CSS + '  .lg-card .lg-go {', 1)
        assert '.lg-series {' in s
    wr(p, s)

def update_sitemap():
    p = 'sitemap.xml'; s = rd(p)
    for a in reg['articles']:
        if a['status'] != 'published': continue
        loc = f"{SITE}/guides/{a['slug']}"
        line = f'  <url><loc>{loc}</loc><lastmod>{a["updated"]}</lastmod></url>\n'
        if loc in s:
            s = re.sub(r'<url><loc>' + re.escape(loc) + r'</loc><lastmod>[^<]*</lastmod></url>', line.strip(), s)
        else:
            s = s.replace('</urlset>', line + '</urlset>')
    wr(p, s)

def tag_series_on_handbuilt():
    """Add the same series metadata to hand-built guides' Article JSON-LD (no visible change)."""
    for a in reg['articles']:
        if a.get('built') != 'hand': continue
        p = f"guides/{a['slug']}.html"
        s = rd(p)
        coll = COLL[a['collection']]
        def fix(m):
            d = json.loads(m.group(1))
            if d.get('@type') == 'Article':
                d['articleSection'] = coll['name']
                d['isPartOf'] = {"@type": "CreativeWorkSeries", "name": coll['name']}
            return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + '</script>'
        s2 = re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix, s, flags=re.S)
        if s2 != s: wr(p, s2)

def main():
    for a in reg['articles']:
        if a.get('built') == 'five':
            d = json.loads(rd(a['source']))
            wr(f"guides/{a['slug']}.html", five_page(d))
            print('built guides/%s.html' % a['slug'])
    update_explore(); update_sitemap(); tag_series_on_handbuilt()
    pub = [a['slug'] for a in reg['articles'] if a['status'] == 'published']
    print('published articles listed:', pub)

if __name__ == '__main__':
    main()
