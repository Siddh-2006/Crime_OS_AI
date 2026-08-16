'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
// @ts-ignore
import coseBilkent from 'cytoscape-cose-bilkent';
import { Loader } from '@/components/ui/Loader';
import apiClient from '@/lib/axios';
import { Maximize, RotateCcw, Shrink, Users, FileImage, Tag, Network } from 'lucide-react';

cytoscape.use(coseBilkent);

interface CaseCorkboardProps {
  caseId: string;
  refreshTrigger?: number;
}

type GraphData = { nodes: any[]; edges: any[] };

export const CaseCorkboard: React.FC<CaseCorkboardProps> = ({ caseId, refreshTrigger = 0 }) => {
  const [fullGraph, setFullGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCount, setExpandedCount] = useState(0);
  const [stats, setStats] = useState({ participants: 0, evidence: 0, entities: 0, edges: 0 });

  const cyRef = useRef<cytoscape.Core | null>(null);
  const expandedNodes = useRef<Set<string>>(new Set());
  // Always-current graph ref — readable from stable callbacks without causing re-renders
  const graphRef = useRef<GraphData>({ nodes: [], edges: [] });
  // Track if we rendered at least once
  const renderedOnce = useRef(false);

  // Keep graphRef in sync
  useEffect(() => {
    graphRef.current = fullGraph;
  }, [fullGraph]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const computeVisible = useCallback((graph: GraphData, expanded: Set<string>) => {
    if (graph.nodes.length === 0) return [];

    // Root = first participant node, or first node
    const root = graph.nodes.find(n => n.data.type === 'participant') ?? graph.nodes[0];
    const rootId: string = root.data.id;

    const visibleNodeIds = new Set<string>([rootId]);
    expanded.forEach(id => visibleNodeIds.add(id));

    // Show neighbors of all expanded nodes
    graph.edges.forEach(edge => {
      const { source, target } = edge.data;
      if (expanded.has(source) || expanded.has(target)) {
        visibleNodeIds.add(source);
        visibleNodeIds.add(target);
      }
    });

    const visibleEdgeIds = new Set<string>();
    graph.edges.forEach(edge => {
      const { source, target, id } = edge.data;
      if (visibleNodeIds.has(source) && visibleNodeIds.has(target)) {
        visibleEdgeIds.add(id);
      }
    });

    return [
      ...graph.nodes.filter(n => visibleNodeIds.has(n.data.id)),
      ...graph.edges.filter(e => visibleEdgeIds.has(e.data.id)),
    ];
  }, []);

  const applyCy = useCallback((cy: cytoscape.Core, elements: any[]) => {
    const incoming = new Set(elements.map(el => el.data.id));
    const existing = new Set(cy.elements().map(el => el.id()));

    cy.elements().forEach(el => { if (!incoming.has(el.id())) cy.remove(el); });

    // Filter self-loops to prevent cose-bilkent RangeError
    const safe = elements.filter(el => !el.data.source || el.data.source !== el.data.target);
    const toAdd = safe.filter(el => !existing.has(el.data.id));
    if (toAdd.length > 0) cy.add(toAdd);

    cy.layout({
      name: 'cose-bilkent',
      animate: true,
      animationDuration: 600,
      randomize: true,
      idealEdgeLength: 140,
      nodeRepulsion: 6000,
      edgeElasticity: 0.45,
      nestingFactor: 0.1,
      gravity: 0.2,
      numIter: 2500,
      tile: false,
    } as any).run();
  }, []);

  const renderGraph = useCallback((graph: GraphData) => {
    const cy = cyRef.current;
    if (!cy || graph.nodes.length === 0) return;
    const visible = computeVisible(graph, expandedNodes.current);
    applyCy(cy, visible);
    renderedOnce.current = true;
    setTimeout(() => {
      const c = cyRef.current;
      if (!c) return;
      c.fit(undefined, 60);
      if (c.zoom() > 1.2) c.zoom(1.2);
    }, 600);
  }, [computeVisible, applyCy]);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchGraph = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true);
      const res = await apiClient.get(`/cases/${caseId}/graph`);
      const data = res.data?.data ?? {};

      const nodes: any[] = (data.nodes ?? []).map((n: any) => ({
        data: { ...n, id: String(n.id ?? n._id) },
      }));
      const edges: any[] = (data.edges ?? []).map((e: any) => ({
        data: { ...e, id: String(e.id ?? `e-${Math.random()}`), source: String(e.source), target: String(e.target) },
      }));

      const newGraph = { nodes, edges };
      graphRef.current = newGraph;
      setFullGraph(newGraph);
      setStats({
        participants: nodes.filter(n => n.data.type === 'participant').length,
        evidence: nodes.filter(n => n.data.type === 'evidence').length,
        entities: nodes.filter(n => n.data.type === 'entity').length,
        edges: edges.length,
      });

      // If cy already mounted, render immediately
      if (cyRef.current) {
        renderGraph(newGraph);
      }
    } catch (err: any) {
      if (isInitial) setError(err?.response?.data?.message ?? 'Failed to load case graph');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [caseId, renderGraph]);

  useEffect(() => { fetchGraph(true); }, [fetchGraph]);
  useEffect(() => { if (refreshTrigger > 0) fetchGraph(false); }, [refreshTrigger, fetchGraph]);

  // ─── Cytoscape Setup (stable — no fullGraph dependency) ─────────────────────

  const setupCy = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;  // Set FIRST so renderGraph can use it
    cy.maxZoom(2.0);
    cy.minZoom(0.1);

    // Always render if data already arrived before cy mounted
    if (graphRef.current.nodes.length > 0) {
      renderGraph(graphRef.current);
    }

    cy.on('tap', 'node', evt => {
      const id: string = evt.target.id();
      if (expandedNodes.current.has(id)) {
        expandedNodes.current.delete(id);
      } else {
        expandedNodes.current.add(id);
      }
      setExpandedCount(expandedNodes.current.size);
      const visible = computeVisible(graphRef.current, expandedNodes.current);
      applyCy(cy, visible);
    });

    cy.on('mouseover', 'node', evt => {
      const node = evt.target;
      cy.elements().addClass('dimmed');
      node.removeClass('dimmed').addClass('highlighted');
      node.connectedEdges().removeClass('dimmed').addClass('highlighted');
      node.connectedEdges().connectedNodes().removeClass('dimmed').addClass('highlighted');
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted');
    });
  }, [renderGraph, computeVisible, applyCy]); // no fullGraph dep

  // ─── Stylesheet — dark theme aligned with app ────────────────────────────────

  const stylesheet: cytoscape.StylesheetStyle[] = useMemo(() => [
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle',
        'background-color': '#ffffff',
        'border-width': 1.5,
        'border-color': '#cbd5e1',
        'color': '#1e293b',
        'font-family': 'Inter, sans-serif',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '100px',
        'font-size': 10,
        'shadow-blur': 12,
        'shadow-color': '#000',
        'shadow-opacity': 0.5,
        'shadow-offset-y': 4,
        'transition-property': 'opacity, border-color, border-width',
        'transition-duration': 200 as any,
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': '#94a3b8',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': 9,
        'font-family': 'Inter, sans-serif',
        'text-rotation': 'autorotate',
        'text-background-opacity': 1,
        'text-background-color': '#f8fafc',
        'text-background-padding': '3px',
        'color': '#64748b',
      }
    },
    // Participant nodes — blue accent
    {
      selector: 'node[type="participant"]',
      style: {
        'width': 110,
        'height': 48,
        'background-color': '#eff6ff',
        'border-color': '#1e3a8a',
        'border-width': 2.5,
        'label': 'data(label)',
        'font-size': 11,
        'font-weight': 'bold',
        'color': '#1e3a8a',
        'shadow-color': '#1e3a8a',
        'shadow-opacity': 0.12,
        'shadow-blur': 10,
      }
    },
    // Evidence nodes — orange accent
    {
      selector: 'node[type="evidence"]',
      style: {
        'width': 90,
        'height': 44,
        'background-color': '#fff7ed',
        'border-color': '#ea580c',
        'border-width': 2,
        'label': 'data(label)',
        'font-size': 10,
        'color': '#9a3412',
        'shadow-color': '#ea580c',
        'shadow-opacity': 0.12,
        'shadow-blur': 8,
      }
    },
    // Entity nodes — green accent
    {
      selector: 'node[type="entity"]',
      style: {
        'width': 80,
        'height': 28,
        'background-color': '#f0fdf4',
        'border-color': '#16a34a',
        'border-width': 1.5,
        'label': 'data(label)',
        'font-size': 9,
        'color': '#15803d',
        'shape': 'round-rectangle',
      }
    },
    // Edge variants
    {
      selector: 'edge[type="shared_identifier"]',
      style: {
        'width': 3,
        'line-color': '#ef4444',
        'line-style': 'solid',
        'color': '#fca5a5',
      }
    },
    {
      selector: 'edge[type="corroborates"]',
      style: {
        'line-style': 'dashed',
        'width': 2,
        'line-color': '#3b82f6',
        'color': '#93c5fd',
      }
    },
    {
      selector: 'edge[type="evidence_of"]',
      style: {
        'line-style': 'dotted',
        'width': 1.5,
        'line-color': '#f97316',
        'color': '#fdba74',
      }
    },
    {
      selector: 'edge[type="participant_entity"]',
      style: {
        'line-style': 'dashed',
        'width': 1.5,
        'line-color': '#22c55e',
        'color': '#86efac',
      }
    },
    // Interaction states
    { selector: '.dimmed',      style: { 'opacity': 0.15 } },
    { selector: '.highlighted', style: { 'opacity': 1, 'border-width': 3, 'border-color': '#f97316' } },
  ], []);

  const layout = useMemo(() => ({ name: 'cose-bilkent', animate: false }), []);

  // ─── Toolbar handlers ────────────────────────────────────────────────────────

  const handleFit = () => cyRef.current?.fit(undefined, 30);
  const handleReset = () => { cyRef.current?.elements().removeClass('dimmed highlighted'); cyRef.current?.fit(undefined, 30); };
  const handleCollapseAll = () => {
    expandedNodes.current.clear();
    setExpandedCount(0);
    if (cyRef.current) {
      const visible = computeVisible(graphRef.current, expandedNodes.current);
      applyCy(cyRef.current, visible);
      setTimeout(() => cyRef.current?.fit(undefined, 50), 600);
    }
  };

  // ─── Render states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-[75vh] flex items-center justify-center rounded-sm border border-border bg-surface">
        <div className="flex flex-col items-center gap-3">
          <Loader />
          <p className="text-sm text-text-secondary animate-pulse">Building knowledge graph...</p>
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
        <p className="text-xs text-text-muted">Run an AI analysis to generate participants and entities</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-blue-200 bg-blue-50">
          <Users size={13} className="text-blue-700" />
          <span className="text-xs font-bold text-blue-800">{stats.participants} Participants</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-orange-200 bg-orange-50">
          <FileImage size={13} className="text-orange-600" />
          <span className="text-xs font-bold text-orange-800">{stats.evidence} Evidence</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-green-200 bg-green-50">
          <Tag size={13} className="text-green-600" />
          <span className="text-xs font-bold text-green-800">{stats.entities} Entities</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border bg-surface-elevated">
          <Network size={13} className="text-text-secondary" />
          <span className="text-xs font-bold text-text-secondary">{stats.edges} Relationships</span>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="w-full h-[70vh] rounded-sm border border-slate-200 overflow-hidden relative"
           style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>

        {/* Toolbar */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button onClick={handleCollapseAll}
            className="px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-xs font-bold text-slate-600 hover:text-slate-900 shadow-sm transition-all flex items-center gap-1.5">
            <Shrink size={13} /> Collapse All
          </button>
          <button onClick={handleFit}
            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-slate-500 hover:text-slate-800 shadow-sm transition-all">
            <Maximize size={15} />
          </button>
          <button onClick={handleReset}
            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-sm text-slate-500 hover:text-slate-800 shadow-sm transition-all">
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Hint */}
        <div className="absolute top-4 left-4 z-10">
          <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-sm text-[11px] font-bold text-slate-500 tracking-wide uppercase border border-slate-200 shadow-sm">
            {expandedCount === 0 ? '← Click root node to expand' : `Exploring ${expandedCount} node${expandedCount > 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm p-3 rounded-sm border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Legend</p>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded border-2 border-blue-700 bg-blue-50" /><span className="text-[10px] text-slate-700">Participant</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded border-2 border-orange-600 bg-orange-50" /><span className="text-[10px] text-slate-700">Evidence</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded border-2 border-green-600 bg-green-50" /><span className="text-[10px] text-slate-700">Entity</span></div>
          <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-500" /><span className="text-[10px] text-slate-600">Shared ID</span></div>
          <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t-2 border-dashed border-blue-500" /><span className="text-[10px] text-slate-600">Corroborates</span></div>
        </div>

        <CytoscapeComponent
          elements={[]}
          style={{ width: '100%', height: '100%' }}
          stylesheet={stylesheet}
          layout={layout}
          wheelSensitivity={0.1}
          cy={setupCy}
        />
      </div>
    </div>
  );
};