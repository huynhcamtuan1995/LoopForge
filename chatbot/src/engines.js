import { t } from "./i18n.js";

// CLIs that AI chat can run on. The list comes from GET /api/assistant/models
// (`engines`); models without `engine` run on CodeBuddy.
export const defaultEngine = "codebuddy";

// Main Bot can run on any configured agent CLI.
export const EXECUTORS = [
  { id: "codebuddy", icon: "sparkles", label: "CodeBuddy", get detail() { return t("engines.codebuddy.detail"); } },
  { id: "codex", icon: "terminal", label: "Codex", get detail() { return t("engines.codex.detail"); } },
  { id: "claude-code", icon: "brain", label: "Claude Code", get detail() { return t("engines.claude.detail"); } },
  { id: "opencode", icon: "terminal", label: "OpenCode", get detail() { return t("engines.opencode.detail"); } },
  { id: "cursor", icon: "terminal", label: "Cursor", get detail() { return t("engines.cursor.detail"); } },
  { id: "agy", icon: "sparkles", label: "Antigravity", get detail() { return t("engines.agy.detail"); } },
  { id: "kimi", icon: "sparkles", label: "Kimi Code", get detail() { return t("engines.kimi.detail"); } },
  { id: "pi", icon: "terminal", label: "Pi", get detail() { return t("engines.pi.detail"); } },
  { id: "dsh", icon: "terminal", label: "DeepSeek Harness", get detail() { return t("engines.dsh.detail"); } },
  { id: "zcode", icon: "terminal", label: "ZCode", get detail() { return t("engines.zcode.detail"); } },
];

// Bundled logo per CLI; an unknown CLI falls back to its model's brand.
const brands = {
  codebuddy: "codebuddy", codex: "codex", "claude-code": "claude",
  opencode: "opencode", cursor: "cursor", agy: "antigravity", kimi: "kimi-code", pi: "pi", dsh: "deepseek", zcode: "zhipu",
};
export const engineBrand = (id) => Object.hasOwn(brands, id) ? brands[id] : "";

export function personalEngineConfigured(user, engine) {
  switch (engine) {
    case "codebuddy": return Boolean(user?.codeBuddyApiKeyConfigured);
    case "codex": return Boolean(user?.codexApiKeyConfigured);
    case "claude-code": return Boolean(user?.claudeCodeApiKeyConfigured);
    default: return Boolean(user?.agentCliCredentials?.[engine]?.apiKeyConfigured);
  }
}

export const modelEngine = (model) => model?.engine || defaultEngine;

const modelEnginePrefix = (id) => /^([a-z][a-z0-9-]*):./.exec(id || "")?.[1];

/** The CLI an ID runs on: the catalog entry, else the "cli:model" prefix. */
export function engineOfModel(id, models = []) {
  const listed = models.find((m) => m.id === id);
  if (listed) return modelEngine(listed);
  return modelEnginePrefix(id) || defaultEngine;
}

export const concreteModel = (model, engine = modelEngine(model)) =>
  !!model?.id && model.id !== "default" && model.id !== `${engine}:default` &&
  (engine !== "codebuddy" || (model.id !== "default-model" && model.id !== "codebuddy:default-model"));

export const engineModels = (models, engine) =>
  (models || []).filter((m) => modelEngine(m) === engine && concreteModel(m, engine));

// Mirrors assistantEngineMissingKey in internal/httpapi/assistant_engines.go;
// credentialHint turns it into a "去配置" button.
export function engineMissingKeyMessage(engine) {
  if (engine.id === defaultEngine) return t("engines.missingCodeBuddyKey");
  return t("engines.missingEngineKey", { name: engine.name });
}

const executorLabels = new Map(EXECUTORS.map(({ id, label }) => [id, label]));

function legacyEngine(id) {
  id = String(id ?? "").trim().toLowerCase();
  if (id === "claude") return "claude-code";
  return id !== defaultEngine && executorLabels.has(id) ? id : "";
}

/** CLI label for a saved reply, including messages from before model prefixes. */
export function replyEngineLabel(model, legacyExecutor, speakerAgentId) {
  const label = executorLabels.get(modelEnginePrefix(model));
  if (label) return label;
  if (!model || speakerAgentId) return "";
  return executorLabels.get(legacyEngine(legacyExecutor) || defaultEngine);
}

/**
 * The CLI that wrote a conversation's latest own reply, "" before the first.
 * Mirrors assistantConversationEngine: a conversation stays on that CLI,
 * because its native session holds tool calls another CLI cannot resume.
 * An unprefixed model falls back to the session's stored executor.
 */
export function conversationEngine(messages, models = [], legacyExecutor = "") {
  for (let i = (messages?.length || 0) - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant" || m.speakerAgentId || !m.model) continue;
    if (executorLabels.has(modelEnginePrefix(m.model))) return engineOfModel(m.model, models);
    const legacy = legacyEngine(legacyExecutor);
    if (legacy) return legacy;
    return engineOfModel(m.model, models);
  }
  return "";
}

export function engineDetail(engine, models) {
  if (!engine.configured) return t("engines.notConfiguredDetail", { name: engine.name });
  const count = engineModels(models, engine.id).length;
  return count ? t("engines.availableModels", { count }) : t("engines.noModels");
}
