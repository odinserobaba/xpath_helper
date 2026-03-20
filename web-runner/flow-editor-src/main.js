import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "reactflow";

const API_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

/** Зазоры между узлами на канве — малые значения дают «слипание» orthogonal/smoothstep-связей в один канал. */
const STEP_GAP_X = 380;
const STEP_GAP_Y = 240;

/** Число колонок при автосетке: 2 колонки разводят узлы горизонтально сильнее, чем 3. */
const FLOW_GRID_COLS = 2;

/** Кривые Безье вместо smoothstep: линии реже совпадают по траектории и легче читаются. */
const FLOW_EDGE_TYPE = "simplebezier";

/** Визуальная рамка группы на канве (не шаг сценария). */
const FLOW_GROUP_TYPE = "flowGroup";

/** Примитивы разметки (не попадают в JSON steps). Сохраняются в flow.annotations. */
const ANNOTATION_TYPES = new Set(["annotationRect", "annotationEllipse", "annotationText"]);

/** Предустановки: обводка (12) и полупрозрачная заливка (12). */
const ANNOTATION_STROKE_SWATCHES = [
  "#00d4aa",
  "#00b0ff",
  "#651fff",
  "#d500f9",
  "#ff4081",
  "#ff1744",
  "#ff9100",
  "#ffd600",
  "#76ff03",
  "#1de9b6",
  "#e8eaf6",
  "#ffc857",
];

const ANNOTATION_FILL_SWATCHES = [
  "rgba(0,212,170,0.14)",
  "rgba(0,176,255,0.14)",
  "rgba(101,31,255,0.14)",
  "rgba(213,0,249,0.12)",
  "rgba(255,64,129,0.12)",
  "rgba(255,23,68,0.12)",
  "rgba(255,145,0,0.14)",
  "rgba(255,214,0,0.12)",
  "rgba(118,255,3,0.1)",
  "rgba(29,233,182,0.12)",
  "rgba(232,234,246,0.08)",
  "rgba(255,200,87,0.14)",
];

function clamp01(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function decorateEdgeDataDefaults() {
  return {
    kind: "decorate",
    label: "",
    labelColor: "#e8e6d8",
    labelOpacity: 1,
    labelBgColor: "#1a1a2e",
    labelBgOpacity: 0.88,
  };
}

function isAnnotationNode(n) {
  return !!(n && ANNOTATION_TYPES.has(n.type));
}

/** Визуальная связь разметки / стрелка к примитиву — не участвует в прогоне сценария. */
function edgeKindIsDecorate(e) {
  return String(e?.data?.kind || "") === "decorate";
}

function nodeByIdFromList(nodeList) {
  return new Map(nodeList.map((n) => [n.id, n]));
}

function edgeIsExecutableBranchYes(e, byId) {
  if (edgeKindIsDecorate(e)) return false;
  if (!(e?.data?.kind === "yes" || e.sourceHandle === "branch-yes")) return false;
  const t = byId.get(e.target);
  if (!t || isAnnotationNode(t)) return false;
  return true;
}

function edgeIsExecutableBranchNo(e, byId) {
  if (edgeKindIsDecorate(e)) return false;
  if (!(e?.data?.kind === "no" || e.sourceHandle === "branch-no")) return false;
  const t = byId.get(e.target);
  if (!t || isAnnotationNode(t)) return false;
  return true;
}

/** Ручки соединения для примитивов разметки (вход сверху/слева, выход снизу/справа). */
function annotationConnectionHandles(strokeColor) {
  const c = String(strokeColor || "#00d4aa");
  const hs = {
    width: 9,
    height: 9,
    background: c,
    border: "2px solid #0f0f1a",
    zIndex: 6,
  };
  return [
    React.createElement(Handle, {
      key: "hit",
      type: "target",
      position: Position.Top,
      id: "ann-t",
      style: hs,
    }),
    React.createElement(Handle, {
      key: "hou",
      type: "source",
      position: Position.Bottom,
      id: "ann-b",
      style: hs,
    }),
    React.createElement(Handle, {
      key: "hil",
      type: "target",
      position: Position.Left,
      id: "ann-l",
      style: hs,
    }),
    React.createElement(Handle, {
      key: "hor",
      type: "source",
      position: Position.Right,
      id: "ann-r",
      style: hs,
    }),
  ];
}

function partitionStrippedNodes(prev) {
  const stripped = stripGroupFrameNodes(prev);
  return {
    annotations: stripped.filter(isAnnotationNode),
    steps: stripped.filter((n) => !isAnnotationNode(n)),
  };
}

/** JSON flow.annotations[i] → узел React Flow */
function annotationSpecToNode(a, idx) {
  const id = String(a.id || `ann-${idx}-${Date.now()}`);
  const kind = String(a.kind || "rect");
  const type =
    kind === "ellipse" ? "annotationEllipse" : kind === "text" ? "annotationText" : "annotationRect";
  const w = Math.max(40, Number(a.width) || (kind === "text" ? 240 : 280));
  const h = Math.max(32, Number(a.height) || (kind === "text" ? 64 : 140));
  return {
    id,
    type,
    position: { x: Number(a.x ?? 48 + idx * 16), y: Number(a.y ?? 48 + idx * 16) },
    zIndex: -150,
    style: { width: w, height: h },
    draggable: true,
    selectable: true,
    connectable: true,
    data: {
      annKind: kind,
      label: String(a.label ?? ""),
      stroke: String(a.stroke ?? "#00d4aa"),
      fill: String(a.fill ?? "rgba(0,212,170,0.07)"),
      fontSize: Number(a.fontSize) > 0 ? Number(a.fontSize) : kind === "text" ? 15 : 13,
      textColor: String(a.textColor ?? "#e8eaf6"),
    },
  };
}

function annotationsToPayload(nodes) {
  return nodes.filter(isAnnotationNode).map((n) => {
    const d = n.data || {};
    const kind =
      d.annKind ||
      (n.type === "annotationText" ? "text" : n.type === "annotationEllipse" ? "ellipse" : "rect");
    const st = n.style || {};
    return {
      id: n.id,
      kind,
      x: Number(n.position?.x ?? 0),
      y: Number(n.position?.y ?? 0),
      width: typeof st.width === "number" ? st.width : parseInt(String(st.width || 0), 10) || 200,
      height: typeof st.height === "number" ? st.height : parseInt(String(st.height || 0), 10) || 100,
      label: String(d.label ?? ""),
      stroke: String(d.stroke ?? ""),
      fill: String(d.fill ?? ""),
      fontSize: Number(d.fontSize) || undefined,
      textColor: String(d.textColor ?? ""),
    };
  });
}
/** Внешний отступ рамки группы до ближайших блоков (больше — свободнее визуально). */
const GROUP_FRAME_PAD = 72;

function estimateNodeBBox(n) {
  const t = n.type;
  const action = n.data?.action;
  if (t === FLOW_GROUP_TYPE) return { w: 0, h: 0 };
  if (t === "branchDiamond" || action === "branch") return { w: 216, h: 216 };
  if (t === "startNode" || action === "start") return { w: 268, h: 152 };
  if (t === "endNode" || action === "end") return { w: 268, h: 152 };
  return { w: 292, h: 188 };
}

/** Узлы-шаги без автогенерируемых рамок групп. */
function stripGroupFrameNodes(nodeList) {
  return nodeList.filter((n) => n && n.type !== FLOW_GROUP_TYPE);
}

function computeGroupFrameNode(group, stepNodes) {
  const byId = new Map(stepNodes.map((n) => [n.id, n]));
  const ids = safeArray(group.nodeIds);
  if (!ids.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const id of ids) {
    const n = byId.get(id);
    if (!n) continue;
    any = true;
    const { w, h } = estimateNodeBBox(n);
    const x = Number(n.position?.x || 0);
    const y = Number(n.position?.y || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!any || !Number.isFinite(minX)) return null;
  const pos = snapPos16({ x: minX - GROUP_FRAME_PAD, y: minY - GROUP_FRAME_PAD });
  const gw = Math.max(200, Math.round(maxX - minX + 2 * GROUP_FRAME_PAD));
  const gh = Math.max(140, Math.round(maxY - minY + 2 * GROUP_FRAME_PAD));
  return {
    id: `__gf__${group.id}`,
    type: FLOW_GROUP_TYPE,
    position: pos,
    style: {
      width: gw,
      height: gh,
      zIndex: -1000,
    },
    zIndex: -1000,
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
    deletable: false,
    data: {
      groupId: group.id,
      label: group.title,
      color: group.color,
    },
  };
}

/** Рамки групп отрисовываются первыми (под шагами), не перекрывают блоки и линии. */
function withGroupFrameNodes(stepNodes, groupsList) {
  const steps = stripGroupFrameNodes(stepNodes).map((n) => {
    if (n.zIndex !== undefined && n.zIndex < 0) return n;
    return { ...n, zIndex: n.zIndex ?? 0 };
  });
  const frames = safeArray(groupsList)
    .map((g) => computeGroupFrameNode(g, steps))
    .filter(Boolean);
  return [...frames, ...steps];
}

/** Фон группы: под узлами, без перехвата мыши (линии и блоки сверху). */
function FlowGroupNode({ data }) {
  const color = String(data?.color || "#00d4aa");
  const label = String(data?.label || "Группа");
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        position: "relative",
        boxSizing: "border-box",
        borderRadius: 18,
        border: `2px dashed ${color}`,
        background: `${color}12`,
        pointerEvents: "none",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          position: "absolute",
          top: 10,
          left: 14,
          right: 10,
          fontSize: 11,
          fontWeight: 800,
          color,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          pointerEvents: "none",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          lineHeight: 1.2,
        },
      },
      label.slice(0, 120),
    ),
  );
}

/** Порядок шагов как при сохранении: start → … → end, внутри по stepRef. */
function compareNodeExecutionOrder(a, b) {
  const da = a.data || {};
  const db = b.data || {};
  const aStart = da.action === "start";
  const bStart = db.action === "start";
  const aEnd = da.action === "end";
  const bEnd = db.action === "end";
  if (aStart !== bStart) return aStart ? -1 : 1;
  if (aEnd !== bEnd) return aEnd ? 1 : -1;
  return Number(da.stepRef || 0) - Number(db.stepRef || 0);
}

function snapPos16(p) {
  return {
    x: Math.round(Number(p.x) / 16) * 16,
    y: Math.round(Number(p.y) / 16) * 16,
  };
}

/** Красивые строки колонок по порядку исполнения (колонки фиксированной ширины STEP_GAP_X). */
function layoutNodesInGrid(nodeList, cols = FLOW_GRID_COLS, origin = { x: 48, y: 48 }) {
  const sorted = [...nodeList].sort(compareNodeExecutionOrder);
  const posById = new Map();
  sorted.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    posById.set(
      n.id,
      snapPos16({
        x: origin.x + col * STEP_GAP_X,
        y: origin.y + row * STEP_GAP_Y,
      }),
    );
  });
  return nodeList.map((n) => ({
    ...n,
    position: posById.has(n.id) ? posById.get(n.id) : { ...n.position },
  }));
}

/** Упорядочить только выделенные в компактную сетку от левого верхнего угла их bounding box. */
function layoutSelectedNodesInGrid(allNodes, selectedIds, cols = FLOW_GRID_COLS) {
  if (!selectedIds.size) return allNodes;
  const sel = allNodes.filter((n) => selectedIds.has(n.id));
  if (!sel.length) return allNodes;
  const sorted = [...sel].sort(compareNodeExecutionOrder);
  const minX = Math.min(...sel.map((n) => n.position.x));
  const minY = Math.min(...sel.map((n) => n.position.y));
  const posById = new Map();
  sorted.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    posById.set(
      n.id,
      snapPos16({
        x: minX + col * STEP_GAP_X,
        y: minY + row * STEP_GAP_Y,
      }),
    );
  });
  return allNodes.map((n) => (posById.has(n.id) ? { ...n, position: posById.get(n.id) } : n));
}

/**
 * Слева направо по рёбрам kind=next (блок-схема). Узлы без входящего next — слева; висячие — справа.
 */
function layoutNodesFlowByNextEdges(nodeList, edgeList) {
  const byId = new Map(nodeList.map((n) => [n.id, n]));
  const nextEdges = edgeList.filter(
    (e) => (e?.data?.kind || "next") === "next" && e.source && e.target && byId.has(e.source) && byId.has(e.target),
  );
  const roots = nodeList.filter((n) => n.data?.action === "start");
  let seeds = roots.length ? roots : nodeList.filter((n) => !nextEdges.some((e) => e.target === n.id));
  if (!seeds.length && nodeList.length) seeds = [nodeList[0]];

  const level = new Map();
  seeds.forEach((r) => level.set(r.id, 0));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of nextEdges) {
      const ls = level.get(e.source);
      if (ls === undefined) continue;
      const cand = ls + 1;
      const t = e.target;
      if (!level.has(t) || level.get(t) < cand) {
        level.set(t, cand);
        changed = true;
      }
    }
  }
  const assigned = [...level.values()];
  const maxL = assigned.length ? Math.max(...assigned) : 0;
  const orphans = nodeList.filter((n) => !level.has(n.id)).sort(compareNodeExecutionOrder);
  orphans.forEach((n, i) => level.set(n.id, maxL + 1 + Math.floor(i / FLOW_GRID_COLS)));

  const byLevel = new Map();
  nodeList.forEach((n) => {
    const L = level.get(n.id) ?? 0;
    if (!byLevel.has(L)) byLevel.set(L, []);
    byLevel.get(L).push(n);
  });
  for (const arr of byLevel.values()) arr.sort(compareNodeExecutionOrder);

  const pos = new Map();
  [...byLevel.keys()]
    .sort((a, b) => a - b)
    .forEach((L) => {
      const arr = byLevel.get(L);
      arr.forEach((n, row) => {
        pos.set(n.id, snapPos16({ x: 48 + L * STEP_GAP_X, y: 48 + row * STEP_GAP_Y }));
      });
    });
  return nodeList.map((n) => ({ ...n, position: { ...(pos.get(n.id) || n.position) } }));
}

/** Как в расширении sidepanel.js */
const ACTION_LABELS = {
  start: "Начало",
  end: "Конец",
  click: "Клик",
  input: "Ввод",
  set_date: "Дата",
  file_upload: "Файл",
  wait: "Пауза",
  separator: "—",
  click_if_exists: "Клик если есть",
  branch: "Ветвление",
  assert: "Assert",
  navigate: "Переход",
  user_action: "Действие польз.",
  wait_for_element: "Ждать элемент",
};

const STEP_COLORS = [
  "#ff1744",
  "#ff9100",
  "#ffd600",
  "#76ff03",
  "#00e676",
  "#1de9b6",
  "#00b0ff",
  "#651fff",
  "#d500f9",
  "#ff4081",
];

const RUNNER_ACTIONS = [
  "start",
  "end",
  "click",
  "click_if_exists",
  "input",
  "set_date",
  "file_upload",
  "wait",
  "wait_for_element",
  "user_action",
  "assert",
  "branch",
  "navigate",
  "separator",
];

const BRANCH_CONDITIONS = [
  { value: "element_exists", label: "Элемент есть" },
  { value: "text_equals", label: "Текст равен" },
  { value: "text_contains", label: "Текст содержит" },
  { value: "url_equals", label: "URL равен" },
  { value: "url_contains", label: "URL содержит" },
  { value: "url_matches", label: "URL regex" },
  { value: "attribute_equals", label: "Атрибут равен" },
  { value: "count_equals", label: "Кол-во элементов" },
];

function toast(msg) {
  alert(msg);
}

/** Тело JSON для POST /api/scenarios — «Начало» + «Конец» (точка входа и явное завершение). */
function createEmptyScenarioPayload(displayName) {
  const now = new Date().toISOString();
  const trimmed = String(displayName || "").trim() || "Новый сценарий";
  return {
    name: trimmed,
    version: 1,
    exportedAt: now,
    smoke: false,
    labels: {},
    steps: [
      {
        step: 1,
        xpath: "—",
        action: "start",
        title: "Начало",
        params: { mandatory: true, stepColor: "#00e676", waitForLoad: false },
      },
      {
        step: 2,
        xpath: "—",
        action: "end",
        title: "Конец",
        params: { mandatory: true, stepColor: "#ff5252", waitForLoad: false },
      },
    ],
  };
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function deepClone(o) {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return {};
  }
}

function buildPreview(data) {
  const a = data.action;
  const p = data.params || {};
  if (a === "navigate") return String(p.url || "—");
  if (a === "input" || a === "set_date")
    return p.value != null && p.value !== "" ? String(p.value).slice(0, 72) : "";
  if (a === "wait") return `Пауза ${p.delayMs ?? 500} ms`;
  if (a === "user_action") return String(p.message || "Ожидание…").slice(0, 72);
  if (a === "separator") return String(p.label || p.title || "Разделитель").slice(0, 72);
  if (a === "start") return String(p.message || p.label || "Точка входа").slice(0, 72);
  if (a === "end") return String(p.message || p.label || "Конец").slice(0, 72);
  if (a === "branch" || a === "assert") {
    const cond =
      BRANCH_CONDITIONS.find((x) => x.value === p.condition)?.label || p.condition || "?";
    const ev = p.expectedValue != null && String(p.expectedValue) !== ""
      ? ` → "${String(p.expectedValue).slice(0, 40)}"`
      : "";
    return `${cond}${ev}`;
  }
  if (a === "file_upload") return String(p.fileName || "файл").slice(0, 72);
  const x = String(data.xpath || "").trim();
  const line = x.length > 90 ? `${x.slice(0, 90)}…` : x || "—";
  const qs = String(data.qaStatus || "").trim();
  if (qs === "draft") return `${line} · черновик`;
  if (qs === "flaky") return `${line} · flaky`;
  return line;
}

function nodeTypeForAction(action) {
  if (action === "branch") return "branchDiamond";
  if (action === "start") return "startNode";
  if (action === "end") return "endNode";
  return "scenarioStep";
}

function stepToNodeData(s) {
  const params = typeof s.params === "object" && s.params ? deepClone(s.params) : {};
  const stepColor = String(params.stepColor || STEP_COLORS[0]);
  const tags = safeArray(s.tags).map(String);
  let qaStatus = String(s.qaStatus || s.qa_status || "").trim().toLowerCase();
  if (!["draft", "stable", "flaky"].includes(qaStatus)) qaStatus = "";
  const data = {
    stepRef: Number(s.step || 0),
    title: String(s.title || ""),
    action: String(s.action || "click"),
    xpath: String(s.xpath || ""),
    comment: typeof s.comment === "string" ? s.comment : "",
    note: typeof s.note === "string" ? s.note : "",
    ticket: typeof s.ticket === "string" ? String(s.ticket) : "",
    qaStatus,
    tags,
    stepColor,
    params: { ...params, stepColor },
    preview: "",
  };
  data.preview = buildPreview(data);
  return data;
}

/** Единственная логическая точка входа сценария при выполнении. */
function StartNode({ data, selected }) {
  const accent = "#00e676";
  const note = (data.params?.message && String(data.params.message)) || (data.title && String(data.title)) || "";
  return React.createElement(
    "div",
    {
      className: "start-node" + (selected ? " start-node-selected" : ""),
      style: {
        minWidth: 220,
        maxWidth: 280,
        padding: "14px 16px",
        borderRadius: 14,
        border: `3px solid ${accent}`,
        background: "linear-gradient(165deg, #0d2818 0%, #0a0a14 100%)",
        boxShadow: selected
          ? "0 0 0 2px rgba(0,230,118,0.55), 0 8px 28px rgba(0,0,0,0.45)"
          : "0 6px 20px rgba(0,0,0,0.35)",
        color: "#eee",
        fontSize: 12,
      },
    },
    React.createElement(Handle, {
      type: "target",
      position: Position.Top,
      style: { background: "#2a2a4a", width: 8, height: 8, border: "none", opacity: 0.45 },
    }),
    React.createElement(
      "div",
      { style: { fontWeight: 900, fontSize: 11, color: accent, letterSpacing: "0.12em", marginBottom: 6 } },
      "СТАРТ",
    ),
    React.createElement(
      "div",
      { style: { fontWeight: 800, fontSize: 15, color: "#b9f6ca", lineHeight: 1.2 } },
      `Начало · #${data.stepRef || "?"}`,
    ),
    note
      ? React.createElement(
          "div",
          { style: { marginTop: 8, fontSize: 11, color: "#9aa0b4", lineHeight: 1.3 } },
          note.slice(0, 80),
        )
      : null,
    React.createElement(Handle, {
      type: "source",
      position: Position.Bottom,
      style: { background: accent, width: 11, height: 11, border: "2px solid #0f0f1a" },
    }),
  );
}

/** Завершение сценария (ветка «Конец» → стоп прогона). Только вход сверху. */
function EndNode({ data, selected }) {
  const accent = "#ff5252";
  const note = (data.params?.message && String(data.params.message)) || (data.title && String(data.title)) || "";
  return React.createElement(
    "div",
    {
      className: "end-node" + (selected ? " end-node-selected" : ""),
      style: {
        minWidth: 220,
        maxWidth: 280,
        padding: "14px 16px",
        borderRadius: 14,
        border: `3px solid ${accent}`,
        background: "linear-gradient(165deg, #321018 0%, #0a0a14 100%)",
        boxShadow: selected
          ? "0 0 0 2px rgba(255,82,82,0.55), 0 8px 28px rgba(0,0,0,0.45)"
          : "0 6px 20px rgba(0,0,0,0.35)",
        color: "#eee",
        fontSize: 12,
      },
    },
    React.createElement(Handle, {
      type: "target",
      position: Position.Top,
      style: { background: accent, width: 11, height: 11, border: "2px solid #0f0f1a" },
    }),
    React.createElement(
      "div",
      { style: { fontWeight: 900, fontSize: 11, color: accent, letterSpacing: "0.12em", marginBottom: 6 } },
      "СТОП",
    ),
    React.createElement(
      "div",
      { style: { fontWeight: 800, fontSize: 15, color: "#ffab91", lineHeight: 1.2 } },
      `Конец · #${data.stepRef || "?"}`,
    ),
    note
      ? React.createElement(
          "div",
          { style: { marginTop: 8, fontSize: 11, color: "#9aa0b4", lineHeight: 1.3 } },
          note.slice(0, 80),
        )
      : null,
  );
}

function ScenarioStepNode({ data, selected }) {
  const accent = data.stepColor || STEP_COLORS[0];
  const preview = buildPreview(data);
  const label = ACTION_LABELS[data.action] || data.action || "—";

  return React.createElement(
    "div",
    {
      className: "scenario-node" + (selected ? " scenario-node-selected" : ""),
      style: {
        minWidth: 240,
        maxWidth: 300,
        padding: "12px 14px",
        borderRadius: 12,
        border: `3px solid ${accent}`,
        background: "linear-gradient(165deg, #12121f 0%, #0a0a14 100%)",
        boxShadow: selected
          ? `0 0 0 2px rgba(0,212,170,0.55), 0 8px 28px rgba(0,0,0,0.45)`
          : "0 6px 20px rgba(0,0,0,0.35)",
        color: "#eee",
        fontSize: 12,
        lineHeight: 1.35,
      },
    },
    React.createElement(Handle, {
      type: "target",
      position: Position.Top,
      style: { background: accent, width: 10, height: 10, border: "none" },
    }),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        },
      },
      React.createElement(
        "span",
        {
          style: {
            fontWeight: 900,
            fontSize: 18,
            color: accent,
            letterSpacing: "-0.02em",
          },
        },
        `#${data.stepRef || "?"}`,
      ),
      React.createElement(
        "span",
        {
          style: {
            background: accent,
            color: "#000",
            padding: "4px 10px",
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 11,
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
        label,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          fontWeight: 700,
          fontSize: 13,
          marginBottom: 6,
          minHeight: 18,
          color: "#f0f0f0",
        },
      },
      data.title || "Без названия",
    ),
    React.createElement(
      "div",
      {
        style: {
          color: "#9aa0b4",
          fontSize: 11,
          maxHeight: 56,
          overflow: "hidden",
          wordBreak: "break-word",
        },
      },
      preview,
    ),
    (data.tags || []).length > 0
      ? React.createElement(
          "div",
          {
            style: {
              marginTop: 8,
              fontSize: 10,
              color: "#6b7280",
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            },
          },
          ...(data.tags || []).map((t) =>
            React.createElement(
              "span",
              {
                key: t,
                style: {
                  background: "rgba(0,212,170,0.12)",
                  color: "#7dd3c0",
                  padding: "2px 6px",
                  borderRadius: 4,
                },
              },
              t,
            ),
          ),
        )
      : null,
    React.createElement(Handle, {
      type: "source",
      position: Position.Bottom,
      style: { background: accent, width: 10, height: 10, border: "none" },
    }),
  );
}

/** Узел ветвления: ромб (классическая блок-схема). Выходы: справа = Да, снизу = Нет. */
function BranchDiamondNode({ data, selected }) {
  const accent = data.stepColor || "#ffd600";
  const preview = buildPreview(data);
  const box = 216;
  return React.createElement(
    "div",
    {
      className: "branch-diamond-node" + (selected ? " branch-diamond-selected" : ""),
      style: { position: "relative", width: box, height: box },
    },
    React.createElement(Handle, {
      type: "target",
      position: Position.Top,
      id: "branch-in",
      style: {
        top: 2,
        background: accent,
        width: 11,
        height: 11,
        border: "none",
      },
    }),
    React.createElement("div", {
      style: {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 122,
        height: 122,
        marginLeft: -61,
        marginTop: -61,
        transform: "rotate(45deg)",
        background: "linear-gradient(135deg, #1e1e32 0%, #12121f 100%)",
        border: `3px solid ${accent}`,
        borderRadius: 8,
        boxSizing: "border-box",
        boxShadow: selected
          ? "0 0 0 2px rgba(0,212,170,0.55), 0 8px 28px rgba(0,0,0,0.45)"
          : "0 6px 20px rgba(0,0,0,0.35)",
      },
    }),
    React.createElement(
      "div",
      {
        style: {
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          width: 100,
          pointerEvents: "none",
          zIndex: 1,
        },
      },
      React.createElement(
        "div",
        { style: { fontWeight: 900, fontSize: 16, color: accent, lineHeight: 1 } },
        `#${data.stepRef || "?"}`,
      ),
      React.createElement(
        "div",
        {
          style: {
            fontSize: 9,
            fontWeight: 800,
            color: "#00d4aa",
            marginTop: 6,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          },
        },
        "Условие",
      ),
      React.createElement(
        "div",
        {
          style: {
            fontSize: 10,
            fontWeight: 600,
            color: "#ececec",
            marginTop: 5,
            lineHeight: 1.25,
            maxHeight: 36,
            overflow: "hidden",
          },
        },
        (data.title || "—").slice(0, 44),
      ),
      React.createElement(
        "div",
        {
          style: {
            fontSize: 8,
            color: "#7a8299",
            marginTop: 4,
            lineHeight: 1.25,
            maxHeight: 30,
            overflow: "hidden",
          },
        },
        preview.slice(0, 48),
      ),
    ),
    React.createElement(Handle, {
      type: "source",
      position: Position.Right,
      id: "branch-yes",
      title: "Да (if)",
      style: {
        right: 0,
        background: "#2ecc71",
        width: 12,
        height: 12,
        border: "2px solid #0f0f1a",
      },
    }),
    React.createElement(Handle, {
      type: "source",
      position: Position.Bottom,
      id: "branch-no",
      title: "Нет (else)",
      style: {
        bottom: 0,
        background: "#e74c3c",
        width: 12,
        height: 12,
        border: "2px solid #0f0f1a",
      },
    }),
    /* Постоянные подписи выходов (не только на линии связи) */
    React.createElement(
      "div",
      {
        style: {
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          marginRight: 22,
          fontSize: 12,
          fontWeight: 800,
          color: "#2ecc71",
          pointerEvents: "none",
          zIndex: 2,
          letterSpacing: "0.04em",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
        },
      },
      "Да",
    ),
    React.createElement(
      "div",
      {
        style: {
          position: "absolute",
          left: "50%",
          bottom: 10,
          transform: "translateX(-50%)",
          marginBottom: 20,
          fontSize: 12,
          fontWeight: 800,
          color: "#e74c3c",
          pointerEvents: "none",
          zIndex: 2,
          letterSpacing: "0.04em",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
        },
      },
      "Нет",
    ),
  );
}

/** Прямоугольная рамка для зон / групп на схеме. */
function AnnotationRectNode({ data, selected }) {
  const stroke = data.stroke || "#00d4aa";
  const fill = data.fill || "rgba(0,212,170,0.07)";
  return React.createElement(
    "div",
    {
      className: "flow-annotation-rect" + (selected ? " flow-annotation-selected" : ""),
      style: {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        border: `2px dashed ${stroke}`,
        borderRadius: 10,
        background: fill,
        padding: 8,
        pointerEvents: "auto",
        position: "relative",
      },
    },
    React.createElement(NodeResizer, {
      isVisible: selected,
      minWidth: 40,
      minHeight: 32,
      color: stroke,
      lineClassName: "flow-ann-resize-line",
      handleClassName: "flow-ann-resize-handle",
    }),
    ...annotationConnectionHandles(stroke),
    data.label
      ? React.createElement(
          "div",
          {
            style: {
              fontSize: Math.min(13, Number(data.fontSize) || 13),
              fontWeight: 700,
              color: data.textColor || "#e8eaf6",
              lineHeight: 1.35,
              textShadow: "0 1px 2px rgba(0,0,0,0.85)",
            },
          },
          String(data.label).slice(0, 500),
        )
      : null,
  );
}

function AnnotationEllipseNode({ data, selected }) {
  const stroke = data.stroke || "#a78bfa";
  const fill = data.fill || "rgba(167,139,250,0.08)";
  return React.createElement(
    "div",
    {
      className: "flow-annotation-ellipse" + (selected ? " flow-annotation-selected" : ""),
      style: {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        border: `2px dashed ${stroke}`,
        borderRadius: "50%",
        background: fill,
        padding: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        pointerEvents: "auto",
        position: "relative",
      },
    },
    React.createElement(NodeResizer, {
      isVisible: selected,
      minWidth: 40,
      minHeight: 32,
      color: stroke,
      lineClassName: "flow-ann-resize-line",
      handleClassName: "flow-ann-resize-handle",
    }),
    ...annotationConnectionHandles(stroke),
    data.label
      ? React.createElement(
          "div",
          {
            style: {
              fontSize: Math.min(13, Number(data.fontSize) || 13),
              fontWeight: 700,
              color: data.textColor || "#e8eaf6",
              lineHeight: 1.3,
              maxWidth: "90%",
              textShadow: "0 1px 2px rgba(0,0,0,0.85)",
            },
          },
          String(data.label).slice(0, 300),
        )
      : null,
  );
}

/** Текстовая метка на канве. */
function AnnotationTextNode({ data, selected }) {
  const fs = Math.max(10, Number(data.fontSize) || 15);
  const hi = data.stroke || data.textColor || "#9aa0b4";
  return React.createElement(
    "div",
    {
      className: "flow-annotation-text" + (selected ? " flow-annotation-selected" : ""),
      style: {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: "4px 8px",
        borderRadius: 8,
        border: selected ? "2px solid #ffc857" : "1px solid rgba(255,255,255,0.12)",
        background: data.fill || "rgba(10,10,20,0.75)",
        color: data.textColor || "#f5f5ff",
        fontSize: fs,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        pointerEvents: "auto",
        position: "relative",
      },
    },
    React.createElement(NodeResizer, {
      isVisible: selected,
      minWidth: 120,
      minHeight: 36,
      color: hi,
      lineClassName: "flow-ann-resize-line",
      handleClassName: "flow-ann-resize-handle",
    }),
    ...annotationConnectionHandles(hi),
    String(data.label ?? "Текст"),
  );
}

const nodeTypesStatic = {
  scenarioStep: ScenarioStepNode,
  branchDiamond: BranchDiamondNode,
  startNode: StartNode,
  endNode: EndNode,
  flowGroup: FlowGroupNode,
  annotationRect: AnnotationRectNode,
  annotationEllipse: AnnotationEllipseNode,
  annotationText: AnnotationTextNode,
};

function buildInitialFlowFromSteps(steps) {
  const sorted = [...safeArray(steps)].sort((a, b) => Number(a.step) - Number(b.step));
  const nodes = sorted.map((s, idx) => {
    const d = stepToNodeData(s);
    return {
      id: `step-${s.step || idx + 1}`,
      type: nodeTypeForAction(d.action),
      position: {
        x: 40 + (idx % FLOW_GRID_COLS) * STEP_GAP_X,
        y: 40 + Math.floor(idx / FLOW_GRID_COLS) * STEP_GAP_Y,
      },
      data: d,
    };
  });

  const edges = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.push({
      id: `e-${nodes[i].id}-${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
      type: FLOW_EDGE_TYPE,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { kind: "next", label: "" },
    });
  }
  const merged = mergeBranchEdgesFromScenario(nodes, edges, sorted);
  return { nodes, edges: merged, groups: [] };
}

/** Рёбра Да/Нет только от branch/assert; «Да» на «Начало» даёт повтор navigate с корня. */
function sanitizeFlowEdges(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.filter((e) => {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) return false;
    if (edgeKindIsDecorate(e)) return true;
    const k = String(e?.data?.kind || "");
    const isYes = k === "yes" || e.sourceHandle === "branch-yes";
    const isNo = k === "no" || e.sourceHandle === "branch-no";
    if (isYes || isNo) {
      if (isAnnotationNode(tgt)) return false;
      const sa = src.data?.action;
      if (sa !== "branch" && sa !== "assert") return false;
      if (isYes && tgt.data?.action === "start") return false;
    }
    return true;
  });
}

/**
 * Каноника: шаги из `steps` (action, xpath, params.url, …).
 * У flow остаются позиции/комментарии по stepRef; id узлов — step-<номер шага>, рёбра перекодируются.
 */
function normalizeFlow(rawFlow, steps) {
  if (!rawFlow || typeof rawFlow !== "object") return buildInitialFlowFromSteps(steps);
  const sortedSteps = [...safeArray(steps)].sort((a, b) => Number(a.step) - Number(b.step));
  if (!sortedSteps.length) return buildInitialFlowFromSteps(steps);

  const rawNodes = safeArray(rawFlow.nodes);
  const oldToNewId = new Map();
  for (const n of rawNodes) {
    const oid = String(n.id || "");
    if (!oid) continue;
    const sr = Number(n.stepRef ?? 0);
    if (sr > 0) oldToNewId.set(oid, `step-${sr}`);
    else oldToNewId.set(oid, oid);
  }

  const byStepFlow = new Map(
    rawNodes.filter((n) => Number(n.stepRef) > 0).map((n) => [Number(n.stepRef), n]),
  );

  const nodes = sortedSteps.map((s, idx) => {
    const d = stepToNodeData(s);
    const nflow = byStepFlow.get(Number(s.step));
    if (nflow) {
      if (typeof nflow.comment === "string" && nflow.comment !== "") d.comment = nflow.comment;
      if (typeof nflow.note === "string" && nflow.note !== "") d.note = nflow.note;
      if (typeof nflow.ticket === "string" && nflow.ticket !== "") d.ticket = nflow.ticket;
      const qa = String(nflow.qaStatus || "").trim().toLowerCase();
      if (["draft", "stable", "flaky"].includes(qa)) d.qaStatus = qa;
      if (safeArray(nflow.tags).length) d.tags = safeArray(nflow.tags).map(String);
      const c = nflow.stepColor;
      if (c) {
        d.stepColor = String(c);
        d.params = { ...d.params, stepColor: String(c) };
      }
    }
    d.preview = buildPreview(d);
    const position = nflow
      ? {
          x: Number(nflow.position?.x ?? 40 + (idx % FLOW_GRID_COLS) * STEP_GAP_X),
          y: Number(nflow.position?.y ?? 40 + Math.floor(idx / FLOW_GRID_COLS) * STEP_GAP_Y),
        }
      : {
          x: 40 + (idx % FLOW_GRID_COLS) * STEP_GAP_X,
          y: 40 + Math.floor(idx / FLOW_GRID_COLS) * STEP_GAP_Y,
        };

    return {
      id: `step-${s.step}`,
      type: nodeTypeForAction(d.action),
      position,
      data: { ...d, stepRef: Number(s.step) },
    };
  });

  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const annFromFile = safeArray(rawFlow.annotations).map((a, i) => annotationSpecToNode(a, i));
  const fullNodeIdSet = new Set([...nodeIdSet, ...annFromFile.map((n) => n.id)]);

  let edges = safeArray(rawFlow.edges)
    .map((e, idx) => {
      const kind = String(e.kind || e?.data?.kind || "next");
      const labelRaw = e.label != null ? e.label : e?.data?.label;
      const labelStr = labelRaw != null && String(labelRaw).trim() !== "" ? String(labelRaw) : "";
      const def = decorateEdgeDataDefaults();
      const data =
        kind === "decorate"
          ? {
              kind: "decorate",
              label: labelStr,
              labelColor: String(e.labelColor ?? e.data?.labelColor ?? def.labelColor),
              labelOpacity: clamp01(e.labelOpacity ?? e.data?.labelOpacity ?? def.labelOpacity),
              labelBgColor: String(e.labelBgColor ?? e.data?.labelBgColor ?? def.labelBgColor),
              labelBgOpacity: clamp01(e.labelBgOpacity ?? e.data?.labelBgOpacity ?? def.labelBgOpacity),
            }
          : { kind, label: labelStr };
      return {
        id: String(e.id || `e-${idx + 1}`),
        source: oldToNewId.get(String(e.source)) || String(e.source || ""),
        target: oldToNewId.get(String(e.target)) || String(e.target || ""),
        sourceHandle: e.sourceHandle ? String(e.sourceHandle) : undefined,
        targetHandle: e.targetHandle ? String(e.targetHandle) : undefined,
        type: FLOW_EDGE_TYPE,
        markerEnd: { type: MarkerType.ArrowClosed },
        data,
      };
    })
    .filter((e) => e.source && e.target && fullNodeIdSet.has(e.source) && fullNodeIdSet.has(e.target));

  edges = sanitizeFlowEdges([...nodes, ...annFromFile], edges);

  const groups = safeArray(rawFlow.groups).map((g, idx) => ({
    id: String(g.id || `group-${idx + 1}`),
    title: String(g.title || `Group ${idx + 1}`),
    color: String(g.color || "#00d4aa"),
    nodeIds: safeArray(g.nodeIds)
      .map((x) => oldToNewId.get(String(x)) || String(x))
      .filter((id) => nodeIdSet.has(id)),
  }));

  const mergedEdges = mergeBranchEdgesFromScenario(nodes, edges, sortedSteps);
  const framed = withGroupFrameNodes(nodes, groups);
  const frames = framed.filter((n) => n.type === FLOW_GROUP_TYPE);
  const stepLayer = framed.filter((n) => n.type !== FLOW_GROUP_TYPE);
  return { nodes: [...frames, ...annFromFile, ...stepLayer], edges: mergedEdges, groups };
}

function toFlowPayload(nodes, edges, groups) {
  const stripped = stripGroupFrameNodes(nodes);
  const scenarioNodes = stripped.filter((n) => !isAnnotationNode(n));
  const annotationNodes = stripped.filter(isAnnotationNode);
  return {
    nodes: scenarioNodes.map((n) => {
      const d = n.data || {};
      return {
        id: n.id,
        stepRef: Number(d.stepRef || 0),
        position: { x: Number(n.position?.x || 0), y: Number(n.position?.y || 0) },
        title: String(d.title || ""),
        action: String(d.action || ""),
        xpath: String(d.xpath || ""),
        comment: String(d.comment || ""),
        note: String(d.note || ""),
        ticket: String(d.ticket || ""),
        qaStatus: String(d.qaStatus || ""),
        tags: safeArray(d.tags),
        stepColor: String(d.stepColor || d.params?.stepColor || STEP_COLORS[0]),
      };
    }),
    edges: edges.map((e) => {
      const kind = String(e?.data?.kind || "next");
      const row = {
        id: e.id,
        source: e.source,
        target: e.target,
        kind,
        label: String(e?.data?.label ?? "").trim(),
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      };
      if (edgeKindIsDecorate(e)) {
        const d = e.data || {};
        const def = decorateEdgeDataDefaults();
        row.labelColor = String(d.labelColor ?? def.labelColor);
        row.labelOpacity = clamp01(d.labelOpacity ?? def.labelOpacity);
        row.labelBgColor = String(d.labelBgColor ?? def.labelBgColor);
        row.labelBgOpacity = clamp01(d.labelBgOpacity ?? def.labelBgOpacity);
      }
      return row;
    }),
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
      nodeIds: safeArray(g.nodeIds),
    })),
    annotations: annotationsToPayload(annotationNodes),
  };
}

function linearEdgesForNodes(nodeList) {
  const sorted = [...nodeList].sort((a, b) => Number(a.data?.stepRef) - Number(b.data?.stepRef));
  const edges = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    edges.push({
      id: `e-${sorted[i].id}-${sorted[i + 1].id}`,
      source: sorted[i].id,
      target: sorted[i + 1].id,
      type: FLOW_EDGE_TYPE,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { kind: "next", label: "" },
    });
  }
  return edges;
}

function resolveNodeIdByStepTarget(nodes, target) {
  if (target == null || target === "") return null;
  const num = Number(target);
  if (!Number.isNaN(num) && num > 0) {
    const byRef = nodes.find((n) => Number(n.data?.stepRef) === num);
    if (byRef) return byRef.id;
  }
  const str = String(target);
  const byId = nodes.find((n) => n.id === str);
  if (byId) return byId.id;
  return null;
}

/** Добавляет рёбра Да/Нет из JSON сценария (nextStep / nextElseStep), если их ещё нет. */
function mergeBranchEdgesFromScenario(nodes, edges, steps) {
  const byId = nodeByIdFromList(nodes);
  const list = edges.map((e) => ({ ...e }));
  const hasYes = (src) => list.some((e) => e.source === src && edgeIsExecutableBranchYes(e, byId));
  const hasNo = (src) => list.some((e) => e.source === src && edgeIsExecutableBranchNo(e, byId));

  for (const s of safeArray(steps)) {
    if (s.action !== "branch") continue;
    const srcId = nodes.find((n) => Number(n.data?.stepRef) === Number(s.step))?.id;
    if (!srcId) continue;
    const p = s.params || {};
    const yesT = p.nextStep ?? p.next;
    const noT = p.nextElseStep ?? p.nextElse;
    const yesId = resolveNodeIdByStepTarget(nodes, yesT);
    const noId = resolveNodeIdByStepTarget(nodes, noT);

    if (yesId && !hasYes(srcId)) {
      list.push({
        id: `auto-yes-${s.step}-${yesId}-${Date.now()}`,
        source: srcId,
        target: yesId,
        sourceHandle: "branch-yes",
        type: FLOW_EDGE_TYPE,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { kind: "yes", label: "" },
      });
    }
    if (noId && !hasNo(srcId)) {
      list.push({
        id: `auto-no-${s.step}-${noId}-${Date.now()}`,
        source: srcId,
        target: noId,
        sourceHandle: "branch-no",
        type: FLOW_EDGE_TYPE,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { kind: "no", label: "" },
      });
    }
  }
  return list;
}

/** Визуализация: подписи и цвета для ветвей + выделение выбранной связи. */
function decorateFlowEdges(edgeList) {
  return edgeList.map((e) => {
    const k = e?.data?.kind || "next";
    const out = {
      ...e,
      type: e.type && e.type !== "smoothstep" ? e.type : FLOW_EDGE_TYPE,
      selectable: e.selectable !== false,
      deletable: e.deletable !== false,
      focusable: e.focusable !== false,
    };
    if (k === "yes") {
      out.label = "Да";
      out.labelStyle = { fill: "#2ecc71", fontSize: 11, fontWeight: 700 };
      out.style = { ...(e.style || {}), stroke: "#27ae60", strokeWidth: 2.2 };
    } else if (k === "no") {
      out.label = "Нет";
      out.labelStyle = { fill: "#e74c3c", fontSize: 11, fontWeight: 700 };
      out.style = { ...(e.style || {}), stroke: "#c0392b", strokeWidth: 2.2 };
    } else if (k === "decorate") {
      const dl = String(e.data?.label ?? "").trim();
      out.label = dl || undefined;
      const lc = String(e.data?.labelColor ?? "#e8e6d8");
      const lo = clamp01(e.data?.labelOpacity ?? 1);
      const lbc = String(e.data?.labelBgColor ?? "#1a1a2e");
      const lbo = clamp01(e.data?.labelBgOpacity ?? 0.88);
      out.labelStyle = { fill: lc, fontSize: 11, fontWeight: 600, opacity: lo };
      out.labelShowBg = lbo > 0.02;
      out.labelBgStyle = { fill: lbc, opacity: lbo };
      out.labelBgPadding = [4, 8];
      out.labelBgBorderRadius = 5;
      out.style = {
        ...(e.style || {}),
        stroke: "#b8a050",
        strokeWidth: 1.9,
        strokeDasharray: "7 5",
      };
    } else {
      const lbl = k === "next" ? "" : String(k);
      out.label = lbl;
      out.labelStyle = { fill: "#9aa0b4", fontSize: 10 };
      out.style = { ...(e.style || {}), stroke: "#4b5568", strokeWidth: 1.5 };
    }
    if (e.selected) {
      const sw = parseFloat(out.style?.strokeWidth) || 1.5;
      out.style = {
        ...out.style,
        stroke: "#00ffcc",
        strokeWidth: Math.max(sw, 3.8),
        filter: "drop-shadow(0 0 6px rgba(0,212,170,0.95))",
      };
      out.zIndex = 1000;
      if (k === "decorate") {
        out.labelStyle = { ...(out.labelStyle || {}), fontWeight: 800 };
        out.labelBgStyle = {
          ...(out.labelBgStyle || {}),
          outline: "1px solid rgba(0,255,204,0.65)",
        };
      } else {
        out.labelStyle = { ...(out.labelStyle || {}), fill: "#00ffcc", fontWeight: 800 };
      }
    }
    return out;
  });
}

function syncBranchParams(steps, flowNodes, flowEdges) {
  const stepToNode = new Map();
  const nodeToStep = new Map();
  const byId = nodeByIdFromList(flowNodes);
  for (const n of flowNodes) {
    const stepRef = Number(n?.data?.stepRef || 0);
    if (stepRef > 0) {
      stepToNode.set(stepRef, n.id);
      nodeToStep.set(n.id, stepRef);
    }
  }
  const outgoing = new Map();
  for (const e of flowEdges) {
    if (!e.source || !e.target) continue;
    const arr = outgoing.get(e.source) || [];
    arr.push(e);
    outgoing.set(e.source, arr);
  }

  return safeArray(steps).map((step) => {
    if (!step || step.action !== "branch") return step;
    const stepNo = Number(step.step || 0);
    const sourceNodeId = stepToNode.get(stepNo);
    if (!sourceNodeId) return step;

    const outEdges = outgoing.get(sourceNodeId) || [];
    const yesEdge = outEdges.find((e) => edgeIsExecutableBranchYes(e, byId));
    const noEdge = outEdges.find((e) => edgeIsExecutableBranchNo(e, byId));

    const yesNodeId = yesEdge?.target;
    const noNodeId = noEdge?.target;
    const yesStep = yesNodeId ? nodeToStep.get(yesNodeId) : null;
    const noStep = noNodeId ? nodeToStep.get(noNodeId) : null;

    const params = { ...(step.params || {}) };
    const yesTarget = yesNodeId ? flowNodes.find((n) => n.id === yesNodeId) : null;
    const noTarget = noNodeId ? flowNodes.find((n) => n.id === noNodeId) : null;
    /* Переход «Да» на start → повтор сценария с первого navigate */
    if (yesStep && yesTarget?.data?.action !== "start") {
      params.nextStep = Number(yesStep);
      if (yesNodeId) params.nextId = String(yesNodeId);
    } else {
      delete params.nextStep;
      delete params.nextId;
    }
    if (noStep && noTarget?.data?.action !== "start") {
      params.nextElseStep = Number(noStep);
      if (noNodeId) params.nextElseId = String(noNodeId);
    } else if (noStep) {
      /* ветка «Нет» ведёт на start — убираем, иначе повтор сценария */
      delete params.nextElseStep;
      delete params.nextElseId;
    }
    return { ...step, params };
  });
}

function nodesDataToSteps(nodes, prevSteps) {
  /* Примитивы разметки не входят в JSON steps. */
  const stepOnly = nodes.filter((n) => !isAnnotationNode(n));
  /* start — в начале списка, end — в конце; иначе точка входа/выхода веток ломает порядок шагов в JSON. */
  const sorted = [...stepOnly].sort((a, b) => {
    const da = a.data || {};
    const db = b.data || {};
    const aStart = da.action === "start";
    const bStart = db.action === "start";
    const aEnd = da.action === "end";
    const bEnd = db.action === "end";
    if (aStart !== bStart) return aStart ? -1 : 1;
    if (aEnd !== bEnd) return aEnd ? 1 : -1;
    return Number(da.stepRef || 0) - Number(db.stepRef || 0);
  });
  const prevByStep = new Map(safeArray(prevSteps).map((s) => [Number(s.step), s]));

  return sorted.map((n, i) => {
    const d = n.data || {};
    const stepNo = i + 1;
    const prev = prevByStep.get(Number(d.stepRef)) || {};
    const params = { ...(typeof prev.params === "object" ? deepClone(prev.params) : {}), ...(d.params || {}) };
    params.stepColor = d.stepColor || params.stepColor || STEP_COLORS[0];

    const next = {
      ...prev,
      step: stepNo,
      xpath: d.xpath !== undefined ? d.xpath : prev.xpath ?? "",
      action: d.action || prev.action || "click",
      title: d.title !== undefined ? d.title : prev.title || `Шаг ${stepNo}`,
      tags: safeArray(d.tags).length ? safeArray(d.tags) : safeArray(prev.tags),
      params,
    };
    if (d.comment !== undefined && d.comment !== "") next.comment = d.comment;
    else if (prev.comment) next.comment = prev.comment;
    if (d.note !== undefined && d.note !== "") next.note = d.note;
    else if (prev.note) next.note = prev.note;
    if (d.ticket !== undefined && d.ticket !== "") next.ticket = d.ticket;
    else if (prev.ticket) next.ticket = prev.ticket;
    const q = String(d.qaStatus || "").trim().toLowerCase();
    if (["draft", "stable", "flaky"].includes(q)) next.qaStatus = q;
    else if (prev.qaStatus) next.qaStatus = prev.qaStatus;
    if (next.xpath === undefined || next.xpath === null) next.xpath = "";
    if (
      next.action === "navigate" ||
      next.action === "user_action" ||
      next.action === "separator" ||
      next.action === "start" ||
      next.action === "end"
    ) {
      if (!next.xpath || next.xpath === "") next.xpath = "—";
    }
    return next;
  });
}

/** Кнопки палитры в тулбаре / инспекторе. */
function annotationToolbarSwatches(colors, selectedIndex, onPickIndex) {
  return colors.map((c, i) =>
    React.createElement("button", {
      key: i,
      type: "button",
      title: c,
      onClick: () => onPickIndex(i),
      style: {
        width: 22,
        height: 22,
        borderRadius: 6,
        border: selectedIndex === i ? "2px solid #fff" : "1px solid #2a2a4a",
        background: c,
        padding: 0,
        cursor: "pointer",
        flexShrink: 0,
      },
    }),
  );
}

function App() {
  const nodeTypes = useMemo(() => nodeTypesStatic, []);

  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenario, setScenario] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [canvasSearch, setCanvasSearch] = useState("");
  const [historyItems, setHistoryItems] = useState([]);
  const [historyPick, setHistoryPick] = useState("");
  /** Режим рисования примитива мышью: rect | ellipse | text */
  const [annotationDrawTool, setAnnotationDrawTool] = useState(null);
  /** Координаты рамки выделения в clientX/Y для превью */
  const [rubberBandClient, setRubberBandClient] = useState(null);
  /** Индексы палитры для новых фигур (панель над канвой) */
  const [annNewStrokeI, setAnnNewStrokeI] = useState(0);
  const [annNewFillI, setAnnNewFillI] = useState(0);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const groupsRef = useRef(groups);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const refreshGroupFrames = useCallback(() => {
    setNodes((prev) => {
      const { annotations, steps } = partitionStrippedNodes(prev);
      return withGroupFrameNodes([...annotations, ...steps], groupsRef.current);
    });
  }, [setNodes]);

  /** Экземпляр React Flow из onInit — для вставки примитивов в центр видимой области. */
  const reactFlowInstanceRef = useRef(null);
  const flowHostRef = useRef(null);
  const annStylePickRef = useRef({ si: 0, fi: 0 });
  const drawToolRef = useRef(null);

  useEffect(() => {
    annStylePickRef.current = { si: annNewStrokeI, fi: annNewFillI };
  }, [annNewStrokeI, annNewFillI]);
  useEffect(() => {
    drawToolRef.current = annotationDrawTool;
  }, [annotationDrawTool]);

  const selectedNodesCount = useMemo(
    () => nodes.filter((n) => n.selected && n.type !== FLOW_GROUP_TYPE).length,
    [nodes],
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) || null,
    [edges, selectedEdgeId],
  );
  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) || null,
    [scenarios, selectedScenarioId],
  );

  const loadScenarios = useCallback(async () => {
    try {
      const r = await fetch(`${API_ORIGIN}/api/scenarios`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load scenarios");
      setScenarios(j.scenarios || []);
    } catch (e) {
      toast(`Ошибка загрузки сценариев: ${e?.message || e}`);
    }
  }, []);

  const loadHistoryList = useCallback(async (id) => {
    if (!id) {
      setHistoryItems([]);
      return;
    }
    try {
      const r = await fetch(`${API_ORIGIN}/api/scenarios/${id}/history`);
      const j = await r.json();
      setHistoryItems(j.history || []);
    } catch {
      setHistoryItems([]);
    }
  }, []);

  const loadScenario = useCallback(
    async (id) => {
      if (!id) return;
      setLoading(true);
      try {
        const r = await fetch(`${API_ORIGIN}/api/scenarios/${id}`);
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "Failed to load scenario");
        const srcRaw = j.scenario || {};
        const lbl = typeof srcRaw.labels === "object" && srcRaw.labels ? srcRaw.labels : {};
        const src = {
          ...srcRaw,
          smoke: srcRaw.smoke === true,
          labels: lbl,
          labelsText: JSON.stringify(lbl, null, 2),
        };
        const flow = normalizeFlow(src.flow, src.steps || []);
        setScenario(src);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setGroups(flow.groups);
        const firstStepNode = flow.nodes.find(
          (n) => n && n.type !== FLOW_GROUP_TYPE && !isAnnotationNode(n),
        );
        setSelectedEdgeId("");
        setSelectedNodeId(firstStepNode?.id || "");
        setSelectedGroupId("");
        setHistoryPick("");
        await loadHistoryList(id);
      } catch (e) {
        toast(`Ошибка загрузки сценария: ${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    },
    [setEdges, setNodes, loadHistoryList],
  );

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);
  useEffect(() => {
    if (selectedScenarioId) loadScenario(selectedScenarioId);
  }, [selectedScenarioId, loadScenario]);

  const createScenario = useCallback(async () => {
    const name = window.prompt("Имя нового сценария:", "Новый сценарий");
    if (name === null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      toast("Укажите непустое имя.");
      return;
    }
    try {
      const body = createEmptyScenarioPayload(trimmed);
      const r = await fetch(`${API_ORIGIN}/api/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Не удалось создать");
      const newId = j.scenario?.id;
      await loadScenarios();
      if (newId) setSelectedScenarioId(newId);
      toast("Сценарий создан (файл на диске). Можно добавлять шаги и сохранять.");
    } catch (e) {
      toast(`Ошибка создания: ${e?.message || e}`);
    }
  }, [loadScenarios]);

  const cloneScenario = useCallback(async () => {
    if (!selectedScenarioId) {
      toast("Выберите сценарий для клонирования.");
      return;
    }
    const srcLabel = scenario?.name || selectedScenario?.name || selectedScenarioId;
    const name = window.prompt("Имя копии сценария:", `${srcLabel} (копия)`);
    if (name === null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      toast("Укажите непустое имя.");
      return;
    }
    try {
      const r0 = await fetch(`${API_ORIGIN}/api/scenarios/${selectedScenarioId}`);
      const j0 = await r0.json();
      if (!j0.ok) throw new Error(j0.error || "Не удалось прочитать сценарий");
      const data = deepClone(j0.scenario || {});
      delete data.id;
      data.name = trimmed;
      data.exportedAt = new Date().toISOString();
      const r = await fetch(`${API_ORIGIN}/api/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Не удалось сохранить копию");
      const newId = j.scenario?.id;
      await loadScenarios();
      if (newId) setSelectedScenarioId(newId);
      toast("Сценарий склонирован в новый файл.");
    } catch (e) {
      toast(`Ошибка клонирования: ${e?.message || e}`);
    }
  }, [selectedScenarioId, scenario, selectedScenario, loadScenarios]);

  const deleteScenario = useCallback(async () => {
    if (!selectedScenarioId) return;
    const label = selectedScenario?.name || scenario?.name || selectedScenarioId;
    if (
      !window.confirm(
        `Удалить сценарий «${label}»?\nФайл ${selectedScenarioId}.json будет удалён с диска (без отката).`,
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`${API_ORIGIN}/api/scenarios/${selectedScenarioId}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Не удалось удалить");
      setSelectedScenarioId("");
      setScenario(null);
      setNodes([]);
      setEdges([]);
      setGroups([]);
      setSelectedNodeId("");
      setSelectedGroupId("");
      await loadScenarios();
      toast("Сценарий удалён.");
    } catch (e) {
      toast(`Ошибка удаления: ${e?.message || e}`);
    }
  }, [selectedScenarioId, selectedScenario, scenario, loadScenarios, setNodes, setEdges]);

  const refreshNodePreview = useCallback((list) => {
    return list.map((n) => ({
      ...n,
      data: { ...n.data, preview: buildPreview(n.data) },
    }));
  }, []);

  const onConnect = useCallback(
    (connection) => {
      const srcN = nodesRef.current.find((x) => x.id === connection.source);
      const tgtN = nodesRef.current.find((x) => x.id === connection.target);
      const id = `e-${connection.source}-${connection.target}-${Date.now()}`;
      if (isAnnotationNode(srcN) || isAnnotationNode(tgtN)) {
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id,
              type: FLOW_EDGE_TYPE,
              markerEnd: { type: MarkerType.ArrowClosed },
              data: { ...decorateEdgeDataDefaults() },
            },
            eds,
          ),
        );
        return;
      }
      const src = srcN;
      let kind = "next";
      if (src && (src.type === "branchDiamond" || src.data?.action === "branch")) {
        if (connection.sourceHandle === "branch-yes") kind = "yes";
        else if (connection.sourceHandle === "branch-no") kind = "no";
      }
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id,
            type: FLOW_EDGE_TYPE,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { kind, label: "" },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const onSelectionChange = useCallback(({ nodes: selectedFlowNodes, edges: selectedFlowEdges }) => {
    const eLast =
      selectedFlowEdges?.length > 0
        ? selectedFlowEdges[selectedFlowEdges.length - 1]?.id ?? ""
        : "";
    const nLast =
      selectedFlowNodes?.length > 0
        ? selectedFlowNodes[selectedFlowNodes.length - 1]?.id ?? ""
        : "";
    setSelectedEdgeId(eLast);
    if (eLast) setSelectedNodeId("");
    else setSelectedNodeId(nLast);
  }, []);

  const updateSelectedDecorateEdge = useCallback(
    (patch) => {
      if (!selectedEdgeId) return;
      setEdges((eds) =>
        eds.map((e) =>
          e.id !== selectedEdgeId
            ? e
            : {
                ...e,
                data: {
                  ...e.data,
                  ...(patch.label !== undefined ? { label: String(patch.label) } : {}),
                  ...(patch.labelColor !== undefined ? { labelColor: String(patch.labelColor) } : {}),
                  ...(patch.labelOpacity !== undefined ? { labelOpacity: clamp01(patch.labelOpacity) } : {}),
                  ...(patch.labelBgColor !== undefined ? { labelBgColor: String(patch.labelBgColor) } : {}),
                  ...(patch.labelBgOpacity !== undefined ? { labelBgOpacity: clamp01(patch.labelBgOpacity) } : {}),
                },
              },
        ),
      );
    },
    [selectedEdgeId, setEdges],
  );

  const layoutGridAll = useCallback(() => {
    setNodes((prev) => {
      const { annotations, steps } = partitionStrippedNodes(prev);
      const laid = layoutNodesInGrid(steps, FLOW_GRID_COLS);
      return refreshNodePreview(withGroupFrameNodes([...annotations, ...laid], groupsRef.current));
    });
  }, [setNodes, refreshNodePreview]);

  const layoutGridSelection = useCallback(() => {
    setNodes((prev) => {
      const ids = new Set(
        prev
          .filter(
            (n) => n.selected && n.type !== FLOW_GROUP_TYPE && !isAnnotationNode(n),
          )
          .map((n) => n.id),
      );
      if (!ids.size) {
        toast("Выделите шаги сценария: рамкой или Shift+клик (примитивы разметки не выравниваются).");
        return prev;
      }
      const { annotations, steps } = partitionStrippedNodes(prev);
      const laid = layoutSelectedNodesInGrid(steps, ids, FLOW_GRID_COLS);
      return refreshNodePreview(withGroupFrameNodes([...annotations, ...laid], groupsRef.current));
    });
  }, [setNodes, refreshNodePreview]);

  const layoutFlowByNextEdges = useCallback(() => {
    setNodes((prev) => {
      const { annotations, steps } = partitionStrippedNodes(prev);
      const laid = layoutNodesFlowByNextEdges(steps, edgesRef.current);
      return refreshNodePreview(withGroupFrameNodes([...annotations, ...laid], groupsRef.current));
    });
  }, [setNodes, refreshNodePreview]);

  const updateSelectedNodeData = useCallback(
    (patch) => {
      if (!selectedNodeId) return;
      setNodes((prev) =>
        refreshNodePreview(
          prev.map((n) => {
            if (n.id !== selectedNodeId) return n;
            if (isAnnotationNode(n)) {
              const d0 = n.data || {};
              const nextData = { ...d0 };
              if (patch.annLabel !== undefined) nextData.label = String(patch.annLabel);
              if (patch.stroke !== undefined) nextData.stroke = String(patch.stroke);
              if (patch.annFill !== undefined) nextData.fill = String(patch.annFill);
              if (patch.annFontSize !== undefined) {
                const fs = Number(patch.annFontSize);
                nextData.fontSize = fs > 0 ? fs : d0.fontSize;
              }
              if (patch.annTextColor !== undefined) nextData.textColor = String(patch.annTextColor);
              let style = { ...(n.style || {}) };
              if (patch.annWidth !== undefined) {
                const w = Math.max(40, Number(patch.annWidth) || 80);
                style = { ...style, width: w };
              }
              if (patch.annHeight !== undefined) {
                const h = Math.max(32, Number(patch.annHeight) || 40);
                style = { ...style, height: h };
              }
              return { ...n, data: nextData, style };
            }
            const nextParams = patch.params !== undefined ? { ...n.data.params, ...patch.params } : n.data.params;
            const next = { ...n, data: { ...n.data, ...patch, params: nextParams } };
            if (patch.stepColor != null) next.data.params = { ...next.data.params, stepColor: patch.stepColor };
            if (patch.action !== undefined) next.type = nodeTypeForAction(patch.action);
            return next;
          }),
        ),
      );
    },
    [selectedNodeId, setNodes, refreshNodePreview],
  );

  const addGroup = useCallback(() => {
    const id = `group-${Date.now()}`;
    setGroups((prev) => [...prev, { id, title: "Новая группа", color: "#00d4aa", nodeIds: [] }]);
    setSelectedGroupId(id);
  }, []);

  const updateGroup = useCallback((groupId, patch) => {
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g));
      setNodes((p) => withGroupFrameNodes(stripGroupFrameNodes(p), next));
      return next;
    });
  }, [setNodes]);

  const deleteGroup = useCallback(
    (groupId) => {
      setGroups((prev) => {
        const next = prev.filter((g) => g.id !== groupId);
        setNodes((p) => withGroupFrameNodes(stripGroupFrameNodes(p), next));
        return next;
      });
      if (selectedGroupId === groupId) setSelectedGroupId("");
    },
    [selectedGroupId, setNodes],
  );

  const assignNodeToSelectedGroup = useCallback(() => {
    if (!selectedGroupId) return;
    const ids = nodes
      .filter((n) => n.selected && n.type !== FLOW_GROUP_TYPE && !isAnnotationNode(n))
      .map((n) => n.id);
    if (!ids.length && selectedNodeId) {
      const sel = nodes.find((x) => x.id === selectedNodeId);
      if (sel && !isAnnotationNode(sel) && sel.type !== FLOW_GROUP_TYPE) ids.push(selectedNodeId);
    }
    if (!ids.length) return;
    setGroups((prev) => {
      const next = prev.map((g) => {
        if (g.id !== selectedGroupId) return g;
        const set = new Set(g.nodeIds || []);
        ids.forEach((id) => set.add(id));
        return { ...g, nodeIds: [...set] };
      });
      setNodes((p) => withGroupFrameNodes(stripGroupFrameNodes(p), next));
      return next;
    });
  }, [nodes, selectedNodeId, selectedGroupId, setNodes]);

  const removeNodeFromGroup = useCallback(
    (groupId, nodeId) => {
      setGroups((prev) => {
        const next = prev.map((g) =>
          g.id === groupId ? { ...g, nodeIds: (g.nodeIds || []).filter((x) => x !== nodeId) } : g,
        );
        setNodes((p) => withGroupFrameNodes(stripGroupFrameNodes(p), next));
        return next;
      });
    },
    [setNodes],
  );

  const saveScenario = useCallback(async () => {
    if (!selectedScenarioId || !scenario) return;
    try {
      const stepNodesOnly = stripGroupFrameNodes(nodes);
      let steps = nodesDataToSteps(stepNodesOnly, scenario.steps);
      steps = syncBranchParams(steps, stepNodesOnly, edges);
      const startBlocks = steps.filter((s) => s.action === "start");
      if (startBlocks.length === 0) {
        toast("Добавьте один шаг «Начало» (action: start) — точка входа при выполнении. Сохранение отменено.");
        return;
      }
      if (startBlocks.length > 1) {
        toast(
          "В сценарии несколько блоков «Начало». Web-runner возьмёт первый по порядку в списке шагов.",
        );
      }
      const currentFlow = toFlowPayload(nodes, edges, groups);
      let labelsObj = {};
      try {
        if (scenario.labelsText != null && String(scenario.labelsText).trim()) {
          labelsObj = JSON.parse(String(scenario.labelsText));
        } else if (scenario.labels && typeof scenario.labels === "object") {
          labelsObj = scenario.labels;
        }
      } catch {
        toast("Некорректный JSON в «Метки сценария» — исправьте или очистите.");
        return;
      }
      const payload = {
        ...scenario,
        id: selectedScenarioId,
        steps,
        flow: currentFlow,
        smoke: !!scenario.smoke,
        labels: labelsObj,
        exportedAt: new Date().toISOString(),
      };
      delete payload.labelsText;
      const r = await fetch(`${API_ORIGIN}/api/scenarios/${selectedScenarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      setScenario({ ...payload, labelsText: JSON.stringify(labelsObj || {}, null, 2) });
      const flow = normalizeFlow(currentFlow, steps);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      if (j.validationWarnings && j.validationWarnings.length) {
        toast(`Сохранено. Предупреждения: ${j.validationWarnings.slice(0, 4).join(" · ")}`);
      } else {
        toast("Сценарий сохранен");
      }
      loadScenarios();
    } catch (e) {
      toast(`Ошибка сохранения: ${e?.message || e}`);
    }
  }, [selectedScenarioId, scenario, nodes, edges, groups, loadScenarios, setNodes, setEdges]);

  const restoreFromHistory = useCallback(
    async (file) => {
      if (!selectedScenarioId || !file) return;
      if (
        !window.confirm(
          `Восстановить версию «${file}»? Текущий файл будет предварительно снимком в .history.`,
        )
      ) {
        return;
      }
      try {
        const r = await fetch(`${API_ORIGIN}/api/scenarios/${selectedScenarioId}/restore-history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "restore failed");
        toast("Версия восстановлена");
        setHistoryPick("");
        await loadScenario(selectedScenarioId);
      } catch (e) {
        toast(`Ошибка восстановления: ${e?.message || e}`);
      }
    },
    [selectedScenarioId, loadScenario],
  );

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        saveScenario();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [saveScenario]);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") {
        setAnnotationDrawTool(null);
        setRubberBandClient(null);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  useEffect(() => {
    if (!annotationDrawTool || !scenario) return;
    const host = flowHostRef.current;
    if (!host) return;

    let active = false;
    let startClient = null;

    const toFlow = (cx, cy) => {
      const inst = reactFlowInstanceRef.current;
      if (!inst?.screenToFlowPosition) return { x: 0, y: 0 };
      return inst.screenToFlowPosition({ x: cx, y: cy });
    };

    const onDown = (ev) => {
      const tool = drawToolRef.current;
      if (!tool || ev.button !== 0) return;
      if (!host.contains(ev.target)) return;
      if (ev.target.closest(".react-flow__minimap")) return;
      if (ev.target.closest(".react-flow__controls")) return;
      if (ev.target.closest(".react-flow__panel")) return;
      if (!ev.target.closest(".react-flow__pane")) return;
      ev.preventDefault();
      ev.stopPropagation();
      active = true;
      startClient = { x: ev.clientX, y: ev.clientY };
      setRubberBandClient({
        x1: startClient.x,
        y1: startClient.y,
        x2: startClient.x,
        y2: startClient.y,
      });
    };

    const onMove = (ev) => {
      if (!active || !startClient) return;
      setRubberBandClient({
        x1: startClient.x,
        y1: startClient.y,
        x2: ev.clientX,
        y2: ev.clientY,
      });
    };

    const onUp = (ev) => {
      if (!active || !startClient) return;
      active = false;
      const cx2 = ev.clientX;
      const cy2 = ev.clientY;
      setRubberBandClient(null);
      const tool = drawToolRef.current;
      const inst = reactFlowInstanceRef.current;
      if (!tool || !inst?.screenToFlowPosition) {
        startClient = null;
        return;
      }

      let p0 = toFlow(Math.min(startClient.x, cx2), Math.min(startClient.y, cy2));
      let p1 = toFlow(Math.max(startClient.x, cx2), Math.max(startClient.y, cy2));
      let w = p1.x - p0.x;
      let h = p1.y - p0.y;
      const minW = tool === "text" ? 120 : 48;
      const minH = tool === "text" ? 40 : 48;
      if (w < minW) {
        const pad = (minW - w) / 2;
        p0 = { x: p0.x - pad, y: p0.y };
        w = minW;
      }
      if (h < minH) {
        const pad = (minH - h) / 2;
        p0 = { x: p0.x, y: p0.y - pad };
        h = minH;
      }

      const pos = snapPos16({ x: p0.x, y: p0.y });
      const fw = Math.max(minW, Math.round(w / 16) * 16 || minW);
      const fh = Math.max(minH, Math.round(h / 16) * 16 || minH);

      const { si, fi } = annStylePickRef.current;
      const stroke = ANNOTATION_STROKE_SWATCHES[si] ?? ANNOTATION_STROKE_SWATCHES[0];
      const fill = ANNOTATION_FILL_SWATCHES[fi] ?? ANNOTATION_FILL_SWATCHES[0];
      const ak = tool === "ellipse" ? "ellipse" : tool === "text" ? "text" : "rect";

      const spec = {
        id: `ann-${Date.now()}`,
        kind: ak,
        x: pos.x,
        y: pos.y,
        width: fw,
        height: fh,
        label: ak === "text" ? "Подпись" : "",
        stroke,
        fill,
        fontSize: ak === "text" ? 15 : 13,
        textColor: stroke,
      };
      const node = annotationSpecToNode(spec, 0);
      setNodes((prevNodes) => {
        const { annotations, steps } = partitionStrippedNodes(prevNodes);
        return refreshNodePreview(withGroupFrameNodes([...annotations, ...steps, node], groupsRef.current));
      });
      setSelectedEdgeId("");
      setSelectedNodeId(node.id);
      startClient = null;
    };

    host.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      host.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [annotationDrawTool, scenario, setNodes, refreshNodePreview]);

  const addStepBlock = useCallback(() => {
    if (!scenario) {
      toast("Выберите сценарий");
      return;
    }
    const { annotations, steps } = partitionStrippedNodes(nodes);
    const maxRef = steps.reduce((m, n) => Math.max(m, Number(n.data?.stepRef || 0)), 0);
    const nextRef = maxRef + 1;
    const baseX = 80 + (steps.length % FLOW_GRID_COLS) * STEP_GAP_X;
    const baseY = 80 + Math.floor(steps.length / FLOW_GRID_COLS) * STEP_GAP_Y;
    const prev =
      selectedNode && selectedNode.type !== FLOW_GROUP_TYPE && !isAnnotationNode(selectedNode)
        ? selectedNode
        : steps[steps.length - 1];
    const pos = prev
      ? { x: (prev.position?.x || 0) + 40, y: (prev.position?.y || 0) + STEP_GAP_Y * 0.45 }
      : { x: baseX, y: baseY };

    const newNode = {
      id: `step-${nextRef}-${Date.now()}`,
      type: "scenarioStep",
      position: pos,
      data: stepToNodeData({
        step: nextRef,
        xpath: "",
        action: "click",
        title: `Новый шаг ${nextRef}`,
        tags: [],
        params: { mandatory: true, stepColor: STEP_COLORS[nextRef % STEP_COLORS.length] },
      }),
    };
    newNode.data.stepRef = nextRef;

    setNodes((prevNodes) => {
      const { annotations: a2, steps: s2 } = partitionStrippedNodes(prevNodes);
      return refreshNodePreview(withGroupFrameNodes([...a2, ...s2, newNode], groupsRef.current));
    });
    setSelectedNodeId(newNode.id);
  }, [scenario, nodes, selectedNode, setNodes, refreshNodePreview]);

  const deleteSelectedBlock = useCallback(() => {
    if (!scenario) return;
    const stripped = stripGroupFrameNodes(nodes);
    const toRemove = new Set(stripped.filter((n) => n.selected).map((n) => n.id));
    if (!toRemove.size && selectedNodeId && stripped.some((n) => n.id === selectedNodeId)) {
      toRemove.add(selectedNodeId);
    }
    if (!toRemove.size) return;

    const removedNodes = stripped.filter((n) => toRemove.has(n.id));
    const onlyAnnotationsRemoved = removedNodes.length > 0 && removedNodes.every(isAnnotationNode);

    const survivorsAll = stripped.filter((n) => !toRemove.has(n.id));
    if (survivorsAll.length === stripped.length) return;

    const { annotations: survAnn, steps: survSteps } = partitionStrippedNodes(survivorsAll);

    if (onlyAnnotationsRemoved) {
      const idSet = new Set(survivorsAll.map((n) => n.id));
      setEdges((eds) => eds.filter((e) => idSet.has(e.source) && idSet.has(e.target)));
      setSelectedEdgeId("");
      setGroups((prev) => {
        const next = prev.map((g) => ({
          ...g,
          nodeIds: (g.nodeIds || []).filter((id) => !toRemove.has(id)),
        }));
        setNodes(refreshNodePreview(withGroupFrameNodes(survivorsAll, next)));
        return next;
      });
      setSelectedNodeId(survSteps[0]?.id || survAnn[0]?.id || "");
      return;
    }

    if (survSteps.length === 0) {
      if (survAnn.length === 0) {
        setNodes([]);
        setEdges([]);
        setScenario({ ...scenario, steps: [] });
        setGroups([]);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        return;
      }
      const annOnlyIds = new Set(survAnn.map((n) => n.id));
      setGroups([]);
      setScenario({ ...scenario, steps: [] });
      setEdges((eds) => eds.filter((e) => annOnlyIds.has(e.source) && annOnlyIds.has(e.target)));
      setNodes(refreshNodePreview(withGroupFrameNodes(survAnn, [])));
      setSelectedEdgeId("");
      setSelectedNodeId(survAnn[0]?.id || "");
      return;
    }

    const sortedSurvivors = [...survSteps].sort(
      (a, b) => Number(a.data.stepRef) - Number(b.data.stepRef),
    );
    const newSteps = nodesDataToSteps(sortedSurvivors, scenario.steps);
    const newNodes = newSteps.map((s, i) => ({
      id: `step-${s.step}`,
      type: nodeTypeForAction(s.action),
      position: sortedSurvivors[i].position,
      data: stepToNodeData(s),
    }));

    setGroups((prev) => {
      const next = prev.map((g) => ({
        ...g,
        nodeIds: (g.nodeIds || []).filter((id) => !toRemove.has(id)),
      }));
      setNodes(refreshNodePreview(withGroupFrameNodes([...survAnn, ...newNodes], next)));
      return next;
    });
    const mergedIds = new Set([...survAnn, ...newNodes].map((n) => n.id));
    const keptDecor = edges.filter(
      (e) => edgeKindIsDecorate(e) && mergedIds.has(e.source) && mergedIds.has(e.target),
    );
    setEdges([...linearEdgesForNodes(newNodes), ...keptDecor]);
    setSelectedEdgeId("");
    setScenario({ ...scenario, steps: newSteps });
    setSelectedNodeId(newNodes[0]?.id || "");
  }, [selectedNodeId, scenario, nodes, edges, setNodes, setEdges, refreshNodePreview]);

  const duplicateSelectedBlock = useCallback(() => {
    if (!selectedNodeId || !scenario) return;
    const stripped = stripGroupFrameNodes(nodes);
    const src = stripped.find((n) => n.id === selectedNodeId);
    if (!src) return;

    if (isAnnotationNode(src)) {
      const d = src.data || {};
      const kind =
        d.annKind ||
        (src.type === "annotationText" ? "text" : src.type === "annotationEllipse" ? "ellipse" : "rect");
      const st = src.style || {};
      const w = typeof st.width === "number" ? st.width : parseInt(String(st.width || 280), 10) || 280;
      const h = typeof st.height === "number" ? st.height : parseInt(String(st.height || 140), 10) || 140;
      const copy = annotationSpecToNode(
        {
          id: `ann-${Date.now()}`,
          kind,
          x: (src.position?.x || 0) + 48,
          y: (src.position?.y || 0) + 48,
          width: w,
          height: h,
          label: d.label != null ? String(d.label) : "",
          stroke: d.stroke,
          fill: d.fill,
          fontSize: d.fontSize,
          textColor: d.textColor,
        },
        0,
      );
      setNodes((prev) => {
        const { annotations, steps } = partitionStrippedNodes(prev);
        return refreshNodePreview(withGroupFrameNodes([...annotations, ...steps, copy], groupsRef.current));
      });
      setSelectedNodeId(copy.id);
      return;
    }

    const d = src.data || {};
    const maxRef = stripped
      .filter((n) => !isAnnotationNode(n))
      .reduce((m, n) => Math.max(m, Number(n.data?.stepRef || 0)), 0);
    const nextRef = maxRef + 1;
    const dupStep = {
      step: nextRef,
      xpath: d.xpath != null ? String(d.xpath) : "",
      action: d.action || "click",
      title: `${d.title || "Шаг"} (копия)`,
      tags: [...safeArray(d.tags)],
      params: deepClone(d.params || {}),
      note: d.note != null ? String(d.note) : "",
      ticket: d.ticket != null ? String(d.ticket) : "",
      qaStatus: d.qaStatus || "",
    };
    if (d.comment) dupStep.comment = d.comment;
    const dupData = stepToNodeData(dupStep);
    const newNode = {
      id: `step-${nextRef}-${Date.now()}`,
      type: nodeTypeForAction(dupData.action),
      position: { x: (src.position?.x || 0) + 50, y: (src.position?.y || 0) + 40 },
      data: dupData,
    };
    newNode.data.stepRef = nextRef;

    setNodes((prev) => {
      const { annotations, steps } = partitionStrippedNodes(prev);
      return refreshNodePreview(
        withGroupFrameNodes([...annotations, ...steps, newNode], groupsRef.current),
      );
    });
    setSelectedNodeId(newNode.id);
  }, [selectedNodeId, scenario, nodes, setNodes, refreshNodePreview]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const nodesForCanvas = useMemo(() => {
    const q = canvasSearch.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.map((n) => {
      if (n.type === FLOW_GROUP_TYPE) return n;
      const d0 = n.data || {};
      const hay = [
        String(d0.title || ""),
        String(d0.action || ""),
        String(d0.xpath || ""),
        String(d0.comment || ""),
        String(d0.note || ""),
        String(d0.ticket || ""),
        String(d0.qaStatus || ""),
        ...safeArray(d0.tags).map(String),
        String(d0.stepRef || ""),
        ...(isAnnotationNode(n) ? [String(d0.label || "")] : []),
      ]
        .join(" ")
        .toLowerCase();
      const hit = hay.includes(q);
      if (!hit) return n;
      return {
        ...n,
        style: {
          ...(n.style || {}),
          outline: "2px solid #ffc857",
          boxShadow: "0 0 14px rgba(255,200,87,0.4)",
        },
      };
    });
  }, [nodes, canvasSearch]);

  const d = selectedNode?.data;
  const params = d?.params || {};

  return React.createElement(
    "div",
    { className: "app" },
    React.createElement(
      "section",
      { className: "panel" },
      React.createElement("h1", { className: "title" }, "Flow Editor"),
      React.createElement(
        "div",
        { className: "row" },
        React.createElement("a", { className: "btn2", href: `${API_ORIGIN}/` }, "← Web Runner"),
        React.createElement(
          "button",
          { className: "btn2", type: "button", onClick: loadScenarios },
          "↻ Сценарии",
        ),
      ),
      React.createElement(
        "p",
        { className: "hint" },
        "Блоки = шаги сценария: цвет, тип действия и params как в расширении.",
      ),
      React.createElement(
        "div",
        { className: "row", style: { marginTop: 8, flexWrap: "wrap", gap: 8 } },
        React.createElement(
          "button",
          { type: "button", className: "btn", disabled: loading, onClick: createScenario },
          "➕ Новый…",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: loading || !selectedScenarioId,
            onClick: cloneScenario,
          },
          "📄 Клонировать…",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: loading || !selectedScenarioId,
            onClick: deleteScenario,
            title: "Удалить JSON с диска",
            style: { color: "#e74c3c", borderColor: "#c0392b" },
          },
          "🗑 Удалить",
        ),
      ),
      React.createElement(
        "div",
        { className: "scenarioList" },
        scenarios.length === 0
          ? React.createElement(
              "div",
              { className: "hint", style: { lineHeight: 1.55 } },
              "① Нажмите «➕ Новый…» · ② перетащите и соедините шаги · ③ сохраните Ctrl+S. Файлы из расширения появятся в tests/scenarios/ → «↻ Сценарии».",
            )
          : scenarios.map((s) =>
              React.createElement(
                "div",
                {
                  key: s.id,
                  className: `item ${selectedScenarioId === s.id ? "sel" : ""}`,
                  onClick: () => setSelectedScenarioId(s.id),
                },
                React.createElement(
                  "div",
                  null,
                  (s.name || s.file || s.id) + (s.smoke ? " · smoke" : ""),
                ),
                React.createElement(
                  "div",
                  { className: "small" },
                  `${s.file} • ${s.stepsCount} шагов`,
                ),
              ),
            ),
      ),
      scenario && selectedScenarioId
        ? React.createElement(
            React.Fragment,
            { key: "meta" },
            React.createElement(
              "label",
              { className: "small", style: { display: "block", marginTop: 14 } },
              "Имя сценария (name)",
            ),
            React.createElement("input", {
              value: scenario.name != null ? String(scenario.name) : "",
              placeholder: selectedScenarioId,
              onChange: (e) =>
                setScenario((prev) => (prev ? { ...prev, name: e.target.value } : null)),
            }),
            React.createElement(
              "p",
              { className: "small", style: { marginTop: 4, lineHeight: 1.35 } },
              `Файл на диске: `,
              React.createElement("code", null, `${selectedScenarioId}.json`),
              " — id файла не меняется. Сохраните, чтобы записать новое имя.",
            ),
            React.createElement(
              "label",
              { className: "checkrow", style: { display: "flex", marginTop: 10, alignItems: "center", gap: 8 } },
              React.createElement("input", {
                type: "checkbox",
                checked: !!scenario.smoke,
                onChange: (e) => setScenario((prev) => (prev ? { ...prev, smoke: e.target.checked } : null)),
              }),
              " Дымовой сценарий (smoke) — для быстрых наборов в раннере",
            ),
            React.createElement(
              "label",
              { className: "small", style: { display: "block", marginTop: 8 } },
              "Метки сценария (JSON → runner / отчёты), поле labels",
            ),
            React.createElement("textarea", {
              value: scenario.labelsText != null ? String(scenario.labelsText) : "{}",
              placeholder: '{"suite":"regression","team":"qa"}',
              style: { minHeight: 72, fontFamily: "ui-monospace, monospace", fontSize: 12 },
              onChange: (e) => setScenario((prev) => (prev ? { ...prev, labelsText: e.target.value } : null)),
            }),
            React.createElement(
              "label",
              { className: "small", style: { display: "block", marginTop: 10 } },
              "Версии из .history",
            ),
            React.createElement(
              "div",
              { className: "row", style: { alignItems: "center" } },
              React.createElement(
                "select",
                {
                  value: historyPick,
                  onChange: (e) => setHistoryPick(e.target.value),
                  style: { flex: 1 },
                },
                React.createElement("option", { value: "" }, "— выберите снимок —"),
                ...historyItems.map((h) =>
                  React.createElement(
                    "option",
                    { key: h.file, value: h.file },
                    `${h.file} · ${new Date((h.mtime || 0) * 1000).toLocaleString()}`,
                  ),
                ),
              ),
              React.createElement(
                "button",
                { type: "button", className: "btn2", disabled: !historyPick, onClick: () => restoreFromHistory(historyPick) },
                "Восстановить",
              ),
            ),
          )
        : null,
      React.createElement(
        "div",
        { className: "row", style: { marginTop: 12 } },
        React.createElement(
          "button",
          {
            className: "btn",
            type: "button",
            disabled: !selectedScenarioId || loading,
            onClick: saveScenario,
          },
          loading ? "…" : "💾 Сохранить",
        ),
      ),
      selectedScenario
        ? React.createElement(
            "p",
            { className: "hint" },
            `В списке: ${selectedScenario.name || selectedScenario.id}`,
          )
        : null,
    ),

    React.createElement(
      "section",
      { className: "panel panel-flow" },
      React.createElement(
        "div",
        { className: "flow-toolbar row" },
        React.createElement("input", {
          type: "search",
          placeholder: "Поиск: шаг, действие, XPath, тег…",
          value: canvasSearch,
          onChange: (e) => setCanvasSearch(e.target.value),
          style: { flex: "1 1 200px", minWidth: 140, maxWidth: 320 },
        }),
        React.createElement(
          "button",
          {
            type: "button",
            className: annotationDrawTool === "rect" ? "btn2 flow-tool-on" : "btn2",
            disabled: !scenario,
            onClick: () => {
              if (!scenario) {
                toast("Выберите сценарий");
                return;
              }
              setAnnotationDrawTool((t) => (t === "rect" ? null : "rect"));
            },
            title: "Нарисовать рамку на схеме (ЛКМ тянуть). Повторный клик или Esc — выход.",
          },
          "▭ Рамка",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: annotationDrawTool === "ellipse" ? "btn2 flow-tool-on" : "btn2",
            disabled: !scenario,
            onClick: () => {
              if (!scenario) {
                toast("Выберите сценарий");
                return;
              }
              setAnnotationDrawTool((t) => (t === "ellipse" ? null : "ellipse"));
            },
            title: "Нарисовать овал мышью.",
          },
          "○ Овал",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: annotationDrawTool === "text" ? "btn2 flow-tool-on" : "btn2",
            disabled: !scenario,
            onClick: () => {
              if (!scenario) {
                toast("Выберите сценарий");
                return;
              }
              setAnnotationDrawTool((t) => (t === "text" ? null : "text"));
            },
            title: "Нарисовать область текстовой метки мышью.",
          },
          "T Текст",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: !scenario,
            onClick: addStepBlock,
            title: "Добавить шаг после выбранного (связь от выбранного)",
          },
          "➕ Добавить",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: !selectedNodeId || !scenario || selectedNodesCount > 1,
            onClick: duplicateSelectedBlock,
            title: "Копировать один выбранный узел",
          },
          "📋 Копировать",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: (!selectedNodeId && selectedNodesCount === 0) || !scenario,
            onClick: deleteSelectedBlock,
            title: "Удалить выделенные узлы (или один активный)",
          },
          "🗑 Удалить",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: !scenario || nodes.length === 0,
            onClick: layoutGridAll,
            title: "Сетка 2×N: шаги дальше друг от друга + связи кривыми (simplebezier), порядок start → stepRef → end",
          },
          "📐 Сетка (все)",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: !scenario,
            onClick: layoutGridSelection,
            title: "Компактная сетка только для выделенных",
          },
          "📐 Сетка (выделенные)",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn2",
            disabled: !scenario || nodes.length === 0,
            onClick: layoutFlowByNextEdges,
            title: "Слои слева направо по связям next (от start или без входящих next)",
          },
          "↔ По next",
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "btn",
            disabled: !selectedScenarioId || loading,
            onClick: saveScenario,
          },
          "💾 Сохранить",
        ),
      ),
      annotationDrawTool && scenario
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "p",
              { className: "hint", style: { marginTop: 8, marginBottom: 0 } },
              "Тяните указатель на пустом месте схемы. Панорама в этом режиме — средняя кнопка мыши или правая. Esc — отмена режима.",
            ),
            React.createElement(
              "div",
              { className: "row", style: { alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" } },
              React.createElement("span", { className: "small" }, "Линия новых:"),
              ...annotationToolbarSwatches(ANNOTATION_STROKE_SWATCHES, annNewStrokeI, setAnnNewStrokeI),
            ),
            React.createElement(
              "div",
              { className: "row", style: { alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" } },
              React.createElement("span", { className: "small" }, "Заливка новых:"),
              ...annotationToolbarSwatches(ANNOTATION_FILL_SWATCHES, annNewFillI, setAnnNewFillI),
            ),
          )
        : null,
      React.createElement(
        "div",
        { className: "flowHost", ref: flowHostRef, style: { position: "relative" } },
        rubberBandClient
          ? (() => {
              const el = flowHostRef.current;
              const br = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
              const l = Math.min(rubberBandClient.x1, rubberBandClient.x2) - br.left;
              const t = Math.min(rubberBandClient.y1, rubberBandClient.y2) - br.top;
              const bw = Math.abs(rubberBandClient.x2 - rubberBandClient.x1);
              const bh = Math.abs(rubberBandClient.y2 - rubberBandClient.y1);
              return React.createElement("div", {
                key: "rubber",
                className: "flow-draw-rubber",
                style: {
                  position: "absolute",
                  left: l,
                  top: t,
                  width: bw,
                  height: bh,
                  border: "2px dashed #00ffcc",
                  background: "rgba(0,255,204,0.07)",
                  pointerEvents: "none",
                  zIndex: 12,
                  borderRadius: annotationDrawTool === "ellipse" ? "50%" : 8,
                  boxSizing: "border-box",
                },
              });
            })()
          : null,
        React.createElement(
          ReactFlow,
          {
            nodes: nodesForCanvas,
            edges: decorateFlowEdges(edges),
            nodeTypes,
            onNodesChange,
            onEdgesChange,
            onConnect,
            onInit: (inst) => {
              reactFlowInstanceRef.current = inst;
            },
            onPaneClick: () => {
              if (annotationDrawTool) return;
              setSelectedNodeId("");
              setSelectedEdgeId("");
            },
            onNodeDragStop: refreshGroupFrames,
            onSelectionChange,
            selectionOnDrag: !annotationDrawTool,
            panOnDrag: annotationDrawTool ? [2] : [1, 2],
            panActivationKeyCode: "Space",
            multiSelectionKeyCode: "Shift",
            edgesSelectable: true,
            onNodesDelete: (deleted) => {
              if (!deleted?.length) return;
              const ids = new Set(deleted.map((n) => n.id));
              if (ids.has(selectedNodeId)) setSelectedNodeId("");
            },
            onEdgesDelete: (deleted) => {
              if (!deleted?.length) return;
              const ids = new Set(deleted.map((e) => e.id));
              if (ids.has(selectedEdgeId)) setSelectedEdgeId("");
            },
            deleteKeyCode: ["Backspace", "Delete"],
            edgesFocusable: true,
            nodesConnectable: true,
            elementsSelectable: true,
            fitView: true,
            minZoom: 0.2,
            maxZoom: 1.5,
            snapToGrid: true,
            snapGrid: [16, 16],
            zoomOnScroll: true,
            panOnScroll: false,
            defaultEdgeOptions: {
              type: FLOW_EDGE_TYPE,
              markerEnd: { type: MarkerType.ArrowClosed },
              selectable: true,
              deletable: true,
              focusable: true,
              style: { stroke: "#4b5568", strokeWidth: 1.5 },
              labelStyle: { fill: "#9aa0b4", fontSize: 10 },
            },
            proOptions: { hideAttribution: true },
          },
          React.createElement(Background, { gap: 16, size: 1, color: "#2a2a4a" }),
          React.createElement(MiniMap, {
            style: { backgroundColor: "#0a0a14", border: "1px solid #2a2a4a", borderRadius: 8 },
            maskColor: "rgba(10, 10, 20, 0.92)",
            nodeColor: (n) => {
              const raw = nodes.find((x) => x.id === n.id);
              if (!raw) return "#16213e";
              if (isAnnotationNode(raw)) return raw.data?.stroke || "#5b6478";
              return raw.data?.stepColor || "#16213e";
            },
            nodeStrokeColor: "#00d4aa",
          }),
          React.createElement(Controls, null),
        ),
      ),
    ),

    React.createElement(
      "section",
      { className: "panel" },
      React.createElement(
        "h2",
        { className: "title", style: { fontSize: 14 } },
        selectedEdge && edgeKindIsDecorate(selectedEdge)
          ? "Связь (только схема)"
          : selectedNode && isAnnotationNode(selectedNode)
            ? "Разметка канвы"
            : "Свойства шага",
      ),
      selectedEdge && edgeKindIsDecorate(selectedEdge)
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement("div", { className: "small" }, `Связь: ${selectedEdge.id}`),
            React.createElement(
              "p",
              { className: "hint" },
              "Пунктир и подпись только на схеме. На выполнение сценария не влияет (в JSON: kind «decorate» в flow.edges).",
            ),
            React.createElement("label", null, "Подпись на стрелке"),
            React.createElement("textarea", {
              value: String(selectedEdge.data?.label ?? ""),
              placeholder: "Например: зона регресса",
              style: { minHeight: 52 },
              onChange: (e) => updateSelectedDecorateEdge({ label: e.target.value }),
            }),
            (() => {
              const dd = selectedEdge.data || {};
              const def = decorateEdgeDataDefaults();
              const lc = /^#[0-9a-fA-F]{6}$/.test(String(dd.labelColor || "")) ? dd.labelColor : def.labelColor;
              const lbc = /^#[0-9a-fA-F]{6}$/.test(String(dd.labelBgColor || ""))
                ? dd.labelBgColor
                : def.labelBgColor;
              const loPct = Math.round(clamp01(dd.labelOpacity ?? def.labelOpacity) * 100);
              const lboPct = Math.round(clamp01(dd.labelBgOpacity ?? def.labelBgOpacity) * 100);
              return React.createElement(
                React.Fragment,
                null,
                React.createElement("label", { style: { marginTop: 10 } }, "Цвет текста подписи"),
                React.createElement("input", {
                  type: "color",
                  value: lc,
                  onChange: (e) => updateSelectedDecorateEdge({ labelColor: e.target.value }),
                }),
                React.createElement("label", null, `Прозрачность текста: ${loPct}%`),
                React.createElement("input", {
                  type: "range",
                  min: 0,
                  max: 100,
                  step: 1,
                  value: loPct,
                  onChange: (e) =>
                    updateSelectedDecorateEdge({ labelOpacity: parseInt(e.target.value, 10) / 100 }),
                }),
                React.createElement("label", null, "Цвет фона подписи"),
                React.createElement("input", {
                  type: "color",
                  value: lbc,
                  onChange: (e) => updateSelectedDecorateEdge({ labelBgColor: e.target.value }),
                }),
                React.createElement("label", null, `Прозрачность фона: ${lboPct}%`),
                React.createElement("input", {
                  type: "range",
                  min: 0,
                  max: 100,
                  step: 1,
                  value: lboPct,
                  onChange: (e) =>
                    updateSelectedDecorateEdge({ labelBgOpacity: parseInt(e.target.value, 10) / 100 }),
                }),
              );
            })(),
          )
        : selectedNodesCount > 1
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "p",
              { className: "small" },
              `Выбрано узлов: ${selectedNodesCount}. Панель свойств — для одного узла (кликните по нему один раз). Можно выровнять позиции кнопкой «📐 Сетка (выделенные)» или удалить все «🗑 Удалить».`,
            ),
          )
        : selectedNode
          ? isAnnotationNode(selectedNode)
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement("div", { className: "small" }, `Элемент: ${selectedNode.id}`),
                React.createElement(
                  "p",
                  { className: "hint" },
                  "Визуальная разметка: не шаг сценария, сохраняется в flow.annotations. Размер — мышью за маркеры на контуре выделенного примитива. Стрелки разметки — от точек по периметру.",
                ),
                React.createElement("label", null, "Подпись"),
                React.createElement("textarea", {
                  value: String(selectedNode.data?.label ?? ""),
                  style: { minHeight: 64 },
                  onChange: (e) => updateSelectedNodeData({ annLabel: e.target.value }),
                }),
                React.createElement("label", null, "Ширина (px)"),
                React.createElement("input", {
                  type: "number",
                  value: (() => {
                    const st = selectedNode.style || {};
                    const w = st.width;
                    return typeof w === "number" ? w : parseInt(String(w || 280), 10) || 280;
                  })(),
                  min: 40,
                  onChange: (e) =>
                    updateSelectedNodeData({ annWidth: parseInt(e.target.value, 10) || 40 }),
                }),
                React.createElement("label", null, "Высота (px)"),
                React.createElement("input", {
                  type: "number",
                  value: (() => {
                    const st = selectedNode.style || {};
                    const h = st.height;
                    return typeof h === "number" ? h : parseInt(String(h || 140), 10) || 140;
                  })(),
                  min: 32,
                  onChange: (e) =>
                    updateSelectedNodeData({ annHeight: parseInt(e.target.value, 10) || 32 }),
                }),
                React.createElement("label", null, "Обводка"),
                React.createElement(
                  "div",
                  { className: "row", style: { gap: 4, flexWrap: "wrap" } },
                  ...ANNOTATION_STROKE_SWATCHES.map((c) =>
                    React.createElement("button", {
                      key: `s-${c}`,
                      type: "button",
                      title: c,
                      onClick: () => updateSelectedNodeData({ stroke: c }),
                      style: {
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border:
                          String(selectedNode.data?.stroke || "") === c
                            ? "2px solid #fff"
                            : "1px solid #2a2a4a",
                        background: c,
                        padding: 0,
                        cursor: "pointer",
                      },
                    }),
                  ),
                ),
                React.createElement("label", { style: { marginTop: 8 } }, "Заливка"),
                React.createElement(
                  "div",
                  { className: "row", style: { gap: 4, flexWrap: "wrap" } },
                  ...ANNOTATION_FILL_SWATCHES.map((c) =>
                    React.createElement("button", {
                      key: `f-${c}`,
                      type: "button",
                      title: c,
                      onClick: () => updateSelectedNodeData({ annFill: c }),
                      style: {
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border:
                          String(selectedNode.data?.fill || "") === c
                            ? "2px solid #fff"
                            : "1px solid #2a2a4a",
                        background: c,
                        padding: 0,
                        cursor: "pointer",
                      },
                    }),
                  ),
                ),
                React.createElement("label", null, "Размер шрифта"),
                React.createElement("input", {
                  type: "number",
                  value: Number(selectedNode.data?.fontSize) > 0 ? Number(selectedNode.data.fontSize) : 13,
                  min: 8,
                  max: 64,
                  onChange: (e) =>
                    updateSelectedNodeData({ annFontSize: parseInt(e.target.value, 10) || 13 }),
                }),
                React.createElement("label", null, "Цвет текста"),
                React.createElement(
                  "div",
                  { className: "row", style: { gap: 4, flexWrap: "wrap" } },
                  ...ANNOTATION_STROKE_SWATCHES.map((c) =>
                    React.createElement("button", {
                      key: `t-${c}`,
                      type: "button",
                      title: c,
                      onClick: () => updateSelectedNodeData({ annTextColor: c }),
                      style: {
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border:
                          String(selectedNode.data?.textColor || "") === c
                            ? "2px solid #fff"
                            : "1px solid #2a2a4a",
                        background: c,
                        padding: 0,
                        cursor: "pointer",
                      },
                    }),
                  ),
                ),
              )
            : React.createElement(
                React.Fragment,
                null,
                React.createElement("div", { className: "small" }, `Узел: ${selectedNode.id}`),
            React.createElement(
              "div",
              { className: "small" },
              `Номер (после сохранения перенумеруется по порядку блоков): ${selectedNode?.data?.stepRef || "-"}`,
            ),
            React.createElement("label", null, "Название (title)"),
            React.createElement("input", {
              value: d.title || "",
              onChange: (e) => updateSelectedNodeData({ title: e.target.value }),
            }),
            React.createElement("label", null, "Тип (action)"),
            React.createElement(
              "select",
              {
                value: d.action || "click",
                onChange: (e) => updateSelectedNodeData({ action: e.target.value }),
              },
              ...RUNNER_ACTIONS.map((a) =>
                React.createElement("option", { key: a, value: a }, `${ACTION_LABELS[a] || a} (${a})`),
              ),
            ),
            React.createElement("label", null, "Цвет шага (params.stepColor)"),
            React.createElement(
              "div",
              { className: "row", style: { flexWrap: "wrap", gap: 6 } },
              ...STEP_COLORS.map((c) =>
                React.createElement("button", {
                  key: c,
                  type: "button",
                  title: c,
                  onClick: () => updateSelectedNodeData({ stepColor: c, params: { stepColor: c } }),
                  style: {
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border:
                      (d.stepColor === c || params.stepColor === c) ? "2px solid #fff" : "1px solid #2a2a4a",
                    background: c,
                    cursor: "pointer",
                  },
                }),
              ),
            ),
            React.createElement("label", null, "Теги (через запятую)"),
            React.createElement("input", {
              value: (d.tags || []).join(", "),
              onChange: (e) =>
                updateSelectedNodeData({
                  tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                }),
            }),
            React.createElement("label", null, "Описание для QA (note)"),
            React.createElement("textarea", {
              value: d.note || "",
              placeholder: "Зачем этот шаг, что проверяем",
              style: { minHeight: 56 },
              onChange: (e) => updateSelectedNodeData({ note: e.target.value }),
            }),
            React.createElement("label", null, "Тикет / ссылка (ticket)"),
            React.createElement("input", {
              value: d.ticket || "",
              placeholder: "JIRA-123 или URL спеки",
              onChange: (e) => updateSelectedNodeData({ ticket: e.target.value }),
            }),
            React.createElement("label", null, "Статус шага (qaStatus)"),
            React.createElement(
              "select",
              {
                value: d.qaStatus || "",
                onChange: (e) => updateSelectedNodeData({ qaStatus: e.target.value }),
              },
              React.createElement("option", { value: "" }, "— не задан —"),
              React.createElement("option", { value: "draft" }, "Черновик"),
              React.createElement("option", { value: "stable" }, "Стабильный"),
              React.createElement("option", { value: "flaky" }, "Flaky"),
            ),
            d.action !== "start" && d.action !== "end"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "XPath"),
                  React.createElement("textarea", {
                    value: d.xpath === "—" ? "" : d.xpath || "",
                    placeholder: "—",
                    onChange: (e) => updateSelectedNodeData({ xpath: e.target.value || "" }),
                  }),
                )
              : null,
            React.createElement("label", null, "Комментарий к блоку"),
            React.createElement("textarea", {
              value: d.comment || "",
              onChange: (e) => updateSelectedNodeData({ comment: e.target.value }),
            }),
            React.createElement(
              "div",
              { className: "row", style: { marginTop: 8 } },
              React.createElement("label", { className: "checkrow" }, React.createElement("input", {
                type: "checkbox",
                checked: params.mandatory !== false,
                onChange: (e) => updateSelectedNodeData({ params: { mandatory: e.target.checked } }),
              }), " mandatory"),
              React.createElement("label", { className: "checkrow" }, React.createElement("input", {
                type: "checkbox",
                checked: !!params.waitForLoad,
                onChange: (e) => updateSelectedNodeData({ params: { waitForLoad: e.target.checked } }),
              }), " waitForLoad"),
            ),
            React.createElement("label", null, "timeoutMs"),
            React.createElement("input", {
              type: "number",
              value: params.timeoutMs ?? "",
              placeholder: "по умолчанию из раннера",
              onChange: (e) => {
                const v = e.target.value;
                updateSelectedNodeData({ params: v === "" ? { timeoutMs: undefined } : { timeoutMs: parseInt(v, 10) || 0 } });
              },
            }),
            d.action === "navigate"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "URL (navigate.params.url)"),
                  React.createElement("input", {
                    value: params.url || "",
                    onChange: (e) => updateSelectedNodeData({ params: { url: e.target.value } }),
                  }),
                )
              : null,
            ["input", "set_date"].includes(d.action)
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Значение (value)"),
                  React.createElement("input", {
                    value: params.value ?? "",
                    onChange: (e) => updateSelectedNodeData({ params: { value: e.target.value } }),
                  }),
                )
              : null,
            d.action === "wait"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Задержка delayMs"),
                  React.createElement("input", {
                    type: "number",
                    value: params.delayMs ?? 500,
                    onChange: (e) =>
                      updateSelectedNodeData({ params: { delayMs: parseInt(e.target.value, 10) || 0 } }),
                  }),
                )
              : null,
            d.action === "user_action"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Сообщение пользователю"),
                  React.createElement("input", {
                    value: params.message || "",
                    onChange: (e) => updateSelectedNodeData({ params: { message: e.target.value } }),
                  }),
                )
              : null,
            d.action === "start"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Подпись (в лог раннера, params.message)"),
                  React.createElement("input", {
                    value: params.message || "",
                    placeholder: "например: основной сценарий",
                    onChange: (e) => updateSelectedNodeData({ params: { message: e.target.value } }),
                  }),
                  React.createElement(
                    "p",
                    { className: "small", style: { marginTop: 6 } },
                    "Выполнение всегда начинается с этого блока (первый start в сохранённом списке шагов).",
                  ),
                )
              : null,
            d.action === "end"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Подпись (в лог раннера, params.message)"),
                  React.createElement("input", {
                    value: params.message || "",
                    placeholder: "например: выход по ветке «Нет»",
                    onChange: (e) => updateSelectedNodeData({ params: { message: e.target.value } }),
                  }),
                  React.createElement(
                    "p",
                    { className: "small", style: { marginTop: 6 } },
                    "После этого шага прогон сценария останавливается. Соединяйте сюда ветку «Нет» или любой завершающий путь.",
                  ),
                )
              : null,
            d.action === "separator"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Подпись разделителя (params.label)"),
                  React.createElement("input", {
                    value: params.label || "",
                    onChange: (e) => updateSelectedNodeData({ params: { label: e.target.value } }),
                  }),
                )
              : null,
            d.action === "branch" || d.action === "assert"
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement("label", null, "Условие (params.condition)"),
                  React.createElement(
                    "select",
                    {
                      value: params.condition || "element_exists",
                      onChange: (e) =>
                        updateSelectedNodeData({ params: { condition: e.target.value } }),
                    },
                    ...BRANCH_CONDITIONS.map((bc) =>
                      React.createElement("option", { key: bc.value, value: bc.value }, bc.label),
                    ),
                  ),
                  React.createElement("label", null, "expectedValue"),
                  React.createElement("input", {
                    value: params.expectedValue ?? "",
                    onChange: (e) =>
                      updateSelectedNodeData({ params: { expectedValue: e.target.value } }),
                  }),
                  params.condition === "attribute_equals"
                    ? React.createElement(
                        React.Fragment,
                        null,
                        React.createElement("label", null, "attributeName"),
                        React.createElement("input", {
                          value: params.attributeName || "",
                          onChange: (e) =>
                            updateSelectedNodeData({ params: { attributeName: e.target.value } }),
                        }),
                      )
                    : null,
                  d.action === "assert"
                    ? React.createElement(
                        React.Fragment,
                        null,
                        React.createElement(
                          "div",
                          { className: "row", style: { marginTop: 6 } },
                          React.createElement(
                            "label",
                            { className: "checkrow" },
                            React.createElement("input", {
                              type: "checkbox",
                              checked: !!params.waitMode,
                              onChange: (e) =>
                                updateSelectedNodeData({ params: { waitMode: e.target.checked } }),
                            }),
                            " waitMode",
                          ),
                          React.createElement(
                            "label",
                            { className: "checkrow" },
                            React.createElement("input", {
                              type: "checkbox",
                              checked: !!params.softAssert,
                              onChange: (e) =>
                                updateSelectedNodeData({ params: { softAssert: e.target.checked } }),
                            }),
                            " softAssert",
                          ),
                        ),
                      )
                    : null,
                )
              : null,
            React.createElement("label", null, "fallbackXPaths (по одному в строке)"),
            React.createElement("textarea", {
              placeholder: "//button[1]",
              value: safeArray(params.fallbackXPaths).join("\n"),
              onChange: (e) =>
                updateSelectedNodeData({
                  params: {
                    fallbackXPaths: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                  },
                }),
            }),
            React.createElement(
              "div",
              { className: "row", style: { marginTop: 8 } },
              React.createElement(
                "select",
                {
                  value: selectedGroupId,
                  onChange: (e) => setSelectedGroupId(e.target.value),
                  style: { flex: 1 },
                },
                React.createElement("option", { value: "" }, "Группа…"),
                ...groups.map((g) => React.createElement("option", { key: g.id, value: g.id }, g.title)),
              ),
              React.createElement(
                "button",
                { className: "btn2", type: "button", onClick: assignNodeToSelectedGroup },
                "В группу",
              ),
            ),
          )
        : React.createElement(
            "p",
            { className: "hint" },
            "Выберите блок на схеме",
          ),

      React.createElement("hr", { style: { borderColor: "#2a2a4a", margin: "14px 0" } }),
      React.createElement(
        "div",
        { className: "row", style: { justifyContent: "space-between" } },
        React.createElement(
          "h2",
          { className: "title", style: { fontSize: 14, margin: 0 } },
          "Группы",
        ),
        React.createElement(
          "button",
          { className: "btn2", type: "button", onClick: addGroup },
          "+ Группа",
        ),
      ),
      groups.length === 0
        ? React.createElement("p", { className: "hint" }, "Пока нет групп")
        : null,
      ...groups.map((g) =>
        React.createElement(
          "div",
          { key: g.id, className: "groupItem" },
          React.createElement(
            "div",
            { className: "row", style: { justifyContent: "space-between" } },
            React.createElement("strong", null, g.title),
            React.createElement(
              "button",
              { className: "btn2", type: "button", onClick: () => deleteGroup(g.id) },
              "Удалить",
            ),
          ),
          React.createElement("label", null, "Название"),
          React.createElement("input", {
            value: g.title,
            onChange: (e) => updateGroup(g.id, { title: e.target.value }),
          }),
          React.createElement("label", null, "Цвет"),
          React.createElement("input", {
            className: "inlineColor",
            type: "color",
            value: g.color || "#00d4aa",
            onChange: (e) => updateGroup(g.id, { color: e.target.value }),
          }),
          React.createElement(
            "div",
            { className: "hint" },
            `Узлы: ${(g.nodeIds || []).join(", ") || "нет"}`,
          ),
          ...(g.nodeIds || []).map((nodeId) =>
            React.createElement(
              "div",
              { key: `${g.id}-${nodeId}`, className: "row" },
              React.createElement("span", { className: "small", style: { flex: 1 } }, nodeId),
              React.createElement(
                "button",
                {
                  className: "btn2",
                  type: "button",
                  onClick: () => removeNodeFromGroup(g.id, nodeId),
                },
                "Убрать",
              ),
            ),
          ),
        ),
      ),
      selectedGroup
        ? React.createElement(
            "p",
            { className: "hint" },
            `Группа: ${selectedGroup.title}`,
          )
        : null,
    ),
  );
}

function mount() {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    document.body.innerHTML = '<p style="color:#eee;padding:16px">#root not found</p>';
    return;
  }
  try {
    createRoot(rootEl).render(
      React.createElement(ReactFlowProvider, null, React.createElement(App)),
    );
  } catch (e) {
    rootEl.innerHTML = `<div style="padding:16px;color:#e74c3c;font-family:system-ui"><strong>Не удалось запустить Flow Editor</strong><br/><pre style="white-space:pre-wrap;color:#ccc">${String(e?.stack || e)}</pre></div>`;
    console.error(e);
  }
}

mount();
