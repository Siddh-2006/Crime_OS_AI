import mongoose from "mongoose";
import { CaseParticipant }   from "../models/CaseParticipant.model";
import { CaseEntity }        from "../models/CaseEntity.model";
import { Evidence }          from "../models/Evidence.model";
import { AnalysisSnapshot }  from "../models/AnalysisSnapshot.model";

export interface GraphNode {
  id: string;
  label: string;
  nodeType: "participant" | "entity" | "evidence";
  meta: Record<string, unknown>;
}
export interface GraphEdge {
  from: string;
  to: string;
  relationship: string;
  meta?: Record<string, unknown>;
}
export interface CaseGraph { nodes: GraphNode[]; edges: GraphEdge[]; }

function mkEdge(from: string, to: string, relationship: string, meta?: Record<string, unknown>): GraphEdge {
  return { from, to, relationship, meta };
}
function dedup(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter(e => {
    const key = `${e.from}|${e.to}|${e.relationship}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function buildGraph(caseId: string): Promise<CaseGraph> {
  const oid = new mongoose.Types.ObjectId(caseId);
  const [participants, entities, evidenceDocs, latestSnapshot] = await Promise.all([
    CaseParticipant.find({ case_id: oid }).lean().exec(),
    CaseEntity.find({ case_id: oid }).lean().exec(),
    Evidence.find({ case_id: oid }).lean().exec(),
    AnalysisSnapshot.findOne({ case_id: oid }).sort({ timestamp: -1 }).lean().exec(),
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (n: GraphNode) => { if (!nodeIds.has(n.id)) { nodeIds.add(n.id); nodes.push(n); } };

  // evidence_id -> _id string
  const evIdMap = new Map<string, string>();
  for (const ev of evidenceDocs) {
    evIdMap.set(ev.evidence_id, ev._id.toString());
    evIdMap.set(ev._id.toString(), ev._id.toString());
  }
  // participant name -> _id
  const pNameMap = new Map<string, string>();
  for (const p of participants) pNameMap.set((p.name || "").toLowerCase().trim(), p._id.toString());

  // 1. Participant nodes
  for (const p of participants) {
    addNode({ id: p._id.toString(), label: p.name || "Unknown", nodeType: "participant",
      meta: { roles: p.roles, identifiers: p.identifiers ?? [] } });
  }

  // 2. Existing CaseEntity nodes
  for (const e of entities) {
    addNode({ id: e._id.toString(), label: `${e.entity_type}: ${e.value}`, nodeType: "entity",
      meta: { entity_type: e.entity_type, value: e.value } });
    for (const ref of e.corroborating_evidence_ids ?? []) {
      const t = evIdMap.get(ref); if (t) edges.push(mkEdge(e._id.toString(), t, "corroborates"));
    }
  }

  // 3. Evidence nodes
  for (const ev of evidenceDocs) {
    addNode({ id: ev._id.toString(),
      label: `${(ev.type ?? "Evidence").toUpperCase()} #${(ev.evidence_id ?? ev._id.toString()).slice(-4)}`,
      nodeType: "evidence",
      meta: { type: ev.type, status: ev.status, evidence_id: ev.evidence_id, ai_tags: ev.ai_tags ?? [] } });
  }

  // 4. Evidence -> Participant (relatedParticipantIds or fallback all)
  for (const ev of evidenceDocs) {
    const evId = ev._id.toString();
    const linked = (ev.relatedParticipantIds ?? []).map((id: any) => id.toString());
    if (linked.length > 0) {
      for (const pId of linked) edges.push(mkEdge(evId, pId, "evidence_of"));
    } else {
      for (const p of participants) edges.push(mkEdge(evId, p._id.toString(), "evidence_of"));
    }
  }

  // 5. Participant identifier entity nodes
  for (const p of participants) {
    for (const ident of p.identifiers ?? []) {
      if (!ident.value) continue;
      const nodeId = `ident-${p._id}-${ident.type}`.replace(/\s+/g, "_");
      addNode({ id: nodeId, label: `${ident.type}: ${ident.value}`, nodeType: "entity",
        meta: { entity_type: ident.type, value: ident.value } });
      edges.push(mkEdge(p._id.toString(), nodeId, "has_identifier"));
    }
  }

  // 6. Shared identifiers between participants
  for (let i = 0; i < participants.length; i++) {
    const a = participants[i];
    const aVals = new Set((a.identifiers ?? []).map((id: any) => id.value?.trim().toLowerCase()).filter(Boolean));
    for (let j = i + 1; j < participants.length; j++) {
      const b = participants[j];
      const shared = (b.identifiers ?? []).filter((id: any) => id.value && aVals.has(id.value.trim().toLowerCase()));
      if (shared.length > 0)
        edges.push(mkEdge(a._id.toString(), b._id.toString(), "shared_identifier", { sharedValues: shared.map((s: any) => s.value) }));
    }
  }

  // 7. Evidence -> Legal Section entity nodes
  const secMap = new Map<string, string>(); // code -> nodeId
  const ensureSection = (code: string, title?: string) => {
    if (!code) return;
    if (!secMap.has(code)) {
      const nodeId = `sec-${code.replace(/[\s\/]+/g, "_")}`;
      secMap.set(code, nodeId);
      addNode({ id: nodeId, label: `§ ${code}`, nodeType: "entity", meta: { entity_type: "LegalSection", value: code, title } });
    }
  };

  for (const ev of evidenceDocs) {
    for (const sec of ev.applicableSections ?? []) {
      const code = sec.code || sec.title;
      if (!code) continue;
      ensureSection(code, sec.title);
      edges.push(mkEdge(ev._id.toString(), secMap.get(code)!, "applies_section"));
    }
  }

  // 8. Participant -> Legal Section (suspect appliedSections)
  for (const p of participants) {
    for (const sec of p.suspectProfile?.appliedSections ?? []) {
      const code = sec.code || sec.title;
      if (!code) continue;
      ensureSection(code, sec.title);
      edges.push(mkEdge(p._id.toString(), secMap.get(code)!, "charged_under"));
    }
  }

  // 9. Shared AI tags -> tag entity nodes (only tags on >=2 evidence items)
  const tagEvMap = new Map<string, string[]>();
  for (const ev of evidenceDocs) {
    for (const tag of ev.ai_tags ?? []) {
      const t = tag.trim().toLowerCase();
      if (t.length < 3) continue;
      if (!tagEvMap.has(t)) tagEvMap.set(t, []);
      tagEvMap.get(t)!.push(ev._id.toString());
    }
  }
  for (const [tag, evIds] of tagEvMap.entries()) {
    if (evIds.length < 2) continue;
    const nodeId = `tag-${tag.replace(/\s+/g, "_")}`;
    addNode({ id: nodeId, label: tag.charAt(0).toUpperCase() + tag.slice(1), nodeType: "entity",
      meta: { entity_type: "Tag", value: tag } });
    for (const evId of evIds) edges.push(mkEdge(evId, nodeId, "tagged_as"));
  }

  // 10. Evidence <-> Evidence: corroborates via shared legal section
  const evBySec = new Map<string, string[]>();
  for (const ev of evidenceDocs) {
    for (const sec of ev.applicableSections ?? []) {
      const code = sec.code || sec.title;
      if (!code) continue;
      if (!evBySec.has(code)) evBySec.set(code, []);
      evBySec.get(code)!.push(ev._id.toString());
    }
  }
  for (const evIds of evBySec.values()) {
    for (let i = 0; i < evIds.length; i++)
      for (let j = i + 1; j < evIds.length; j++)
        edges.push(mkEdge(evIds[i], evIds[j], "corroborates"));
  }

  // 11. Evidence type grouping -> type entity node
  const evByType = new Map<string, string[]>();
  for (const ev of evidenceDocs) {
    const t = (ev.type ?? "unknown").toLowerCase();
    if (!evByType.has(t)) evByType.set(t, []);
    evByType.get(t)!.push(ev._id.toString());
  }
  for (const [type, evIds] of evByType.entries()) {
    if (evIds.length < 2) continue;
    const nodeId = `evtype-${type}`;
    addNode({ id: nodeId, label: `Type: ${type}`, nodeType: "entity", meta: { entity_type: "EvidenceType", value: type } });
    for (const evId of evIds) edges.push(mkEdge(evId, nodeId, "same_type"));
  }

  // 12. AnalysisSnapshot: suspect_candidates + participant_recommendations
  if (latestSnapshot) {
    for (const suspect of (latestSnapshot as any).suspect_candidates ?? []) {
      const pId = pNameMap.get((suspect.entity ?? "").toLowerCase().trim());
      for (const ref of suspect.supporting_evidence_ids ?? []) {
        const evId = evIdMap.get(ref);
        if (evId && pId) edges.push(mkEdge(evId, pId, "supports_suspicion", { confidence: suspect.confidence }));
      }
      for (const ref of suspect.contradicting_evidence_ids ?? []) {
        const evId = evIdMap.get(ref);
        if (evId && pId) edges.push(mkEdge(evId, pId, "contradicts_suspicion"));
      }
    }
    for (const rec of (latestSnapshot as any).participant_recommendations ?? []) {
      const pId = pNameMap.get((rec.name ?? "").toLowerCase().trim());
      if (!pId) continue;
      for (const ref of rec.supporting_evidence_ids ?? []) {
        const evId = evIdMap.get(ref);
        if (evId) edges.push(mkEdge(evId, pId, "supports_role", { confidence: rec.confidence }));
      }
      for (const ref of rec.contradicting_evidence_ids ?? []) {
        const evId = evIdMap.get(ref);
        if (evId) edges.push(mkEdge(evId, pId, "contradicts_role"));
      }
      for (const sec of rec.recommended_sections ?? []) {
        const code = sec.code || sec.title;
        if (!code) continue;
        ensureSection(code, sec.title);
        edges.push(mkEdge(pId, secMap.get(code)!, "recommended_section"));
      }
    }
    for (const esr of (latestSnapshot as any).evidence_section_recommendations ?? []) {
      const evId = evIdMap.get(esr.evidence_id);
      if (!evId) continue;
      for (const sec of esr.applicable_sections ?? []) {
        const code = sec.code || sec.title;
        if (!code) continue;
        ensureSection(code, sec.title);
        edges.push(mkEdge(evId, secMap.get(code)!, "applies_section"));
      }
    }
  }

  return { nodes, edges: dedup(edges) };
}

export async function buildGraphContextSummary(caseId: string): Promise<string> {
  const { nodes, edges } = await buildGraph(caseId);
  const byId = new Map<string, GraphNode>();
  for (const n of nodes) byId.set(n.id, n);
  const lines: string[] = [];
  for (const e of edges) {
    const a = byId.get(e.from); const b = byId.get(e.to);
    if (!a || !b) continue;
    if (e.relationship === "shared_identifier")
      for (const v of (e.meta?.sharedValues as string[]) ?? [])
        lines.push(`- "${a.label}" and "${b.label}" share identifier '${v}'`);
    if (e.relationship === "supports_suspicion")
      lines.push(`- ${a.label} supports suspicion of ${b.label} (conf: ${e.meta?.confidence ?? "?"})`);
    if (e.relationship === "corroborates")
      lines.push(`- ${a.label} corroborates ${b.label}`);
  }
  return [...new Set(lines)].join("\n");
}