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

The Valley Edit (seasonal editions, master template valley_page): copy data/valley/<edition>.json,
set "season" (holiday / winter / spring / summer) for the accent colour, add an entry with
"built": "valley" and "source": "data/valley/<edition>.json" to data/articles.json. Keep
"status": "draft" until approved (draft pages are built with noindex and are not listed or in
the sitemap); change it to "published" to go live. PREVIEW_DRAFTS=1 lists drafts for screenshots only.

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
# The Valley Edit: master template (seasonal editions). Accent colour changes per season.
# ----------------------------------------------------------------------------------
ACCENTS = {   # accent, deeper accent (text on ivory), soft tint (panels)
 'holiday': ('#8A2A3F', '#6E1D31', '#F5E8E6'),   # mulled-wine / cranberry
 'winter':  ('#5C7C99', '#3F5B76', '#E8EEF3'),   # muted frosted blue
 'spring':  ('#7E9A7B', '#587556', '#EBF0E6'),   # sage / blush
 'summer':  ('#C0674A', '#9A4A31', '#F7E9E1'),   # terracotta / coral
}
ICONS.update({
 'calendar': ico('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>'),
 'leaf': ico('<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c2-4 5-7 9-9"/>'),
 'star': ico('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>'),
 'cup': ico('<path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-4Z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3c-.6 1 .6 1.6 0 3M12 3c-.6 1 .6 1.6 0 3"/>'),
 'pin': ico('<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>'),
 'binoculars': ico('<circle cx="7" cy="16" r="3.5"/><circle cx="17" cy="16" r="3.5"/><path d="M7 12.5V6l2-2h1.5V12M17 12.5V6l-2-2h-1.5V12M10.5 12h3"/>'),
 'diamond': ico('<path d="m12 4 7 8-7 8-7-8 7-8Z"/>'),
 'leafline': '<svg viewBox="0 0 120 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M2 14h92"/><path d="M96 14c4-7 10-9 18-8-1 7-6 11-13 10-3 0-5-1-5-2Z"/></svg>',
})

VALLEY_CSS = '''
  html { scroll-padding-top: 84px; }
  body { background: var(--cream); }
  .vl-wrap { width: 100%; max-width: var(--wrap); margin: 0 auto; padding: 0 28px; }
  @media (max-width: 600px) { .vl-wrap { padding: 0 20px; } }
  .vl-h { display: flex; align-items: center; gap: 18px; margin-bottom: 22px; }
  .vl-h::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--gold), rgba(184,146,60,0)); }
  .vl-h span { font-family: 'Cinzel', serif; font-size: 11.5px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ac-deep); font-weight: 600; white-space: nowrap; }
  .vl-title { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; color: var(--forest-deep); font-size: clamp(30px, 4.4vw, 46px); line-height: 1.08; letter-spacing: -0.01em; }
  .vl-sec { padding-top: 62px; padding-bottom: 62px; scroll-margin-top: 80px; }
  @media (max-width: 700px) { .vl-sec { padding-top: 46px; padding-bottom: 46px; } }
  .vl-link { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--ac-deep); text-decoration: none; border-bottom: 1px solid var(--ac); padding-bottom: 2px; }
  .vl-link svg { width: 16px; height: 16px; }
  .vl-link:hover { color: var(--forest-deep); border-color: var(--forest-deep); }
  .vl-stamp { position: absolute; z-index: 2; top: 18px; left: 18px; background: var(--ac); border: 1px solid var(--gold); color: #fff; text-align: center; padding: 8px 14px 7px; border-radius: 4px; box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
  .vl-stamp b { display: block; font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; }
  .vl-stamp i { display: block; font-family: 'Playfair Display', serif; font-style: normal; font-weight: 600; font-size: 34px; line-height: 1.05; }
  .vl-cap { position: absolute; z-index: 2; right: 10px; bottom: 8px; font-size: 10.5px; color: rgba(255,255,255,0.92); background: rgba(15,22,14,0.6); padding: 2px 8px; border-radius: 2px; }

  /* A. hero */
  .vl-hero { position: relative; color: #fff; min-height: clamp(520px, 64vw, 650px); display: flex; align-items: flex-end; overflow: hidden; background: var(--forest-deep); isolation: isolate; }
  .vl-hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
  .vl-hero::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(15,22,14,0.3) 0%, rgba(15,22,14,0.5) 45%, rgba(15,22,14,0.92) 100%); }
  @media (min-width: 900px) { .vl-hero::before { background: linear-gradient(90deg, rgba(20,34,22,0.94) 0%, rgba(20,34,22,0.78) 34%, rgba(20,34,22,0.18) 62%, rgba(20,34,22,0) 100%), linear-gradient(180deg, rgba(15,22,14,0) 70%, rgba(15,22,14,0.45) 100%); } }
  .vl-hero-inner { width: 100%; max-width: var(--wrap); margin: 0 auto; padding: 96px 28px 54px; position: relative; }
  @media (max-width: 600px) { .vl-hero-inner { padding: 84px 20px 40px; } }
  .vl-kicker { display: flex; align-items: center; gap: 12px; font-family: 'Cinzel', serif; font-weight: 600; font-size: clamp(13px, 1.6vw, 17px); letter-spacing: 0.26em; text-transform: uppercase; color: #fff; }
  .vl-kicker svg { width: 84px; height: 18px; color: var(--gold-bright); flex: none; }
  .vl-hero h1 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; line-height: 0.96; letter-spacing: -0.02em; font-size: clamp(50px, 9.2vw, 108px); margin: 16px 0 20px; max-width: 7.2em; text-shadow: 0 2px 20px rgba(0,0,0,0.4); }
  .vl-sub { font-family: 'Cinzel', serif; font-weight: 500; font-size: clamp(11.5px, 1.35vw, 14px); letter-spacing: 0.2em; text-transform: uppercase; line-height: 1.85; max-width: 30em; color: rgba(250,246,238,0.94); }
  .vl-by { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
  .vl-by svg { width: 36px; height: 36px; color: var(--gold-bright); flex: none; }
  .vl-by span { font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
  .vl-ribbon { display: inline-flex; align-items: center; gap: 8px; background: var(--ac); border: 1px solid var(--gold); color: #fff; font-family: 'Cinzel', serif; letter-spacing: 0.14em; text-transform: uppercase; font-size: 10.5px; font-weight: 600; padding: 7px 12px; margin-bottom: 18px; }
  .vl-ribbon .y { font-weight: 500; }
  @media (min-width: 900px) {
    .vl-ribbon { position: absolute; top: 0; right: 28px; flex-direction: column; gap: 2px; width: 116px; padding: 22px 0 30px; margin: 0; text-align: center; border-width: 2px; border-top: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 90%, 0 100%); }
    .vl-ribbon .m { font-size: 19px; letter-spacing: 0.12em; }
    .vl-ribbon .y { font-family: 'Playfair Display', serif; font-size: 26px; letter-spacing: 0; text-transform: none; }
    .vl-ribbon .e { font-size: 10px; }
  }

  /* B. intro */
  .vl-intro { padding: 46px 0 8px; }
  .vl-intro .vl-wrap > div { max-width: 800px; border-left: 3px solid var(--ac); padding: 2px 0 2px 24px; }
  .vl-intro p { font-family: 'Playfair Display', serif; font-style: italic; font-size: clamp(18px, 2vw, 22px); line-height: 1.55; color: var(--forest-deep); }
  .vl-intro p + p { margin-top: 12px; }
  .vl-crumb { font-size: 12.5px; color: var(--taupe); padding: 16px 0 0; }
  .vl-crumb a { color: inherit; }

  /* C. in this edition */
  .vl-toc { padding: 38px 0 16px; }
  .vl-toc .vl-h span { font-family: 'Playfair Display', serif; font-style: italic; text-transform: none; letter-spacing: 0; font-size: clamp(26px, 3.4vw, 34px); color: var(--ac-deep); font-weight: 600; }
  .vl-toc-lead { font-size: 14.5px; color: #5a5346; margin: -8px 0 18px; }
  .vl-toc ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  @media (min-width: 620px) { .vl-toc ul { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1000px) { .vl-toc ul { grid-template-columns: repeat(6, 1fr); gap: 0; } .vl-toc li + li { border-left: 1px solid rgba(184,146,60,0.45); } }
  .vl-toc a { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 14px 10px; text-decoration: none; color: var(--forest-deep); border: 1px solid var(--line); border-radius: 6px; background: rgba(255,255,255,0.45); height: 100%; transition: background .2s, border-color .2s; }
  @media (min-width: 1000px) { .vl-toc a { border: 0; background: none; border-radius: 0; padding: 6px 14px; } }
  .vl-toc a:hover { background: #fff; border-color: var(--gold); }
  .vl-toc svg { width: 30px; height: 30px; color: var(--ac); }
  .vl-toc b { font-family: 'Playfair Display', serif; font-size: 15.5px; font-weight: 600; line-height: 1.2; }
  .vl-toc small { display: none; font-size: 11.5px; line-height: 1.4; color: #6b6558; }
  @media (min-width: 1000px) { .vl-toc small { display: block; } }

  /* D. events */
  .vl-events { background: linear-gradient(180deg, transparent, rgba(255,255,255,0.35)); }
  .vl-pill { display: inline-flex; align-items: center; gap: 12px; background: var(--forest-deep); color: var(--cream); border-radius: 0 40px 40px 0; padding: 12px 34px 12px 22px; margin-left: -28px; box-shadow: 0 8px 20px rgba(35,45,29,0.18); }
  @media (max-width: 600px) { .vl-pill { margin-left: -20px; } }
  .vl-pill svg { width: 26px; height: 26px; color: var(--gold-bright); }
  .vl-pill h2 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: clamp(24px, 3vw, 32px); color: var(--cream); line-height: 1.1; }
  .vl-sec-sub { font-size: 15px; color: #5a5346; margin: 14px 0 24px; }
  .vl-tiles { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 680px) { .vl-tiles { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1020px) { .vl-tiles { grid-template-columns: repeat(3, 1fr); gap: 18px; } }
  .vl-tile { display: grid; grid-template-columns: 68px 1fr; gap: 16px; background: #fff; border: 1px solid rgba(184,146,60,0.4); border-radius: 8px; padding: 16px; box-shadow: 0 8px 22px rgba(35,45,29,0.07); }
  .vl-date { align-self: start; background: var(--ac); color: #fff; border-radius: 6px; text-align: center; padding: 9px 0 8px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25); }
  .vl-date .mo { display: block; font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; }
  .vl-date .dy { display: block; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 34px; line-height: 1.05; }
  .vl-tile h3 { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 19px; line-height: 1.2; color: var(--forest-deep); }
  .vl-meta { list-style: none; margin: 8px 0 0; padding: 0; font-size: 13.5px; color: #3f3a30; }
  .vl-meta li { display: flex; gap: 8px; align-items: flex-start; margin-top: 4px; }
  .vl-meta svg { width: 16px; height: 16px; color: var(--ac); flex: none; margin-top: 2px; }
  .vl-tile p { font-size: 14px; line-height: 1.55; color: #4b453b; margin-top: 10px; }
  @media (max-width: 679px) { .vl-tile { grid-template-columns: 58px 1fr; gap: 14px; padding: 14px; } .vl-date .dy { font-size: 28px; } .vl-tile h3 { font-size: 18px; } .vl-tile p { font-size: 13.5px; line-height: 1.5; margin-top: 8px; } .vl-tile .vl-link { margin-top: 9px; } }
  .vl-tile .vl-link { margin-top: 12px; font-size: 13.5px; }

  /* E. in season */
  .vl-season { background: var(--cream-deep); }
  .vl-split { display: grid; gap: 28px; align-items: center; }
  @media (min-width: 900px) { .vl-split { grid-template-columns: 5fr 6fr; gap: 56px; } .vl-split.flip { grid-template-columns: 6fr 5fr; } }
  .vl-photo { position: relative; border-radius: 8px; overflow: hidden; background: var(--forest); aspect-ratio: 4/3; box-shadow: 0 16px 34px rgba(35,45,29,0.18); }
  .vl-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .vl-lead { font-family: 'Playfair Display', serif; font-style: italic; font-size: clamp(18px, 2vw, 21px); color: var(--ac-deep); margin: 12px 0 14px; line-height: 1.4; }
  .vl-body p { font-size: 15.5px; line-height: 1.7; color: #3f3a30; margin-top: 12px; }
  @media (max-width: 600px) { .vl-body p, .vl-close p { font-size: 15px; line-height: 1.62; } }
  .vl-chip { display: inline-flex; flex-direction: column; margin-top: 18px; padding: 12px 18px; border: 1px solid var(--gold); border-left: 4px solid var(--ac); background: rgba(255,255,255,0.7); border-radius: 4px; }
  .vl-chip small { font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ac-deep); font-weight: 600; }
  .vl-chip b { font-size: 15px; color: var(--forest-deep); margin-top: 3px; }
  .vl-body .vl-link { margin-top: 20px; }

  /* F. featured */
  .vl-feature { position: relative; background: var(--forest-deep); color: var(--cream); overflow: hidden; isolation: isolate; }
  .vl-feature::before { content: ''; position: absolute; z-index: -1; width: 640px; height: 640px; border-radius: 50%; left: -260px; top: -300px; background: radial-gradient(circle, color-mix(in srgb, var(--ac) 55%, transparent) 0%, transparent 68%); }
  .vl-feature .vl-sec { padding-top: 58px; padding-bottom: 58px; }
  .vl-fgrid { display: grid; gap: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 24px 50px rgba(0,0,0,0.35); }
  @media (min-width: 900px) { .vl-fgrid { grid-template-columns: 1.05fr 1fr; } }
  .vl-fgrid .vl-photo { border-radius: 0; aspect-ratio: 4/3; min-height: 100%; box-shadow: none; }
  @media (min-width: 900px) { .vl-fgrid .vl-photo { aspect-ratio: auto; } .vl-fgrid .vl-photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20,34,22,0) 60%, rgba(20,34,22,0.25) 100%); } }
  .vl-ftxt { background: #FBF7EE; color: #3f3a30; padding: 34px 30px 36px; }
  @media (min-width: 900px) { .vl-ftxt { padding: 44px 46px 46px; } }
  .vl-badge { display: inline-block; background: var(--ac); color: #fff; font-family: 'Cinzel', serif; font-weight: 600; font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; padding: 7px 14px; border: 1px solid var(--gold); border-radius: 2px; }
  .vl-ftxt h2 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: clamp(32px, 4.2vw, 46px); line-height: 1.04; color: var(--forest-deep); margin: 16px 0 8px; }
  .vl-ftxt .ev { font-family: 'Cinzel', serif; font-weight: 600; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ac-deep); line-height: 1.5; }
  .vl-facts { list-style: none; margin: 16px 0 6px; padding: 12px 0; display: flex; flex-wrap: wrap; gap: 8px 22px; border-top: 1px solid rgba(184,146,60,0.5); border-bottom: 1px solid rgba(184,146,60,0.5); font-size: 14px; font-weight: 700; color: var(--forest-deep); }
  .vl-facts li { display: flex; align-items: center; gap: 8px; }
  .vl-facts svg { width: 18px; height: 18px; color: var(--ac); }
  .vl-why { margin-top: 18px; padding: 14px 16px; background: var(--ac-tint); border-left: 3px solid var(--ac); border-radius: 0 4px 4px 0; font-size: 14.5px; line-height: 1.55; color: #3f3a30; }
  .vl-why b { color: var(--ac-deep); }
  .vl-ftxt .btn { margin-top: 22px; }
  .btn-gold, .btn-gold:hover { color: var(--forest-deep); }

  /* G. eat */
  .vl-eat { background: var(--cream); }
  .vl-vendors { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; }
  .vl-vendors li { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid rgba(184,146,60,0.4); border-radius: 6px; padding: 12px 16px; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 18px; color: var(--forest-deep); }
  .vl-vendors svg { flex: none; width: 22px; height: 22px; color: var(--ac); }
  .vl-tip { margin-top: 22px; padding: 16px 18px; background: var(--ac-tint); border-radius: 6px; font-size: 14.5px; line-height: 1.55; color: #3f3a30; }
  .vl-tip b { font-family: 'Cinzel', serif; letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px; color: var(--ac-deep); display: block; margin-bottom: 4px; }

  /* H. detour */
  .vl-detour { background: var(--cream-deep); }
  .vl-dcard { display: grid; background: #FBF7EE; border: 1px solid var(--line); border-top: 4px solid var(--ac); border-radius: 8px; overflow: hidden; box-shadow: 0 14px 30px rgba(35,45,29,0.1); }
  @media (min-width: 900px) { .vl-dcard { grid-template-columns: 6fr 5fr; } }
  .vl-dtxt { padding: 32px 30px 34px; }
  @media (min-width: 900px) { .vl-dtxt { padding: 42px 46px; } }
  .vl-partner { display: inline-flex; align-items: center; gap: 8px; font-family: 'Cinzel', serif; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; color: var(--forest-deep); background: var(--gold-bright); padding: 6px 12px; border-radius: 2px; margin-bottom: 14px; }
  .vl-partner svg { width: 14px; height: 14px; }
  .vl-note { margin-top: 14px; font-size: 13px; font-style: italic; color: #5a5346; }
  .vl-dcard .vl-photo { border-radius: 0; box-shadow: none; aspect-ratio: 4/3; }
  @media (min-width: 900px) { .vl-dcard .vl-photo { aspect-ratio: auto; min-height: 100%; } }

  /* I. plan ahead */
  .vl-ahead { background: var(--ac-tint); }
  .vl-ahead .vl-sec { padding-top: 52px; padding-bottom: 52px; }
  .vl-arows { display: grid; gap: 14px; margin-top: 24px; }
  @media (min-width: 900px) { .vl-arows { grid-template-columns: repeat(3, 1fr); gap: 18px; } }
  .vl-arow { display: grid; grid-template-columns: 56px 1fr; gap: 14px; background: rgba(255,255,255,0.75); border: 1px solid rgba(184,146,60,0.35); border-radius: 8px; padding: 16px; }
  .vl-arow .vl-date { padding: 7px 0 6px; } .vl-arow .vl-date .dy { font-size: 26px; }
  .vl-arow h3 { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 18px; color: var(--forest-deep); line-height: 1.2; }
  .vl-arow .when { display: block; font-family: 'Cinzel', serif; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ac-deep); font-weight: 600; margin: 3px 0 6px; }
  .vl-arow p { font-size: 13.5px; line-height: 1.55; color: #4b453b; }
  .vl-arow .vl-link { margin-top: 10px; font-size: 13px; }
  .vl-next { margin-top: 24px; text-align: center; font-family: 'Playfair Display', serif; font-style: italic; font-size: 17px; color: var(--forest-deep); }

  /* J. closing */
  .vl-close { background: var(--forest-deep); color: var(--cream); }
  .vl-close .vl-sec { padding-top: 64px; padding-bottom: 64px; }
  .vl-cgrid { display: grid; gap: 34px; align-items: center; }
  @media (min-width: 900px) { .vl-cgrid { grid-template-columns: 1.05fr 1fr; gap: 60px; } }
  .vl-close .k { display: flex; align-items: center; gap: 14px; font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold-bright); font-weight: 600; }
  .vl-close .k::after { content: ''; flex: 1; max-width: 90px; height: 1px; background: var(--gold); }
  .vl-close h2 { font-family: 'Playfair Display', serif; font-weight: 600; font-size: clamp(32px, 4.4vw, 50px); line-height: 1.05; color: #fff; margin: 16px 0 16px; }
  .vl-close p { font-size: 15.5px; line-height: 1.7; color: rgba(250,246,238,0.88); margin-top: 12px; max-width: 46ch; }
  .vl-close .btn { margin-top: 24px; padding: 15px 26px; font-size: 13.5px; }
  .vl-cph { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .vl-cph figure { margin: 0; position: relative; aspect-ratio: 3/4; border-radius: 6px; overflow: hidden; box-shadow: 0 16px 34px rgba(0,0,0,0.35); }
  .vl-cph figure:nth-child(2) { margin-top: 28px; }
  .vl-cph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .vl-fine { margin: 0; padding: 22px 0 6px; font-size: 12.5px; color: var(--taupe); text-align: center; }
  .vl-credits { padding: 8px 0 44px; }
  .vl-credits h2 { font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--taupe); margin-bottom: 8px; }
  .vl-credits p { font-size: 12.5px; line-height: 1.6; color: #6b6558; max-width: 95ch; }
  .vl-credits a { color: inherit; }
  .vl-back { display: inline-block; margin-top: 12px; font-size: 14px; font-weight: 700; color: var(--forest-deep); text-decoration-color: var(--gold); text-underline-offset: 3px; }
'''

def _img(im, w, h, cls='', lazy=True, extra=''):
    cap = f'<span class="vl-cap">{esc(im["caption"])}</span>' if im.get('caption') else ''
    lz = 'loading="lazy" ' if lazy else ''
    return f'<img src="/{im["src"]}" width="{w}" height="{h}" {lz}alt="{esc(im["alt"])}"{extra}>{cap}'

def valley_page(d, live):
    c = chrome()
    url = f"{SITE}/guides/{d['slug']}"
    coll = COLL['valley-edit']
    art = next(a for a in reg['articles'] if a['slug'] == d['slug'])
    ac, acd, act = ACCENTS[d['season']]
    hero = d['hero']
    og = f"{SITE}/{hero['src']}"
    article = {
        "@context": "https://schema.org", "@type": "Article", "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "headline": d['title'], "alternativeHeadline": d['subtitle'], "description": art['description'],
        "image": [og], "datePublished": d['published'], "dateModified": d['updated'], "inLanguage": "en-US",
        "articleSection": coll['name'], "isPartOf": {"@type": "CreativeWorkSeries", "name": coll['name']},
        "author": {"@type": "Organization", "name": "Cedar Escape", "url": SITE + "/"},
        "publisher": {"@type": "Organization", "name": "Cedar Escape", "url": SITE + "/",
                      "logo": {"@type": "ImageObject", "url": f"{SITE}/images/guides/jmu-hero-800.jpg"}},
    }
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Things to Do", "item": SITE + "/explore-massanutten"},
        {"@type": "ListItem", "position": 3, "name": d['title'], "item": url}]}
    robots = '' if live else '<meta name="robots" content="noindex, nofollow">\n'
    head = c['head_top'] + f'''<meta charset="UTF-8">
<meta name="google-site-verification" content="fluRb5pqQbRyoYBszjH6r6vUlKDnWXYRyJcgYh6-Ww0" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(d['seo_title'])}</title>
<meta name="description" content="{esc(art['description'])}">
{robots}<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Cedar Escape">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(d['seo_title'])}">
<meta property="og:description" content="{esc(art['description'])}">
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
    e = d['edition']
    intro = ''.join(f'<p>{esc(p)}</p>' for p in d['intro'])
    toc = ''.join(f'<li><a href="#{t["id"]}">{ICONS[t["icon"]]}<b>{esc(t["label"])}</b><small>{esc(t["desc"])}</small></a></li>' for t in d['toc']['items'])
    ev = d['events']
    tiles = ''
    for t in ev['items']:
        l = t['link']
        tiles += f'''
      <article class="vl-tile">
        <div class="vl-date" aria-hidden="true"><span class="mo">{esc(t['month'])}</span><span class="dy">{esc(t['day'])}</span></div>
        <div>
          <h3>{esc(t['title'])}</h3>
          <ul class="vl-meta"><li>{ICONS['calendar']}<span><span class="sr-only">{esc(t['month'])} {esc(t['day'])}, </span>{esc(t['time'])}</span></li><li>{ICONS['pin']}<span>{esc(t['place'])}</span></li></ul>
          <p>{esc(t['desc'])}</p>
          <a class="vl-link" href="{l['url']}" target="_blank" rel="noopener">{esc(l['label'])} {ICONS['arrow']}</a>
        </div>
      </article>'''
    s = d['in_season']; f = d['featured']; g = d['eat']; t = d['detour']; a = d['ahead']; cl = d['closing']
    body_s = ''.join(f'<p>{esc(x)}</p>' for x in s['body'])
    body_f = ''.join(f'<p>{esc(x)}</p>' for x in f['body'])
    facts = ''.join(f'<li>{ICONS[x["icon"]]}{esc(x["text"])}</li>' for x in f['facts'])
    vend = ''.join(f'<li>{ICONS["diamond"]}{esc(v)}</li>' for v in g['vendors'])
    body_g = ''.join(f'<p>{esc(x)}</p>' for x in g['body'])
    body_t = ''.join(f'<p>{esc(x)}</p>' for x in t['body'])
    rows = ''
    for r in a['items']:
        lk = f'<a class="vl-link" href="{r["link"]["url"]}" target="_blank" rel="noopener">{esc(r["link"]["label"])} {ICONS["arrow"]}</a>' if r.get('link') else ''
        rows += f'''
        <article class="vl-arow">
          <div class="vl-date" aria-hidden="true"><span class="mo">{esc(r['month'])}</span><span class="dy">{esc(r['day'])}</span></div>
          <div><h3>{esc(r['title'])}</h3><span class="when">{esc(r['when'])}</span><p>{esc(r['desc'])}</p>{lk}</div>
        </article>'''
    ph = ''.join(f'<figure><img src="/{x["src"]}" width="900" height="1200" loading="lazy" alt="{esc(x["alt"])}" style="object-position:{x.get("position","50% 50%")}"></figure>' for x in cl['images'])
    body_c = ''.join(f'<p>{esc(x)}</p>' for x in cl['body'])
    main = f'''<main style="--ac:{ac};--ac-deep:{acd};--ac-tint:{act};">
<div class="vl-hero">
  <img src="/{hero['src']}" srcset="/{hero['src_small']} 800w, /{hero['src']} 1600w" sizes="100vw" width="1600" height="1064" alt="{esc(hero['alt'])}" style="object-position:{hero.get('position','50% 50%')}" fetchpriority="high">
  <div class="vl-hero-inner">
    <div class="vl-ribbon"><span class="m">{esc(e['month'])}</span><span class="y">{esc(e['year'])}</span><span class="e">Edition</span></div>
    <div class="vl-kicker">The Valley Edit {ICONS['leafline']}</div>
    <h1>{esc(d['h1'])}</h1>
    <p class="vl-sub">{esc(d['subtitle'])}</p>
    <div class="vl-by">{ICONS['mtn']}<span>Presented by Cedar Escape</span></div>
  </div>
</div>

<div class="vl-wrap"><p class="vl-crumb"><a href="/">Home</a> / <a href="/explore-massanutten#local-guides">Things to Do</a> / {esc(coll['name'])}</p></div>
<section class="vl-intro" aria-label="Introduction"><div class="vl-wrap"><div>{intro}</div></div></section>

<nav class="vl-toc" aria-label="{esc(d['toc']['title'])}"><div class="vl-wrap">
  <div class="vl-h"><span>{esc(d['toc']['title'])}</span></div>
  <p class="vl-toc-lead">{esc(d['toc']['lead'])}</p>
  <ul>{toc}</ul>
</div></nav>

<section class="vl-sec vl-events" id="upcoming-events" aria-labelledby="h-events"><div class="vl-wrap">
  <div class="vl-pill">{ICONS['calendar']}<h2 id="h-events">{esc(ev['kicker'])}</h2></div>
  <p class="vl-sec-sub">{esc(ev['title'])}</p>
  <div class="vl-tiles">{tiles}
  </div>
</div></section>

<section class="vl-sec vl-season" id="in-season" aria-labelledby="h-season"><div class="vl-wrap">
  <div class="vl-split">
    <div class="vl-photo">{_img(s['image'], 900, 675)}</div>
    <div class="vl-body">
      <div class="vl-h"><span>{esc(s['kicker'])}</span></div>
      <h2 class="vl-title" id="h-season">{esc(s['title'])}</h2>
      <p class="vl-lead">{esc(s['lead'])}</p>
      {body_s}
      <div class="vl-chip"><small>{esc(s['chip_label'])}</small><b>{esc(s['chip'])}</b></div><br>
      <a class="vl-link" href="{s['link']['url']}" target="_blank" rel="noopener">{esc(s['link']['label'])} {ICONS['arrow']}</a>
    </div>
  </div>
</div></section>

<section class="vl-feature" id="featured-experience" aria-labelledby="h-feat"><div class="vl-wrap vl-sec">
  <div class="vl-fgrid">
    <div class="vl-photo"><span class="vl-stamp" aria-hidden="true"><b>{esc(f['stamp']['month'])}</b><i>{esc(f['stamp']['day'])}</i></span>{_img(f['image'], 1000, 750)}</div>
    <div class="vl-ftxt">
      <span class="vl-badge">{esc(f['kicker'])}</span>
      <h2 id="h-feat">{esc(f['title'])}</h2>
      <p class="ev">{esc(f['event'])}</p>
      <ul class="vl-facts">{facts}</ul>
      <div class="vl-body">{body_f}</div>
      <p class="vl-why"><b>Why we're featuring it:</b> {esc(f['why'])}</p>
      <div class="vl-body"><p>{esc(f['close'])}</p></div>
      <a class="btn btn-gold" href="{f['link']['url']}" target="_blank" rel="noopener">{esc(f['link']['label'])} <span aria-hidden="true">&rarr;</span></a>
    </div>
  </div>
</div></section>

<section class="vl-sec vl-eat" id="eat-sip-sweet" aria-labelledby="h-eat"><div class="vl-wrap">
  <div class="vl-split">
    <div class="vl-photo">{_img(g['image'], 900, 675)}</div>
    <div class="vl-body">
      <div class="vl-h"><span>{esc(g['kicker'])}</span></div>
      <h2 class="vl-title" id="h-eat">{esc(g['title'])}</h2>
      <p class="vl-lead">{esc(g['lead'])}</p>
      <p>{esc(g['vendors_intro'])}</p>
      <ul class="vl-vendors">{vend}</ul>
      {body_g}
      <p class="vl-tip"><b>Our tip</b>{esc(g['tip'])}</p>
    </div>
  </div>
</div></section>

<section class="vl-sec vl-detour" id="worth-the-detour" aria-labelledby="h-detour"><div class="vl-wrap">
  <div class="vl-dcard">
    <div class="vl-dtxt vl-body">
      <span class="vl-partner">{ICONS['pin']}{esc(t['badge'])}</span>
      <div class="vl-h"><span>{esc(t['kicker'])}</span></div>
      <h2 class="vl-title" id="h-detour">{esc(t['title'])}</h2>
      <p class="vl-lead">{esc(t['lead'])}</p>
      {body_t}
      <div class="vl-chip"><small>On the calendar</small><b>{esc(t['chip'])}</b></div>
      <p class="vl-note">{esc(t['note'])}</p>
      <a class="vl-link" href="{t['link']['url']}" target="_blank" rel="noopener">{esc(t['link']['label'])} {ICONS['arrow']}</a>
    </div>
    <div class="vl-photo">{_img(t['image'], 900, 675)}</div>
  </div>
</div></section>

<section class="vl-ahead" id="plan-ahead" aria-labelledby="h-ahead"><div class="vl-wrap vl-sec">
  <div class="vl-h"><span>{esc(a['kicker'])}</span></div>
  <h2 class="vl-title" id="h-ahead">{esc(a['title'])}</h2>
  <p class="vl-body" style="max-width:62ch;margin-top:10px;font-size:15.5px;line-height:1.65;color:#3f3a30;">{esc(a['lead'])}</p>
  <div class="vl-arows">{rows}
  </div>
  <p class="vl-next">{esc(a['next'])}</p>
</div></section>

<section class="vl-close" aria-labelledby="closing-title"><div class="vl-wrap vl-sec">
  <div class="vl-cgrid">
    <div>
      <div class="k">{esc(cl['eyebrow'])}</div>
      <h2 id="closing-title">{esc(cl['title'])}</h2>
      {body_c}
      <a class="btn btn-gold" href="{cl['cta_url']}">{esc(cl['cta'])} <span aria-hidden="true">&rarr;</span></a>
    </div>
    <div class="vl-cph">{ph}</div>
  </div>
</div></section>

<div class="vl-wrap"><p class="vl-fine">{esc(d['disclaimer'])}</p></div>
<section class="vl-credits" aria-label="Photo credits"><div class="vl-wrap">
  <h2>Photo credits</h2>
  <p>{d['credits']}</p>
  <p>Published <time datetime="{d['published']}">{d['published']}</time> · Last updated <time datetime="{d['updated']}">{d['updated']}</time>.</p>
  <a class="vl-back" href="/explore-massanutten#local-guides">&larr; Back to Things to Do</a>
</div></section>
</main>'''
    sr = '  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n'
    return (head + '<style>\n' + c['css'] + '\n' + sr + VALLEY_CSS + '\n</style>\n</head>\n<body>\n\n' + c['nav'] + '\n' + main +
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
PREVIEW = bool(os.environ.get('PREVIEW_DRAFTS'))   # PREVIEW_DRAFTS=1 shows drafts in listings (never commit that output)
def is_live(a): return a['status'] == 'published' or (PREVIEW and a['status'] == 'draft')

LISTING_CSS = '''  /* lg2:start (generated by scripts/build_editorial.py) */
  #local-guides { padding: 0 0 64px; }
  .lg2-top { position: relative; text-align: center; padding: 56px 0 74px; background-size: cover; background-position: center 62%; isolation: isolate; }
  .lg2-top::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(250,246,238,0.82) 0%, rgba(250,246,238,0.7) 46%, rgba(250,246,238,0.97) 90%, var(--cream) 100%); }
  .lg2-eyebrow { display: flex; align-items: center; justify-content: center; gap: 16px; font-family: 'Cinzel', serif; font-weight: 600; font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--forest-deep); }
  .lg2-eyebrow::before, .lg2-eyebrow::after { content: ''; width: 44px; height: 1px; background: var(--gold); }
  .lg2-top h2 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: clamp(38px, 6vw, 68px); line-height: 1.04; letter-spacing: -0.015em; color: var(--forest-deep); margin: 10px 0 12px; }
  .lg2-top p { font-family: 'Playfair Display', serif; font-style: italic; font-size: clamp(15px, 1.7vw, 18px); color: #3f3a30; max-width: 52em; margin: 0 auto; padding: 0 20px; }
  .lg2-tree { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 18px; color: var(--forest-deep); }
  .lg2-tree::before, .lg2-tree::after { content: ''; width: 56px; height: 1px; background: var(--gold); }
  .lg2-tree svg { width: 22px; height: 22px; }
  .lg2-grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: -34px; position: relative; }
  @media (min-width: 900px) { .lg2-grid { grid-template-columns: 1.08fr 1fr; gap: 24px; align-items: stretch; } }
  .lg2-badge { display: inline-flex; align-items: center; gap: 9px; font-family: 'Cinzel', serif; font-weight: 600; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; padding: 9px 14px 9px 10px; border-radius: 4px 14px 4px 14px; border: 1px solid var(--gold); line-height: 1.25; }
  .lg2-badge svg { width: 20px; height: 20px; flex: none; }
  .lg2-badge.travel-collection { background: var(--forest-deep); color: var(--cream); }
  .lg2-badge.five { background: #A9822E; color: #fff; }
  .lg2-badge.valley-edit { background: #7C2234; color: #fff; }
  .lg2-feat, .lg2-card { display: flex; background: #FBF7EE; border: 1px solid rgba(184,146,60,0.35); border-radius: 12px; overflow: hidden; text-decoration: none; color: var(--ink); box-shadow: 0 16px 36px rgba(35,45,29,0.14); transition: transform .2s, box-shadow .2s; }
  .lg2-feat:hover, .lg2-card:hover { transform: translateY(-3px); box-shadow: 0 22px 42px rgba(35,45,29,0.2); }
  .lg2-feat { flex-direction: column; }
  .lg2-feat .im { position: relative; aspect-ratio: 16/10; overflow: hidden; background: var(--forest-deep); }
  @media (min-width: 900px) { .lg2-feat .im { aspect-ratio: auto; flex: 1; min-height: 300px; } }
  .lg2-feat .im img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .lg2-feat .lg2-badge { position: absolute; top: 14px; left: 14px; z-index: 2; }
  .lg2-feat .tx { padding: 22px 26px 26px; background: #FBF7EE; position: relative; }
  .lg2-feat h3 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: clamp(28px, 3.4vw, 40px); line-height: 1.06; color: var(--forest-deep); }
  .lg2-feat p { font-size: 16px; color: #3f3a30; margin: 10px 0 0; }
  .lg2-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; background: var(--forest-deep); color: var(--cream); font-weight: 700; font-size: 14.5px; padding: 12px 22px; border-radius: 6px; }
  .lg2-side { display: grid; gap: 20px; align-content: start; }
  @media (min-width: 900px) { .lg2-side { grid-auto-rows: 1fr; align-content: stretch; } }
  .lg2-card { flex-direction: column; }
  @media (min-width: 560px) { .lg2-card { flex-direction: row; } }
  .lg2-card .im { position: relative; aspect-ratio: 16/9; background: var(--forest-deep); overflow: hidden; }
  @media (min-width: 560px) { .lg2-card .im { aspect-ratio: auto; flex: 0 0 46%; min-height: 220px; clip-path: ellipse(104% 100% at 0% 50%); } }
  .lg2-card .im img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .lg2-card .tx { padding: 20px 22px 22px; display: flex; flex-direction: column; justify-content: center; flex: 1; }
  .lg2-card .lg2-badge { align-self: flex-start; font-size: 10px; padding: 7px 12px 7px 9px; }
  .lg2-card .lg2-badge svg { width: 17px; height: 17px; }
  .lg2-card h3 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; font-size: clamp(22px, 2.4vw, 27px); line-height: 1.12; color: var(--forest-deep); margin: 14px 0 8px; }
  .lg2-card p { font-size: 14.5px; line-height: 1.5; color: #3f3a30; margin: 0; }
  .lg2-card .go { margin-top: 14px; font-weight: 700; font-size: 14.5px; color: var(--forest-deep); border-bottom: 2px solid var(--gold); align-self: flex-start; padding-bottom: 2px; }
  /* lg2:end */
'''
ICONS.update({
 'book': ico('<path d="M3 5.5C5 4 8.500 4 12 6c3.500-2 7-2 9-.5V19c-2-1.500-5.500-1.500-9 .5-3.500-2-7-2-9-.5V5.500ZM12 6v13.500"/>'),
 'mapleleaf': ico('<path d="M12 3 9.500 7 6 6l1 5-3 1 4 3-1 3h5v4h2v-4h5l-1-3 4-3-3-1 1-5-3.500 1L12 3Z"/>'),
})
def badge(c):
    ic = {'travel-collection': 'book', 'five': 'mtn', 'valley-edit': 'mapleleaf'}.get(c['id'], 'book')
    return f'<span class="lg2-badge {c["id"]}">{ICONS[ic]}{esc(c["name"])}</span>'

def guides_section():
    """Featured card (newest Travel Collection guide) + stacked cards for every other live article."""
    live = [a for a in reg['articles'] if is_live(a)]
    order = {c['id']: i for i, c in enumerate(reg['collections'])}
    live.sort(key=lambda a: (order[a['collection']], [-int(x) for x in a['published'].split('-')]))
    if not live: return ''
    feat = next((a for a in live if a['collection'] == reg['collections'][0]['id']), live[0])
    rest = [a for a in live if a is not feat]
    def txt(a):
        return (esc(a.get('card_title', a['title'])), esc(a.get('card_blurb', a['subtitle'])), esc(a.get('cta', 'Read the Guide')))
    t, b, cta = txt(feat)
    out = f'''
    <div class="lg2-grid">
      <a class="lg2-feat" href="/guides/{feat['slug']}">
        <div class="im"><img src="{feat['image'].replace('-800.jpg', '-1600.jpg') if feat.get('image_large') else feat['image']}" loading="lazy" width="1600" height="1000" alt="{esc(feat['imageAlt'])}">{badge(COLL[feat['collection']])}</div>
        <div class="tx"><h3>{t}</h3><p>{b}</p><span class="lg2-btn">{cta} &rarr;</span></div>
      </a>
      <div class="lg2-side">'''
    for a in rest:
        t, b, cta = txt(a)
        out += f'''
        <a class="lg2-card" href="/guides/{a['slug']}">
          <div class="im"><img src="{a['image']}" loading="lazy" width="800" height="600" alt="{esc(a['imageAlt'])}"></div>
          <div class="tx">{badge(COLL[a['collection']])}<h3>{t}</h3><p>{b}</p><span class="go">{cta} &rarr;</span></div>
        </a>'''
    return out + '\n      </div>\n    </div>'

def update_explore():
    p = 'explore-massanutten.html'
    s = rd(p)
    sec_re = re.compile(r'<section id="local-guides".*?</section>', re.S)
    ban = reg.get('listing_banner', {})
    new = f'''<section id="local-guides" style="background:var(--cream);">
  <div class="lg2-top" style="background-image:url('/{ban.get('src', 'images/guides/valley-hero-1600.jpg')}');">
    <div class="lg2-eyebrow">Cedar Escape Editorial</div>
    <h2>Local Travel Guides</h2>
    <p>Curated travel guides, seasonal experiences, and local favorites in the Shenandoah Valley.</p>
    <div class="lg2-tree">{TREE}</div>
  </div>
  <div class="wrap">
    <!-- editorial:start (generated by scripts/build_editorial.py from data/articles.json) -->{guides_section()}
    <!-- editorial:end -->
  </div>
</section>'''
    assert sec_re.search(s), 'local-guides section not found'
    s = sec_re.sub(lambda m: new, s, count=1)
    css_re = re.compile(r'  /\* lg2:start.*?/\* lg2:end \*/\n', re.S)
    if css_re.search(s):
        s = css_re.sub(lambda m: LISTING_CSS, s, count=1)
    else:
        assert '  .lg-grid {' in s
        s = s.replace('  .lg-grid {', LISTING_CSS + '  .lg-grid {', 1)
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
        elif a.get('built') == 'valley':
            d = json.loads(rd(a['source']))
            wr(f"guides/{a['slug']}.html", valley_page(d, a['status'] == 'published'))
            print('built guides/%s.html (%s)' % (a['slug'], a['status']))
    update_explore(); update_sitemap(); tag_series_on_handbuilt()
    pub = [a['slug'] for a in reg['articles'] if a['status'] == 'published']
    print('published articles listed:', pub)

if __name__ == '__main__':
    main()
