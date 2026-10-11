"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
// @ts-ignore
import coseBilkent from "cytoscape-cose-bilkent";
import { Loader } from "@/components/ui/Loader";
import { PdfViewer } from "@/components/ui/PdfViewer";
import apiClient from "@/lib/axios";
import {
  Maximize,
  RotateCcw,
  Shrink,
  Users,
  FileImage,
  Tag,
  Network,
  X,
  ExternalLink,
  FileText,
  FileAudio,
  FileVideo,
  Shield,
  MapPin,
  Phone,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

cytoscape.use(coseBilkent);

interface CaseCorkboardProps {
  caseId: string;
  refreshTrigger?: number;
}

type GraphData = { nodes: any[]; edges: any[] };

export const CaseCorkboard: React.FC<CaseCorkboardProps> = ({
  caseId,
  refreshTrigger = 0,
}) => {
  const [fullGraph, setFullGraph] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    participants: 0,
    evidence: 0,
    entities: 0,
    edges: 0,
  });
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const cyRef = useRef<cytoscape.Core | null>(null);
  // Always-current graph ref — readable from stable callbacks without causing re-renders
  const graphRef = useRef<GraphData>({ nodes: [], edges: [] });
  // Track if we rendered at least once
  const renderedOnce = useRef(false);

  // Keep graphRef in sync
  useEffect(() => {
    graphRef.current = fullGraph;
  }, [fullGraph]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Show only nodes that have at least one edge (remove isolated nodes)
  const computeVisible = useCallback((graph: GraphData) => {
    if (graph.nodes.length === 0) return [];
    // Filter self-loops first
    const safeEdges = graph.edges.filter(
      (e) => e.data.source !== e.data.target,
    );
    // Build set of node IDs that participate in at least one edge
    const connectedIds = new Set<string>();
    safeEdges.forEach((e) => {
      connectedIds.add(e.data.source);
      connectedIds.add(e.data.target);
    });
    // Participants are always shown even if isolated (core nodes)
    const visibleNodes = graph.nodes.filter(
      (n) => n.data.type === 'participant' || connectedIds.has(n.data.id),
    );
    return [...visibleNodes, ...safeEdges];
  }, []);

  const applyCy = useCallback((cy: cytoscape.Core, elements: any[]) => {
    const incoming = new Set(elements.map((el) => el.data.id));
    const existing = new Set(cy.elements().map((el) => el.id()));

    cy.elements().forEach((el) => {
      if (!incoming.has(el.id())) cy.remove(el);
    });

    const toAdd = elements.filter((el) => !existing.has(el.data.id));
    if (toAdd.length > 0) cy.add(toAdd);

    cy.layout({
      name: "cose-bilkent",
      animate: true,
      animationDuration: 700,
      randomize: true,
      idealEdgeLength: 100,
      nodeRepulsion: 3000,
      edgeElasticity: 0.5,
      nestingFactor: 0.1,
      gravity: 0.5,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 40,
      tilingPaddingHorizontal: 40,
    } as any).run();
  }, []);

  const renderGraph = useCallback(
    (graph: GraphData) => {
      const cy = cyRef.current;
      if (!cy || graph.nodes.length === 0) return;
      const visible = computeVisible(graph);
      applyCy(cy, visible);
      renderedOnce.current = true;
      setTimeout(() => {
        const c = cyRef.current;
        if (!c) return;
        c.fit(undefined, 80);
        if (c.zoom() > 1.5) c.zoom(1.5);
      }, 750);
    },
    [computeVisible, applyCy],
  );

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchGraph = useCallback(
    async (isInitial: boolean) => {
      try {
        if (isInitial) setLoading(true);
        const res = await apiClient.get(`/cases/${caseId}/graph`);
        const data = res.data?.data ?? {};

        const nodes: any[] = (data.nodes ?? []).map((n: any) => ({
          data: { ...n, id: String(n.id ?? n._id) },
        }));
        const edges: any[] = (data.edges ?? []).map((e: any) => ({
          data: {
            ...e,
            id: String(e.id ?? `e-${Math.random()}`),
            source: String(e.source),
            target: String(e.target),
          },
        }));

        const newGraph = { nodes, edges };
        graphRef.current = newGraph;
        setFullGraph(newGraph);
        setStats({
          participants: nodes.filter((n) => n.data.type === "participant")
            .length,
          evidence: nodes.filter((n) => n.data.type === "evidence").length,
          entities: nodes.filter((n) => n.data.type === "entity").length,
          edges: edges.length,
        });

        // If cy already mounted, render immediately
        if (cyRef.current) {
          renderGraph(newGraph);
        }
      } catch (err: any) {
        if (isInitial)
          setError(err?.response?.data?.message ?? "Failed to load case graph");
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [caseId, renderGraph],
  );

  useEffect(() => {
    fetchGraph(true);
  }, [fetchGraph]);
  useEffect(() => {
    if (refreshTrigger > 0) fetchGraph(false);
  }, [refreshTrigger, fetchGraph]);

  // ─── Cytoscape Setup (stable — no fullGraph dependency) ─────────────────────

  const setupCy = useCallback(
    (cy: cytoscape.Core) => {
      cyRef.current = cy; // Set FIRST so renderGraph can use it
      cy.maxZoom(2.0);
      cy.minZoom(0.1);

      // Always render if data already arrived before cy mounted
      if (graphRef.current.nodes.length > 0) {
        renderGraph(graphRef.current);
      }

      cy.on("tap", "node", (evt) => {
        const node = evt.target;
        const nodeData = node.data();
        // Collect connected evidence node IDs via edges
        const connectedEvidenceIds: string[] = [];
        node.connectedEdges().forEach((edge: any) => {
          const otherNode =
            edge.source().id() === node.id() ? edge.target() : edge.source();
          if (otherNode.data("type") === "evidence")
            connectedEvidenceIds.push(otherNode.id());
        });
        setSelectedNode({ ...nodeData, connectedEvidenceIds });
        // Highlight
        cy.elements().removeClass("highlighted dimmed");
        node.addClass("highlighted");
        node.neighborhood().addClass("highlighted");
        cy.elements().not(node.union(node.neighborhood())).addClass("dimmed");
      });

      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          cy.elements().removeClass("highlighted dimmed");
          setSelectedNode(null);
        }
      });

      cy.on("mouseover", "node", (evt) => {
        const node = evt.target;
        cy.elements().addClass("dimmed");
        node.removeClass("dimmed").addClass("highlighted");
        node.connectedEdges().removeClass("dimmed").addClass("highlighted");
        node
          .connectedEdges()
          .connectedNodes()
          .removeClass("dimmed")
          .addClass("highlighted");
      });

      cy.on("mouseout", "node", () => {
        cy.elements().removeClass("dimmed highlighted");
      });
    },
    [renderGraph, computeVisible, applyCy],
  ); // no fullGraph dep

  // ─── Stylesheet — dark theme aligned with app ────────────────────────────────

  const stylesheet: cytoscape.StylesheetStyle[] = useMemo(
    () => [
      {
        selector: "node",
        style: {
          shape: "round-rectangle",
          "background-color": "#ffffff",
          "border-width": 1.5,
          "border-color": "#cbd5e1",
          color: "#1e293b",
          "font-family": "Inter, sans-serif",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": "100px",
          "font-size": 10,
          "shadow-blur": 12,
          "shadow-color": "#000",
          "shadow-opacity": 0.5,
          "shadow-offset-y": 4,
          "transition-property": "opacity, border-color, border-width",
          "transition-duration": 200 as any,
        },
      },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": "#94a3b8",
          "curve-style": "bezier",
          label: "data(label)",
          "font-size": 9,
          "font-family": "Inter, sans-serif",
          "text-rotation": "autorotate",
          "text-background-opacity": 1,
          "text-background-color": "#f8fafc",
          "text-background-padding": "3px",
          color: "#64748b",
        },
      },
      // Participant nodes — blue accent
      {
        selector: 'node[type="participant"]',
        style: {
          width: 110,
          height: 48,
          "background-color": "#eff6ff",
          "border-color": "#1e3a8a",
          "border-width": 2.5,
          label: "data(label)",
          "font-size": 11,
          "font-weight": "bold",
          color: "#1e3a8a",
          "shadow-color": "#1e3a8a",
          "shadow-opacity": 0.12,
          "shadow-blur": 10,
        },
      },
      // Evidence nodes — orange accent
      {
        selector: 'node[type="evidence"]',
        style: {
          width: 90,
          height: 44,
          "background-color": "#fff7ed",
          "border-color": "#ea580c",
          "border-width": 2,
          label: "data(label)",
          "font-size": 10,
          color: "#9a3412",
          "shadow-color": "#ea580c",
          "shadow-opacity": 0.12,
          "shadow-blur": 8,
        },
      },
      // Entity nodes — green accent
      {
        selector: 'node[type="entity"]',
        style: {
          width: 80,
          height: 28,
          "background-color": "#f0fdf4",
          "border-color": "#16a34a",
          "border-width": 1.5,
          label: "data(label)",
          "font-size": 9,
          color: "#15803d",
          shape: "round-rectangle",
        },
      },
      // Edge variants
      {
        selector: 'edge[type="shared_identifier"]',
        style: {
          width: 3,
          "line-color": "#ef4444",
          "line-style": "solid",
          color: "#fca5a5",
        },
      },
      {
        selector: 'edge[type="corroborates"]',
        style: {
          "line-style": "dashed",
          width: 2,
          "line-color": "#3b82f6",
          color: "#93c5fd",
        },
      },
      {
        selector: 'edge[type="evidence_of"]',
        style: {
          "line-style": "dotted",
          width: 1.5,
          "line-color": "#f97316",
          color: "#fdba74",
        },
      },
      {
        selector: 'edge[type="participant_entity"]',
        style: {
          "line-style": "dashed",
          width: 1.5,
          "line-color": "#22c55e",
          color: "#86efac",
        },
      },
      // Interaction states
      { selector: ".dimmed", style: { opacity: 0.15 } },
      {
        selector: ".highlighted",
        style: { opacity: 1, "border-width": 3, "border-color": "#f97316" },
      },
    ],
    [],
  );

  const layout = useMemo(() => ({ name: "cose-bilkent", animate: false }), []);

  // ─── Node Detail Side Panel ───────────────────────────────────────────────────

  function NodeDetailPanel({
    node,
    graph,
    caseId,
    onClose,
  }: {
    node: any;
    graph: GraphData;
    caseId: string;
    onClose: () => void;
  }) {
    const [detail, setDetail] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [bnsData, setBnsData] = useState<any[]>([]);

    useEffect(() => {
      if (
        node?.type === "participant" ||
        (node?.type === "entity" && node?.meta?.entity_type === "LegalSection")
      ) {
        fetch("/data/BNS.json")
          .then((res) => res.json())
          .then((data) => setBnsData(data))
          .catch(() => {});
      }
    }, [node?.type, node?.meta?.entity_type]);

    // Fetch full data for the clicked node
    useEffect(() => {
      if (!node) return;
      setDetail(null);

      if (node.type === "evidence") {
        // Load full evidence record
        const evId = node.meta?.evidence_id || node.id;
        setDetailLoading(true);
        apiClient
          .get(`/cases/${caseId}/evidence`)
          .then((r) => {
            const all: any[] = r.data?.data || [];
            const found = all.find(
              (e: any) =>
                e.evidence_id === evId || e._id === node.id || e._id === evId,
            );
            setDetail(found || null);
          })
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else if (node.type === "participant") {
        // Load participant + latest snapshot for AI sections/reasoning
        setDetailLoading(true);
        Promise.all([
          apiClient.get(`/cases/${caseId}/participants`),
          apiClient
            .get(`/cases/${caseId}/analysis/latest`)
            .catch(() => ({ data: { data: null } })),
        ])
          .then(([pRes, snapRes]) => {
            const participants: any[] = pRes.data?.data || [];
            const found = participants.find(
              (p: any) => p._id === node.id || p.participant_id === node.id,
            );
            const snap = snapRes.data?.data;
            // Get AI reasoning from snapshot for this participant
            const rec = snap?.participant_recommendations?.find(
              (r: any) => r.name?.toLowerCase() === node.label?.toLowerCase(),
            );
            setDetail({ participant: found, aiRec: rec, snap });
          })
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      }
    }, [node?.id]);

    const evidenceNodes = graph.nodes.filter(
      (n) =>
        n.data.type === "evidence" &&
        node.connectedEvidenceIds?.includes(n.data.id),
    );

    const typeColor: Record<string, string> = {
      participant: "bg-blue-100 text-blue-800 border-blue-300",
      evidence: "bg-orange-100 text-orange-800 border-orange-300",
      entity: "bg-green-100 text-green-800 border-green-300",
    };

    // ── Inline file renderer (like EvidenceViewerModal but embedded) ──
    const renderInlineFile = (ev: any) => {
      const rawUrl =
        ev?.secureUrl ||
        ev?.file_url ||
        ev?.fileUrl ||
        ev?.url ||
        ev?.storage_ref ||
        "";
      let url = rawUrl;
      if (
        url &&
        !url.startsWith("http://") &&
        !url.startsWith("https://") &&
        !url.startsWith("data:")
      ) {
        url = `http://localhost:5001/${url.replace(/^\/+/, "")}`;
      }
      if (!url)
        return (
          <div className="flex flex-col items-center justify-center h-28 bg-slate-50 rounded border border-slate-200 gap-2">
            <FileText size={24} className="text-slate-400" />
            <span className="text-xs text-slate-400">No preview available</span>
          </div>
        );
      const lower = url.toLowerCase();
      const isPdf =
        ev?.type === "pdf" || ev?.type === "document" || lower.endsWith(".pdf");
      const isImage =
        ev?.type === "image" ||
        ev?.type === "screenshot" ||
        ev?.type === "chat_screenshot" ||
        /\.(jpg|jpeg|png|webp|gif)$/i.test(lower);
      const isAudio = ev?.type === "audio";
      const isVideo = ev?.type === "video" || ev?.type === "screen_recording";

      if (isPdf)
        return (
          <div className="w-full h-48 rounded overflow-hidden">
            <PdfViewer
              url={url}
              title={ev?.title || "PDF Document"}
              className="w-full h-full"
            />
          </div>
        );
      if (isImage)
        return (
          <div className="w-full flex justify-center bg-slate-50 rounded border border-slate-200 p-2 max-h-48 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Evidence"
              className="max-h-44 object-contain rounded"
            />
          </div>
        );
      if (isAudio)
        return (
          <div className="w-full bg-slate-50 rounded border border-slate-200 p-3">
            <audio controls className="w-full">
              <source src={url} />
            </audio>
          </div>
        );
      if (isVideo)
        return (
          <div className="w-full bg-slate-50 rounded border border-slate-200 overflow-hidden max-h-48">
            <video controls className="w-full max-h-44">
              <source src={url} />
            </video>
          </div>
        );
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 h-20 bg-slate-50 rounded border border-slate-200 text-brand-primary font-bold text-xs hover:bg-brand-primary/10 transition-colors"
        >
          <ExternalLink size={14} /> Open File
        </a>
      );
    };

    return (
      <div
        className="absolute top-0 right-0 h-full w-[340px] z-20 flex flex-col bg-white/97 backdrop-blur-md border-l border-slate-200 shadow-2xl overflow-hidden"
        style={{ animation: "slideInRight 0.2s ease-out" }}
      >
        {/* Header */}
        <div
          className={`px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-2 ${
            node.type === "participant"
              ? "bg-blue-50"
              : node.type === "evidence"
                ? "bg-orange-50"
                : "bg-green-50"
          }`}
        >
          <div className="flex-1 min-w-0">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border inline-block ${typeColor[node.type] ?? "bg-slate-100 text-slate-600 border-slate-300"}`}
            >
              {node.type}
              {node.meta?.entity_type ? ` · ${node.meta.entity_type}` : ""}
            </span>
            <p className="text-sm font-bold text-slate-900 mt-1.5 leading-tight">
              {node.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex-shrink-0 mt-0.5"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {detailLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
            </div>
          )}

          {/* ── EVIDENCE NODE ── */}
          {node.type === "evidence" && !detailLoading && (
            <>
              {/* Inline file preview */}
              {detail ? (
                renderInlineFile(detail)
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Loading preview...
                </div>
              )}

              {/* AI Summary */}
              {detail && (
                <div className="space-y-3">
                  {(detail.aiMetadata?.aiSummary ||
                    detail.aiMetadata?.caption ||
                    detail.ai_description) && (
                    <div className="p-3 rounded bg-brand-primary/5 border border-brand-primary/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-primary mb-1">
                        AI Analysis
                      </p>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {detail.aiMetadata?.aiSummary ||
                          detail.aiMetadata?.caption ||
                          detail.ai_description}
                      </p>
                    </div>
                  )}
                  {/* OCR */}
                  {(detail.aiMetadata?.ocrText || detail.ocr_text) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        OCR Text
                      </p>
                      <div className="text-[10px] bg-slate-50 border border-slate-200 rounded p-2 max-h-24 overflow-y-auto font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {detail.aiMetadata?.ocrText || detail.ocr_text}
                      </div>
                    </div>
                  )}
                  {/* Tags */}
                  {(detail.ai_tags || detail.aiMetadata?.imageTags || [])
                    .length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set([
                        ...(detail.aiMetadata?.imageTags || []),
                        ...(detail.ai_tags || []),
                      ]))
                        .slice(0, 8)
                        .map((t: string, i: number) => (
                          <span
                            key={`tag-${i}-${t}`}
                            className="text-[9px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-medium"
                          >
                            #{t}
                          </span>
                        ))}
                    </div>
                  )}
                  {/* Status row */}
                  <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
                    <span className="text-slate-400">Status</span>
                    <span
                      className={`font-bold uppercase ${detail.processingStatus === "PROCESSED" ? "text-green-600" : "text-amber-600"}`}
                    >
                      {detail.processingStatus || detail.status || "Pending"}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── PARTICIPANT NODE ── */}
          {node.type === "participant" && !detailLoading && (
            <>
              {/* Roles */}
              {node.meta?.roles?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Roles
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {node.meta.roles.map((r: string) => (
                      <span
                        key={r}
                        className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Identifiers */}
              {node.meta?.identifiers?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Identifiers
                  </p>
                  <div className="space-y-1">
                    {node.meta.identifiers.map((id: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 px-2 py-1 rounded"
                      >
                        <span className="text-slate-500 font-sans font-semibold">
                          {id.type}:
                        </span>
                        <span className="text-slate-800">{id.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* AI Suspicion / Recommendation */}
              {detail?.aiRec && (
                <div className="p-3 rounded bg-red-50 border border-red-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                      AI Assessment
                    </p>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                      {Math.round((detail.aiRec.confidence || 0) * 100)}%
                      confidence
                    </span>
                  </div>
                  <p className="text-xs text-red-900 leading-relaxed">
                    {detail.aiRec.reason ||
                      detail.aiRec.suggested_reasoning ||
                      "No reasoning provided."}
                  </p>
                </div>
              )}
              {/* Applied Legal Sections from participant profile */}
              {(detail?.participant?.suspectProfile?.appliedSections?.length >
                0 ||
                detail?.aiRec?.recommended_sections?.length > 0) && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Facing Charges Under
                  </p>
                  <div className="space-y-2">
                    {[
                      ...(detail?.participant?.suspectProfile
                        ?.appliedSections || []),
                      ...(detail?.aiRec?.recommended_sections || []),
                    ]
                      .filter(
                        (s: any, i: number, arr: any[]) =>
                          arr.findIndex((x: any) => x.code === s.code) === i,
                      )
                      .map((sec: any, i: number) => {
                        // Extract just the number (e.g. "302" from "BNS 302" or "302(1)")
                        const codeMatch = sec.code?.match(/(\d+)/);
                        const secNumber = codeMatch ? codeMatch[1] : sec.code;
                        const bnsSection = bnsData.find(
                          (b: any) =>
                            b.serial_number === secNumber ||
                            (b.content &&
                              b.content.startsWith(`${secNumber}.`)),
                        );

                        return (
                          <div
                            key={i}
                            className="p-2.5 rounded border border-purple-200 bg-purple-50 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Shield
                                  size={11}
                                  className="text-purple-600 flex-shrink-0"
                                />
                                <span className="text-[11px] font-black text-purple-900">
                                  § {sec.code}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-purple-700 font-semibold leading-relaxed">
                              {sec.title}
                            </p>

                            {bnsSection && (
                              <div className="mt-2 pt-2 border-t border-purple-200/50">
                                <p className="text-[9px] font-bold text-purple-500 uppercase tracking-wider mb-1">
                                  Act Details (Bharatiya Nyaya Sanhita)
                                </p>
                                <p className="text-[10px] text-slate-700 leading-relaxed max-h-32 overflow-y-auto pr-1">
                                  {bnsSection.summary ||
                                    bnsSection.content?.substring(0, 300) +
                                      "..."}
                                </p>
                              </div>
                            )}

                            {sec.reason && (
                              <div className="mt-2 pt-2 border-t border-purple-200/50">
                                <p className="text-[9px] font-bold text-purple-500 uppercase tracking-wider mb-1">
                                  AI Reasoning
                                </p>
                                <p className="text-[10px] text-purple-600 leading-relaxed italic">
                                  {sec.reason}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              {/* Connected evidence */}
              {evidenceNodes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Linked Evidence ({evidenceNodes.length})
                  </p>
                  <div className="space-y-1.5">
                    {evidenceNodes.map((ev: any) => {
                      const evId = ev.data.meta?.evidence_id || ev.data.id;
                      return (
                        <a
                          key={ev.data.id}
                          href={`/police/dashboard/complaints/${caseId}?tab=evidence&openEvidenceId=${evId}`}
                          className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-colors group"
                        >
                          <FileText
                            size={12}
                            className="text-slate-400 flex-shrink-0"
                          />
                          <span className="text-xs text-slate-700 font-medium truncate flex-1">
                            {ev.data.label}
                          </span>
                          <ExternalLink
                            size={10}
                            className="text-slate-300 group-hover:text-brand-primary flex-shrink-0"
                          />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── ENTITY NODE ── */}
          {node.type === "entity" && !detailLoading && (
            <>
              {node.meta?.value && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Ground Truth Value
                  </p>
                  <div className="flex items-start gap-2 p-3 rounded bg-green-50 border border-green-200">
                    <Shield
                      size={13}
                      className="text-green-600 flex-shrink-0 mt-0.5"
                    />
                    <span className="text-sm font-mono font-bold text-green-900 break-all">
                      {node.meta.value}
                    </span>
                  </div>
                  {node.meta.source === "complaintIntelligence" && (
                    <p className="text-[10px] text-green-600 mt-1 font-semibold">
                      ✓ AI-extracted from case documents
                    </p>
                  )}
                </div>
              )}
              {node.meta?.entity_type === "LegalSection" && (
                <div className="mt-2">
                  {(() => {
                    const codeMatch = node.meta.value?.match(/(\d+)/);
                    const secNumber = codeMatch
                      ? codeMatch[1]
                      : node.meta.value;
                    const bnsSection = bnsData.find(
                      (b: any) =>
                        b.serial_number === secNumber ||
                        (b.content && b.content.startsWith(`${secNumber}.`)),
                    );

                    if (bnsData.length === 0) {
                      return (
                        <div className="text-xs text-slate-400 italic mt-2">
                          Loading act details...
                        </div>
                      );
                    }

                    if (bnsSection) {
                      return (
                        <div className="p-3 rounded border border-purple-200 bg-purple-50 space-y-2 mt-2">
                          <p className="text-[9px] font-bold text-purple-500 uppercase tracking-wider mb-1">
                            Act Details (Bharatiya Nyaya Sanhita)
                          </p>
                          <p className="text-[10px] text-slate-700 leading-relaxed max-h-48 overflow-y-auto pr-1">
                            {bnsSection.summary ||
                              bnsSection.content?.substring(0, 300) + "..."}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="text-xs text-slate-400 italic mt-2">
                        Act details not found in database.
                      </div>
                    );
                  })()}
                </div>
              )}
              {evidenceNodes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Found In Evidence
                  </p>
                  <div className="space-y-1.5">
                    {evidenceNodes.map((ev: any) => {
                      const evId = ev.data.meta?.evidence_id || ev.data.id;
                      return (
                        <a
                          key={ev.data.id}
                          href={`/police/dashboard/complaints/${caseId}?tab=evidence&openEvidenceId=${evId}`}
                          className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-colors group"
                        >
                          <FileText
                            size={12}
                            className="text-slate-400 flex-shrink-0"
                          />
                          <span className="text-xs text-slate-700 font-medium truncate flex-1">
                            {ev.data.label}
                          </span>
                          <ExternalLink
                            size={10}
                            className="text-slate-300 group-hover:text-brand-primary flex-shrink-0"
                          />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — deep link to open specific evidence modal */}
        {!(
          node.type === "entity" && node.meta?.entity_type === "LegalSection"
        ) && (
          <div className="border-t border-slate-200 p-3 space-y-2">
            {node.type === "evidence" && detail && (
              <a
                href={`/police/dashboard/complaints/${caseId}?tab=evidence&openEvidenceId=${detail.evidence_id || node.meta?.evidence_id || node.id}`}
                className="flex items-center justify-center gap-2 w-full py-2 rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 font-bold text-xs transition-colors border border-orange-200"
              >
                <ExternalLink size={12} /> Open Full Evidence Viewer
              </a>
            )}
            <a
              href={`/police/dashboard/complaints/${caseId}?tab=evidence`}
              className="flex items-center justify-center gap-2 w-full py-2 rounded bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold text-xs transition-colors border border-brand-primary/20"
            >
              <ExternalLink size={12} /> Go to Evidence Page
            </a>
          </div>
        )}

        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // ─── Toolbar handlers ─────────────────────────────────────────────────────────

  const handleFit = () => cyRef.current?.fit(undefined, 30);
  const handleReset = () => {
    cyRef.current?.elements().removeClass("dimmed highlighted");
    cyRef.current?.fit(undefined, 30);
    setSelectedNode(null);
  };
  const handleZoomIn = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = Math.min(cy.zoom() * 1.4, cy.maxZoom());
    cy.animate({ zoom: next, center: { eles: cy.elements() } } as any, { duration: 150 });
  };
  const handleZoomOut = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = Math.max(cy.zoom() / 1.4, cy.minZoom());
    cy.animate({ zoom: next, center: { eles: cy.elements() } } as any, { duration: 150 });
  };

  // ─── Render states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-[75vh] flex items-center justify-center rounded-sm border border-border bg-surface">
        <div className="flex flex-col items-center gap-3">
          <Loader />
          <p className="text-sm text-text-secondary animate-pulse">
            Building knowledge graph...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[75vh] flex items-center justify-center rounded-sm border border-border bg-surface">
        <p className="text-semantic-critical font-medium">{error}</p>
      </div>
    );
  }

  if (fullGraph.nodes.length === 0) {
    return (
      <div className="w-full h-[75vh] flex flex-col items-center justify-center gap-3 rounded-sm border border-border bg-surface">
        <Network size={40} className="text-text-muted" />
        <p className="text-text-secondary font-medium">No graph data yet</p>
        <p className="text-xs text-text-muted">
          Run an AI analysis to generate participants and entities
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Stats bar — shows connected node counts only */}
      {(() => {
        const visible = computeVisible(fullGraph);
        const visibleNodeIds = new Set(visible.filter((el: any) => el.data.source === undefined).map((el: any) => el.data.id));
        const visParticipants = fullGraph.nodes.filter(n => n.data.type === 'participant' && visibleNodeIds.has(n.data.id)).length;
        const visEvidence = fullGraph.nodes.filter(n => n.data.type === 'evidence' && visibleNodeIds.has(n.data.id)).length;
        const visEntities = fullGraph.nodes.filter(n => n.data.type === 'entity' && visibleNodeIds.has(n.data.id)).length;
        const visEdges = visible.filter((el: any) => el.data.source !== undefined).length;
        const hiddenEntities = stats.entities - visEntities;
        return (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-blue-200 bg-blue-50">
              <Users size={13} className="text-blue-700" />
              <span className="text-xs font-bold text-blue-800">{visParticipants} Participants</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-orange-200 bg-orange-50">
              <FileImage size={13} className="text-orange-600" />
              <span className="text-xs font-bold text-orange-800">{visEvidence} Evidence</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-green-200 bg-green-50">
              <Tag size={13} className="text-green-600" />
              <span className="text-xs font-bold text-green-800">{visEntities} Entities</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border bg-surface-elevated">
              <Network size={13} className="text-text-secondary" />
              <span className="text-xs font-bold text-text-secondary">{visEdges} Relationships</span>
            </div>
            {hiddenEntities > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-slate-200 bg-slate-50">
                <span className="text-xs text-slate-400">{hiddenEntities} isolated entities hidden</span>
              </div>
            )}
          </div>
        );
      })()}
      {/* Graph canvas */}
      <div
        className="w-full h-[70vh] rounded-sm border border-slate-200 overflow-hidden relative"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        }}
      >
        {/* Toolbar */}
        <div
          className="absolute top-4 right-4 z-10 flex gap-2"
          style={{ right: selectedNode ? "336px" : "16px" }}
        >
          <button
            onClick={() => {
              renderGraph(graphRef.current);
            }}
            className="px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-xs font-bold text-slate-600 hover:text-slate-900 shadow-sm transition-all flex items-center gap-1.5"
          >
            <Shrink size={13} /> Show All
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-slate-500 hover:text-slate-800 shadow-sm transition-all"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-slate-500 hover:text-slate-800 shadow-sm transition-all"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={handleFit}
            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-slate-500 hover:text-slate-800 shadow-sm transition-all"
            title="Fit to screen"
          >
            <Maximize size={15} />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-slate-500 hover:text-slate-800 shadow-sm transition-all"
            title="Reset"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Hint */}
        <div className="absolute top-4 left-4 z-10">
          <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-sm text-[11px] font-bold text-slate-500 tracking-wide uppercase border border-slate-200 shadow-sm">
            {selectedNode
              ? `Selected: ${selectedNode.label}`
              : "Click a node · Background to deselect"}
          </span>
        </div>

        {/* Legend */}
        {!selectedNode && (
          <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm p-3 rounded-sm border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              Legend
            </p>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 border-blue-700 bg-blue-50" />
              <span className="text-[10px] text-slate-700">Participant</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 border-orange-600 bg-orange-50" />
              <span className="text-[10px] text-slate-700">Evidence</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 border-green-600 bg-green-50" />
              <span className="text-[10px] text-slate-700">Entity</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-red-500" />
              <span className="text-[10px] text-slate-600">Shared ID</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-blue-500" />
              <span className="text-[10px] text-slate-600">Corroborates</span>
            </div>
          </div>
        )}

        <CytoscapeComponent
          elements={[]}
          style={{ width: "100%", height: "100%" }}
          stylesheet={stylesheet}
          layout={layout}
          wheelSensitivity={0.3}
          cy={setupCy}
        />

        {/* Side detail panel */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            graph={fullGraph}
            caseId={caseId}
            onClose={() => {
              setSelectedNode(null);
              cyRef.current?.elements().removeClass("highlighted dimmed");
            }}
          />
        )}
      </div>
    </div>
  );
};
