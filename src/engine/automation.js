/**
 * @module automation
 * Core automation engine injected into the target tab via chrome.scripting.
 *
 * NOTE: This function is serialized and executed in the MAIN world of the
 * target page — it must be fully self-contained (no imports, no closures
 * that reference outer-scope variables).
 */

/**
 * Fills and optionally submits a QEC evaluation form.
 *
 * @param {object} config       - Form-specific config (selectors / idPrefix / submitAction / pools).
 * @param {string} targetRating - Radio-button value to select (e.g. "5").
 * @param {boolean} shouldSubmit - Whether to trigger the portal's submit function.
 * @returns {{ success: boolean, submitted?: boolean, msg?: string }}
 */
export async function automationEngine(config, targetRating, shouldSubmit) {
  const poll = (fn, timeout = 2000, interval = 100) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        const res = fn();
        if (res) return resolve(res);
        if (Date.now() - startTime > timeout) return resolve(null);
        setTimeout(check, interval);
      };
      check();
    });
  };

  // ── 1. Wait for radio buttons matching the target rating ─────────────────
  const radios = await poll(() => {
    const r = document.querySelectorAll(`input[type="radio"][value="${targetRating}"]`);
    return r.length > 0 ? r : null;
  });

  if (!radios) {
    return { success: false, msg: "Form not found on this page (timed out waiting)." };
  }

  radios.forEach((r) => (r.checked = true));

  // ── 2. Fill comment boxes ────────────────────────────────────────────────
  const pool = config.pools[targetRating];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];

  if (config.selectors) {
    // Teacher form
    config.selectors.forEach((s) => {
      const el = document.querySelector(s);
      if (el) el.value = pick();
    });
  } else {
    // Subject form
    for (let i = 1; i <= config.maxBoxes; i++) {
      const el = document.getElementById(`${config.idPrefix}${i}`);
      if (el) el.value = pick();
    }
  }

  // ── 3. Optional submission ───────────────────────────────────────────────
  if (shouldSubmit && typeof window[config.submitAction] === "function") {
    window[config.submitAction]();
    return { success: true, submitted: true };
  }

  return { success: true, submitted: false };
}

/**
 * Scrapes all evaluation form URLs from the portal sidebar.
 * Injected into the active tab — must be self-contained.
 * @returns {string[]} Absolute URLs of all .pcoded-submenu links
 */
export function findFormUrls() {
  const links = document.querySelectorAll(".pcoded-submenu a[href]");
  return Array.from(links).map((a) => a.href);
}

/**
 * Finds the teacher/course dropdown on an evaluation form page.
 * Injected into the active tab — must be self-contained.
 * @returns {{ id: string, options: {value:string, text:string}[] } | null}
 */
export function findEvalDropdown() {
  const sel =
    document.querySelector('[id*="DDLTeacher"]') ||
    document.querySelector('[id*="DDLCourse"]') ||
    document.querySelector('[id*="DDLSubject"]');
  if (!sel) return null;
  return {
    id: sel.id,
    options: Array.from(sel.options).map((o) => ({
      value: o.value,
      text: o.text.trim(),
    })),
  };
}

/**
 * Selects an option in the dropdown and fires the change event
 * so the ASP.NET __doPostBack triggers a page reload.
 * Injected into the active tab — must be self-contained.
 * @param {string} optionValue
 * @returns {boolean} true if dropdown was found and updated
 */
export function selectDropdownOption(optionValue) {
  const sel =
    document.querySelector('[id*="DDLTeacher"]') ||
    document.querySelector('[id*="DDLCourse"]') ||
    document.querySelector('[id*="DDLSubject"]');
  if (!sel) return false;
  sel.value = optionValue;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
