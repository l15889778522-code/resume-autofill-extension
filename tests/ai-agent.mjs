import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, "..", "field-catalog.js")));
await import(pathToFileURL(path.join(here, "..", "ai-agent.js")));

const agent = globalThis.ResumeAiAgent;
const catalog = globalThis.ResumeFieldCatalog;
const profile = { fullName: "张三", phone: "13800000000", desiredCity: "上海" };
const sources = agent.sourceCatalog(catalog, profile, [{ company: "隐私公司", jobTitle: "数据分析师" }], {
  travel: { label: "是否接受出差", value: "每月最多两次", sensitive: false }
});
const candidates = [{
  elementId: "field-1",
  label: "工作地点偏好",
  section: "求职意向",
  tag: "input",
  inputType: "text",
  required: true,
  currentValue: "",
  options: []
}];

const promptText = JSON.stringify(agent.buildPrompt(candidates, sources, { hostname: "jobs.example.com", language: "zh-CN" }));
for (const privateValue of ["张三", "13800000000", "上海", "隐私公司", "数据分析师", "每月最多两次"]) {
  assert.equal(promptText.includes(privateValue), false, `prompt leaked private value: ${privateValue}`);
}
assert.ok(promptText.includes("期望城市"));
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
console.log("AI_AGENT_OK");
