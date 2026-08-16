import mongoose from 'mongoose';
import { CaseParticipant }  from '../models/CaseParticipant.model';
import { CaseEntity }       from '../models/CaseEntity.model';
import { Evidence }         from '../models/Evidence.model';

// ─── Node / Edge Types ──────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  nodeType: 'participant' | 'entity' | 'evidence';
  meta: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relationship: 'corroborates' | 'evidence_of' | 'shared_identifier' | 'participant_entity';
  meta?: Record<string, unknown>;
}

export interface CaseGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── buildGraph ─────────────────────────────────────────────────────────────

export async function buildGraph(caseId: string): Promise<CaseGraph> {
  const oid = new mongoose.Types.ObjectId(caseId);

  const [participants, entities, evidenceDocs] = await Promise.all([
    CaseParticipant.find({ case_id: oid }).lean().exec(),
    CaseEntity.find({ case_id: oid }).lean().exec(),
    Evidence.find({ case_id: oid }).lean().exec(),
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // ── Participant nodes
  for (const p of participants) {
    nodes.push({
      id: p._id.toString(),
      label: p.name || 'Unknown Participant',
      nodeType: 'participant',
      meta: {
        roles: p.roles,
        identifiers: p.identifiers ?? [],
      },
    });
  }

  // ── Entity nodes
  for (const e of entities) {
    nodes.push({
      id: e._id.toString(),
      label: `${e.entity_type}: ${e.value}`,
      nodeType: 'entity',
      meta: {
        entity_type: e.entity_type,
        value: e.value,
        corroborating_evidence_ids: e.corroborating_evidence_ids ?? [],
      },
    });
  }

  // ── Evidence nodes
  for (const ev of evidenceDocs) {
    nodes.push({
      id: ev._id.toString(),
      label: `Evidence [${ev.type}]`,
      nodeType: 'evidence',
      meta: {
        type: ev.type,
        status: ev.status,
        evidence_id: ev.evidence_id,
      },
    });
  }

  // ── Build evidence id -> _id map for corroborates edges
  const evidenceIdToOid = new Map<string, string>();
  for (const ev of evidenceDocs) {
    evidenceIdToOid.set(ev.evidence_id, ev._id.toString());
    evidenceIdToOid.set(ev._id.toString(), ev._id.toString());
  }

  // ── Edge (a): CaseEntity -> Evidence via corroborating_evidence_ids
  for (const e of entities) {
    for (const evRef of e.corroborating_evidence_ids ?? []) {
      const targetId = evidenceIdToOid.get(evRef);
      if (targetId) {
        edges.push({ from: e._id.toString(), to: targetId, relationship: 'corroborates' });
      }
    }
  }

  // ── Edge (b): Evidence -> CaseParticipant via relatedParticipantIds
  for (const ev of evidenceDocs) {
    for (const pRef of ev.relatedParticipantIds ?? []) {
      edges.push({ from: ev._id.toString(), to: pRef.toString(), relationship: 'evidence_of' });
    }
  }

  // ── Edge (c): CaseParticipant <-> CaseParticipant — shared identifiers (O(n^2))
  for (let i = 0; i < participants.length; i++) {
    const a = participants[i];
    const aVals = new Set(
      (a.identifiers ?? []).map((id: any) => id.value?.trim().toLowerCase()).filter(Boolean)
    );
    if (aVals.size === 0) continue;

    for (let j = i + 1; j < participants.length; j++) {
      const b = participants[j];
      const sharedValues: string[] = [];
      for (const id of b.identifiers ?? []) {
        const v = id.value?.trim().toLowerCase();
        if (v && aVals.has(v)) sharedValues.push(id.value);
      }
      if (sharedValues.length > 0) {
        edges.push({
          from: a._id.toString(),
          to: b._id.toString(),
          relationship: 'shared_identifier',
          meta: { sharedValues },
        });
      }
    }
  }

  // ── Edge (d): CaseParticipant -> CaseEntity where entity.value matches an identifier
  for (const p of participants) {
    const pVals = new Set(
      (p.identifiers ?? []).map((id: any) => id.value?.trim().toLowerCase()).filter(Boolean)
    );
    if (pVals.size === 0) continue;
    for (const e of entities) {
      if (pVals.has(e.value?.trim().toLowerCase())) {
        edges.push({
          from: p._id.toString(),
          to: e._id.toString(),
          relationship: 'participant_entity',
          meta: { matchedValue: e.value },
        });
      }
    }
  }

  return { nodes, edges };
}

// ─── buildGraphContextSummary ────────────────────────────────────────────────

export async function buildGraphContextSummary(caseId: string): Promise<string> {
  const { nodes, edges } = await buildGraph(caseId);

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const lines: string[] = [];

  // High-signal 1: shared_identifier edges
  for (const edge of edges) {
    if (edge.relationship !== 'shared_identifier') continue;
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) continue;
    const sharedValues: string[] = (edge.meta?.sharedValues as string[]) ?? [];
    for (const val of sharedValues) {
      lines.push(`- "${a.label}" and "${b.label}" share identifier '${val}' [flagged: shared_identifier]`);
    }
  }

  // High-signal 2: corroborates where entity has >= 2 corroborating evidence docs
  for (const edge of edges) {
    if (edge.relationship !== 'corroborates') continue;
    const entityNode = nodeById.get(edge.from);
    if (!entityNode) continue;
    const corrIds = (entityNode.meta?.corroborating_evidence_ids as string[]) ?? [];
    if (corrIds.length < 2) continue;
    const evidenceNode = nodeById.get(edge.to);
    if (!evidenceNode) continue;
    const entityType = (entityNode.meta?.entity_type as string) ?? 'entity';
    const entityValue = (entityNode.meta?.value as string) ?? '';
    lines.push(
      `- Entity ${entityType} '${entityValue}' is corroborated by ${corrIds.length} pieces of evidence (including ${evidenceNode.label}) [flagged: multi-corroborated]`
    );
  }

  return [...new Set(lines)].join('\n');
}
