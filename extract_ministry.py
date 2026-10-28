"""Build budget-2027-ministry.json from the MOF "Anggaran Perbelanjaan Persekutuan 2027" PDFs.

Usage: python3 -I extract_ministry.py /tmp/mof27   (needs pdftotext; downloads missing PDFs)

Tree: sector -> ministry (Maksud) -> programme, in RM million. Ministries carry their VISI and OE
programmes their first Outcome as "about", when the book has one.
- OE: top-level programmes (Butiran XX0000) of each Maksud. B.11, T.12, T.13 and T.14 go one level
  deeper (activities XXYY00), since one programme there holds most of the money.
- DE: development projects of each Maksud ("Anggaran 2027": Cara Langsung + Pinjaman).
- Lines under RM5 million are merged into one "Lain-lain" line per ministry.
- T.1-T.11 (small constitutional charges) are merged into one ministry, one line each.
- P.70 Simpanan Luar Jangka (contingency, RM2bn DE) is left out, so the total matches Tinjauan Fiskal.
"""

import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

BASE = "https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/"
OUT = Path(__file__).with_name("budget-2027-ministry.json")
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


def text(d: Path, code: str) -> str:
    """pdftotext -layout of one PDF, downloading it first if needed."""
    name = code.replace("/", "")
    pdf, txt = d / f"{name}.pdf", d / f"{name}.txt"
    if not pdf.exists():
        urllib.request.urlretrieve(BASE + pdf.name, pdf)
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


def about(t: str) -> tuple[str, dict[str, str]]:
    """The Maksud's VISI, and the first Outcome of each programme (keyed by tidy name)."""
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
    prog = ""
    for i, ln in enumerate(lines):
        if m := re.match(r"PROGRAM(?: \d+)? : (.+)", ln):
            prog, j = m[1], i + 1
            while j < len(lines) and lines[j] and lines[j] != "PRESTASI OUTCOME PROGRAM":  # wrapped name
                prog, j = f"{prog} {lines[j]}", j + 1
        elif prog and (m := re.match(r"Outcome(?: \d+)? : (.+)", ln)):
            outcomes.setdefault(tidy(prog), para(i + 1, m[1]))
            prog = ""
    return visi, outcomes


def oe_items(t: str, deep: bool) -> list[tuple[str, int]]:
    """(name, RM 2027) per OE programme. Only the Maksud Bekalan/Tanggungan pages (Butiran table)."""
    lines = t.splitlines()
    code = r"\s{10}(\d{4}00)" if deep else r"(\d{2}0000)"  # activities are indented under programmes
    out = []
    for i, ln in enumerate(lines):
        m = re.match(rf"{code}\s+(.+?)\s{{2,}}({NUM})\s+({NUM})\s*$", ln)
        if m:
            out.append((name_at(lines, i, m[2]), rm(m[4])))
    return out


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
        big.append({"name": f"Lain-lain ({len(small)} butiran kecil)",
                    "opex": round(sum(p["opex"] for p in small), 4),
                    "devex": round(sum(p["devex"] for p in small), 4)})
    return big


def mil(rm_: int) -> float:
    return round(rm_ / 1e6, 4)


def ministry(d: Path, s: dict, code: str) -> dict:
    sm = s[code]
    t = text(d, code)
    oe = oe_items(t, code in DRILL) if sm["oe"] else []
    if sm["oe"] and not oe:  # no programme table (small T.x): one line
        oe = [(sm["name"], sm["oe"])]
    de = de_items(t) if sm["de"] else []
    assert sum(v for _, v in oe) == sm["oe"], (code, "OE", sum(v for _, v in oe), sm["oe"])
    assert sum(v for _, v in de) == sm["de"], (code, "DE", sum(v for _, v in de), sm["de"])
    visi, outcomes = about(t)
    # "about" is only set when the book has text for it (DE projects and most T.x have none).
    progs = [{"name": n, "opex": mil(v), "devex": 0, **({"about": outcomes[n]} if n in outcomes else {})}
             for n, v in oe if v] + \
            [{"name": n, "opex": 0, "devex": mil(v)} for n, v in de if v]
    return {"code": code, "name": sm["name"], "opex": mil(sm["oe"]), "devex": mil(sm["de"]),
            "locked": code.startswith("T"), **({"about": visi} if visi else {}), "programmes": merge_small(progs)}


def main(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)
    s = summary(d)
    assert len(s) == 40 + 14, len(s)
    used = {c for cs in SECTORS.values() for c in cs} - {"T.1-T.11"} | set(SMALL_T) | {"P.70"}
    assert used == set(s), set(s) ^ used

    sectors = []
    for sector, codes in SECTORS.items():
        ms = []
        for code in codes:
            if code != "T.1-T.11":
                ms.append(ministry(d, s, code))
                continue
            parts = [ministry(d, s, c) for c in SMALL_T]
            ms.append({"code": code, "name": "Tanggungan Perlembagaan Lain",
                       "opex": round(sum(p["opex"] for p in parts), 4), "devex": 0, "locked": True,
                       "programmes": [{"name": f"{p['code']} {p['name']}", "opex": p["opex"], "devex": 0}
                                      for p in parts]})
        sectors.append({"name": sector, "ministries": ms})

    total = sum(p["opex"] + p["devex"] for sec in sectors for m in sec["ministries"] for p in m["programmes"])
    assert abs(total - TOTAL) < 0.01, total
    for sec in sectors:
        for m in sec["ministries"]:
            assert abs(sum(p["opex"] for p in m["programmes"]) - m["opex"]) < 0.001, m["code"]
            assert abs(sum(p["devex"] for p in m["programmes"]) - m["devex"]) < 0.001, m["code"]

    OUT.write_text(json.dumps({"year": 2027, "unit": "RM million", "sectors": sectors},
                              ensure_ascii=False, indent=1) + "\n")
    n = sum(len(m["programmes"]) for sec in sectors for m in sec["ministries"])
    print(f"ok: {len(s) - 1} Maksud, {n} lines, RM{total:,.1f}m -> {OUT.name}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mof27"))
