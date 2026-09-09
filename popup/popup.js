(async function initializePopup() {
  "use strict";

  const toggle = document.getElementById("enabled");
  const previewsToggle = document.getElementById("autoplay-previews");
  const status = document.getElementById("status");

  function updateStatus(enabled) {
    status.textContent = enabled ? "Showing YTFLIX" : "Showing classic YouTube";
  }

  const settings = await chrome.storage.local.get({ autoplayPreviews: true, enabled: true });
  toggle.checked = settings.enabled !== false;
  previewsToggle.checked = settings.autoplayPreviews !== false;
  updateStatus(toggle.checked);

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    await chrome.storage.local.set({ enabled });
    updateStatus(enabled);
  });

  previewsToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ autoplayPreviews: previewsToggle.checked });
  });
})();
