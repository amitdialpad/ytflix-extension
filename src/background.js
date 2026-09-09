(function startYTFlixBackground() {
  "use strict";

  const OFFSCREEN_DOCUMENT_PATH = "offscreen/offscreen.html";
  const CLAIM_STARTUP_MESSAGE = "ytflix-claim-startup";
  const STARTUP_SOUND_MESSAGE = "ytflix-play-startup-sound";
  const STARTUP_SESSION_KEY = "ytflixStartupPlayed";
  let creatingOffscreenDocument = null;
  let startupClaimQueue = Promise.resolve();

  async function ensureOffscreenDocument() {
    if (await chrome.offscreen.hasDocument()) return;

    if (!creatingOffscreenDocument) {
      creatingOffscreenDocument = chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play the short YTFLIX startup chime."
      }).finally(() => {
        creatingOffscreenDocument = null;
      });
    }

    await creatingOffscreenDocument;
  }

  function claimStartupSequence() {
    startupClaimQueue = startupClaimQueue.catch(() => {}).then(async () => {
      const session = await chrome.storage.session.get({ [STARTUP_SESSION_KEY]: false });
      if (session[STARTUP_SESSION_KEY]) return false;
      await chrome.storage.session.set({ [STARTUP_SESSION_KEY]: true });
      return true;
    });
    return startupClaimQueue;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === CLAIM_STARTUP_MESSAGE) {
      void claimStartupSequence()
        .then((claimed) => sendResponse({ claimed }))
        .catch(() => sendResponse({ claimed: false }));
      return true;
    }

    if (message?.type !== STARTUP_SOUND_MESSAGE || message.target === "offscreen") return false;

    void ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({
        target: "offscreen",
        type: STARTUP_SOUND_MESSAGE
      }))
      .catch(() => {});
    return false;
  });
})();
