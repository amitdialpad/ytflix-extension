(async function initializePopup() {
  "use strict";

  const toggle = document.getElementById("enabled");
  const status = document.getElementById("status");

  function updateStatus(enabled) {
    status.textContent = enabled ? "Showing YTFLIX" : "Showing classic YouTube";
  }

  const settings = await chrome.storage.local.get({ enabled: true });
  toggle.checked = settings.enabled !== false;
  updateStatus(toggle.checked);

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    await chrome.storage.local.set({ enabled });
    updateStatus(enabled);
  });
})();
