import React, { useEffect, useRef, useState } from "react";
import { t, useI18n } from "./i18n.js";
import { SelectMenu } from "./ui";
import HarnessIcon from "./HarnessIcon";
import "./sandbox-picker.css";

export function conversationSandboxOptions(sandboxes, project, selected = "") {
  const available = (sandboxes || []).filter(
    (s) => s.driver === "docker" && (s.projectId === project?.id || s.shared),
  );
  const options = [
    { value: "", label: t("sandbox.agentChoice") },
    ...available.map((s) => ({ value: s.id, label: s.name || s.id })),
  ];
  if (selected && !available.some((s) => s.id === selected)) {
    options.push({
      value: selected,
      label: t("sandbox.unavailable", { id: selected }),
      disabled: true,
    });
  }
  return options;
}

export default function SandboxPicker({ chat, onCreate }) {
  useI18n();
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const disabled = !!(
    chat.busy ||
    chat.sandboxBusy ||
    chat.readOnly
  );
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  if (!chat.projectId) return null;
  if (chat.sandboxLocked) {
    return (
      <span
        className="sandbox-context sandbox-fixed"
        title={t("sandbox.lockedTitle")}
      >
        <HarnessIcon name="lock" size={12} interactive={false} />
        <span>{chat.workspaceSandbox?.name || t("sandbox.lockedFallback")}</span>
      </span>
    );
  }
  const project = chat.projects.find((p) => p.id === chat.projectId);
  const options = conversationSandboxOptions(
    chat.sandboxes,
    project,
    chat.sandboxProfileId,
  );
  const label =
    options.find((o) => o.value === chat.sandboxProfileId)?.label ||
    options[0].label;
  const menuOptions = options
    .filter((o) => !o.disabled)
    .map((o) => ({
      id: o.value,
      label: o.label,
      description: o.value ? "" : t("sandbox.autoDesc"),
      icon: o.value ? "terminal" : "folder",
    }));
  return (
    <span className="menu-anchor sandbox-context" title={label}>
      <button
        ref={trigger}
        type="button"
        className="context-pill sandbox-picker"
        aria-label={t("sandbox.pickerAria", { label })}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <HarnessIcon name="terminal" size={13} interactive={false} />
        <span>{label}</span>
        <HarnessIcon name="chevron-down" size={12} interactive={false} />
      </button>
      <SelectMenu
        open={open}
        label={t("sandbox.menuLabel")}
        value={chat.sandboxProfileId || ""}
        options={menuOptions}
        onSelect={(id) => void chat.selectSandbox(id)}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        searchable
        actions={
          onCreate
            ? [
                {
                  id: "new-sandbox",
                  label: t("sandbox.create"),
                  icon: "plus",
                  onSelect: onCreate,
                },
              ]
            : []
        }
      />
    </span>
  );
}
