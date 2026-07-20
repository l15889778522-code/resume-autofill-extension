import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const installedBrowsers = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const executablePath = installedBrowsers.find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();
await page.goto(`file:///${path.join(here, "test-page.html").replaceAll("\\", "/")}`);
await page.evaluate(() => {
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener(listener) { globalThis.__testMessageListener = listener; } }
    }
  };
});
await page.addScriptTag({ path: path.join(here, "..", "field-catalog.js") });
await page.addScriptTag({ path: path.join(here, "..", "content.js") });

const profile = { fullName: "张三", phone: "13800000000", email: "new@example.com", degree: "本科", desiredCity: "上海", latestCompany: "当前公司", latestJobTitle: "数据分析师" };
const scanned = await page.evaluate((profileData) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, learnedAnswers: {}, siteRules: {} }, {}, resolve);
}), profile);

assert.equal(scanned.ok, true);
assert.equal(scanned.candidates.length, 10);
assert.equal(scanned.candidates.find((item) => item.label === "姓名").matchedKey, "fullName");
assert.equal(scanned.candidates.find((item) => item.label === "站点专用问题").matchedKey, "");
const fuzzyCity = scanned.candidates.find((item) => item.label === "期望城巿");
assert.equal(fuzzyCity.matchedKey, "desiredCity");
assert.ok(fuzzyCity.confidence >= 68 && fuzzyCity.confidence < 88);
const companyCandidates = scanned.candidates.filter((item) => item.matchedKey === "latestCompany");
const titleCandidates = scanned.candidates.filter((item) => item.matchedKey === "latestJobTitle");
assert.deepEqual(companyCandidates.map((item) => item.repeatIndex), [0, 1]);
assert.deepEqual(titleCandidates.map((item) => item.repeatIndex), [0, 1]);
const preferredScan = await page.evaluate(({ profileData, signature }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, learnedAnswers: {}, siteRules: { [signature]: "experience:1:company" } }, {}, resolve);
}), { profileData: profile, signature: companyCandidates[0].signature });
assert.equal(preferredScan.candidates.find((item) => item.signature === companyCandidates[0].signature).preferredSourceRef, "experience:1:company");

const selections = scanned.candidates
  .filter((item) => ["fullName", "phone", "degree"].includes(item.matchedKey))
  .map((item) => ({ ...item, key: item.matchedKey, value: profile[item.matchedKey] }));
const filled = await page.evaluate((items) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_FILL", selections: items }, {}, resolve);
}), selections);

assert.equal(filled.ok, true);
assert.equal(filled.filled, 3);
assert.equal(await page.locator("#name").inputValue(), "张三");
assert.equal(await page.locator("#phone").inputValue(), "13800000000");
assert.equal(await page.locator("#degree").inputValue(), "bachelor");
assert.equal(await page.locator("#email").inputValue(), "existing@example.com");

await page.locator("#custom").fill("接受偶尔出差");
const captured = await page.evaluate((profileData) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_CAPTURE", profile: profileData }, {}, resolve);
}), profile);
const customAnswer = captured.captured.find((item) => item.label === "站点专用问题");
assert.equal(customAnswer.value, "接受偶尔出差");
assert.equal(customAnswer.matchedKey, "");

await page.locator("#custom").fill("");
await page.locator('label[for="custom"]').evaluate((element) => { element.textContent = "站点专用问題"; });
const learnedAnswers = {
  [customAnswer.questionKey]: {
    label: customAnswer.label,
    value: customAnswer.value,
    sensitive: false
  }
};
const learnedScan = await page.evaluate(({ profileData, answers }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, learnedAnswers: answers, siteRules: {} }, {}, resolve);
}), { profileData: profile, answers: learnedAnswers });
const learnedCandidate = learnedScan.candidates.find((item) => item.label === "站点专用问題");
assert.equal(learnedCandidate.learnedKey, customAnswer.questionKey);
assert.ok(learnedCandidate.confidence >= 68 && learnedCandidate.confidence < 88);
const learnedFill = await page.evaluate((selection) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_FILL", selections: [selection] }, {}, resolve);
}), { ...learnedCandidate, value: customAnswer.value });
assert.equal(learnedFill.filled, 1);
assert.equal(await page.locator("#custom").inputValue(), "接受偶尔出差");

await browser.close();
console.log("E2E_OK");
