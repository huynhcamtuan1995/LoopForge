import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import HarnessIcon from "./HarnessIcon";
import { t, useI18n } from "./i18n.js";
import SlidingTabs from "./SlidingTabs";
import { attachmentURL, visibleText } from "./api";
import { definitionTarget } from "./platform.js";
import {
  AgentBrowserLinks,
  agentBrowserTarget,
  remarkWorkspaceLinks,
} from "./agent-browser-links.js";
import "./agent-browser.css";
import {
  imageRetryDelay,
  initialImageStatus,
  retryImageURL,
  shouldAutoRetryImage,
} from "./image-load.js";
import {
  presentationPages,
  presentationTitle,
  exportPresentation,
} from "./presentation.js";
import "./artifact-preview.css";

const Check = (props) => <HarnessIcon name="check" {...props} />;
const Copy = (props) => <HarnessIcon name="copy" {...props} />;
const Download = (props) => <HarnessIcon name="download" {...props} />;
const ImageOff = (props) => <HarnessIcon name="image-off" {...props} />;
const Refresh = (props) => <HarnessIcon name="refresh" {...props} />;
const Spinner = (props) => <HarnessIcon name="spinner" {...props} />;
const FileText = (props) => <HarnessIcon name="doc" {...props} />;
const X = (props) => <HarnessIcon name="close" {...props} />;

export function safeSVG(source) {
  return DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "animate", "set"],
    FORBID_ATTR: ["href", "xlink:href"],
  });
}
export function download(name, content, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CopyButton({ value, label, className = "" }) {
  useI18n();
  const resolvedLabel = label ?? t("common.copy");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(value);
      else {
        const text = document.createElement("textarea");
        text.value = value;
        document.body.append(text);
        text.select();
        document.execCommand("copy");
        text.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={copied ? t("common.copied") : resolvedLabel}
      title={copied ? t("common.copied") : resolvedLabel}
      onClick={copy}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
export function Diagram({ source }) {
  useI18n();
  const [result, setResult] = useState({ svg: "", failed: false });
  const id = useId().replace(/[^a-z0-9]/gi, "");
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          theme:
            document.documentElement.dataset.theme === "dark"
              ? "dark"
              : "neutral",
          fontFamily: "system-ui, sans-serif",
        });
        const rendered = await mermaid.render(`diagram-${id}`, source);
        if (current)
          setResult({
            svg: DOMPurify.sanitize(rendered.svg, {
              USE_PROFILES: { svg: true },
              FORBID_TAGS: ["script", "foreignObject"],
            }),
            failed: false,
          });
      } catch {
        if (current)
          setResult({
            svg: "",
            failed: true,
          });
      }
    })();
    return () => {
      current = false;
    };
  }, [source, id]);
  return result.svg ? (
    <div className="diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />
  ) : (
    <div className="diagram-loading">
      {result.failed ? t("richContent.diagramError") : t("richContent.diagramLoading")}
      {result.failed ? <pre>{source}</pre> : null}
    </div>
  );
}
export function Slides({ source }) {
  useI18n();
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false),
    [exportFailed, setExportFailed] = useState(false);
  const slides = presentationPages(source);
  const currentPage = Math.min(page, Math.max(0, slides.length - 1));
  return (
    <div className="slides">
      <div
        className={`slide ${currentPage === 0 ? "slide-cover" : ""}`}
        aria-label={t("richContent.slideAria", { page: currentPage + 1 })}
      >
        <div className="slide-eyebrow">{presentationTitle(source)}</div>
        <Markdown remarkPlugins={[remarkGfm]}>{slides[currentPage]}</Markdown>
        <small className="slide-page">
          {currentPage + 1} / {slides.length}
        </small>
      </div>
      <div className="slide-controls">
        <button
          disabled={!currentPage}
          onClick={() => setPage(currentPage - 1)}
        >
          {t("richContent.prevSlide")}
        </button>
        <span>
          {currentPage + 1} / {slides.length}
        </span>
        <button
          disabled={currentPage === slides.length - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          {t("richContent.nextSlide")}
        </button>
        <button
          className="slide-export"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setExportFailed(false);
            try {
              await exportPresentation(source);
            } catch {
              setExportFailed(true);
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={14} />
          {exporting ? t("richContent.exportingPpt") : t("richContent.downloadPpt")}
        </button>
      </div>
      {exportFailed ? (
        <p role="alert" className="error">
          {t("richContent.pptExportFailed")}
        </p>
      ) : null}
    </div>
  );
}
export function CodeBlock({ language, source }) {
  useI18n();
  const [preview, setPreview] = useState(
    ["svg", "mermaid", "html", "slides", "ppt"].includes(language),
  );
  const visual = ["svg", "mermaid", "html", "slides", "ppt"].includes(language);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language || t("richContent.plainText")}</span>
        <div>
          {visual ? (
            <button onClick={() => setPreview(!preview)}>
              {preview ? t("richContent.viewSource") : t("richContent.preview")}
            </button>
          ) : null}
          <CopyButton value={source} label={t("richContent.copyCode")} />
        </div>
      </div>
      {preview && language === "svg" ? (
        <div
          className="svg-preview"
          dangerouslySetInnerHTML={{ __html: safeSVG(source) }}
        />
      ) : preview && language === "mermaid" ? (
        <Diagram source={source} />
      ) : preview && language === "html" ? (
        <iframe
          title={t("richContent.htmlPreviewTitle")}
          className="html-preview"
          sandbox="allow-scripts"
          key={source}
          src="/chatbot/preview.html"
          onLoad={(event) =>
            event.currentTarget.contentWindow?.postMessage(
              { type: "agentflow-html-preview", source },
              "*",
            )
          }
        />
      ) : preview && ["slides", "ppt"].includes(language) ? (
        <Slides source={source} />
      ) : (
        <pre>
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
const MarkdownAssets = createContext({ assets: [], projectId: "" });
// Set inside a link so inline code there does not become a nested control.
const InsideLink = createContext(false);
// file:///workspace/... survives URL sanitizing only to be opened in the Agent
// browser; it is never rendered as an href.
const markdownURL = (url) =>
  /^file:\/\/\/workspace\//i.test(url) ? url : defaultUrlTransform(url);
function AgentBrowserLink({ target, open, children }) {
  return (
    <InsideLink.Provider value>
      <button
        type="button"
        className="agent-browser-link"
        title={t("richContent.openInAgentBrowser", { target })}
        onClick={() => open(target)}
      >
        {children}
        <HarnessIcon
          name="stage-browser"
          size={12}
          className="agent-browser-link-icon"
        />
      </button>
    </InsideLink.Provider>
  );
}
const markdownComponents = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const { assets, projectId } = useContext(MarkdownAssets);
    const openInBrowser = useContext(AgentBrowserLinks);
    const insideLink = useContext(InsideLink);
    const source = String(children).replace(/\n$/, "");
    const language = /language-([^\s]+)/.exec(className || "")?.[1];
    const browserTarget =
      openInBrowser && !insideLink && !language && !source.includes("\n")
        ? agentBrowserTarget(source)
        : "";
    if (browserTarget)
      return (
        <AgentBrowserLink target={browserTarget} open={openInBrowser}>
          <code>{source}</code>
        </AgentBrowserLink>
      );
    const target =
      !language && !source.includes("\n")
        ? assets
            .map((a) => definitionTarget(a, projectId))
            .find((a) => a?.id === source)
        : null;
    if (target)
      return (
        <a
          className="definition-code-link"
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
          title={target.label}
        >
          <code>{children}</code>
        </a>
      );
    return language || source.includes("\n") ? (
      <CodeBlock language={language || ""} source={source} />
    ) : (
      <code>{children}</code>
    );
  },
  a: ({ href, children }) => {
    const openInBrowser = useContext(AgentBrowserLinks);
    const target = openInBrowser ? agentBrowserTarget(href) : "";
    if (target)
      return (
        <AgentBrowserLink target={target} open={openInBrowser}>
          {children}
        </AgentBrowserLink>
      );
    if (/^file:/i.test(href || "")) return <span>{children}</span>;
    return (
      <InsideLink.Provider value>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      </InsideLink.Provider>
    );
  },
  img: ({ src, alt }) =>
    src?.startsWith("/api/assistant/attachments/") ? (
      <ZoomableImage src={src} alt={alt || t("richContent.image")} />
    ) : (
      <span className="unavailable-image">
        {t("richContent.imageInArtifacts", { alt: alt || t("richContent.image") })}
      </span>
    ),
  table: ({ children }) => (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  ),
};
const emptyAssets = [];
export function RichContent({ message, assets = emptyAssets, projectId = "" }) {
  const { lang } = useI18n();
  const text = typeof message === "string" ? message : visibleText(message);
  const context = useMemo(() => ({ assets, projectId }), [assets, projectId]);
  const markdown = useMemo(() => (
    <Markdown
      remarkPlugins={[remarkGfm, remarkWorkspaceLinks]}
      components={markdownComponents}
      urlTransform={markdownURL}
    >
      {text}
    </Markdown>
  ), [text, lang]);
  return (
    <MarkdownAssets.Provider value={context}>
      <div className="markdown">{markdown}</div>
    </MarkdownAssets.Provider>
  );
}

// Full-window viewer shared by chat images, artifact previews and SOP node
// files. Double-click an image to open; Esc closes.
export function ImageLightbox({ src, alt, onClose }) {
  useI18n();
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("richContent.lightboxAria", { alt: alt || "" })}
      onClick={onClose}
    >
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
      <button
        type="button"
        className="icon-button image-lightbox-close"
        aria-label={t("richContent.closeLightbox")}
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </div>,
    document.body,
  );
}

export function ZoomableImage({ src, alt, className }) {
  useI18n();
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <img
        className={className}
        src={src}
        alt={alt}
        title={t("richContent.zoomTitle")}
        onDoubleClick={() => setZoom(true)}
      />
      {zoom ? (
        <ImageLightbox src={src} alt={alt} onClose={() => setZoom(false)} />
      ) : null}
    </>
  );
}

export function Attachment({ attachment, sessionId, onOpen }) {
  useI18n();
  const image = attachment.mimeType?.startsWith("image/");
  const [zoom, setZoom] = useState(false);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const img = useRef(null);
  const retriedAt = useRef(-Infinity);
  const url = attachmentURL(attachment, sessionId);
  const src = retryImageURL(url, attempt);
  // While a silent reload is pending the failure notice stays hidden, so the
  // first fetch of a just-sent message never flashes an error.
  const retrying = image && shouldAutoRetryImage(status, attempt);
  const shown = retrying ? "loading" : status;
  const failed = image && shown === "error";
  useEffect(() => {
    if (image) setStatus(initialImageStatus(img.current));
  }, [image, src]);
  // The just-sent message is on screen before its transcript (and the
  // attachment entry inside it) reaches the server. Reload quietly first so the
  // user does not see a failure they would fix by refreshing the page.
  useEffect(() => {
    if (!image || !shouldAutoRetryImage(status, attempt)) return undefined;
    const timer = setTimeout(() => {
      setStatus("loading");
      setAttempt((n) => n + 1);
    }, imageRetryDelay(attempt));
    return () => clearTimeout(timer);
  }, [image, status, attempt]);
  const retry = (e) => {
    e.preventDefault();
    e.stopPropagation();
    retriedAt.current = e.timeStamp;
    setStatus("loading");
    setAttempt((n) => n + 1);
  };
  // The retry control unmounts on its first click, so the rest of a double-click lands on the card.
  const continuesRetry = (e) =>
    e.detail > 1 && e.timeStamp - retriedAt.current < 1000;
  return (
    <>
      <button
        type="button"
        className={image ? "message-image" : "attachment-chip"}
        // The card shows no caption, so the hover title names the file.
        title={
          image
            ? `${attachment.name}\n${failed ? t("richContent.clickOpenArtifacts") : t("richContent.clickViewLarge")}`
            : undefined
        }
        onClick={(e) => {
          if (continuesRetry(e)) return;
          if (image && !failed) {
            setZoom(true);
            return;
          }
          onOpen({
            ...attachment,
            url,
            kind: "attachment",
            source: t("richContent.sessionAttachment"),
          });
        }}
      >
        {image ? (
          <span
            className="message-image-frame"
            data-status={shown}
            aria-busy={shown === "loading" || undefined}
          >
            <img
              key={attempt}
              ref={img}
              src={src}
              alt={attachment.name}
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
            />
            {shown === "loading" ? (
              <span className="message-image-placeholder">
                <Spinner size={22} motion="busy" />
                <span className="message-image-hidden-label">{t("richContent.imageLoading")}</span>
              </span>
            ) : null}
            {failed ? (
              <span className="message-image-placeholder">
                <ImageOff size={22} />
                <span>{t("richContent.imageLoadFailed")}</span>
                <span
                  className="message-image-retry"
                  role="button"
                  tabIndex={0}
                  aria-label={t("richContent.retryLoadImage")}
                  onClick={retry}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") retry(e);
                  }}
                >
                  <Refresh size={14} />
                  <span>{t("common.retry")}</span>
                </span>
              </span>
            ) : null}
          </span>
        ) : (
          <>
            <FileText size={18} />
            <span>{attachment.name}</span>
          </>
        )}
      </button>
      {zoom ? (
        <ImageLightbox
          src={url}
          alt={attachment.name}
          onClose={() => setZoom(false)}
        />
      ) : null}
    </>
  );
}
export function ArtifactPreview({ artifact }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("preview");
  const readable =
    !artifact?.mimeType ||
    /^(text\/|application\/(json|javascript|xml))/.test(artifact.mimeType);
  // An attached HTML file (e.g. a demo from the workspace) previews in the same
  // script-only sandbox as an html code block.
  const kind =
    artifact?.kind === "attachment" &&
    /^text\/html\b/i.test(artifact.mimeType || "")
      ? "html"
      : artifact?.kind;
  useEffect(() => {
    let current = true;
    setText("");
    setError("");
    setMode("preview");
    if (
      readable &&
      artifact?.id?.startsWith("local-attachment-") &&
      /^data:[^,]*;base64,/.test(artifact.localDataUrl || "")
    ) {
      try {
        const encoded = artifact.localDataUrl.slice(
          artifact.localDataUrl.indexOf(",") + 1,
        );
        const bytes = Uint8Array.from(atob(encoded), (character) =>
          character.charCodeAt(0),
        );
        setText(new TextDecoder().decode(bytes));
      } catch {
        setError(t("richContent.fileReadFailed"));
      }
      return () => {
        current = false;
      };
    }
    if (artifact?.url && readable)
      fetch(artifact.url)
        .then((r) => {
          if (!r.ok) throw Error(t("richContent.fileReadFailed"));
          return r.text();
        })
        .then((value) => {
          if (current) setText(value);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [artifact?.id, artifact?.url, artifact?.localDataUrl, readable]);
  useI18n();
  if (!artifact) return null;
  const source = artifact.url ? text : (artifact.content ?? text);
  const hasSource = typeof source === "string" && source.length > 0 && !error;
  const isMarkdown =
    artifact.mimeType?.startsWith("text/markdown") ||
    ["markdown", "md"].includes(artifact.language?.toLowerCase());
  const canPreview =
    hasSource &&
    (["svg", "mermaid", "html", "slides", "ppt"].includes(kind) || isMarkdown);
  return (
    <article className="artifact-preview">
      <header className="artifact-preview-header">
        <div className="artifact-preview-file-row">
          <FileText size={17} />
          <div className="artifact-preview-file-identity">
            <p className="artifact-preview-file-name" title={artifact.name}>
              {artifact.name}
            </p>
            {artifact.source ? (
              <p className="artifact-preview-file-meta">{artifact.source}</p>
            ) : null}
          </div>
        </div>
        <div className="artifact-preview-toolbar" aria-label={t("richContent.artifactToolbarAria")}>
          {canPreview ? (
            <SlidingTabs
              className="artifact-preview-view-options"
              aria-label={t("richContent.artifactViewModeAria")}
            >
              <button
                type="button"
                role="tab"
                className={mode === "preview" ? "is-selected" : ""}
                aria-selected={mode === "preview"}
                onClick={() => setMode("preview")}
              >
                {t("richContent.preview")}
              </button>
              <button
                type="button"
                role="tab"
                className={mode === "source" ? "is-selected" : ""}
                aria-selected={mode === "source"}
                onClick={() => setMode("source")}
              >
                {t("richContent.source")}
              </button>
            </SlidingTabs>
          ) : null}
          <div
            className="artifact-preview-actions"
            role="group"
            aria-label={t("richContent.artifactActionsAria")}
          >
            {hasSource ? (
              <CopyButton
                className="artifact-preview-icon-action"
                value={source}
                label={t("richContent.copyContent")}
              />
            ) : null}
            {artifact.url ? (
              <a
                className="icon-button artifact-preview-icon-action"
                aria-label={t("richContent.downloadFile")}
                title={t("richContent.downloadFile")}
                href={artifact.url}
                download={artifact.name}
              >
                <Download size={15} />
              </a>
            ) : (
              <button
                type="button"
                className="icon-button artifact-preview-icon-action"
                aria-label={t("richContent.downloadFile")}
                title={t("richContent.downloadFile")}
                onClick={() =>
                  ["slides", "ppt"].includes(artifact.kind)
                    ? exportPresentation(source)
                    : download(
                        artifact.name,
                        artifact.kind === "svg" ? safeSVG(source) : source,
                        artifact.mimeType,
                      )
                }
              >
                <Download size={15} />
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="artifact-preview-stage">
        {error ? (
          <p className="error">{error}</p>
        ) : artifact.mimeType?.startsWith("image/") && artifact.url ? (
          <ZoomableImage
            className="artifact-image"
            src={artifact.url}
            alt={artifact.name}
          />
        ) : mode === "source" && canPreview ? (
          <pre className="artifact-source">
            <code>{source}</code>
          </pre>
        ) : artifact.kind === "svg" ? (
          <div
            className="svg-preview"
            dangerouslySetInnerHTML={{ __html: safeSVG(source) }}
          />
        ) : artifact.kind === "mermaid" ? (
          <Diagram source={source} />
        ) : kind === "html" ? (
          <iframe
            title={t("richContent.htmlPreviewTitle")}
            className="html-preview"
            sandbox="allow-scripts"
            key={source}
            src="/chatbot/preview.html"
            onLoad={(event) =>
              event.currentTarget.contentWindow?.postMessage(
                { type: "agentflow-html-preview", source },
                "*",
              )
            }
          />
        ) : ["slides", "ppt"].includes(artifact.kind) ? (
          <Slides source={source} />
        ) : artifact.url && !readable ? (
          <p className="muted">{t("richContent.binaryHint")}</p>
        ) : isMarkdown ? (
          <RichContent message={source} />
        ) : (
          <pre className="artifact-source">{source || t("common.loading")}</pre>
        )}
      </div>
    </article>
  );
}
