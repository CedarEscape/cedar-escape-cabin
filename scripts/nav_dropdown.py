#!/usr/bin/env python3
"""One-time (idempotent) header update: turns the 'Things to Do' nav item into a dropdown with
'Explore Activities' (/explore-massanutten) and 'All Travel Guides' (/guides).
Edits only the <header> of each page; the footer link list is untouched. Safe to re-run."""
import glob, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARET = '<svg class="caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>'
CSS = '''<style id="nav-sub">
  .nav-links li.has-sub { position: relative; }
  .nav-links .caret { width: 9px; height: 9px; margin-left: 5px; vertical-align: 1px; transition: transform .2s; }
  .nav-links .sub { list-style: none; margin: 0; padding: 0; }
  @media (min-width: 880px) {
    .nav-links .sub { display: none; position: absolute; top: 100%; left: -16px; min-width: 210px; padding: 8px 0; margin-top: 12px; background: var(--cream, #FAF6EE); border: 1px solid var(--line, #E6DDC9); border-top: 2px solid var(--gold, #B8923C); border-radius: 0 0 6px 6px; box-shadow: 0 16px 30px rgba(43,39,31,0.16); z-index: 60; }
    .nav-links .sub::before { content: ''; position: absolute; left: 0; right: 0; top: -14px; height: 14px; }
    .nav-links li.has-sub:hover > .sub, .nav-links li.has-sub:focus-within > .sub { display: block; }
    .nav-links li.has-sub:hover .caret, .nav-links li.has-sub:focus-within .caret { transform: rotate(180deg); }
    .nav-links .sub a { display: block; padding: 10px 20px; white-space: nowrap; }
    .nav-links .sub a::after { display: none; }
    .nav-links .sub a:hover { background: var(--cream-deep, #F2EBDD); color: var(--forest-deep, #232D1D); }
  }
  @media (max-width: 879.98px) {
    .nav-links .caret { display: none; }
    .nav-links.open .sub { display: block; margin: 8px 0 0 14px; padding-left: 14px; border-left: 1px solid var(--gold, #B8923C); }
    .nav-links.open .sub li + li { margin-top: 10px; }
    .nav-links.open .sub a { font-size: 12.5px; }
  }
</style>
'''
def item(current): 
    cur = ' class="current"' if current else ''
    return ('<li class="has-sub"><a href="/explore-massanutten"%s>Things to Do%s</a>\n'
            '        <ul class="sub">\n          <li><a href="/explore-massanutten">Explore Activities</a></li>\n'
            '          <li><a href="/guides">All Travel Guides</a></li>\n        </ul></li>') % (cur, CARET)
pat = re.compile(r'<li><a href="/explore-massanutten"( class="current")?>Things to Do</a></li>')
n_files = 0
for f in sorted(glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'guides', '*.html'))):
    s = open(f, encoding='utf-8').read()
    if '<header>' not in s or 'class="has-sub"' in s: continue
    i = s.index('<header>'); j = s.index('</header>', i)
    head = s[i:j]
    new, c = pat.subn(lambda m: item(bool(m.group(1))), head)
    if not c: continue
    s = s[:i] + CSS + new + s[j:]
    open(f, 'w', encoding='utf-8').write(s); n_files += 1
    print('nav updated:', os.path.relpath(f, ROOT))
print(n_files, 'files updated')
