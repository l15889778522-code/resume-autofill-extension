"use strict";

const catalog = globalThis.ResumeFieldCatalog;
const form = document.querySelector("#profileForm");
const navigation = document.querySelector("#navigation");
const toast = document.querySelector("#toast");
const groups = [...new Set(catalog.fields.map((field) => field.group))];
let learnedAnswers = {};
let educationExperiences = [];
let workExperiences = [];
let pendingParse = null;
let aiSettings = { ...globalThis.ResumeAiAgent.DEFAULT_SETTINGS };

function slug(value) {
  return Array.from(value).map((char) => char.codePointAt(0).toString(16)).join("-");
}

function inputFor(field) {
  const wide = field.type === "textarea" ? " wide" : "";
  const type = ["date", "number"].includes(field.type) ? field.type : (field.inputMode || "text");
  if (field.type === "textarea") {
    return `<div class="field${wide}"><label for="${field.key}">${field.label}</label><textarea id="${field.key}" name="${field.key}"></textarea></div>`;
  }
  return `<div class="field${wide}"><label for="${field.key}">${field.label}</label><input id="${field.key}" name="${field.key}" type="${type}" autocomplete="off"></div>`;
}

for (const group of groups) {
  const id = `group-${slug(group)}`;
  const link = document.createElement("a");
  link.href = `#${id}`;
  link.textContent = group;
  navigation.append(link);

  const section = document.createElement("section");
  section.id = id;
  const hint = group === "敏感信息" ? '<p class="hint">敏感字段默认不会被勾选，只有你在预览中主动选择后才会填写。</p>' : "";
  section.innerHTML = `<h2>${group}</h2>${hint}<div class="fields">${catalog.fields.filter((field) => field.group === group).map(inputFor).join("")}</div>`;
  form.append(section);
}

const educationListLink = document.createElement("a");
educationListLink.href = "#education-experiences";
educationListLink.textContent = "全部教育经历";
navigation.append(educationListLink);
const educationListSection = document.createElement("section");
educationListSection.id = "education-experiences";
educationListSection.innerHTML = '<div class="section-title-row"><div><h2>全部教育经历</h2><p class="hint">学校、专业、学历和日期按同一条记录保存；第一段会同步到上方教育字段。</p></div><button id="addEducationExperience" class="inline-button" type="button">添加一段</button></div><div id="educationExperienceList"></div>';
form.append(educationListSection);
const educationExperienceList = educationListSection.querySelector("#educationExperienceList");

const workListLink = document.createElement("a");
workListLink.href = "#work-experiences";
workListLink.textContent = "全部工作经历";
navigation.append(workListLink);
const workListSection = document.createElement("section");
workListSection.id = "work-experiences";
workListSection.innerHTML = '<div class="section-title-row"><div><h2>全部工作经历</h2><p class="hint">按最近到最早排列；第一段会同步到上方“最近工作经历”字段。</p></div><button id="addWorkExperience" class="inline-button" type="button">添加一段</button></div><div id="workExperienceList"></div>';
form.append(workListSection);
const workExperienceList = workListSection.querySelector("#workExperienceList");

const aiLink = document.createElement("a");
aiLink.href = "#ai-agent";
aiLink.textContent = "AI Agent";
navigation.append(aiLink);
const aiSection = document.createElement("section");
aiSection.id = "ai-agent";
aiSection.innerHTML = `
  <div class="section-title-row">
    <div>
      <h2>AI Agent 字段识别</h2>
      <p class="hint">可选功能。模型只接收网页字段结构和资料字段名称，不接收姓名、电话、邮箱或经历正文；返回结果必须在本地预览后才能填写。</p>
    </div>
    <label class="switch-label"><input id="aiEnabled" type="checkbox"> 启用</label>
  </div>
  <div class="fields">
    <div class="field wide"><label for="aiEndpoint">OpenAI 兼容接口地址</label><input id="aiEndpoint" type="url" autocomplete="off"></div>
    <div class="field"><label for="aiModel">模型</label><input id="aiModel" type="text" autocomplete="off"></div>
    <div class="field"><label for="aiApiKey">API Key（仅保存在本机）</label><input id="aiApiKey" type="password" autocomplete="off"></div>
  </div>
  <div class="ai-notice">默认使用 DeepSeek Chat Completions 接口。保存时浏览器只会请求该接口域名的访问权限；招聘网站内容不会自动发送。</div>`;
form.append(aiSection);

const learnedLink = document.createElement("a");
learnedLink.href = "#learned-answers";
learnedLink.textContent = "已学习答案";
navigation.append(learnedLink);
const learnedSection = document.createElement("section");
learnedSection.id = "learned-answers";
learnedSection.innerHTML = '<h2>已学习答案</h2><p class="hint">这些是你在招聘网页中主动让插件记住的额外问题。可以修改答案或删除记录。</p><div id="learnedList"></div>';
form.append(learnedSection);
const learnedList = learnedSection.querySelector("#learnedList");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function values() {
  return Object.fromEntries(catalog.fields.map((field) => [field.key, form.elements[field.key].value.trim()]));
}

function renderLearnedAnswers() {
  learnedList.replaceChildren();
  const entries = Object.entries(learnedAnswers);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "learned-empty";
    empty.textContent = "还没有学习额外答案。请在招聘网页填写后，通过扩展弹窗点击“学习本页填写”。";
    learnedList.append(empty);
    return;
  }
  for (const [key, answer] of entries) {
    const row = document.createElement("div");
    row.className = "learned-row";
    row.dataset.key = key;
    const question = document.createElement("div");
    question.className = "learned-question";
    question.textContent = answer.label || key;
    const input = document.createElement("input");
    input.className = "learned-answer";
    input.value = answer.value || "";
    input.setAttribute("aria-label", `答案：${answer.label || key}`);
    const remove = document.createElement("button");
    remove.className = "danger-button";
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => row.remove());
    row.append(question, input, remove);
    learnedList.append(row);
  }
}

function learnedValues() {
  const result = {};
  for (const row of learnedList.querySelectorAll(".learned-row")) {
    const value = row.querySelector(".learned-answer").value.trim();
    if (!value) continue;
    const previous = learnedAnswers[row.dataset.key] || {};
    result[row.dataset.key] = { ...previous, value, updatedAt: new Date().toISOString() };
  }
  return result;
}

function collectAiSettings() {
  return globalThis.ResumeAiAgent.normalizeSettings({
    enabled: document.querySelector("#aiEnabled").checked,
    endpoint: document.querySelector("#aiEndpoint").value,
    model: document.querySelector("#aiModel").value,
    apiKey: document.querySelector("#aiApiKey").value
  });
}

function renderAiSettings() {
  const normalized = globalThis.ResumeAiAgent.normalizeSettings(aiSettings);
  document.querySelector("#aiEnabled").checked = normalized.enabled;
  document.querySelector("#aiEndpoint").value = normalized.endpoint;
  document.querySelector("#aiModel").value = normalized.model;
  document.querySelector("#aiApiKey").value = normalized.apiKey;
}

async function requestAiPermission(settings) {
  if (!settings.enabled) return true;
  const origin = globalThis.ResumeAiAgent.endpointOriginPattern(settings.endpoint);
  if (!chrome.permissions?.request) return true;
  return chrome.permissions.request({ origins: [origin] });
}

function createEducationCard(education = {}) {
  const card = document.createElement("article");
  card.className = "experience-card education-card";
  const fields = [
    ["school", "学校", "text"],
    ["department", "院系", "text"],
    ["major", "专业", "text"],
    ["degree", "学历/学位", "text"],
    ["startDate", "开始日期", "date"],
    ["endDate", "结束日期", "date"]
  ];
  const grid = document.createElement("div");
  grid.className = "experience-grid";
  for (const [key, labelText, type] of fields) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.dataset.educationField = key;
    input.value = education[key] || "";
    wrap.append(label, input);
    grid.append(wrap);
  }
  const descriptionWrap = document.createElement("div");
  descriptionWrap.className = "field wide";
  const descriptionLabel = document.createElement("label");
  descriptionLabel.textContent = "课程/研究方向";
  const description = document.createElement("textarea");
  description.dataset.educationField = "description";
  description.value = education.description || "";
  descriptionWrap.append(descriptionLabel, description);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-button education-remove";
  remove.textContent = "删除此段";
  remove.addEventListener("click", () => card.remove());
  card.append(grid, descriptionWrap, remove);
  return card;
}

function renderEducationExperiences() {
  educationExperienceList.replaceChildren();
  if (!educationExperiences.length) {
    const empty = document.createElement("p");
    empty.className = "learned-empty education-empty";
    empty.textContent = "还没有结构化教育经历。上传简历解析或点击“添加一段”。";
    educationExperienceList.append(empty);
    return;
  }
  educationExperiences.forEach((education) => educationExperienceList.append(createEducationCard(education)));
}

function collectEducationExperiences() {
  return Array.from(educationExperienceList.querySelectorAll(".education-card")).map((card) => {
    const value = (key) => card.querySelector(`[data-education-field="${key}"]`).value.trim();
    return {
      school: value("school"),
      department: value("department"),
      major: value("major"),
      degree: value("degree"),
      startDate: value("startDate"),
      endDate: value("endDate"),
      ongoing: !value("endDate"),
      description: value("description")
    };
  }).filter((education) => education.school || education.major || education.degree);
}

function syncLatestEducation(clearWhenEmpty = false) {
  const latest = educationExperiences[0];
  if (!latest) {
    if (clearWhenEmpty) {
      for (const key of ["school", "department", "degree", "major", "educationStart", "educationEnd"]) form.elements[key].value = "";
    }
    return;
  }
  form.elements.school.value = latest.school || "";
  form.elements.department.value = latest.department || "";
  form.elements.degree.value = latest.degree || "";
  form.elements.major.value = latest.major || "";
  form.elements.educationStart.value = latest.startDate || "";
  form.elements.educationEnd.value = latest.endDate || "";
}

function mergeEducationExperiences(incoming) {
  const unique = new Map();
  for (const education of [...incoming, ...educationExperiences]) {
    const key = `${education.school}|${education.major}|${education.degree}|${education.startDate}`.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, education);
  }
  return Array.from(unique.values()).sort((left, right) => Number(Boolean(right.ongoing)) - Number(Boolean(left.ongoing)) || String(right.startDate || "").localeCompare(String(left.startDate || "")));
}

function createExperienceCard(experience = {}) {
  const card = document.createElement("article");
  card.className = "experience-card";
  const fields = [
    ["company", "公司/单位", "text"],
    ["jobTitle", "职位", "text"],
    ["startDate", "开始日期", "date"],
    ["endDate", "结束日期", "date"]
  ];
  const grid = document.createElement("div");
  grid.className = "experience-grid";
  for (const [key, labelText, type] of fields) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.dataset.experienceField = key;
    input.value = experience[key] || "";
    wrap.append(label, input);
    grid.append(wrap);
  }
  const descriptionWrap = document.createElement("div");
  descriptionWrap.className = "field wide";
  const descriptionLabel = document.createElement("label");
  descriptionLabel.textContent = "工作描述";
  const description = document.createElement("textarea");
  description.dataset.experienceField = "description";
  description.value = experience.description || "";
  descriptionWrap.append(descriptionLabel, description);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-button experience-remove";
  remove.textContent = "删除此段";
  remove.addEventListener("click", () => card.remove());
  card.append(grid, descriptionWrap, remove);
  return card;
}

function renderWorkExperiences() {
  workExperienceList.replaceChildren();
  if (!workExperiences.length) {
    const empty = document.createElement("p");
    empty.className = "learned-empty work-empty";
    empty.textContent = "还没有工作经历。上传简历解析或点击“添加一段”。";
    workExperienceList.append(empty);
    return;
  }
  workExperiences.forEach((experience) => workExperienceList.append(createExperienceCard(experience)));
}

function collectWorkExperiences() {
  return Array.from(workExperienceList.querySelectorAll(".experience-card")).map((card) => {
    const value = (key) => card.querySelector(`[data-experience-field="${key}"]`).value.trim();
    return {
      company: value("company"),
      jobTitle: value("jobTitle"),
      startDate: value("startDate"),
      endDate: value("endDate"),
      ongoing: !value("endDate"),
      description: value("description")
    };
  }).filter((experience) => experience.company || experience.jobTitle || experience.description);
}

function syncLatestExperience(clearWhenEmpty = false) {
  const latest = workExperiences[0];
  if (!latest) {
    if (clearWhenEmpty) {
      for (const key of ["latestCompany", "latestJobTitle", "workStart", "workEnd", "workDescription"]) form.elements[key].value = "";
    }
    return;
  }
  form.elements.latestCompany.value = latest.company || "";
  form.elements.latestJobTitle.value = latest.jobTitle || "";
  form.elements.workStart.value = latest.startDate || "";
  form.elements.workEnd.value = latest.endDate || "";
  form.elements.workDescription.value = latest.description || "";
}

function mergeWorkExperiences(incoming) {
  const combined = [...incoming, ...workExperiences];
  const unique = new Map();
  for (const experience of combined) {
    const key = `${experience.company}|${experience.jobTitle}|${experience.startDate}`.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, experience);
  }
  return Array.from(unique.values()).sort((left, right) => Number(Boolean(right.ongoing)) - Number(Boolean(left.ongoing)) || String(right.startDate || "").localeCompare(String(left.startDate || "")));
}

function showParsePreview(result, fileName) {
  const dialog = document.querySelector("#parseDialog");
  const container = document.querySelector("#parseResults");
  const legacyWorkKeys = new Set(["latestCompany", "latestJobTitle", "workStart", "workEnd", "workDescription"]);
  const legacyEducationKeys = new Set(["school", "department", "degree", "major", "educationStart", "educationEnd"]);
  pendingParse = result;
  const entries = catalog.fields.filter((field) => String(result.profile?.[field.key] || "").trim()
    && !(result.workExperiences?.length && legacyWorkKeys.has(field.key))
    && !(result.educationExperiences?.length && legacyEducationKeys.has(field.key)));
  container.replaceChildren();
  document.querySelector("#parseSummary").textContent = `文件：${fileName}。共识别 ${entries.length} 个基本字段、${result.educationExperiences?.length || 0} 段教育经历和 ${result.workExperiences?.length || 0} 段工作经历；已有内容默认不覆盖。`;

  for (const field of entries) {
    const parsedValue = String(result.profile[field.key] || "");
    const existingValue = form.elements[field.key].value.trim();
    const confidence = Math.round(result.details?.[field.key]?.confidence || 60);
    const checked = !existingValue && !field.sensitive && confidence >= 70;
    const row = document.createElement("div");
    row.className = "parse-row";
    row.dataset.key = field.key;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "parse-check";
    checkbox.checked = checked;
    checkbox.setAttribute("aria-label", `应用 ${field.label}`);
    const label = document.createElement("div");
    label.className = "parse-label";
    label.textContent = field.label;
    const valueWrap = document.createElement("div");
    valueWrap.className = "parse-value";
    const editor = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    editor.className = "parsed-editor";
    editor.value = parsedValue;
    editor.title = result.details?.[field.key]?.evidence || "";
    valueWrap.append(editor);
    const badge = document.createElement("span");
    badge.className = "parse-confidence";
    badge.textContent = `${confidence}%`;
    row.append(checkbox, label, valueWrap, badge);
    if (existingValue) {
      const existing = document.createElement("div");
      existing.className = "parse-existing";
      existing.textContent = `现有内容：${existingValue}`;
      row.append(existing);
    }
    container.append(row);
  }
  if (result.educationExperiences?.length) {
    const heading = document.createElement("h3");
    heading.className = "parse-subheading";
    heading.textContent = `教育经历（${result.educationExperiences.length} 段）`;
    container.append(heading);
    result.educationExperiences.forEach((education, index) => {
      const card = document.createElement("article");
      card.className = "parse-education-card";
      card.dataset.educationIndex = index;
      const select = document.createElement("input");
      select.type = "checkbox";
      select.className = "parse-education-check";
      const duplicate = educationExperiences.some((existing) => existing.school === education.school && existing.major === education.major && existing.startDate === education.startDate);
      select.checked = !duplicate;
      select.setAttribute("aria-label", `应用教育经历 ${education.school} ${education.major}`);
      const content = document.createElement("div");
      content.className = "parse-education-content";
      const title = document.createElement("strong");
      title.textContent = `${education.school} · ${education.major}（${education.degree || "学历待确认"}）`;
      const dates = document.createElement("span");
      dates.className = "parse-education-dates";
      dates.textContent = `${education.startDate || "?"} 至 ${education.endDate || "至今"}`;
      const description = document.createElement("textarea");
      description.className = "parse-education-description";
      description.value = education.description || "";
      content.append(title, dates, description);
      card.append(select, content);
      container.append(card);
    });
  }
  if (result.workExperiences?.length) {
    const heading = document.createElement("h3");
    heading.className = "parse-subheading";
    heading.textContent = `工作经历（${result.workExperiences.length} 段）`;
    container.append(heading);
    result.workExperiences.forEach((experience, index) => {
      const card = document.createElement("article");
      card.className = "parse-work-card";
      card.dataset.experienceIndex = index;
      const select = document.createElement("input");
      select.type = "checkbox";
      select.className = "parse-work-check";
      const duplicate = workExperiences.some((existing) => existing.company === experience.company && existing.jobTitle === experience.jobTitle && existing.startDate === experience.startDate);
      select.checked = !duplicate;
      select.setAttribute("aria-label", `应用工作经历 ${experience.company}`);
      const content = document.createElement("div");
      content.className = "parse-work-content";
      const title = document.createElement("strong");
      title.textContent = `${experience.company} · ${experience.jobTitle}`;
      const dates = document.createElement("span");
      dates.className = "parse-work-dates";
      dates.textContent = `${experience.startDate || "?"} 至 ${experience.endDate || "至今"}`;
      const description = document.createElement("textarea");
      description.className = "parse-work-description";
      description.value = experience.description || "";
      content.append(title, dates, description);
      card.append(select, content);
      container.append(card);
    });
  }
  if (!entries.length && !result.educationExperiences?.length && !result.workExperiences?.length) {
    const empty = document.createElement("p");
    empty.className = "learned-empty";
    empty.textContent = "已提取到文字，但没有识别出可写入的字段。可以尝试使用带清晰字段标签的简历版本。";
    container.append(empty);
  }
  dialog.showModal();
}

async function parseResume(file) {
  const button = document.querySelector("#parseResumeButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "正在本地解析…";
  try {
    const result = await globalThis.ResumeParser.parseFile(file);
    showParsePreview(result, file.name);
  } catch (error) {
    showToast(`解析失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function applyParsedValues() {
  let applied = 0;
  for (const row of document.querySelectorAll("#parseResults .parse-row")) {
    if (!row.querySelector(".parse-check").checked) continue;
    const value = row.querySelector(".parsed-editor").value.trim();
    if (!value || !form.elements[row.dataset.key]) continue;
    form.elements[row.dataset.key].value = value;
    applied += 1;
  }
  const selectedEducations = Array.from(document.querySelectorAll("#parseResults .parse-education-card")).filter((card) => card.querySelector(".parse-education-check").checked).map((card) => {
    const source = pendingParse.educationExperiences[Number(card.dataset.educationIndex)];
    return { ...source, description: card.querySelector(".parse-education-description").value.trim() };
  });
  if (selectedEducations.length) {
    educationExperiences = mergeEducationExperiences(selectedEducations);
    renderEducationExperiences();
    syncLatestEducation();
  }
  const selectedExperiences = Array.from(document.querySelectorAll("#parseResults .parse-work-card")).filter((card) => card.querySelector(".parse-work-check").checked).map((card) => {
    const source = pendingParse.workExperiences[Number(card.dataset.experienceIndex)];
    return { ...source, description: card.querySelector(".parse-work-description").value.trim() };
  });
  if (selectedExperiences.length) {
    workExperiences = mergeWorkExperiences(selectedExperiences);
    renderWorkExperiences();
    syncLatestExperience();
  }
  if (!applied && !selectedEducations.length && !selectedExperiences.length) {
    showToast("没有选择要应用的字段");
    return;
  }
  await save();
  document.querySelector("#parseDialog").close();
  showToast(`已保存 ${applied} 个字段、${selectedEducations.length} 段教育经历和 ${selectedExperiences.length} 段工作经历`);
}

async function load() {
  const stored = await chrome.storage.local.get(["profile", "learnedAnswers", "educationExperiences", "workExperiences", "aiSettings"]);
  const profile = stored.profile || {};
  learnedAnswers = stored.learnedAnswers || {};
  educationExperiences = stored.educationExperiences || [];
  workExperiences = stored.workExperiences || [];
  aiSettings = globalThis.ResumeAiAgent.normalizeSettings(stored.aiSettings);
  for (const field of catalog.fields) form.elements[field.key].value = profile[field.key] || "";
  if (!educationExperiences.length && (profile.school || profile.major || profile.degree)) {
    educationExperiences = [{ school: profile.school || "", department: profile.department || "", major: profile.major || "", degree: profile.degree || "", startDate: profile.educationStart || "", endDate: profile.educationEnd || "", ongoing: !profile.educationEnd, description: "" }];
  }
  renderEducationExperiences();
  renderWorkExperiences();
  renderLearnedAnswers();
  renderAiSettings();
}

async function save({ requestPermission = false } = {}) {
  learnedAnswers = learnedValues();
  const hadStructuredEducation = educationExperiences.length > 0;
  educationExperiences = collectEducationExperiences();
  syncLatestEducation(hadStructuredEducation);
  const hadStructuredExperiences = workExperiences.length > 0;
  workExperiences = collectWorkExperiences();
  syncLatestExperience(hadStructuredExperiences);
  aiSettings = collectAiSettings();
  if (requestPermission && aiSettings.enabled && !aiSettings.apiKey) {
    showToast("请先填写 AI API Key");
    return false;
  }
  if (requestPermission && aiSettings.enabled && !(await requestAiPermission(aiSettings))) {
    showToast("未授予 AI 接口访问权限，Agent 尚未启用");
    return false;
  }
  await chrome.storage.local.set({ profile: values(), learnedAnswers, educationExperiences, workExperiences, aiSettings });
  showToast("资料已保存在本机");
  return true;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify({ version: 4, profile: values(), educationExperiences: collectEducationExperiences(), workExperiences: collectWorkExperiences(), learnedAnswers: learnedValues() }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `resume-profile-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  const data = JSON.parse(await file.text());
  const profile = data.profile || data;
  learnedAnswers = data.learnedAnswers || {};
  educationExperiences = data.educationExperiences || [];
  workExperiences = data.workExperiences || [];
  for (const field of catalog.fields) form.elements[field.key].value = String(profile[field.key] || "");
  if (!educationExperiences.length && (profile.school || profile.major || profile.degree)) {
    educationExperiences = [{ school: profile.school || "", department: profile.department || "", major: profile.major || "", degree: profile.degree || "", startDate: profile.educationStart || "", endDate: profile.educationEnd || "", ongoing: !profile.educationEnd, description: "" }];
  }
  renderEducationExperiences();
  syncLatestEducation();
  renderWorkExperiences();
  syncLatestExperience();
  renderLearnedAnswers();
  await save();
  showToast("备份已导入并保存");
}

document.querySelector("#saveButton").addEventListener("click", async () => {
  try { await save({ requestPermission: true }); }
  catch (error) { showToast(`保存失败：${error.message}`); }
});
document.querySelector("#exportButton").addEventListener("click", downloadJson);
document.querySelector("#parseResumeButton").addEventListener("click", () => document.querySelector("#resumeFile").click());
document.querySelector("#resumeFile").addEventListener("change", async (event) => {
  if (event.target.files[0]) await parseResume(event.target.files[0]);
  event.target.value = "";
});
document.querySelector("#importButton").addEventListener("click", () => document.querySelector("#importFile").click());
document.querySelector("#importFile").addEventListener("change", async (event) => {
  try { if (event.target.files[0]) await importJson(event.target.files[0]); }
  catch (error) { showToast(`导入失败：${error.message}`); }
  event.target.value = "";
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await save({ requestPermission: true }); }
  catch (error) { showToast(`保存失败：${error.message}`); }
});
document.querySelector("#applyParsed").addEventListener("click", applyParsedValues);
document.querySelector("#cancelParse").addEventListener("click", () => document.querySelector("#parseDialog").close());
document.querySelector("#closeParseDialog").addEventListener("click", () => document.querySelector("#parseDialog").close());
document.querySelector("#addEducationExperience").addEventListener("click", () => {
  educationExperienceList.querySelector(".education-empty")?.remove();
  educationExperienceList.prepend(createEducationCard());
});
document.querySelector("#addWorkExperience").addEventListener("click", () => {
  workExperienceList.querySelector(".work-empty")?.remove();
  workExperienceList.prepend(createExperienceCard());
});
async function start() {
  try { await chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }); } catch { /* Older Chromium versions do not expose this hardening API. */ }
  await load();
}
start();
