import React, { useEffect, useRef, useState } from "react";
import HarnessIcon from "./HarnessIcon";
import { t, useI18n } from "./i18n.js";
import { api } from "./api";
import { ArtifactPreview, RichContent } from "./RichContent";
import { DraftCard } from "./SidePanel";
import SopRunPanel, { runStatus } from "./SopRunPanel";
import ChangesPanel from "./ChangesPanel";
import AgentBrowser from "./AgentBrowser";
import WorkspaceIDE from "./WorkspaceIDE";
import { SubagentSession, subagentName, subagentStatus } from "./SubagentSession";
import { collectSubagents, resumeMissed } from "./activity";
import { IconButton } from "./ui";
import { definitionTarget, actionName } from "./platform.js";
import { useArtifactPanelLayout } from "./useArtifactPanelLayout";
import "./artifact-panel.css";

const FileText = (props) => <HarnessIcon name="doc" {...props} />;
const FileImage = (props) => <HarnessIcon name="image" {...props} />;
const FileCode = (props) => <HarnessIcon name="stage-ide" {...props} />;
const Presentation = (props) => <HarnessIcon name="monitor" {...props} />;
const Globe = (props) => <HarnessIcon name="globe" {...props} />;
const GitBranch = (props) => <HarnessIcon name="workflow" {...props} />;
const MergeRequest = (props) => <HarnessIcon name="branch" {...props} />;
const UserRound = (props) => <HarnessIcon name="user" {...props} />;
const ChevronLeft = (props) => <HarnessIcon name="chevron-left" {...props} />;
const ChevronRight = (props) => <HarnessIcon name="chevron-right" {...props} />;
const X = (props) => <HarnessIcon name="close" {...props} />;
const ExternalLink = (props) => (
  <HarnessIcon name="preview-expand" {...props} />
);

export function artifactIcon(a) {
  if (a.mimeType?.startsWith("image/")) return FileImage;
  return (
    {
      html: Globe,
      slides: Presentation,
      ppt: Presentation,
      sop: GitBranch,
      "merge-request": MergeRequest,
      role: UserRound,
      code: FileCode,
    }[a.kind] || FileText
  );
}
function DefinitionPreview({ artifact }) {
  useI18n();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    const result =
      artifact.draft?.savedResult?.data || artifact.draft?.savedResult;
    if (
      result?.id ||
      artifact.draft?.body?.nodes ||
      artifact.draft?.body?.prompt
    ) {
      setData(result || artifact.draft.body);
      return;
    }
    const id =
      artifact.asset?.id ||
      (artifact.draft?.tool === "workflows_clone"
        ? artifact.draft.path?.id
        : null);
    if (!id) {
      setData(artifact.draft?.body || {});
      return;
    }
    api(
      `/api/${artifact.kind === "role" ? "agents" : "workflows"}/${encodeURIComponent(id)}`,
    )
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [artifact.id, artifact.asset?.id, artifact.draft?.saved]);
  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  if (!data) return <p className="muted">{t("common.loading")}</p>;
  const target = definitionTarget(artifact);
  if (target)
    return (
      <section className="definition-preview">
        <h2>{data.name || artifact.name}</h2>
        <p className="muted">{data.description}</p>
        <a
          className="definition-open-link"
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {target.label}
          <ExternalLink size={15} />
        </a>
      </section>
    );
  return (
    <section className="definition-preview">
      <div className="definition-summary">
        <span className="artifact-type-label">
          {artifact.kind === "sop" ? "SOP" : t("common.role")}
        </span>
        <h2>{data.name || artifact.name}</h2>
        <p>{data.description}</p>
        <small>
          {artifact.draft && !artifact.draft.saved
            ? t("artifactPanel.draftPending")
            : data.status === "published"
              ? t("api.artifact.published")
              : t("api.artifact.saved")}
        </small>
      </div>
      {artifact.kind === "sop" ? (
        <ol className="definition-node-list">
          {(data.nodes || []).map((node, index) => (
            <li key={node.id}>
              <span className="definition-step-number">{index + 1}</span>
              <div>
                <strong>{node.name || node.id}</strong>
                <small>
                  {node.type === "approval"
                    ? t("artifactPanel.approvalStep")
                    : node.type === "script"
                      ? t("artifactPanel.scriptStep")
                      : t("artifactPanel.agentStep")}
                </small>
                {node.type === "approval" && node.taskPrompt ? (
                  <details>
                    <summary>{t("artifactPanel.approvalRequirements")}</summary>
                    <RichContent message={node.taskPrompt} />
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <h3>{t("artifactPanel.workInstructions")}</h3>
          <RichContent
            message={data.prompt || data.description || t("artifactPanel.noDescription")}
          />
          {data.model ? (
            <small className="muted">{t("artifactPanel.modelMeta", { model: data.model })}</small>
          ) : null}
        </>
      )}
    </section>
  );
}
function OperationPreview({ artifact, runs }) {
  useI18n();
  const draft = artifact.draft;
  const run = runs.find((r) => r.id === draft?.path?.id);
  const node = run?.workflowSnapshot?.nodes?.find(
    (n) => n.id === draft?.body?.nodeId,
  );
  return (
    <section className="operation-preview">
      {run ? (
        <p>
          {run.workflowSnapshot?.name || t("common.sopRun")}
          {node ? ` · ${node.name || node.id}` : ""}
        </p>
      ) : null}
    </section>
  );
}

export default function ArtifactPanel({
  artifacts,
  runs,
  selected,
  setSelected,
  chat,
  operationContext,
  onClose,
  open = true,
  view = "artifacts",
  onViewChange = () => {},
  workspaceChanges = null,
  workspaceRunId = "",
  browserRequest = null,
  onBrowserRequestHandled = () => {},
  onAddElement = null,
}) {
  useI18n();
  const root = useRef(null);
  const searchInput = useRef(null);
  const [nodeId, setNodeId] = useState(selected?.nodeId || null);
  const [search, setSearch] = useState("");
  const browsing = view === "browser";
  const coding = view === "ide";
  const listView = view !== "changes" && !browsing && !coding;
  const live = !!chat?.busy;
  const subagents = collectSubagents(
    chat?.session?.messages || [],
    live ? chat?.live?.activity || [] : [],
    chat?.model || "",
  );
  // A new subagent is keyed by its dispatch until its agent ID arrives, so
  // an opened one is found by either.
  const selectedAgent =
    selected?.kind === "subagent"
      ? subagents.find(
          (agent) =>
            agent.key === selected.agentKey ||
            agent.dispatches.some((step) => step.id === selected.dispatchId),
        )
      : null;
  // A dispatch shown on the open subagent can finish under another agent when
  // its resume did not take. Follow it there instead of staying on the old
  // page, where it would just disappear. Dispatches stay remembered while the
  // finished reply is still loading and the dispatch is briefly nowhere.
  const watched = useRef({ key: null, ids: [] });
  useEffect(() => {
    if (!selectedAgent) return;
    const seen = watched.current;
    if (seen.key !== selectedAgent.key) {
      seen.key = selectedAgent.key;
      seen.ids = [];
    }
    for (const step of selectedAgent.dispatches)
      if (!seen.ids.includes(step.id)) seen.ids.push(step.id);
    for (const agent of subagents) {
      if (agent.key === selectedAgent.key) continue;
      const moved = agent.dispatches.find((step) => seen.ids.includes(step.id) && resumeMissed(step));
      if (!moved) continue;
      setSelected({
        kind: "subagent",
        id: `subagent-${agent.key}`,
        agentKey: agent.key,
        dispatchId: moved.id,
        name: subagentName(agent),
      });
      return;
    }
  });
  // The browser shows a desktop-width page, so it widens the pane like an
  // opened SOP node and restores the width afterwards.
  const layout = useArtifactPanelLayout(
    root,
    onClose,
    nodeId ||
      (selectedAgent ? `subagent-${selectedAgent.key}` : null) ||
      (browsing && workspaceRunId ? "agent-browser" : null) ||
      (coding && workspaceRunId ? "workspace-ide" : null),
    open,
  );
  useEffect(
    () => setNodeId(selected?.nodeId || null),
    [selected?.id, selected?.nodeId],
  );
  useEffect(() => setSearch(""), [chat.session?.id]);
  const selectedRun =
    selected?.kind === "run"
      ? runs.find((run) => run.id === selected.runId)
      : null;
  const projectId = chat.session?.projectId || chat.projectId;
  const nodeDefinition = selectedRun?.workflowSnapshot?.nodes?.find(
    (node) => node.id === nodeId,
  );
  const node = selectedRun?.nodes?.[nodeId];
  useEffect(() => {
    const content = root.current?.querySelector(".artifact-panel-content");
    if (content) content.scrollTop = 0;
  }, [selected?.id, nodeId]);
  // External deliverables are listed under 合并请求 with their own section.
  const items = artifacts.filter(
    (artifact) => !artifact.draft && !artifact.asset && !artifact.external,
  );
  const definitions = artifacts.filter((artifact) =>
    definitionTarget(artifact, projectId),
  );
  const operations = artifacts.filter(
    (artifact) =>
      artifact.draft &&
      !definitionTarget(artifact, projectId) &&
      !artifact.draft.saved &&
      !artifact.draft.resolved &&
      !artifact.draft.inherited,
  );
  const mergeRequests = artifacts.filter(
    (artifact) => artifact.kind === "merge-request" && artifact.url,
  );
  const count =
    items.length +
    definitions.length +
    operations.length +
    mergeRequests.length +
    runs.length +
    subagents.length;
  const query = search.trim().toLocaleLowerCase();
  const matches = (...values) =>
    !query ||
    values.filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
  const matchesArtifact = (artifact, group) =>
    matches(
      artifact.name,
      artifact.source,
      artifact.kind,
      artifact.mimeType,
      artifact.asset?.name,
      artifact.asset?.description,
      artifact.asset?.status,
      artifact.draft?.tool && actionName(artifact.draft.tool),
      group,
    );
  const visibleItems = items.filter((artifact) =>
    matchesArtifact(artifact, t("artifactPanel.filter.files")),
  );
  const visibleDefinitions = definitions.filter((artifact) =>
    matchesArtifact(artifact, t("artifactPanel.filter.defs")),
  );
  const visibleOperations = operations.filter((artifact) =>
    matchesArtifact(artifact, t("artifactPanel.filter.ops")),
  );
  const visibleMergeRequests = mergeRequests.filter((artifact) =>
    matches(artifact.name, artifact.source, artifact.url, t("artifactPanel.filter.mrs")),
  );
  const visibleRuns = runs.filter((run) =>
    matches(
      run.id,
      run.workflowSnapshot?.name,
      runStatus[run.status] || run.status,
      ...(run.workflowSnapshot?.nodes || []).flatMap((item) => [
        item.id,
        item.name,
      ]),
      t("common.sopRun"),
    ),
  );
  const visibleSubagents = subagents.filter((agent) =>
    matches(
      subagentName(agent),
      agent.subagent,
      agent.agentId,
      // Every dispatch's model: a resumed agent may have run on several.
      ...Object.values(agent.models || {}),
      agent.model,
      subagentStatus(agent, live).label,
      ...agent.dispatches.map((step) => step.detail),
      t("common.subagent"),
    ),
  );
  const matchCount =
    visibleItems.length +
    visibleDefinitions.length +
    visibleOperations.length +
    visibleMergeRequests.length +
    visibleRuns.length +
    visibleSubagents.length;
  const row = (artifact) => {
    const Icon = artifactIcon(artifact);
    const target = definitionTarget(artifact, projectId);
    // External deliverables (a submitted pull request) live on the code host,
    // so the row opens them in a new tab instead of opening a local preview.
    const href = target?.href || (artifact.external ? artifact.url : "");
    const Row = href ? "a" : "button";
    const title = target
      ? `${artifact.name} · ${target.label}`
      : artifact.external
        ? t("artifactPanel.openInRepo", { name: artifact.name })
        : artifact.name;
    return (
      <Row
        className={`artifact-row artifact-file-row ${selected?.id === artifact.id ? "is-selected" : ""}`}
        key={artifact.id}
        title={title}
        aria-current={selected?.id === artifact.id ? "true" : undefined}
        {...(href
          ? { href, target: "_blank", rel: "noopener noreferrer" }
          : { type: "button", onClick: () => setSelected(artifact) })}
      >
        <span className="artifact-file-icon">
          <Icon size={16} />
        </span>
        <span className="artifact-file-copy">
          <strong>{artifact.name}</strong>
          <small>
            {target
              ? `${artifact.kind === "sop" ? "SOP" : t("common.role")} · ${artifact.asset?.status === "published" ? t("api.artifact.published") : t("api.artifact.saved")}`
              : artifact.source}
            {artifact.size
              ? ` · ${artifact.size < 1024 ? `${artifact.size} B` : `${Math.ceil(artifact.size / 1024)} KB`}`
              : ""}
          </small>
        </span>
        {href ? (
          <ExternalLink className="artifact-row-action" size={13} />
        ) : (
          <ChevronRight className="artifact-row-action" size={13} />
        )}
      </Row>
    );
  };
  return (
    <>
      {!layout.compact ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={layout.maxWidth}
          aria-valuenow={layout.width}
          aria-label={t("artifactPanel.resizeAria")}
          tabIndex={open ? 0 : -1}
          aria-hidden={!open || undefined}
          inert={!open}
          className="artifact-panel-sash"
          onPointerDown={layout.startResize}
          onPointerMove={layout.resize}
          onPointerUp={layout.finishResize}
          onPointerCancel={layout.finishResize}
          onKeyDown={layout.resizeByKey}
          onDoubleClick={layout.resetWidth}
        />
      ) : null}
      <aside
        ref={root}
        className="side-panel artifact-panel"
        id="conversation-artifacts"
        role={layout.compact ? "dialog" : "complementary"}
        aria-modal={layout.compact && open ? "true" : undefined}
        aria-label={
          view === "changes"
            ? t("artifactPanel.aria.changes")
            : browsing
              ? t("artifactPanel.aria.browser")
              : coding
                ? t("artifactPanel.aria.ide")
                : t("artifactPanel.aria.artifacts")
        }
        aria-hidden={!open || undefined}
        inert={!open}
        data-compact={layout.compact || undefined}
        data-covered={layout.covered || undefined}
        data-resizing={layout.dragging || undefined}
      >
        <header className="artifact-panel-header">
          <div className="artifact-panel-tabs" role="tablist" aria-label={t("artifactPanel.tabsAria")}>
            <button
              type="button"
              role="tab"
              aria-selected={listView}
              className={listView ? "is-active" : ""}
              onClick={() => onViewChange("artifacts")}
            >
              <HarnessIcon name="artifact" size={14} />
              <span>{t("artifactPanel.tab.artifacts")}</span>
              <small>{count}</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "changes"}
              className={view === "changes" ? "is-active" : ""}
              onClick={() => onViewChange("changes")}
              disabled={!workspaceRunId}
              title={
                workspaceRunId
                  ? t("artifactPanel.tab.changesTitle")
                  : t("artifactPanel.tab.noWorkspaceTitle")
              }
            >
              <HarnessIcon name="edit" size={14} />
              <span>{t("artifactPanel.tab.changes")}</span>
              <small>{workspaceChanges?.files?.length || 0}</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={browsing}
              className={browsing ? "is-active" : ""}
              onClick={() => onViewChange("browser")}
              disabled={!workspaceRunId}
              title={
                workspaceRunId
                  ? t("artifactPanel.tab.browserTitle")
                  : t("artifactPanel.tab.noWorkspaceTitle")
              }
            >
              <HarnessIcon name="stage-browser" size={14} />
              <span>{t("artifactPanel.tab.browser")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={coding}
              className={coding ? "is-active" : ""}
              onClick={() => onViewChange("ide")}
              disabled={!workspaceRunId}
              title={
                workspaceRunId
                  ? t("artifactPanel.tab.ideTitle")
                  : t("artifactPanel.tab.noWorkspaceTitle")
              }
            >
              <HarnessIcon name="stage-ide" size={14} />
              <span>{t("artifactPanel.tab.ide")}</span>
            </button>
          </div>
          <div className="artifact-panel-actions">
            {layout.compact ? (
              <button
                type="button"
                className="artifact-panel-back-to-chat"
                aria-label={t("artifactPanel.backToChat")}
                onClick={onClose}
              >
                <HarnessIcon name="arrow-left" size={16} />
                <span>{t("artifactPanel.backToChat")}</span>
              </button>
            ) : (
              <IconButton label={t("artifactPanel.close")} onClick={onClose}>
                <X size={16} />
              </IconButton>
            )}
          </div>
        </header>
        {!listView ? null : selected ? (
          <div className="artifact-preview-toolbar">
            <button
              type="button"
              className="artifact-preview-back"
              onClick={() => (nodeId ? setNodeId(null) : setSelected(null))}
            >
              <ChevronLeft size={14} />
              <span>{nodeId ? t("artifactPanel.backToNode") : t("artifactPanel.backToList")}</span>
            </button>
            {nodeId ? <span className="artifact-node-title">{nodeDefinition?.name || nodeId}</span> : null}
            {selectedAgent ? (
              <>
                <span className="artifact-node-title">{subagentName(selectedAgent)}</span>
                <small className="node-header-meta" title={[selectedAgent.subagent, selectedAgent.agentId, selectedAgent.model].filter(Boolean).join(" · ")}>
                  {[subagentStatus(selectedAgent, live).label, selectedAgent.model].filter(Boolean).join(" · ")}
                </small>
              </>
            ) : null}
            {nodeId ? (
              <small
                className="node-header-meta"
                title={[node?.model, runStatus[node?.status] || node?.status]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {node?.model || runStatus[node?.status]}
              </small>
            ) : null}
          </div>
        ) : count ? (
          <div className="artifact-directory-tools">
            <label className="artifact-search">
              <HarnessIcon name="search" size={14} />
              <input
                ref={searchInput}
                type="search"
                aria-label={t("artifactPanel.searchAria")}
                placeholder={t("artifactPanel.searchAria")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && search) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearch("");
                  }
                }}
              />
              {search ? (
                <IconButton
                  label={t("artifactPanel.clearSearch")}
                  onClick={() => {
                    setSearch("");
                    searchInput.current?.focus();
                  }}
                >
                  <X size={13} />
                </IconButton>
              ) : null}
            </label>
            {query ? (
              <span className="artifact-search-count" role="status">
                {t("artifactPanel.matchCount", { count: matchCount })}
              </span>
            ) : null}
          </div>
        ) : null}
        {view === "changes" ? (
          <div className="artifact-panel-content">
            <ChangesPanel changes={workspaceChanges} />
          </div>
        ) : null}
        {coding ? (
          <div className="artifact-panel-content workspace-ide-content">
            {workspaceRunId && open ? (
              <WorkspaceIDE
                key={workspaceRunId}
                runId={workspaceRunId}
                onMaximize={layout.compact ? undefined : layout.toggleCovered}
              />
            ) : (
              <div className="agent-browser-empty" role="status">
                <HarnessIcon name="stage-ide" size={28} />
                <p>{t("artifactPanel.noWorkspaceIde")}</p>
              </div>
            )}
          </div>
        ) : null}
        {browsing ? (
          <div className="artifact-panel-content agent-browser-content">
            {workspaceRunId && open ? (
              <AgentBrowser
                key={workspaceRunId}
                runId={workspaceRunId}
                request={browserRequest}
                onRequestHandled={onBrowserRequestHandled}
                onAddElement={
                  onAddElement &&
                  ((ref) => {
                    onAddElement(ref);
                    // A compact panel covers the composer: go back so the
                    // new chip is in view.
                    if (layout.compact) onClose();
                  })
                }
              />
            ) : (
              <div className="agent-browser-empty" role="status">
                <HarnessIcon name="stage-browser" size={28} />
                <p>{t("artifactPanel.noWorkspaceBrowser")}</p>
              </div>
            )}
          </div>
        ) : null}
        {!listView ? null : (
        <div className="artifact-panel-content">
          {selectedRun ? (
            <SopRunPanel
              key={selectedRun.id}
              runs={[selectedRun]}
              embedded
              selectedNodeId={nodeId}
              onSelectNode={setNodeId}
              onClose={() => setSelected(null)}
            />
          ) : selectedAgent ? (
            <SubagentSession
              agent={selectedAgent}
              live={live}
              artifacts={artifacts}
              onOpenArtifact={setSelected}
            />
          ) : selected?.kind === "subagent" ? (
            <div className="artifact-panel-empty" role="status">
              <HarnessIcon name="user" size={28} />
              <p>{t("artifactPanel.missingSubagent")}</p>
            </div>
          ) : selected ? (
            <div className="artifact-panel-preview">
              {["sop", "role"].includes(selected.kind) ? (
                <DefinitionPreview artifact={selected} />
              ) : selected.kind === "operation" ? (
                <OperationPreview artifact={selected} runs={runs} />
              ) : (
                <ArtifactPreview artifact={selected} />
              )}
              {selected.draft ? (
                <DraftCard
                  artifact={selected}
                  context={
                    operationContext || {
                      projects: chat.projects,
                      projectId,
                      references:
                        chat.session?.messages?.flatMap(
                          (message) => message.references || [],
                        ) || [],
                    }
                  }
                  onApply={chat.readOnly ? null : chat.applyDraft}
                  onPreview={() => {}}
                />
              ) : null}
            </div>
          ) : (
            <>
              {visibleMergeRequests.length ? (
                <section className="artifact-section">
                  <h3>{t("artifactPanel.filter.mrs")}</h3>
                  {visibleMergeRequests.map(row)}
                </section>
              ) : null}
              {visibleItems.length ? (
                <section className="artifact-section">
                  <h3>{t("artifactPanel.filter.files")}</h3>
                  {visibleItems.map(row)}
                </section>
              ) : null}
              {visibleDefinitions.length ? (
                <section className="artifact-section">
                  <h3>{t("artifactPanel.filter.defs")}</h3>
                  {visibleDefinitions.map(row)}
                </section>
              ) : null}
              {visibleRuns.length ? (
                <section className="artifact-section">
                  <h3>{t("common.sopRun")}</h3>
                  {visibleRuns.map((run) => (
                    <button
                      type="button"
                      className="artifact-row artifact-run-row"
                      key={run.id}
                      onClick={() =>
                        setSelected({
                          kind: "run",
                          id: run.id,
                          runId: run.id,
                          name: run.workflowSnapshot?.name || t("common.sopRun"),
                        })
                      }
                    >
                      <span className="artifact-file-icon">
                        <GitBranch size={16} />
                      </span>
                      <span className="artifact-file-copy">
                        <strong>
                          {run.workflowSnapshot?.name || t("common.sopRun")}
                        </strong>
                        <small>
                          <i
                            className={`artifact-run-dot status-${run.status}`}
                          />
                          {runStatus[run.status] || run.status} ·{" "}
                          {
                            Object.values(run.nodes || {}).filter(
                              (item) => item.status === "succeeded",
                            ).length
                          }
                          {t("artifactPanel.nodesCount", {
                            count: run.workflowSnapshot?.nodes?.length || 0,
                          })}
                        </small>
                      </span>
                      <ChevronRight className="artifact-row-action" size={13} />
                    </button>
                  ))}
                </section>
              ) : null}
              {visibleSubagents.length ? (
                <section className="artifact-section">
                  <h3>{t("common.subagent")}</h3>
                  {visibleSubagents.map((agent) => {
                    const status = subagentStatus(agent, live);
                    const count = agent.dispatches.length;
                    return (
                      <button
                        type="button"
                        className="artifact-row artifact-run-row"
                        key={agent.key}
                        onClick={() =>
                          setSelected({
                            kind: "subagent",
                            id: `subagent-${agent.key}`,
                            agentKey: agent.key,
                            dispatchId: agent.dispatches[0]?.id,
                            name: subagentName(agent),
                          })
                        }
                      >
                        <span className="artifact-file-icon">
                          <HarnessIcon
                            name={status.tone === "running" ? "spinner" : "user"}
                            motion={status.tone === "running" ? "busy" : "idle"}
                            size={16}
                          />
                        </span>
                        <span className="artifact-file-copy">
                          <strong>{subagentName(agent)}</strong>
                          <small>
                            <i className={`artifact-run-dot status-${{ done: "succeeded", running: "running", failed: "failed" }[status.tone] || "canceled"}`} />
                            {status.label}
                            {agent.model ? t("artifactPanel.subagentModel", { model: agent.model }) : ""}
                            {count > 1 ? t("artifactPanel.subagentDispatches", { count }) : ""}
                            {agent.dispatches.at(-1)?.detail
                              ? ` · ${agent.dispatches.at(-1).detail}`
                              : ""}
                          </small>
                        </span>
                        <ChevronRight className="artifact-row-action" size={13} />
                      </button>
                    );
                  })}
                </section>
              ) : null}
              {visibleOperations.length ? (
                <section className="artifact-section">
                  <h3>{t("artifactPanel.filter.ops")}</h3>
                  {visibleOperations.map(row)}
                </section>
              ) : null}
              {!matchCount ? (
                <div className="artifact-panel-empty" role="status">
                  <HarnessIcon name="artifact" size={28} />
                  <p>{query ? t("artifactPanel.emptySearch") : t("artifactPanel.empty")}</p>
                </div>
              ) : null}
            </>
          )}
        </div>
        )}
      </aside>
    </>
  );
}
