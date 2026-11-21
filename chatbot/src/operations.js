import { actionName } from "./platform.js";
import { listSeparator, t } from "./i18n.js";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export function reviewedOperation(draft, review = {}) {
  const actual = {
    tool: draft.tool,
    path: draft.path,
    query: draft.query,
    body: draft.body,
  };
  if (
    review.expected &&
    JSON.stringify(canonical(actual)) !==
      JSON.stringify(canonical(review.expected))
  )
    throw Object.assign(Error(t("operations.draftChanged")), {
      draftChanged: true,
    });
  const result =
    review.bodyPatch && draft.tool === "issues_import_tapd"
      ? {
          ...draft,
          body: {
            ...draft.body,
            repositoryIds: review.bodyPatch.repositoryIds,
            repositoryId: "",
          },
        }
      : draft;
  const invalid = operationValidation(result);
  if (invalid) throw Error(invalid);
  return result;
}

export function operationValidation(draft) {
  if (!draft?.tool) return t("operations.missingTool");
  if (draft.tool === "issues_import_tapd") {
    if (
      typeof draft.body?.projectId !== "string" ||
      !draft.body.projectId.trim()
    )
      return t("operations.missingProject");
    if (typeof draft.body?.url !== "string" || !draft.body.url.trim())
      return t("operations.missingTapdUrl");
    if (!repositoryIds(draft.body).length)
      return t("operations.missingRepo");
  }
  return "";
}
export function repositoryIds(body) {
  return [
    ...new Set(
      [
        ...(Array.isArray(body?.repositoryIds) ? body.repositoryIds : []),
        body?.repositoryId,
      ]
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim()),
    ),
  ];
}
// Platform-level resources belong to no project; the session's project must not
// be shown as theirs (a new project would read "项目：<current project>").
const GLOBAL_SAVE_TOOLS = new Set([
  "projects_save",
  "business_domains_save",
  "sync_config_save",
]);
// repo.GenericBackendDeliveryWorkflowID, bound to new projects by default.
const DEFAULT_PROJECT_WORKFLOW = "generic-backend-delivery";
export function operationSummary(
  draft,
  { projects = [], references = [], projectId = "" } = {},
) {
  const body = draft.body || {};
  const project = GLOBAL_SAVE_TOOLS.has(draft.tool)
    ? ""
    : body.projectId || projectId;
  const named = (type, id) =>
    references.find((r) => r.type === type && r.id === id)?.name || id;
  const target = draft.path?.id || body.id;
  const existingProject =
    draft.tool === "projects_save" && projects.some((p) => p.id === target);
  // Mirrors saveProject: a new project without a workflowId is bound to the
  // generic backend SOP, so the card says so instead of showing nothing.
  const sop = body.workflowId
    ? named("sop", body.workflowId)
    : draft.tool === "projects_save" && !existingProject
      ? t("operations.defaultWorkflow", {
          name: references.find((r) => r.type === "sop" && r.id === DEFAULT_PROJECT_WORKFLOW)?.name || t("operations.genericBackendSop"),
        })
      : "";
  const fields = [
    [
      t("operations.field.project"),
      project ? projects.find((p) => p.id === project)?.name || project : "",
    ],
    [t("operations.field.name"), body.name || body.title],
    [t("operations.field.target"), draft.path?.id || body.id],
    [t("operations.field.tapdUrl"), body.url],
    [
      t("operations.field.repositories"),
      repositoryIds(body)
        .map((id) => named("repository", id))
        .join(listSeparator()),
    ],
    ["SOP", sop],
    [t("operations.field.node"), body.nodeId],
    [t("operations.field.description"), body.description || body.reason],
  ].filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const effect =
    {
      issues_import_tapd: t("operations.effect.issues_import_tapd"),
      issues_dispatch: t("operations.effect.issues_dispatch"),
      runs_start: t("operations.effect.runs_start"),
      runs_approve: t("operations.effect.runs_approve"),
      runs_reject: t("operations.effect.runs_reject"),
      issues_clarification_save: t("operations.effect.issues_clarification_save"),
      projects_save: existingProject
        ? t("operations.effect.projects_save.edit")
        : t("operations.effect.projects_save.create"),
    }[draft.tool] || t("operations.effect.fallback", { action: actionName(draft.tool) });
  return { title: actionName(draft.tool), fields, effect };
}
export function operationError(value) {
  const text =
    value instanceof Error ? value.message : String(value || t("operations.failed"));
  try {
    const data = JSON.parse(text);
    if (typeof data.error === "string") return data.error;
    if (typeof data.error?.message === "string") return data.error.message;
  } catch {
    /* Plain text errors need no conversion. */
  }
  return text;
}
