# Investigation Orchestration Pipeline — Diary, Checklist, Request Agent & Analysis Loop
### Built to fit your existing repo (Next.js frontend, Express/Mongo/BullMQ backend, legal_agent + io-recommendation FastAPI services)

---

## 0. How this fits your existing repo

You don't need a fourth microservice for everything. Split responsibility along the lines your repo already draws:

- **`backend` (Express/Mongo/BullMQ)** — becomes the system of record and orchestrator. New module `modules/investigation/` owns the diary, checklist, evidence links, department requests, and analysis snapshots (all in Mongo). It calls out to the two Python services for AI work, and reuses your existing `EmailQueue`/`EmailWorker` pattern for anything async (analysis runs, department dispatch, response ingestion).
- **`legal_agent` (FastAPI)** — stays exactly what it is: your SOP + legal-corpus RAG retriever (`run_legal_copilot.py`). The orchestrator calls it, doesn't rebuild it.
- **`io-recommendation` (FastAPI)** — stays what it is too: semantic similarity over past closed FIRs. The orchestrator calls it as a secondary signal ("what worked in similar cases"), not as the primary reasoning engine.
- **New: a small `llm-router` layer** (can live inside `backend` as a service module, calling local model servers via HTTP — llama.cpp/Ollama-style). This is what decides *fast model* vs *deep model* per call (Section 5). It doesn't need to be its own repo/service — a thin client module is enough.

This keeps your Mongo/BullMQ backend as the only place case state actually lives — exactly the "facts you already stored, query for it" principle from earlier. The Python services never hold case state; they only answer "given this query, what's relevant" (legal_agent) or "given this facts fill, what's next" (llm-router).

---

## 1. The Diary Data Model (Mongo)

The diary is an **append-only event log**. Everything else (checklist, evidence list, request status) is a materialized view derived from it or updated alongside it — never the other way around. This gives you the audit trail for free and means "what happened and when" is never reconstructed after the fact.

```js
// diary_entries — the append-only log. Never updated or deleted, only inserted.
{
  _id, case_id, entry_id, timestamp,
  actor: { type: "officer" | "system" | "department", id },
  event_type: "complaint_filed" | "evidence_added" | "checklist_step_completed"
            | "request_drafted" | "request_sent" | "response_received"
            | "analysis_run" | "suggestion_generated" | "officer_note"
            | "manual_step_added" | "override_correction" | "escalation_raised",
  payload: { ... event-specific data ... },
  ref_ids: { evidence_id, request_id, step_id, snapshot_id }  // whichever apply
}

// case_entities — extracted/known facts about the case (phone, account, UPI, IMEI...)
{ case_id, entity_type, value, first_seen_entry_id, corroborating_evidence_ids: [] }

// evidence — one doc per item
{ case_id, evidence_id, type, storage_ref, ai_description, ai_tags,
  uploader_id, status, linked_diary_entry_id, linked_request_id }

// case_checklist — one doc per SOP step instantiated for this case
{ case_id, sop_id, step_id, title, status: "pending"|"blocked"|"in_progress"|"completed",
  criticality: "high"|"medium"|"low",       // used for confidence weighting, Section 6
  required_evidence: [...], proof_evidence_ids: [],
  locked_by_request_id, completed_by, completed_at }

// department_requests — one doc per outbound request
{ case_id, request_id, step_id, department_entity_id,
  draft_content, attachments: [evidence_id...],
  status: "draft"|"reviewed"|"sent"|"acknowledged"|"response_received"|"overdue",
  sent_via: "email"|"portal_mock", sent_at, response_ref, response_at }

// analysis_snapshots — one doc per time the AI (or officer) re-evaluates the case
{ case_id, snapshot_id, timestamp, trigger: "manual"|"auto_on_response"|"officer_override",
  facts_used: {...},                          // exact facts object fed to the LLM — for audit
  ranked_next_steps: [{ step_id, reason, confidence, evidence_needed }],
  suspect_candidates: [{ entity, confidence, supporting_evidence_ids, contradicting_evidence_ids }],
  narrative_summary, confidence_breakdown: {...},
  officer_authored: false, parent_snapshot_id
}

// escalations
{ case_id, escalation_id, reason, triggered_at, summary, sent_to, status }
```

Everything the UI shows — the diary view, the checklist, the "why did the AI say this" panel — reads directly from these collections. No search involved for any of it.

---

## 2. The Core Loop (what happens end-to-end)

```
Officer opens assigned case → reads AI-generated summary (from latest analysis_snapshot)
        ↓
Officer clicks "Analyze / Suggest Steps"
        ↓
[ORCHESTRATOR — Section 3] builds facts object → queries legal_agent + io-recommendation
        → deep model ranks next steps + updates suspect confidence → analysis_snapshot saved
        → diary_entry(analysis_run) appended
        ↓
Officer sees ranked suggestions in checklist UI. For each suggested step, one of three paths:

  PATH A — needs external department request
    Officer clicks step → Request Composer opens (pre-filled draft, attachments,
    legal basis — Section 4) → officer reviews/edits → sends
    → checklist step locks (status=in_progress, locked_by_request_id set)
    → department_requests doc created, dispatched via BullMQ (reuse EmailWorker)
    → [async] response arrives → ingested as evidence + diary_entry(response_received)
    → checklist step auto-completes → dependent steps unlock (SOP's on_complete_trigger)
    → triggers a fresh analysis_run automatically (event-driven, via BullMQ job)

  PATH B — officer does it personally (interview, site visit, physical search)
    Officer performs the action → uploads proof (photo/note/statement) via the shared
    Evidence subsection → manually ticks checklist with proof_evidence_ids attached
    → checklist step completes → diary_entry(checklist_step_completed)
    → officer can trigger analysis_run manually, or it can wait for next click

  PATH C — officer adds a step manually (not from AI suggestion)
    Officer types/selects a custom step → diary_entry(manual_step_added)
    → new case_checklist doc created with source="manual"
        ↓
Loop repeats: request/complete → analyze → suggest → request/complete → analyze...
        ↓
Escalation check runs on every analysis_run (Section 7) — auto-flags if stuck
        ↓
Eventually: suspect_candidates confidence is high + required evidence covered
→ officer marks case "investigation complete" → (chargesheet stage — separate, later)
```

---

## 3. The Orchestrator (what "Analyze" actually does, step by step)

This is a single backend endpoint, e.g. `POST /cases/:id/analyze`, run as a BullMQ job (not inline in the request — this can take a few seconds with a deep model, so treat it like your existing email jobs: enqueue, process async, push result to frontend via polling or a websocket/SSE if you want it to feel live).

```
1. FACTS ASSEMBLY (pure Mongo queries, no AI):
   - all case_checklist docs (status, criticality, required_evidence)
   - all case_entities
   - all evidence docs (type, tags, description, linked step)
   - all department_requests (status, overdue flags)
   - last N diary_entries for recency context
   → facts_object (this is what gets logged into analysis_snapshots.facts_used)

2. RETRIEVAL:
   a. Call legal_agent's copilot/retrieval endpoint with a query built from
      facts_object (crime_type + completed/pending steps + any blocked step) →
      get back relevant SOP step chunks + legal clause text, exactly as your
      run_legal_copilot.py already does.
   b. Call io-recommendation with the case's complaint text → get back similar
      closed FIRs as a secondary signal (what steps those cases eventually took
      that led to resolution, if that metadata is in your historical records).

3. FAST MODEL PASS (Section 5) — cheap, frequent:
   - Turn raw retrieval + facts into clean, formatted candidate step descriptions
   - Draft any letter content needed if a step requires a department request
   - Produce a short human-readable "what changed since last analysis" caption

4. DEEP MODEL PASS (Section 5) — only at this one decision point:
   - Input: facts_object + retrieved SOP/legal chunks + similar-case signal +
     fast-model-formatted candidates
   - Output (strict JSON): ranked_next_steps, suspect_candidates with confidence
     and supporting/contradicting evidence, narrative_summary
   - Same grounding constraint as the earlier SOP engine design: the model may
     only rank/select from steps present in retrieval, never invent a step
     absent from the SOP corpus, and may not cite a legal section not in the
     retrieved legal chunks.

5. PERSIST: write analysis_snapshot, append diary_entry(analysis_run),
   update case_checklist docs if statuses changed, run escalation check (Section 7).
```

---

## 4. Request Composer (the department-agent sub-flow)

- Triggered from a checklist step's "Request" button.
- Pulls the department's template from your `Department_Registry.json` (`request_format_expected`, `legal_basis_typically_cited`) already ingested in `legal_agent`.
- Fast model fills the template with case entities (account number, UPI ID, dates) pulled straight from `case_entities` — this is templated fill, not free generation, so it's cheap and low-risk.
- Attachments: officer selects from the case's existing evidence (shared Evidence subsection — exactly as you described, one evidence store reused everywhere, not step-specific storage).
- Officer reviews, edits inline, re-attaches if something's wrong (same shared upload component).
- On send: reuse your existing `EmailQueue`/`EmailWorker` — add a new job type `SEND_DEPARTMENT_REQUEST`. For departments without a real portal integration (i.e., everyone, at prototype stage), it's a formatted email to their address, which is exactly the "forward to inbox" behavior you described and matches what your backend already does for other emails.
- Inbound response: for the prototype, this can be either (a) an officer manually uploading the received document/reply against the request, or (b) a simple inbound-email webhook route that attaches whatever arrives to the matching `department_requests` doc by matching on a reference ID you put in the outbound subject line. Either path ends the same way: evidence created, checklist step ticked, `diary_entry(response_received)` appended, and a new `analyze` job enqueued automatically — this is the event-driven trigger you wanted, and BullMQ is exactly the right tool for it since it's already in your stack.

---

## 5. Two-Model Routing — Fast vs Deep

**Fast lane** — high frequency, low stakes, must be quick: letter drafting from template, formatting retrieved chunks into readable suggestions, short "what changed" captions, evidence tag assistance (once you build that later).
**Deep lane** — rare, high stakes, needs real reasoning: ranking next steps by investigative value, suspect confidence scoring, escalation judgment, reasoning through an officer's override/correction.

Your `legal_agent` already uses Qwen for its copilot — good, keep that as your fast-lane default. For the deep lane, pick based on your actual hardware (tell me your GPU/VRAM and I'll pin one exact model, but here's the tiered guidance so you're not blocked):

| Your hardware | Fast lane | Deep lane |
|---|---|---|
| ≤8GB VRAM / CPU-only | Qwen2.5-7B-Instruct (Q4 GGUF via llama.cpp/Ollama) | Same model, but with explicit chain-of-thought prompting + low temperature — treat deep-lane calls as rare enough (only on real analysis events) to route to a hosted API instead (you already have Gemini Pro / ChatGPT accounts from the data-generation phase) rather than straining local hardware |
| 12–16GB VRAM | Qwen2.5-7B/14B-Instruct | DeepSeek-R1-Distill-Qwen-14B (Q4/Q5) — reasoning-distilled, noticeably better at multi-step ranking/justification than a same-size instruct model |
| 24GB+ VRAM | Qwen2.5-14B-Instruct | Qwen2.5-32B-Instruct or DeepSeek-R1-Distill-Qwen-32B (Q4) |

One correction: there's no "Gemma 4" — Google's latest open-weight line is Gemma 3 (up to 27B). It's a fine deep-lane option if you specifically want to test it, but DeepSeek-R1-Distill or Qwen2.5-32B will generally out-perform it on structured multi-step reasoning tasks like ranking and confidence justification, since they're purpose-tuned for exactly that kind of reasoning chain.

Since the deep lane only fires on `analyze` events (not on every click), it can afford to be slower and heavier than the fast lane without hurting the officer's day-to-day experience — that asymmetry is what makes this whole two-lane split worth the complexity.

---

## 6. Confidence Scoring — keep it a computed, explainable number, not an LLM guess

Don't let the deep model invent the confidence percentage from nothing — compute a base score in code from facts, then have the model *explain* it, same principle as everywhere else in this design.

```
confidence_score = weighted_sum(
    evidence_coverage   = (required_evidence_present / required_evidence_total),
    checklist_progress  = (completed_steps weighted by criticality) / (total steps weighted by criticality),
    corroboration       = min(1.0, independent_evidence_sources_pointing_to_same_entity / 3),
    contradiction_penalty = -0.15 per unresolved contradicting evidence item
)
```

Feed this breakdown to the deep model and ask it to **narrate why**, not to produce the number itself. Display it to the officer as a breakdown, not a bare percentage — "92%, driven by: 4/4 required evidence present, 2 independent sources corroborating this account, no contradictions" is defensible in front of a legal advisor; a bare "92%" from an LLM is not. Treat >90% as "strong multi-source corroboration," not a literal statistical probability — that framing matters if this ever gets referenced near a chargesheet.

---

## 7. Escalation Logic

Runs automatically as the last step of every `analyze` job — pure code, no LLM judgment call on *whether* to escalate (only the summary text going with it is LLM-written):

```
Escalate if:
  - 3+ consecutive analysis_runs with no new checklist completions AND no new evidence, OR
  - all currently available next steps are in a blocked/dead-end state with no
    remaining dead_end_strategies to try, OR
  - officer manually requests escalation
→ fast model drafts a short summary (case state, what's been tried, why stuck)
→ escalation doc created, diary_entry(escalation_raised) appended
→ notification sent to SHO/head via existing EmailWorker
```

---

## 8. Officer Override / Correction Chat

Scoped to the current `analysis_snapshot`, not a general chatbot:
- Officer sends a message ("this suspect link is wrong, the account belongs to the victim's brother, not the accused").
- Deep model receives: the officer's message + the current snapshot's `facts_used` + the message itself, with an instruction to revise the analysis consistent with the correction, not to argue with case facts it wasn't given reason to doubt.
- Produces a new `analysis_snapshot` with `parent_snapshot_id` set and the officer's correction logged in the diary (`override_correction`) — nothing is silently overwritten, the chain of reasoning stays auditable.
- Fully manual entry (officer bypasses AI entirely and writes the analysis themselves) is just `analysis_snapshot` with `officer_authored: true` and no AI call at all — same schema, same place in the diary, just a different origin.

---

## 9. What's Deliberately Out of Scope Right Now (per your ask)

- Evidence auto-description/tagging model — you're hand-filling this for testing; wire in later without changing anything above, since evidence docs already have `ai_description`/`ai_tags` fields ready to receive it.
- Real department portal integrations — email-only for now, matches your existing EmailWorker.
- Chargesheet generation — explicitly deferred, will build on top of the final high-confidence `analysis_snapshot` + full diary once this loop is solid.
- Rank/authorization gating on request dispatch (flagged in the earlier legal review) — worth adding before this goes near a real demo audience, but not blocking for your isolated test build.

---

## Next Step

This is the full loop design. When you're ready, next pieces to nail down are: (1) the exact prompt templates for the fast-lane and deep-lane calls (with the grounding constraints written in), and (2) the facts-object → retrieval-query construction logic in more detail. Tell me which to start with.
