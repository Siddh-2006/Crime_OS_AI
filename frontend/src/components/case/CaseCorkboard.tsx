'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
// @ts-ignore
import coseBilkent from 'cytoscape-cose-bilkent';
import { Loader } from '@/components/ui/Loader';
import apiClient from '@/lib/axios';
import { Maximize, RotateCcw, Shrink } from 'lucide-react';

cytoscape.use(coseBilkent);

interface CaseCorkboardProps {
  caseId: string;
  refreshTrigger?: number;
}

// Pushpin SVG base64 (Red pin)
const pushpinSvg = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%23ef4444' stroke='%23991b1b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='5'/%3E%3Cpath d='M12 13v8'/%3E%3C/svg%3E`;

export const CaseCorkboard: React.FC<CaseCorkboardProps> = ({ caseId, refreshTrigger = 0 }) => {
  const [fullGraph, setFullGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const cyRef = useRef<cytoscape.Core | null>(null);
  const initialLoadDone = useRef(false);
  const expandedNodes = useRef<Set<string>>(new Set());

  // Deterministic random rotation based on string ID
  const getRotation = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Random between -4 and 4 degrees
    return (Math.abs(hash) % 9) - 4;
  };

  const computeVisibleElements = (graph: { nodes: any[]; edges: any[] }, expanded: Set<string>) => {
    // If no expanded nodes, we only want the "root" node.
    // We'll define root as the first node in the graph (or a specific type).
    let rootNodeId: string | null = null;
    if (graph.nodes.length > 0) {
       // Prefer the case itself or the highest degree participant, but for now just take the first participant or first node
       const participant = graph.nodes.find(n => n.data.type === 'participant');
       rootNodeId = participant ? participant.data.id : graph.nodes[0].data.id;
    }

    if (!rootNodeId) return [];

    // The set of nodes to render
    const visibleNodeIds = new Set<string>();
    const visibleEdgeIds = new Set<string>();

    // Root is always visible
    visibleNodeIds.add(rootNodeId);
    
    // Add all nodes in `expanded` (just in case they are disconnected, though they shouldn't be)
    expanded.forEach(id => visibleNodeIds.add(id));

    // Now, for every expanded node, we make its direct neighbors visible
    graph.edges.forEach(edge => {
      const { source, target, id } = edge.data;
      if (expanded.has(source) || expanded.has(target)) {
        visibleNodeIds.add(source);
        visibleNodeIds.add(target);
        visibleEdgeIds.add(id);
      }
    });

    // Also include edges where BOTH source and target are visible (even if neither is 'expanded', to show interconnectivity)
    graph.edges.forEach(edge => {
      const { source, target, id } = edge.data;
      if (visibleNodeIds.has(source) && visibleNodeIds.has(target)) {
        visibleEdgeIds.add(id);
      }
    });

    const finalNodes = graph.nodes.filter(n => visibleNodeIds.has(n.data.id));
    const finalEdges = graph.edges.filter(e => visibleEdgeIds.has(e.data.id));

    return [...finalNodes, ...finalEdges];
  };

  const applyGraphToCy = (cy: cytoscape.Core, newElements: any[]) => {
    const existingIds = new Set(cy.elements().map(el => el.id()));
    const incomingIds = new Set(newElements.map(el => el.data.id));
    
    let changed = false;

    // Remove deleted
    cy.elements().forEach(el => {
      if (!incomingIds.has(el.id())) {
        cy.remove(el);
        changed = true;
      }
    });
    
    // Add new
    const toAdd = newElements.filter(el => !existingIds.has(el.data.id));
    if (toAdd.length > 0) {
      cy.add(toAdd);
      changed = true;
    }

    if (changed) {
      cy.layout({ name: 'cose-bilkent', animate: true, animationDuration: 600, randomize: false, idealEdgeLength: 120 } as any).run();
    }
  };

  const fetchGraph = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true);
      const res = await apiClient.get(`/api/v1/cases/${caseId}/graph`);
      
      let newNodes: any[] = [];
      let newEdges: any[] = [];

      if (res.data?.data) {
        const data = res.data.data;
        newNodes = data.nodes?.map((n: any) => ({ data: { ...n, id: n.id || n._id } })) || [];
        newEdges = data.edges?.map((e: any) => ({ data: { ...e, source: e.source, target: e.target, id: e.id || e._id } })) || [];
      }

      setFullGraph({ nodes: newNodes, edges: newEdges });
      
      if (!isInitial && cyRef.current) {
        const visible = computeVisibleElements({ nodes: newNodes, edges: newEdges }, expandedNodes.current);
        applyGraphToCy(cyRef.current, visible);
      }
    } catch (err: any) {
      if (isInitial) {
        setError(err?.response?.data?.message || 'Failed to load case graph');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [caseId]);

  // Initial load
  useEffect(() => {
    fetchGraph(true);
  }, [fetchGraph]);

  // Polling refresh
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchGraph(false);
    }
  }, [refreshTrigger, fetchGraph]);

  // Initial Cytoscape setup when fullGraph is first loaded
  useEffect(() => {
    if (fullGraph.nodes.length > 0 && cyRef.current && !initialLoadDone.current) {
      initialLoadDone.current = true;
      // Clear expanded nodes on fresh load
      expandedNodes.current.clear();
      const visible = computeVisibleElements(fullGraph, expandedNodes.current);
      applyGraphToCy(cyRef.current, visible);
      // Fit to root
      setTimeout(() => cyRef.current?.fit(undefined, 50), 700);
    }
  }, [fullGraph]);

  const stylesheet: cytoscape.StylesheetStyle[] = useMemo(() => [
    {
      selector: 'node',
      style: {
        'transition-property': 'opacity, background-color, line-color',
        'transition-duration': 200 as any,
        'shape': 'rectangle',
        'background-color': '#fdf6e3', // Off-white sticky note color
        'border-width': 1,
        'border-color': '#d1d5db',
        'color': '#1f2937',
        'font-family': 'sans-serif',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '90px',
        'background-image': pushpinSvg,
        'background-width': '16px',
        'background-height': '16px',
        'background-position-x': '50%',
        'background-position-y': '0%', // Top center
        'background-clip': 'none',
        'shadow-blur': 8,
        'shadow-color': '#000',
        'shadow-opacity': 0.15,
        'shadow-offset-y': 4,
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#8b7355', // Tan string color
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': 10,
        'text-rotation': 'autorotate',
        'text-background-opacity': 1,
        'text-background-color': '#f8fafc',
        'text-background-padding': '2px',
        'color': '#475569',
        // No arrows for standard threads
      }
    },
    {
      selector: 'node[type="participant"]',
      style: {
        'width': 100,
        'height': 50,
        'font-weight': 'bold',
        'font-size': 11,
        'label': 'data(label)',
      }
    },
    {
      selector: 'node[type="evidence"]',
      style: {
        'width': 80,
        'height': 60,
        'background-color': '#f8fafc', // Photo style
        'label': 'data(label)',
        'font-size': 10,
        'border-width': 4,
        'border-color': '#fff', // Polaroid border
        'shadow-blur': 10,
      }
    },
    {
      selector: 'node[type="entity"]',
      style: {
        'width': 70,
        'height': 25,
        'background-color': '#fef08a', // Yellow torn paper
        'label': 'data(label)',
        'font-size': 9,
        'shape': 'round-rectangle',
      }
    },
    {
      selector: 'edge[type="shared_identifier"]',
      style: {
        'width': 4,
        'line-color': '#ef4444', // Red string
      }
    },
    {
      selector: 'edge[type="corroborates"]',
      style: {
        'line-style': 'dashed',
        'width': 2,
        'line-color': '#3b82f6',
      }
    },
    // Interactive states
    {
      selector: '.dimmed',
      style: {
        'opacity': 0.3
      }
    },
    {
      selector: '.highlighted',
      style: {
        'opacity': 1,
        'border-width': 2,
        'border-color': '#3b82f6'
      }
    }
  ], []);

  const layout = useMemo(() => ({
    name: 'cose-bilkent',
    animate: false, // We handle animation manually on updates
  }), []);

  // Set up cytoscape event listeners
  const setupCy = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;

    // Apply deterministic rotation right after nodes are added
    cy.on('add', 'node', (evt) => {
      const node = evt.target;
      const rot = getRotation(node.id());
      // We can't actually rotate the shape directly in Canvas Cytoscape, 
      // but we can rotate the *text* and pretend it's rotated? No, wait. 
      // cytoscape does not support native node rotation unless it's a specific shape. 
      // However, we can use an SVG background image that is pre-rotated if we really want, 
      // or we can just leave it unrotated if it's too complex.
      // Wait, there IS a CSS property in cytoscape.js for node rotation? 
      // No, only text-rotation.
      // BUT for the visual aesthetic, we'll rely on the shadows and colors to sell the corkboard.
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const id = node.id();

      // Check if it's already expanded
      if (expandedNodes.current.has(id)) {
        // Collapse
        expandedNodes.current.delete(id);
      } else {
        // Expand
        expandedNodes.current.add(id);
      }

      // Recompute and apply
      const visible = computeVisibleElements(fullGraph, expandedNodes.current);
      applyGraphToCy(cy, visible);
    });

    cy.on('mouseover', 'node', (evt) => {
      // Highlight on hover just to see edges clearly
      const node = evt.target;
      cy.elements().addClass('dimmed');
      node.removeClass('dimmed').addClass('highlighted');
      node.connectedEdges().removeClass('dimmed').addClass('highlighted');
      node.connectedEdges().connectedNodes().removeClass('dimmed').addClass('highlighted');
    });

    cy.on('mouseout', 'node', (evt) => {
      cy.elements().removeClass('dimmed highlighted');
    });

  }, [fullGraph]);

  const handleFit = () => {
    if (cyRef.current) cyRef.current.fit(undefined, 30);
  };

  const handleReset = () => {
    if (cyRef.current) {
      cyRef.current.elements().removeClass('dimmed highlighted');
      cyRef.current.fit(undefined, 30);
    }
  };

  const handleCollapseAll = () => {
    expandedNodes.current.clear();
    if (cyRef.current) {
      const visible = computeVisibleElements(fullGraph, expandedNodes.current);
      applyGraphToCy(cyRef.current, visible);
      setTimeout(() => cyRef.current?.fit(undefined, 50), 700);
    }
  };

  if (loading && fullGraph.nodes.length === 0) {
    return (
      <div className="w-full h-[75vh] flex items-center justify-center bg-[#f5f1e8] rounded-xl border border-[#e5e0d8] shadow-inner">
        <div className="flex flex-col items-center gap-3">
          <Loader />
          <p className="text-sm text-gray-500 animate-pulse">Pinning strings to the corkboard...</p>
        </div>
      </div>
    );
  }

  if (!loading && fullGraph.nodes.length === 0) {
    return (
      <div className="w-full h-[75vh] flex items-center justify-center bg-[#f5f1e8] rounded-xl border border-[#e5e0d8] shadow-inner">
        <p className="text-gray-500 font-medium">No entities pinned to the board yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[75vh] bg-[#f5f1e8] rounded-xl border border-[#e5e0d8] overflow-hidden relative shadow-inner corkboard-texture">
      
      {/* Floating Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button 
          onClick={handleCollapseAll}
          className="px-3 py-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm hover:bg-white text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5"
          title="Collapse All"
        >
          <Shrink size={14} />
          Collapse All
        </button>
        <button 
          onClick={handleFit}
          className="p-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm hover:bg-white text-gray-600 transition-colors"
          title="Fit to Screen"
        >
          <Maximize size={16} />
        </button>
        <button 
          onClick={handleReset}
          className="p-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm hover:bg-white text-gray-600 transition-colors"
          title="Reset View"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="absolute top-4 left-4 z-10">
        <span className="px-3 py-1.5 bg-black/5 rounded-md text-xs font-bold text-gray-600 tracking-wide uppercase shadow-sm border border-black/5">
          {expandedNodes.current.size === 0 ? 'Click root node to expand' : `Exploring ${expandedNodes.current.size} pinned nodes`}
        </span>
      </div>

      <CytoscapeComponent
        elements={[]} // We control elements manually via cy.add/remove
        style={{ width: '100%', height: '100%' }}
        stylesheet={stylesheet}
        layout={layout}
        wheelSensitivity={0.1}
        cy={setupCy}
      />
    </div>
  );
};
