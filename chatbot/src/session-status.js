import { t } from "./i18n.js";

const states = {
  running: { state: "running", get label() { return t("session.reply.running"); }, icon: "arc-spinner", busy: true },
  completed: { state: "completed", get label() { return t("session.reply.completed"); } },
  failed: { state: "failed", get label() { return t("session.reply.failed"); }, icon: "alert" },
  cancelled: { state: "cancelled", get label() { return t("session.reply.cancelled"); } },
  interrupted: { state: "interrupted", get label() { return t("session.reply.interrupted"); }, icon: "warning" },
  idle: { state: "idle", get label() { return t("session.reply.idle"); }, icon: "chat" },
};

// A generation describes a model reply, never the completion of a project/task.
// Only the selected session supplies live generation/submission information.
export function sessionReplyStatus(session, { generation, busy = false } = {}) {
  const matching = generation && (!generation.sessionId || generation.sessionId === session.id);
  const value = busy ? "running" : (matching && generation.status) || session.generationStatus;
  const hit = states[value === "canceled" ? "cancelled" : value] || states.idle;
  return { ...hit, label: hit.label };
}

// A completed reply the reader has not opened yet carries a blue dot, as in
// Codex; once read, a completed row is quiet again.
const unreadState = { state: "unread", get label() { return t("session.reply.unread"); }, dot: true };

export function sidebarReplyStatus(status, unread = false) {
  return unread && status.state === "completed" ? { ...unreadState, label: unreadState.label } : status;
}

// Run sessions only earn a chip while something needs the reader: a running
// SOP, a run waiting for a person, or a failure. Finished runs stay quiet; the
// title already says which SOP they belong to.
const runStates = {
  running: { state: "running", get label() { return t("session.run.running"); } },
  waiting: { state: "waiting", get label() { return t("session.run.waiting"); } },
  failed: { state: "failed", get label() { return t("session.run.failed"); } },
};

export function runSessionState(session) {
  if (!session?.shared || !session?.runId) return null;
  const state = runStates[session.runStatus];
  if (!state) return null;
  return { state: state.state, label: session.runStatusLabel || state.label };
}

// The hover text of a history row. A run conversation's title says what the
// run does, so its SOP and run state are named here instead of in the row.
export function sessionTooltip(session, { projectName = "", replyLabel = "" } = {}) {
  const run = Boolean(session?.shared && session?.runId);
  const title = session?.displayTitle || session?.title || t("common.newChat");
  const sop = run && session.sopName && !title.includes(session.sopName) ? session.sopName : "";
  return [title, projectName, sop, run ? session.runStatusLabel || replyLabel : replyLabel]
    .filter(Boolean)
    .join(" · ");
}
