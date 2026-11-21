import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "./i18n.js";
import { modelEffort } from "./effort.js";
import { createLocalConversations } from "./local-conversation-fixtures.js";
import { localId as newLocalId } from "./local-id.js";

export const LOCAL_CONVERSATIONS_KEY = "agentflow.local-conversations.v1";
export const isLocalConversation = (id) => typeof id === "string" && id.startsWith("local-preview-");
const emptyLive = { answer: "", thinking: "", tools: [], activity: [] };
const timestamp = () => new Date().toISOString();

function localReply(text, title) {
  if (/什么模型|哪个模型|什么AI|什么 AI|你是谁|what model|which model|who are you/i.test(text))
    return t("local.reply.model");
  if (/总结|汇总|清单|列出来|summary|summarize|checklist|list/i.test(text))
    return t("local.reply.summary", { title });
  if (/颜色|hover|动效|动画|color|motion|animation/i.test(text))
    return t("local.reply.style");
  return t("local.reply.default", { title });
}

/** Use the normal conversation UI with browser-local fixtures when the server is empty.
 * Local IDs are intercepted here and never enter useChat, its URL or its API calls.
 */
export function useLocalConversations(real) {
  const key = real.user ? `${LOCAL_CONVERSATIONS_KEY}.${real.user.id}` : "";
  const [store, setStore] = useState({ key: "", sessions: [] });
  const storeRef = useRef(store);
  const [localId, setLocalId] = useState(null);
  const [localRevealId, setLocalRevealId] = useState(null);
  const localIdRef = useRef(localId);
  // The ready handshake repeats the host project. Track that context separately
  // from a local conversation's project binding so reload can restore selection.
  const hostProjectRef = useRef(real.projectId || "");
  const [error, setLocalError] = useState("");
  const [generations, setGenerations] = useState({});
  const generationsRef = useRef(generations);
  const timers = useRef(new Map());
  const previewEnabled = new URLSearchParams(location.search).get("localPreview") === "1";
  const available = previewEnabled && real.ready && !real.activeId && !real.sessions.length;
  const availableRef = useRef(available);
  availableRef.current = available;
  localIdRef.current = localId;
  generationsRef.current = generations;

  const selectLocal = useCallback((id) => {
    localIdRef.current = id;
    setLocalId(id);
    setLocalError("");
    try {
      const selectionKey = `${storeRef.current.key}.selected`;
      if (id) sessionStorage.setItem(selectionKey, id);
      else sessionStorage.removeItem(selectionKey);
    } catch {}
  }, []);

  const save = useCallback((change) => {
    const current = storeRef.current;
    const sessions = change(current.sessions);
    const next = { ...current, sessions };
    storeRef.current = next;
    setStore(next);
    try {
      if (next.key) localStorage.setItem(next.key, JSON.stringify(sessions));
    } catch {
      setLocalError(t("local.storageQuotaError"));
    }
    return sessions;
  }, []);

  useEffect(() => {
    if (!real.ready || !real.user || !key || storeRef.current.key === key) return;
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    generationsRef.current = {};
    setGenerations({});
    let sessions;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved) && saved.every((row) => isLocalConversation(row?.id) && Array.isArray(row.messages))) sessions = saved;
    } catch {}
    sessions ||= previewEnabled ? createLocalConversations(real.user, real.model) : [];
    // Browser-local replies run in this page. A persisted running row has no
    // surviving timer after reload, so it must not keep advertising activity.
    sessions = sessions.map((row) => row.generationStatus === "running"
      ? { ...row, generationStatus: "interrupted" } : row);
    const next = { key, sessions };
    storeRef.current = next;
    setStore(next);
    setLocalId(null);
    try {
      localStorage.setItem(key, JSON.stringify(sessions));
    } catch {
      setLocalError(t("local.storageQuotaError"));
    }
    if (available) {
      try {
        const selected = sessionStorage.getItem(`${key}.selected`);
        if (sessions.some((row) => row.id === selected && !row.archived)) {
          selectLocal(selected);
          setLocalRevealId(selected);
        }
      } catch {}
    }
  }, [real.ready, real.user?.id, key, real.model, available, previewEnabled, selectLocal]);

  useEffect(() => {
    if (!available) selectLocal(null);
  }, [available, selectLocal]);
  useEffect(() => {
    const onContext = (event) => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "agentflow-project-context") return;
      const projectId = event.data.projectId || "";
      if (projectId === hostProjectRef.current) return;
      hostProjectRef.current = projectId;
      selectLocal(null);
    };
    window.addEventListener("message", onContext);
    return () => window.removeEventListener("message", onContext);
  }, [selectLocal]);
  useEffect(() => () => {
    timers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const rows = store.key === key ? store.sessions : [];
  const session = available ? rows.find((row) => row.id === localId) : null;
  const local = !!session;
  const localModel = session?.model || real.model;
  const selected = () => availableRef.current && storeRef.current.sessions.find((row) => row.id === localIdRef.current);
  const setGeneration = (id, value) => {
    const next = { ...generationsRef.current, [id]: value };
    generationsRef.current = next;
    setGenerations(next);
  };
  const update = (id, change) => {
    let result = null;
    save((sessions) => sessions.map((row) => {
      if (row.id !== id) return row;
      result = { ...change(row), updatedAt: timestamp() };
      return result;
    }));
    return result;
  };
  const complete = (stored, text) => {
    const id = stored.id;
    const running = generationsRef.current[id];
    if (running?.status === "running") {
      setLocalError(t("local.replyInProgress"));
      return false;
    }
    const startedAt = timestamp();
    const response = localReply(text, stored.title);
    const generation = { id: `${id}-${Date.now()}`, status: "running", startedAt, updatedAt: startedAt };
    setGeneration(id, generation);
    update(id, (row) => ({ ...row, generationStatus: "running" }));
    const timer = setTimeout(() => {
      timers.current.delete(id);
      const finishedAt = timestamp();
      const activity = [{ kind: "status", text: t("local.organizing"), at: startedAt }];
      update(id, (row) => ({ ...row, generationStatus: "completed", messages: [...row.messages, { role: "assistant", content: response, createdAt: finishedAt, startedAt, activity }] }));
      setGeneration(id, { ...generation, status: "completed", updatedAt: finishedAt });
    }, 650);
    timers.current.set(id, timer);
    return true;
  };

  const open = useCallback((id) => {
    if (isLocalConversation(id)) {
      if (availableRef.current && storeRef.current.sessions.some((row) => row.id === id)) {
        selectLocal(id);
        setLocalRevealId(id);
      }
      return;
    }
    selectLocal(null);
    return real.open(id);
  }, [real.open, selectLocal]);
  const newChat = useCallback(() => {
    selectLocal(null);
    return real.newChat();
  }, [real.newChat, selectLocal]);

  return {
    ...real,
    local,
    localSessions: available && store.key === key,
    sessions: available && store.key === key ? rows : real.sessions,
    ...(local ? {
      activeId: session.id,
      revealId: localRevealId,
      session,
      projectId: session.projectId || "",
      issueId: session.issueId || "",
      model: localModel,
      effort: modelEffort(real.models?.find((item) => item.id === localModel), session.effort),
      generation: generations[session.id] || null,
      live: emptyLive,
      busy: generations[session.id]?.status === "running",
      queue: [],
      queueHeld: false,
      submitting: false,
      readOnly: false,
      error,
    } : {}),
    open,
    newChat,
    startProjectDraft(id) {
      selectLocal(null);
      return real.startProjectDraft(id);
    },
    setError(value) {
      if (selected()) setLocalError(value);
      else real.setError(value);
    },
    setModel(value) {
      const current = selected();
      if (current) {
        const model = real.models?.find((item) => item.id === value);
        update(current.id, (row) => ({ ...row, model: value, effort: modelEffort(model, row.effort) }));
      } else if (!isLocalConversation(localIdRef.current)) real.setModel(value);
    },
    setEffort(value) {
      const current = selected();
      if (current) update(current.id, (row) => ({ ...row, effort: value }));
      else if (!isLocalConversation(localIdRef.current)) real.setEffort(value);
    },
    setSession(value) {
      const current = selected();
      if (current) update(current.id, (row) => typeof value === "function" ? value(row) : { ...value, id: row.id, local: true });
      else if (!isLocalConversation(localIdRef.current) && !isLocalConversation(value?.id)) real.setSession(value);
    },
    async send(options) {
      const current = selected();
      if (!current) return isLocalConversation(localIdRef.current) ? false : real.send(options);
      if (!options.text.trim() && !options.attachments?.length) return false;
      if (generationsRef.current[current.id]?.status === "running") {
        setLocalError(t("local.replyInProgress"));
        return false;
      }
      setLocalError("");
      const message = { role: "user", content: options.text.trim() || t("chat.attachmentPrompt"), authorId: real.user?.id, authorName: real.user?.chineseName || real.user?.loginName, createdAt: timestamp(), ...(options.attachments?.length ? { attachments: options.attachments } : {}), ...(options.references?.length ? { references: options.references } : {}) };
      const stored = update(current.id, (row) => ({ ...row, messages: [...(options.messagesOverride || row.messages), message] }));
      return complete(stored, message.content);
    },
    async stop() {
      const current = selected();
      if (!current) return isLocalConversation(localIdRef.current) ? false : real.stop();
      clearTimeout(timers.current.get(current.id));
      timers.current.delete(current.id);
      const generation = generationsRef.current[current.id];
      setGeneration(current.id, { ...generation, status: "cancelled", updatedAt: timestamp() });
      update(current.id, (row) => ({ ...row, generationStatus: "cancelled" }));
      setLocalError("");
    },
    async rename(id, title) {
      if (!isLocalConversation(id)) return real.rename(id, title);
      if (!title.trim()) return false;
      return !!update(id, (row) => ({ ...row, title: title.trim() }));
    },
    async archive(id, archived) {
      if (!isLocalConversation(id)) return real.archive(id, archived);
      update(id, (row) => ({ ...row, archived }));
      if (localIdRef.current === id) selectLocal(null);
    },
    async remove(id) {
      if (!isLocalConversation(id)) return real.remove(id);
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      save((sessions) => sessions.filter((row) => row.id !== id));
      if (localIdRef.current === id) selectLocal(null);
    },
    async edit(index, content, fork = false) {
      const current = selected();
      if (!current) return isLocalConversation(localIdRef.current) ? null : real.edit(index, content, fork);
      if (!current.messages[index] || !content.trim()) return null;
      const messages = current.messages.slice(0, index + 1).map((message, messageIndex) => messageIndex === index ? { ...message, content: content.trim() } : message);
      if (!fork) return update(current.id, (row) => ({ ...row, messages, generationStatus: "completed" }));
      const id = newLocalId("local-preview");
      const forked = { ...current, id, title: t("local.forkSuffix", { title: current.title }), messages, generationStatus: "completed", createdAt: timestamp(), updatedAt: timestamp() };
      save((sessions) => [forked, ...sessions]);
      selectLocal(id);
      return forked;
    },
    async regenerate(stored, approvalMode) {
      if (!isLocalConversation(stored?.id)) return real.regenerate(stored, approvalMode);
      selectLocal(stored.id);
      return complete(stored, [...stored.messages].reverse().find((message) => message.role === "user")?.content || stored.title);
    },
    async selectProject(id, options) {
      const current = selected();
      if (!current) return isLocalConversation(localIdRef.current) ? false : real.selectProject(id, options);
      update(current.id, (row) => ({ ...row, projectId: id, issueId: "" }));
      return true;
    },
    async linkIssue(id) {
      const current = selected();
      if (!current) return isLocalConversation(localIdRef.current) ? false : real.linkIssue(id);
      update(current.id, (row) => ({ ...row, issueId: id }));
      return true;
    },
    async applyDraft(...args) {
      if (!selected() && !isLocalConversation(localIdRef.current)) return real.applyDraft(...args);
      throw Error(t("local.noDraftError"));
    },
    async refresh() {
      if (!selected()) return real.refresh();
    },
  };
}
