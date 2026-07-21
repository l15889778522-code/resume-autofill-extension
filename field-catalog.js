(function (root) {
  "use strict";

  const fields = [
    { key: "fullName", label: "姓名", group: "基本信息", aliases: ["姓名", "真实姓名", "中文名", "full name", "fullname", "candidate name", "applicant name"] },
    { key: "englishName", label: "英文名", group: "基本信息", aliases: ["英文名", "english name", "preferred name"] },
    { key: "phone", label: "手机号码", group: "基本信息", inputMode: "tel", aliases: ["手机号", "手机号码", "联系电话", "电话", "mobile", "mobile phone", "phone number", "telephone"] },
    { key: "email", label: "电子邮箱", group: "基本信息", inputMode: "email", aliases: ["邮箱", "电子邮箱", "邮件地址", "email", "e-mail"] },
    { key: "gender", label: "性别", group: "基本信息", type: "select", aliases: ["性别", "gender", "sex"] },
    { key: "birthDate", label: "出生日期", group: "基本信息", type: "date", aliases: ["出生日期", "出生年月", "生日", "date of birth", "birth date", "birthday"] },
    { key: "city", label: "现居城市", group: "基本信息", aliases: ["现居城市", "当前城市", "居住城市", "所在城市", "现居地", "current city", "city of residence"] },
    { key: "address", label: "详细地址", group: "基本信息", aliases: ["详细地址", "居住地址", "联系地址", "通讯地址", "address", "home address", "mailing address"] },
    { key: "hometown", label: "籍贯", group: "基本信息", aliases: ["籍贯", "户籍所在地", "户口所在地", "native place", "hometown"] },
    { key: "nationality", label: "国籍/民族", group: "基本信息", aliases: ["国籍", "民族", "nationality", "ethnicity"] },
    { key: "workYears", label: "工作年限", group: "求职信息", type: "number", aliases: ["工作年限", "工作经验", "从业年限", "years of experience", "work experience"] },
    { key: "desiredTitle", label: "期望职位", group: "求职信息", aliases: ["期望职位", "意向职位", "目标职位", "求职意向", "desired position", "desired role", "target position"] },
    { key: "desiredCity", label: "期望城市", group: "求职信息", aliases: ["期望城市", "意向城市", "工作地点", "期望工作地点", "desired city", "preferred location"] },
    { key: "expectedSalary", label: "期望薪资", group: "求职信息", aliases: ["期望薪资", "期望月薪", "薪资要求", "desired salary", "expected salary", "salary expectation"] },
    { key: "availableDate", label: "到岗日期", group: "求职信息", type: "date", aliases: ["到岗日期", "可到岗时间", "入职时间", "available date", "available start date", "availability"] },
    { key: "school", label: "最近学校", group: "教育经历", aliases: ["学校名称", "毕业院校", "院校名称", "学校", "school name", "university", "college"] },
    { key: "department", label: "院系", group: "教育经历", aliases: ["院系", "院系名称", "学院名称", "所属学院", "所属院系", "department", "faculty", "school/department"] },
    { key: "degree", label: "最高学历", group: "教育经历", type: "select", aliases: ["最高学历", "学历", "学位", "degree", "education level", "highest education"] },
    { key: "major", label: "专业", group: "教育经历", aliases: ["专业名称", "所学专业", "专业", "major", "field of study"] },
    { key: "educationStart", label: "教育开始日期", group: "教育经历", type: "date", aliases: ["入学时间", "教育开始时间", "education start", "school start"] },
    { key: "educationEnd", label: "教育结束日期", group: "教育经历", type: "date", aliases: ["毕业时间", "教育结束时间", "education end", "graduation date"] },
    { key: "latestCompany", label: "最近公司", group: "最近工作经历（自动同步）", aliases: ["公司名称", "单位名称", "雇主", "company name", "employer", "organization"] },
    { key: "latestJobTitle", label: "最近职位", group: "最近工作经历（自动同步）", aliases: ["职位名称", "岗位名称", "职务", "job title", "position title", "role title"] },
    { key: "workStart", label: "工作开始日期", group: "最近工作经历（自动同步）", type: "date", aliases: ["工作开始时间", "任职开始时间", "employment start", "work start"] },
    { key: "workEnd", label: "工作结束日期", group: "最近工作经历（自动同步）", type: "date", aliases: ["工作结束时间", "离职时间", "employment end", "work end"] },
    { key: "workDescription", label: "工作描述", group: "最近工作经历（自动同步）", type: "textarea", aliases: ["工作描述", "工作内容", "岗位职责", "主要职责", "work description", "responsibilities"] },
    { key: "website", label: "个人网站", group: "链接与简介", aliases: ["个人网站", "个人主页", "作品集", "portfolio", "personal website", "website"] },
    { key: "github", label: "GitHub", group: "链接与简介", aliases: ["github", "github url", "github profile"] },
    { key: "linkedin", label: "LinkedIn", group: "链接与简介", aliases: ["linkedin", "linkedin url", "linkedin profile"] },
    { key: "summary", label: "个人简介", group: "链接与简介", type: "textarea", aliases: ["个人简介", "自我评价", "个人总结", "职业概述", "summary", "professional summary", "about me"] },
    { key: "idNumber", label: "证件号码（敏感）", group: "敏感信息", sensitive: true, aliases: ["身份证号", "证件号码", "身份证号码", "id number", "identity number", "passport number"] }
  ];

  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));
  root.ResumeFieldCatalog = { fields, byKey };
})(typeof globalThis !== "undefined" ? globalThis : window);
