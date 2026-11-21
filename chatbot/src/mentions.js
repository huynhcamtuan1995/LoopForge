import { t } from "./i18n.js";

export const referenceTypes = [
  { type: "agent", get label() { return t("mentions.type.agent"); }, get hint() { return t("mentions.type.agent.hint"); } },
  { type: "skill", get label() { return t("mentions.type.skill"); }, get hint() { return t("mentions.type.skill.hint"); } },
  { type: "issue", get label() { return t("mentions.type.issue"); }, get hint() { return t("mentions.type.issue.hint"); } },
  { type: "sop", get label() { return t("mentions.type.sop"); }, get hint() { return t("mentions.type.sop.hint"); } },
  { type: "run", get label() { return t("mentions.type.run"); }, get hint() { return t("mentions.type.run.hint"); } },
  { type: "repository", get label() { return t("mentions.type.repository"); }, get hint() { return t("mentions.type.repository.hint"); } },
];
export function mentionAt(text, caret, references = []) {
  const before = text.slice(0, caret);
  const match = before.match(/@([^@\n]*)$/);
  if (!match || /[a-z0-9_.+-]/i.test(before[match.index - 1] || ""))
    return null;
  if (references.some((ref) => match[1].startsWith((ref.name || ref.id) + " ")))
    return null;
  return { start: match.index, end: caret, query: match[1] };
}
export function insertMention(text, range, reference) {
  const token = `@${reference.name || reference.id} `;
  return {
    text: text.slice(0, range.start) + token + text.slice(range.end),
    caret: range.start + token.length,
  };
}
