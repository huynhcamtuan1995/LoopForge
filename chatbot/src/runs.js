import { useEffect, useMemo, useState } from "react";
import { api, parseReply } from "./api.js";
import { getLang, listSeparator, t } from "./i18n.js";

// runProblems lists what a person has to act on: failed nodes with their
// error and human gates with what they wait for. Mirrors assistantRunProblems
// in internal/httpapi/assistant_run_view.go.
export function runProblems(run) {
  if (
    !run?.nodes ||
    ["succeeded", "canceled", "cancelled"].includes(run.status)
  )
    return [];
  const defs = run.workflowSnapshot?.nodes || [];
  const ids = [
    ...defs.map((n) => n.id),
    ...Object.keys(run.nodes)
      .filter((id) => !defs.some((n) => n.id === id))
      .sort(),
  ];
  const out = [];
  for (const id of ids) {
    const node = run.nodes[id];
    if (!node || !["failed", "waiting_approval"].includes(node.status))
      continue;
    const def = defs.find((n) => n.id === id) || {};
    const gate = node.gateResult || {};
    let reason = "";
    if (node.status === "failed")
      reason =
        (node.error || "").trim() ||
        (gate.reason || "").trim() ||
        t("runs.noErrorRecorded");
    else
      reason =
        [gate.reason, gate.actionRequired]
          .map((s) => (s || "").trim())
          .filter(Boolean)
          .join(t("runs.actionJoiner")) ||
        (node.error || "")
          .replace(/^\s*agent requested human confirmation:\s*/i, "")
          .trim() ||
        (def.type === "approval"
          ? approvalWaitReason(run, id)
          : t("runs.waitingApproval"));
    const waiting = node.status === "waiting_approval";
    out.push({
      key: [run.id, id, node.attempt, node.reworkCount, node.status].join(":"),
      runId: run.id,
      nodeId: id,
      nodeName: def.name || id,
      kind: waiting ? "waiting_approval" : "failed",
      // approval: a gate set in the SOP; agent: the agent asked a person.
      ...(waiting
        ? { gate: def.type === "approval" ? "approval" : "agent" }
        : {}),
      reason,
      expected: {
        status: node.status,
        attempt: node.attempt || 0,
        reworkCount: node.reworkCount || 0,
      },
    });
  }
  return out;
}
// approvalWaitReason explains why an approval (人工门禁) node stops the run.
// Mirrors domain.ApprovalWaitReason in internal/domain/approval_reason.go.
export function approvalWaitReason(run, nodeId) {
  const wf = run?.workflowSnapshot || {};
  const nodes = wf.nodes || [];
  const edges = wf.edges || [];
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index < 0) return t("runs.waitingApproval");
  const node = nodes[index];
  const quote = (s) => (getLang() === "zh" ? `「${s}」` : `"${s}"`);
  const name = (id) => quote(nodes.find((n) => n.id === id)?.name || id);
  let upstream = edges
    .filter((e) => e.target === nodeId && e.source)
    .map((e) => name(e.source));
  let downstream = edges
    .filter((e) => e.source === nodeId && e.target)
    .map((e) => name(e.target));
  if (!edges.length) {
    upstream = index > 0 ? [name(nodes[index - 1].id)] : [];
    downstream = index + 1 < nodes.length ? [name(nodes[index + 1].id)] : [];
  }
  const sop = (wf.name || "").trim() ? t("runs.sopNamed", { name: wf.name.trim() }) : t("runs.sopFallback");
  let text = t("runs.approvalHeader", { sop });
  text += upstream.length
    ? t("runs.approvalUpstream", { nodes: upstream.join(listSeparator()) })
    : t("runs.approvalNoUpstream");
  text += downstream.length
    ? t("runs.approvalDownstream", { nodes: downstream.join(listSeparator()) })
    : t("runs.approvalEnd");
  if (node.rejectTo) text += t("runs.approvalRejectTo", { node: name(node.rejectTo) });
  text += getLang() === "zh" ? "。" : ".";
  const instructions = (node.taskPrompt || "").trim();
  if (instructions) text += (getLang() === "zh" ? "" : " ") + t("runs.approvalInstructions", { instructions });
  return text;
}
export function conversationRunIDs(session) {
  const ids = new Set();
  const add = (id) => {
    if (typeof id === "string" && /^run-[\w-]+$/.test(id)) ids.add(id);
  };
  add(session?.runId);
  for (const message of session?.messages || []) {
    (message.runIds || []).forEach(add);
    for (const asset of message.assets || [])
      if (asset.kind === "run") add(asset.id);
    for (const ref of message.references || [])
      if (ref.type === "run") add(ref.id);
    if (message.role !== "assistant") continue;
    const reply = parseReply(message);
    for (const draft of reply.drafts || []) {
      if (
        !draft.saved ||
        !["runs_start", "issues_dispatch", "runs_retry"].includes(draft.tool)
      )
        continue;
      const result = draft.savedResult?.data || draft.savedResult;
      add(result?.runId);
      add(result?.id);
    }
    // Historical replies predate runIds metadata. Resolve only explicit run IDs,
    // then verify each against the server and the conversation's project.
    for (const match of (reply.message || "").matchAll(/\brun-[a-zA-Z0-9_-]+/g))
      add(match[0]);
  }
  return [...ids];
}

// A retired 自由协作 run or a chat workspace is where the assistant edits
// files, not a SOP: it has no nodes and never finishes, so the panel's
// 「SOP 运行」 list showed it as "等待审批 · 0/0 节点" — even for a conversation
// that is itself such a run. None of them are listed.
export function isConversationWorkspaceRun(run) {
  return Boolean(
    run &&
      (run.workflowId === "free-collaboration" ||
        run.workflowId === "conversation-workspace" ||
        run.kind === "workspace"),
  );
}

export function useConversationRuns(session, refreshKey = 0) {
  const [state, setState] = useState({ sessionId: null, runs: [] });
  const ids = useMemo(() => conversationRunIDs(session), [session]);
  const key = ids.join(",");
  useEffect(() => {
    let current = true,
      timer;
    setState((old) => ({
      sessionId: session?.id,
      runs:
        old.sessionId === session?.id
          ? old.runs.filter((r) => ids.includes(r.id))
          : [],
    }));
    const load = async () => {
      const rows = await Promise.allSettled(
        ids.map((id) => api(`/api/runs/${encodeURIComponent(id)}`)),
      );
      if (!current) return;
      const runs = rows
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value)
        .filter(
          (run) =>
            (!session?.projectId ||
              run.executionContext?.projectId === session.projectId) &&
            !isConversationWorkspaceRun(run),
        );
      setState({ sessionId: session?.id, runs });
      if (
        runs.some(
          (run) =>
            !["succeeded", "failed", "canceled", "cancelled"].includes(
              run.status,
            ),
        )
      )
        timer = setTimeout(load, 2500);
    };
    if (ids.length) void load();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [session?.id, session?.projectId, session?.updatedAt, key, refreshKey]);
  return state.sessionId === session?.id ? state.runs : [];
}
