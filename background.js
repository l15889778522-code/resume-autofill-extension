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
      const assignments = await globalThis.ResumeAiAgent.planMappings({
        settings: stored.aiSettings,
        candidates: message.candidates || [],
        sources: message.sources || [],
        pageContext: message.pageContext || {}
      });
      sendResponse({ ok: true, assignments });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();
  return true;
});
