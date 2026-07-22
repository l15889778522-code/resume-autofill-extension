(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    shareResumeData: false,
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    apiKey: ""
  });

  function cleanText(value, maximum = 180) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function normalizeSettings(settings = {}) {
    return {
      enabled: Boolean(settings.enabled),
      shareResumeData: Boolean(settings.shareResumeData),
      endpoint: cleanText(settings.endpoint || DEFAULT_SETTINGS.endpoint, 500),
      model: cleanText(settings.model || DEFAULT_SETTINGS.model, 120),
      apiKey: String(settings.apiKey || "").trim()
    };
  }

  function endpointOriginPattern(endpoint) {
    const parsed = new URL(endpoint);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error("AI 接口仅支持 HTTP/HTTPS 地址");
    if (parsed.protocol === "http:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error("非本机 AI 接口必须使用 HTTPS");
    }
    // Chrome match patterns do not include ports; a host permission covers all
    // ports for the selected scheme and host (including local model servers).
    return `${parsed.protocol}//${parsed.hostname}/*`;
  }

  function displayMonth(value, ongoing = false) {
    if (!value) return ongoing ? "至今" : "时间待补充";
    const match = String(value).match(/((?:19|20)\d{2})-(\d{2})/);
    return match ? `${match[1]}年${Number(match[2])}月` : String(value);
  }

  function formatRecords(records, kind) {
    return (records || []).map((record) => {
      const dates = `${displayMonth(record.startDate)}–${displayMonth(record.endDate, record.ongoing || !record.endDate)}`;
      if (kind === "education") {
        const qualification = [record.major, record.degree].filter(Boolean).join("（") + (record.major && record.degree ? "）" : "");
        return [[dates, record.school, record.department, qualification].filter(Boolean).join("｜"), String(record.description || "").trim()].filter(Boolean).join("\n");
      }
      const title = String(record.jobTitle || "").replace("|", "（") + (String(record.jobTitle || "").includes("|") ? "）" : "");
      return [[dates, record.company, title].filter(Boolean).join("｜"), String(record.description || "").trim()].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n\n");
  }

  function sourceCatalog(catalog, profile, workExperiences, learnedAnswers, educationExperiences, options = {}) {
    const sources = [];
    const includeValues = Boolean(options.includeValues);
    const privateProfileKeys = new Set(["fullName", "englishName", "phone", "email", "address", "idNumber"]);
    const addSource = (metadata, value) => {
      const source = { ...metadata };
      if (includeValues && !metadata.sensitive) source.value = String(value || "").slice(0, 8000);
      sources.push(source);
    };
    const legacyWorkKeys = new Set(["latestCompany", "latestJobTitle", "workStart", "workEnd", "workDescription"]);
    const legacyEducationKeys = new Set(["school", "department", "degree", "major", "educationStart", "educationEnd"]);
    for (const field of catalog.fields || []) {
      if (!String(profile?.[field.key] || "").trim()) continue;
      if ((workExperiences || []).length && legacyWorkKeys.has(field.key)) continue;
      if ((educationExperiences || []).length && legacyEducationKeys.has(field.key)) continue;
      addSource({ sourceRef: `profile:${field.key}`, label: field.label, group: field.group, type: field.type || "text", sensitive: Boolean(field.sensitive || privateProfileKeys.has(field.key)) }, profile[field.key]);
    }
    const educationLabels = { school: "学校", department: "院系", major: "专业", degree: "学历/学位", startDate: "开始日期", endDate: "结束日期", description: "教育描述" };
    (educationExperiences || []).forEach((education, index) => {
      for (const [key, label] of Object.entries(educationLabels)) {
        if (!String(education?.[key] || "").trim()) continue;
        addSource({ sourceRef: `education:${index}:${key}`, label: `教育经历 ${index + 1} · ${label}`, group: `教育经历 ${index + 1}`, type: key === "description" ? "textarea" : "text", sensitive: false, recordType: "education", recordIndex: index }, education[key]);
      }
    });
    const experienceLabels = { company: "公司/单位", jobTitle: "职位", startDate: "开始日期", endDate: "结束日期", description: "工作描述" };
    (workExperiences || []).forEach((experience, index) => {
      for (const [key, label] of Object.entries(experienceLabels)) {
        if (!String(experience?.[key] || "").trim()) continue;
        addSource({ sourceRef: `experience:${index}:${key}`, label: `工作经历 ${index + 1} · ${label}`, group: `工作经历 ${index + 1}`, type: key === "description" ? "textarea" : "text", sensitive: false, recordType: "work", recordIndex: index }, experience[key]);
      }
    });
    const hasWorkCategories = (workExperiences || []).some((experience) => experience?.category);
    const internshipRecords = hasWorkCategories
      ? (workExperiences || []).filter((experience) => experience.category === "internship")
      : ((workExperiences || []).some((experience) => /实习|intern/i.test(experience?.jobTitle || "")) ? (workExperiences || []) : []);
    if (internshipRecords.length) {
      addSource({ sourceRef: "computed:internshipSummary", label: "全部实习经历汇总（分段文本）", group: "自动汇总", type: "textarea", sensitive: false }, formatRecords(internshipRecords, "work"));
    }
    if ((workExperiences || []).length) addSource({ sourceRef: "computed:workSummary", label: "全部工作经历汇总（分段文本）", group: "自动汇总", type: "textarea", sensitive: false }, formatRecords(workExperiences, "work"));
    if ((educationExperiences || []).length) addSource({ sourceRef: "computed:educationSummary", label: "全部教育经历汇总（分段文本）", group: "自动汇总", type: "textarea", sensitive: false }, formatRecords(educationExperiences, "education"));
    for (const [key, answer] of Object.entries(learnedAnswers || {})) {
      if (!String(answer?.value || "").trim()) continue;
      addSource({ sourceRef: `learned:${key}`, label: cleanText(answer.label || key), group: "已学习答案", type: "text", sensitive: Boolean(answer.sensitive) }, answer.value);
    }
    return sources;
  }

  function safeCandidate(candidate) {
    return {
      elementId: cleanText(candidate.elementId, 80),
      label: cleanText(candidate.label),
      section: cleanText(candidate.section),
      placeholder: cleanText(candidate.placeholder, 500),
      instruction: cleanText(candidate.instruction, 800),
      aria: cleanText(candidate.aria, 240),
      name: cleanText(candidate.name, 160),
      tag: cleanText(candidate.tag, 30),
      inputType: cleanText(candidate.inputType, 30),
      required: Boolean(candidate.required),
      hasCurrentValue: Boolean(candidate.currentValue),
      options: Array.isArray(candidate.options) ? candidate.options.map((option) => cleanText(option, 100)).filter(Boolean).slice(0, 80) : [],
      recordType: ["education", "work"].includes(candidate.recordType) ? candidate.recordType : "",
      recordIndex: Math.max(0, Number(candidate.recordIndex || 0)),
      aggregateType: ["internship", "work", "education", "project"].includes(candidate.aggregateType) ? candidate.aggregateType : "",
      localSuggestion: cleanText(candidate.sourceRef || candidate.preferredSourceRef, 180),
      localConfidence: Math.max(0, Math.min(100, Number(candidate.confidence || 0)))
    };
  }

  function buildPrompt(candidates, sources, pageContext = {}) {
    return {
      page: {
        hostname: cleanText(pageContext.hostname, 180),
        language: cleanText(pageContext.language, 30)
      },
      fields: (candidates || []).map(safeCandidate).filter((candidate) => candidate.elementId && candidate.label),
      allowedSources: (sources || []).map((source) => ({
        sourceRef: cleanText(source.sourceRef, 180),
        label: cleanText(source.label),
        group: cleanText(source.group, 100),
        type: cleanText(source.type, 30),
        format: String(source.sourceRef || "").startsWith("computed:") ? "multiline_records" : "single_value",
        sensitive: Boolean(source.sensitive),
        recordType: cleanText(source.recordType, 30),
        recordIndex: Number.isFinite(Number(source.recordIndex)) ? Number(source.recordIndex) : null,
        ...(Object.prototype.hasOwnProperty.call(source, "value") ? { value: String(source.value || "").slice(0, 8000) } : {})
      }))
    };
  }

  function parseJsonContent(content) {
    const raw = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!raw) throw new Error("AI 没有返回字段规划");
    return JSON.parse(raw);
  }

  function validatePlan(plan, candidates, sources) {
    const allowedElements = new Set((candidates || []).map((candidate) => candidate.elementId));
    const allowedSources = new Set((sources || []).map((source) => source.sourceRef));
    const candidateById = new Map((candidates || []).map((candidate) => [candidate.elementId, candidate]));
    const hasStructuredType = (type) => (sources || []).some((source) => source.sourceRef.startsWith(`${type}:`));
    const seen = new Set();
    const assignments = [];
    for (const item of Array.isArray(plan?.assignments) ? plan.assignments : []) {
      const elementId = cleanText(item?.elementId, 80);
      const sourceRef = cleanText(item?.sourceRef, 180);
      if (!allowedElements.has(elementId) || !allowedSources.has(sourceRef) || seen.has(elementId)) continue;
      const candidate = candidateById.get(elementId);
      const aggregateSources = {
        internship: "computed:internshipSummary",
        work: "computed:workSummary",
        education: "computed:educationSummary",
        project: "profile:projectSummary"
      };
      if (candidate?.aggregateType && sourceRef !== aggregateSources[candidate.aggregateType]) continue;
      const expectedSourceType = candidate?.recordType === "work" ? "experience" : candidate?.recordType;
      if (expectedSourceType && hasStructuredType(expectedSourceType)) {
        const [sourceType, sourceIndex] = sourceRef.split(":");
        if (sourceType !== expectedSourceType || Number(sourceIndex) !== Number(candidate.recordIndex || 0)) continue;
      }
      seen.add(elementId);
      assignments.push({
        elementId,
        sourceRef,
        confidence: Math.max(0, Math.min(100, Math.round(Number(item.confidence) || 0))),
        reason: cleanText(item.reason, 160)
      });
    }
    return assignments;
  }

  async function planMappings({ settings, candidates, sources, pageContext, fetchImpl = fetch }) {
    const config = normalizeSettings(settings);
    if (!config.enabled) throw new Error("请先在资料库启用 AI Agent");
    if (!config.apiKey) throw new Error("请先在资料库填写 AI API Key");
    if (!config.endpoint || !config.model) throw new Error("AI 接口地址和模型不能为空");
    endpointOriginPattern(config.endpoint);
    const prompt = buildPrompt(candidates, sources, pageContext);
    if (!prompt.fields.length || !prompt.allowedSources.length) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: 2400,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "你是招聘网申表单语义扫描 Agent。阅读每个网页栏位的标签、区块、占位提示、说明、控件类型和选项，并从 allowedSources 中选择应填写的唯一 sourceRef。allowedSources 可能包含实际简历值；只能理解和选择，不能改写、补全或编造值。网页把经历拆成学校/专业/公司/职位等多个字段时选择对应记录的原子来源；网页只有一个教育/工作/实习大文本框时选择相应 computed:*Summary 分段汇总来源；项目活动或研究成果大文本框选择 profile:projectSummary。必须区分现居城市与期望城市、学历与学位、教育、工作、实习和项目。同一个 recordType+recordIndex 区块必须使用同索引记录，严禁跨记录拼接。已有值的栏位不映射；没有可靠来源时省略。只返回 JSON：{\"assignments\":[{\"elementId\":\"...\",\"sourceRef\":\"...\",\"confidence\":0-100,\"reason\":\"说明栏位要求、选择该来源及分段/汇总判断\"}]}。"
            },
            { role: "user", content: JSON.stringify(prompt) }
          ]
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI 请求超时，请检查网络或接口地址");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cleanText(data?.error?.message || `AI 接口返回 ${response.status}`, 240));
    const content = data?.choices?.[0]?.message?.content;
    const plan = parseJsonContent(content);
    return validatePlan(plan, candidates, sources);
  }

  root.ResumeAiAgent = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    endpointOriginPattern,
    sourceCatalog,
    buildPrompt,
    parseJsonContent,
    validatePlan,
    planMappings
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
