"use strict";

const catalog = globalThis.ResumeFieldCatalog;
const state = {
  profile: {},
  workExperiences: [],
  learnedAnswers: {},
  candidates: [],
  hostname: "",
  tabId: null,
  siteRules: {},
  mode: "fill"
};
const elements = {
  status: document.querySelector("#status"),
  toolbar: document.querySelector("#toolbar"),
  results: document.querySelector("#results"),
  count: document.querySelector("#count"),
  fill: document.querySelector("#fill"),
  learnPage: document.querySelector("#learnPage"),
  selectAll: document.querySelector("#selectAll"),
  rememberRules: document.querySelector("#rememberRules")
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

function setStatus(text, error = false) {
  elements.status.hidden = false;
  elements.status.textContent = text;
  elements.status.classList.toggle("error", error);
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(state.tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

async function ensureInjected() {
  await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ["field-catalog.js", "content.js"] });
}

function sourceFor(candidate) {
  if (candidate.preferredSourceRef && sourceDetails(candidate.preferredSourceRef).value) return candidate.preferredSourceRef;
  const workFieldMap = {
    latestCompany: "company",
    latestJobTitle: "jobTitle",
    workStart: "startDate",
    workEnd: "endDate",
    workDescription: "description"
  };
  const experienceField = workFieldMap[candidate.matchedKey];
  const experience = state.workExperiences[candidate.repeatIndex || 0];
  if (experienceField && experience?.[experienceField]) return `experience:${candidate.repeatIndex || 0}:${experienceField}`;
  if (candidate.matchedKey) return `profile:${candidate.matchedKey}`;
  if (candidate.learnedKey) return `learned:${candidate.learnedKey}`;
  return "";
}

function sourceDetails(sourceRef) {
  if (sourceRef.startsWith("experience:")) {
    const [, index, key] = sourceRef.split(":");
    const experience = state.workExperiences[Number(index)] || {};
    return { value: experience[key] || "", sensitive: false, key };
  }
  if (sourceRef.startsWith("profile:")) {
    const key = sourceRef.slice(8);
    return { value: state.profile[key] || "", sensitive: Boolean(catalog.byKey[key]?.sensitive), key };
  }
  if (sourceRef.startsWith("learned:")) {
    const key = sourceRef.slice(8);
    const answer = state.learnedAnswers[key] || {};
    return { value: answer.value || "", sensitive: Boolean(answer.sensitive), key };
  }
  return { value: "", sensitive: false, key: "" };
}

function sourceOptions(selectedSource) {
  const profileOptions = catalog.fields.map((field) => {
    const ref = `profile:${field.key}`;
    const selected = ref === selectedSource ? " selected" : "";
    return `<option value="${ref}"${selected}>${field.group} · ${field.label}</option>`;
  }).join("");
  const learnedOptions = Object.entries(state.learnedAnswers).map(([key, answer]) => {
    const ref = `learned:${key}`;
    const selected = ref === selectedSource ? " selected" : "";
    return `<option value="${escapeHtml(ref)}"${selected}>已学习 · ${escapeHtml(answer.label || key)}</option>`;
  }).join("");
  const experienceLabels = { company: "公司", jobTitle: "职位", startDate: "开始日期", endDate: "结束日期", description: "工作描述" };
  const experienceOptions = state.workExperiences.flatMap((experience, index) => Object.entries(experienceLabels).filter(([key]) => experience[key]).map(([key, label]) => {
    const ref = `experience:${index}:${key}`;
    const selected = ref === selectedSource ? " selected" : "";
    return `<option value="${ref}"${selected}>经历 ${index + 1} · ${escapeHtml(experience.company || experience.jobTitle)} · ${label}</option>`;
  })).join("");
  return `<option value="">选择填写内容…</option><optgroup label="简历资料">${profileOptions}</optgroup>${experienceOptions ? `<optgroup label="工作经历">${experienceOptions}</optgroup>` : ""}${learnedOptions ? `<optgroup label="已学习答案">${learnedOptions}</optgroup>` : ""}`;
}

function confidenceBadge(candidate, source) {
  if (!source.value) return '<span class="confidence confidence-unknown">待匹配</span>';
  const confidence = Math.min(100, Number(candidate.confidence || candidate.score || 0));
  if (confidence >= 88) return `<span class="confidence confidence-high">高置信 ${confidence}%</span>`;
  if (confidence >= 68) return `<span class="confidence confidence-medium">建议 ${confidence}%</span>`;
  return `<span class="confidence confidence-unknown">需确认</span>`;
}

function renderFill() {
  elements.results.replaceChildren();
  elements.toolbar.hidden = state.candidates.length === 0;
  elements.status.hidden = state.candidates.length > 0;
  elements.rememberRules.hidden = false;
  elements.fill.textContent = "填入所选字段";

  if (!state.candidates.length) {
    setStatus("没有发现可填写字段。请打开招聘网站的简历编辑页后重试。");
    elements.fill.disabled = true;
    return;
  }

  state.candidates.forEach((candidate, index) => {
    candidate.sourceRef = sourceFor(candidate);
    const source = sourceDetails(candidate.sourceRef);
    const confidence = Number(candidate.confidence || candidate.score || 0);
    const checked = Boolean(source.value) && confidence >= 88 && !candidate.currentValue && !source.sensitive;
    const article = document.createElement("article");
    article.className = "candidate";
    article.dataset.index = index;
    article.innerHTML = `
      <input class="candidate-check" type="checkbox" ${checked ? "checked" : ""} aria-label="选择 ${escapeHtml(candidate.label)}">
      <div>
        <div class="candidate-label" title="${escapeHtml(candidate.label)}">网页字段：${escapeHtml(candidate.label)}${confidenceBadge(candidate, source)}${source.sensitive ? '<span class="badge">敏感</span>' : ""}</div>
        <select class="field-map" aria-label="选择填写内容">${sourceOptions(candidate.sourceRef)}</select>
        <div class="candidate-value">将填入：${escapeHtml(source.value || "（请先选择内容）")}</div>
      </div>`;
    const select = article.querySelector(".field-map");
    select.addEventListener("change", () => {
      candidate.sourceRef = select.value;
      const selected = sourceDetails(select.value);
      article.querySelector(".candidate-value").textContent = `将填入：${selected.value || "（内容为空）"}`;
      const confidence = article.querySelector(".confidence");
      confidence.className = "confidence confidence-medium";
      confidence.textContent = select.value ? "手动选择" : "待匹配";
      if (selected.sensitive) article.querySelector(".candidate-check").checked = false;
      updateCount();
    });
    article.querySelector(".candidate-check").addEventListener("change", updateCount);
    elements.results.append(article);
  });
  updateCount();
}

function renderLearn() {
  elements.results.replaceChildren();
  elements.toolbar.hidden = state.candidates.length === 0;
  elements.status.hidden = state.candidates.length > 0;
  elements.rememberRules.hidden = true;
  elements.fill.textContent = "保存所选答案";

  if (!state.candidates.length) {
    setStatus("没有发现新的已填写内容。请先在网页中手动填写，再点击学习。");
    elements.fill.disabled = true;
    return;
  }

  state.candidates.forEach((candidate, index) => {
    const destination = candidate.matchedKey
      ? `保存到资料库 · ${catalog.byKey[candidate.matchedKey]?.label || candidate.matchedKey}`
      : "保存为自定义答案";
    const article = document.createElement("article");
    article.className = "candidate learn-candidate";
    article.dataset.index = index;
    article.innerHTML = `
      <input class="candidate-check" type="checkbox" ${candidate.sensitive ? "" : "checked"} aria-label="学习 ${escapeHtml(candidate.label)}">
      <div>
        <div class="candidate-label" title="${escapeHtml(candidate.label)}">网页字段：${escapeHtml(candidate.label)}${candidate.sensitive ? '<span class="badge">敏感</span>' : ""}</div>
        <div class="learn-destination">${escapeHtml(destination)}</div>
        <input class="learn-value" value="${escapeHtml(candidate.value)}" aria-label="要保存的答案">
      </div>`;
    article.querySelector(".candidate-check").addEventListener("change", updateCount);
    elements.results.append(article);
  });
  updateCount();
}

function selectedRows() {
  return Array.from(elements.results.querySelectorAll(".candidate")).filter((row) => row.querySelector(".candidate-check").checked);
}

function updateCount() {
  const count = selectedRows().length;
  elements.count.textContent = `已选 ${count}/${state.candidates.length}`;
  elements.fill.disabled = count === 0;
  elements.selectAll.checked = count > 0 && count === state.candidates.length;
  elements.selectAll.indeterminate = count > 0 && count < state.candidates.length;
}

async function initializeTab() {
  if (state.tabId) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("找不到当前标签页");
  state.tabId = tab.id;
  state.hostname = tab.url ? new URL(tab.url).hostname : "current-site";
  await ensureInjected();
}

async function scan() {
  state.mode = "fill";
  try {
    setStatus("正在扫描当前页面…");
    await initializeTab();
    const stored = await chrome.storage.local.get(["profile", "siteRules", "learnedAnswers", "workExperiences"]);
    state.profile = stored.profile || {};
    state.siteRules = stored.siteRules || {};
    state.learnedAnswers = stored.learnedAnswers || {};
    state.workExperiences = stored.workExperiences || [];
    const response = await sendMessage({
      type: "RESUME_SCAN",
      profile: state.profile,
      learnedAnswers: state.learnedAnswers,
      siteRules: state.siteRules[state.hostname] || {}
    });
    if (!response?.ok) throw new Error(response?.error || "扫描失败");
    state.candidates = response.candidates || [];
    renderFill();
  } catch (error) {
    const internalPage = /Cannot access|chrome:\/\/|edge:\/\/|extensions/i.test(error.message);
    setStatus(internalPage ? "浏览器内部页面不允许扩展填写。请打开招聘网站的简历编辑页。" : `扫描失败：${error.message}`, true);
  }
}

async function capturePage() {
  state.mode = "learn";
  try {
    setStatus("正在读取你已填写的字段…");
    await initializeTab();
    const response = await sendMessage({ type: "RESUME_CAPTURE", profile: state.profile });
    if (!response?.ok) throw new Error(response?.error || "读取失败");
    state.candidates = (response.captured || []).filter((item) => {
      if (item.matchedKey && state.profile[item.matchedKey]) return false;
      return Boolean(item.questionKey && item.value);
    });
    renderLearn();
  } catch (error) {
    setStatus(`学习失败：${error.message}`, true);
  }
}

async function fillSelected() {
  const selections = [];
  const learnedRules = { ...(state.siteRules[state.hostname] || {}) };
  for (const row of selectedRows()) {
    const candidate = state.candidates[Number(row.dataset.index)];
    const sourceRef = row.querySelector(".field-map").value;
    const source = sourceDetails(sourceRef);
    if (!String(source.value || "").trim()) continue;
    selections.push({ elementId: candidate.elementId, signature: candidate.signature, key: source.key, value: source.value, label: candidate.label });
    learnedRules[candidate.signature] = sourceRef;
  }
  if (!selections.length) {
    setStatus("所选字段没有可填写内容。", true);
    return;
  }
  elements.fill.disabled = true;
  elements.fill.textContent = "正在填入…";
  try {
    const response = await sendMessage({ type: "RESUME_FILL", selections });
    if (!response?.ok) throw new Error(response?.error || "填写失败");
    if (elements.rememberRules.checked) {
      state.siteRules[state.hostname] = learnedRules;
      await chrome.storage.local.set({ siteRules: state.siteRules });
    }
    setStatus(`已填入 ${response.filled} 个字段${response.failed.length ? `，${response.failed.length} 个未成功` : ""}。请回到页面逐项复核。`);
    elements.results.replaceChildren();
    elements.toolbar.hidden = true;
  } catch (error) {
    setStatus(`填写失败：${error.message}`, true);
  } finally {
    elements.fill.textContent = "填入所选字段";
    elements.fill.disabled = elements.results.children.length === 0;
  }
}

async function saveLearned() {
  let profileCount = 0;
  let customCount = 0;
  for (const row of selectedRows()) {
    const candidate = state.candidates[Number(row.dataset.index)];
    const value = row.querySelector(".learn-value").value.trim();
    if (!value) continue;
    if (candidate.matchedKey && !state.profile[candidate.matchedKey]) {
      state.profile[candidate.matchedKey] = value;
      profileCount += 1;
    } else {
      state.learnedAnswers[candidate.questionKey] = {
        label: candidate.label,
        value,
        sensitive: Boolean(candidate.sensitive),
        updatedAt: new Date().toISOString()
      };
      customCount += 1;
    }
  }
  if (!profileCount && !customCount) {
    setStatus("没有选择可保存的答案。", true);
    return;
  }
  await chrome.storage.local.set({ profile: state.profile, learnedAnswers: state.learnedAnswers });
  setStatus(`已学习 ${profileCount + customCount} 项；下次遇到相同字段时会进入自动填写预览。`);
  elements.results.replaceChildren();
  elements.toolbar.hidden = true;
  elements.fill.disabled = true;
}

async function primaryAction() {
  if (state.mode === "learn") await saveLearned();
  else await fillSelected();
}

document.querySelector("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#rescan").addEventListener("click", scan);
elements.learnPage.addEventListener("click", capturePage);
elements.fill.addEventListener("click", primaryAction);
elements.selectAll.addEventListener("change", () => {
  elements.results.querySelectorAll(".candidate-check").forEach((checkbox) => { checkbox.checked = elements.selectAll.checked; });
  updateCount();
});

async function start() {
  try { await chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }); } catch { /* Keep compatibility with older Chromium versions. */ }
  await scan();
}
start();
