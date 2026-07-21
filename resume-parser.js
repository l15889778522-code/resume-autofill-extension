(function (root) {
  "use strict";

  const labeledRules = {
    fullName: ["姓名", "真实姓名", "中文名", "name", "full name"],
    englishName: ["英文名", "english name"],
    phone: ["手机号", "手机号码", "联系电话", "电话", "mobile", "phone"],
    email: ["邮箱", "电子邮箱", "email", "e-mail"],
    gender: ["性别", "gender"],
    birthDate: ["出生日期", "出生年月", "生日", "date of birth", "birthday"],
    city: ["现居城市", "当前城市", "居住城市", "所在地", "现居地", "current city", "location"],
    address: ["详细地址", "居住地址", "联系地址", "通讯地址", "address"],
    hometown: ["籍贯", "户籍所在地", "户口所在地", "hometown"],
    nationality: ["国籍", "民族", "nationality"],
    workYears: ["工作年限", "工作经验", "从业年限", "years of experience"],
    desiredTitle: ["期望职位", "求职岗位", "意向职位", "目标职位", "求职意向", "desired position", "target position"],
    desiredCity: ["期望城市", "意向城市", "期望工作地点", "preferred location"],
    expectedSalary: ["期望薪资", "期望月薪", "薪资要求", "expected salary"],
    availableDate: ["到岗日期", "可到岗时间", "入职时间", "available date"],
    school: ["学校名称", "毕业院校", "院校名称", "学校", "university", "school"],
    degree: ["最高学历", "学历", "学位", "degree", "education level"],
    major: ["专业名称", "所学专业", "专业", "major", "field of study"],
    educationStart: ["入学时间", "教育开始时间", "education start"],
    educationEnd: ["毕业时间", "教育结束时间", "graduation date"],
    latestCompany: ["最近公司", "公司名称", "单位名称", "雇主", "company", "employer"],
    latestJobTitle: ["最近职位", "职位名称", "岗位名称", "职务", "job title", "position"],
    workStart: ["工作开始时间", "任职开始时间", "employment start"],
    workEnd: ["工作结束时间", "离职时间", "employment end"],
    website: ["个人网站", "个人主页", "作品集", "portfolio", "website"],
    github: ["github"],
    linkedin: ["linkedin"],
    summary: ["个人简介", "自我评价", "个人总结", "职业概述", "professional summary", "summary"],
    idNumber: ["身份证号", "身份证号码", "证件号码", "id number"]
  };

  const sectionHeadings = [
    "基本信息", "个人信息", "求职意向", "教育经历", "教育背景", "工作经历", "工作经验",
    "项目经历", "项目经验", "技能", "专业技能", "证书", "获奖经历", "个人简介", "自我评价",
    "profile", "education", "experience", "employment", "projects", "skills", "summary"
  ];

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff\ue000-\uf8ff]/g, "")
      .replace(/[|｜]/g, "\n")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizedKey(value) {
    return String(value || "").toLocaleLowerCase().normalize("NFKC").replace(/[\s:：_\-—–/\\()（）\[\]【】.，,]/g, "");
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cleanValue(value) {
    return String(value || "").replace(/^[\s:：|｜\-—–]+/, "").replace(/[\s|｜]+$/, "").trim();
  }

  function normalizeDate(value) {
    const match = String(value || "").match(/((?:19|20)\d{2})\s*[年.\-/]\s*(\d{1,2})(?:\s*[月.\-/]\s*(\d{1,2}))?/);
    if (!match) return cleanValue(value);
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3] || 1).padStart(2, "0")}`;
  }

  function plausibleValue(value) {
    const cleaned = cleanValue(value);
    return cleaned && cleaned.length <= 500 && !sectionHeadings.some((heading) => normalizedKey(cleaned) === normalizedKey(heading));
  }

  function findLabeledValue(lines, aliases) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      for (const alias of aliases) {
        if (/^[\u3400-\u9fff]+$/.test(alias)) {
          const spacedAlias = Array.from(alias).map(escapeRegex).join("\\s*");
          const anywhere = line.match(new RegExp(`(?:^|\\s)${spacedAlias}\\s*[:：]\\s*(.+?)(?=\\s+[\\u3400-\\u9fff](?:\\s*[\\u3400-\\u9fff]){1,7}\\s*[:：]|$)`, "i"));
          if (anywhere && plausibleValue(anywhere[1])) return { value: cleanValue(anywhere[1]), evidence: line, confidence: 94 };
        }
        const separatorIndex = line.search(/[:：]/);
        if (separatorIndex >= 0 && normalizedKey(line.slice(0, separatorIndex)) === normalizedKey(alias)) {
          const value = line.slice(separatorIndex + 1);
          if (plausibleValue(value)) return { value: cleanValue(value), evidence: line, confidence: 96 };
        }
        const direct = line.match(new RegExp(`^${escapeRegex(alias)}\\s*[:：]\\s*(.+)$`, "i"));
        if (direct && plausibleValue(direct[1])) return { value: cleanValue(direct[1]), evidence: line, confidence: 96 };
        if (normalizedKey(line) === normalizedKey(alias)) {
          const next = lines.slice(index + 1).find((candidate) => candidate.trim());
          if (next && plausibleValue(next)) return { value: cleanValue(next), evidence: `${line} → ${next}`, confidence: 82 };
        }
      }
    }
    return null;
  }

  function findSectionText(lines, headings) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!headings.some((heading) => normalizedKey(lines[index]) === normalizedKey(heading))) continue;
      const collected = [];
      for (let cursor = index + 1; cursor < lines.length && collected.join(" ").length < 700; cursor += 1) {
        const line = lines[cursor].trim();
        if (!line) continue;
        if (sectionHeadings.some((heading) => normalizedKey(line) === normalizedKey(heading))) break;
        collected.push(line);
      }
      if (collected.length) return collected.join("\n");
    }
    return "";
  }

  function setResult(result, key, value, confidence, evidence) {
    const cleaned = cleanValue(value);
    if (!cleaned || result.profile[key]) return;
    result.profile[key] = cleaned;
    result.details[key] = { confidence, evidence: String(evidence || "").slice(0, 240) };
  }

  function dateRangeFromLine(line) {
    const match = line.match(/((?:19|20)\d{2})[-./年](\d{1,2})\s*(?:~|～|—|–|至)\s*((?:(?:19|20)\d{2})[-./年](?:\d{1,2})|至今|现在|present)/i);
    if (!match) return null;
    return {
      raw: match[0],
      start: normalizeDate(`${match[1]}-${match[2]}`),
      end: /至今|现在|present/i.test(match[3]) ? "" : normalizeDate(match[3]),
      ongoing: /至今|现在|present/i.test(match[3])
    };
  }

  function parseEducation(lines, result) {
    const headingIndex = lines.findIndex((line) => ["教育背景", "教育经历", "education"].some((heading) => normalizedKey(line) === normalizedKey(heading)));
    const scopeStart = headingIndex >= 0 ? headingIndex + 1 : 0;
    const endIndex = lines.findIndex((line, index) => index >= scopeStart && [
      "工作经历", "工作经验", "实习经历", "实习经验", "项目经历", "项目经验", "技术栈", "技能", "专业技能",
      "employment", "experience", "projects", "skills"
    ].some((heading) => normalizedKey(line) === normalizedKey(heading)));
    const scopeEnd = endIndex >= scopeStart ? endIndex : Math.min(lines.length, scopeStart + 40);
    const candidates = [];
    for (let index = scopeStart; index < scopeEnd; index += 1) {
      const line = lines[index];
      const range = dateRangeFromLine(line);
      if (!range || !/大学|学院|学校|University|College/i.test(line)) continue;
      const remainder = cleanValue(line.replace(range.raw, ""));
      const schoolMatch = remainder.match(/^(.+?(?:大学|学院|学校|University|College))\s+(.+)$/i);
      if (!schoolMatch) continue;
      const degree = schoolMatch[2].match(/博士|硕士|本科|大专|专科|高中|Ph\.?D\.?|Master(?:'s)?|Bachelor(?:'s)?/i)?.[0] || "";
      const major = cleanValue(schoolMatch[2].replace(/[（(]?\s*(?:博士|硕士|本科|大专|专科|高中|Ph\.?D\.?|Master(?:'s)?|Bachelor(?:'s)?)\s*[）)]?/ig, ""));
      candidates.push({ index, line, range, school: schoolMatch[1], degree, major });
    }
    if (!candidates.length) return;
    const experiences = candidates.map((candidate, candidateIndex) => {
      const nextIndex = candidates[candidateIndex + 1]?.index || scopeEnd;
      const description = lines.slice(candidate.index + 1, nextIndex)
        .filter((line) => !dateRangeFromLine(line))
        .join("\n");
      return {
        school: candidate.school,
        degree: candidate.degree,
        major: candidate.major,
        startDate: candidate.range.start,
        endDate: candidate.range.end,
        ongoing: candidate.range.ongoing,
        description,
        confidence: 90
      };
    }).sort((left, right) => Number(right.ongoing) - Number(left.ongoing) || right.startDate.localeCompare(left.startDate));
    result.educationExperiences = experiences;

    // Flat education fields remain for backward compatibility, but are always
    // derived from one complete record. This prevents a school from one record
    // being combined with the major or degree from another record.
    const latest = experiences[0];
    const latestEvidence = candidates.find((candidate) => candidate.school === latest.school && candidate.range.start === latest.startDate)?.line || "";
    const synchronized = {
      school: latest.school,
      degree: latest.degree,
      major: latest.major,
      educationStart: latest.startDate,
      educationEnd: latest.endDate
    };
    for (const [key, value] of Object.entries(synchronized)) {
      if (!value) delete result.profile[key];
      else {
        result.profile[key] = value;
        result.details[key] = { confidence: key === "major" ? 88 : 92, evidence: latestEvidence.slice(0, 240) };
      }
    }
  }

  function parseWorkExperiences(lines, result) {
    const headingIndex = lines.findIndex((line) => ["工作经历", "工作经验", "实习经历", "实习经验", "employment", "experience"].some((heading) => normalizedKey(line) === normalizedKey(heading)));
    const scopeStart = headingIndex >= 0 && headingIndex < lines.length - 1 ? headingIndex + 1 : 0;
    const endIndex = lines.findIndex((line, index) => index >= scopeStart && ["项目经历", "项目经验", "教育背景", "教育经历", "技能", "专业技能", "projects", "education", "skills"].some((heading) => normalizedKey(line) === normalizedKey(heading)));
    const scopeEnd = endIndex >= scopeStart ? endIndex : lines.length;
    const candidates = [];
    for (let index = scopeStart; index < scopeEnd; index += 1) {
      const line = lines[index];
      const range = dateRangeFromLine(line);
      if (!range) continue;
      const remainder = cleanValue(line.replace(range.raw, ""));
      const companyRole = remainder.match(/^(.+?(?:有限责任公司|有限公司|公司|集团|证券|银行|事务所|研究院|Corporation|Limited|Ltd\.?))\s+(.+)$/i);
      if (!companyRole) continue;
      candidates.push({ index, line, range, company: companyRole[1], role: companyRole[2] });
    }
    if (!candidates.length) return;
    const experiences = candidates.map((candidate) => {
      const nextCandidateIndex = candidates.filter((other) => other.index > candidate.index).sort((a, b) => a.index - b.index)[0]?.index || scopeEnd;
      const descriptionLines = lines.slice(candidate.index + 1, nextCandidateIndex).filter((line) => !dateRangeFromLine(line));
      let jobTitle = candidate.role;
      if (descriptionLines[0] && descriptionLines[0].length <= 24 && /方向$/.test(descriptionLines[0]) && !/[：:。；;]/.test(descriptionLines[0])) {
        jobTitle = `${jobTitle}|${descriptionLines.shift()}`;
      }
      return {
        company: candidate.company,
        jobTitle,
        startDate: candidate.range.start,
        endDate: candidate.range.end,
        ongoing: candidate.range.ongoing,
        description: descriptionLines.join("\n"),
        confidence: 88
      };
    }).sort((left, right) => Number(right.ongoing) - Number(left.ongoing) || right.startDate.localeCompare(left.startDate));
    result.workExperiences = experiences;
    const latest = experiences[0];
    const latestEvidence = candidates.find((candidate) => candidate.company === latest.company && candidate.role === latest.jobTitle)?.line || "";
    setResult(result, "latestCompany", latest.company, 92, latestEvidence);
    setResult(result, "latestJobTitle", latest.jobTitle, 88, latestEvidence);
    setResult(result, "workStart", latest.startDate, 92, latestEvidence);
    if (latest.endDate) setResult(result, "workEnd", latest.endDate, 92, latestEvidence);
    if (latest.description) setResult(result, "workDescription", latest.description, 82, latest.description);
  }

  function extractProfileFromText(input) {
    const text = normalizeText(input);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const result = { profile: {}, details: {}, educationExperiences: [], workExperiences: [], textLength: text.length };

    for (const [key, aliases] of Object.entries(labeledRules)) {
      const found = findLabeledValue(lines, aliases);
      if (found) setResult(result, key, found.value, found.confidence, found.evidence);
    }

    parseEducation(lines, result);
    parseWorkExperiences(lines, result);

    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    if (email) setResult(result, "email", email, 99, email);
    const phone = text.match(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/)?.[0];
    if (phone) setResult(result, "phone", phone.replace(/[^\d+]/g, "").replace(/^\+?86/, ""), 99, phone);
    const idNumber = text.match(/(?<!\d)\d{17}[\dXx](?!\d)/)?.[0];
    if (idNumber) setResult(result, "idNumber", idNumber.toUpperCase(), 98, "检测到证件号码");

    const urls = text.match(/https?:\/\/[^\s<>()]+/gi) || [];
    const github = urls.find((url) => /github\.com/i.test(url));
    const linkedin = urls.find((url) => /linkedin\.com/i.test(url));
    if (github) setResult(result, "github", github.replace(/[，,。.;；]+$/, ""), 99, github);
    if (linkedin) setResult(result, "linkedin", linkedin.replace(/[，,。.;；]+$/, ""), 99, linkedin);
    const website = urls.find((url) => url !== github && url !== linkedin);
    if (website) setResult(result, "website", website.replace(/[，,。.;；]+$/, ""), 85, website);

    if (!result.profile.fullName) {
      const candidate = lines.slice(0, 10).find((line) => {
        const compact = line.replace(/\s/g, "");
        return /^[\u3400-\u9fff·]{2,5}$/.test(compact) && !/简历|信息|应聘|求职/.test(compact);
      });
      if (candidate) setResult(result, "fullName", candidate.replace(/\s/g, ""), 72, candidate);
    }

    if (!result.profile.school) {
      const school = lines.find((line) => line.length <= 70 && /大学|学院|学校|University|College/i.test(line) && !/教育经历|毕业院校|学校名称/i.test(line));
      if (school) setResult(result, "school", school, 74, school);
    }
    if (!result.profile.latestCompany) {
      const company = lines.find((line) => line.length <= 80 && /公司|集团|事务所|研究院|Company|Corporation|Limited|Ltd\.?/i.test(line) && !/公司名称|工作经历/i.test(line));
      if (company) setResult(result, "latestCompany", company, 70, company);
    }
    if (!result.profile.degree) {
      const degree = text.match(/博士|硕士|本科|大专|专科|高中|Ph\.?D\.?|Master(?:'s)?|Bachelor(?:'s)?/i)?.[0];
      if (degree) setResult(result, "degree", degree, 86, degree);
    }
    if (!result.profile.workYears) {
      const years = text.match(/(\d{1,2})\s*年(?:以上)?(?:工作|从业|开发|行业)?经验/)?.[1];
      if (years) setResult(result, "workYears", years, 88, `${years} 年经验`);
    }

    const summary = findSectionText(lines, ["个人简介", "自我评价", "个人总结", "职业概述", "summary", "profile"]);
    if (summary) setResult(result, "summary", summary, 88, summary);
    const workDescription = findSectionText(lines, ["工作内容", "岗位职责", "主要职责"]);
    if (workDescription) setResult(result, "workDescription", workDescription, 84, workDescription);

    for (const key of ["birthDate", "availableDate", "educationStart", "educationEnd", "workStart", "workEnd"]) {
      if (result.profile[key]) result.profile[key] = normalizeDate(result.profile[key]);
    }
    if (result.profile.gender) {
      const gender = normalizedKey(result.profile.gender);
      if (gender.startsWith("男") || ["male", "m"].includes(gender)) result.profile.gender = "男";
      else if (gender.startsWith("女") || ["female", "f"].includes(gender)) result.profile.gender = "女";
    }
    if (result.profile.workYears) {
      const years = result.profile.workYears.match(/\d{1,2}/)?.[0];
      if (years) result.profile.workYears = years;
    }
    return result;
  }

  async function parsePdf(file) {
    const pdfjs = await import(chrome.runtime.getURL("vendor/pdf.mjs"));
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    if (pdf.numPages > 50) throw new Error("PDF 页数超过 50 页，已停止解析");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      for (const item of content.items) {
        if (!String(item.str || "").trim() || !item.transform) continue;
        const x = Number(item.transform[4] || 0);
        const y = Number(item.transform[5] || 0);
        let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push({ x, text: item.str });
      }
      lines.sort((left, right) => right.y - left.y);
      pages.push(lines.map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ")).join("\n"));
    }
    return pages.join("\n");
  }

  async function parseDocx(file) {
    if (!root.JSZip) throw new Error("DOCX 解析组件未加载");
    const zip = await root.JSZip.loadAsync(await file.arrayBuffer());
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("DOCX 中缺少正文内容");
    const xmlText = await documentFile.async("text");
    if (xmlText.length > 5_000_000) throw new Error("DOCX 正文过大，已停止解析");
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("DOCX 正文格式损坏");
    const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"));
    return paragraphs.map((paragraph) => Array.from(paragraph.getElementsByTagNameNS("*", "t")).map((node) => node.textContent).join("")).join("\n");
  }

  async function parseFile(file) {
    if (file.size > 25 * 1024 * 1024) throw new Error("文件超过 25 MB，请先压缩后再解析");
    const extension = file.name.split(".").pop().toLocaleLowerCase();
    if (extension === "json") {
      const data = JSON.parse(await file.text());
      const profile = data.profile || data;
      const details = Object.fromEntries(Object.keys(profile).map((key) => [key, { confidence: 100, evidence: "JSON 导入" }]));
      return { profile, details, educationExperiences: data.educationExperiences || [], workExperiences: data.workExperiences || [], textLength: 0 };
    }
    let text;
    if (extension === "pdf") text = await parsePdf(file);
    else if (extension === "docx") text = await parseDocx(file);
    else if (["txt", "md"].includes(extension)) text = await file.text();
    else throw new Error("暂只支持 PDF、DOCX、TXT、MD 和 JSON 文件");
    if (!normalizeText(text)) throw new Error("没有提取到文字；扫描版 PDF 暂不支持，请先进行 OCR");
    if (text.length > 2_000_000) throw new Error("提取出的文字过多，已停止解析");
    return extractProfileFromText(text);
  }

  root.ResumeParser = { extractProfileFromText, parseFile };
})(typeof globalThis !== "undefined" ? globalThis : window);
