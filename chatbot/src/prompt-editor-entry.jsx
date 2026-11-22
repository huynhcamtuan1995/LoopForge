import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ReferenceInput from "./ReferenceInput";
import { t } from "./i18n.js";
import inputStyles from "./reference-input.css?inline";
import mentionStyles from "./mention-context.css?inline";
import iconStyles from "./harness-icons.css?inline";
import styles from "./prompt-editor.css?inline";

function PromptEditor({ value, onChange, onError }) {
  const [mention, setMention] = useState(null);
  const input = useRef(null),
    editor = useRef(null);
  return (
    <div className="chat-shell schedule-prompt-shell">
      <label htmlFor="schedule-prompt">{t("promptEditor.label")}</label>
      <div
        className="composer"
        onKeyDown={(event) => {
          if (event.key === "Escape") editor.current?.keyDown(event);
        }}
      >
        <ReferenceInput
          ref={editor}
          editorRef={input}
          projectId={value.projectId}
          text={value.text}
          references={value.references || []}
          showReferenceChips={false}
          mention={mention}
          referencesReadOnly={value.readOnly}
          onMentionChange={setMention}
          onChange={onChange}
          onError={onError}
          textareaProps={{
            id: "schedule-prompt",
            "aria-label": t("promptEditor.label"),
            "aria-describedby": "schedule-prompt-hint",
            rows: 4,
            placeholder: t("promptEditor.placeholder"),
            readOnly: value.readOnly,
            required: !value.readOnly,
          }}
        />
        <footer className="prompt-toolbar">
          {value.readOnly ? (
            <span>{t("promptEditor.sharedReadOnly")}</span>
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={!!mention}
              onClick={(event) =>
                editor.current.openReferences(event.currentTarget)
              }
            >
              {t("promptEditor.addReference")}
            </button>
          )}
        </footer>
      </div>
      <p id="schedule-prompt-hint" className="schedule-field-hint">
        {t("promptEditor.hint")}
      </p>
    </div>
  );
}

// A small adapter lets the native settings form mount exactly the same React
// editor as the workbench, without importing the conversation application.
export function mountPromptEditor(host, { value, onChange, onError }) {
  const shadow =
    host.shadowRoot ||
    host.attachShadow({ mode: "open", delegatesFocus: true });
  shadow.replaceChildren();
  const style = document.createElement("style"),
    container = document.createElement("div");
  style.textContent = inputStyles + mentionStyles + iconStyles + styles;
  shadow.append(style, container);
  const root = createRoot(container);
  let current = value,
    revision = 0,
    destroyed = false;
  function paint() {
    root.render(
      <PromptEditor
        key={revision}
        value={current}
        onError={onError}
        onChange={(draft) => {
          current = { ...current, ...draft };
          paint();
          onChange(draft);
        }}
      />,
    );
  }
  flushSync(paint);
  return {
    setValue(next) {
      if (destroyed) return;
      if (next.projectId !== current.projectId || next.scope !== current.scope)
        revision++;
      current = next;
      flushSync(paint);
    },
    getValue() {
      return current;
    },
    focus() {
      shadow.querySelector("textarea")?.focus();
    },
    destroy() {
      destroyed = true;
      root.unmount();
      shadow.replaceChildren();
    },
  };
}
window.LoopForgePromptEditor = { mount: mountPromptEditor };
window.dispatchEvent(new Event("loopforge-prompt-editor-ready"));
