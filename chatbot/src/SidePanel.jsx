import React, { useEffect, useState } from "react";
import HarnessIcon from "./HarnessIcon";
import { t, useI18n } from "./i18n.js";
import SlidingTabs from "./SlidingTabs";
import HarnessSelect from "./HarnessSelect";
import { api, write, collectArtifacts } from "./api";
import { ArtifactPreview, download } from "./RichContent";
import { IconButton } from "./ui";
import {
  actionName,
  definitionTarget,
  projectEntryTarget,
} from "./platform.js";
import {
  operationSummary,
  operationValidation,
  repositoryIds,
  operationError,
} from "./operations.js";

const File = (props) => <HarnessIcon name="artifact" {...props} />;
const FileImage = (props) => <HarnessIcon name="image" {...props} />;
const GitBranch = (props) => <HarnessIcon name="workflow" {...props} />;
const ChevronRight = (props) => <HarnessIcon name="chevron-right" {...props} />;
const RefreshCw = (props) => <HarnessIcon name="refresh" {...props} />;
const X = (props) => <HarnessIcon name="close" {...props} />;
const Download = (props) => <HarnessIcon name="download" {...props} />;
const Folder = (props) => <HarnessIcon name="folder" {...props} />;
const Check = (props) => <HarnessIcon name="check" {...props} />;
const Play = (props) => <HarnessIcon name="play" {...props} />;
const UserRound = (props) => <HarnessIcon name="user" {...props} />;
const ExternalLink = (props) => (
  <HarnessIcon name="preview-expand" {...props} />
);

function useCountdown(expiresAt) {
  const deadline = expiresAt ? Date.parse(expiresAt) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(deadline)) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  if (Number.isNaN(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function formatCountdown(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DraftCard({
  artifact,
  onApply,
  onDecide,
  onPreview,
  context = {},
}) {
  useI18n();
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  const draft = artifact.draft;
  const declined = ["declined", "muted", "expired"].includes(draft.decision);
  const answerable =
    !!draft.proposal &&
    !draft.inherited &&
    !draft.saved &&
    !draft.decision &&
    !!onDecide;
  const remaining = useCountdown(
    answerable && draft.proposal.timing === "start"
      ? draft.proposal.expiresAt
      : "",
  );
  const decide = async (decision) => {
    setBusy(true);
    setError("");
    try {
      await onDecide(artifact.messageIndex, artifact.draftIndex, decision);
    } catch (e) {
      setError(operationError(e));
    } finally {
      setBusy(false);
    }
  };
  const [repositories, setRepositories] = useState([]),
    [selectedRepositories, setSelectedRepositories] = useState(null),
    [repositoryError, setRepositoryError] = useState(""),
    [loadingRepositories, setLoadingRepositories] = useState(false);
  const isImport =
    draft.tool === "issues_import_tapd" && !draft.saved && !draft.inherited;
  const projectId = draft.body?.projectId || "";
  useEffect(() => {
    let current = true;
    setRepositories([]);
    setSelectedRepositories(null);
    setRepositoryError("");
    setLoadingRepositories(isImport && !!projectId);
    if (isImport && projectId)
      api(
        "/api/assistant/references?" +
          new URLSearchParams({ projectId, type: "repository" }),
      )
        .then((rows) => {
          if (current)
            setRepositories(Array.isArray(rows) ? rows : rows.items || []);
        })
        .catch((e) => {
          if (current) setRepositoryError(operationError(e));
        })
        .finally(() => {
          if (current) setLoadingRepositories(false);
        });
    return () => {
      current = false;
    };
  }, [artifact.id, isImport, projectId]);
  const sharedSelection = context.repositorySelections?.[artifact.id];
  const selection = isImport
    ? sharedSelection?.projectId === projectId
      ? sharedSelection.ids
      : selectedRepositories
    : null;
  const ids = selection ?? repositoryIds(draft.body);
  const bodyPatch =
    selection === null ? null : { repositoryIds: ids, repositoryId: "" };
  const reviewed = bodyPatch
    ? { ...draft, body: { ...draft.body, ...bodyPatch } }
    : draft;
  const summary = operationSummary(reviewed, {
    ...context,
    references: [...repositories, ...(context.references || [])],
  });
  const validation = operationValidation(reviewed);
  const savedIssue =
    draft.saved && ["issues_save", "issues_import_tapd"].includes(draft.tool)
      ? draft.savedResult?.data || draft.savedResult
      : null;
  const target = definitionTarget(artifact);
  const entry = projectEntryTarget(draft, context.projectId);
  const Title = target ? "a" : "button";
  const Icon =
    artifact.kind === "role"
      ? UserRound
      : artifact.kind === "sop"
        ? GitBranch
        : Check;
  return (
    <div className="draft-card">
      <Title
        className="draft-title"
        {...(target
          ? { href: target.href, target: "_blank", rel: "noopener noreferrer" }
          : { onClick: () => onPreview(artifact) })}
      >
        <Icon size={17} />
        <span>
          <strong>{artifact.name}</strong>
          <small>
            {artifact.name !== actionName(draft.tool)
              ? `${actionName(draft.tool)} · `
              : ""}
            {declined
              ? draft.decision === "muted"
                ? t("sidePanel.status.muted")
                : draft.decision === "expired"
                  ? t("sidePanel.status.expired")
                  : t("sidePanel.status.declined")
              : draft.saved
              ? t("sidePanel.status.executed")
              : draft.resolved
                ? t("sidePanel.status.completed")
                : draft.inherited
                  ? t("sidePanel.status.inherited")
                  : draft.proposal
                    ? t("sidePanel.status.proposal")
                    : t("sidePanel.status.pending")}
          </small>
        </span>
        {target ? <ExternalLink size={16} /> : <ChevronRight size={16} />}
      </Title>
      <div className="operation-summary">
        {draft.proposal?.reason ? (
          <p className="proposal-reason">
            {draft.proposal.timing !== "start"
              ? t("sidePanel.proposalOptional")
              : t("sidePanel.proposalStart")}
            ：{draft.proposal.reason}
          </p>
        ) : null}
        {remaining !== null ? (
          <p className="proposal-countdown" role="timer">
            {remaining > 0
              ? t("sidePanel.countdownActive", { time: formatCountdown(remaining) })
              : t("sidePanel.countdownExpired")}
          </p>
        ) : null}
        {draft.review ? (
          <p className="muted">
            {t("sidePanel.reviewPrefix", {
              model: draft.review.model || t("sidePanel.aiReview"),
              rationale: draft.review.rationale,
            })}
          </p>
        ) : null}
        <p>{summary.effect}</p>
        {summary.fields.length ? (
          <dl>
            {summary.fields.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt>{label}</dt>
                <dd>{String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : null}
        {isImport ? (
          <fieldset className="operation-repositories">
            <legend>{t("sidePanel.reposLegend")}</legend>
            {repositories.map((repository) => (
              <label key={repository.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(repository.id)}
                  disabled={busy || uncertain}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...ids, repository.id]
                      : ids.filter((id) => id !== repository.id);
                    if (context.onRepositorySelection)
                      context.onRepositorySelection(
                        artifact.id,
                        next,
                        projectId,
                      );
                    else setSelectedRepositories(next);
                  }}
                />
                <span>{repository.name || repository.id}</span>
              </label>
            ))}
            {!repositories.length ? (
              <p className="muted">
                {loadingRepositories
                  ? t("sidePanel.reposLoading")
                  : repositoryError || t("sidePanel.reposEmpty")}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        {!draft.saved && !draft.resolved && validation ? (
          <p className="warning" role="status">
            {validation}
          </p>
        ) : null}
        <details className="operation-parameters">
          <summary>{t("sidePanel.viewParams")}</summary>
          <pre className="artifact-source">
            {JSON.stringify(
              {
                tool: draft.tool,
                path: draft.path,
                query: draft.query,
                body: reviewed.body,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
      {entry ? (
        <a className="quiet-button project-entry" href={entry.href} target="_top">
          {entry.label}
        </a>
      ) : null}
      {draft.warnings?.map((w) => (
        <p className="warning" key={w}>
          {w}
        </p>
      ))}
      {error ? <p className="error">{error}</p> : null}
      {draft.decision === "expired" && !draft.inherited ? (
        <button type="button" className="quiet-button" disabled>
          {t("sidePanel.expiredAutoExecuted")}
        </button>
      ) : null}
      {!draft.inherited && !target && onApply && !declined ? (
        <button
          className={draft.saved ? "quiet-button" : "primary-button"}
          disabled={
            busy || uncertain || draft.saved || draft.resolved || !!validation
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onApply(artifact.messageIndex, artifact.draftIndex, {
                expected: {
                  tool: draft.tool,
                  path: draft.path,
                  query: draft.query,
                  body: draft.body,
                },
                bodyPatch,
              });
            } catch (e) {
              setError(operationError(e));
              if (e.executed) setUncertain(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {draft.resolved ? (
            t("sidePanel.status.completed")
          ) : draft.saved ? (
            <>
              <Check size={14} />
              {t("sidePanel.status.executed")}
            </>
          ) : busy ? (
            t("sidePanel.executing")
          ) : draft.proposal ? (
            draft.tool === "issues_save" ? t("sidePanel.createIssueAndSop") : t("sidePanel.runSop")
          ) : (
            t("sidePanel.confirmAction", { title: summary.title })
          )}
        </button>
      ) : null}
      {answerable ? (
        <div className="proposal-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => decide("declined")}
          >
            {draft.proposal.timing === "start" ? t("sidePanel.letAiDo") : t("sidePanel.notNeeded")}
          </button>
          <button
            type="button"
            className="proposal-mute"
            disabled={busy}
            onClick={() => decide("muted")}
          >
            {t("sidePanel.muteProposal")}
          </button>
        </div>
      ) : null}
      {savedIssue?.id &&
      context.onLinkIssue &&
      !context.runId &&
      (savedIssue.projectId || draft.body?.projectId) === context.projectId ? (
        <button
          type="button"
          className="quiet-button"
          disabled={context.issueId === savedIssue.id || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await context.onLinkIssue(savedIssue.id);
            } finally {
              setBusy(false);
            }
          }}
        >
          {context.issueId === savedIssue.id
            ? t("sidePanel.linkedToChat")
            : t("sidePanel.linkToChat")}
        </button>
      ) : null}
    </div>
  );
}
export default function SidePanel({
  chat,
  tab,
  setTab,
  selected,
  setSelected,
  onClose,
}) {
  useI18n();
  const [workflows, setWorkflows] = useState([]),
    [runs, setRuns] = useState([]),
    [workflowId, setWorkflowId] = useState(""),
    [name, setName] = useState(""),
    [detail, setDetail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [openRun, setOpenRun] = useState(null);
  const artifacts = collectArtifacts(chat.session);
  const projectId = chat.session?.projectId || chat.projectId;
  async function load() {
    if (!projectId) {
      setWorkflows([]);
      setRuns([]);
      return;
    }
    try {
      const [w, r] = await Promise.all([
        api(`/api/workflows?projectId=${encodeURIComponent(projectId)}`),
        api(`/api/runs?projectId=${encodeURIComponent(projectId)}`),
      ]);
      setWorkflows(w || []);
      setRuns(r || []);
      setWorkflowId((current) =>
        w.some((x) => x.id === current) ? current : w[0]?.id || "",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, [projectId]);
  useEffect(() => {
    if (
      !runs.some(
        (r) =>
          !["succeeded", "failed", "canceled", "cancelled"].includes(r.status),
      )
    )
      return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [
    projectId,
    runs.some(
      (r) =>
        !["succeeded", "failed", "canceled", "cancelled"].includes(r.status),
    ),
  ]);
  async function action(kind) {
    setError("");
    if (!projectId) {
      setError(t("sidePanel.selectProjectFirst"));
      return;
    }
    if (!workflowId || !name.trim()) {
      setError(t("sidePanel.fillNameAndTemplate"));
      return;
    }
    setBusy(true);
    try {
      if (kind === "clone") {
        const source = workflows.find((w) => w.id === workflowId);
        const id = "chat-sop-" + Date.now().toString(36);
        const response = await write("/mcp", {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "workflows_clone",
            arguments: {
              path: { id: source.id },
              body: { id, name: name.trim(), projectId },
            },
          },
        });
        if (response.error || response.result?.isError)
          throw Error(
            response.error?.message ||
              response.result?.content?.[0]?.text ||
              t("sidePanel.createFailed"),
          );
        setWorkflowId(id);
      } else {
        const issue = await write("/api/issues", {
          projectId,
          workflowId,
          title: name.trim(),
          description: detail,
        });
        await write(`/api/issues/${encodeURIComponent(issue.id)}/dispatch`, {
          workflowId,
        });
      }
      setName("");
      setDetail("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const status = {
    succeeded: t("sidePanel.runStatus.succeeded"),
    running: t("sidePanel.runStatus.running"),
    waiting: t("sidePanel.runStatus.waiting"),
    pending: t("sidePanel.runStatus.pending"),
    queued: t("sidePanel.runStatus.queued"),
    failed: t("sidePanel.runStatus.failed"),
    canceled: t("sidePanel.runStatus.canceled"),
    cancelled: t("sidePanel.runStatus.cancelled"),
  };
  async function selectRun(run) {
    try {
      const stored = await api(`/api/runs/${encodeURIComponent(run.id)}`);
      setOpenRun(stored);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <aside className="side-panel" aria-label={t("sidePanel.aria")}>
      <header className="panel-tabs">
        <SlidingTabs aria-label={t("sidePanel.tabsAria")}>
          <button
            role="tab"
            aria-selected={tab === "files"}
            onClick={() => {
              setTab("files");
              setSelected(null);
            }}
          >
            <Folder size={14} />
            {t("artifactPanel.tab.artifacts")}
            {artifacts.length ? (
              <span className="count">{artifacts.length}</span>
            ) : null}
          </button>
          <button
            role="tab"
            aria-selected={tab === "sop"}
            onClick={() => {
              setTab("sop");
              setSelected(null);
            }}
          >
            <GitBranch size={14} />
            SOP
          </button>
        </SlidingTabs>
        <IconButton label={t("sidePanel.close")} onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="panel-content">
        {selected ? (
          <>
            <button className="back-link" onClick={() => setSelected(null)}>
              {t("sidePanel.allArtifacts")}
            </button>
            <ArtifactPreview artifact={selected} />
            {selected.draft ? (
              <DraftCard
                artifact={selected}
                onApply={chat.readOnly ? null : chat.applyDraft}
                onPreview={() => {}}
              />
            ) : null}
          </>
        ) : tab === "files" ? (
          <>
            <div className="panel-heading">
              <h2>{t("sidePanel.sessionArtifacts")}</h2>
              <small>
                {chat.projects.find((p) => p.id === projectId)?.name ||
                  t("common.personalChat")}
              </small>
            </div>
            {!artifacts.length ? (
              <div className="panel-empty">
                <File size={28} />
                <h3>{t("sidePanel.emptyTitle")}</h3>
                <p>{t("sidePanel.emptyDesc")}</p>
              </div>
            ) : (
              <div className="artifact-list">
                {artifacts.map((artifact) => (
                  <button
                    className="artifact-row"
                    key={artifact.id}
                    onClick={() => setSelected(artifact)}
                  >
                    {artifact.mimeType?.startsWith("image/") ? (
                      <FileImage size={19} />
                    ) : artifact.kind === "sop" ? (
                      <GitBranch size={19} />
                    ) : (
                      <File size={19} />
                    )}
                    <span>
                      <strong>{artifact.name}</strong>
                      <small>
                        {artifact.source}
                        {artifact.size
                          ? ` · ${(artifact.size / 1024).toFixed(0)} KB`
                          : ""}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="panel-heading">
              <h2>SOP</h2>
              <IconButton label={t("sidePanel.refreshSop")} onClick={() => void load()}>
                <RefreshCw size={16} />
              </IconButton>
            </div>
            <label className="field">
              {t("common.project")}
              <div className="project-static">
                <Folder size={14} />
                {chat.projects.find((p) => p.id === projectId)?.name ||
                  t("sidePanel.unboundProject")}
              </div>
            </label>
            <label className="field">
              {t("operations.field.name")}
              <input
                placeholder={t("sidePanel.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              {t("operations.field.description")}
              <textarea
                rows={3}
                placeholder={t("sidePanel.descPlaceholder")}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
            </label>
            <label className="field">
              {t("sidePanel.template")}
              <HarnessSelect
                value={workflowId}
                ariaLabel={t("sidePanel.template")}
                onChange={(e) => setWorkflowId(e.target.value)}
                options={workflows.map((w) => ({ value: w.id, label: w.name }))}
              />
            </label>
            {workflowId ? (
              <button
                className="definition-link"
                onClick={() =>
                  setSelected({
                    id: "workflow-" + workflowId,
                    name:
                      workflows.find((w) => w.id === workflowId)?.name ||
                      t("sidePanel.sopDef"),
                    kind: "sop",
                    content: JSON.stringify(
                      workflows.find((w) => w.id === workflowId),
                      null,
                      2,
                    ),
                    source: t("sidePanel.projectSop"),
                  })
                }
              >
                <ChevronRight size={14} />
                {t("sidePanel.viewSopDef")}
              </button>
            ) : null}
            <div className="button-row">
              <button
                disabled={busy}
                className="quiet-button"
                onClick={() => action("clone")}
              >
                {t("sidePanel.createSop")}
              </button>
              <button
                disabled={busy}
                className="primary-button"
                onClick={() => action("dispatch")}
              >
                <Play size={13} />
                {busy ? t("sidePanel.processing") : t("sidePanel.dispatchSop")}
              </button>
            </div>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
            <section className="panel-section">
              <h3>{t("sidePanel.draftsTitle")}</h3>
              {artifacts
                .filter((a) => a.kind === "sop")
                .map((a) => (
                  <DraftCard
                    key={a.id}
                    artifact={a}
                    onApply={async (...args) => {
                      const result = await chat.applyDraft(...args);
                      await load();
                      return result;
                    }}
                    onPreview={setSelected}
                  />
                ))}
              {!artifacts.some((a) => a.kind === "sop") ? (
                <p className="muted">{t("sidePanel.draftsEmpty")}</p>
              ) : null}
            </section>
            <section className="panel-section">
              <h3>{t("sidePanel.projectRuns")}</h3>
              {runs.map((run) => (
                <button
                  className="run-row"
                  key={run.id}
                  onClick={() => selectRun(run)}
                >
                  <span>
                    {run.workflowSnapshot?.name ||
                      workflows.find((w) => w.id === run.workflowId)?.name ||
                      run.workflowId}
                  </span>
                  <small className={`run-status ${run.status}`}>
                    {status[run.status] || run.status}
                  </small>
                </button>
              ))}
              {!runs.length ? (
                <p className="muted">{t("sidePanel.noRuns")}</p>
              ) : null}
            </section>
            {openRun ? (
              <section className="panel-section">
                <h3>{openRun.workflowSnapshot?.name || openRun.id}</h3>
                <p className="muted">{openRun.input}</p>
                {Object.entries(openRun.nodes || {}).map(([id, node]) => (
                  <details key={id}>
                    <summary>
                      {openRun.workflowSnapshot?.nodes?.find((n) => n.id === id)
                        ?.name || id}
                      <small>{status[node.status] || node.status}</small>
                    </summary>
                    <pre>{node.output || t("sidePanel.noOutput")}</pre>
                  </details>
                ))}
                {openRun.artifacts?.map((a) => (
                  <button
                    key={a.id}
                    className="artifact-row"
                    onClick={() =>
                      setSelected({
                        ...a,
                        mimeType: a.mediaType,
                        kind: a.mediaType === "image/svg+xml" ? "svg" : "code",
                        source: t("sidePanel.runArtifactSource"),
                        url: `/api/runs/${encodeURIComponent(openRun.id)}/artifacts/${encodeURIComponent(a.id)}`,
                      })
                    }
                  >
                    <File size={16} />
                    {a.name || a.path}
                  </button>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
