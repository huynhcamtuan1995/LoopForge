import { t } from "./i18n.js";

const levels = {
  none: { icon: "sparkles" },
  thinking: { icon: "brain" },
  minimal: { icon: "effort-low" },
  low: { icon: "effort-low" },
  medium: { icon: "effort-medium" },
  high: { icon: "brain" },
  xhigh: { icon: "search" },
  max: { icon: "effort-max" },
  ultra: { icon: "effort-max" },
  ultracode: { icon: "effort-max" },
};

export function modelEffort(model, value) {
  return model?.efforts?.includes(value) ? value : "";
}

export function knownEffort(value) {
  return typeof value === "string" && Object.hasOwn(levels, value) ? value : "";
}

export function effortOptions(model) {
  return [
    { id: "", label: t("effort.default.label"), icon: "sparkles", detail: t("effort.default.detail") },
    ...(model?.efforts || []).filter(knownEffort).map((id) => ({
      id,
      icon: levels[id].icon,
      label: t(`effort.${id}.label`),
      detail: t(`effort.${id}.detail`),
    })),
  ];
}
