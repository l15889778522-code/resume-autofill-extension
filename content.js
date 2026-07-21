(function () {
  "use strict";

  if (globalThis.__resumeAutofillLoaded) return;
  globalThis.__resumeAutofillLoaded = true;

  const catalog = globalThis.ResumeFieldCatalog;
  const markerAttribute = "data-resume-autofill-id";
  const supportedSelector = [
    "input:not([type=hidden]):not([type=password]):not([type=file]):not([type=submit]):not([type=button]):not([type=reset])",
    "textarea",
    "select",
    "[contenteditable=true]",
    "[role=combobox]"
  ].join(",");

  function normalize(value) {
    return String(value || "")
      .toLocaleLowerCase()
      .normalize("NFKC")
      .replace(/[\s\-_:：/\\()（）\[\]【】*·.，,?？]/g, "");
  }

  function editSimilarity(left, right) {
    const a = normalize(left);
    const b = normalize(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return 1 - previous[b.length] / Math.max(a.length, b.length);
  }

  function bigramSimilarity(left, right) {
    const makeBigrams = (value) => {
      const normalized = normalize(value);
      if (normalized.length < 2) return [normalized];
      return Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2));
    };
    const a = makeBigrams(left);
    const b = makeBigrams(right);
    const remaining = [...b];
    let overlap = 0;
    for (const gram of a) {
      const index = remaining.indexOf(gram);
      if (index >= 0) {
        overlap += 1;
        remaining.splice(index, 1);
      }
    }
    return a.length + b.length ? (2 * overlap) / (a.length + b.length) : 0;
  }

  function fuzzySimilarity(left, right) {
    return Math.max(editSimilarity(left, right), bigramSimilarity(left, right));
  }

  function visible(element) {
    if (!element || element.disabled || element.readOnly) return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && box.width > 2 && box.height > 2;
  }

  function textOf(element) {
    return (element?.innerText || element?.textContent || "").trim();
  }

  function labelFor(element) {
    const labels = [];
    if (element.labels) labels.push(...Array.from(element.labels).map(textOf));
    const wrappingLabel = element.closest("label");
    if (wrappingLabel) labels.push(textOf(wrappingLabel));
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => labels.push(textOf(document.getElementById(id))));
    }
    const fieldset = element.closest("fieldset");
    if (fieldset) labels.push(textOf(fieldset.querySelector("legend")));
    const previous = element.previousElementSibling;
    if (previous && ["LABEL", "SPAN", "DIV", "P"].includes(previous.tagName)) {
      const nearby = textOf(previous);
      if (nearby.length <= 40) labels.push(nearby);
    }
    return [...new Set(labels.filter(Boolean))].join(" ").slice(0, 160);
  }

  function describe(element) {
    return {
      label: labelFor(element),
      aria: element.getAttribute("aria-label") || "",
      placeholder: element.getAttribute("placeholder") || "",
      name: element.getAttribute("name") || "",
      id: element.id || ""
    };
  }

  function sectionFor(element) {
    const parts = [];
    const fieldset = element.closest("fieldset");
    if (fieldset) parts.push(textOf(fieldset.querySelector("legend")));
    const container = element.closest("section, article, [role=group], .form-section, .form-group, .form-item, .ant-form-item, .el-form-item");
    if (container) {
      const heading = container.querySelector("h1, h2, h3, h4, [role=heading], .section-title, .form-title");
      if (heading && !heading.contains(element)) parts.push(textOf(heading));
    }
    let cursor = element.parentElement;
    let foundHeading = false;
    for (let depth = 0; cursor && depth < 4; depth += 1, cursor = cursor.parentElement) {
      let sibling = cursor.previousElementSibling;
      while (sibling) {
        if (/^H[1-4]$/.test(sibling.tagName) || sibling.getAttribute("role") === "heading") {
          parts.push(textOf(sibling));
          foundHeading = true;
          break;
        }
        sibling = sibling.previousElementSibling;
      }
      if (foundHeading) break;
    }
    return [...new Set(parts.filter((part) => part && part.length <= 100))].join(" · ").slice(0, 180);
  }

  function optionsFor(element) {
    if (element instanceof HTMLSelectElement) return Array.from(element.options).map((option) => option.text.trim()).filter(Boolean).slice(0, 80);
    if (element.type === "radio") {
      const group = element.name ? Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(element.name)}"]`)) : [element];
      return group.map((item) => labelFor(item) || item.value).filter(Boolean).slice(0, 80);
    }
    const controlledId = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
    const controlled = controlledId ? document.getElementById(controlledId) : null;
    return controlled ? Array.from(controlled.querySelectorAll('[role="option"]')).map(textOf).filter(Boolean).slice(0, 80) : [];
  }

  function scoreAlias(descriptor, alias) {
    const needle = normalize(alias);
    if (!needle) return 0;
    const weighted = [
      [descriptor.label, 96, 64, 82],
      [descriptor.aria, 92, 60, 80],
      [descriptor.placeholder, 82, 54, 76],
      [descriptor.name, 86, 50, 74],
      [descriptor.id, 82, 48, 72]
    ];
    let best = 0;
    for (const [raw, exact, contains, fuzzyMaximum] of weighted) {
      const haystack = normalize(raw);
      if (!haystack) continue;
      if (haystack === needle) best = Math.max(best, exact);
      else if (haystack.includes(needle)) best = Math.max(best, contains + Math.min(12, needle.length));
      else if (haystack.length >= 4 && needle.length >= 4) {
        const similarity = fuzzySimilarity(haystack, needle);
        if (similarity >= 0.72) {
          best = Math.max(best, Math.round((0.45 + 0.55 * similarity) * fuzzyMaximum));
        }
      }
    }
    return best;
  }

  function bestMatch(element, descriptor, siteRule) {
    if (siteRule && catalog.byKey[siteRule]) return { key: siteRule, score: 120 };
    let result = { key: "", score: 0 };
    for (const field of catalog.fields) {
      for (const alias of field.aliases) {
        const score = scoreAlias(descriptor, alias);
        if (score > result.score) result = { key: field.key, score };
      }
    }
    const inputType = (element.getAttribute("type") || "").toLowerCase();
    if (inputType === "email" && result.score < 88) result = { key: "email", score: 88 };
    if (inputType === "tel" && result.score < 88) result = { key: "phone", score: 88 };
    return result;
  }

  function questionKey(descriptor) {
    const identity = descriptor.label || descriptor.aria || descriptor.placeholder || descriptor.name || descriptor.id;
    return normalize(identity).slice(0, 140);
  }

  function bestLearnedMatch(key, learnedAnswers, forcedKey) {
    if (forcedKey && learnedAnswers?.[forcedKey]) return { key: forcedKey, score: 120 };
    if (learnedAnswers?.[key]) return { key, score: 112 };
    if (!key || key.length < 4) return { key: "", score: 0 };
    let best = { key: "", score: 0 };
    for (const candidateKey of Object.keys(learnedAnswers || {})) {
      if (candidateKey.length < 4) continue;
      const similarity = fuzzySimilarity(key, candidateKey);
      if (similarity < 0.78) continue;
      const score = Math.min(87, Math.round(50 + similarity * 40));
      if (score > best.score) best = { key: candidateKey, score };
    }
    return best;
  }

  function signature(element, descriptor) {
    const type = element.getAttribute("type") || element.tagName.toLowerCase();
    return `${element.tagName.toLowerCase()}:${type}:${questionKey(descriptor)}`.slice(0, 180);
  }

  function currentValue(element) {
    if (element.type === "radio") {
      if (!element.name) return element.checked ? element.value : "";
      return document.querySelector(`input[type=radio][name="${CSS.escape(element.name)}"]:checked`)?.value || "";
    }
    if (element.type === "checkbox") return element.checked ? element.value : "";
    if (element.isContentEditable) return textOf(element);
    if (element.getAttribute("role") === "combobox" && !("value" in element)) {
      const value = element.getAttribute("aria-valuetext") || textOf(element);
      return /^(请选择|选择|select|please select)$/i.test(String(value).trim()) ? "" : value;
    }
    return element.value || "";
  }

  function capturedValue(element) {
    if (element instanceof HTMLSelectElement) {
      const option = element.selectedOptions[0];
      return option && option.value ? (option.text.trim() || option.value) : "";
    }
    if (element.type === "radio") {
      const group = element.name
        ? Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(element.name)}"]`))
        : [element];
      const selected = group.find((item) => item.checked);
      return selected ? (labelFor(selected) || selected.value) : "";
    }
    return currentValue(element);
  }

  function isSensitive(descriptor, field) {
    if (field?.sensitive) return true;
    const text = normalize(Object.values(descriptor).join(" "));
    return ["身份证", "证件号", "护照号", "idnumber", "identitynumber", "passportnumber", "银行卡", "bankcard", "creditcard"]
      .some((token) => text.includes(normalize(token)));
  }

  function scan(profile, siteRules, learnedAnswers) {
    const radioGroups = new Set();
    const workOccurrences = {};
    const candidates = [];
    for (const element of document.querySelectorAll(supportedSelector)) {
      if (!visible(element)) continue;
      if (element.type === "checkbox") continue;
      if (element.type === "radio") {
        const groupName = element.name || element.id;
        if (radioGroups.has(groupName)) continue;
        radioGroups.add(groupName);
      }
      const descriptor = describe(element);
      const fieldSignature = signature(element, descriptor);
      const savedRule = siteRules?.[fieldSignature] || "";
      const profileRule = savedRule.startsWith("profile:") ? savedRule.slice(8) : (catalog.byKey[savedRule] ? savedRule : "");
      const learnedRule = savedRule.startsWith("learned:") ? savedRule.slice(8) : "";
      const match = bestMatch(element, descriptor, profileRule);
      const matched = match.score >= 48;
      const field = matched ? catalog.byKey[match.key] : null;
      const profileValue = field && !learnedRule ? String(profile?.[match.key] || "").trim() : "";
      const naturalQuestionKey = questionKey(descriptor);
      const learnedMatch = bestLearnedMatch(naturalQuestionKey, learnedAnswers, learnedRule);
      const learnedKey = learnedMatch.key;
      const learnedAnswer = learnedKey ? learnedAnswers[learnedKey] : null;
      // Keep labelled but unknown controls in the preview so a user can map or
      // teach a new site-specific question without silent page collection.
      if (!naturalQuestionKey) continue;
      let elementId = element.getAttribute(markerAttribute);
      if (!elementId) {
        elementId = crypto.randomUUID();
        element.setAttribute(markerAttribute, elementId);
      }
      const workKeys = new Set(["latestCompany", "latestJobTitle", "workStart", "workEnd", "workDescription"]);
      const occurrenceKey = profileValue && workKeys.has(match.key) ? match.key : "";
      const repeatIndex = occurrenceKey ? (workOccurrences[occurrenceKey] || 0) : 0;
      if (occurrenceKey) workOccurrences[occurrenceKey] = repeatIndex + 1;
      candidates.push({
        elementId,
        signature: fieldSignature,
        label: descriptor.label || descriptor.aria || descriptor.placeholder || descriptor.name || descriptor.id || "未命名字段",
        section: sectionFor(element),
        tag: element.tagName.toLowerCase(),
        inputType: element.getAttribute("type") || "",
        required: element.required || element.getAttribute("aria-required") === "true",
        options: optionsFor(element),
        questionKey: naturalQuestionKey,
        matchedKey: profileValue ? match.key : "",
        learnedKey: profileValue ? "" : learnedKey,
        preferredSourceRef: savedRule.startsWith("experience:") ? savedRule : "",
        repeatIndex,
        score: match.score,
        confidence: profileValue ? match.score : learnedMatch.score,
        currentValue: currentValue(element),
        sensitive: isSensitive(descriptor, profileValue ? field : learnedAnswer)
      });
    }
    return candidates;
  }

  function capture(profile) {
    const radioGroups = new Set();
    const captured = [];
    for (const element of document.querySelectorAll(supportedSelector)) {
      if (!visible(element) || element.type === "checkbox") continue;
      if (element.type === "radio") {
        const groupName = element.name || element.id;
        if (radioGroups.has(groupName)) continue;
        radioGroups.add(groupName);
      }
      const descriptor = describe(element);
      const key = questionKey(descriptor);
      const value = String(capturedValue(element) || "").trim();
      if (!key || !value) continue;
      const match = bestMatch(element, descriptor, "");
      const field = match.score >= 48 ? catalog.byKey[match.key] : null;
      captured.push({
        signature: signature(element, descriptor),
        questionKey: key,
        label: descriptor.label || descriptor.aria || descriptor.placeholder || descriptor.name || descriptor.id,
        value,
        matchedKey: field?.key || "",
        sensitive: isSensitive(descriptor, field)
      });
    }
    return captured;
  }

  function nativeSetValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  function variants(value) {
    const normalized = normalize(value);
    const groups = [
      ["男", "male", "man", "m"],
      ["女", "female", "woman", "f"],
      ["博士", "phd", "doctor"],
      ["硕士", "master", "masters"],
      ["本科", "bachelor", "undergraduate"],
      ["大专", "专科", "associate", "college"],
      ["高中", "highschool"]
    ].map((group) => group.map(normalize));
    const matched = groups.find((group) => group.includes(normalized));
    return new Set(matched || [normalized]);
  }

  function fillSelect(element, value) {
    const wanted = variants(value);
    const options = Array.from(element.options);
    const option = options.find((item) => wanted.has(normalize(item.value)) || wanted.has(normalize(item.text))) ||
      options.find((item) => Array.from(wanted).some((token) => normalize(item.text).includes(token)));
    if (!option) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(element, option.value);
    else element.value = option.value;
    return true;
  }

  function fillRadio(element, value) {
    const wanted = variants(value);
    const group = element.name
      ? Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(element.name)}"]`))
      : [element];
    const choice = group.find((item) => {
      const label = labelFor(item);
      return wanted.has(normalize(item.value)) || wanted.has(normalize(label));
    });
    if (!choice) return false;
    choice.click();
    return true;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fillCombobox(element, value) {
    const wanted = variants(value);
    element.focus();
    element.click();
    await wait(120);
    const controlledId = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
    const controlled = controlledId ? document.getElementById(controlledId) : null;
    const optionRoot = controlled || document;
    const options = Array.from(optionRoot.querySelectorAll('[role="option"]')).filter((option) => {
      const style = getComputedStyle(option);
      const box = option.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 1 && box.height > 1;
    });
    const choice = options.find((option) => wanted.has(normalize(option.getAttribute("data-value"))) || wanted.has(normalize(textOf(option)))) ||
      options.find((option) => Array.from(wanted).some((token) => normalize(textOf(option)).includes(token)));
    if (choice) {
      choice.click();
      return true;
    }
    if (element instanceof HTMLInputElement) {
      nativeSetValue(element, value);
      return true;
    }
    return false;
  }

  async function fillOne(element, value) {
    let changed = false;
    if (element.getAttribute("role") === "combobox" && !(element instanceof HTMLSelectElement)) changed = await fillCombobox(element, value);
    else if (element instanceof HTMLSelectElement) changed = fillSelect(element, value);
    else if (element.type === "radio") changed = fillRadio(element, value);
    else if (element.isContentEditable) {
      element.focus();
      element.textContent = value;
      changed = true;
    } else {
      nativeSetValue(element, value);
      changed = true;
    }
    if (changed) {
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      element.style.outline = "2px solid #2d7a59";
      element.style.outlineOffset = "2px";
      setTimeout(() => {
        element.style.outline = "";
        element.style.outlineOffset = "";
      }, 1800);
    }
    return changed;
  }

  async function fill(selections) {
    let filled = 0;
    const failed = [];
    for (const selection of selections) {
      const element = document.querySelector(`[${markerAttribute}="${CSS.escape(selection.elementId)}"]`);
      if (!element || !visible(element) || !(await fillOne(element, String(selection.value || "")))) {
        failed.push(selection.label || selection.key);
      } else {
        filled += 1;
      }
    }
    return { filled, failed };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "RESUME_FILL") {
      fill(message.selections || [])
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    try {
      if (message.type === "RESUME_SCAN") sendResponse({
        ok: true,
        candidates: scan(message.profile, message.siteRules, message.learnedAnswers),
        pageContext: { language: document.documentElement.lang || navigator.language || "" }
      });
      else if (message.type === "RESUME_CAPTURE") sendResponse({ ok: true, captured: capture(message.profile || {}) });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
    return false;
  });
})();
