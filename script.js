const statusLog = document.getElementById("status-log");
const actionBtns = document.querySelectorAll(".btn");

function addProcessStep(message, isError = false) {
  if (statusLog.innerText.includes("System ready")) statusLog.innerHTML = "";

  const entry = document.createElement("div");
  entry.className = isError ? "step error" : "step done";
  entry.innerText = message;

  statusLog.appendChild(entry);
  statusLog.scrollTop = statusLog.scrollHeight;
}

async function automationEngine(config, shouldSubmit) {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // Find radio buttons
  const radios = document.querySelectorAll(
    `input[type="radio"][value="${config.rating}"]`
  );
  if (radios.length === 0)
    return { success: false, msg: "Evaluation form not found." };

  // Set ratings
  radios.forEach((r) => (r.checked = true));
  await delay(300);

  // Write comments
  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (config.selectors) {
    config.selectors.forEach((id) => {
      const el = document.querySelector(id);
      if (el) el.value = pickRandom(config.commentPool);
    });
  } else {
    for (let i = 1; i <= config.maxBoxes; i++) {
      const el = document.getElementById(`${config.idPrefix}${i}`);
      if (el) el.value = pickRandom(config.commentPool);
    }
  }
  await delay(300);

  // Handle Submission
  if (shouldSubmit) {
    const fn = window[config.submitAction];
    if (typeof fn === "function") {
      fn();
      return { success: true };
    } else {
      return { success: false, msg: "Submission trigger failed." };
    }
  }
  return { success: true, manual: true };
}

async function run(type, submit) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  actionBtns.forEach((b) => (b.disabled = true));
  statusLog.innerHTML = "";

  addProcessStep("Checking the portal page...");
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automationEngine,
      args: [CONFIG[type], submit],
      world: "MAIN",
    });

    const status = results[0].result;
    if (status.success) {
      addProcessStep("Applying ratings...");
      addProcessStep("Writing feedback comments...");
      addProcessStep(
        submit
          ? "Form submitted successfully!"
          : "Form is ready for your review."
      );
    } else {
      addProcessStep(status.msg, true);
    }
  } catch (e) {
    addProcessStep("Error: Please navigate to the form first.", true);
  } finally {
    actionBtns.forEach((b) => (b.disabled = false));
  }
}

document
  .getElementById("fill-t")
  .addEventListener("click", () => run("teacher", false));
document
  .getElementById("sub-t")
  .addEventListener("click", () => run("teacher", true));
document
  .getElementById("fill-s")
  .addEventListener("click", () => run("subject", false));
document
  .getElementById("sub-s")
  .addEventListener("click", () => run("subject", true));
