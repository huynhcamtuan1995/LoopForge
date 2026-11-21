import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import zh from "../src/locales/zh.json";
import en from "../src/locales/en.json";
import { getLang, listSeparator, setLang, t } from "../src/i18n.js";
import { formatElapsed, projectPickerOptions } from "../src/api.js";
import { activityFace, activityGroupSummary } from "../src/activity.js";
import { CODEBUDDY_ENVIRONMENTS, CREDENTIALS, codeBuddyKeyWarning } from "../src/credentials.js";
import { EXECUTORS } from "../src/engines.js";

const HAN = /[\u4e00-\u9fff]/;

describe("chatbot i18n", () => {
  afterEach(() => {
    setLang("zh");
    localStorage.removeItem("loopforge.lang");
  });

  it("keeps identical translation keys and placeholders between zh and en", () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    assert.deepEqual(enKeys, zhKeys);

    for (const key of enKeys) {
      assert.equal(HAN.test(en[key]), false, `en.json key ${key} contains Chinese: ${en[key]}`);
      const params = [...zh[key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
      const enParams = [...en[key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(enParams, params, `placeholder mismatch on ${key}`);
    }
  });

  it("switches language dynamically across helper modules and getters", () => {
    setLang("zh");
    assert.equal(getLang(), "zh");
    assert.equal(listSeparator(), "、");
    assert.equal(formatElapsed(0), "不到1秒");
    assert.equal(CREDENTIALS.gitSshKey, "Git SSH 密钥");

    setLang("en");
    assert.equal(getLang(), "en");
    assert.equal(localStorage.getItem("loopforge.lang"), "en");
    assert.equal(document.documentElement.dataset.lang, "en");
    assert.equal(listSeparator(), ", ");
    assert.equal(t("common.newChat"), "New chat");

    assert.equal(HAN.test(formatElapsed(0)), false);
    assert.equal(HAN.test(formatElapsed(3665)), false);
    assert.equal(HAN.test(CREDENTIALS.gitSshKey), false);
    assert.equal(HAN.test(CREDENTIALS.gitHttpCredentials), false);
    assert.equal(HAN.test(CODEBUDDY_ENVIRONMENTS[0].label), false);
    assert.equal(HAN.test(codeBuddyKeyWarning("bad")), false);
    assert.equal(HAN.test(activityFace({ kind: "thinking" }).busy), false);
    assert.equal(HAN.test(activityFace({ kind: "tool", tool: "Bash" }).done), false);
    assert.equal(
      HAN.test(
        activityGroupSummary([
          { kind: "tool", tool: "Bash" },
          { kind: "tool", tool: "Read" },
        ]),
      ),
      false,
    );
    for (const item of EXECUTORS) {
      assert.equal(HAN.test(item.detail), false);
    }
    const picker = projectPickerOptions([{ id: "p1", name: "Proj", members: [] }], { id: 1 }, null);
    for (const opt of picker) {
      assert.equal(HAN.test(opt.label), false);
      assert.equal(HAN.test(opt.description || ""), false);
      assert.equal(HAN.test(opt.section || ""), false);
    }
  });

  it("has no unexpected hardcoded Chinese UI strings in chatbot/src", () => {
    const srcDir = path.resolve(import.meta.dirname, "../src");
    const allowedPerFile = {
      // Regex matchers, protocol wire constants, and legacy/default zh fixtures
      "agent-browser-links.js": [/^const workspaceFileURL =/],
      "AgentBrowser.jsx": [/^const deniedError = "无权操作"/],
      "api.js": [
        /\/\([^)]*本地路径/,
        /^export const UNJOINED_PROJECTS_SECTION =/,
        /^const PROPOSAL_DECLINED =/,
        /^const PROPOSAL_EXPIRED =/,
        /\/\^已确认并执行/,
      ],
      "activity.js": [
        /child\.tool === "发布产物"/,
        /child\.tool === "交付物"/,
        /replace\(\/\^/,
        /生图\|画图/,
      ],
      "artifact-autoreveal.js": [/^const USER_UPLOAD_SOURCE =/],
      "cli-install.jsx": [
        /没有安装在当前服务器上/,
        /"AI 助手生成失败/,
      ],
      "credentials.js": [
        /\["国际站"/,
        /\["国内站"/,
        /\/Git SSH/,
        /\/GitHub Git Token/,
        /\/CodeBuddy/,
        /\/Git 访问令牌/,
        /\/Git Token\|/,
        /\/责任人\|Owner\|该账号\//,
      ],
      "engines.js": [
        /\/\^\(未配置\|请先在个人配置\)/,
      ],
      "message-info.js": [/^export const NOT_REPORTED =/],
      "node-conversation.js": [/完成\|done/],
      "Participants.jsx": [/startsWith\("用户 "\)/],
      "QuickAccessWizard.jsx": [/\/\^\(\?:通用\|Generic/],
      "RunAlerts.jsx": [/\/未配置\//],
      "session-history.js": [/startsWith\("用户 "\)/, /\^定时 · /],
      "SubagentSession.jsx": [/item\.source === "交付物"/],
      "useChat.js": [
        /请确认\|已确认并执行/,
        /当前没有进行中的回复/,
        /`已确认并执行 \$\{draft\.tool\}/,
        /继续完成刚才被中断的任务/,
      ],
      "useLocalConversations.js": [/\/什么模型/, /\/总结\|汇总/, /\/颜色\|hover/],
    };

    const unexpected = [];
    for (const name of fs.readdirSync(srcDir).sort()) {
      if (!/\.(js|jsx)$/.test(name) || name === "local-conversation-fixtures.js") continue;
      const lines = fs.readFileSync(path.join(srcDir, name), "utf8").split(/\r?\n/);
      const patterns = allowedPerFile[name] || [];
      lines.forEach((line, idx) => {
        if (!HAN.test(line)) return;
        if (/^\s*(\/\/|\/?\*)/.test(line)) return;
        if (patterns.some((re) => re.test(line))) return;
        unexpected.push(`${name}:${idx + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(unexpected, []);
  });
});
