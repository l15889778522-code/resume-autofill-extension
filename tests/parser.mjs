import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "..", "resume-parser.js"), "utf8");
const sandbox = {};
vm.runInNewContext(source, sandbox);

const text = `
张三
手机：138 0000 0000
邮箱：zhangsan@example.com
性别：男
出生日期：1995年3月2日
现居城市：上海
工作年限：5年
期望职位：高级前端工程师
期望薪资：35k-45k
毕业院校：复旦大学
学历：硕士
专业：计算机科学与技术
公司名称：示例科技有限公司
职位名称：前端工程师
GitHub：https://github.com/example
个人简介
5 年前端经验，擅长工程化与性能优化。
专业技能
JavaScript、TypeScript、React
`;

const result = sandbox.ResumeParser.extractProfileFromText(text);
assert.equal(result.profile.fullName, "张三");
assert.equal(result.profile.phone, "13800000000");
assert.equal(result.profile.email, "zhangsan@example.com");
assert.equal(result.profile.gender, "男");
assert.equal(result.profile.birthDate, "1995-03-02");
assert.equal(result.profile.city, "上海");
assert.equal(result.profile.workYears, "5");
assert.equal(result.profile.desiredTitle, "高级前端工程师");
assert.equal(result.profile.school, "复旦大学");
assert.equal(result.profile.degree, "硕士");
assert.equal(result.profile.major, "计算机科学与技术");
assert.equal(result.profile.latestCompany, "示例科技有限公司");
assert.equal(result.profile.latestJobTitle, "前端工程师");
assert.equal(result.profile.github, "https://github.com/example");
assert.match(result.profile.summary, /性能优化/);
assert.ok(result.details.email.confidence >= 90);

const layoutText = `
李 小 明
性 别： 男  电 话： 13900000000
邮 箱： xiaoming@example.com  毕业时间： 2027.1
求职岗位： 数据分析/数据运营
教育背景
2025-09 ~ 2027-01 示例理工大学 医疗数据科学（硕士）
研究方向：医疗数据挖掘、统计建模
2021-09 ~ 2025-07 北师香港浸会大学 统计学（本科）
统计与分析课：数据挖掘、时间序列分析
实习经验
2024-06 ~ 2024-08 示例科技有限公司 数据分析
历史项目分析与报表制作。
2026-06 ~ 至今 示例证券 业务运营实习生|数据分析方向
客户需求分析与活动效果复盘。
项目经历
用户行为分析项目
`;
const layoutResult = sandbox.ResumeParser.extractProfileFromText(layoutText);
assert.equal(layoutResult.profile.fullName, "李小明");
assert.equal(layoutResult.profile.gender, "男");
assert.equal(layoutResult.profile.phone, "13900000000");
assert.equal(layoutResult.profile.email, "xiaoming@example.com");
assert.equal(layoutResult.profile.desiredTitle, "数据分析/数据运营");
assert.equal(layoutResult.profile.school, "示例理工大学");
assert.equal(layoutResult.profile.degree, "硕士");
assert.equal(layoutResult.profile.major, "医疗数据科学");
assert.equal(layoutResult.profile.educationStart, "2025-09-01");
assert.equal(layoutResult.profile.educationEnd, "2027-01-01");
assert.equal(layoutResult.educationExperiences.length, 2);
assert.equal(layoutResult.educationExperiences[0].school, "示例理工大学");
assert.equal(layoutResult.educationExperiences[0].major, "医疗数据科学");
assert.equal(layoutResult.educationExperiences[0].degree, "硕士");
assert.equal(layoutResult.educationExperiences[1].school, "北师香港浸会大学");
assert.equal(layoutResult.educationExperiences[1].major, "统计学");
assert.equal(layoutResult.educationExperiences[1].degree, "本科");
assert.match(layoutResult.educationExperiences[0].description, /医疗数据挖掘/);
assert.match(layoutResult.educationExperiences[1].description, /时间序列分析/);
assert.equal(layoutResult.profile.latestCompany, "示例证券");
assert.match(layoutResult.profile.latestJobTitle, /业务运营实习生/);
assert.equal(layoutResult.profile.workStart, "2026-06-01");
assert.match(layoutResult.profile.workDescription, /客户需求分析/);
assert.equal(layoutResult.workExperiences.length, 2);
assert.equal(layoutResult.workExperiences[0].company, "示例证券");
assert.equal(layoutResult.workExperiences[1].company, "示例科技有限公司");
assert.equal(layoutResult.workExperiences[0].category, "internship");
assert.equal(layoutResult.workExperiences[1].category, "internship");

console.log("PARSER_OK");
