/**
 * @module logger
 * UI logging helper — renders structured step entries into the log container.
 */

/** @typedef {'done' | 'error' | 'info'} StepState */

const BULLETS = { done: "●", error: "✕", info: "○" };

/**
 * Appends a step row to the log container with auto-scroll.
 * @param {HTMLElement} container
 * @param {string} msg
 * @param {StepState} [state]
 */
export function addStep(container, msg, state = "done") {
  if (container.innerText.trim().startsWith("Ready")) container.innerHTML = "";

  const row = document.createElement("div");
  row.className = `step ${state}`;
  row.innerHTML = `<span class="step-bullet">${BULLETS[state]}</span><span class="step-text">${msg}</span>`;

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

/** Resets the log container to empty. */
export function clearLog(container) {
  container.innerHTML = "";
}
