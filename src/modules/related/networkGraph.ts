import { getLocaleID, getString } from "../../utils/locale";

const PANE_ID = "ai-related-papers-network";
const MAX_RELATED_NODES = 18;
const MAX_DIALOG_RELATED_NODES = 42;
const ICON_16 = `${rootURI}content/icons/icon16.png`;
const ICON_20 = `${rootURI}content/icons/icon20.png`;

let sectionKey: string | undefined;

interface NetworkNode {
  id: number;
  item: Zotero.Item;
  title: string;
  isSource: boolean;
  level: number;
  x: number;
  y: number;
}

interface NetworkEdge {
  sourceID: number;
  targetID: number;
}

interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  width: number;
  height: number;
}

interface DragState {
  node: NetworkNode;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface RenderGraphOptions {
  maxWidth: string;
  height: string;
  svgHeight: number;
  onNodeClick?: (node: NetworkNode) => void;
}

export function registerRelatedNetworkSection() {
  if (sectionKey) return;

  const registered = Zotero.ItemPaneManager.registerSection({
    paneID: PANE_ID,
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("related-network-section-head"),
      icon: ICON_16,
    },
    sidenav: {
      l10nID: getLocaleID("related-network-section-sidenav"),
      icon: ICON_20,
    },
    onItemChange: ({ item, setEnabled }) => {
      setEnabled(isRenderableItem(item));
      return true;
    },
    onRender: ({ body, item, setSectionSummary }) => {
      clearBody(body);
      setSectionSummary(getString("related-network-loading"));
      renderLoading(body);
      if (!isRenderableItem(item)) {
        setSectionSummary("");
      }
    },
    onAsyncRender: async ({ body, item, setSectionSummary }) => {
      if (!isRenderableItem(item)) return;

      const graph = await buildRelatedNetwork(item);
      clearBody(body);
      setSectionSummary(
        getString("related-network-summary", {
          args: { count: graph.nodes.length - 1 },
        }),
      );
      renderGraph(body, graph);
    },
  });

  if (registered) sectionKey = registered;
}

export function unregisterRelatedNetworkSection() {
  if (!sectionKey) return;
  Zotero.ItemPaneManager.unregisterSection(sectionKey);
  sectionKey = undefined;
}

export async function openRelatedNetworkDialog(source: Zotero.Item) {
  const dialogData: { [key: string]: any } = {};
  const containerID = `${addon.data.config.addonRef}-related-network-dialog`;
  const dialog = new ztoolkit.Dialog(2, 1)
    .addCell(
      0,
      0,
      {
        tag: "h2",
        properties: {
          innerText: getString("related-network-dialog-title"),
        },
        styles: {
          margin: "0 0 8px",
        },
      },
      false,
    )
    .addCell(
      1,
      0,
      {
        tag: "div",
        namespace: "html",
        id: containerID,
        styles: {
          width: "680px",
          minHeight: "460px",
        },
      },
      false,
    )
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("related-network-dialog-title"), {
      width: 740,
      height: 580,
      resizable: true,
      centerscreen: true,
    });

  addon.data.dialog = dialog;
  await dialogData.loadLock.promise;

  const container = dialog.window.document.getElementById(
    containerID,
  ) as HTMLDivElement | null;
  if (container) {
    setupDialogNetwork(container, source);
  }
  await dialogData.unloadLock.promise;
  addon.data.dialog = undefined;
}

async function buildRelatedNetwork(
  source: Zotero.Item,
  options: {
    depth?: number;
    maxRelatedNodes?: number;
    width?: number;
    height?: number;
  } = {},
): Promise<NetworkGraph> {
  const depth = clampDepth(options.depth ?? 1);
  const maxNodeCount = (options.maxRelatedNodes ?? MAX_RELATED_NODES) + 1;
  const width = options.width ?? 440;
  const height = options.height ?? 290;
  const items = new Map<number, Zotero.Item>([[source.id, source]]);
  const levels = new Map<number, number>([[source.id, 0]]);
  const queue: { item: Zotero.Item; level: number }[] = [
    { item: source, level: 0 },
  ];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.level >= depth) continue;

    for (const relatedID of getRelatedItemIDs(current.item)) {
      if (items.has(relatedID)) continue;
      if (items.size >= maxNodeCount) break;

      const relatedItem = await getItem(relatedID);
      if (!isRenderableItem(relatedItem)) continue;

      items.set(relatedItem.id, relatedItem);
      levels.set(relatedItem.id, current.level + 1);
      queue.push({ item: relatedItem, level: current.level + 1 });
    }
  }

  const edges = new Map<string, NetworkEdge>();
  for (const item of items.values()) {
    const itemRelatedIDs = getRelatedItemIDs(item);
    for (const relatedID of itemRelatedIDs) {
      if (items.has(relatedID)) {
        addEdge(edges, item.id, relatedID);
      }
    }
  }

  const nodes = layoutNodes(source, items, levels, width, height);
  relaxBubbleLayout(nodes, Array.from(edges.values()), width, height);
  return { nodes, edges: Array.from(edges.values()), width, height };
}

function layoutNodes(
  source: Zotero.Item,
  items: Map<number, Zotero.Item>,
  levels: Map<number, number>,
  width: number,
  height: number,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes: NetworkNode[] = [
    {
      id: source.id,
      item: source,
      title: getItemTitle(source),
      isSource: true,
      level: 0,
      x: centerX,
      y: centerY,
    },
  ];
  const relatedNodes = Array.from(items.values())
    .filter((item) => item.id !== source.id)
    .map((item) => ({
      id: item.id,
      item,
      title: getItemTitle(item),
      isSource: false,
      level: levels.get(item.id) ?? 1,
      x: centerX,
      y: centerY,
    }));
  const nodesByLevel = new Map<number, NetworkNode[]>();

  for (const node of relatedNodes) {
    const levelNodes = nodesByLevel.get(node.level) ?? [];
    levelNodes.push(node);
    nodesByLevel.set(node.level, levelNodes);
  }

  for (const [level, levelNodes] of nodesByLevel) {
    const baseRadius = Math.min(width, height) * (level === 1 ? 0.28 : 0.43);
    const radius = Math.min(baseRadius, Math.min(width, height) / 2 - 28);
    levelNodes.forEach((node, index) => {
      const angle =
        (2 * Math.PI * index) / levelNodes.length -
        Math.PI / 2 +
        (level === 1 ? 0 : Math.PI / Math.max(levelNodes.length, 1));
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });
    nodes.push(...levelNodes);
  }

  return nodes;
}

function addEdge(
  edges: Map<string, NetworkEdge>,
  sourceID: number,
  targetID: number,
) {
  if (sourceID === targetID) return;
  const [left, right] =
    sourceID < targetID ? [sourceID, targetID] : [targetID, sourceID];
  edges.set(`${left}:${right}`, { sourceID: left, targetID: right });
}

function clampDepth(depth: number) {
  if (!Number.isFinite(depth)) return 1;
  return Math.min(2, Math.max(1, Math.round(depth)));
}

async function getItem(itemID: number) {
  return (await Zotero.Items.getAsync(itemID)) as Zotero.Item;
}

function getRelatedItemIDs(item: Zotero.Item) {
  const ids = new Set<number>();
  const relatedItems = (item as any).relatedItems;
  if (!Array.isArray(relatedItems)) return ids;

  for (const relatedItem of relatedItems) {
    if (typeof relatedItem === "number") {
      ids.add(relatedItem);
    } else if (typeof relatedItem === "string") {
      const resolved = (Zotero.Items as any).getByLibraryAndKey?.(
        item.libraryID,
        relatedItem,
      );
      if (resolved?.id) ids.add(resolved.id);
    } else if (relatedItem?.id) {
      ids.add(relatedItem.id);
    }
  }
  return ids;
}

function renderGraph(
  body: HTMLDivElement,
  graph: NetworkGraph,
  options: RenderGraphOptions = {
    maxWidth: "520px",
    height: "320px",
    svgHeight: 290,
  },
) {
  const doc = body.ownerDocument as Document;
  const container = doc.createElement("div");
  container.style.width = "100%";
  container.style.maxWidth = options.maxWidth;
  container.style.height = options.height;
  container.style.overflow = "hidden";
  container.style.boxSizing = "border-box";

  if (graph.nodes.length <= 1) {
    container.appendChild(createEmptyState(doc));
    body.appendChild(container);
    return;
  }

  const svg = doc.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  ) as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${graph.width} ${graph.height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(options.svgHeight));
  svg.setAttribute("role", "img");
  svg.style.display = "block";
  svg.style.userSelect = "none";

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const handleNodeClick =
    options.onNodeClick ?? ((node: NetworkNode) => selectItem(node.item));
  let dragState: DragState | undefined;

  for (const edge of graph.edges) {
    const source = nodeMap.get(edge.sourceID);
    const target = nodeMap.get(edge.targetID);
    if (!source || !target) continue;
    svg.appendChild(
      createEdge(
        doc,
        source,
        target,
        edge.sourceID === graph.nodes[0].id ||
          edge.targetID === graph.nodes[0].id,
      ),
    );
  }

  for (const node of graph.nodes) {
    svg.appendChild(createNode(doc, node));
  }
  svg.addEventListener("mousedown", (event) => {
    const mouseEvent = event as MouseEvent;
    const nodeID = getClickedNodeID(mouseEvent.target, svg);
    if (!nodeID) return;

    const node = nodeMap.get(nodeID);
    if (!node) return;

    event.preventDefault();
    event.stopPropagation();
    dragState = {
      node,
      startClientX: mouseEvent.clientX,
      startClientY: mouseEvent.clientY,
      startX: node.x,
      startY: node.y,
      moved: false,
    };
  });
  svg.addEventListener("mousemove", (event) => {
    if (!dragState) return;

    const mouseEvent = event as MouseEvent;
    const dx = mouseEvent.clientX - dragState.startClientX;
    const dy = mouseEvent.clientY - dragState.startClientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
    if (!dragState.moved) return;

    event.preventDefault();
    event.stopPropagation();
    dragState.node.x = clampNumber(
      dragState.startX + dx,
      getNodeRadius(dragState.node) + 4,
      graph.width - getNodeRadius(dragState.node) - 4,
    );
    dragState.node.y = clampNumber(
      dragState.startY + dy,
      getNodeRadius(dragState.node) + 16,
      graph.height - getNodeRadius(dragState.node) - 22,
    );
    updateNodePosition(svg, dragState.node);
    updateConnectedEdges(svg, dragState.node);
  });
  const finishPointer = (event: MouseEvent) => {
    if (!dragState) return;

    event.preventDefault();
    event.stopPropagation();
    const { node, moved } = dragState;
    dragState = undefined;
    if (!moved) {
      handleNodeClick(node);
    }
  };
  svg.addEventListener("mouseup", finishPointer);
  svg.addEventListener("mouseleave", () => {
    dragState = undefined;
  });

  container.appendChild(svg);
  container.appendChild(createCaption(doc, graph.nodes.length - 1));
  body.appendChild(container);
}

function createEdge(
  doc: Document,
  source: NetworkNode,
  target: NetworkNode,
  isSourceEdge: boolean,
) {
  const line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("data-edge-source", String(source.id));
  line.setAttribute("data-edge-target", String(target.id));
  line.setAttribute("x1", String(source.x));
  line.setAttribute("y1", String(source.y));
  line.setAttribute("x2", String(target.x));
  line.setAttribute("y2", String(target.y));
  line.setAttribute("stroke", isSourceEdge ? "#6b7280" : "#c4c9d4");
  line.setAttribute("stroke-width", isSourceEdge ? "1.6" : "1");
  line.setAttribute("stroke-linecap", "round");
  return line;
}

function createNode(doc: Document, node: NetworkNode) {
  const group = doc.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  ) as unknown as SVGGElement;
  group.setAttribute("transform", `translate(${node.x} ${node.y})`);
  group.setAttribute("data-item-id", String(node.id));
  group.setAttribute("data-node", "true");
  group.style.cursor = "pointer";
  group.style.pointerEvents = "all";

  const title = doc.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = node.title;
  group.appendChild(title);

  const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("data-item-id", String(node.id));
  circle.setAttribute("r", String(getNodeRadius(node)));
  circle.setAttribute("fill", getNodeFill(node));
  circle.setAttribute("fill-opacity", node.isSource ? "0.95" : "0.9");
  circle.setAttribute("stroke", node.isSource ? "#1d4ed8" : "#64748b");
  circle.setAttribute("stroke-width", node.isSource ? "2" : "1.4");
  group.appendChild(circle);

  const label = doc.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  ) as unknown as SVGTextElement;
  label.setAttribute("data-item-id", String(node.id));
  label.setAttribute("y", String(getNodeRadius(node) + 14));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", node.isSource ? "12" : "10");
  label.setAttribute("fill", "currentColor");
  label.style.pointerEvents = "none";
  label.textContent = clip(node.title, node.isSource ? 26 : 20);
  group.appendChild(label);

  return group;
}

function setupDialogNetwork(container: HTMLDivElement, source: Zotero.Item) {
  const doc = container.ownerDocument as Document;
  clearBody(container);
  container.style.width = "680px";
  container.style.minHeight = "460px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "8px";

  const controls = createHTMLElement(doc, "div");
  controls.style.display = "flex";
  controls.style.alignItems = "center";
  controls.style.gap = "8px";
  controls.style.margin = "0 0 2px";
  controls.style.flexWrap = "wrap";

  const label = createHTMLElement(doc, "span");
  label.textContent = getString("related-network-level-label");
  label.style.fontSize = "13px";

  const levelButtons = createHTMLElement(doc, "div");
  levelButtons.style.display = "inline-flex";
  levelButtons.style.gap = "4px";
  const levelOneButton = createDepthButton(
    doc,
    getString("related-network-level-1"),
  );
  const levelTwoButton = createDepthButton(
    doc,
    getString("related-network-level-2"),
  );
  levelButtons.append(levelOneButton, levelTwoButton);

  const centerLabel = createHTMLElement(doc, "span");
  centerLabel.style.fontSize = "12px";
  centerLabel.style.opacity = "0.72";
  centerLabel.style.marginInlineStart = "8px";

  const graphBody = createHTMLElement(doc, "div");
  graphBody.style.flex = "1 1 auto";
  graphBody.style.minHeight = "420px";

  controls.append(label, levelButtons, centerLabel);
  container.append(controls, graphBody);

  let currentSource = source;
  let currentDepth = 1;
  let renderVersion = 0;
  const updateControls = () => {
    setDepthButtonState(levelOneButton, currentDepth === 1);
    setDepthButtonState(levelTwoButton, currentDepth === 2);
    centerLabel.textContent = getString("related-network-center-label", {
      args: { title: clip(getItemTitle(currentSource), 60) },
    });
  };
  const renderLevel = async () => {
    const version = ++renderVersion;
    const depth = clampDepth(currentDepth);
    updateControls();
    clearBody(graphBody);
    renderLoading(graphBody);
    const graph = await buildRelatedNetwork(currentSource, {
      depth,
      maxRelatedNodes: MAX_DIALOG_RELATED_NODES,
      width: 560,
      height: 360,
    });
    if (version !== renderVersion) return;
    clearBody(graphBody);
    renderGraph(graphBody, graph, {
      maxWidth: "680px",
      height: "430px",
      svgHeight: 390,
      onNodeClick: (node) => {
        selectItem(node.item);
        if (currentDepth <= 1 || node.item.id === currentSource.id) return;

        currentSource = node.item;
        void renderLevel();
      },
    });
  };

  levelOneButton.addEventListener("click", () => {
    currentDepth = 1;
    void renderLevel();
  });
  levelTwoButton.addEventListener("click", () => {
    currentDepth = 2;
    void renderLevel();
  });
  for (const depthButton of [levelOneButton, levelTwoButton]) {
    depthButton.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;

      event.preventDefault();
      depthButton.click();
    });
  }
  void renderLevel();
}

function getClickedNodeID(target: EventTarget | null, boundary: SVGSVGElement) {
  let node = target as Node | null;
  while (node && node !== boundary) {
    const maybeElement = node as {
      getAttribute?: (name: string) => string | null;
    };
    if (typeof maybeElement.getAttribute === "function") {
      const itemID = maybeElement.getAttribute("data-item-id");
      if (itemID) return Number(itemID);
    }
    node = node.parentNode;
  }
  return undefined;
}

function createDepthButton(doc: Document, label: string) {
  const button = createHTMLElement(doc, "span");
  button.setAttribute("role", "button");
  button.tabIndex = 0;
  button.textContent = label;
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.minWidth = "58px";
  button.style.padding = "4px 11px";
  button.style.borderRadius = "4px";
  button.style.border = "1px solid #64748b";
  button.style.cursor = "pointer";
  button.style.fontSize = "13px";
  button.style.fontWeight = "600";
  button.style.lineHeight = "1.2";
  button.style.boxSizing = "border-box";
  return button;
}

function getNodeRadius(node: NetworkNode) {
  if (node.isSource) return 27;
  if (node.level <= 1) return 20;
  return 15;
}

function getNodeFill(node: NetworkNode) {
  if (node.isSource) return "#2563eb";
  if (node.level <= 1) return "#dbeafe";
  return "#f8fafc";
}

function updateNodePosition(svg: SVGSVGElement, node: NetworkNode) {
  const element = svg.querySelector(
    `[data-node="true"][data-item-id="${node.id}"]`,
  );
  element?.setAttribute("transform", `translate(${node.x} ${node.y})`);
}

function updateConnectedEdges(svg: SVGSVGElement, node: NetworkNode) {
  const lines = Array.from(
    svg.querySelectorAll(
      `line[data-edge-source="${node.id}"], line[data-edge-target="${node.id}"]`,
    ) as NodeListOf<SVGLineElement>,
  ) as SVGLineElement[];
  for (const line of lines) {
    if (line.getAttribute("data-edge-source") === String(node.id)) {
      line.setAttribute("x1", String(node.x));
      line.setAttribute("y1", String(node.y));
    }
    if (line.getAttribute("data-edge-target") === String(node.id)) {
      line.setAttribute("x2", String(node.x));
      line.setAttribute("y2", String(node.y));
    }
  }
}

function relaxBubbleLayout(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  width: number,
  height: number,
) {
  if (nodes.length <= 2) return;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (let iteration = 0; iteration < 60; iteration++) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex++) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < nodes.length;
        rightIndex++
      ) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        const dx = right.x - left.x || 0.01;
        const dy = right.y - left.y || 0.01;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = getNodeRadius(left) + getNodeRadius(right) + 18;
        if (distance >= minDistance) continue;

        const push = ((minDistance - distance) / distance) * 0.35;
        const leftMovable = left.isSource ? 0.25 : 1;
        const rightMovable = right.isSource ? 0.25 : 1;
        left.x -= dx * push * leftMovable;
        left.y -= dy * push * leftMovable;
        right.x += dx * push * rightMovable;
        right.y += dy * push * rightMovable;
      }
    }

    for (const edge of edges) {
      const source = nodeMap.get(edge.sourceID);
      const target = nodeMap.get(edge.targetID);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const preferred = source.isSource || target.isSource ? 110 : 86;
      const pull = ((distance - preferred) / distance) * 0.015;
      source.x += dx * pull * (source.isSource ? 0.12 : 1);
      source.y += dy * pull * (source.isSource ? 0.12 : 1);
      target.x -= dx * pull * (target.isSource ? 0.12 : 1);
      target.y -= dy * pull * (target.isSource ? 0.12 : 1);
    }

    for (const node of nodes) {
      const radius = getNodeRadius(node);
      node.x = clampNumber(node.x, radius + 8, width - radius - 8);
      node.y = clampNumber(node.y, radius + 18, height - radius - 24);
    }
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function setDepthButtonState(button: HTMLElement, selected: boolean) {
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  button.style.setProperty(
    "background-color",
    selected ? "#dbeafe" : "#ffffff",
    "important",
  );
  button.style.setProperty(
    "color",
    selected ? "#1e3a8a" : "#0f172a",
    "important",
  );
  button.style.setProperty(
    "border-color",
    selected ? "#60a5fa" : "#94a3b8",
    "important",
  );
  button.style.setProperty(
    "box-shadow",
    selected ? "inset 0 0 0 1px #bfdbfe" : "none",
    "important",
  );
}

function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
) {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElementTagNameMap[K];
}

function createCaption(doc: Document, count: number) {
  const caption = doc.createElement("div");
  caption.textContent = getString("related-network-caption", {
    args: { count },
  });
  caption.style.fontSize = "12px";
  caption.style.marginTop = "4px";
  caption.style.opacity = "0.72";
  return caption;
}

function createEmptyState(doc: Document) {
  const empty = doc.createElement("div");
  empty.textContent = getString("related-network-empty");
  empty.style.padding = "18px 4px";
  empty.style.opacity = "0.72";
  return empty;
}

function renderLoading(body: HTMLDivElement) {
  const loading = (body.ownerDocument as Document).createElement("div");
  loading.textContent = getString("related-network-loading");
  loading.style.padding = "12px 0";
  loading.style.opacity = "0.72";
  body.appendChild(loading);
}

function clearBody(body: HTMLDivElement) {
  body.replaceChildren();
}

function isRenderableItem(item: Zotero.Item | false | undefined) {
  if (!item) return false;
  if (!item?.isRegularItem?.()) return false;
  if ((item as any).isFeedItem) return false;
  return true;
}

function getItemTitle(item: Zotero.Item) {
  const title = item.getField("title" as any, false, true);
  if (typeof title === "string" && title.trim()) return title.trim();
  const displayTitle = (item as any).getDisplayTitle?.();
  return typeof displayTitle === "string" && displayTitle.trim()
    ? displayTitle.trim()
    : getString("untitled-item");
}

function selectItem(item: Zotero.Item) {
  const pane =
    ztoolkit.getGlobal("ZoteroPane") || Zotero.getActiveZoteroPane?.();
  void pane?.selectItem?.(item.id);
}

function clip(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}
