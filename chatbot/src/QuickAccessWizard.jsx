import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "../../web/app/git-ssh.js";
import HarnessIcon from "./HarnessIcon";
import { listSeparator, t, useI18n } from "./i18n.js";
import SlidingTabs from "./SlidingTabs";
import { api, canChatInProject, canManageProjectRepos, write } from "./api";
import { usePanelPresence } from "./usePanelPresence";
import {
  CODEBUDDY_ENVIRONMENTS,
  codeBuddyEnvironment,
  codeBuddyEnvironmentIntent,
  codeBuddyEnvironmentLegacy,
  codeBuddyKeyURL,
  codeBuddyKeyWarning,
  openCredentialSettings,
} from "./credentials";
import "./quick-access-wizard.css";

const DEFAULT_SOP_ID = "generic-backend-delivery";

// Display names for the models users without their own key may use.
export function sharedModelNames(models, fallback = "") {
  const list = Array.isArray(models) && models.length ? models : fallback ? [fallback] : [];
  return list
    .map((id) => (id === "deepseek-v4.1-flash" ? "Deepseek-V4.1-Flash" : id))
    .join(listSeparator());
}

// The users API omits an empty (国际站) environment, so a full user response
// must clear one that was switched to 国际站 elsewhere instead of keeping it.
export function mergeFreshUser(prev, fresh) {
  return {
    ...prev,
    ...fresh,
    codeBuddyInternetEnvironment: fresh?.codeBuddyInternetEnvironment || "",
  };
}

const STEPS = [
  {
    id: "auth",
    get title() { return t("wizard.step.auth.title"); },
    get desc() { return t("wizard.step.auth.desc"); },
  },
  {
    id: "project",
    get title() { return t("wizard.step.project.title"); },
    get desc() { return t("wizard.step.project.desc"); },
  },
  {
    id: "workflow",
    get title() { return t("wizard.step.workflow.title"); },
    get desc() { return t("wizard.step.workflow.desc"); },
  },
  {
    id: "done",
    get title() { return t("wizard.step.done.title"); },
    get desc() { return t("wizard.step.done.desc"); },
  },
];

const getFallbackRoles = () => [
  {
    id: "loopforge-requirement",
    name: t("wizard.role.requirement.name"),
    description: t("wizard.role.requirement.desc"),
    prompt: t("wizard.role.requirement.prompt"),
    artifactId: "requirement-report",
    artifactPath: "requirement-report.md",
  },
  {
    id: "loopforge-design",
    name: t("wizard.role.design.name"),
    description: t("wizard.role.design.desc"),
    prompt: t("wizard.role.design.prompt"),
    artifactId: "tech-design",
    artifactPath: "tech-design.md",
  },
  {
    id: "loopforge-implement",
    name: t("wizard.role.implement.name"),
    description: t("wizard.role.implement.desc"),
    prompt: t("wizard.role.implement.prompt"),
    artifactId: "change-report",
    artifactPath: "change-report.md",
  },
  {
    id: "loopforge-review",
    name: t("wizard.role.review.name"),
    description: t("wizard.role.review.desc"),
    prompt: t("wizard.role.review.prompt"),
    artifactId: "review-report",
    artifactPath: "review-report.md",
  },
  {
    id: "loopforge-test",
    name: t("wizard.role.test.name"),
    description: t("wizard.role.test.desc"),
    prompt: t("wizard.role.test.prompt"),
    artifactId: "test-report",
    artifactPath: "test-report.md",
  },
  {
    id: "loopforge-mr",
    name: t("wizard.role.mr.name"),
    description: t("wizard.role.mr.desc"),
    prompt: t("wizard.role.mr.prompt"),
    artifactId: "mr-body",
    artifactPath: "mr-body.md",
  },
  {
    id: "loopforge-summary",
    name: t("wizard.role.summary.name"),
    description: t("wizard.role.summary.desc"),
    prompt: t("wizard.role.summary.prompt"),
    artifactId: "summary-report",
    artifactPath: "summary-report.md",
  },
];

const FALLBACK_NODES = [
  { id: "requirement", get name() { return t("wizard.role.requirement.name"); }, type: "agent", agentId: "loopforge-requirement", metricStage: "clarification" },
  { id: "design", get name() { return t("wizard.role.design.name"); }, type: "agent", agentId: "loopforge-design", metricStage: "development" },
  { id: "implement", get name() { return t("wizard.role.implement.name"); }, type: "agent", agentId: "loopforge-implement", metricStage: "development" },
  { id: "review", get name() { return t("wizard.role.review.name"); }, type: "agent", agentId: "loopforge-review", metricStage: "testing" },
  { id: "test", get name() { return t("wizard.role.test.name"); }, type: "agent", agentId: "loopforge-test", metricStage: "testing" },
  { id: "mr", get name() { return t("wizard.role.mr.name"); }, type: "agent", agentId: "loopforge-mr", metricStage: "development" },
  { id: "summary", get name() { return t("wizard.role.summary.name"); }, type: "agent", agentId: "loopforge-summary", metricStage: "none" },
];

const BRANCH_OPTIONS = [
  { value: "main", label: "main", get hint() { return t("wizard.branch.main"); } },
  { value: "master", label: "master", get hint() { return t("wizard.branch.master"); } },
  { value: "preview", label: "preview", get hint() { return t("wizard.branch.preview"); } },
  { value: "develop", label: "develop", get hint() { return t("wizard.branch.develop"); } },
];

let closeActiveSelect = null;

/**
 * HarnessSelect: adapted from Harness UI's AppSelect.vue.
 * Supports searchable filtering, custom typed value, keyboard navigation,
 * animated chevron rotation, and a portal dropdown with presence transition.
 */
export function HarnessSelect({
  value,
  options = [],
  onChange,
  placeholder,
  ariaLabel,
  searchable = false,
  searchPlaceholder,
  allowCustom = false,
  disabled = false,
}) {
  useI18n();
  const resolvedPlaceholder = placeholder ?? t("common.pleaseSelect");
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("wizard.searchPlaceholder");
  const selectId = `qa-select-${useId().replaceAll(":", "")}`;
  const listboxId = `${selectId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 240,
    maxHeight: 280,
    placement: "bottom",
  });
  const presence = usePanelPresence(open, 160);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const matched = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );
  const selectedLabel = matched
    ? matched.label
    : allowCustom && value
      ? value
      : resolvedPlaceholder;
  const isPlaceholder = !matched && !(allowCustom && value);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered =
      !q || !searchable
        ? options
        : options.filter(
            (opt) =>
              opt.label.toLowerCase().includes(q) ||
              opt.value.toLowerCase().includes(q) ||
              (opt.hint || "").toLowerCase().includes(q),
          );
    const trimmed = query.trim();
    const canCustom =
      allowCustom &&
      searchable &&
      trimmed &&
      !options.some((opt) => opt.value === trimmed);
    const customRow = canCustom
      ? [
          {
            value: trimmed,
            label: t("wizard.useCustom", { value: trimmed }),
            hint: t("wizard.customHint"),
            custom: true,
          },
        ]
      : [];
    return [...customRow, ...filtered];
  }, [options, query, searchable, allowCustom]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const place = useCallback(() => {
    const trig = triggerRef.current;
    if (!trig) return;
    const rect = trig.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const maxPanelHeight = 280;
    const panelHeight = Math.min(
      panelRef.current?.offsetHeight || maxPanelHeight,
      maxPanelHeight,
    );
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const flipUp = below < panelHeight && above > below;
    const maxHeight = Math.max(
      120,
      Math.min(maxPanelHeight, flipUp ? above : below),
    );
    const visibleHeight = Math.min(panelHeight, maxHeight);
    const top = flipUp
      ? Math.max(margin, rect.top - gap - visibleHeight)
      : Math.min(rect.bottom + gap, window.innerHeight - margin - visibleHeight);
    const width = Math.max(180, rect.width);
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin),
    );
    setPosition({
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
      placement: flipUp ? "top" : "bottom",
    });
  }, []);

  useLayoutEffect(() => {
    if (presence.mounted) place();
  }, [presence.mounted, rows.length, place]);

  useEffect(() => {
    if (!open) return undefined;
    if (closeActiveSelect && closeActiveSelect !== close) closeActiveSelect();
    closeActiveSelect = close;
    const idx = Math.max(
      0,
      options.findIndex((opt) => opt.value === value),
    );
    setActiveIndex(idx);
    const frame = requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (closeActiveSelect === close) closeActiveSelect = null;
    };
  }, [open, close, options, searchable, value]);

  useEffect(() => {
    if (!presence.mounted) return undefined;
    const onOutside = (event) => {
      if (
        triggerRef.current?.contains(event.target) ||
        panelRef.current?.contains(event.target)
      )
        return;
      close();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [presence.mounted, place, close]);

  function choose(nextValue) {
    if (disabled) return;
    onChange?.(nextValue);
    close();
    triggerRef.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    if (disabled || event.isComposing) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (rows.length) setActiveIndex((i) => (i + 1) % rows.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length)
        setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
      return;
    }
    if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      const target = rows[activeIndex];
      if (target) choose(target.value);
    }
  }

  return (
    <div className="qa-select-root">
      <button
        ref={triggerRef}
        type="button"
        className={`qa-select-trigger ${open ? "is-open" : ""}`}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span
          className={`qa-select-value ${isPlaceholder ? "is-placeholder" : ""}`}
        >
          {selectedLabel}
        </span>
        {matched?.hint ? (
          <span className="qa-select-trigger-hint">{matched.hint}</span>
        ) : null}
        <HarnessIcon
          name="chevron-down"
          size={14}
          interactive={false}
          className={`qa-select-chevron ${open ? "is-open" : ""}`}
        />
      </button>

      {presence.mounted
        ? createPortal(
            <div
              ref={panelRef}
              className="qa-select-panel"
              data-phase={presence.phase}
              data-placement={position.placement}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              onKeyDown={onKeyDown}
            >
              {searchable ? (
                <label className="qa-select-search">
                  <HarnessIcon name="search" size={14} interactive={false} />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    placeholder={resolvedSearchPlaceholder}
                    aria-label={resolvedSearchPlaceholder}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                  />
                </label>
              ) : null}
              <div
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                className="qa-select-options"
              >
                {rows.length ? (
                  rows.map((row, index) => {
                    const selected = row.value === value;
                    const active = index === activeIndex;
                    return (
                      <button
                        key={(row.custom ? "custom:" : "opt:") + row.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={[
                          "qa-select-option",
                          selected && "is-selected",
                          active && "is-active",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(row.value)}
                      >
                        <span className="qa-select-option-label">
                          {row.label}
                        </span>
                        {row.hint ? (
                          <span className="qa-select-option-hint">
                            {row.hint}
                          </span>
                        ) : null}
                        {selected ? (
                          <HarnessIcon
                            name="check"
                            size={14}
                            interactive={false}
                            className="qa-select-option-check"
                          />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="qa-select-empty">{t("common.noMatchingOptions")}</p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * HarnessSwitch: adapted from Harness UI's AppSwitch.vue.
 */
export function HarnessSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`qa-switch ${checked ? "is-on" : ""}`}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      <span className="qa-switch-thumb" aria-hidden="true" />
    </button>
  );
}

/** Pill whose dot pops once each time `ok` flips; alternating keyframe names restart it. */
function StatusPill({ ok, okLabel, needLabel }) {
  useI18n();
  const resolvedOk = okLabel ?? t("wizard.statusReady");
  const resolvedNeed = needLabel ?? t("wizard.statusNeed");
  const previous = useRef(ok);
  const [pops, setPops] = useState(0);
  useEffect(() => {
    if (previous.current === ok) return;
    previous.current = ok;
    setPops((n) => n + 1);
  }, [ok]);
  return (
    <span
      className={`qa-status-pill ${ok ? "is-ok" : "is-need"}`}
      data-pop={pops ? (pops % 2 ? "a" : "b") : undefined}
    >
      {ok ? resolvedOk : resolvedNeed}
    </span>
  );
}

function VerifyMessage({ result, okText }) {
  useI18n();
  const text = result.valid
    ? okText
    : result.error || t("wizard.missingScopes", { scopes: (result.missing || []).join(listSeparator()) });
  return (
    <p
      key={text}
      className={`qa-verify-msg qa-msg-in ${result.valid ? "is-ok" : "is-err"}`}
    >
      <HarnessIcon
        name={result.valid ? "check" : "info"}
        size={13}
        interactive={false}
      />
      <span>{text}</span>
    </p>
  );
}

/** Both labels share one grid cell so the button keeps its widest width while busy. */
function BusyLabel({ busy, busyLabel, children }) {
  return (
    <span className="qa-btn-label">
      <span className="qa-btn-label-cell" aria-hidden={busy || undefined}>
        {children}
      </span>
      <span className="qa-btn-label-cell" aria-hidden={!busy || undefined}>
        <HarnessIcon
          name="arc-spinner"
          size={14}
          motion={busy ? "busy" : "idle"}
          interactive={false}
        />
        {busyLabel}
      </span>
    </span>
  );
}

function parseGitHubRepo(raw) {
  let value = String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^git\s+clone\s+/i, "")
    .replace(/^github:/i, "https://github.com/")
    .replace(/^(?:git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)/i, "https://github.com/");
  if (/^github\.com\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    return null;
  const [owner = "", rawName = ""] = url.pathname.split("/").filter(Boolean);
  const name = rawName.replace(/\.git$/i, "");
  const valid = (seg) =>
    /^[A-Za-z0-9_.-]+$/.test(seg) && seg !== "." && seg !== "..";
  if (!valid(owner) || !valid(name)) return null;
  return {
    project: `github:${owner}/${name}`,
    provider: "github",
    name,
    webUrl: `https://github.com/${owner}/${name}`,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
}

// SSH preview first (it leaves github.com to the GitHub parser, matching the
// server); self-hosted legacy repositories keep the git.example.com form.
export function parseGongfengRepo(raw) {
  const httpsInfo = globalThis.LoopForgeGitHTTPS(raw);
  if (httpsInfo) return httpsInfo;
  const sshInfo = globalThis.LoopForgeGitSSH(raw);
  if (sshInfo) return sshInfo;
  const github = parseGitHubRepo(raw);
  if (github) return github;
  const original = String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (!original) return null;
  const strippedClone = /^git\s+clone\s+/i.test(original);
  let value = original
    .replace(/^git\s+clone\s+/i, "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (strippedClone && /\s/.test(value)) value = value.split(/\s+/)[0];
  if (!value || /[\s"'<>()\\]/.test(value)) return null;
  const ssh = /^(git@|ssh:\/\/)/i.test(value);
  value = value.replace(/\/+$/, "");
  const hadScheme = value.includes("://");
  const hadAt = value.includes("@");
  let rest = value;
  if (hadScheme) rest = rest.slice(rest.indexOf("://") + 3);
  if (rest.includes("@")) rest = rest.slice(rest.lastIndexOf("@") + 1);
  let path = "";
  if (!hadScheme && !hadAt && !rest.includes(":")) {
    path = rest;
  } else if (rest.includes("/")) {
    const cut = rest.search(/[:/]/);
    const host = rest.slice(0, cut);
    if (host.toLowerCase() !== "git.example.com") return null;
    path = rest.slice(cut + 1);
    if (rest[cut] === ":") {
      const slash = path.indexOf("/");
      if (slash >= 0 && /^\d+$/.test(path.slice(0, slash)))
        path = path.slice(slash + 1);
    }
  } else {
    return null;
  }
  path = path.replace(/^git\.example\.com\//i, "").replace(/\.git$/i, "");
  for (const marker of [
    "/-/",
    "/tree/",
    "/blob/",
    "/commit/",
    "/commits/",
    "/merge_requests/",
    "/issues/",
    "/snippets/",
    "/wikis/",
    "/releases/",
    "/tags/",
  ]) {
    const index = path.indexOf(marker);
    if (index >= 0) path = path.slice(0, index);
  }
  path = path.replace(/^\/+|\/+$/g, "");
  const parts = path.split("/");
  if (
    parts.length < 2 ||
    path.includes("..") ||
    parts.some((seg) => !seg || /[\s\\?#]/.test(seg))
  )
    return null;
  const name = parts[parts.length - 1];
  return {
    project: path,
    provider: "gongfeng",
    name,
    webUrl: `https://git.example.com/${path}`,
    cloneUrl: ssh
      ? `git@git.example.com:${path}.git`
      : `https://git.example.com/${path}.git`,
  };
}

function slugifyProjectId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function deriveProjectKey(value) {
  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
  return clean || "PROJ";
}

async function provisionFallbackProjectSOP(projectId, workflowId, owner) {
  const sandboxId = `local-${projectId}`.slice(0, 60);
  await write(
    "/api/sandboxes",
    {
      id: sandboxId,
      name: t("wizard.localSandboxName"),
      projectId,
      driver: "local",
      shared: false,
    },
    "PUT",
  );

  const agentIdMap = {};
  for (const role of getFallbackRoles()) {
    const agentId = `${role.id}-${projectId}`.slice(0, 60);
    agentIdMap[role.id] = agentId;
    await write(
      "/api/agents",
      {
        id: agentId,
        name: role.name,
        projectId,
        version: 1,
        executorId: "codebuddy",
        description: role.description,
        prompt: role.prompt,
        artifactOutputs: [
          {
            name: role.artifactId,
            path: role.artifactPath,
            mediaType: "text/markdown",
            required: true,
          },
        ],
      },
      "PUT",
    );
  }

  const nodes = FALLBACK_NODES.map((node, index) => ({
    id: node.id,
    name: node.name,
    type: "agent",
    agentId: agentIdMap[node.agentId] || node.agentId,
    metricStage: node.metricStage || "development",
    maxAttempts: 1,
    maxReworks: 1,
    position: { x: 80 + index * 220, y: 200 },
    artifactOutputs: [
      {
        name: `${node.id}-report`,
        path: `${node.id}-report.md`,
        mediaType: "text/markdown",
        required: true,
      },
    ],
  }));

  const edges = nodes.slice(1).map((node, index) => ({
    id: `e-${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
    when: "success",
  }));

  const draft = await write(
    "/api/workflows",
    {
      id: workflowId,
      name: t("wizard.backendSopName"),
      projectId,
      owner,
      status: "draft",
      version: 1,
      revision: 0,
      sopLane: "backend",
      sandboxProfileId: sandboxId,
      tags: [t("wizard.title"), `generic-source:${DEFAULT_SOP_ID}`],
      description: t("wizard.backendSopDesc"),
      nodes,
      edges,
    },
    "PUT",
  );
  return write(
    `/api/workflows/${encodeURIComponent(draft.id)}/publish`,
    {},
  ).catch(() => draft);
}

export default function QuickAccessWizard({
  open,
  user,
  projects = [],
  projectId = "",
  sponsoredModel = "",
  sponsoredModels = [],
  onClose,
  onCompleted,
  onCredentialsSaved,
  onOpenView,
}) {
  useI18n();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("wizard");
  const [storedUser, setStoredUser] = useState(user);
  const [sshCredentials, setSSHCredentials] = useState({ userId: null, keys: null, error: false });
  const [catalogProjects, setCatalogProjects] = useState(projects);
  const [repositories, setRepositories] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [projectAgents, setProjectAgents] = useState([]);
  const [templateAgents, setTemplateAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [codeBuddyApiKey, setCodeBuddyApiKey] = useState("");
  // null follows the saved setting until the user picks an environment here.
  const [codeBuddyEnvChoice, setCodeBuddyEnvChoice] = useState(null);
  const [verifyingGit, setVerifyingGit] = useState(false);
  const [gitVerify, setGitVerify] = useState(null);
  const [projectMode, setProjectMode] = useState("existing");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [bindRepoNow, setBindRepoNow] = useState(true);
  const [makeDefaultRepo, setMakeDefaultRepo] = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] =
    useState(DEFAULT_SOP_ID);
  const [previewTab, setPreviewTab] = useState("stages");
  const [completedSummary, setCompletedSummary] = useState(null);
  const [direction, setDirection] = useState("forward");
  const [stepAnimated, setStepAnimated] = useState(false);
  const headingRef = useRef(null);
  const bodyRef = useRef(null);
  const presence = usePanelPresence(open, 300);
  const reopenedWhileClosing = presence.phase === "closing";

  const editableProjects = useMemo(
    () =>
      (catalogProjects || []).filter((project) =>
        canChatInProject(project, storedUser || user),
      ),
    [catalogProjects, storedUser, user],
  );

  const projectSelectOptions = useMemo(
    () =>
      editableProjects.map((project) => ({
        value: project.id,
        label: project.name,
        hint: project.key || project.id,
      })),
    [editableProjects],
  );

  const genericWorkflows = useMemo(() => {
    const rows = (workflows || []).filter((workflow) => workflow.generic);
    return rows.length
      ? rows
      : [
          {
            id: DEFAULT_SOP_ID,
            name: t("operations.genericBackendSop"),
            description: t("wizard.genericSopDesc"),
            generic: true,
            nodes: FALLBACK_NODES,
          },
        ];
  }, [workflows]);

  const currentProject = useMemo(
    () =>
      editableProjects.find((project) => project.id === selectedProjectId) ||
      editableProjects[0] ||
      null,
    [editableProjects, selectedProjectId],
  );

  // A member can work in a shared project (e.g. the welcome project) without
  // owning it; binding a repository there would only fail at the last step.
  const repoBindBlocked =
    projectMode === "existing" &&
    Boolean(currentProject) &&
    !canManageProjectRepos(currentProject, storedUser || user);

  const projectRepos = useMemo(
    () =>
      currentProject
        ? (repositories || []).filter(
            (repo) => repo.projectId === currentProject.id,
          )
        : [],
    [currentProject, repositories],
  );

  const defaultRepo = useMemo(() => {
    if (!currentProject) return null;
    return (
      projectRepos.find(
        (repo) => repo.id === currentProject.defaultRepositoryId,
      ) ||
      projectRepos[0] ||
      null
    );
  }, [currentProject, projectRepos]);

  const availableWorkflows = useMemo(() => {
    const projectIdTarget =
      projectMode === "existing" ? currentProject?.id : "";
    const ownedOrShared = (workflows || []).filter(
      (workflow) =>
        !workflow.generic &&
        ((projectIdTarget && workflow.projectId === projectIdTarget) ||
          workflow.shared),
    );
    const seen = new Set(ownedOrShared.map((item) => item.id));
    const merged = [...ownedOrShared];
    for (const generic of genericWorkflows) {
      if (!seen.has(generic.id)) merged.push(generic);
    }
    return merged;
  }, [workflows, genericWorkflows, projectMode, currentProject]);

  const sopSelectOptions = useMemo(
    () =>
      availableWorkflows.map((workflow) => {
        const stageCount = (workflow.nodes || FALLBACK_NODES).filter(
          (n) => n.type === "agent",
        ).length;
        const scopeLabel = workflow.generic
          ? t("wizard.scopePlatform")
          : projectMode === "existing" &&
              workflow.projectId === currentProject?.id
            ? t("wizard.scopeProject")
            : t("wizard.scopeShared");
        return {
          value: workflow.id,
          label: workflow.name,
          hint: t("wizard.sopHint", { count: stageCount, scope: scopeLabel }),
        };
      }),
    [availableWorkflows, currentProject, projectMode],
  );

  const activeWorkflow = useMemo(
    () =>
      availableWorkflows.find(
        (workflow) => workflow.id === selectedWorkflowId,
      ) || availableWorkflows[0],
    [availableWorkflows, selectedWorkflowId],
  );

  const parsedRepo = useMemo(() => parseGongfengRepo(repoUrl), [repoUrl]);

  // Reopening during the exit transition reverses it onto the same content.
  useEffect(() => {
    if (!open || reopenedWhileClosing) return;
    setStep(0);
    setDirection("forward");
    setStepAnimated(false);
    setPhase("wizard");
    setError("");
    setGitToken("");
    setCodeBuddyApiKey("");
    setCodeBuddyEnvChoice(null);
    setGitVerify(null);
    setCompletedSummary(null);
    setBindRepoNow(true);
    setPreviewTab("stages");
    setIdTouched(false);
    setKeyTouched(false);
  }, [open]);

  const verifyStoredGitToken = useCallback(
    async (uid = user?.id) => {
      if (!uid) return null;
      setVerifyingGit(true);
      try {
        const result = await api(
          `/api/users/${encodeURIComponent(uid)}/git-token/verify`,
        );
        setGitVerify(result);
        return result;
      } catch (err) {
        const fallback = { valid: false, error: err.message };
        setGitVerify(fallback);
        return fallback;
      } finally {
        setVerifyingGit(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [usersRes, projectsRes, reposRes, workflowsRes, agentsRes] =
          await Promise.all([
            api("/api/users").catch(() => []),
            api("/api/projects").catch(() => projects),
            api("/api/repositories").catch(() => []),
            api("/api/workflows").catch(() => []),
            api("/api/agents").catch(() => []),
          ]);
        if (!active) return;
        const freshUser =
          (usersRes || []).find(
            (item) => Number(item.id) === Number(user?.id),
          ) || user;
        setStoredUser(mergeFreshUser(user, freshUser));
        if (freshUser?.gitHubCredentialConfigured && freshUser?.id) {
          void verifyStoredGitToken(freshUser.id);
        }
        const nextProjects = Array.isArray(projectsRes)
          ? projectsRes
          : projects;
        setCatalogProjects(nextProjects);
        setRepositories(Array.isArray(reposRes) ? reposRes : []);
        const nextWorkflows = Array.isArray(workflowsRes) ? workflowsRes : [];
        setWorkflows(nextWorkflows);
        setProjectAgents(Array.isArray(agentsRes) ? agentsRes : []);
        const mine = nextProjects.filter((project) =>
          canChatInProject(project, freshUser),
        );
        const preferred =
          mine.find((project) => project.id === projectId) || mine[0] || null;
        if (preferred) {
          setProjectMode("existing");
          setSelectedProjectId(preferred.id);
          const ownedSop = nextWorkflows.find(
            (w) =>
              !w.generic &&
              w.projectId === preferred.id &&
              (w.id === preferred.workflowId || w.status === "published"),
          );
          if (ownedSop) setSelectedWorkflowId(ownedSop.id);
          else if (preferred.workflowId)
            setSelectedWorkflowId(preferred.workflowId);
        } else {
          setProjectMode("create");
          const login = freshUser?.loginName || "team";
          const suggestedName = t("wizard.suggestedProjectName", {
            name: freshUser?.chineseName || login,
          });
          setNewProjectName(suggestedName);
          setNewProjectId(slugifyProjectId(`${login}-project`) || "my-project");
          setNewProjectKey(deriveProjectKey(login));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [open, projectId, projects, user]);

  useEffect(() => {
    if (!open || !user?.id || user.isGuest) return undefined;
    let active = true;
    let generation = 0;
    const refresh = () => {
      const version = ++generation;
      api(`/api/users/${encodeURIComponent(user.id)}/git-ssh-keys`)
        .then((keys) => {
          if (active && version === generation) setSSHCredentials({ userId: user.id, keys: Array.isArray(keys) ? keys : [], error: false });
        })
        .catch(() => {
          if (active && version === generation) setSSHCredentials({ userId: user.id, keys: [], error: true });
        });
    };
    const credentialsChanged = (event) => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === "agentflow-credentials-changed") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("message", credentialsChanged);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("message", credentialsChanged);
    };
  }, [open, user?.id, user?.isGuest]);

  useEffect(() => {
    if (!open || !selectedWorkflowId) return undefined;
    // Only platform templates have template roles; a project SOP would 404.
    const known = (workflows || []).find((w) => w.id === selectedWorkflowId);
    if (known && !known.generic) {
      setTemplateAgents([]);
      return undefined;
    }
    let active = true;
    api(`/api/workflows/${encodeURIComponent(selectedWorkflowId)}/agents`)
      .then((rows) => {
        if (active && Array.isArray(rows) && rows.length)
          setTemplateAgents(rows);
      })
      .catch(() => {
        if (active) setTemplateAgents([]);
      });
    return () => {
      active = false;
    };
  }, [open, selectedWorkflowId, workflows]);

  useEffect(() => {
    if (!open) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [open, step, phase]);

  useEffect(() => {
    if (!open) return undefined;
    const refreshUser = () => {
      api("/api/users")
        .then((usersRes) => {
          const fresh = (usersRes || []).find(
            (item) => Number(item.id) === Number(user?.id),
          );
          if (fresh) {
            setStoredUser((prev) => mergeFreshUser(prev, fresh));
            if (fresh.gitHubCredentialConfigured) {
              void verifyStoredGitToken(fresh.id);
            }
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refreshUser);
    const credentialsChanged = (event) => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === "agentflow-credentials-changed") refreshUser();
    };
    window.addEventListener("message", credentialsChanged);
    return () => {
      window.removeEventListener("focus", refreshUser);
      window.removeEventListener("message", credentialsChanged);
    };
  }, [open, user?.id, verifyStoredGitToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving && !closeActiveSelect) onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  useEffect(() => {
    if (projectMode !== "create" || !parsedRepo) return;
    if (!newProjectName.trim()) setNewProjectName(parsedRepo.name);
    if (!idTouched)
      setNewProjectId(slugifyProjectId(parsedRepo.name) || "my-project");
    if (!keyTouched) setNewProjectKey(deriveProjectKey(parsedRepo.name));
  }, [parsedRepo, projectMode, newProjectName, idTouched, keyTouched]);

  useEffect(() => {
    if (!open || projectMode !== "existing" || !currentProject) return;
    const ownedSop = (workflows || []).find(
      (w) =>
        !w.generic &&
        w.projectId === currentProject.id &&
        (w.id === currentProject.workflowId || w.status === "published"),
    );
    if (ownedSop) setSelectedWorkflowId(ownedSop.id);
    else if (currentProject.workflowId)
      setSelectedWorkflowId(currentProject.workflowId);
    else setSelectedWorkflowId(DEFAULT_SOP_ID);
  }, [open, projectMode, currentProject?.id]);

  // A new project starts from the platform template; the SOP picked for the
  // previously selected project belongs to that project and is not offered.
  useEffect(() => {
    if (open && projectMode === "create") setSelectedWorkflowId(DEFAULT_SOP_ID);
  }, [open, projectMode]);

  const roles = useMemo(() => {
    if (activeWorkflow && !activeWorkflow.generic) {
      const boundIds = new Set(
        (activeWorkflow.nodes || []).map((n) => n.agentId).filter(Boolean),
      );
      const matched = (projectAgents || []).filter(
        (a) =>
          boundIds.has(a.id) ||
          a.projectId === (activeWorkflow.projectId || currentProject?.id),
      );
      if (matched.length) return matched;
    }
    return templateAgents.length ? templateAgents : getFallbackRoles();
  }, [activeWorkflow, projectAgents, currentProject?.id, templateAgents]);

  if (!presence.mounted) return null;

  const closing = presence.phase === "closing";
  const activeStepIndex = phase === "success" ? STEPS.length - 1 : step;
  const activeStep = STEPS[activeStepIndex] || STEPS[0];
  const wizardStepCount = STEPS.length - 1;
  const gitReady = Boolean(storedUser?.gitHubCredentialConfigured || gitToken.trim());
  const hasSSHKeys = Boolean(storedUser?.gitSshKeyConfigured);
  const selectedSSHRepo = parsedRepo || parseGongfengRepo(defaultRepo?.cloneUrl);
  const sshKeysLoaded = sshCredentials.userId === user?.id && sshCredentials.keys !== null;
  const hasSSHKey = (remote) => sshKeysLoaded && !sshCredentials.error && sshCredentials.keys.some(
    (key) => globalThis.LoopForgeGitSSHHost(key.host) === remote?.host,
  );
  const sshReady = hasSSHKey(selectedSSHRepo);
  const sshRepository = (parsedRepo || defaultRepo)?.provider === "ssh";
  const codeBuddyReady = Boolean(
    storedUser?.codeBuddyApiKeyConfigured || codeBuddyApiKey.trim(),
  );
  // The CLI gets the stored text as-is: an old value such as china preselects
  // what it meant, and still differs from it, so 下一步 rewrites it.
  const storedCodeBuddyEnvRaw = String(
    storedUser?.codeBuddyInternetEnvironment || "",
  ).trim();
  const storedCodeBuddyEnv =
    codeBuddyEnvironmentIntent(storedCodeBuddyEnvRaw)?.value ?? "";
  const codeBuddyEnvLegacy = codeBuddyEnvironmentLegacy(storedCodeBuddyEnvRaw);
  const codeBuddyEnv = codeBuddyEnvChoice ?? storedCodeBuddyEnv;
  const codeBuddyEnvInfo =
    codeBuddyEnvironment(codeBuddyEnv) || CODEBUDDY_ENVIRONMENTS[0];
  const codeBuddyWarning = codeBuddyKeyWarning(codeBuddyApiKey);
  const nodes =
    activeWorkflow?.nodes?.filter((node) => node.type === "agent") ||
    FALLBACK_NODES;

  function goToStep(next) {
    setDirection(next < step ? "back" : "forward");
    setStepAnimated(true);
    setStep(next);
  }

  async function saveTypedCredentials() {
    if (!user?.id) return storedUser;
    const payload = {};
    let savedGit = false;
    if (gitToken.trim()) {
      const endpoint = `/api/users/${encodeURIComponent(user.id)}/git-http-credentials`;
      const credentials = await api(endpoint);
      const existing = credentials.find(credential => credential.host === "github.com");
      await write(endpoint, { ...(existing ? {id:existing.id} : {}), host:"github.com", platform:"github", name:"GitHub", username:"x-access-token", token:gitToken.trim() }, "PUT");
      savedGit = true;
    }
    if (codeBuddyApiKey.trim())
      payload.codeBuddyApiKey = codeBuddyApiKey.trim();
    // A key is always saved with the environment it was issued for.
    if (codeBuddyApiKey.trim() || codeBuddyEnv !== storedCodeBuddyEnvRaw)
      payload.codeBuddyInternetEnvironment = codeBuddyEnv;
    if (!Object.keys(payload).length && !savedGit) return storedUser;
    const saved = await write(
      `/api/users/${encodeURIComponent(user.id)}/credentials`,
      payload,
      "PUT",
    );
    const merged = { ...storedUser, ...saved };
    // The server omits an empty environment, so 国际站 must overwrite the old value here.
    if ("codeBuddyInternetEnvironment" in payload)
      merged.codeBuddyInternetEnvironment =
        saved?.codeBuddyInternetEnvironment || "";
    setStoredUser(merged);
    setGitToken("");
    setCodeBuddyApiKey("");
    setCodeBuddyEnvChoice(null);
    void onCredentialsSaved?.();
    window.parent !== window &&
      window.parent.postMessage(
        { type: "agentflow-credentials-changed" },
        location.origin,
      );
    return merged;
  }

  async function verifyGit() {
    if (!user?.id || verifyingGit) return;
    setVerifyingGit(true);
    setGitVerify(null);
    setError("");
    try {
      const typed = gitToken.trim();
      const result = typed
        ? await write(
            `/api/users/${encodeURIComponent(user.id)}/git-token/verify`,
            { token: typed },
          )
        : await api(
            `/api/users/${encodeURIComponent(user.id)}/git-token/verify`,
          );
      setGitVerify(result);
      if (result?.valid && typed) await saveTypedCredentials();
    } catch (err) {
      setGitVerify({ valid: false, error: err.message });
    } finally {
      setVerifyingGit(false);
    }
  }

  async function nextStep() {
    if (saving) return;
    setError("");
    if (activeStep.id === "auth") {
      if (!gitReady && !hasSSHKeys && !codeBuddyReady && !sponsoredModel) {
        setError(t("wizard.errMissingCreds"));
        return;
      }
      setSaving(true);
      try {
        await saveTypedCredentials();
        goToStep(1);
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (activeStep.id === "project") {
      if (projectMode === "create") {
        const id = slugifyProjectId(newProjectId || newProjectName);
        if (!id || !newProjectName.trim()) {
          setError(t("wizard.errMissingProjectFields"));
          return;
        }
        // Saving a project with an existing id replaces it (members, TAPD
        // settings), so "new project" must never land on an existing one.
        if (catalogProjects.some((item) => item.id === id)) {
          setError(t("wizard.errProjectIdExistsSwitch", { id }));
          return;
        }
      } else if (!currentProject) {
        setError(t("wizard.errSelectProject"));
        return;
      }
      if (bindRepoNow && repoUrl.trim() && repoBindBlocked) {
        setError(
          t("wizard.errNotProjectOwner", {
            name: currentProject?.name || t("wizard.thisProject"),
          }),
        );
        return;
      }
      if (bindRepoNow && repoUrl.trim() && !parsedRepo) {
        setError(t("wizard.errInvalidRepoUrl"));
        return;
      }
      goToStep(2);
      return;
    }
    if (activeStep.id === "workflow") {
      await finishSetup();
    }
  }

  async function finishSetup() {
    setSaving(true);
    setError("");
    try {
      const latestUser = await saveTypedCredentials();
      let targetProject = currentProject;
      // Save the SOP the page shows; a stale id hidden by the current
      // filter must never be bound to the project.
      const sopId = activeWorkflow?.id || DEFAULT_SOP_ID;
      if (projectMode === "create") {
        const id = slugifyProjectId(newProjectId || newProjectName);
        const key = deriveProjectKey(newProjectKey || id);
        if (catalogProjects.some((item) => item.id === id))
          throw new Error(t("wizard.errProjectIdExists", { id }));
        targetProject = await write(
          "/api/projects",
          {
            id,
            key,
            name: newProjectName.trim(),
            description: "",
            color: "#536dfe",
            ownerId: Number(user?.id) || 0,
            workflowId: sopId,
            members: [],
          },
          "POST",
        );
      } else if (
        targetProject &&
        targetProject.workflowId !== sopId &&
        Number(targetProject.ownerId) === Number(user?.id)
      ) {
        targetProject = await write(
          "/api/projects",
          { ...targetProject, workflowId: sopId },
          "PUT",
        );
      }

      let boundRepo = defaultRepo;
      if (bindRepoNow && parsedRepo && targetProject?.id && !repoBindBlocked) {
        const existingRepo = (repositories || []).find(
          (repo) =>
            repo.projectId === targetProject.id &&
            (["ssh", "https"].includes(parsedRepo.provider)
              ? repo.cloneUrl === parsedRepo.cloneUrl
              : repo.gongfengProjectId === parsedRepo.project ||
                repo.webUrl === parsedRepo.webUrl),
        );
        if (existingRepo) {
          boundRepo = await write(
            "/api/repositories",
            {
              ...existingRepo,
              provider: parsedRepo.provider,
              name: parsedRepo.name,
              gongfengProjectId: parsedRepo.project,
              webUrl: parsedRepo.webUrl || existingRepo.webUrl,
              cloneUrl: parsedRepo.cloneUrl,
              defaultBranch: repoBranch.trim() || "main",
              repoUrl: repoUrl.trim(),
            },
            "PUT",
          );
        } else {
          boundRepo = await write("/api/repositories", {
            projectId: targetProject.id,
            provider: parsedRepo.provider || "gongfeng",
            name: parsedRepo.name,
            gongfengProjectId: parsedRepo.project,
            webUrl: parsedRepo.webUrl,
            cloneUrl: parsedRepo.cloneUrl,
            defaultBranch: repoBranch.trim() || "main",
            repoUrl: repoUrl.trim(),
          });
        }
      }

      let provisionedWorkflow = activeWorkflow;
      if (targetProject?.id) {
        const selectedConcrete = (workflows || []).find(
          (item) => item.id === sopId && !item.generic,
        );
        const existingProjectSop =
          selectedConcrete ||
          (workflows || []).find(
            (item) =>
              !item.generic &&
              item.projectId === targetProject.id &&
              ((item.tags || []).includes(`generic-source:${sopId}`) ||
                item.id === `${sopId}-${targetProject.id}` ||
                item.name === (activeWorkflow?.name || t("operations.genericBackendSop"))),
          );
        if (existingProjectSop) {
          provisionedWorkflow = existingProjectSop;
        } else {
          const hasStoredGeneric = (workflows || []).some(
            (item) => item.id === sopId && item.generic,
          );
          const cloneId = `${sopId}-${targetProject.id}`.slice(0, 60);
          const ownerName =
            user?.chineseName || user?.loginName || t("wizard.platformOwner");
          if (hasStoredGeneric) {
            try {
              const cloned = await write(
                `/api/workflows/${encodeURIComponent(sopId)}/clone`,
                {
                  id: cloneId,
                  name: (activeWorkflow?.name || t("operations.genericBackendSop")).replace(
                    /^(?:通用|Generic\s*)/i,
                    "",
                  ),
                  owner: ownerName,
                  projectId: targetProject.id,
                },
              );
              provisionedWorkflow = await write(
                `/api/workflows/${encodeURIComponent(cloned.id)}/publish`,
                {},
              ).catch(() => cloned);
            } catch {
              provisionedWorkflow = await provisionFallbackProjectSOP(
                targetProject.id,
                cloneId,
                ownerName,
              );
            }
          } else {
            provisionedWorkflow = await provisionFallbackProjectSOP(
              targetProject.id,
              cloneId,
              ownerName,
            );
          }
        }

        if (
          Number(targetProject.ownerId) === Number(user?.id) &&
          (boundRepo?.id || provisionedWorkflow?.id)
        ) {
          const nextDefaultRepoId =
            boundRepo?.id &&
            (projectMode === "create" ||
              !targetProject.defaultRepositoryId ||
              makeDefaultRepo)
              ? boundRepo.id
              : targetProject.defaultRepositoryId || "";
          targetProject = await write(
            "/api/projects",
            {
              ...targetProject,
              workflowId:
                provisionedWorkflow?.id || targetProject.workflowId || sopId,
              defaultRepositoryId: nextDefaultRepoId,
            },
            "PUT",
          );
        }
      }

      window.parent !== window &&
        window.parent.postMessage(
          {
            type: "agentflow-quick-access-completed",
            projectId: targetProject?.id || "",
          },
          location.origin,
        );

      setCompletedSummary({
        project: targetProject,
        repository: boundRepo,
        workflow: provisionedWorkflow || activeWorkflow,
        rolesCount: roles.length,
        gitReady: Boolean(boundRepo?.provider === "ssh" ? hasSSHKey(parseGongfengRepo(boundRepo.cloneUrl)) : latestUser?.gitHubCredentialConfigured),
        codeBuddyReady: Boolean(
          latestUser?.codeBuddyApiKeyConfigured ||
            storedUser?.codeBuddyApiKeyConfigured,
        ),
      });
      setPhase("success");
      await onCompleted?.(targetProject?.id || "");
    } catch (err) {
      setError(err.message || t("wizard.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="qa-backdrop"
      role="presentation"
      data-phase={presence.phase}
      inert={closing}
      aria-hidden={closing || undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving && !closing)
          onClose?.();
      }}
    >
      <div
        className="qa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qa-wizard-title"
      >
        <aside className="qa-rail" aria-label={t("wizard.railAria")}>
          <div className="qa-rail-head">
            <div className="qa-brand-mark">
              <HarnessIcon name="sparkles" size={20} />
            </div>
            <h2 id="qa-wizard-title">{t("wizard.title")}</h2>
            <p>{t("wizard.subtitle")}</p>
          </div>
          <ol className="qa-steps">
            {STEPS.map((item, index) => {
              const done = index < activeStepIndex;
              const current = index === activeStepIndex;
              return (
                <li
                  key={item.id}
                  className={[
                    "qa-step",
                    done && "is-done",
                    current && "is-active",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={current ? "step" : undefined}
                >
                  <div className="qa-step-mark">
                    <span
                      className="qa-step-no"
                      aria-hidden={done || undefined}
                    >
                      {item.id === "done" ? (
                        <HarnessIcon name="flag" size={13} interactive={false} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="qa-step-check" aria-hidden="true">
                      <HarnessIcon name="check" size={13} interactive={false} />
                    </span>
                  </div>
                  <div className="qa-step-copy">
                    <div className="qa-step-title">{item.title}</div>
                    <div className="qa-step-desc">{item.desc}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="qa-rail-foot">{t("wizard.railFoot")}</p>
        </aside>

        <div className="qa-main">
          <button
            type="button"
            className="qa-close"
            aria-label={t("wizard.closeAria")}
            disabled={saving}
            onClick={onClose}
          >
            <HarnessIcon name="close" size={16} />
          </button>

          {phase === "success" ? (
            <>
              <div ref={bodyRef} className="qa-body">
                <div className="qa-success">
                  <div className="qa-success-head">
                    <div className="qa-success-mark" aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="52" height="52">
                        <circle
                          className="qa-success-ring"
                          cx="24"
                          cy="24"
                          r="22"
                          pathLength="1"
                        />
                        <path
                          className="qa-success-tick"
                          d="M15 24.5l6 6 12-13"
                          pathLength="1"
                        />
                      </svg>
                    </div>
                    <h3
                      ref={headingRef}
                      tabIndex={-1}
                      className="qa-title qa-success-item"
                      style={{ "--i": 0 }}
                    >
                      {t("wizard.successTitle")}
                    </h3>
                    <p className="qa-lede qa-success-item" style={{ "--i": 1 }}>
                      {t("wizard.successDesc", {
                        name: completedSummary?.workflow?.name || t("operations.genericBackendSop"),
                      })}
                    </p>
                  </div>

                  <div className="qa-success-grid">
                    <section
                      className="qa-card qa-success-item"
                      style={{ "--i": 2 }}
                    >
                      <div className="qa-card-title">{t("wizard.defaultRolesAndSop")}</div>
                      <ul className="qa-role-list">
                        {roles.slice(0, 6).map((role) => (
                          <li key={role.id}>
                            <span className="qa-avatar">
                              {(role.name || t("wizard.roleFallbackChar")).slice(0, 1)}
                            </span>
                            <span>{role.name}</span>
                            <small>{t("wizard.defaultRole")}</small>
                          </li>
                        ))}
                        <li>
                          <span className="qa-avatar is-flow">
                            <HarnessIcon name="workflow" size={13} />
                          </span>
                          <span>
                            {completedSummary?.workflow?.name ||
                              t("operations.genericBackendSop")}
                          </span>
                          <small>{t("wizard.bound")}</small>
                        </li>
                      </ul>
                    </section>

                    <section
                      className="qa-card qa-success-item"
                      style={{ "--i": 3 }}
                    >
                      <div className="qa-card-title">{t("wizard.effectiveConfig")}</div>
                      <ul className="qa-status-list">
                        <li
                          className={
                            completedSummary?.gitReady ? "is-ok" : "is-warn"
                          }
                        >
                          <HarnessIcon
                            name={completedSummary?.gitReady ? "check" : "info"}
                            size={14}
                          />
                          <span>
                            {completedSummary?.repository?.provider === "ssh" ? t("wizard.gitSshPrefix") : t("wizard.githubPrefix")}
                            {completedSummary?.gitReady
                              ? t("wizard.statusReady")
                              : t("wizard.gitNotConfigured")}
                          </span>
                        </li>
                        <li
                          className={
                            completedSummary?.codeBuddyReady || sponsoredModel
                              ? "is-ok"
                              : "is-warn"
                          }
                        >
                          <HarnessIcon
                            name={
                              completedSummary?.codeBuddyReady
                                ? "check"
                                : "info"
                            }
                            size={14}
                          />
                          <span>
                            CodeBuddy API Key：
                            {completedSummary?.codeBuddyReady
                              ? t("wizard.configured")
                              : sponsoredModel
                                ? t("wizard.codeBuddySponsored", {
                                    models: sharedModelNames(sponsoredModels, sponsoredModel),
                                  })
                                : t("wizard.codeBuddyMissing")}
                          </span>
                        </li>
                        <li className="is-ok">
                          <HarnessIcon name="check" size={14} />
                          <span>
                            {t("wizard.projectPrefix")}
                            {completedSummary?.project?.name || t("wizard.currentProject")}
                            {completedSummary?.repository?.name
                              ? t("wizard.repoNameSuffix", { name: completedSummary.repository.name })
                              : t("wizard.repoRuntimeSuffix")}
                          </span>
                        </li>
                      </ul>
                    </section>
                  </div>

                  <div className="qa-actions-grid">
                    <button
                      type="button"
                      className="qa-action is-primary qa-success-item"
                      style={{ "--i": 4 }}
                      onClick={() => onClose?.()}
                    >
                      <span className="qa-action-icon">
                        <HarnessIcon name="play" size={16} />
                      </span>
                      <span className="qa-action-copy">
                        <strong>{t("wizard.startFirstReqTitle")}</strong>
                        <small>{t("wizard.startFirstReqDesc")}</small>
                      </span>
                      <HarnessIcon
                        name="chevron-right"
                        size={16}
                        className="qa-action-chevron"
                      />
                    </button>
                    <button
                      type="button"
                      className="qa-action qa-success-item"
                      style={{ "--i": 5 }}
                      data-hover-ink-control=""
                      onClick={() => {
                        onClose?.();
                        onOpenView?.("sops");
                      }}
                    >
                      <span className="qa-action-icon">
                        <HarnessIcon name="workflow" size={16} />
                      </span>
                      <span className="qa-action-copy">
                        <strong>{t("wizard.editSopTitle")}</strong>
                        <small>{t("wizard.editSopDesc")}</small>
                      </span>
                      <HarnessIcon
                        name="chevron-right"
                        size={16}
                        className="qa-action-chevron"
                      />
                    </button>
                  </div>
                </div>
              </div>
              <footer className="qa-footer">
                <div className="qa-footer-spacer" />
                <button
                  type="button"
                  className="qa-btn qa-btn-ghost"
                  data-hover-ink-control=""
                  onClick={onClose}
                >
                  {t("common.close")}
                </button>
              </footer>
            </>
          ) : (
            <>
              <div ref={bodyRef} className="qa-body">
                <div
                  key={activeStep.id}
                  className={`qa-stage ${stepAnimated ? "is-entering" : ""}`}
                  data-direction={direction}
                >
                  <div className="qa-kicker">
                    {t("wizard.stepProgress", { current: activeStepIndex + 1, total: wizardStepCount })}
                  </div>
                  <h3 ref={headingRef} tabIndex={-1} className="qa-title">
                    {activeStep.title}
                  </h3>

                  {error ? (
                    <p key={error} className="qa-note is-err" role="alert">
                      <HarnessIcon name="info" size={14} interactive={false} />
                      <span>{error}</span>
                    </p>
                  ) : null}

                  {activeStep.id === "auth" ? (
                    <div className="qa-pane">
                      <section className="qa-cred-card">
                        <header className="qa-cred-head">
                          <div>
                            <strong>{t("wizard.githubAuthTitle")}</strong>
                            <span>{t("wizard.githubAuthDesc")}</span>
                          </div>
                          <StatusPill ok={gitReady} />
                        </header>
                        <div className="qa-cred-body">
                          <button type="button" className="qa-btn qa-btn-primary qa-btn-sm" onClick={() => openCredentialSettings("gitToken")}>
                            {storedUser?.gitHubCredentialConfigured ? t("wizard.manageGithub") : t("wizard.connectGithub")}
                          </button>
                          <p className="qa-hint">{t("wizard.oauthHint")}</p>
                          <p className="qa-hint">{t("wizard.sshHintPrefix")}<button type="button" className="qa-link-btn" onClick={() => openCredentialSettings("gitSshKey")}>{hasSSHKeys ? t("wizard.manageSsh") : t("wizard.configureSsh")}</button></p>
                          <p className="qa-hint">{t("wizard.httpHintPrefix")}<button type="button" className="qa-link-btn" onClick={() => openCredentialSettings("gitHttpCredentials")}>{storedUser?.gitHttpCredentialsConfigured ? t("wizard.manageHttp") : t("wizard.configureHttp")}</button></p>
                          <details>
                            <summary>{t("wizard.usePatSummary")}</summary>
                          <div className="qa-input-row">
                            <input
                              type="password"
                              className="qa-input"
                              value={gitToken}
                              onChange={(e) => setGitToken(e.target.value)}
                              placeholder={
                                storedUser?.gitHubCredentialConfigured
                                  ? t("wizard.patKeepPlaceholder")
                                  : t("wizard.patPlaceholder")
                              }
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="qa-btn qa-btn-outline qa-btn-sm qa-btn-field"
                              data-hover-ink-control=""
                              aria-busy={verifyingGit || undefined}
                              disabled={
                                !verifyingGit &&
                                !gitToken.trim() &&
                                !storedUser?.gitHubCredentialConfigured
                              }
                              onClick={verifyGit}
                            >
                              <BusyLabel
                                busy={verifyingGit}
                                busyLabel={t("wizard.verifying")}
                              >
                                {t("wizard.verify")}
                              </BusyLabel>
                            </button>
                            <a
                              className="qa-link"
                              data-hover-ink-control=""
                              href="https://github.com/settings/tokens"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("wizard.createToken")}
                            </a>
                          </div>
                          {gitVerify ? (
                            <VerifyMessage
                              result={gitVerify}
                              okText={gitVerify.login ? t("wizard.tokenValidLogin", { login: gitVerify.login }) : t("wizard.tokenValid")}
                            />
                          ) : null}
                          </details>
                        </div>
                      </section>

                      <section className="qa-cred-card">
                        <header className="qa-cred-head">
                          <div>
                            <strong>CodeBuddy API Key</strong>
                            <span>
                              {sponsoredModel
                                ? t("wizard.codeBuddySponsoredHint")
                                : t("wizard.codeBuddyHint")}
                            </span>
                          </div>
                          <StatusPill ok={codeBuddyReady} />
                        </header>
                        <div className="qa-cred-body">
                          <div className="qa-field">
                            <span className="qa-label">{t("wizard.networkEnv")}</span>
                            <HarnessSelect
                              value={codeBuddyEnv}
                              options={CODEBUDDY_ENVIRONMENTS.map((env) => ({
                                value: env.value,
                                label: env.label,
                                hint: env.site,
                              }))}
                              onChange={setCodeBuddyEnvChoice}
                              ariaLabel={t("wizard.codeBuddyEnvAria")}
                            />
                          </div>
                          <div className="qa-input-row">
                            <input
                              type="password"
                              className="qa-input"
                              value={codeBuddyApiKey}
                              onChange={(e) =>
                                setCodeBuddyApiKey(e.target.value)
                              }
                              placeholder={
                                storedUser?.codeBuddyApiKeyConfigured
                                  ? t("wizard.patKeepPlaceholder")
                                  : t("wizard.codeBuddyPlaceholder")
                              }
                              aria-label="CodeBuddy API Key"
                              autoComplete="new-password"
                            />
                            <a
                              className="qa-link"
                              data-hover-ink-control=""
                              href={codeBuddyKeyURL(codeBuddyEnv)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("wizard.getApiKey")}
                            </a>
                          </div>
                          <p
                            className={`qa-hint${codeBuddyWarning ? " is-warn" : ""}`}
                            role="status"
                          >
                            {codeBuddyWarning ||
                              t("wizard.envSiteHint", {
                                legacy:
                                  codeBuddyEnvLegacy && codeBuddyEnvChoice === null
                                    ? t("wizard.legacyEnvPrefix", { raw: storedCodeBuddyEnvRaw })
                                    : "",
                                label: codeBuddyEnvInfo.label,
                                site: codeBuddyEnvInfo.site,
                              })}
                          </p>
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {activeStep.id === "project" ? (
                    <div className="qa-pane">
                      {editableProjects.length ? (
                        <SlidingTabs
                          className="qa-sliding-tabs qa-sliding-tabs-inline"
                          aria-label={t("wizard.projectModeAria")}
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={projectMode === "existing"}
                            onClick={() => setProjectMode("existing")}
                          >
                            <HarnessIcon name="folder" size={14} />
                            {t("wizard.existingProject")}
                            <span className="sliding-tab-count">
                              {editableProjects.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={projectMode === "create"}
                            onClick={() => setProjectMode("create")}
                          >
                            <HarnessIcon name="sparkles" size={14} />
                            {t("app.newProject")}
                          </button>
                        </SlidingTabs>
                      ) : null}

                      {projectMode === "existing" && editableProjects.length ? (
                        <section
                          key="existing"
                          className="qa-section qa-fade-in"
                        >
                          <div className="qa-field">
                            <span className="qa-label">{t("wizard.selectProjectLabel")}</span>
                            <HarnessSelect
                              value={currentProject?.id || ""}
                              options={projectSelectOptions}
                              onChange={setSelectedProjectId}
                              searchable={projectSelectOptions.length > 4}
                              searchPlaceholder={t("wizard.searchProjectsPlaceholder")}
                              ariaLabel={t("wizard.selectProjectLabel")}
                            />
                          </div>
                          {projectRepos.length ? (
                            <div className="qa-bound-repo-list">
                              {projectRepos.map((repo) => {
                                const isDef =
                                  repo.id ===
                                  (currentProject?.defaultRepositoryId ||
                                    defaultRepo?.id);
                                return (
                                  <div key={repo.id} className="qa-bound-repo">
                                    <span
                                      className={`qa-status-pill ${isDef ? "is-ok" : ""}`}
                                    >
                                      {isDef ? t("wizard.defaultRepoBadge") : t("wizard.linkedRepoBadge")}
                                    </span>
                                    <strong>{repo.name}</strong>
                                    <code>
                                      {repo.provider === "github" && repo.webUrl
                                        ? repo.webUrl.replace(
                                            /^https?:\/\//,
                                            "",
                                          )
                                        : repo.gongfengProjectId || repo.webUrl || repo.cloneUrl}
                                    </code>
                                    <small>
                                      {repo.defaultBranch || "main"}
                                    </small>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </section>
                      ) : (
                        <section
                          key="create"
                          className="qa-section qa-grid-3 qa-fade-in"
                        >
                          <label className="qa-field">
                            <span className="qa-label">
                              {t("wizard.projectNameLabel")} <em>*</em>
                            </span>
                            <input
                              className="qa-input"
                              value={newProjectName}
                              onChange={(e) => {
                                const value = e.target.value;
                                setNewProjectName(value);
                                if (!idTouched)
                                  setNewProjectId(
                                    slugifyProjectId(value) || "my-project",
                                  );
                                if (!keyTouched)
                                  setNewProjectKey(deriveProjectKey(value));
                              }}
                              placeholder={t("wizard.projectNamePlaceholder")}
                            />
                          </label>
                          <label className="qa-field">
                            <span className="qa-label">
                              {t("wizard.projectIdLabel")} <em>*</em>
                            </span>
                            <input
                              className="qa-input qa-mono"
                              value={newProjectId}
                              onChange={(e) => {
                                setIdTouched(true);
                                setNewProjectId(e.target.value);
                              }}
                              placeholder="gateway-service"
                            />
                          </label>
                          <label className="qa-field">
                            <span className="qa-label">{t("wizard.projectKeyLabel")}</span>
                            <input
                              className="qa-input qa-mono"
                              value={newProjectKey}
                              onChange={(e) => {
                                setKeyTouched(true);
                                setNewProjectKey(e.target.value.toUpperCase());
                              }}
                              placeholder="GW"
                            />
                          </label>
                        </section>
                      )}

                      <section
                        className={`qa-cred-card ${bindRepoNow ? "" : "is-collapsed"}`}
                      >
                        <header className="qa-cred-head">
                          <div>
                            <strong>
                              {projectMode === "existing" && projectRepos.length
                                ? t("wizard.addRepoHeading")
                                : t("wizard.bindRepoHeading")}
                            </strong>
                            <span
                              key={String(bindRepoNow)}
                              className="qa-fade-in"
                            >
                              {projectMode === "existing" && projectRepos.length
                                ? bindRepoNow
                                  ? t("wizard.existingRepoOpenHint")
                                  : t("wizard.existingRepoClosedHint")
                                : bindRepoNow
                                  ? t("wizard.newRepoOpenHint")
                                  : t("wizard.newRepoClosedHint")}
                            </span>
                          </div>
                          <HarnessSwitch
                            checked={bindRepoNow}
                            onChange={setBindRepoNow}
                            label={t("wizard.toggleRepoLabel")}
                          />
                        </header>

                        <div
                          className={`qa-collapse ${bindRepoNow ? "" : "is-closed"}`}
                          inert={!bindRepoNow}
                          aria-hidden={!bindRepoNow || undefined}
                        >
                          <div className="qa-collapse-inner">
                            <div className="qa-cred-body">
                              {repoBindBlocked ? (
                                <div
                                  className="qa-hint is-warn qa-repo-permission"
                                  role="note"
                                >
                                  <p>
                                    {t("wizard.repoBlockedNote", { name: currentProject?.name || "" })}
                                  </p>
                                  <div className="qa-repo-permission-actions">
                                    <button
                                      type="button"
                                      className="qa-link-btn"
                                      onClick={() => {
                                        setError("");
                                        setProjectMode("create");
                                      }}
                                    >
                                      {t("wizard.createOwnProject")}
                                    </button>
                                    <button
                                      type="button"
                                      className="qa-link-btn"
                                      onClick={() => {
                                        setError("");
                                        setBindRepoNow(false);
                                      }}
                                    >
                                      {t("wizard.skipRepoBind")}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              <div className="qa-repo-grid">
                                <label className="qa-field">
                                  <span className="qa-label">
                                    {projectMode === "existing" &&
                                    projectRepos.length
                                      ? t("wizard.newRepoUrlLabel")
                                      : t("wizard.repoUrlLabel")}
                                  </span>
                                  <input
                                    className="qa-input qa-mono"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                  />
                                </label>
                                <div className="qa-field">
                                  <span className="qa-label">{t("wizard.defaultBranch")}</span>
                                  <HarnessSelect
                                    value={repoBranch}
                                    options={BRANCH_OPTIONS}
                                    onChange={setRepoBranch}
                                    searchable
                                    allowCustom
                                    searchPlaceholder={t("wizard.branchPlaceholder")}
                                    ariaLabel={t("wizard.defaultBranch")}
                                  />
                                </div>
                              </div>
                              {projectMode === "existing" &&
                              projectRepos.length &&
                              parsedRepo ? (
                                <div className="qa-repo-default-row qa-msg-in">
                                  <span>
                                    {t("wizard.recognizedAsDefaultPrefix")}
                                    <code>{parsedRepo.project}</code>
                                    {t("wizard.recognizedAsDefaultSuffix")}
                                  </span>
                                  <HarnessSwitch
                                    checked={makeDefaultRepo}
                                    onChange={setMakeDefaultRepo}
                                    label={t("wizard.setAsDefaultRepo")}
                                  />
                                </div>
                              ) : parsedRepo ? (
                                <p
                                  key="recognized"
                                  className="qa-hint is-ok qa-msg-in"
                                >
                                  {t("wizard.recognizedRepoPrefix")}
                                  <code>{parsedRepo.project}</code>
                                  {t("wizard.recognizedRepoNameOpen")}
                                  <code>{parsedRepo.name}</code>
                                  {t("wizard.recognizedRepoNameClose")}
                                </p>
                              ) : (
                                <p key="help" className="qa-hint">
                                  {t("wizard.repoUrlHelpPrefix")}<code>git@gitlab.com:group/repo.git</code>.
                                </p>
                              )}
                              {selectedSSHRepo?.provider === "ssh" && sshKeysLoaded && !sshReady ? (
                                <p className="qa-hint is-error" role="alert">
                                  {sshCredentials.error ? t("wizard.sshKeysReadError") : t("wizard.sshKeyMissingHost", { host: selectedSSHRepo.host })}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {activeStep.id === "workflow" ? (
                    <div className="qa-pane">
                      <div className="qa-field">
                        <span className="qa-label">{t("wizard.defaultSop")}</span>
                        <HarnessSelect
                          value={activeWorkflow?.id || DEFAULT_SOP_ID}
                          options={sopSelectOptions}
                          onChange={setSelectedWorkflowId}
                          ariaLabel={t("wizard.defaultSop")}
                        />
                      </div>

                      <section className="qa-card qa-canvas">
                        <div className="qa-canvas-head">
                          <SlidingTabs
                            className="qa-sliding-tabs qa-sliding-tabs-inline"
                            aria-label={t("wizard.previewTabsAria")}
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={previewTab === "stages"}
                              onClick={() => setPreviewTab("stages")}
                            >
                              <HarnessIcon name="workflow" size={14} />
                              {t("wizard.stageChain")}
                              <span className="sliding-tab-count">
                                {nodes.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={previewTab === "roles"}
                              onClick={() => setPreviewTab("roles")}
                            >
                              <HarnessIcon name="user" size={14} />
                              {t("wizard.defaultRoles")}
                              <span className="sliding-tab-count">
                                {roles.length}
                              </span>
                            </button>
                          </SlidingTabs>
                        </div>

                        {previewTab === "stages" ? (
                          <div
                            key="stages"
                            className="qa-flow-track qa-stagger"
                            aria-label={t("wizard.stagePreviewAria")}
                          >
                            <div
                              className="qa-flow-node is-edge"
                              style={{ "--i": 0 }}
                            >
                              <strong>{t("wizard.startNode")}</strong>
                              <span>{t("wizard.inputNode")}</span>
                            </div>
                            {nodes.map((node, index) => (
                              <React.Fragment key={node.id || index}>
                                <span
                                  className="qa-flow-arrow"
                                  aria-hidden="true"
                                  style={{ "--i": index * 2 + 1 }}
                                >
                                  →
                                </span>
                                <div
                                  className="qa-flow-node"
                                  style={{ "--i": index * 2 + 2 }}
                                >
                                  <strong>{node.name}</strong>
                                  <span>{t("wizard.stageIndex", { index: index + 1 })}</span>
                                </div>
                              </React.Fragment>
                            ))}
                            <span
                              className="qa-flow-arrow"
                              aria-hidden="true"
                              style={{ "--i": nodes.length * 2 + 1 }}
                            >
                              →
                            </span>
                            <div
                              className="qa-flow-node is-edge"
                              style={{ "--i": nodes.length * 2 + 2 }}
                            >
                              <strong>{t("wizard.endNode")}</strong>
                              <span>{t("wizard.endOutputs")}</span>
                            </div>
                          </div>
                        ) : (
                          <div key="roles" className="qa-role-chips qa-stagger">
                            {roles.map((role, index) => (
                              <span
                                key={role.id}
                                className="qa-role-chip"
                                style={{ "--i": index }}
                              >
                                <i>{(role.name || t("wizard.roleFallbackChar")).slice(0, 1)}</i>
                                <b>{role.name}</b>
                                {role.description ? (
                                  <small>{role.description}</small>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="qa-card">
                        <div className="qa-card-title">{t("wizard.summaryHeading")}</div>
                        <dl className="qa-summary">
                          <div>
                            <dt>{t("wizard.summaryCreds")}</dt>
                            <dd>
                              <span
                                className={`qa-dot ${(sshRepository ? sshReady : gitReady) && (codeBuddyReady || sponsoredModel) ? "is-ok" : ""}`}
                              />
                              <span>
                                {sshRepository ? "Git SSH" : "GitHub"} {(sshRepository ? sshReady : gitReady) ? t("wizard.configured") : t("wizard.notConfigured")} ·
                                CodeBuddy{" "}
                                {codeBuddyReady
                                  ? t("wizard.configured")
                                  : sponsoredModel
                                    ? t("wizard.usingSharedModel")
                                    : t("wizard.notConfigured")}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt>{t("wizard.summaryProjectRepo")}</dt>
                            <dd>
                              <span className="qa-dot is-ok" />
                              <span>
                                {projectMode === "create"
                                  ? t("wizard.summaryCreateProject", { name: newProjectName || t("wizard.newProjectDefault") })
                                  : t("wizard.summaryUseProject", { name: currentProject?.name || t("wizard.currentProject") })}
                                {" · "}
                                {bindRepoNow && parsedRepo && !repoBindBlocked
                                  ? t("wizard.summaryBindRepo", { name: parsedRepo.name })
                                  : defaultRepo?.name || t("wizard.summaryRuntimeRepo")}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt>{t("wizard.summaryDefaultSop")}</dt>
                            <dd>
                              <span className="qa-dot is-ok" />
                              <span>
                                {activeWorkflow?.name || t("operations.genericBackendSop")}
                                {t("wizard.summaryRolesCount", { count: roles.length })}
                              </span>
                            </dd>
                          </div>
                        </dl>
                      </section>
                    </div>
                  ) : null}
                </div>
              </div>

              <footer className="qa-footer">
                <button
                  type="button"
                  className="qa-btn qa-btn-ghost"
                  data-hover-ink-control=""
                  disabled={saving}
                  onClick={onClose}
                >
                  {t("wizard.later")}
                </button>
                <div className="qa-footer-spacer" />
                {step > 0 ? (
                  <button
                    type="button"
                    className={`qa-btn qa-btn-outline ${stepAnimated && step === 1 && direction === "forward" ? "qa-back-enter" : ""}`}
                    data-hover-ink-control=""
                    disabled={saving}
                    onClick={() => {
                      setError("");
                      goToStep(Math.max(0, step - 1));
                    }}
                  >
                    <HarnessIcon name="chevron-left" size={14} />
                    {t("common.back")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="qa-btn qa-btn-primary"
                  aria-busy={saving || undefined}
                  disabled={loading && !saving}
                  onClick={nextStep}
                >
                  <BusyLabel busy={saving} busyLabel={t("wizard.saving")}>
                    {activeStep.id === "workflow" ? t("wizard.finish") : t("common.next")}
                    <HarnessIcon
                      name={
                        activeStep.id === "workflow"
                          ? "sparkles"
                          : "chevron-right"
                      }
                      size={14}
                    />
                  </BusyLabel>
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
