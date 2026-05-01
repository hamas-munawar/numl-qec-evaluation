/**
 * @module controller
 * Popup entry-point — wires UI buttons to the automation engine.
 *
 * Button map:
 *   fill-t      → fill teacher form (current tab)
 *   sub-t       → fill & submit teacher form (current tab)
 *   sub-all-t   → fill & submit ALL teacher forms (navigate + fill each)
 *   fill-s      → fill course form (current tab)
 *   sub-s       → fill & submit course form (current tab)
 *   sub-all-s   → fill & submit ALL course forms (navigate + fill each)
 *   fill-all    → fill & submit ALL forms (teachers + courses)
 */

import { RATING_MAP, TEACHER_CONFIG, SUBJECT_CONFIG } from "./data/config.js";
import { automationEngine, findFormUrls } from "./engine/automation.js";
import { addStep, clearLog } from "./ui/logger.js";

// ── DOM refs ──────────────────────────────────────────────────────────────
const logEl        = document.getElementById("log");
const statusDot    = document.getElementById("status-dot");
const ratingSelect = document.getElementById("rating-selector");
const allBtns      = document.querySelectorAll(".btn");

// ── Shared helpers ────────────────────────────────────────────────────────

function setEnabled(enabled) {
  allBtns.forEach((b) => (b.disabled = !enabled));
}

function setStatus(state) {               // 'running' | 'ok' | 'err' | ''
  statusDot.className = `log-status-dot ${state}`;
}

function getTarget() {
  const key = ratingSelect.value;
  return { key, value: RATING_MAP[key] };
}

// ── Single-form: fill current tab ─────────────────────────────────────────

async function runOnCurrentTab(type, submit) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { key, value } = getTarget();
  const config = type === "teacher" ? TEACHER_CONFIG : SUBJECT_CONFIG;
  const label  = type === "teacher" ? "Teacher" : "Course";

  setEnabled(false);
  clearLog(logEl);
  setStatus("running");
  addStep(logEl, `Scanning ${label} form on current page…`, "info");

  try {
    const [{ result: status }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automationEngine,
      args: [config, value, submit],
      world: "MAIN",
    });

    if (status.success) {
      addStep(logEl, `Rating set to "${key}"`);
      addStep(logEl, "Feedback comments written to all fields");
      addStep(logEl, status.submitted ? "Form submitted successfully." : "Form filled — ready to review.");
      setStatus("ok");
    } else {
      addStep(logEl, status.msg, "error");
      setStatus("err");
    }
  } catch {
    addStep(logEl, "Error: Navigate to the evaluation form first.", "error");
    setStatus("err");
  } finally {
    setEnabled(true);
  }
}

// ── Multi-form: navigate and fill each matching form ──────────────────────

function navigateAndFill(tabId, url, config, targetValue, submit) {
  return new Promise((resolve, reject) => {
    let handled = false;

    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Navigation timed out after 30s"));
    }, 30_000);

    function onUpdated(id, changeInfo) {
      if (id !== tabId || changeInfo.status !== "complete" || handled) return;
      handled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);

      // 1 s delay — let portal JS fully initialize before injecting
      setTimeout(async () => {
        try {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: automationEngine,
            args: [config, targetValue, submit],
            world: "MAIN",
          });
          resolve(result);
        } catch (e) {
          reject(e);
        }
      }, 1000);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(tabId, { url });
  });
}

async function runAll(scope) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { key, value } = getTarget();

  setEnabled(false);
  clearLog(logEl);
  setStatus("running");
  addStep(logEl, "Searching for evaluation form links in sidebar…", "info");

  try {
    const [{ result: urls }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findFormUrls,
      world: "MAIN",
    });

    if (!urls?.length) {
      addStep(logEl, "No form links found — navigate to the portal dashboard first.", "error");
      setStatus("err");
      return;
    }

    const queue = [];
    if (scope === "teacher" || scope === "all") {
      urls
        .filter((u) => u.toLowerCase().includes("teacherevaluation"))
        .forEach((url) => queue.push({ url, label: "Teacher", config: TEACHER_CONFIG }));
    }
    if (scope === "subject" || scope === "all") {
      urls
        .filter((u) => u.toLowerCase().includes("courseevaluation"))
        .forEach((url) => queue.push({ url, label: "Course", config: SUBJECT_CONFIG }));
    }

    if (!queue.length) {
      addStep(logEl, "No matching evaluation links found in the sidebar.", "error");
      setStatus("err");
      return;
    }

    addStep(logEl, `Found ${queue.length} form(s). Rating: "${key}". Starting…`, "info");

    let hasError = false;
    for (let i = 0; i < queue.length; i++) {
      const { url, label, config } = queue[i];
      addStep(logEl, `[${i + 1}/${queue.length}] Navigating to ${label} form…`, "info");

      const status = await navigateAndFill(tab.id, url, config, value, true);

      if (status?.success) {
        addStep(logEl, `${label}: ${status.submitted ? "submitted ✓" : "filled ✓"}`);
      } else {
        addStep(logEl, `${label}: ${status?.msg ?? "failed"}`, "error");
        hasError = true;
      }
    }

    addStep(logEl, `All ${queue.length} evaluation(s) complete.`);
    setStatus(hasError ? "err" : "ok");

  } catch (e) {
    addStep(logEl, `Error: ${e.message}`, "error");
    setStatus("err");
  } finally {
    setEnabled(true);
  }
}

// ── Event bindings ────────────────────────────────────────────────────────
document.getElementById("fill-t")    .addEventListener("click", () => runOnCurrentTab("teacher", false));
document.getElementById("sub-t")     .addEventListener("click", () => runOnCurrentTab("teacher", true));
document.getElementById("sub-all-t") .addEventListener("click", () => runAll("teacher"));

document.getElementById("fill-s")    .addEventListener("click", () => runOnCurrentTab("subject", false));
document.getElementById("sub-s")     .addEventListener("click", () => runOnCurrentTab("subject", true));
document.getElementById("sub-all-s") .addEventListener("click", () => runAll("subject"));

document.getElementById("fill-all")  .addEventListener("click", () => runAll("all"));
