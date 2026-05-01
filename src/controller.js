/**
 * @module controller
 * Popup entry-point — wires UI buttons to the automation engine.
 *
 * "Submit All" flow (per type):
 *   1. Navigate to the form page (via sidebar link)
 *   2. Read ALL options from the DDLTeachers / DDLCourses dropdown
 *   3. For each option:
 *      a. Select it  →  ASP.NET PostBack reloads the page
 *      b. Wait for page to be fully loaded
 *      c. Fill (and optionally submit) via automationEngine
 *      d. If submitted, wait for the submission PostBack to settle
 *      e. Next option
 */

import { RATING_MAP, TEACHER_CONFIG, SUBJECT_CONFIG } from "./data/config.js";
import {
  automationEngine,
  findFormUrls,
  findEvalDropdown,
  selectDropdownOption,
} from "./engine/automation.js";
import { addStep, clearLog } from "./ui/logger.js";
import { DEV_MODE } from "./config/env.js";

// ── DOM refs ──────────────────────────────────────────────────────────────
const logEl        = document.getElementById("log");
const statusDot    = document.getElementById("status-dot");
const ratingSelect = document.getElementById("rating-selector");
const allBtns      = document.querySelectorAll(".btn");

// ── Dev mode banner ───────────────────────────────────────────────────────
if (DEV_MODE) {
  const banner = document.getElementById("dev-banner");
  banner.style.display = "flex";
}

// ── Helpers ───────────────────────────────────────────────────────────────

function setEnabled(on) { allBtns.forEach((b) => (b.disabled = !on)); }

function setStatus(s)   { statusDot.className = `log-status-dot ${s}`; }

function getTarget()    { const k = ratingSelect.value; return { key: k, value: RATING_MAP[k] }; }

/** In DEV_MODE any submit intent is silently downgraded to fill-only. */
function canSubmit(intended) { return intended && !DEV_MODE; }

/**
 * Waits for the active tab to fire loading → complete.
 * Resolves on timeout so the loop always continues.
 */
function waitForReload(tabId, timeout = 20_000) {
  return new Promise((resolve) => {
    let loading = false;
    let done    = false;

    // Hard timeout for the entire process
    const timer = setTimeout(() => {
      done = true;
      clearTimeout(loadStartTimer);
      chrome.tabs.onUpdated.removeListener(fn);
      resolve();
    }, timeout);

    // Initial timeout: if it doesn't start loading in 3s, assume no reload
    const loadStartTimer = setTimeout(() => {
      if (!loading && !done) {
        done = true;
        chrome.tabs.onUpdated.removeListener(fn);
        clearTimeout(timer);
        resolve();
      }
    }, 3000);

    function fn(id, info) {
      if (id !== tabId || done) return;
      if (info.status === "loading") {
        loading = true;
        clearTimeout(loadStartTimer);
      }
      if (info.status === "complete" && loading) {
        done = true;
        chrome.tabs.onUpdated.removeListener(fn);
        clearTimeout(timer);
        setTimeout(resolve, 50); // minimal buffer
      }
    }

    chrome.tabs.onUpdated.addListener(fn);
  });
}

/** Navigate the tab to `url` and wait for full load. */
function navigateTo(tabId, url) {
  const p = waitForReload(tabId, 30_000);
  chrome.tabs.update(tabId, { url });
  return p;
}

// ── Single-form: fill current tab ─────────────────────────────────────────

async function runOnCurrentTab(type, submit) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { key, value } = getTarget();
  const config  = type === "teacher" ? TEACHER_CONFIG : SUBJECT_CONFIG;
  const label   = type === "teacher" ? "Teacher" : "Course";
  const doSubmit = canSubmit(submit);

  setEnabled(false);
  clearLog(logEl);
  setStatus("running");
  addStep(logEl, `Scanning ${label} form on current page…`, "info");
  if (DEV_MODE && submit) addStep(logEl, "DEV MODE — submission skipped", "info");

  try {
    const [{ result: status }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automationEngine,
      args: [config, value, doSubmit],
      world: "MAIN",
    });

    if (status.success) {
      addStep(logEl, `Rating set to "${key}"`);
      addStep(logEl, "Feedback comments written");
      addStep(logEl, status.submitted ? "Form submitted ✓" : "Form filled — review and save manually.");
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

// ── Dropdown iteration: fill every option on current form page ─────────────

/**
 * Reads the DDLTeachers / DDLCourses dropdown, iterates every option,
 * triggers the ASP.NET PostBack for each, fills, and (if requested) submits.
 */
async function iterateDropdown(tabId, config, value, submit) {
  // 1. Read dropdown options
  const [{ result: dropdown }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: findEvalDropdown,
    world: "MAIN",
  });

  if (!dropdown?.options?.length) {
    return { found: false };
  }

  // Filter out placeholder / empty options
  // e.g. value="" | "0" | text starting with "--" or "Select"
  const isPlaceholder = ({ value: v, text: t }) =>
    !v || v === "0" || t.trim() === "" ||
    /^[-\u2013\u2014\s]/.test(t.trim()) || /^select/i.test(t.trim());

  const opts = dropdown.options.filter((o) => !isPlaceholder(o));

  if (!opts.length) {
    addStep(logEl, "No valid items found — all appear to be placeholders.", "info");
    return { found: true, total: 0, errors: 0, skipped: dropdown.options.length };
  }

  addStep(logEl, `Found ${opts.length} item(s) to process.`, "info");

  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < opts.length; i++) {
    const { value: optVal, text } = opts[i];
    const short = text.length > 40 ? text.slice(0, 37) + "…" : text;

    addStep(logEl, `[${i + 1}/${opts.length}] ${short}`, "info");

    try {
      // 2. Set up reload watcher BEFORE triggering PostBack
      const reloadAfterSelect = waitForReload(tabId);

      const [{ result: didSelect }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: selectDropdownOption,
        args: [optVal],
        world: "MAIN",
      });

      if (didSelect === false) {
        addStep(logEl, `${short}: dropdown selection failed — skipping.`, "error");
        errors++;
        continue;
      }
      await reloadAfterSelect;
    } catch (e) {
      addStep(logEl, `${short}: navigation error — skipping.`, "error");
      errors++;
      continue;
    }

    // 3. Fill (and optionally submit)
    const reloadAfterSubmit = submit ? waitForReload(tabId) : Promise.resolve();

    let status;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: automationEngine,
        args: [config, value, submit],
        world: "MAIN",
      });
      status = result;
    } catch {
      addStep(logEl, `${short}: injection failed — skipped.`, "info");
      skipped++;
      continue;
    }

    if (submit && status?.submitted) await reloadAfterSubmit;

    if (status?.success) {
      addStep(logEl, `${short}: ${status.submitted ? "submitted ✓" : "filled ✓"}`);
    } else {
      // "Form not found" = no radio buttons on page = soft skip, not a crash
      if (status?.msg?.toLowerCase().includes("not found")) {
        addStep(logEl, `${short}: no form loaded — skipped.`, "info");
        skipped++;
      } else {
        addStep(logEl, `${short}: ${status?.msg ?? "failed"}`, "error");
        errors++;
      }
    }
  }

  return { found: true, total: opts.length, errors, skipped };
}

// ── Main orchestrator ─────────────────────────────────────────────────────

async function runAll(scope) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { key, value } = getTarget();
  const doSubmit = canSubmit(true);

  setEnabled(false);
  clearLog(logEl);
  setStatus("running");

  if (DEV_MODE) addStep(logEl, "DEV MODE — forms will be filled but not submitted", "info");

  try {
    // Get sidebar URLs for navigation
    const [{ result: sidebarUrls }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findFormUrls,
      world: "MAIN",
    });

    if (!sidebarUrls || sidebarUrls.length === 0) {
      addStep(logEl, "Could not find evaluation links. Please navigate to the QEC Portal first.", "error");
      setStatus("err");
      return;
    }

    const tasks = [];
    if (scope === "teacher" || scope === "all") {
      const url = (sidebarUrls ?? []).find((u) => u.toLowerCase().includes("teacherevaluation"));
      tasks.push({ url, config: TEACHER_CONFIG, label: "Teacher" });
    }
    if (scope === "subject" || scope === "all") {
      const url = (sidebarUrls ?? []).find((u) => u.toLowerCase().includes("courseevaluation"));
      tasks.push({ url, config: SUBJECT_CONFIG, label: "Course" });
    }

    let grandTotal = 0;
    let grandSkipped = 0;
    let grandErrors = 0;

    for (const task of tasks) {
      // Navigate to the form page if we have its URL
      if (task.url) {
        addStep(logEl, `Navigating to ${task.label} evaluation page…`, "info");
        await navigateTo(tab.id, task.url);
      }

      addStep(logEl, `Reading ${task.label} dropdown…`, "info");

      const result = await iterateDropdown(tab.id, task.config, value, doSubmit);

      if (!result.found) {
        addStep(logEl, `No dropdown found on ${task.label} page.`, "error");
        setStatus("err");
      } else {
        grandTotal += result.total;
        grandSkipped += (result.skipped || 0);
        grandErrors += (result.errors || 0);
      }
    }

    if (grandTotal > 0 || grandSkipped > 0 || grandErrors > 0) {
      let summary = `Done — ${grandTotal} processed`;
      if (grandSkipped > 0) summary += `, ${grandSkipped} skipped`;
      if (grandErrors > 0) summary += `, ${grandErrors} failed`;
      summary += ` with rating "${key}".`;
      addStep(logEl, summary);
      setStatus(grandErrors > 0 ? "err" : "ok");
    }

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
