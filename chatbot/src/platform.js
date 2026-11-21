import { t } from "./i18n.js";

const actionKeys = [
  "runs_start", "runs_approve", "runs_reject", "runs_retry", "runs_cancel", "runs_pause", "runs_resume",
  "issues_dispatch", "issues_save", "issues_import_tapd", "issues_chat_clarify", "issues_clarification_save",
  "issues_delete", "issues_comments_add", "issues_reopen", "workflows_save", "workflows_clone",
  "workflows_publish", "agents_save", "assistant_tasks_save",
];
export const actionNames = Object.fromEntries(
  actionKeys.map((key) => [key, undefined]),
);
for (const key of actionKeys) {
  Object.defineProperty(actionNames, key, {
    enumerable: true,
    get() { return t(`platform.action.${key}`); },
  });
}
const entityKeys = [
  "agents", "workflows", "projects", "repositories", "rules", "skills", "mcp_servers",
  "schedule_jobs", "assistant_tasks", "runs", "issues", "environments", "sandboxes",
  "dockerfiles", "executors",
];
const verbKeys = [
  "save", "delete", "publish", "clone", "start", "cancel", "retry", "pause", "resume", "run", "import", "restore",
];
export const actionName = (tool) => {
  if (tool && Object.hasOwn(actionNames, tool)) return actionNames[tool];
  const match = tool?.match(/^(.*)_([^_]+)$/);
  if (match && entityKeys.includes(match[1]) && verbKeys.includes(match[2])) {
    const verb = t(`platform.verb.${match[2]}`);
    const entity = t(`platform.entity.${match[1]}`);
    return `${verb}${verb.match(/[a-zA-Z]$/) ? " " : ""}${entity}`;
  }
  return tool ? t("platform.executeTool", { tool }) : t("platform.unspecifiedAction");
};
export const visibleSidebarArtifact = (a) =>
  !a.draft ||
  !!definitionTarget(a) ||
  (!a.draft.saved && !a.draft.resolved && !a.draft.inherited);

export function definitionTarget(artifact, projectId = "") {
  if (!["sop", "role"].includes(artifact?.kind)) return null;
  if (artifact.draft && !artifact.draft.saved) return null;
  const saved =
    artifact.draft?.savedResult?.data || artifact.draft?.savedResult;
  const asset = artifact.asset || saved;
  if (!asset?.id) return null;
  const project =
    asset.projectId || artifact.draft?.body?.projectId || projectId;
  return {
    id: asset.id,
    href: `/${project ? `?projectId=${encodeURIComponent(project)}` : ""}#/${artifact.kind === "sop" ? "flow" : "agents"}/${encodeURIComponent(asset.id)}`,
    label: artifact.kind === "sop" ? t("platform.openSop") : t("platform.openRole"),
  };
}

// After a new project is created from a chat the user wants to keep working in
// it, but the chat stays bound to its own project and the assistant cannot
// switch it. Link to the Studio with the new project selected.
export function projectEntryTarget(draft, currentProjectId = "") {
  if (draft?.tool !== "projects_save" || !draft.saved) return null;
  const saved = draft.savedResult?.data || draft.savedResult || {};
  const id = saved.id || draft.body?.id;
  if (!id || id === currentProjectId) return null;
  return {
    href: `/?projectId=${encodeURIComponent(id)}#/collaboration`,
    label: t("platform.enterProject", { name: saved.name || draft.body?.name || id }),
  };
}

// A historical approval draft may already have been approved in a later turn.
// Derive its current display state without rewriting its execution receipt.
export function reconcileOperation(artifact, runs) {
  const draft = artifact.draft;
  if (!draft || draft.saved || draft.inherited || draft.tool !== "runs_approve")
    return artifact;
  const run = runs.find((r) => r.id === draft.path?.id);
  const node = run?.nodes?.[draft.body?.nodeId];
  if (!["succeeded", "skipped"].includes(node?.status)) return artifact;
  return { ...artifact, source: t("platform.completed"), draft: { ...draft, resolved: true } };
}
