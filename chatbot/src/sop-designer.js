// SOP designer surface of the chatbot. The SOP canvas (web/orchestrate.js)
// embeds /chatbot/?surface=sop-designer in its side panel. The canvas owns the
// graph and its build animation; this surface owns the conversation and talks
// to the canvas only through the window messages below.
import { parseReply } from "./api.js";
import { t } from "./i18n.js";

export const SURFACE = "sop-designer";
export const MODEL_KEY = "agentflow.orchestratorModel";

// Canvas → chat
export const CONTEXT = "agentflow-sop-designer-context"; // {projectId, workflowId}
export const BEGUN = "agentflow-sop-designer-begun"; // {requestId, ok, error, canvas, projectId, workflowId}
export const NEW_CONVERSATION = "agentflow-sop-designer-new";
// Chat → canvas
export const READY = "agentflow-sop-designer-ready";
export const BEGIN = "agentflow-sop-designer-begin"; // {requestId}
export const DRAFT = "agentflow-sop-designer-draft"; // {buffer}
export const REPLY = "agentflow-sop-designer-reply"; // {generationId, message, draft}
export const END = "agentflow-sop-designer-end"; // {error}
export const CONFIGURE_ROLE = "agentflow-sop-designer-role";
export const PLACE = "agentflow-sop-designer-place"; // {draft}
export const RESET = "agentflow-sop-designer-reset";

const SCENARIO_COUNT = 8;
export const SCENARIOS = Array.from({ length: SCENARIO_COUNT }, (_, i) => [
  t(`designer.scenario${i + 1}.label`),
  t(`designer.scenario${i + 1}.prompt`),
]);

export function getScenarios() {
  return Array.from({ length: SCENARIO_COUNT }, (_, i) => [
    t(`designer.scenario${i + 1}.label`),
    t(`designer.scenario${i + 1}.prompt`),
  ]);
}

export function scenarioPage(page, size = 4) {
  const list = getScenarios();
  const pages = Math.ceil(list.length / size);
  const start = (((page % pages) + pages) % pages) * size;
  return list.slice(start, start + size);
}

export function designerParams(search) {
  const params = new URLSearchParams(search || "");
  return {
    surface: params.get("surface") || "",
    projectId: params.get("projectId") || "",
    workflowId: params.get("workflowId") || "",
  };
}

export const isDesignerSurface = (search) => designerParams(search).surface === SURFACE;

// The newest conversation of this SOP continues; the list is sorted by the
// server, newest first, but sort again so a cached list cannot reorder it.
export function latestSession(rows, projectId, workflowId) {
  return (rows || [])
    .filter((row) => row.projectId === projectId && row.workflowId === workflowId)
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0] || null;
}

// The SOP or role draft, with its body as an object.
export function replyDraft(message) {
  const reply = parseReply(message || { content: "" });
  const draft = (reply.drafts || []).find((item) => ["workflows_save", "agents_save"].includes(item?.tool) && item.body);
  if (!draft) return null;
  let body = draft.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  return { tool: draft.tool, body, warnings: draft.warnings || [] };
}

export function draftSummary(draft) {
  if (draft.tool === "agents_save") return t("designer.roleDraft", { name: draft.body.name });
  const nodes = Array.isArray(draft?.body?.nodes) ? draft.body.nodes.length : 0;
  const edges = Array.isArray(draft?.body?.edges) ? draft.body.edges.length : 0;
  return t("designer.draftSummary", { name: draft?.body?.name || t("designer.sopDraft"), nodes, edges });
}

export function requestId() {
  return `begin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Ask the canvas to prepare a build and hand over its current graph. Without
// a canvas (the page opened on its own) the turn runs without a snapshot.
export function beginOnCanvas(target, self = window, timeout = 3000) {
  if (!target || target === self) return Promise.resolve({ ok: true, canvas: null });
  const id = requestId();
  return new Promise((resolve) => {
    const done = (value) => {
      clearTimeout(timer);
      self.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.source !== target || event.origin !== self.location.origin) return;
      if (event.data?.type === BEGUN && event.data.requestId === id) done(event.data);
    };
    const timer = setTimeout(() => done({ ok: false, error: t("designer.canvasTimeout") }), timeout);
    self.addEventListener("message", onMessage);
    target.postMessage({ type: BEGIN, requestId: id }, self.location.origin);
  });
}

export function postToCanvas(type, payload = {}, target = window.parent, self = window) {
  if (!target || target === self) return;
  target.postMessage({ type, ...payload }, self.location.origin);
}
