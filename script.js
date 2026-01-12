const log = document.getElementById("log");
const ratingSelect = document.getElementById("rating-selector");
const actionButtons = document.querySelectorAll(".btn");

/**
 * Sequential Logger with Auto-Scroll
 */
function addLogStep(msg, isError = false) {
  if (log.innerText.includes("Ready")) log.innerHTML = "";

  const div = document.createElement("div");
  div.className = isError ? "step error" : "step done";
  div.innerText = msg;

  log.appendChild(div);

  // Auto-scroll to ensure latest step is visible
  log.scrollTop = log.scrollHeight;
}

/**
 * Main Injection Logic
 */
async function automationEngine(config, targetRating, shouldSubmit) {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  const radios = document.querySelectorAll(
    `input[type="radio"][value="${targetRating}"]`
  );

  if (radios.length === 0)
    return { success: false, msg: "Form not found on this page." };

  // 1. Set ratings
  radios.forEach((r) => (r.checked = true));
  await delay(300);

  // 2. Write Shuffle Comments
  const pool = config.pools[targetRating];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];

  if (config.selectors) {
    config.selectors.forEach((s) => {
      const el = document.querySelector(s);
      if (el) el.value = pick();
    });
  } else {
    for (let i = 1; i <= config.maxBoxes; i++) {
      const el = document.getElementById(`${config.idPrefix}${i}`);
      if (el) el.value = pick();
    }
  }
  await delay(300);

  // 3. Optional Submission
  if (shouldSubmit && typeof window[config.submitAction] === "function") {
    window[config.submitAction]();
    return { success: true, submitted: true };
  }
  return { success: true, submitted: false };
}

/**
 * Controller
 */
async function start(type, submit) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Disable UI during processing
  actionButtons.forEach((btn) => (btn.disabled = true));
  log.innerHTML = "";

  const ratingKey = ratingSelect.value;
  const targetValue = EVALUATION_CONFIG.ratingMap[ratingKey];

  addLogStep("Scanning portal page...");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automationEngine,
      args: [EVALUATION_CONFIG[type], targetValue, submit],
      world: "MAIN",
    });

    const status = results[0].result;

    if (status.success) {
      addLogStep(`Setting ratings to ${ratingKey}...`);
      addLogStep("Writing feedback comments...");
      addLogStep(
        status.submitted
          ? "Form submitted successfully!"
          : "Form filled for your review."
      );
    } else {
      addLogStep(status.msg, true);
    }
  } catch (e) {
    addLogStep("Error: Please open the evaluation form first.", true);
  } finally {
    actionButtons.forEach((btn) => (btn.disabled = false));
  }
}

document
  .getElementById("fill-t")
  .addEventListener("click", () => start("teacher", false));
document
  .getElementById("sub-t")
  .addEventListener("click", () => start("teacher", true));
document
  .getElementById("fill-s")
  .addEventListener("click", () => start("subject", false));
document
  .getElementById("sub-s")
  .addEventListener("click", () => start("subject", true));
