"""Build budget-2027-ministry.json from the MOF "Anggaran Perbelanjaan Persekutuan 2027" PDFs.

Usage: python3 -I extract_ministry.py /tmp/mof27   (needs pdftotext; downloads missing PDFs)
Writes budget-2027-ministry.json and budget-2027-activities.json (code -> line name -> activities).

Tree: sector -> ministry (Maksud) -> programme, in RM million. Ministries carry their VISI and OE
programmes their first Outcome as "about", when the book has one. OE lines also carry the 2027 split by
Objek Am ("objek": emolumen, perkhidmatan & bekalan, aset, pemberian & kenaan bayaran tetap, lain),
their posts ("posts", Bil. Jawatan 2027), and their activities with each one's Fungsi text.
- OE: top-level programmes (Butiran XX0000) of each Maksud. B.11, T.12, T.13 and T.14 go one level
  deeper (activities XXYY00), since one programme there holds most of the money.
- DE: development projects of each Maksud ("Anggaran 2027": Cara Langsung + Pinjaman).
- Lines under RM5 million are merged into one "Lain-lain" line per ministry.
- T.1-T.11 (small constitutional charges) are merged into one ministry, one line each.
- P.70 Simpanan Luar Jangka (contingency, RM2bn DE) is left out, so the total matches Tinjauan Fiskal.
- English: Maksud names ("en") are official, from the English half of Command Paper 21 (Supply Bill statement).
  The books have no English, so programme names get our own translation ("enOurs", from programme-names-en.json).
"""

import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

BASE = "https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/"
CMD = "https://parlimen.gov.my/ipms/eps/2026-10-09/CMD.21.2026%20-%20CMD21.2026.pdf"
OUT = Path(__file__).with_name("budget-2027-ministry.json")
ACTS = OUT.with_name("budget-2027-activities.json")
OURS = Path(__file__).with_name("programme-names-en.json")
SMALL = 5.0  # RM million
DRILL = {"B.11", "T.12", "T.13", "T.14"}
TOTAL = 459_840  # Tinjauan Fiskal 2027: OE 376,840 + DE 85,000 - P.70 2,000

# Our own grouping of Maksud into sectors (see Sources panel).
SECTORS = {
    "Sosial": ["B/P.14", "B/P.42", "B/P.43", "B/P.45", "B/P.46", "B/P.48", "B/P.63", "B/P.64"],
    "Ekonomi": ["B/P.15", "B/P.20", "B/P.21", "B/P.22", "B/P.23", "B/P.24", "B/P.25", "B/P.26",
                "B/P.27", "B/P.28", "B/P.30", "B/P.31", "B/P.33", "B/P.47", "B/P.50"],
    "Keselamatan": ["B/P.60", "B/P.62"],
    "Pentadbiran am": ["B.1", "B.2", "B.3", "B.4", "B.5", "B/P.6", "B/P.7", "B.8", "B.9", "B/P.10",
                    "B.11", "B.12", "B/P.13", "B.40"],
    "Tanggungan": ["T.1-T.11", "T.12", "T.13", "T.14"],
}
SMALL_T = [f"T.{i}" for i in range(1, 12)]

NUM = r"\d{1,3}(?:,\d{3})*"


def text(d: Path, code: str, url: str = "") -> str:
    """pdftotext -layout of one PDF, downloading it first if needed."""
    name = code.replace("/", "")
    pdf, txt = d / f"{name}.pdf", d / f"{name}.txt"
    if not pdf.exists():
        urllib.request.urlretrieve(url or BASE + pdf.name, pdf)
    if not txt.exists():
        subprocess.run(["pdftotext", "-layout", str(pdf), str(txt)], check=True)
    return txt.read_text()


def rm(s: str) -> int:
    return int(s.replace(",", ""))


def summary(d: Path) -> dict[str, dict]:
    """Maksud -> {name, oe, de} in RM, from the summary tables."""
    out: dict[str, dict] = {}
    lines = (text(d, "ringkasan_bp") + text(d, "perbelanjaan_bekalan_pembangunan")).splitlines()
    for i, ln in enumerate(lines):
        m = re.match(rf"\s*([BTP](?:/P)?\.\d+)\s+(.+?)\s{{2,}}({NUM})(?:\s+({NUM}))?\s*$", ln)
        if not m:
            continue
        name = m[2]
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if nxt and not re.search(r"\d", nxt):  # wrapped name
            name += " " + nxt
        oe, de = (rm(m[3]), rm(m[4])) if m[4] else ((rm(m[3]), 0) if m[1].startswith("T") else (0, rm(m[3])))
        out[m[1]] = {"name": name, "oe": oe, "de": de}
    return out


def english(d: Path) -> dict[str, str]:
    """Official English Maksud names (B.14 -> "Ministry of National Unity"), from the English half of CMD 21."""
    t = text(d, "cmd21", CMD)
    t = t[t.index("MINISTRY OF FINANCE STATEMENT"):]
    out: dict[str, str] = {}
    for m in re.finditer(rf"^\s+([BT]\.\d+)\s+(.+?)(?:\s{{2,}}{NUM})?\s*$", t, re.M):
        out.setdefault(m[1], m[2])
    return out


# BM title case: connectors stay lower; short forms stay upper.
# ponytail: short forms are a hand list from the 2027 books; add new ones if a future year brings them.
LOWER = {"dan", "atau", "serta", "di", "ke", "dari", "untuk", "bagi", "yang"}
KEEP = {"PPP/PFI", "MIGHT", "NAHRIM", "RELA", "PERHILITAN"}


def tidy(name: str) -> str:
    """ALL CAPS names from the PDF -> title case. Names already in mixed case are left alone."""
    if name != name.upper():
        return name
    def word(w: str, first: bool) -> str:
        if w in KEEP or w.startswith("("):  # "(TVET)", "(TBP)"
            return w
        if not first and w.lower() in LOWER:
            return w.lower()
        # First letter, not first char: '"ONE-OFF"' -> '"One-Off"'.
        return "-".join(re.sub(r"[a-z]", lambda m: m[0].upper(), p.lower(), count=1) for p in w.split("-"))
    return " ".join(word(w, i == 0) for i, w in enumerate(name.split()))


assert tidy("PENDIDIKAN DAN LATIHAN (TVET)") == "Pendidikan dan Latihan (TVET)"
assert tidy('"ONE-OFF"') == '"One-Off"' and tidy("PPP/PFI") == "PPP/PFI" and tidy("Lain-lain kecil") == "Lain-lain kecil"


def name_at(lines: list[str], i: int, first: str) -> str:
    """Programme name, joined with wrapped lines below it (until a blank line)."""
    parts = [first]
    for ln in lines[i + 1:]:
        s = ln.strip()
        if not s or s[0].isdigit():
            break
        parts.append(re.split(r"\s{2,}", s)[0])
    return tidy(re.sub(r"\s+-\s*$", " -", " ".join(parts)).strip())


def about(t: str) -> tuple[str, dict[str, str], dict[tuple[str, str], str]]:
    """The Maksud's VISI, the first Outcome of each programme (keyed by tidy name), and each
    activity's Fungsi (keyed by tidy programme and activity names)."""
    lines = [ln.strip() for ln in t.splitlines()]

    def para(i: int, first: str = "") -> str:
        """`first` plus the lines from i up to the next blank line."""
        parts = [first] if first else []
        while not parts and i < len(lines) and not lines[i]:  # skip blanks before the text
            i += 1
        while i < len(lines) and lines[i]:
            parts.append(lines[i])
            i += 1
        return " ".join(parts)

    visi = next((para(i + 1) for i, ln in enumerate(lines) if ln == "VISI"), "")
    outcomes: dict[str, str] = {}
    fungsi: dict[tuple[str, str], str] = {}
    prog = act = ""
    for i, ln in enumerate(lines):
        if m := re.match(r"PROGRAM(?: \d+)? : (.+)", ln):
            prog, j = m[1], i + 1
            while j < len(lines) and lines[j] and lines[j] != "PRESTASI OUTCOME PROGRAM":  # wrapped name
                prog, j = f"{prog} {lines[j]}", j + 1
            prog = tidy(prog)
        elif prog and (m := re.match(r"Outcome(?: \d+)? : (.+)", ln)):
            outcomes.setdefault(prog, para(i + 1, m[1]))
        elif prog and (m := re.match(r"Aktiviti \d+ : (.+)", ln)):
            act = para(i + 1, m[1])
        elif prog and act and (m := re.match(r"Fungsi : (.+)", ln)):
            fungsi[(prog, key(act))] = re.sub(r"\s+", " ", para(i + 1, m[1])).strip()
            act = ""
    return visi, outcomes, fungsi


def key(name: str) -> str:
    """Loose match for names printed differently in the text and the table."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


OBJEK = ["10000", "20000", "30000", "40000", "50000"]


def oe_table(t: str) -> list[dict]:
    """Rows of the Butiran table: programmes (XX0000) and activities (XXYY00), 2027 RM, Objek Am, posts."""
    lines = t.splitlines()
    rows: list[dict] = []
    for i, ln in enumerate(lines):
        if m := re.match(rf"(?:(\d{{2}}0000)|\s{{8,16}}(\d{{4}}00))\s+(.+?)\s{{2,}}({NUM})\s+({NUM})\s*$", ln):
            rows.append({"code": m[1] or m[2], "prog": bool(m[1]), "name": name_at(lines, i, m[3]),
                         "rm": rm(m[5]), "objek": [0] * 5, "posts": 0})
        elif rows and (m := re.match(rf".*\s{{2}}([1-5])0000\s+({NUM})\s+({NUM})(?:\s+({NUM})\s+({NUM}))?\s*$", ln)):
            rows[-1]["objek"][int(m[1]) - 1] = rm(m[3])
            rows[-1]["posts"] += rm(m[5]) if m[5] else 0
    for r in rows:
        assert sum(r["objek"]) == r["rm"], (r["code"], r["name"], r["objek"], r["rm"])
    return rows


def oe_items(t: str, deep: bool) -> list[dict]:
    """OE lines: programmes with their activities, or (deep) the activities themselves."""
    rows = oe_table(t)
    if deep:
        return [{**r, "acts": []} for r in rows if not r["prog"]]
    progs = [{**r, "acts": []} for r in rows if r["prog"]]
    for r in rows:
        if not r["prog"]:
            prog = next(p for p in progs if p["code"][:2] == r["code"][:2])
            prog["acts"].append(r)
    for p in progs:
        assert not p["acts"] or sum(a["rm"] for a in p["acts"]) == p["rm"], (p["code"], p["name"])
    return progs


def de_items(t: str) -> list[tuple[str, int]]:
    """(name, RM 2027 Cara Langsung + Pinjaman) per development project, from the Maksud Pembangunan pages."""
    lines = t.splitlines()
    out = []
    for i, ln in enumerate(lines):
        m = re.match(rf"\s*(\d{{5}})\s+(.+?)\s{{2,}}((?:{NUM}\s+){{4}}{NUM})\s*$", ln)
        if m:
            nums = m[3].split()
            out.append((name_at(lines, i, m[2]), rm(nums[3]) + rm(nums[4])))
    return out


def merge_small(progs: list[dict]) -> list[dict]:
    big = [p for p in progs if p["opex"] + p["devex"] >= SMALL]
    small = [p for p in progs if p["opex"] + p["devex"] < SMALL]
    if small:
        big.append({"name": f"Lain-lain ({len(small)} butiran kecil)", "en": f"Other ({len(small)} small items)",
                    "opex": round(sum(p["opex"] for p in small), 4),
                    "devex": round(sum(p["devex"] for p in small), 4), **joined(small)})
    return big


def joined(progs: list[dict]) -> dict:
    """Objek Am and posts of merged lines, when all their OE is split."""
    if any(p["opex"] and "objek" not in p for p in progs) or not any("objek" in p for p in progs):
        return {}
    posts = sum(p.get("posts", 0) for p in progs)
    return {"objek": [round(sum(p["objek"][i] for p in progs if "objek" in p), 4) for i in range(5)],
            **({"posts": posts} if posts else {})}


def mil(rm_: int) -> float:
    return round(rm_ / 1e6, 4)


def ministry(d: Path, s: dict, code: str, en: dict[str, str], ours: dict[str, str]) -> dict:
    sm = s[code]
    sm_en = en[code.replace("B/P", "B")]
    t = text(d, code)
    oe = oe_items(t, code in DRILL) if sm["oe"] else []
    if sm["oe"] and not oe:  # no programme table (small T.x): one line
        oe = [{"name": sm["name"], "rm": sm["oe"], "objek": None, "posts": 0, "acts": []}]
    de = de_items(t) if sm["de"] else []
    assert sum(p["rm"] for p in oe) == sm["oe"], (code, "OE", sum(p["rm"] for p in oe), sm["oe"])
    assert sum(v for _, v in de) == sm["de"], (code, "DE", sum(v for _, v in de), sm["de"])
    visi, outcomes, fungsi = about(t)

    def acts(p: dict) -> list[dict]:
        """Activities, biggest first, with Fungsi when the book has it."""
        return [{"name": a["name"], "rm": mil(a["rm"]),
                 **({"fungsi": f} if (f := fungsi.get((p["name"], key(a["name"])))) else {})}
                for a in sorted(p["acts"], key=lambda a: -a["rm"]) if a["rm"]]

    # A line named like its Maksud (no programme table) takes the official name; the rest get ours.
    def names(n: str) -> dict:
        if n == sm["name"]:
            return {"name": n, "en": sm_en}
        e = ours.get(n, "")
        return {"name": n, **({"enOurs": e} if e.strip('"') != n.strip('"') else {})}  # '"One-Off" (One-Off)'

    # "about" etc. are only set when the book has them (DE projects and most T.x have none).
    progs = [{**names(p["name"]), "opex": mil(p["rm"]), "devex": 0,
              **({"about": outcomes[p["name"]]} if p["name"] in outcomes else {}),
              **({"objek": [mil(v) for v in p["objek"]]} if p["objek"] else {}),
              **({"posts": p["posts"]} if p["posts"] else {}),
              **({"activities": a} if len(a := acts(p)) > 1 else {})}
             for p in oe if p["rm"]] + \
            [{**names(n), "opex": 0, "devex": mil(v)} for n, v in de if v]
    return {"code": code, "name": sm["name"], "en": sm_en, "opex": mil(sm["oe"]), "devex": mil(sm["de"]),
            "locked": code.startswith("T"), **({"about": visi} if visi else {}), "programmes": merge_small(progs)}


def main(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)
    s = summary(d)
    en = english(d)
    ours = json.loads(OURS.read_text()) if OURS.exists() else {}
    assert len(s) == 40 + 14, len(s)
    used = {c for cs in SECTORS.values() for c in cs} - {"T.1-T.11"} | set(SMALL_T) | {"P.70"}
    assert used == set(s), set(s) ^ used

    sectors = []
    for sector, codes in SECTORS.items():
        ms = []
        for code in codes:
            if code != "T.1-T.11":
                ms.append(ministry(d, s, code, en, ours))
                continue
            parts = [ministry(d, s, c, en, ours) for c in SMALL_T]
            ms.append({"code": code, "name": "Tanggungan Perlembagaan Lain", "en": "Other Constitutional Charges",
                       "opex": round(sum(p["opex"] for p in parts), 4), "devex": 0, "locked": True,
                       "programmes": [{"name": f"{p['code']} {p['name']}", "en": f"{p['code']} {p['en']}",
                                       "opex": p["opex"], "devex": 0, **joined(p["programmes"])} for p in parts]})
        sectors.append({"name": sector, "ministries": ms})

    total = sum(p["opex"] + p["devex"] for sec in sectors for m in sec["ministries"] for p in m["programmes"])
    assert abs(total - TOTAL) < 0.01, total
    missing = sorted({p["name"] for sec in sectors for m in sec["ministries"] for p in m["programmes"]
                      if p.get("enOurs") == ""})
    if missing:  # print them, so a new year's names can be translated into programme-names-en.json
        sys.exit("no English in programme-names-en.json for:\n" + "\n".join(missing))
    for sec in sectors:
        for m in sec["ministries"]:
            assert abs(sum(p["opex"] for p in m["programmes"]) - m["opex"]) < 0.001, m["code"]
            assert abs(sum(p["devex"] for p in m["programmes"]) - m["devex"]) < 0.001, m["code"]
            for p in m["programmes"]:  # the Objek Am split adds up to the line's OE
                assert "objek" not in p or abs(sum(p["objek"]) - p["opex"]) < 0.001, (m["code"], p["name"])
                assert "activities" not in p or abs(sum(a["rm"] for a in p["activities"]) - p["opex"]) < 0.001, \
                    (m["code"], p["name"])

    # Activities (mostly Fungsi text) go in their own file, so the app can load them after first paint.
    acts = {m["code"]: {p["name"]: p.pop("activities") for p in m["programmes"] if "activities" in p}
            for sec in sectors for m in sec["ministries"]}
    OUT.write_text(json.dumps({"year": 2027, "unit": "RM million", "sectors": sectors},
                              ensure_ascii=False, indent=1) + "\n")
    ACTS.write_text(json.dumps({c: a for c, a in acts.items() if a}, ensure_ascii=False, indent=1) + "\n")
    progs = [p for sec in sectors for m in sec["ministries"] for p in m["programmes"]]
    acts = [a for m in acts.values() for p in m.values() for a in p]
    print(f"ok: {len(s) - 1} Maksud, {len(progs)} lines, RM{total:,.1f}m -> {OUT.name}")
    print(f"   {sum('objek' in p for p in progs)}/{sum(p['opex'] > 0 for p in progs)} OE lines split by Objek Am, "
          f"{len(acts)} activities, {sum('fungsi' in a for a in acts)} with Fungsi -> {ACTS.name}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mof27"))
