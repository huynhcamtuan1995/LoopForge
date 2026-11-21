import { elapsedSeconds, formatElapsed } from "./api.js";
import { replyEngineLabel } from "./engines.js";
import { t } from "./i18n.js";

export const NOT_REPORTED = "未上报";
export const notReportedLabel = () => t("common.notReported");

const pad = (n) => String(n).padStart(2, "0");

function validDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) && date.getFullYear() > 1970
    ? date
    : null;
}

export function fullTime(value) {
  const date = validDate(value);
  return date
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : notReportedLabel();
}

/**
 * When a message was sent. Questions saved before the server stamped them
 * fall back to the moment their reply started, which is when they were sent.
 */
export function messageSentAt(messages, index) {
  const message = messages?.[index];
  if (!message) return null;
  const own = validDate(message.createdAt);
  if (own) return own;
  if (message.role !== "user") return null;
  const reply = messages[index + 1];
  return reply?.role === "assistant" ? validDate(reply.startedAt) : null;
}

/** Short label: 14:05 today, 10-31 14:05 this year, 2025-12-01 14:05 before. */
export function messageTimeLabel(date, now = new Date()) {
  if (!date) return "";
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
    return time;
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return date.getFullYear() === now.getFullYear()
    ? `${day} ${time}`
    : `${date.getFullYear()}-${day} ${time}`;
}

export const formatTokens = (n) =>
  Math.max(0, Number(n) || 0).toLocaleString("en-US");

const tokenParts = [
  ["input", "messageInfo.tokens.input", "inputTokens"],
  ["output", "messageInfo.tokens.output", "outputTokens"],
  ["cacheRead", "messageInfo.tokens.cacheRead", "cacheReadTokens"],
  ["cacheWrite", "messageInfo.tokens.cacheWrite", "cacheWriteTokens"],
];

/** Card fields for one saved assistant reply; missing data reads 「未上报」. */
export function messageInfo(message = {}, sessionExecutor = "") {
  const missingLabel = notReportedLabel();
  const seconds = elapsedSeconds(message.startedAt, message.createdAt);
  const model = String(message.model || "").trim();
  const tool = replyEngineLabel(model, sessionExecutor, message.speakerAgentId);
  const rows = [
    {
      key: "time",
      label: t("messageInfo.time"),
      value: fullTime(message.startedAt || message.createdAt),
    },
    {
      key: "agent",
      label: t("messageInfo.agent"),
      value: String(message.speakerName || "").trim() || t("messageInfo.mainBot"),
    },
    { key: "tool", label: t("messageInfo.tool"), value: tool || missingLabel },
    { key: "model", label: t("messageInfo.model"), value: model || missingLabel },
    {
      key: "elapsed",
      label: t("messageInfo.elapsed"),
      value: seconds === null ? missingLabel : formatElapsed(seconds),
    },
  ].map((row) => ({ ...row, missing: row.value === missingLabel }));
  const usage =
    message.usage && typeof message.usage === "object" ? message.usage : null;
  const tokens = usage
    ? tokenParts.map(([key, labelKey, field]) => {
        const value = Math.max(0, Number(usage[field]) || 0);
        return {
          key,
          label: t(labelKey),
          value,
          text: formatTokens(value),
          zero: value === 0,
        };
      })
    : [];
  const total = usage
    ? tokens.reduce((sum, part) => sum + part.value, 0)
    : null;
  return {
    rows,
    tokens,
    total,
    totalText: total === null ? NOT_REPORTED : formatTokens(total),
  };
}
