import React, { useEffect, useRef, useState } from "react";
import { api, sessionPath } from "./api.js";
import HarnessIcon from "./HarnessIcon";
import { getLang, t, useI18n } from "./i18n.js";
import { CredentialAction } from "./ui";
import { CLIInstallAction } from "./cli-install.jsx";
import "./generation-diagnostics.css";

const phaseLabel = (phase) =>
  ["setup", "execution", "protocol", "provider", "connection", "server", "orchestration"].includes(phase)
    ? t(`diagnostics.phase.${phase}`)
    : phase;
const statusLabel = (status) =>
  ["running", "completed", "failed", "cancelled", "interrupted", "unfinished"].includes(status)
    ? t(`diagnostics.status.${status}`)
    : status;
const processStateLabel = (state) =>
  ["not_started", "running", "start_failed", "exited", "unknown_after_interruption"].includes(state)
    ? t(`diagnostics.proc.${state}`)
    : state;
const toolSourceLabel = (source) =>
  ["gateway", "cli"].includes(source) ? t(`diagnostics.source.${source}`) : source;
const time = (value) =>
  value
    ? new Date(value).toLocaleString(getLang() === "en" ? "en-US" : "zh-CN", {
        hour12: false,
      })
    : "—";

async function copyText(text) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text);
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  try {
    input.select();
    if (!document.execCommand("copy"))
      throw new Error(t("diagnostics.copyManualError"));
  } finally {
    input.remove();
  }
}

export default function GenerationDiagnostics({
  sessionId,
  generationId,
  failure,
  onCLIInstall,
  compact = false,
  readOnly = false,
}) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const identity = `${sessionId}/${generationId}`;
  const current = useRef(identity);
  current.current = identity;
  useEffect(() => {
    setOpen(false);
    setReport(null);
    setNotice("");
    setError("");
    setLoading(false);
  }, [identity]);
  // Read-only viewers (shared conversation links) cannot read the report, so
  // they only see the fixed failure summary without detail actions.
  if (!sessionId || !generationId || (readOnly && compact)) return null;
  const path = `${sessionPath(sessionId)}/generations/${encodeURIComponent(generationId)}/diagnostics`;

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await api(path);
      if (current.current !== identity) return null;
      setReport(data);
      return data;
    } catch (e) {
      if (current.current === identity)
        setError(e.message || t("diagnostics.loadError"));
      return null;
    } finally {
      if (current.current === identity) setLoading(false);
    }
  }
  async function toggle() {
    setOpen(!open);
    if (!open) await load();
  }
  async function copy() {
    const data = await load();
    if (!data) return;
    try {
      await copyText(JSON.stringify(data, null, 2));
      if (current.current === identity) setNotice(t("diagnostics.copied"));
    } catch {
      if (current.current === identity)
        setError(t("diagnostics.copyError"));
    }
  }
  const shown = failure || report?.failure;
  return (
    <section
      className={`generation-diagnostics${compact ? " compact" : " failure"}`}
      aria-label={failure ? t("diagnostics.ariaFailure") : t("diagnostics.ariaInfo")}
    >
      {!compact && shown ? (
        <>
          <div className="diagnostic-heading">
            <HarnessIcon name="warning" size={17} aria-hidden="true" />
            <strong>{shown.message}</strong>
            <code>{shown.code}</code>
          </div>
          {shown.suggestion ? (
            <p className="diagnostic-suggestion">{shown.suggestion}</p>
          ) : null}
          <CredentialAction text={shown.message} />
          <CLIInstallAction text={shown.message} onResult={onCLIInstall} />
        </>
      ) : null}
      {readOnly ? null : (
        <div className="diagnostic-actions">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            disabled={loading}
          >
            <HarnessIcon
              name={open ? "chevron-down" : "chevron-right"}
              size={14}
              aria-hidden="true"
            />
            {compact ? t("diagnostics.compactLabel") : t("diagnostics.detailsLabel")}
          </button>
          {!compact || open ? (
            <>
              <button type="button" onClick={copy} disabled={loading}>
                <HarnessIcon name="copy" size={14} aria-hidden="true" />
                {t("diagnostics.copyButton")}
              </button>
              <a href={`${path}?download=1`} download>
                <HarnessIcon name="download" size={14} aria-hidden="true" />
                {t("diagnostics.downloadButton")}
              </a>
            </>
          ) : null}
          {loading ? (
            <span role="status">{t("common.loading")}</span>
          ) : notice ? (
            <span role="status">{notice}</span>
          ) : null}
        </div>
      )}
      {error ? (
        <p className="diagnostic-fetch-error" role="alert">
          {error}
        </p>
      ) : null}
      {open && report ? (
        <div className="diagnostic-details">
          {report.assessment ? (
            <div className="diagnostic-assessment">
              <strong>{report.assessment.summary}</strong>
              {report.assessment.evidence?.length ? (
                <ul className="diagnostic-list">
                  {report.assessment.evidence.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {report.assessment.unknowns?.length ? (
                <p className="diagnostic-subnote">
                  {t("diagnostics.unknowns", { items: report.assessment.unknowns.join(" ") })}
                </p>
              ) : null}
              {report.assessment.nextSteps?.length ? (
                <p className="diagnostic-subnote">
                  {t("diagnostics.nextSteps", { items: report.assessment.nextSteps.join(" ") })}
                </p>
              ) : null}
            </div>
          ) : null}
          <dl className="diagnostic-meta">
            <dt>{t("diagnostics.id")}</dt>
            <dd>
              <code>{report.generationId}</code>
            </dd>
            <dt>{t("diagnostics.status")}</dt>
            <dd>{statusLabel(report.status)}</dd>
            <dt>{t("diagnostics.startedAt")}</dt>
            <dd>{time(report.startedAt)}</dd>
            {report.termination ? (
              <>
                <dt>{t("diagnostics.terminationReason")}</dt>
                <dd>
                  <code>{report.termination.code}</code> ·{" "}
                  {report.termination.message}
                </dd>
              </>
            ) : null}
            {shown?.phase ? (
              <>
                <dt>{t("diagnostics.failedPhase")}</dt>
                <dd>{phaseLabel(shown.phase)}</dd>
              </>
            ) : null}
            {report.environment ? (
              <>
                <dt>{t("diagnostics.instance")}</dt>
                <dd>
                  <code>{report.environment.instanceId}</code> ·{" "}
                  {report.environment.platformVersion}
                  {report.environment.revision
                    ? ` (${report.environment.revision.slice(0, 8)})`
                    : ""}{" "}
                  · {report.environment.os}/{report.environment.arch}
                </dd>
              </>
            ) : null}
          </dl>
          {(report.attempts || []).map((attempt, index) => {
            const proc = attempt.process;
            const lastOut = proc?.lastStdoutAt || proc?.lastStderrAt;
            return (
              <div className="diagnostic-attempt" key={attempt.id}>
                <div className="diagnostic-attempt-heading">
                  <strong>
                    {t("diagnostics.attempt", { id: attempt.id?.split("/").at(-1) || index + 1 })} ·{" "}
                    {attempt.engine}
                    {attempt.cliVersion ? ` v${attempt.cliVersion.replace(/^v/i, "")}` : ""}
                  </strong>
                  <span>{attempt.model}</span>
                  <span>{statusLabel(attempt.status)}</span>
                  {attempt.exitCode != null ? (
                    <code>{t("diagnostics.exitCode", { code: attempt.exitCode })}</code>
                  ) : null}
                </div>
                <p className="diagnostic-attempt-meta">
                  {attempt.resume ? t("diagnostics.resumeSession") : t("diagnostics.newSession")} ·{" "}
                  {phaseLabel(attempt.phase)} ·{" "}
                  {time(attempt.startedAt)}
                  {attempt.endpoint ? ` · ${attempt.endpoint}` : ""}
                  {attempt.protocol ? ` (${attempt.protocol})` : ""}
                </p>
                {proc ? (
                  <p className="diagnostic-attempt-meta">
                    {t("diagnostics.processMeta", { state: processStateLabel(proc.state) })}
                    {proc.pid ? ` · PID ${proc.pid}` : ""}
                    {proc.signal ? t("diagnostics.signal", { signal: proc.signal }) : ""}
                    {t("diagnostics.outputLines", {
                      stdout: proc.stdoutLines || 0,
                      stderr: proc.stderrLines || 0,
                    })}
                    {lastOut ? t("diagnostics.lastOutput", { time: time(lastOut) }) : ""}
                  </p>
                ) : null}
                {attempt.firstError && report.dropped?.protocolEvents > 0 ? (
                  <div className="diagnostic-event">
                    <div>
                      <strong>{t("diagnostics.firstError")}</strong>
                      <code>{attempt.firstError.kind}</code>
                      {attempt.firstError.statusCode ? (
                        <span>HTTP {attempt.firstError.statusCode}</span>
                      ) : null}
                    </div>
                    {attempt.firstError.message ? (
                      <pre>{attempt.firstError.message}</pre>
                    ) : null}
                  </div>
                ) : null}
                {attempt.error ? (
                  <pre className="diagnostic-excerpt">{attempt.error}</pre>
                ) : null}
                {(attempt.events || []).map((event, i) => (
                  <div className="diagnostic-event" key={i}>
                    <div>
                      <code>{event.kind}</code>
                      {event.statusCode ? (
                        <span>HTTP {event.statusCode}</span>
                      ) : null}
                      {event.code ? <code>{event.code}</code> : null}
                      {event.retryable != null ? (
                        <span>
                          {event.retryable
                            ? t("diagnostics.retryable")
                            : t("diagnostics.notRetryable")}
                        </span>
                      ) : null}
                    </div>
                    {event.message ? <pre>{event.message}</pre> : null}
                    {event.requestId ? (
                      <p>
                        Request ID <code>{event.requestId}</code>
                      </p>
                    ) : null}
                    {event.traceId ? (
                      <p>
                        Trace ID <code>{event.traceId}</code>
                      </p>
                    ) : null}
                  </div>
                ))}
                {attempt.firstStderr?.length &&
                report.dropped?.stderrLines > 0 ? (
                  <details className="diagnostic-stderr">
                    <summary>
                      {t("diagnostics.firstStderr", { count: attempt.firstStderr.length })}
                    </summary>
                    <pre>{attempt.firstStderr.join("\n")}</pre>
                  </details>
                ) : null}
                {attempt.stderr?.length ? (
                  <details className="diagnostic-stderr">
                    <summary>
                      {t("diagnostics.recentStderr", { count: attempt.stderr.length })}
                    </summary>
                    <pre>{attempt.stderr.join("\n")}</pre>
                  </details>
                ) : null}
              </div>
            );
          })}
          {report.tools?.length ? (
            <details
              className="diagnostic-stderr"
              open={report.tools.some((t) => t.status !== "completed")}
            >
              <summary>{t("diagnostics.toolCalls", { count: report.tools.length })}</summary>
              <div className="diagnostic-tools">
                {report.tools.map((tool, i) => (
                  <div className="diagnostic-event" key={`${tool.id}-${i}`}>
                    <div>
                      <code>{tool.name}</code>
                      <span>{toolSourceLabel(tool.source)}</span>
                      <span>{statusLabel(tool.status)}</span>
                      {tool.exitCode != null ? (
                        <code>{t("diagnostics.exitCode", { code: tool.exitCode })}</code>
                      ) : null}
                    </div>
                    {tool.error ? <pre>{tool.error}</pre> : null}
                    {tool.requestId ? (
                      <p>
                        Request ID <code>{tool.requestId}</code>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {report.timeline?.length ? (
            <details className="diagnostic-stderr">
              <summary>{t("diagnostics.timeline", { count: report.timeline.length })}</summary>
              <pre>
                {report.timeline
                  .map(
                    (e) =>
                      `[${time(e.at)}] (${e.source || "cli"}) ${e.kind}${e.tool ? ` ${e.tool}` : ""}${e.code ? ` [${e.code}]` : ""}${e.message ? ` — ${e.message}` : ""}`,
                  )
                  .join("\n")}
              </pre>
            </details>
          ) : null}
          {report.error &&
          !report.attempts?.some((attempt) => attempt.error) ? (
            <pre className="diagnostic-excerpt">{report.error}</pre>
          ) : null}
          {!report.attempts?.length && !report.error ? (
            <p className="diagnostic-note">{t("diagnostics.noAttempts")}</p>
          ) : null}
          <p className="diagnostic-note">
            {t("diagnostics.redactedNote")}
            {report.truncated ? t("diagnostics.truncatedNote") : ""}
          </p>
          {report.status === "running" ? (
            <button
              type="button"
              className="diagnostic-refresh"
              onClick={load}
              disabled={loading}
            >
              {t("diagnostics.refresh")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
