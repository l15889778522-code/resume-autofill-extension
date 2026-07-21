import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, "..", "field-catalog.js")));
await import(pathToFileURL(path.join(here, "..", "ai-agent.js")));

const agent = globalThis.ResumeAiAgent;
const catalog = globalThis.ResumeFieldCatalog;
const profile = { fullName: "张三", phone: "13800000000", desiredCity: "上海", school: "香港理工大学", major: "医疗数据科学", idNumber: "110101199001010011" };
const workExperiences = [{ company: "隐私公司", jobTitle: "数据分析师", category: "internship", description: "完成用户分析" }, { company: "第二公司", jobTitle: "运营分析师", category: "internship", description: "复盘运营活动" }];
const learnedAnswers = {
  travel: { label: "是否接受出差", value: "每月最多两次", sensitive: false }
};
const educationExperiences = [
  { school: "香港理工大学", major: "医疗数据科学", degree: "硕士" },
  { school: "北师香港浸会大学", major: "统计学", degree: "本科" }
];
const sources = agent.sourceCatalog(catalog, profile, workExperiences, learnedAnswers, educationExperiences);
const candidates = [{
  elementId: "field-1",
  label: "工作地点偏好",
  section: "求职意向",
  tag: "input",
  inputType: "text",
  required: true,
  currentValue: "",
  placeholder: "请选择希望工作的城市",
  instruction: "请填写最希望入职的城市",
  options: []
}];

const promptText = JSON.stringify(agent.buildPrompt(candidates, sources, { hostname: "jobs.example.com", language: "zh-CN" }));
for (const privateValue of ["张三", "13800000000", "上海", "隐私公司", "数据分析师", "第二公司", "运营分析师", "每月最多两次", "香港理工大学", "医疗数据科学", "北师香港浸会大学", "统计学"]) {
  assert.equal(promptText.includes(privateValue), false, `prompt leaked private value: ${privateValue}`);
}
assert.ok(promptText.includes("期望城市"));
assert.equal(sources.some((source) => source.sourceRef === "profile:major"), false);
assert.equal(sources.some((source) => source.sourceRef === "education:1:major"), true);
assert.equal(sources.some((source) => source.sourceRef === "computed:internshipSummary"), true);
const semanticSources = agent.sourceCatalog(catalog, profile, workExperiences, learnedAnswers, educationExperiences, { includeValues: true });
const semanticPromptText = JSON.stringify(agent.buildPrompt(candidates, semanticSources, { hostname: "jobs.example.com", language: "zh-CN" }));
assert.equal(semanticPromptText.includes("香港理工大学"), true);
assert.equal(semanticPromptText.includes("完成用户分析"), true);
assert.equal(semanticPromptText.includes("每月最多两次"), true);
assert.equal(semanticPromptText.includes("请填写最希望入职的城市"), true);
assert.equal(semanticPromptText.includes("110101199001010011"), false);
assert.equal(semanticPromptText.includes("张三"), false);
assert.equal(semanticPromptText.includes("13800000000"), false);
assert.equal(agent.normalizeSettings({ shareResumeData: true }).shareResumeData, true);
assert.equal(agent.endpointOriginPattern("https://api.deepseek.com/chat/completions"), "https://api.deepseek.com/*");
assert.equal(agent.endpointOriginPattern("http://localhost:11434/v1/chat/completions"), "http://localhost/*");
assert.throws(() => agent.endpointOriginPattern("http://example.com/v1/chat/completions"), /HTTPS/);

let requestBody;
const assignments = await agent.planMappings({
  settings: { enabled: true, endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash", apiKey: "test-key" },
  candidates,
  sources,
  pageContext: { hostname: "jobs.example.com" },
  fetchImpl: async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: JSON.stringify({ assignments: [
            { elementId: "field-1", sourceRef: "profile:desiredCity", confidence: 93, reason: "属于求职意向中的地点偏好" },
            { elementId: "field-1", sourceRef: "profile:hallucinated", confidence: 100, reason: "非法来源" },
            { elementId: "missing", sourceRef: "profile:desiredCity", confidence: 100, reason: "非法控件" }
          ] }) } }]
        };
      }
    };
  }
});

assert.equal(requestBody.response_format.type, "json_object");
assert.equal(JSON.stringify(requestBody).includes("test-key"), false);
assert.deepEqual(assignments, [{ elementId: "field-1", sourceRef: "profile:desiredCity", confidence: 93, reason: "属于求职意向中的地点偏好" }]);

const educationCandidates = [
  { elementId: "school-2", recordType: "education", recordIndex: 1 },
  { elementId: "major-2", recordType: "education", recordIndex: 1 }
];
const guarded = agent.validatePlan({ assignments: [
  { elementId: "school-2", sourceRef: "education:1:school", confidence: 95 },
  { elementId: "major-2", sourceRef: "education:0:major", confidence: 99 }
] }, educationCandidates, sources);
assert.deepEqual(guarded.map(({ elementId, sourceRef }) => ({ elementId, sourceRef })), [
  { elementId: "school-2", sourceRef: "education:1:school" }
]);
const workGuarded = agent.validatePlan({ assignments: [
  { elementId: "company-2", sourceRef: "experience:0:company", confidence: 99 },
  { elementId: "title-2", sourceRef: "experience:1:jobTitle", confidence: 95 }
] }, [
  { elementId: "company-2", recordType: "work", recordIndex: 1 },
  { elementId: "title-2", recordType: "work", recordIndex: 1 }
], sources);
assert.deepEqual(workGuarded.map(({ elementId, sourceRef }) => ({ elementId, sourceRef })), [
  { elementId: "title-2", sourceRef: "experience:1:jobTitle" }
]);
const aggregateGuarded = agent.validatePlan({ assignments: [
  { elementId: "internship-textarea", sourceRef: "computed:internshipSummary", confidence: 97, reason: "页面要求在单个文本框汇总全部实习" }
] }, [{ elementId: "internship-textarea", recordType: "", recordIndex: 0 }], semanticSources);
assert.equal(aggregateGuarded[0].sourceRef, "computed:internshipSummary");
console.log("AI_AGENT_OK");
