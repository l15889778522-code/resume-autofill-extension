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

const profile = { fullName: "张三", phone: "13800000000", email: "new@example.com", school: "香港理工大学", major: "医疗数据科学", degree: "本科", desiredCity: "上海", latestCompany: "当前公司", latestJobTitle: "数据分析师" };
const educationExperiences = [
  { school: "香港理工大学", department: "", major: "医疗数据科学", degree: "硕士", startDate: "2025-09-01", endDate: "2027-01-01" },
  { school: "北师香港浸会大学", department: "理工科技学部", major: "统计学", degree: "本科", startDate: "2021-09-01", endDate: "2025-07-01" }
];
const workExperiences = [
  { company: "国金证券", jobTitle: "业务运营实习生", category: "internship", startDate: "2026-06-01", endDate: "", ongoing: true, description: "客户需求分析与活动效果复盘。" },
  { company: "深圳锐明科技有限公司", jobTitle: "数据分析", category: "internship", startDate: "2024-06-01", endDate: "2024-08-01", ongoing: false, description: "完成非结构化数据提纯。" }
];
const scanned = await page.evaluate(({ profileData, educations, work }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, educationExperiences: educations, workExperiences: work, learnedAnswers: {}, siteRules: {} }, {}, resolve);
}), { profileData: profile, educations: educationExperiences, work: workExperiences });

assert.equal(scanned.ok, true);
assert.equal(scanned.candidates.length, 18);
assert.equal(scanned.candidates.find((item) => item.label === "姓名").matchedKey, "fullName");
assert.equal(scanned.candidates.find((item) => item.label === "站点专用问题").matchedKey, "");
const internshipSummaryCandidate = scanned.candidates.find((item) => item.matchedKey === "internshipSummary");
assert.equal(internshipSummaryCandidate.matchedKey, "internshipSummary");
assert.equal(internshipSummaryCandidate.recordType, "");
assert.ok(internshipSummaryCandidate.confidence >= 88);
const fuzzyCity = scanned.candidates.find((item) => item.label === "期望城巿");
assert.equal(fuzzyCity.matchedKey, "desiredCity");
assert.ok(fuzzyCity.confidence >= 68 && fuzzyCity.confidence < 88);
const companyCandidates = scanned.candidates.filter((item) => item.matchedKey === "latestCompany");
const titleCandidates = scanned.candidates.filter((item) => item.matchedKey === "latestJobTitle");
const schoolCandidates = scanned.candidates.filter((item) => item.matchedKey === "school");
const majorCandidates = scanned.candidates.filter((item) => item.matchedKey === "major");
const departmentCandidates = scanned.candidates.filter((item) => item.matchedKey === "department");
assert.deepEqual(schoolCandidates.map((item) => [item.recordType, item.recordIndex]), [["education", 0], ["education", 1]]);
assert.deepEqual(majorCandidates.map((item) => [item.recordType, item.recordIndex]), [["education", 0], ["education", 1]]);
assert.deepEqual(departmentCandidates.map((item) => [item.recordType, item.recordIndex]), [["education", 0], ["education", 1]]);
assert.deepEqual(companyCandidates.map((item) => item.repeatIndex), [0, 1]);
assert.deepEqual(titleCandidates.map((item) => item.repeatIndex), [0, 1]);
const employmentCandidate = scanned.candidates.find((item) => item.label === "雇佣类型");
assert.equal(employmentCandidate.section, "求职偏好");
assert.deepEqual(employmentCandidate.options, ["全职", "实习"]);
const preferredScan = await page.evaluate(({ profileData, educations, signature }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, educationExperiences: educations, learnedAnswers: {}, siteRules: { [signature]: "experience:1:company" } }, {}, resolve);
}), { profileData: profile, educations: educationExperiences, signature: companyCandidates[0].signature });
const preferredCompanyCandidates = preferredScan.candidates.filter((item) => item.signature === companyCandidates[0].signature);
assert.equal(preferredCompanyCandidates[0].preferredSourceRef, "");
assert.equal(preferredCompanyCandidates[1].preferredSourceRef, "experience:1:company");
const preferredEducationScan = await page.evaluate(({ profileData, educations, signature }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, educationExperiences: educations, learnedAnswers: {}, siteRules: { [signature]: "education:1:school" } }, {}, resolve);
}), { profileData: profile, educations: educationExperiences, signature: schoolCandidates[0].signature });
const preferredSchoolCandidates = preferredEducationScan.candidates.filter((item) => item.signature === schoolCandidates[0].signature);
assert.equal(preferredSchoolCandidates[0].preferredSourceRef, "");
assert.equal(preferredSchoolCandidates[1].preferredSourceRef, "education:1:school");
const staleLearnedScan = await page.evaluate(({ profileData, educations, signature }) => new Promise((resolve) => {
  globalThis.__testMessageListener({
    type: "RESUME_SCAN",
    profile: profileData,
    educationExperiences: educations,
    learnedAnswers: { stale_major: { label: "专业名称", value: "错误的旧答案" } },
    siteRules: { [signature]: "learned:stale_major" }
  }, {}, resolve);
}), { profileData: profile, educations: educationExperiences, signature: majorCandidates[1].signature });
const migratedMajor = staleLearnedScan.candidates.find((item) => item.elementId === majorCandidates[1].elementId);
assert.equal(migratedMajor.matchedKey, "major");
assert.equal(migratedMajor.learnedKey, "");
assert.equal(migratedMajor.recordIndex, 1);
const staleDepartmentScan = await page.evaluate(({ profileData, educations, signature }) => new Promise((resolve) => {
  globalThis.__testMessageListener({
    type: "RESUME_SCAN",
    profile: profileData,
    educationExperiences: educations,
    learnedAnswers: { stale_department: { label: "院系", value: "理工科技学部" } },
    siteRules: { [signature]: "learned:stale_department" }
  }, {}, resolve);
}), { profileData: profile, educations: educationExperiences, signature: departmentCandidates[0].signature });
const polyuDepartment = staleDepartmentScan.candidates.find((item) => item.elementId === departmentCandidates[0].elementId);
assert.equal(polyuDepartment.matchedKey, "department");
assert.equal(polyuDepartment.learnedKey, "");
assert.equal(polyuDepartment.recordIndex, 0);

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

const customSelectFill = await page.evaluate((selection) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_FILL", selections: [selection] }, {}, resolve);
}), { ...employmentCandidate, value: "全职" });
assert.equal(customSelectFill.filled, 1);
assert.equal(await page.locator("#employment").textContent(), "全职");

const summaryFill = await page.evaluate((selection) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_FILL", selections: [selection] }, {}, resolve);
}), { ...internshipSummaryCandidate, value: "2026年06月–至今｜国金证券｜业务运营实习生\n客户需求分析与活动效果复盘。" });
assert.equal(summaryFill.filled, 1);
assert.match(await page.locator("#internship-summary").inputValue(), /国金证券/);

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
const learnedScan = await page.evaluate(({ profileData, educations, answers }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_SCAN", profile: profileData, educationExperiences: educations, learnedAnswers: answers, siteRules: {} }, {}, resolve);
}), { profileData: profile, educations: educationExperiences, answers: learnedAnswers });
const learnedCandidate = learnedScan.candidates.find((item) => item.label === "站点专用问題");
assert.equal(learnedCandidate.learnedKey, customAnswer.questionKey);
assert.ok(learnedCandidate.confidence >= 68 && learnedCandidate.confidence < 88);
const learnedFill = await page.evaluate((selection) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_FILL", selections: [selection] }, {}, resolve);
}), { ...learnedCandidate, value: customAnswer.value });
assert.equal(learnedFill.filled, 1);
assert.equal(await page.locator("#custom").inputValue(), "接受偶尔出差");

await page.locator("form").evaluate((form) => {
  form.querySelectorAll('[id^="school-"], [id^="major-"], [id^="department-"], label[for^="school-"], label[for^="major-"], label[for^="department-"]').forEach((element) => element.remove());
  const section = document.createElement("section");
  section.innerHTML = '<h2>教育经历</h2><label for="single-major">专业</label><input id="single-major" value="统计学"><label for="single-department">院系</label><input id="single-department" value="理工科技学部">';
  form.prepend(section);
});
const singleRecordCapture = await page.evaluate(({ profileData, educations }) => new Promise((resolve) => {
  globalThis.__testMessageListener({ type: "RESUME_CAPTURE", profile: profileData, educationExperiences: educations }, {}, resolve);
}), { profileData: profile, educations: educationExperiences });
const contextualDepartment = singleRecordCapture.captured.find((item) => item.label === "院系");
assert.equal(contextualDepartment.recordType, "education");
assert.equal(contextualDepartment.recordIndex, 1);

await browser.close();
console.log("E2E_OK");
