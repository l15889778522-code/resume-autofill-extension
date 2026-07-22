import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, "..");
const executablePath = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean).find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext();
await context.addInitScript(() => {
  globalThis.__requestedOrigins = [];
  globalThis.__savedValues = {};
  globalThis.__aiMessage = null;
  const candidate = {
    elementId: "desired-location",
    signature: "input:text:工作地点偏好",
    label: "工作地点偏好",
    section: "求职意向",
    tag: "input",
    inputType: "text",
    questionKey: "工作地点偏好",
    matchedKey: "",
    learnedKey: "",
    repeatIndex: 0,
    score: 0,
    confidence: 0,
    currentValue: "",
    sensitive: false,
    options: []
  };
  const educationCandidate = {
    ...candidate,
    elementId: "major-2",
    signature: "input:text:专业名称:2",
    label: "专业名称",
    section: "教育经历",
    questionKey: "专业名称",
    matchedKey: "major",
    repeatIndex: 1,
    recordType: "education",
    recordIndex: 1,
    score: 94,
    confidence: 94
  };
  const emptyDepartmentCandidate = {
    ...candidate,
    elementId: "department-1",
    signature: "input:text:院系:1",
    label: "院系",
    section: "教育经历",
    questionKey: "院系",
    matchedKey: "department",
    learnedKey: "stale_department",
    recordType: "education",
    recordIndex: 0,
    score: 96,
    confidence: 96
  };
  const internshipSummaryCandidate = {
    ...candidate,
    elementId: "internship-summary",
    signature: "textarea:text:实习经历",
    label: "实习经历",
    section: "实践经历",
    questionKey: "实习经历",
    matchedKey: "internshipSummary",
    score: 98,
    confidence: 98,
    tag: "textarea",
    aggregateType: "internship"
  };
  const projectSummaryCandidate = {
    ...candidate,
    elementId: "project-summary",
    signature: "textarea:text:项目活动经验及研究成果",
    label: "项目活动经验及研究成果",
    section: "项目经历",
    questionKey: "项目活动经验及研究成果",
    matchedKey: "projectSummary",
    score: 98,
    confidence: 98,
    tag: "textarea",
    aggregateType: "project"
  };
  const capturedDepartment = {
    signature: "input:text:院系:1",
    questionKey: "院系",
    label: "院系",
    value: "数据科学与人工智能系",
    matchedKey: "department",
    recordType: "education",
    recordIndex: 0,
    sensitive: false
  };
  globalThis.chrome = {
    runtime: {
      lastError: null,
      openOptionsPage() {},
      sendMessage(message, callback) {
        globalThis.__aiMessage = message;
        callback({ ok: true, assignments: [
          { elementId: "desired-location", sourceRef: "profile:desiredCity", confidence: 94, reason: "求职意向中的地点偏好" },
          { elementId: "internship-summary", sourceRef: "experience:0:description", confidence: 99, reason: "模型误选单段描述" },
          { elementId: "project-summary", sourceRef: "profile:projectSummary", confidence: 96, reason: "页面要求汇总项目活动经历" }
        ] });
      }
    },
    permissions: {
      async request(request) { globalThis.__requestedOrigins = request.origins || []; return true; }
    },
    scripting: { async executeScript() {} },
    tabs: {
      async query() { return [{ id: 1, url: "https://jobs.example.com/apply" }]; },
      sendMessage(_tabId, message, callback) {
        if (message.type === "RESUME_SCAN") callback({ ok: true, candidates: [candidate, educationCandidate, emptyDepartmentCandidate, internshipSummaryCandidate, projectSummaryCandidate], pageContext: { language: "zh-CN" } });
        else if (message.type === "RESUME_CAPTURE") callback({ ok: true, captured: [capturedDepartment] });
        else callback({ ok: true, filled: 1, failed: [] });
      }
    },
    storage: {
      local: {
        async setAccessLevel() {},
        async get() {
          return {
            profile: { desiredCity: "上海", school: "香港理工大学", major: "医疗数据科学", degree: "硕士", projectSummary: "用户行为分析与运营策略优化（Instagram）｜个人数据分析项目\n• 用户分层与内容生态诊断" },
            educationExperiences: [
              { school: "香港理工大学", department: "", major: "医疗数据科学", degree: "硕士" },
              { school: "北师香港浸会大学", department: "理工科技学部", major: "统计学", degree: "本科" }
            ],
            workExperiences: [
              { company: "国金证券", jobTitle: "业务运营实习生", category: "internship", startDate: "2026-06-01", endDate: "", ongoing: true, description: "客户需求分析与活动效果复盘。" },
              { company: "深圳锐明科技有限公司", jobTitle: "数据分析", category: "internship", startDate: "2024-06-01", endDate: "2024-08-01", description: "完成非结构化数据提纯。" }
            ],
            learnedAnswers: { stale_department: { label: "院系", value: "理工科技学部" } },
            siteRules: {},
            aiSettings: { enabled: true, shareResumeData: true, endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash", apiKey: "local-test-key" }
          };
        },
        async set(values) { Object.assign(globalThis.__savedValues, values); }
      }
    }
  };
});
const page = await context.newPage();
await page.goto(`file:///${path.join(extensionRoot, "popup.html").replaceAll("\\", "/")}`);
await page.locator("#aiRecognize").click();
await page.locator(".confidence-ai").first().waitFor();
assert.equal(await page.locator(".field-map").first().inputValue(), "profile:desiredCity");
assert.equal(await page.locator(".candidate").filter({ hasText: "专业名称" }).locator(".field-map").inputValue(), "education:1:major");
assert.match(await page.locator(".candidate").filter({ hasText: "专业名称" }).locator(".candidate-value").textContent(), /统计学/);
assert.equal(await page.locator(".candidate").filter({ hasText: "网页字段：院系" }).locator(".field-map").inputValue(), "");
assert.match(await page.locator(".candidate").filter({ hasText: "网页字段：院系" }).locator(".candidate-value").textContent(), /请先选择内容/);
const internshipRow = page.locator(".candidate").filter({ hasText: "网页字段：实习经历" });
assert.equal(await internshipRow.locator(".field-map").inputValue(), "computed:internshipSummary");
assert.match(await internshipRow.locator(".candidate-value").textContent(), /国金证券/);
assert.match(await internshipRow.locator(".candidate-value").textContent(), /深圳锐明科技有限公司/);
assert.doesNotMatch(await internshipRow.locator(".candidate-value").textContent(), /^将填入：客户需求分析与活动效果复盘。$/);
const projectRow = page.locator(".candidate").filter({ hasText: "网页字段：项目活动经验及研究成果" });
assert.equal(await projectRow.locator(".field-map").inputValue(), "profile:projectSummary");
assert.match(await projectRow.locator(".candidate-value").textContent(), /用户行为分析与运营策略优化/);
assert.match(await page.locator(".agent-reason").first().textContent(), /地点偏好/);
assert.equal(await page.locator(".candidate-check").first().isChecked(), true);
assert.deepEqual(await page.evaluate(() => globalThis.__requestedOrigins), ["https://api.deepseek.com/*"]);
const aiMessage = await page.evaluate(() => globalThis.__aiMessage);
assert.equal(aiMessage.type, "AI_PLAN_MAPPINGS");
assert.equal(aiMessage.sources.some((source) => source.sourceRef === "education:1:major" && source.value === "统计学"), true);
assert.equal(aiMessage.sources.some((source) => source.sourceRef === "computed:internshipSummary" && /国金证券/.test(source.value)), true);
assert.equal(aiMessage.sources.some((source) => source.sourceRef === "profile:projectSummary" && /用户行为分析/.test(source.value)), true);
await page.locator("#learnPage").click();
await page.locator(".learn-destination").waitFor();
assert.match(await page.locator(".learn-destination").textContent(), /教育经历 1 · 院系/);
await page.locator("#fill").click();
await page.waitForFunction(() => globalThis.__savedValues.educationExperiences?.[0]?.department === "数据科学与人工智能系");
const learnedStorage = await page.evaluate(() => globalThis.__savedValues);
assert.equal(learnedStorage.educationExperiences[0].department, "数据科学与人工智能系");
assert.equal(learnedStorage.educationExperiences[1].department, "理工科技学部");
await browser.close();
console.log("POPUP_AGENT_OK");
