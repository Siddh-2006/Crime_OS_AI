#!/usr/bin/env python3
"""
test_manual.py — Manual QA test for the Prompt Compression Service
===================================================================
• Pulls a real complaint + analysis snapshot from local MongoDB
• Falls back to embedded sample text if MongoDB is unavailable
• Tests POST /compress at rate = 0.3 / 0.5 / 0.7
• For each run prints:
    – Original text (first 400 chars preview)
    – Compressed text
    – Token counts
    – Whether every force_token survived compression (highlighted)

Run:
    python test_manual.py
    python test_manual.py --no-mongo     # skip DB, use built-in sample
    python test_manual.py --url http://other-host:8005
"""
from __future__ import annotations

import argparse
import re
import sys
import textwrap
from typing import Optional

import requests

# ── ANSI colour helpers ──────────────────────────────────────────────────────
NO_COLOR = not sys.stdout.isatty()

def _c(code: str, text: str) -> str:
    if NO_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"

def bold(t: str)    -> str: return _c("1",    t)
def green(t: str)   -> str: return _c("1;32", t)
def red(t: str)     -> str: return _c("1;31", t)
def yellow(t: str)  -> str: return _c("1;33", t)
def cyan(t: str)    -> str: return _c("1;36", t)
def dim(t: str)     -> str: return _c("2",    t)

DIVIDER = "─" * 78

# ── MongoDB helpers ──────────────────────────────────────────────────────────

MONGO_URI = "mongodb://localhost:27017/crime-os"

def _try_mongo() -> Optional[str]:
    """
    Try to pull a real case narrative from local MongoDB.
    Returns a rich text string or None if unavailable.
    """
    try:
        import pymongo  # type: ignore

        client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
        db = client["crime-os"]

        # Find the most recent analysis snapshot that has a detailed_description
        snap = db.analysissnapshots.find_one(
            {"facts_used.complaint.detailed_description": {"": True, "": ""}},
            sort=[("_id", -1)],
        )
        if not snap:
            return None

        complaint = snap.get("facts_used", {}).get("complaint", {})
        checklist = snap.get("facts_used", {}).get("checklist", {})
        narrative  = snap.get("narrative_summary", "")

        case_id    = complaint.get("complaint_number", str(snap.get("case_id", "")))
        desc       = complaint.get("detailed_description", "")
        date       = complaint.get("incident_date", "")
        place      = complaint.get("incident_place", "")
        legal      = complaint.get("legal_sections_history", [{}])[-1].get("content", "")
        steps      = checklist.get("steps", [])

        # Build a diary-entry-style narrative
        step_text = "\n".join(
            f"  [{i+1}] {s.get('title','')[:200]} (criticality={s.get('criticality','?')}, "
            f"status={s.get('status','?')})"
            for i, s in enumerate(steps[:6])
        )

        # Participants
        parts = snap.get("facts_used", {}).get("participants", {}).get("by_role", {})
        accused_list = parts.get("Accused", []) or parts.get("accused", [])
        acc_text = "\n".join(
            f"  • {a.get('name', 'Unknown')} | Phone: {a.get('contact_number', 'N/A')} "
            f"| Address: {a.get('address', 'N/A')}"
            for a in accused_list[:3]
        ) or "  No accused identified yet."

        text = textwrap.dedent(f"""
        CASE DIARY — ROZNAMCHA ENTRY
        ============================
        Case ID       : {case_id}
        Incident Date : {date}
        Location      : {place}
        Legal Sections: {legal}

        INCIDENT NARRATIVE
        ------------------
        {desc}

        INVESTIGATION STATUS AS OF 2026-08-12
        ---------------------------------------
        The Investigating Officer has received the complaint and registered the FIR under
        the applicable Bharatiya Nyaya Sanhita (BNS) provisions. The case involves a
        sophisticated online investment fraud targeting a resident of Ahmedabad. The
        complainant was contacted by an individual identifying himself as a senior
        investment advisor operating under the entity 'Prime Wealth Investments Pvt. Ltd.',
        which was subsequently found to be unregistered with the Ministry of Corporate
        Affairs. The accused communicated primarily via WhatsApp (+91-XXXXXXXXXX) and
        directed all funds to multiple mule bank accounts and UPI IDs.

        Initial financial intelligence gathered from the State Cyber Crime Portal
        (Cyber Portal Ref: CYB-2026-AHM-0441) confirms that the UPI IDs
        rohitsharma@ybl, primewealthinv@paytm, and secure.trade88@icici were flagged for
        suspicious activity between 2026-07-15 and 2026-07-25. The complainant transferred
        a total of ₹3,40,000 in seven tranches to these accounts.

        IO visited Kochrab, Sabarmati on 2026-08-10 and recorded a statement from the
        complainant Vinod Laxman Sharma (Age: 48, Mobile: 94270-00111). The complainant
        produced original UPI receipts and bank passbook entries confirming each transfer.
        CCTV footage request has been sent to Axis Bank, SBI, and Paytm. An LOC (Look Out
        Circular) notice has been drafted pending approval from the Superintendent of
        Police.

        PENDING INVESTIGATION STEPS
        ----------------------------
        {step_text}

        ACCUSED DETAILS (as known)
        ---------------------------
        {acc_text}

        NARRATIVE ANALYSIS SUMMARY
        ---------------------------
        {narrative[:600] if narrative else "Pending LLM analysis."}

        IO Signature: PI Ramesh Kumar Patel
        Station     : Sabarmati PS, Ahmedabad
        Date        : 2026-08-12
        Report Ref  : FIR/SBM/2026/0441
        """).strip()

        # Extract identifiers that must survive compression
        ids   = re.findall(r"COMP-[\w-]+|CYB-[\w-]+|FIR/[\w/]+", text)
        dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
        phones = re.findall(r"9\d{9}|94\d{3}-\d{5}", text)

        force = list(dict.fromkeys(ids + dates + phones))[:15]   # dedupe, cap at 15
        return text, force, case_id

    except Exception as exc:
        print(dim(f"  [MongoDB] Could not connect: {exc}"))
        return None


# ── Built-in fallback sample ─────────────────────────────────────────────────

FALLBACK_TEXT = textwrap.dedent("""
CASE DIARY — ROZNAMCHA ENTRY
============================
Case ID       : COMP-21973124-a615-4b00-a523-9cb8e0dc3f4b
Incident Date : 2026-07-15
Location      : Kochrab, Sabarmati, Ahmedabad, Gujarat – 380043
Legal Sections: BNS-117 (Cheating), IT Act Section 66C (Identity Theft), IT Act Section 66D

INCIDENT NARRATIVE
------------------
On July 15, 2026, the complainant Vinod Laxman Sharma (Age 48, Mobile: 9427000111, residing
at 14-B Shantinagar Society, Satellite Road, Ahmedabad – 380015) encountered an investment
advertisement on Facebook. The advertisement, displayed under the brand name "Prime Wealth
Investments Pvt. Ltd.", promised guaranteed monthly returns of 30% through cryptocurrency
arbitrage trading. The complainant, believing the platform to be legitimate, clicked the link
and submitted his mobile number, whereupon he received a callback from an individual
identifying himself as "Rohit Sharma, Senior Investment Advisor" (Contact: +91-9820044571).

The said Rohit Sharma conducted multiple WhatsApp video calls to demonstrate a purported
investment dashboard, which showed live profits and withdrawal history of other investors.
Convinced by this demonstration, the complainant agreed to invest and was instructed to
transfer the initial tranche to UPI ID: rohitsharma@ybl (registered with Yes Bank,
account holder: Priya Mehta, A/c No: 012345678901). Between 2026-07-15 and 2026-07-24,
the complainant made seven separate UPI transfers totalling ₹3,40,000 as follows:

  – 2026-07-15: ₹10,000 → rohitsharma@ybl
  – 2026-07-17: ₹50,000 → primewealthinv@paytm
  – 2026-07-18: ₹60,000 → primewealthinv@paytm
  – 2026-07-20: ₹70,000 → secure.trade88@icici
  – 2026-07-21: ₹50,000 → secure.trade88@icici
  – 2026-07-22: ₹50,000 → secure.trade88@icici
  – 2026-07-24: ₹50,000 → secure.trade88@icici

Upon the complainant requesting withdrawal of his principal and profit, the accused demanded
an additional payment of ₹75,000 described as "Tax Clearance Charges" and "RBI Compliance
Fee". The complainant refused this demand, after which his account on the investment platform
was blocked and the accused ceased all communication. The total financial loss is ₹3,50,000.

INVESTIGATION STATUS (as of 2026-08-12)
-----------------------------------------
The IO registered FIR/SBM/2026/0441 at Sabarmati Police Station on 2026-08-12. Initial
verification with the Ministry of Corporate Affairs portal confirmed that "Prime Wealth
Investments Pvt. Ltd." holds no valid CIN registration. The UPI IDs rohitsharma@ybl,
primewealthinv@paytm, and secure.trade88@icici were flagged by the State Cyber Crime Portal
under Cyber Complaint Reference: CYB-2026-AHM-0441.

On 2026-08-10, IO PI Ramesh Kumar Patel (Badge: PBR-4492) visited Kochrab, Sabarmati and
recorded the complainant's statement. Physical UPI receipts, bank passbook pages (Axis Bank,
IFSC: UTIB0001234), and three WhatsApp conversation screenshots were collected as evidence
(Evidence IDs: EV-001, EV-002, EV-003). CCTV footage acquisition letters have been issued
to Axis Bank and SBI, Satellite Road branch. An LOC notice (LOC/AHM/2026/0187) has been
drafted pending SP approval. The matter has been forwarded to the Gujarat Cyber Crime Cell
under reference GCC/2026/1102.

A court summons has been issued to Yes Bank requesting Know-Your-Customer (KYC) data for
A/c No: 012345678901 associated with UPI ID rohitsharma@ybl. Similar requests have been sent
to ICICI Bank and Paytm Payments Bank. Responses are expected within 15 working days
per Section 91 CrPC mandate.

IO Signature: PI Ramesh Kumar Patel, Sabarmati PS, Ahmedabad – 2026-08-12
""").strip()

FALLBACK_FORCE = [
    "COMP-21973124-a615-4b00-a523-9cb8e0dc3f4b",
    "FIR/SBM/2026/0441",
    "CYB-2026-AHM-0441",
    "2026-07-15",
    "2026-07-24",
    "2026-08-12",
    "9427000111",
    "+91-9820044571",
    "BNS-117",
    "EV-001",
    "LOC/AHM/2026/0187",
]


# ── Core test runner ─────────────────────────────────────────────────────────

def run_compression_test(
    base_url: str,
    text: str,
    force_tokens: list[str],
    rate: float,
    source_label: str,
) -> None:
    print()
    print(DIVIDER)
    print(bold(f" RATE = {rate}  ({int(rate*100)}% tokens kept)  |  source: {source_label}"))
    print(DIVIDER)

    payload = {
        "text": text,
        "rate": rate,
        "force_tokens": force_tokens,
    }

    try:
        resp = requests.post(f"{base_url}/compress", json=payload, timeout=120)
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        print(red("  ✗ Connection refused — is the service running on " + base_url + "?"))
        return
    except requests.exceptions.HTTPError as e:
        print(red(f"  ✗ HTTP {resp.status_code}: {resp.text[:300]}"))
        return
    except Exception as e:
        print(red(f"  ✗ Unexpected error: {e}"))
        return

    data = resp.json()
    compressed    = data["compressed_text"]
    orig_tok      = data["original_tokens"]
    comp_tok      = data["compressed_tokens"]
    ratio         = data["compression_ratio"]

    # ── Print stats ──────────────────────────────────────────────────────────
    print(f"\n  {bold('Token stats:')}")
    print(f"    Original  : {yellow(str(orig_tok))} tokens")
    print(f"    Compressed: {yellow(str(comp_tok))} tokens")
    saved_pct = round((1 - ratio) * 100, 1)
    ratio_color = green if ratio < 0.45 else (yellow if ratio < 0.65 else red)
    print(f"    Ratio     : {ratio_color(f'{ratio:.3f}')}  ({saved_pct}% reduction)")

    # ── Original preview ─────────────────────────────────────────────────────
    print(f"\n  {bold('Original text (first 350 chars):')}")
    preview = textwrap.fill(text[:350], width=76, initial_indent="    ", subsequent_indent="    ")
    print(dim(preview))
    print(dim(f"    ... [{orig_tok} tokens total]"))

    # ── Compressed output ────────────────────────────────────────────────────
    print(f"\n  {bold('Compressed text:')}")
    wrapped = textwrap.fill(compressed, width=76, initial_indent="    ", subsequent_indent="    ")
    print(wrapped)

    # ── Force-token survival check ────────────────────────────────────────────
    print(f"\n  {bold('Force-token survival check:')}")
    all_survived = True
    for token in force_tokens:
        survived = token in compressed
        mark  = green("  ✓ SURVIVED ") if survived else red("  ✗ DROPPED  ")
        print(f"{mark}  {cyan(repr(token))}")
        if not survived:
            all_survived = False

    if all_survived:
        print(f"\n  {green(bold('✓ All force_tokens survived compression.'))}")
    else:
        dropped = [t for t in force_tokens if t not in compressed]
        print(f"\n  {red(bold(f'✗ {len(dropped)} force_token(s) were dropped!'))}")

    print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Manual QA test for /compress endpoint")
    parser.add_argument("--url",      default="http://localhost:8005", help="Base URL of the service")
    parser.add_argument("--no-mongo", action="store_true",             help="Skip MongoDB, use built-in sample")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")

    # ── Health check ─────────────────────────────────────────────────────────
    print()
    print(bold("━" * 78))
    print(bold(" PROMPT COMPRESSION SERVICE — MANUAL QA TEST"))
    print(bold("━" * 78))
    print(f"\n  Endpoint : {cyan(base_url)}")
    print( "  Checking health ... ", end="", flush=True)
    try:
        h = requests.get(f"{base_url}/health", timeout=5)
        hd = h.json()
        print(green("OK"))
        print(f"  Model    : {dim(hd.get('model','?'))}")
    except Exception as e:
        print(red(f"FAILED ({e})"))
        print(red("  Service is not running. Start it with:"))
        print(red("    uvicorn app.main:app --port 8005"))
        sys.exit(1)

    # ── Source selection ──────────────────────────────────────────────────────
    text, force_tokens, source_label = FALLBACK_TEXT, FALLBACK_FORCE, "embedded sample"

    if not args.no_mongo:
        print("\n  Trying MongoDB for a real case ... ", end="", flush=True)
        result = _try_mongo()
        if result:
            text, force_tokens, case_label = result
            source_label = f"MongoDB – {case_label}"
            print(green(f"OK ({case_label})"))
            print(f"  Text length : {len(text)} chars")
            print(f"  Force tokens: {force_tokens}")
        else:
            print(yellow("unavailable — using embedded sample"))

    print(f"\n  {bold('Force tokens to protect:')}")
    for ft in force_tokens:
        print(f"    {cyan(repr(ft))}")

    # ── Run at three rates ────────────────────────────────────────────────────
    for rate in [0.5, 0.3, 0.7]:
        run_compression_test(base_url, text, force_tokens, rate, source_label)

    run_gemma_comparison(base_url, text, force_tokens)

    print(bold("=" * 78))
    print(bold(" ALL TESTS COMPLETE"))
    print(bold("=" * 78))
    print()



# ─────────────────────────────────────────────────────────────────────────────
# GEMMA SIDE-BY-SIDE COMPARISON (Test 2)
# ─────────────────────────────────────────────────────────────────────────────

OLLAMA_URL   = "http://localhost:11434/api/generate"
GEMMA_MODEL  = "gemma4:e2b"
GEMMA_QUESTION = (
    "Summarize the key facts, dates, and any phone numbers or case IDs "
    "mentioned in this text. Be specific and list each one explicitly."
)


def _query_gemma(prompt_text: str, label: str) -> tuple[str, float]:
    """
    Send prompt_text to Gemma via Ollama /api/generate (non-streaming).
    Returns (response_text, elapsed_seconds).
    """
    import json, time
    payload = {
        "model":  GEMMA_MODEL,
        "prompt": f"{GEMMA_QUESTION}\n\n---\n\n{prompt_text}",
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0.1,   # near-deterministic for fair comparison
            "num_predict": 1500,
        },
    }
    t0 = time.time()
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300)
        resp.raise_for_status()
        data = resp.json()
        elapsed = time.time() - t0
        return data.get("response", "").strip(), round(elapsed, 1)
    except requests.exceptions.ConnectionError:
        return "[ERROR] Ollama not reachable at " + OLLAMA_URL, 0.0
    except Exception as e:
        return f"[ERROR] {e}", 0.0


def _diff_facts(original_resp: str, compressed_resp: str, force_tokens: list[str]) -> None:
    """
    Check whether each force_token appears in Gemma's response for both
    original and compressed. Print a per-token comparison table.
    """
    print(f"\n  {bold('Critical fact extraction (force_tokens in Gemma response):')}")
    header = f"  {'Token':<46}  {'Original':^10}  {'Compressed':^12}"
    print(dim(header))
    print(dim("  " + "-" * 72))

    total = len(force_tokens)
    matched_both = 0
    dropped_in_compressed = []

    for token in force_tokens:
        in_orig = token.lower() in original_resp.lower()
        in_comp = token.lower() in compressed_resp.lower()
        if in_orig and in_comp:
            matched_both += 1
            mark_o = green("  YES  ")
            mark_c = green("  YES     ")
        elif in_orig and not in_comp:
            dropped_in_compressed.append(token)
            mark_o = green("  YES  ")
            mark_c = red("  MISSING ")
        elif not in_orig and in_comp:
            mark_o = yellow("  NO   ")
            mark_c = green("  YES     ")
        else:
            mark_o = yellow("  NO   ")
            mark_c = yellow("  NO      ")
        print(f"  {cyan(token):<46}  {mark_o}  {mark_c}")

    print(dim("  " + "-" * 72))
    if not dropped_in_compressed:
        print(f"\n  {green(bold(f'VERDICT: Gemma extracted identical facts from compressed text ({matched_both}/{total} tokens found in both).'))}")
        print(f"  {green(bold('Compression did NOT degrade fact extraction. Safe to wire in.'))}")
    else:
        print(f"\n  {red(bold(f'VERDICT: {len(dropped_in_compressed)} fact(s) dropped in compressed Gemma response:'))}")
        for t in dropped_in_compressed:
            print(f"    {red(repr(t))}")
        print(f"  {yellow('Consider adding these to force_tokens or increasing rate.')}")


def run_gemma_comparison(
    base_url: str,
    text: str,
    force_tokens: list[str],
) -> None:
    """Compress at rate=0.5, query Gemma with original + compressed, compare."""

    print()
    print(bold("=" * 78))
    print(bold(" TEST 2 — GEMMA SIDE-BY-SIDE COMPARISON  (rate=0.5)"))
    print(bold("=" * 78))
    print(f"\n  Model   : {cyan(GEMMA_MODEL)}")
    print(f"  Question: {dim(GEMMA_QUESTION)}\n")

    # ── Step 1: compress ──────────────────────────────────────────────────────
    print("  [1/3] Compressing at rate=0.5 ... ", end="", flush=True)
    try:
        resp = requests.post(
            f"{base_url}/compress",
            json={"text": text, "rate": 0.5, "force_tokens": force_tokens},
            timeout=120,
        )
        resp.raise_for_status()
        cdata = resp.json()
        compressed_text = cdata["compressed_text"]
        orig_tok   = cdata["original_tokens"]
        comp_tok   = cdata["compressed_tokens"]
        ratio      = cdata["compression_ratio"]
        print(green(f"done ({orig_tok} -> {comp_tok} tokens, ratio={ratio:.3f})"))
    except Exception as e:
        print(red(f"FAILED: {e}"))
        return

    # ── Step 2: query Gemma with ORIGINAL ─────────────────────────────────────
    print(f"  [2/3] Querying Gemma with {bold('ORIGINAL')} text ({orig_tok} tokens) ... ", end="", flush=True)
    orig_response, orig_time = _query_gemma(text, "original")
    if orig_response.startswith("[ERROR]"):
        print(red(orig_response))
        return
    print(green(f"done ({orig_time}s)"))

    # ── Step 3: query Gemma with COMPRESSED ───────────────────────────────────
    print(f"  [3/3] Querying Gemma with {bold('COMPRESSED')} text ({comp_tok} tokens) ... ", end="", flush=True)
    comp_response, comp_time = _query_gemma(compressed_text, "compressed")
    if comp_response.startswith("[ERROR]"):
        print(red(comp_response))
        return
    print(green(f"done ({comp_time}s)"))

    speedup = round(orig_time / comp_time, 2) if comp_time > 0 else 0
    print(f"\n  Inference speedup: {yellow(f'{speedup}x')} faster with compressed input ({orig_time}s -> {comp_time}s)")

    # ── Side-by-side display ───────────────────────────────────────────────────
    col_w = 37

    def _wrap_col(txt: str, width: int) -> list[str]:
        lines = []
        for para in txt.split("\n"):
            if para.strip() == "":
                lines.append("")
            else:
                lines.extend(textwrap.wrap(para, width=width) or [""])
        return lines

    orig_lines = _wrap_col(orig_response, col_w)
    comp_lines = _wrap_col(comp_response, col_w)
    max_lines  = max(len(orig_lines), len(comp_lines))
    orig_lines += [""] * (max_lines - len(orig_lines))
    comp_lines += [""] * (max_lines - len(comp_lines))

    print()
    header_l = bold(f"  {'ORIGINAL ('+str(orig_tok)+' tokens)':<{col_w+2}}")
    header_r = bold(f"  COMPRESSED ({comp_tok} tokens)")
    print(header_l + "  |  " + header_r)
    print("  " + "-" * col_w + "  |  " + "-" * col_w)

    for ol, cl in zip(orig_lines, comp_lines):
        print(f"  {ol:<{col_w}}  |  {cl}")

    print("  " + "-" * col_w + "  |  " + "-" * col_w)

    # ── Fact extraction diff ──────────────────────────────────────────────────
    _diff_facts(orig_response, comp_response, force_tokens)
    print()
if __name__ == "__main__":
    main()


