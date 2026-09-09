(function startYTFlixAudio() {
  "use strict";

  const STARTUP_SOUND_MESSAGE = "ytflix-play-startup-sound";
  const audio = document.getElementById("ytflix-startup-audio");

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.target !== "offscreen" || message.type !== STARTUP_SOUND_MESSAGE || !audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  });
})();
