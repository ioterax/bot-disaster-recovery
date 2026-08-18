(() => {
  const palette = {
    blue: "var(--joint-blue)",
    cyan: "var(--joint-cyan)",
    gold: "var(--joint-gold)",
    paper: "var(--joint-surface)",
    ink: "var(--joint-ink)",
    muted: "var(--joint-muted)",
    line: "var(--joint-line)",
    red: "var(--joint-red)"
  };

  const clean = (value = "") => value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/^['"]|['"]$/g, "")
    .trim();

  function readNode(token, model, role = "node") {
    let value = token.trim().replace(/;$/, "");
    let edgeLabel = "";
    const colon = value.indexOf(":");
    if (colon > -1 && !/[\[({]/.test(value.slice(colon))) {
      edgeLabel = clean(value.slice(colon + 1));
      value = value.slice(0, colon).trim();
    }

    if (value === "[*]") {
      const id = role === "source" ? "__start" : "__end";
      if (!model.nodes.has(id)) model.nodes.set(id, { id, label: role === "source" ? "START" : "END", kind: "terminal", order: model.nodes.size });
      return { id, edgeLabel };
    }

    const match = value.match(/^([\w.-]+)\s*(?:\[\((.*?)\)\]|\[(.*?)\]|\{(.*?)\}|\((.*?)\))?$/);
    if (!match) return { id: value.replace(/\W/g, "_"), edgeLabel };
    const id = match[1];
    const label = clean(match[2] || match[3] || match[4] || match[5] || id);
    const kind = match[4] ? "decision" : match[2] ? "data" : "node";
    if (!model.nodes.has(id)) model.nodes.set(id, { id, label, kind, group: model.group, groupLabel: model.groups.get(model.group) || "", order: model.nodes.size });
    else if (label !== id) Object.assign(model.nodes.get(id), { label, kind });
    return { id, edgeLabel };
  }

  function parse(source) {
    const model = { direction: "TB", nodes: new Map(), edges: [], groups: new Map(), group: "", sequence: false };
    const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines.shift() || "";
    if (/^flowchart\s+/.test(first)) model.direction = first.split(/\s+/)[1];
    else if (/^sequenceDiagram/.test(first)) model.sequence = true;
    else if (/^stateDiagram/.test(first)) model.direction = "TB";
    else lines.unshift(first);

    for (const line of lines) {
      if (/^(classDef|class|style|linkStyle)\s/.test(line)) {
        const assignment = line.match(/^class\s+([^\s]+)\s+([\w-]+)/);
        if (assignment) assignment[1].split(",").forEach((id) => {
          if (model.nodes.has(id)) model.nodes.get(id).theme = assignment[2];
        });
        continue;
      }
      const group = line.match(/^subgraph\s+([\w.-]+)(?:\[(.*?)\])?/);
      if (group) {
        model.group = group[1];
        model.groups.set(group[1], clean(group[2] || group[1]));
        continue;
      }
      if (line === "end") { model.group = ""; continue; }

      const participant = line.match(/^participant\s+([\w.-]+)(?:\s+as\s+(.+))?/);
      if (participant) {
        model.nodes.set(participant[1], { id: participant[1], label: clean(participant[2] || participant[1]), kind: "participant", order: model.nodes.size });
        continue;
      }

      const sequenceEdge = line.match(/^([\w.-]+)\s*(-{1,2}>>?)\s*([\w.-]+)\s*:\s*(.+)$/);
      if (sequenceEdge) {
        model.edges.push({ source: sequenceEdge[1], target: sequenceEdge[3], label: clean(sequenceEdge[4]), dashed: sequenceEdge[2].startsWith("--") });
        continue;
      }

      if (/-->|==>|-.->/.test(line)) {
        const parts = line.split(/\s*(?:-->|==>|-.->)\s*/);
        let previous = readNode(parts.shift(), model, "source");
        for (const part of parts) {
          const next = readNode(part, model, "target");
          model.edges.push({ source: previous.id, target: next.id, label: next.edgeLabel });
          previous = next;
        }
        continue;
      }

      if (/^[\w.-]+\s*(?:\[|\{|\()/.test(line)) readNode(line, model);
    }
    return model;
  }

  function nodeTheme(node) {
    const key = (node.theme || node.group || "").toLowerCase();
    if (/reject|protected|fail/.test(key)) return { fill: "var(--joint-surface-red)", stroke: palette.red, accent: palette.red };
    if (/proof|persist|evidence|record|business/.test(key)) return { fill: "var(--joint-surface)", stroke: palette.cyan, accent: palette.cyan };
    if (/gate|core|control|govern|policy|management|done|cleanup/.test(key) || node.kind === "decision") return { fill: "var(--joint-surface-gold)", stroke: palette.gold, accent: palette.gold };
    if (/entry|scenario|source|experience|identity|api|pipeline|phase|observe|next|recovery/.test(key)) return { fill: "var(--joint-surface-blue)", stroke: palette.blue, accent: palette.blue };
    return { fill: palette.paper, stroke: palette.line, accent: palette.muted };
  }

  function ranks(model) {
    const result = new Map([...model.nodes.keys()].map((id) => [id, 0]));
    const ordered = [...model.nodes.values()];
    const order = new Map(ordered.map((node, index) => [node.id, index]));
    const forward = model.edges.filter((edge) => edge.source !== edge.target && order.get(edge.source) <= order.get(edge.target));
    for (let pass = 0; pass < ordered.length; pass += 1) {
      let changed = false;
      for (const edge of forward) {
        const next = Math.max(result.get(edge.target) || 0, (result.get(edge.source) || 0) + 1);
        if (next !== result.get(edge.target)) { result.set(edge.target, next); changed = true; }
      }
      if (!changed) break;
    }
    return result;
  }

  function addCard(graph, node, x, y, width = 184, height = 72) {
    const theme = nodeTheme(node);
    const hasHeader = Boolean(node.groupLabel);
    const element = new joint.shapes.standard.HeaderedRectangle({
      id: node.id,
      position: { x, y },
      size: { width, height },
      attrs: {
        root: { magnet: false },
        body: { fill: theme.fill, stroke: theme.stroke, strokeWidth: node.kind === "decision" ? 2 : 1.5, rx: node.kind === "terminal" ? 18 : 5, ry: node.kind === "terminal" ? 18 : 5 },
        header: { fill: theme.accent, stroke: theme.stroke, strokeWidth: 1.5, height: hasHeader ? 20 : 6, rx: 5, ry: 5 },
        headerText: { text: hasHeader ? node.groupLabel : "", fill: "#071f27", fontFamily: "Inter, sans-serif", fontSize: 8.5, fontWeight: 800, letterSpacing: .15 },
        bodyText: { text: node.label, fill: palette.ink, fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, lineHeight: 14.5, textWrap: { width: -22, height: -13, ellipsis: true } }
      }
    });
    graph.addCell(element);
    return element;
  }

  function renderSequence(model, graph) {
    const nodes = [...model.nodes.values()];
    const cardWidth = 176;
    const gap = 218;
    const height = Math.max(240, model.edges.length * 54 + 130);
    nodes.forEach((node, index) => addCard(graph, node, 28 + index * gap, 24, cardWidth, 68));
    nodes.forEach((node, index) => graph.addCell(new joint.shapes.standard.Link({
      source: { x: 116 + index * gap, y: 92 }, target: { x: 116 + index * gap, y: height },
      attrs: { line: { stroke: palette.line, strokeWidth: 1, strokeDasharray: "5 5", targetMarker: null } }
    })));
    model.edges.forEach((edge, index) => {
      const sourceIndex = nodes.findIndex((node) => node.id === edge.source);
      const targetIndex = nodes.findIndex((node) => node.id === edge.target);
      const y = 128 + index * 54;
      const link = new joint.shapes.standard.Link({
        source: { x: 116 + sourceIndex * gap, y }, target: { x: 116 + targetIndex * gap, y },
        vertices: sourceIndex === targetIndex ? [{ x: 158 + sourceIndex * gap, y: y - 18 }, { x: 158 + sourceIndex * gap, y: y + 18 }] : [],
        attrs: { line: { stroke: palette.blue, strokeWidth: 2, strokeDasharray: edge.dashed ? "7 5" : "", targetMarker: { type: "path", d: "M 9 -5 0 0 9 5 z", fill: palette.blue } } }
      });
      link.appendLabel({ attrs: { text: { text: edge.label, fill: palette.ink, fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 650 }, rect: { fill: "var(--joint-canvas-deep)", stroke: palette.line, strokeWidth: 1, rx: 3, ry: 3 } }, position: { distance: 0.5, offset: -13 } });
      graph.addCell(link);
    });
  }

  function renderGraph(model, graph) {
    const rank = ranks(model);
    const buckets = new Map();
    [...model.nodes.values()].forEach((node) => {
      const key = rank.get(node.id) || 0;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(node);
    });
    const declaredHorizontal = /LR|RL/.test(model.direction);
    const reverse = /RL|BT/.test(model.direction);
    const maxRank = Math.max(...buckets.keys(), 0);
    // Long horizontal chains lose all legibility when fitted to a docs column.
    const horizontal = declaredHorizontal && maxRank <= 4;
    const cardWidth = horizontal ? 158 : 176;
    const cardHeight = 70;
    const rankGap = horizontal ? 66 : 52;
    const siblingGap = horizontal ? 30 : 24;
    const maxPerRow = horizontal ? Number.POSITIVE_INFINITY : 3;
    const widestRank = Math.max(...[...buckets.values()].map((nodes) => Math.min(nodes.length, maxPerRow)), 1);
    const breadth = widestRank * (horizontal ? cardHeight : cardWidth) + (widestRank - 1) * siblingGap;
    const bands = new Map();
    if (!horizontal) {
      buckets.forEach((nodes, level) => {
        const axis = reverse ? maxRank - level : level;
        const rows = Math.ceil(nodes.length / maxPerRow);
        bands.set(axis, rows * cardHeight + (rows - 1) * siblingGap);
      });
    }
    const bandStart = (axis) => {
      let position = 28;
      for (let level = 0; level < axis; level += 1) position += (bands.get(level) || cardHeight) + rankGap;
      return position;
    };
    buckets.forEach((nodes, level) => nodes.forEach((node, index) => {
      const axis = reverse ? maxRank - level : level;
      const row = horizontal ? 0 : Math.floor(index / maxPerRow);
      const column = horizontal ? index : index % maxPerRow;
      const rowCount = horizontal ? nodes.length : Math.min(maxPerRow, nodes.length - row * maxPerRow);
      const occupied = rowCount * (horizontal ? cardHeight : cardWidth) + (rowCount - 1) * siblingGap;
      const offset = (breadth - occupied) / 2;
      const x = horizontal ? 28 + axis * (cardWidth + rankGap) : 28 + offset + column * (cardWidth + siblingGap);
      const y = horizontal ? 28 + offset + index * (cardHeight + siblingGap) : bandStart(axis) + row * (cardHeight + siblingGap);
      addCard(graph, node, x, y, cardWidth, cardHeight);
    }));
    model.edges.forEach((edge) => {
      const link = new joint.shapes.standard.Link({
        source: { id: edge.source }, target: { id: edge.target },
        router: { name: "manhattan", args: { padding: 14, step: 8 } },
        connector: { name: "rounded", args: { radius: 7 } },
        attrs: { line: { stroke: palette.line, strokeWidth: 1.7, targetMarker: { type: "path", d: "M 8 -4 0 0 8 4 z", fill: palette.line, stroke: "none" } } }
      });
      if (edge.label) link.appendLabel({ attrs: { text: { text: edge.label, fill: palette.ink, fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 650 }, rect: { fill: "var(--joint-canvas-deep)", stroke: palette.line, rx: 3, ry: 3 } }, position: { distance: 0.5, offset: -11 } });
      graph.addCell(link);
      link.toBack();
    });
  }

  function renderDiagram(sourceElement, index) {
    if (sourceElement.dataset.rendered || !window.joint) return;
    sourceElement.dataset.rendered = "true";
    const source = sourceElement.textContent;
    const model = parse(source);
    const shell = document.createElement("figure");
    shell.className = "joint-diagram";
    shell.setAttribute("aria-label", `Diagrama de arquitetura ${index + 1}`);
    shell.innerHTML = `<div class="joint-diagram__toolbar"><span>Mapa interativo do sistema</span><div><button type="button" data-action="out" aria-label="Reduzir zoom">−</button><button type="button" data-action="fit" aria-label="Ajustar diagrama">Fit</button><button type="button" data-action="in" aria-label="Aumentar zoom">+</button></div></div><div class="joint-diagram__viewport"><div class="joint-diagram__paper"></div></div><figcaption class="joint-diagram__legend"><span style="color:var(--joint-blue)"><i></i>Etapa</span><span style="color:var(--joint-gold)"><i></i>Decisão</span><span style="color:var(--joint-cyan)"><i></i>Evidência</span><span style="color:var(--joint-red)"><i></i>Rejeição</span></figcaption>`;
    sourceElement.replaceWith(shell);

    const graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes });
    if (model.sequence) renderSequence(model, graph); else renderGraph(model, graph);
    const viewport = shell.querySelector(".joint-diagram__viewport");
    const paperHost = shell.querySelector(".joint-diagram__paper");
    const bbox = graph.getBBox().inflate(38);
    const paperWidth = Math.max(bbox.width, 320);
    const paperHeight = Math.max(bbox.height, 200);
    const paper = new joint.dia.Paper({ el: paperHost, model: graph, width: paperWidth, height: paperHeight, gridSize: 10, async: false, frozen: true, interactive: false, background: { color: "transparent" }, cellViewNamespace: joint.shapes });
    paper.translate(-bbox.x, -bbox.y);
    paper.unfreeze();

    let zoom = 1;
    const applyZoom = () => {
      paperHost.style.zoom = zoom;
    };
    shell.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (!action) return;
      if (action === "in") zoom = Math.min(1.6, zoom + 0.15);
      if (action === "out") zoom = Math.max(0.55, zoom - 0.15);
      if (action === "fit") zoom = Math.min(1, (viewport.clientWidth - 24) / paperWidth);
      applyZoom();
    });
    const fit = () => {
      if (!viewport.clientWidth) return;
      zoom = Math.min(1, Math.max(.35, (viewport.clientWidth - 24) / paperWidth));
      applyZoom();
    };
    requestAnimationFrame(fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(viewport);
  }

  const install = () => document.querySelectorAll("pre.joint-diagram-source:not([data-rendered])").forEach(renderDiagram);
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  if (typeof document$ !== "undefined") document$.subscribe(install);
})();
