import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import * as d3 from "d3";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Search, 
  BrainCircuit, 
  Maximize2,
  Minimize2,
  Share2,
  Layers,
  Sparkles,
  Link as LinkIcon,
  Tag,
  Info,
  SlidersHorizontal,
  X
} from "lucide-react";
import { ResourceItem, GraphNode, GraphLink, ResourceType, OKFEntity } from "../types";

interface KnowledgeGraphProps {
  resources: ResourceItem[];
  onSelectResource: (resource: ResourceItem) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

type RelationFilterMode = "all" | "explicit" | "entities" | "tags";

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  resources,
  onSelectResource,
  selectedTag,
  onSelectTag,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeFilterType, setActiveFilterType] = useState<ResourceType | "all">("all");
  const [relationFilterMode, setRelationFilterMode] = useState<RelationFilterMode>("all");
  const [showConceptHubs, setShowConceptHubs] = useState<boolean>(false);
  const [showEdgeLabels, setShowEdgeLabels] = useState<boolean>(true);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Handle ResizeObserver for accurate dynamic viewport sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || (isFullscreen ? window.innerHeight : 650);
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
      }
    };

    measure();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        measure();
      });
      resizeObserver.observe(el);
    }

    window.addEventListener("resize", measure);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isFullscreen]);

  // Handle ESC key and prevent body scrolling when in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  // Helper to safely extract entity name strings from metadata
  const getResourceEntities = (r: ResourceItem): string[] => {
    const rawEntities = r.metadata?.entities || [];
    const entityStrings: string[] = [];
    rawEntities.forEach((item) => {
      if (typeof item === "string") {
        if (item.trim()) entityStrings.push(item.trim());
      } else if (item && typeof item === "object" && item.name) {
        if (item.name.trim()) entityStrings.push(item.name.trim());
      }
    });
    if (r.metadata?.keyConcepts && Array.isArray(r.metadata.keyConcepts)) {
      r.metadata.keyConcepts.forEach((kc) => {
        if (typeof kc === "string" && kc.trim()) entityStrings.push(kc.trim());
      });
    }
    return Array.from(new Set(entityStrings));
  };

  // 1. Build Graph Structure (Nodes & Multi-Tier High-Precision Links)
  const graphData = useMemo(() => {
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // Filter resources if type or tag selected
    let filtered = activeFilterType === "all" 
      ? resources 
      : resources.filter((r) => r.type === activeFilterType);

    if (selectedTag) {
      filtered = filtered.filter((r) => (r.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase()));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          (r.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          getResourceEntities(r).some((e) => e.toLowerCase().includes(q))
      );
    }

    // Create a node for each resource document
    filtered.forEach((r) => {
      nodesMap.set(r.id, {
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
        domain: r.metadata?.domain || r.type,
        summary: r.summary,
        degree: 0,
        isEntityNode: false,
      });
    });

    // Helper to find target node by ID, exact title, partial title, or entity match
    const findNodeByTitleOrId = (identifier: string): GraphNode | undefined => {
      if (!identifier) return undefined;
      if (nodesMap.has(identifier)) return nodesMap.get(identifier);
      const lower = identifier.toLowerCase().trim();
      
      // Exact title match
      for (const node of nodesMap.values()) {
        if (!node.isEntityNode && node.title.toLowerCase().trim() === lower) return node;
      }
      
      // Partial title match (e.g. "Claude" in "Claude Code" or "MCP" in "Model Context Protocol (MCP)")
      for (const node of nodesMap.values()) {
        if (!node.isEntityNode) {
          const nodeTitleLower = node.title.toLowerCase();
          if (
            (lower.length >= 4 && nodeTitleLower.includes(lower)) || 
            (nodeTitleLower.length >= 4 && lower.includes(nodeTitleLower))
          ) {
            return node;
          }
        }
      }
      return undefined;
    };

    // Keep track of added pairs to prevent duplicate parallel links
    const linkSet = new Set<string>();
    const addLink = (
      sourceId: string, 
      targetId: string, 
      relationType: string, 
      label: string, 
      weight: number, 
      color: string, 
      description?: string
    ) => {
      if (sourceId === targetId) return;
      const key1 = `${sourceId}:::${targetId}`;
      const key2 = `${targetId}:::${sourceId}`;
      if (linkSet.has(key1) || linkSet.has(key2)) return;
      linkSet.add(key1);

      const srcNode = nodesMap.get(sourceId);
      const tgtNode = nodesMap.get(targetId);
      if (!srcNode || !tgtNode) return;

      links.push({
        source: sourceId,
        target: targetId,
        relationType,
        label,
        weight,
        color,
        description,
        sourceTitle: srcNode.title,
        targetTitle: tgtNode.title,
      });

      srcNode.degree = (srcNode.degree || 0) + 1;
      tgtNode.degree = (tgtNode.degree || 0) + 1;
    };

    // A. Explicit OKF Relations (declared in metadata.relations)
    if (relationFilterMode === "all" || relationFilterMode === "explicit") {
      filtered.forEach((r) => {
        if (r.metadata?.relations && Array.isArray(r.metadata.relations)) {
          r.metadata.relations.forEach((rel) => {
            const targetIdentifier = rel.targetId || rel.targetTitle || (rel as any).target || (rel as any).targetName;
            if (!targetIdentifier) return;
            const target = findNodeByTitleOrId(targetIdentifier);
            if (target && target.id !== r.id) {
              const relType = rel.relationType || (rel as any).type || "references";
              addLink(
                r.id,
                target.id,
                relType,
                relType.replace(/_/g, " "),
                1.0,
                "#C5A059", // Champagne Gold
                rel.description || `Relazione ontologica OKF v0.2: ${relType}`
              );
            }
          });
        }
      });
    }

    // B. Entity & Concept Overlap (Matching entities between documents)
    if (relationFilterMode === "all" || relationFilterMode === "entities") {
      for (let i = 0; i < filtered.length; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          const docA = filtered[i];
          const docB = filtered[j];
          const entitiesA = getResourceEntities(docA).map((e) => e.toLowerCase().trim());
          const entitiesB = getResourceEntities(docB).map((e) => e.toLowerCase().trim());

          const commonEntities = entitiesA.filter((e) => entitiesB.includes(e) && e.length > 2);

          if (commonEntities.length > 0) {
            const topEntity = commonEntities[0];
            const entityLabel = topEntity.charAt(0).toUpperCase() + topEntity.slice(1);
            addLink(
              docA.id,
              docB.id,
              "shared_entity",
              `Entità: ${entityLabel}`,
              0.85 + Math.min(commonEntities.length * 0.05, 0.15),
              "#38BDF8", // Cyan
              `Condividono ${commonEntities.length} entità ontologiche: ${commonEntities.slice(0, 3).join(", ")}`
            );
          }
        }
      }
    }

    // C. Cross-Mentions & Title Mentions in Content/Summary
    if (relationFilterMode === "all" || relationFilterMode === "explicit") {
      for (let i = 0; i < filtered.length; i++) {
        for (let j = 0; j < filtered.length; j++) {
          if (i === j) continue;
          const docA = filtered[i];
          const docB = filtered[j];
          const titleBLower = docB.title.toLowerCase().trim();
          
          if (titleBLower.length >= 5) {
            const textA = (docA.summary + " " + (docA.metadata?.markdownContent || "")).toLowerCase();
            if (textA.includes(titleBLower)) {
              addLink(
                docA.id,
                docB.id,
                "mentions",
                "Cita documento",
                0.8,
                "#A855F7", // Purple
                `"${docA.title}" menziona esplicitamente "${docB.title}"`
              );
            }
          }
        }
      }
    }

    // D. Shared Tags (Normalized case-insensitive matching)
    if (relationFilterMode === "all" || relationFilterMode === "tags") {
      for (let i = 0; i < filtered.length; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          const docA = filtered[i];
          const docB = filtered[j];
          const tagsA = (docA.tags || []).map((t) => t.toLowerCase().trim());
          const tagsB = (docB.tags || []).map((t) => t.toLowerCase().trim());

          const sharedTags = tagsA.filter((t) => tagsB.includes(t) && t.length > 1);

          if (sharedTags.length >= 1) {
            addLink(
              docA.id,
              docB.id,
              "shared_tag",
              `#${sharedTags[0]}`,
              0.6 + Math.min(sharedTags.length * 0.1, 0.35),
              "#F59E0B", // Amber
              `Condividono i tag: ${sharedTags.map((t) => "#" + t).join(", ")}`
            );
          }
        }
      }
    }

    // E. Shared Domain (if both have specified domain and not already connected)
    if (relationFilterMode === "all") {
      for (let i = 0; i < filtered.length; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          const docA = filtered[i];
          const docB = filtered[j];
          const domA = docA.metadata?.domain?.toLowerCase().trim();
          const domB = docB.metadata?.domain?.toLowerCase().trim();

          if (domA && domB && domA === domB && domA !== "general") {
            addLink(
              docA.id,
              docB.id,
              "same_domain",
              `Dominio: ${docA.metadata?.domain}`,
              0.55,
              "#10B981", // Emerald
              `Stesso dominio tematico: ${docA.metadata?.domain}`
            );
          }
        }
      }
    }

    // F. Optional: Concept / Entity Hub Nodes Mode
    if (showConceptHubs) {
      const entityMap = new Map<string, { name: string; count: number; docIds: string[] }>();

      filtered.forEach((r) => {
        const ents = getResourceEntities(r);
        ents.forEach((ent) => {
          const key = ent.toLowerCase().trim();
          if (key.length < 3) return;
          if (!entityMap.has(key)) {
            entityMap.set(key, { name: ent, count: 0, docIds: [] });
          }
          const item = entityMap.get(key)!;
          item.count += 1;
          if (!item.docIds.includes(r.id)) {
            item.docIds.push(r.id);
          }
        });
      });

      // Insert entity hub nodes that have at least 1 or 2 connections
      entityMap.forEach((val, key) => {
        if (val.docIds.length >= 1) {
          const hubId = `hub_concept_${key}`;
          if (!nodesMap.has(hubId)) {
            nodesMap.set(hubId, {
              id: hubId,
              title: val.name,
              type: "concept",
              tags: ["concept", "entity-hub"],
              domain: "Ontology Concept",
              degree: 0,
              isEntityNode: true,
              entityType: "OKF Entity Hub",
              summary: `Entità ontologica condivisa estratta dai documenti del Vault`,
            });
          }

          val.docIds.forEach((docId) => {
            addLink(
              docId,
              hubId,
              "concept_bridge",
              "has_concept",
              0.7,
              "#38BDF8",
              `Collegato al concetto: ${val.name}`
            );
          });
        }
      });
    }

    return {
      nodes: Array.from(nodesMap.values()),
      links,
    };
  }, [resources, activeFilterType, selectedTag, searchQuery, relationFilterMode, showConceptHubs]);

  // Color mapping per node type
  const getNodeColor = (type: ResourceType | "concept" | "entity") => {
    switch (type) {
      case "troubleshooting":
        return "#F97316"; // Bright Orange for Troubleshooting / Diagnostica
      case "knowledge":
        return "#C5A059"; // Champagne gold for OKF Knowledge
      case "mcp_server":
        return "#38BDF8"; // Cyan for MCP
      case "github_repo":
        return "#A855F7"; // Purple for GitHub
      case "ai_skill":
        return "#10B981"; // Emerald for AI Skills
      case "concept":
      case "entity":
        return "#60A5FA"; // Bright Blue for Concept Hubs
      case "article":
      default:
        return "#F59E0B"; // Amber for Articles
    }
  };

  // D3 Force Simulation Setup with High-Visibility Rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = dimensions.width || containerRef.current.clientWidth || (isFullscreen ? window.innerWidth : 800);
    const rawHeight = containerRef.current.clientHeight || (isFullscreen ? window.innerHeight : 650);
    const height = Math.max(300, rawHeight - 64); // accounts for top controls toolbar

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Defs for Glow Filters and Colored Arrow Markers
    const defs = svg.append("defs");

    // Glow Filter
    const filter = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Arrow Marker Definitions for each relation color
    const arrowColors = [
      { id: "arrow-gold", color: "#C5A059" },
      { id: "arrow-cyan", color: "#38BDF8" },
      { id: "arrow-purple", color: "#A855F7" },
      { id: "arrow-amber", color: "#F59E0B" },
      { id: "arrow-green", color: "#10B981" },
      { id: "arrow-blue", color: "#60A5FA" },
      { id: "arrow-default", color: "#888888" },
    ];

    arrowColors.forEach((ac) => {
      defs
        .append("marker")
        .attr("id", ac.id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 26) // Distance from node center
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", ac.color);
    });

    const g = svg.append("g");

    // Setup Zoom Behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Deep clone data for D3 simulation
    const nodes: any[] = graphData.nodes.map((d) => ({ ...d }));
    const links: any[] = graphData.links.map((d) => ({ ...d }));

    // Optimized D3 Force Physics
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance((d: any) => {
            if (nodes.length <= 4) return 160;
            return 120 / (d.weight || 0.8);
          })
      )
      .force("charge", d3.forceManyBody().strength(nodes.length <= 4 ? -450 : -320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d: any) => (d.isEntityNode ? 24 : 36 + (d.degree || 0) * 2))
      );

    // Layer 1: Links (Lines + Glow Lines)
    const linkGroup = g.append("g").attr("class", "links-layer");

    // Glowing background line for high contrast and vibrance
    const linkGlow = linkGroup
      .selectAll("line.glow")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "glow")
      .attr("stroke", (d) => d.color || "#C5A059")
      .attr("stroke-width", (d) => Math.max(3, (d.weight || 0.6) * 5))
      .attr("stroke-opacity", 0.25)
      .attr("stroke-linecap", "round");

    // Main visible line
    const link = linkGroup
      .selectAll("line.main")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "main cursor-pointer")
      .attr("stroke", (d) => d.color || "#C5A059")
      .attr("stroke-width", (d) => Math.max(2, (d.weight || 0.7) * 2.8))
      .attr("stroke-dasharray", (d) => {
        if (d.relationType === "shared_tag") return "5,4";
        if (d.relationType === "same_domain") return "3,3";
        return "none";
      })
      .attr("stroke-opacity", 0.85)
      .attr("marker-end", (d) => {
        if (d.color === "#C5A059") return "url(#arrow-gold)";
        if (d.color === "#38BDF8") return "url(#arrow-cyan)";
        if (d.color === "#A855F7") return "url(#arrow-purple)";
        if (d.color === "#10B981") return "url(#arrow-green)";
        if (d.color === "#F59E0B") return "url(#arrow-amber)";
        return "url(#arrow-gold)";
      })
      .on("mouseover", (_event, d) => {
        setHoveredLink(d);
      })
      .on("mouseout", () => {
        setHoveredLink(null);
      });

    // Layer 2: Edge Labels (Badges along lines)
    const edgeLabelGroup = g.append("g").attr("class", "edge-labels-layer");
    const edgeLabel = edgeLabelGroup
      .selectAll("g")
      .data(links)
      .enter()
      .append("g")
      .attr("class", "edge-label pointer-events-none")
      .style("opacity", showEdgeLabels ? 1 : 0);

    edgeLabel
      .append("rect")
      .attr("rx", 5)
      .attr("ry", 5)
      .attr("fill", "#0C0C0C")
      .attr("stroke", (d) => d.color || "#333")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.6)
      .attr("fill-opacity", 0.92);

    edgeLabel
      .append("text")
      .text((d) => d.label || d.relationType || "collegato")
      .attr("text-anchor", "middle")
      .attr("dy", "0.32em")
      .attr("fill", (d) => d.color || "#DDD")
      .attr("font-size", "9px")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-weight", "500");

    // Adjust rect size to text
    edgeLabel.each(function () {
      const bbox = d3.select(this).select("text").node() as SVGTextElement;
      if (bbox) {
        const textWidth = bbox.getComputedTextLength();
        d3.select(this)
          .select("rect")
          .attr("width", textWidth + 12)
          .attr("height", 16)
          .attr("x", -(textWidth + 12) / 2)
          .attr("y", -8);
      }
    });

    // Layer 3: Nodes
    const nodeGroup = g.append("g").attr("class", "nodes-layer");
    const node = nodeGroup
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node cursor-pointer")
      .call(
        d3
          .drag<SVGGElement, any>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Outer Glowing Halo Ring
    node
      .append("circle")
      .attr("r", (d) => (d.isEntityNode ? 14 : 20 + Math.min(16, (d.degree || 0) * 2.5)))
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("fill-opacity", 0.16)
      .attr("stroke", (d) => getNodeColor(d.type))
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.45);

    // Core Solid Circle / Shape
    node
      .append("circle")
      .attr("r", (d) => (d.isEntityNode ? 8 : 12 + Math.min(8, (d.degree || 0) * 1.5)))
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("stroke", "#080808")
      .attr("stroke-width", 2.5);

    // Inner Icon or Dot
    node
      .append("circle")
      .attr("r", (d) => (d.isEntityNode ? 3 : 4))
      .attr("fill", "#050505");

    // Node Text Label with background badge for high legibility
    const labelGroup = node.append("g").attr("transform", (d) => `translate(0, ${d.isEntityNode ? 20 : 28})`);

    labelGroup
      .append("rect")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "#080808")
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#222")
      .attr("stroke-width", 0.8);

    labelGroup
      .append("text")
      .text((d) => d.title)
      .attr("text-anchor", "middle")
      .attr("dy", "0.32em")
      .attr("fill", "#EAEAEA")
      .attr("font-size", (d) => (d.isEntityNode ? "9px" : "11px"))
      .attr("font-weight", (d) => (d.isEntityNode ? "normal" : "500"))
      .attr("font-family", "JetBrains Mono, monospace")
      .each(function (d) {
        const self = d3.select(this);
        if (d.title.length > 24) {
          self.text(d.title.slice(0, 22) + "…");
        }
      });

    labelGroup.each(function () {
      const textElem = d3.select(this).select("text").node() as SVGTextElement;
      if (textElem) {
        const textWidth = textElem.getComputedTextLength();
        d3.select(this)
          .select("rect")
          .attr("width", textWidth + 10)
          .attr("height", 16)
          .attr("x", -(textWidth + 10) / 2)
          .attr("y", -8);
      }
    });

    // Hover & Click Interactive Highlights
    node
      .on("mouseover", (_event, d) => {
        setHoveredNode(d);

        // Highlight connected links
        link
          .attr("stroke-opacity", (l: any) =>
            l.source.id === d.id || l.target.id === d.id ? 1 : 0.15
          )
          .attr("stroke-width", (l: any) =>
            l.source.id === d.id || l.target.id === d.id ? 3.5 : 1.5
          );

        linkGlow
          .attr("stroke-opacity", (l: any) =>
            l.source.id === d.id || l.target.id === d.id ? 0.6 : 0.05
          );

        // Highlight connected nodes
        node.attr("opacity", (n: any) => {
          const isConnected =
            n.id === d.id ||
            links.some(
              (l: any) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id)
            );
          return isConnected ? 1 : 0.25;
        });
      })
      .on("mouseout", () => {
        setHoveredNode(null);
        link.attr("stroke-opacity", 0.85).attr("stroke-width", (d) => Math.max(2, (d.weight || 0.7) * 2.8));
        linkGlow.attr("stroke-opacity", 0.25);
        node.attr("opacity", 1);
      })
      .on("click", (_event, d) => {
        setSelectedNode(d);
        if (!d.isEntityNode) {
          const fullResource = resources.find((r) => r.id === d.id);
          if (fullResource) {
            onSelectResource(fullResource);
          }
        }
      });

    // Simulation Tick Update
    simulation.on("tick", () => {
      linkGlow
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      edgeLabel.attr("transform", (d: any) => {
        const midX = (d.source.x + d.target.x) / 2;
        const midY = (d.source.y + d.target.y) / 2;
        return `translate(${midX}, ${midY})`;
      });

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, resources, showConceptHubs, showEdgeLabels, dimensions.width, dimensions.height, isFullscreen]);

  // Zoom Handlers
  const handleZoom = (scaleFactor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, scaleFactor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const filteredNodesCount = graphData.nodes.length;
  const filteredLinksCount = graphData.links.length;

  const graphContent = (
    <div
      ref={containerRef}
      className={`w-full bg-[#080808] flex flex-col transition-all overflow-hidden ${
        isFullscreen
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-[#080808] border-none rounded-none shadow-none"
          : "relative h-[660px] sm:h-[720px] xl:h-[760px] border border-[#1F1F1F] rounded-2xl shadow-2xl"
      }`}
    >
      {/* Top Controls Toolbar */}
      <div className="p-3 sm:p-3.5 border-b border-[#1A1A1A] bg-[#0A0A0A]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-serif text-white flex items-center gap-2">
              <span>OKF v0.2 Knowledge Graph Explorer</span>
              <span className="text-[10px] font-mono bg-[#161616] text-[#C5A059] px-2 py-0.5 rounded border border-[#2A2A2A]">
                {filteredNodesCount} Nodi · {filteredLinksCount} Relazioni
              </span>
              {isFullscreen && (
                <span className="text-[10px] font-mono bg-[#C5A059]/15 text-[#C5A059] px-2 py-0.5 rounded border border-[#C5A059]/30 hidden md:inline-block">
                  Schermo Intero (ESC per uscire)
                </span>
              )}
            </h3>
            <p className="text-[10px] text-[#777] font-mono">
              Grafo topologico semantico · Relazioni ontologiche, entità condivise e tag
            </p>
          </div>
        </div>

        {/* Filter Relation Mode Tabs */}
        <div className="flex items-center gap-1 bg-[#111] p-1 rounded-lg border border-[#222]">
          <span className="text-[10px] font-mono text-[#666] px-1.5 flex items-center gap-1">
            <Share2 className="w-3 h-3 text-[#C5A059]" /> Relazioni:
          </span>
          {[
            { id: "all", label: "Tutte" },
            { id: "explicit", label: "Ontologiche (OKF)" },
            { id: "entities", label: "Entità Comuni" },
            { id: "tags", label: "Tag" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRelationFilterMode(tab.id as any)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                relationFilterMode === tab.id
                  ? "bg-[#222] text-[#C5A059] font-medium border border-[#333]"
                  : "text-[#777] hover:text-[#BBB]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Entity Hubs & Edge Labels Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowConceptHubs(!showConceptHubs)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 border transition-all ${
              showConceptHubs
                ? "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40"
                : "bg-[#111] text-[#777] border-[#222] hover:text-[#AAA]"
            }`}
            title="Mostra nodi concetto ed entità intermedie"
          >
            <Layers className="w-3 h-3" />
            <span>Nodi Entità</span>
          </button>

          <button
            onClick={() => setShowEdgeLabels(!showEdgeLabels)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 border transition-all ${
              showEdgeLabels
                ? "bg-[#C5A059]/15 text-[#C5A059] border-[#C5A059]/40"
                : "bg-[#111] text-[#777] border-[#222] hover:text-[#AAA]"
            }`}
            title="Mostra etichette sulle linee delle relazioni"
          >
            <LinkIcon className="w-3 h-3" />
            <span>Etichette Linee</span>
          </button>
        </div>

        {/* Search within graph */}
        <div className="relative min-w-[170px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cerca entità o nodo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111] border border-[#222] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#CCC] placeholder-[#555] focus:outline-none focus:border-[#C5A059]"
          />
        </div>

        {/* Zoom & Fullscreen Controls */}
        <div className="flex items-center gap-1.5 bg-[#111] border border-[#222] rounded-lg p-1">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 text-[#888] hover:text-white hover:bg-[#1C1C1C] rounded transition-colors"
            title="Ingrandisci (Zoom In)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom(0.7)}
            className="p-1.5 text-[#888] hover:text-white hover:bg-[#1C1C1C] rounded transition-colors"
            title="Riduci (Zoom Out)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 text-[#888] hover:text-[#C5A059] hover:bg-[#1C1C1C] rounded transition-colors"
            title="Centra vista"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-[#222] mx-1" />
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded transition-all flex items-center gap-1.5 ${
              isFullscreen
                ? "bg-[#C5A059] text-black font-semibold hover:bg-[#D4AF65] px-2.5"
                : "text-[#888] hover:text-white hover:bg-[#1C1C1C]"
            }`}
            title={isFullscreen ? "Esci da Schermo Intero (ESC)" : "Espandi a Schermo Intero"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span className="text-[11px] font-mono">Esci</span>
              </>
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main SVG Graph Canvas */}
      <div className="flex-1 w-full h-full min-h-0 relative cursor-grab active:cursor-grabbing overflow-hidden">
        <svg ref={svgRef} className="w-full h-full block" />

        {/* Legend Overlay */}
        <div className="absolute bottom-4 left-4 bg-[#0A0A0A]/90 backdrop-blur-md border border-[#1F1F1F] rounded-xl p-3.5 text-[10px] font-mono space-y-2 pointer-events-none shadow-2xl max-w-xs">
          <div className="text-[#888] uppercase tracking-wider font-semibold border-b border-[#1C1C1C] pb-1">
            Legenda Nodi & Relazioni
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
              <span className="text-[#DDD]">Problemi & Fix</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#C5A059]" />
              <span className="text-[#DDD]">Knowledge OKF</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
              <span className="text-[#DDD]">MCP & Entità</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#A855F7]" />
              <span className="text-[#DDD]">GitHub Repo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
              <span className="text-[#DDD]">AI Skills</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-[#1C1C1C] space-y-1">
            <div className="text-[#777] text-[9px]">Tipi di Linee:</div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-[#C5A059]" />
              <span className="text-[#BBB]">Ontologica OKF (diretta)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-[#38BDF8]" />
              <span className="text-[#BBB]">Entità in Comune</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 border-b border-dashed border-[#F59E0B]" />
              <span className="text-[#BBB]">Tag Condivisi</span>
            </div>
          </div>
        </div>

        {/* Hover Link Info Badge */}
        {hoveredLink && (
          <div className="absolute bottom-4 right-4 bg-[#0E0E0E] border border-[#2B2B2B] rounded-xl p-3 shadow-2xl z-20 pointer-events-none max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: hoveredLink.color || "#C5A059" }} 
              />
              <span className="text-xs font-mono font-medium text-white">
                {hoveredLink.label || hoveredLink.relationType}
              </span>
            </div>
            <div className="text-[11px] text-[#AAA] font-mono">
              {hoveredLink.sourceTitle} ➔ {hoveredLink.targetTitle}
            </div>
            {hoveredLink.description && (
              <p className="text-[10px] text-[#777] mt-1">
                {hoveredLink.description}
              </p>
            )}
          </div>
        )}

        {/* Node Hover/Selection Tooltip Card */}
        {hoveredNode && (
          <div className="absolute top-4 right-4 max-w-sm bg-[#0E0E0E] border border-[#2B2B2B] rounded-xl p-4 shadow-2xl z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span
                className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold"
                style={{
                  color: getNodeColor(hoveredNode.type),
                  backgroundColor: "#161616",
                  border: `1px solid ${getNodeColor(hoveredNode.type)}40`,
                }}
              >
                {hoveredNode.isEntityNode ? "OKF Entità" : hoveredNode.type.replace("_", " ")}
              </span>
              <span className="text-[10px] font-mono text-[#C5A059] bg-[#161616] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                {hoveredNode.degree} {hoveredNode.degree === 1 ? "Connessione" : "Connessioni"}
              </span>
            </div>

            <h4 className="text-sm font-serif text-white font-medium mb-1">
              {hoveredNode.title}
            </h4>

            {hoveredNode.summary && (
              <p className="text-xs text-[#888] line-clamp-3 leading-relaxed mb-2">
                {hoveredNode.summary}
              </p>
            )}

            {hoveredNode.tags && hoveredNode.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {hoveredNode.tags.slice(0, 4).map((t, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] font-mono bg-[#141414] text-[#888] px-1.5 py-0.5 rounded border border-[#222]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {!hoveredNode.isEntityNode && (
              <div className="mt-2 pt-2 border-t border-[#1C1C1C] text-[10px] text-[#C5A059] font-mono">
                ⚡ Fai clic per aprire il documento
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return isFullscreen ? createPortal(graphContent, document.body) : graphContent;
};

