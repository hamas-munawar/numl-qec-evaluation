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
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // ── 1. Select all radio buttons matching the target rating ──────────────
  const radios = document.querySelectorAll(
    `input[type="radio"][value="${targetRating}"]`
  );

  if (radios.length === 0) {
    return { success: false, msg: "Form not found on this page." };
  }

  radios.forEach((r) => (r.checked = true));
  await delay(300);

  // ── 2. Fill comment boxes with a random pick from the pool ──────────────
  const pool = config.pools[targetRating];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];

  if (config.selectors) {
    // Teacher form — explicit CSS selectors
    config.selectors.forEach((s) => {
      const el = document.querySelector(s);
      if (el) el.value = pick();
    });
  } else {
    // Subject form — sequential ID pattern
    for (let i = 1; i <= config.maxBoxes; i++) {
      const el = document.getElementById(`${config.idPrefix}${i}`);
      if (el) el.value = pick();
    }
  }

  await delay(300);

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
