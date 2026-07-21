import assert from "node:assert/strict";
import { existsSync, readFile, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function createPdfFixture() {
  const stream = [
    "BT", "/F1 12 Tf", "50 780 Td", "(Full Name: Alice Chen) Tj",
    "0 -20 Td", "(Email: alice@example.com) Tj",
    "0 -20 Td", "(Phone: 13800000000) Tj",
    "0 -20 Td", "(Degree: Master) Tj", "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Array.from(Buffer.from(pdf, "latin1"));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, "..");
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const filePath = path.resolve(extensionRoot, `.${pathname}`);
  if (!filePath.startsWith(`${extensionRoot}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    const type = /\.m?js$/.test(filePath) ? "application/javascript" : (filePath.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream");
    response.writeHead(200, { "Content-Type": type }).end(data);
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const installedBrowsers = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const executablePath = installedBrowsers.find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/tests/parser-browser.html`);

const docxResult = await page.evaluate(async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>姓名：李四</w:t></w:r></w:p>
      <w:p><w:r><w:t>邮箱：lisi@example.com</w:t></w:r></w:p>
      <w:p><w:r><w:t>手机号：13900000000</w:t></w:r></w:p>
    </w:body></w:document>`);
  const blob = await zip.generateAsync({ type: "blob" });
  return ResumeParser.parseFile(new File([blob], "resume.docx"));
});
assert.equal(docxResult.profile.fullName, "李四");
assert.equal(docxResult.profile.email, "lisi@example.com");

const pdfResult = await page.evaluate(async (bytes) => {
  globalThis.chrome = { runtime: { getURL(relativePath) { return new URL(`../${relativePath}`, location.href).href; } } };
  return ResumeParser.parseFile(new File([new Uint8Array(bytes)], "resume.pdf", { type: "application/pdf" }));
}, createPdfFixture());
assert.equal(pdfResult.profile.fullName, "Alice Chen");
assert.equal(pdfResult.profile.email, "alice@example.com");
assert.equal(pdfResult.profile.phone, "13800000000");

const settingsContext = await browser.newContext();
await settingsContext.addInitScript(() => {
  globalThis.__storageData = {};
  globalThis.__requestedOrigins = [];
  globalThis.chrome = {
    runtime: { getURL(relativePath) { return new URL(`/${relativePath}`, location.origin).href; } },
    permissions: {
      async contains() { return false; },
      async request(request) { globalThis.__requestedOrigins = request.origins || []; return true; }
    },
    storage: {
      local: {
        async get(keys) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.filter((key) => key in globalThis.__storageData).map((key) => [key, globalThis.__storageData[key]]));
        },
        async set(values) { Object.assign(globalThis.__storageData, values); }
      }
    }
  };
});
const settingsPage = await settingsContext.newPage();
await settingsPage.goto(`http://127.0.0.1:${port}/options.html`);
assert.equal(await settingsPage.locator("#aiEndpoint").inputValue(), "https://api.deepseek.com/chat/completions");
assert.equal(await settingsPage.locator("#aiModel").inputValue(), "deepseek-v4-flash");
await settingsPage.locator("#aiEnabled").check();
await settingsPage.locator("#aiApiKey").fill("local-test-key");
await settingsPage.locator("#saveButton").click();
await settingsPage.waitForFunction(() => Boolean(globalThis.__storageData.aiSettings));
const savedSettings = await settingsPage.evaluate(() => ({ settings: globalThis.__storageData.aiSettings, origins: globalThis.__requestedOrigins }));
assert.equal(savedSettings.settings.enabled, true);
assert.equal(savedSettings.settings.apiKey, "local-test-key");
assert.deepEqual(savedSettings.origins, ["https://api.deepseek.com/*"]);
await settingsContext.close();

if (process.env.RESUME_PDF_PATH) {
  const actualBytes = Array.from(readFileSync(process.env.RESUME_PDF_PATH));
  const actualResult = await page.evaluate(async (bytes) => {
    const result = await ResumeParser.parseFile(new File([new Uint8Array(bytes)], "resume.pdf", { type: "application/pdf" }));
    return {
      profileKeys: Object.keys(result.profile),
      hasLatestCompany: Boolean(result.profile.latestCompany),
      hasLatestJobTitle: Boolean(result.profile.latestJobTitle),
      hasWorkDescription: Boolean(result.profile.workDescription),
      workExperienceCount: Array.isArray(result.workExperiences) ? result.workExperiences.length : 0,
      workSummaries: (result.workExperiences || []).map((experience) => ({ company: experience.company, jobTitle: experience.jobTitle, descriptionStart: experience.description.slice(0, 24) })),
      textLength: result.textLength
    };
  }, actualBytes);
  console.log("ACTUAL_RESUME", JSON.stringify(actualResult));

  const optionsContext = await browser.newContext();
  await optionsContext.addInitScript(() => {
    globalThis.__storageData = {};
    globalThis.chrome = {
      runtime: { getURL(relativePath) { return new URL(`/${relativePath}`, location.origin).href; } },
      storage: {
        local: {
          async get(keys) {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.filter((key) => key in globalThis.__storageData).map((key) => [key, globalThis.__storageData[key]]));
          },
          async set(values) { Object.assign(globalThis.__storageData, values); }
        }
      }
    };
  });
  const optionsPage = await optionsContext.newPage();
  await optionsPage.goto(`http://127.0.0.1:${port}/options.html`);
  await optionsPage.locator("#resumeFile").setInputFiles(process.env.RESUME_PDF_PATH);
  await optionsPage.locator("#parseDialog").waitFor({ state: "visible" });
  assert.equal(await optionsPage.locator(".parse-work-card").count(), 2);
  await optionsPage.locator("#applyParsed").click();
  const saved = await optionsPage.evaluate(() => globalThis.__storageData);
  assert.equal(saved.workExperiences.length, 2);
  assert.equal(saved.profile.latestCompany, saved.workExperiences[0].company);
  while (await optionsPage.locator(".experience-remove").count()) await optionsPage.locator(".experience-remove").first().click();
  await optionsPage.locator("#saveButton").click();
  await optionsPage.waitForTimeout(50);
  const afterDelete = await optionsPage.evaluate(() => globalThis.__storageData);
  assert.equal(afterDelete.workExperiences.length, 0);
  assert.equal(afterDelete.profile.latestCompany, "");
  await optionsContext.close();
}

await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log("PARSER_BROWSER_OK");
