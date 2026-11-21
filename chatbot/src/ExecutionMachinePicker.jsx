import React, { useEffect, useRef, useState } from "react";
import HarnessIcon from "./HarnessIcon";
import { t, useI18n } from "./i18n.js";
import { SelectMenu } from "./ui";
import { executionLocked } from "./execution-target";
import "./execution-machine-picker.css";

export default function ExecutionMachinePicker({ chat, onManage }) {
  useI18n();
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const locked = executionLocked(chat.session);
  const disabled = !!(
    chat.busy ||
    chat.machineSaving ||
    chat.readOnly ||
    chat.local ||
    !chat.user ||
    chat.user.isGuest
  );
  useEffect(() => {
    if (disabled || locked) setOpen(false);
  }, [disabled, locked]);

  const execution = chat.session?.executionTarget;
  const runnerId = locked
    ? execution?.pool === "cloud"
      ? ""
      : execution?.runnerId || ""
    : chat.defaultRunnerId || "";
  const machine = chat.machines?.find((row) => row.id === runnerId);
  const known = locked ? !!execution : chat.machinesReady;
  const loadError = locked ? "" : chat.machineError;
  const label = !known
    ? loadError
      ? t("machines.loadFailed")
      : t("machines.loading")
    : runnerId
      ? machine?.name || runnerId
      : t("machines.cloud");
  const online =
    known &&
    (runnerId
      ? machine?.status === "online"
      : chat.cloudPool?.configured
        ? chat.cloudPool.online > 0
        : true);
  const title = locked
    ? loadError || t("machines.lockedTitle", { label })
    : chat.machineError || t("machines.selectHint");

  if (locked)
    return (
      <span className="machine-context machine-fixed" title={title}>
        <HarnessIcon name="server" size={13} interactive={false} />
        <span>{label}</span>
        <HarnessIcon name="lock" size={11} interactive={false} />
      </span>
    );

  const options = chat.machinesReady
    ? [
        {
          id: "",
          label: t("machines.cloud"),
          icon: "server",
          description:
            chat.cloudPool?.configured && !chat.cloudPool.online
              ? t("machines.cloudNoneOnline")
              : t("machines.cloudAutoAssign"),
        },
        ...(chat.machines || []).map((row) => ({
          id: row.id,
          label: row.name || row.id,
          icon: "monitor",
          description: row.status === "online" ? t("machines.online") : t("machines.offline"),
        })),
      ]
    : [];

  return (
    <span className="menu-anchor machine-context">
      <button
        ref={trigger}
        type="button"
        className="context-pill machine-picker"
        title={title}
        aria-label={t("machines.pickerAria", { label })}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={chat.machineSaving || undefined}
        disabled={disabled}
        onClick={() => {
          if (!open) void chat.refreshMachines?.();
          setOpen(!open);
        }}
      >
        <HarnessIcon name="server" size={13} interactive={false} />
        <span>{label}</span>
        <i
          className={`connection-dot${online ? " online" : ""}`}
          aria-hidden="true"
        />
        <HarnessIcon name="chevron-down" size={12} interactive={false} />
      </button>
      <SelectMenu
        open={open}
        label={t("machines.menuLabel")}
        value={chat.defaultRunnerId || ""}
        options={options}
        onSelect={(id) => void chat.selectMachine(id)}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        searchable
        emptyText={
          chat.machinesReady
            ? t("machines.emptyNoMatch")
            : chat.machineError
              ? t("machines.emptyLoadFailed")
              : t("machines.emptyLoading")
        }
        actions={[
          {
            id: "refresh-machines",
            label: chat.machineError ? t("machines.reload") : t("machines.refresh"),
            icon: "refresh",
            onSelect: chat.refreshMachines,
          },
          ...(onManage
            ? [
                {
                  id: "manage-machines",
                  label: t("machines.manage"),
                  icon: "settings",
                  onSelect: onManage,
                },
              ]
            : []),
        ]}
      />
    </span>
  );
}
