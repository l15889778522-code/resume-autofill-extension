"use strict";

importScripts("ai-agent.js");

chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {
  // Older Chromium versions do not expose this hardening API.
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AI_PLAN_MAPPINGS") return false;
  (async () => {
    try {
      const stored = await chrome.storage.local.get(["aiSettings"]);
      const settings = globalThis.ResumeAiAgent.normalizeSettings(stored.aiSettings);
      const sources = (message.sources || []).map((source) => {
        if (settings.shareResumeData) return source;
        const { value: _discardedValue, ...metadata } = source;
        return metadata;
      });
      const assignments = await globalThis.ResumeAiAgent.planMappings({
        settings,
        candidates: message.candidates || [],
        sources,
        pageContext: message.pageContext || {}
      });
      sendResponse({ ok: true, assignments });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();
  return true;
});
