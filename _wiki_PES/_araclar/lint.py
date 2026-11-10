"""PES wiki sağlık kontrolü (Lint işleminin mekanik kısmı).

Kullanım (PES kökünden):  python _wiki_PES/_araclar/lint.py
Anlamsal kontroller (çelişki, koddan sapma) LLM'de kalır.
"""
import re
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

WIKI = Path(__file__).resolve().parent.parent
REPO = WIKI.parent
SKIP = {"_sablonlar", "_araclar", ".obsidian"}
OZEL = {"index", "log", "CLAUDE"}
LINK = re.compile(r"\[\[([^\]|#]+)")


def frontmatter(text):
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.split(" #")[0].strip()
    return out


def liste(v):
    return [s.strip() for s in v.strip("[]").split(",") if s.strip()]


sayfalar = {p.stem: p for p in WIKI.rglob("*.md") if not SKIP.intersection(p.relative_to(WIKI).parts)}
metin = {n: p.read_text(encoding="utf-8") for n, p in sayfalar.items()}
# Şemadaki [[örnek]] bağlantılar sayılmaz.
giden = {n: {t.strip().split("/")[-1] for t in LINK.findall(m)} if n != "CLAUDE" else set() for n, m in metin.items()}
gelen = {n: {s for s, ts in giden.items() if n in ts and s != n} for n in sayfalar}
index_l = giden.get("index", set())

print(f"# PES wiki lint {date.today()}  ({len(sayfalar)} sayfa)")

print("\n## Yetim sayfalar (gelen bağlantı yok)")
for n in sorted(n for n, s in gelen.items() if not s and n not in OZEL):
    print("-", n)

print("\n## index.md'de olmayan sayfalar")
for n in sorted(set(sayfalar) - index_l - OZEL):
    print("-", n)

print("\n## Bekleyen bağlantılar (sayfası yok)")
bekleyen = {}
for s, ts in giden.items():
    for t in ts - set(sayfalar):
        bekleyen.setdefault(t, set()).add(s)
for t, ss in sorted(bekleyen.items(), key=lambda x: -len(x[1])):
    print(f"- {t} ({len(ss)}): {', '.join(sorted(ss))}")

print("\n## Kaynak kontrolü (eksik dosya / bayat sayfa)")
for n, m in sorted(metin.items()):
    fm = frontmatter(m)
    try:
        g = date.fromisoformat(fm.get("guncelleme", ""))
    except ValueError:
        if n not in OZEL:
            print(f"- {n}: guncelleme alanı geçersiz")
        continue
    for k in liste(fm.get("kaynaklar", "")):
        f = REPO / k
        if not f.exists():
            print(f"- {n}: kaynak yok → {k}")
        elif date.fromtimestamp(f.stat().st_mtime) > g:
            print(f"- BAYAT: {n} ({g}) ← {k} daha yeni")
