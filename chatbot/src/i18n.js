import { useSyncExternalStore } from "react";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

const STORAGE_KEY = "loopforge.lang";
const locales = { zh, en };
const listeners = new Set();
let memoryLang = "";

function readStoredLang() {
  try {
    if (typeof localStorage !== "undefined" && localStorage?.getItem) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && Object.hasOwn(locales, stored)) return stored;
    }
  } catch {
    /* Restricted storage falls back to document attribute or default. */
  }
  return "";
}

function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (Object.hasOwn(locales, raw)) return raw;
  const short = raw.split(/[-_]/)[0];
  if (Object.hasOwn(locales, short)) return short;
  return "";
}

export function getLang() {
  const stored = normalizeLang(readStoredLang());
  if (stored) return stored;
  if (typeof document !== "undefined") {
    const attr = normalizeLang(document.documentElement?.dataset?.lang);
    if (attr) return attr;
  }
  if (typeof window !== "undefined" && typeof window.lfLang === "function") {
    const parentLang = normalizeLang(window.lfLang());
    if (parentLang) return parentLang;
  }
  return memoryLang || "zh";
}

export function applyDocumentLang(lang = getLang()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root) {
    root.dataset.lang = lang;
    root.lang = lang === "zh" ? "zh-CN" : lang;
  }
}

export function setLang(next) {
  const lang = normalizeLang(next) || "zh";
  memoryLang = lang;
  try {
    if (typeof localStorage !== "undefined" && localStorage?.setItem) {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  } catch {
    /* Restricted storage keeps the language in memory for this session. */
  }
  applyDocumentLang(lang);
  for (const listener of listeners) listener();
  return lang;
}

export function subscribeLang(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerLocale(lang, messages) {
  const code = String(lang || "").trim().toLowerCase();
  if (!code || !messages || typeof messages !== "object") return;
  locales[code] = { ...(locales[code] || {}), ...messages };
  for (const listener of listeners) listener();
}

export function getAvailableLocales() {
  return Object.keys(locales);
}

export function t(key, vars) {
  const lang = getLang();
  const dict = locales[lang] || locales.zh;
  let template = Object.hasOwn(dict, key)
    ? dict[key]
    : Object.hasOwn(locales.en, key)
      ? locales.en[key]
      : Object.hasOwn(locales.zh, key)
        ? locales.zh[key]
        : key;
  if (vars && typeof template === "string") {
    template = template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, k1, k2) => {
      const name = k1 || k2;
      return Object.hasOwn(vars, name) && vars[name] != null ? String(vars[name]) : match;
    });
  }
  return template;
}

export function listSeparator() {
  return getLang() === "zh" ? "、" : ", ";
}

export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => "zh");
  return { lang, setLang, t, listSeparator };
}

if (typeof window !== "undefined") {
  applyDocumentLang(getLang());
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    memoryLang = normalizeLang(event.newValue) || "zh";
    applyDocumentLang(memoryLang);
    for (const listener of listeners) listener();
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "loopforge-lang") return;
    const lang = normalizeLang(event.data.lang);
    if (!lang) return;
    memoryLang = lang;
    applyDocumentLang(lang);
    for (const listener of listeners) listener();
  });
  window.LoopForgeI18n = { getLang, setLang, registerLocale, getAvailableLocales, t };
}
