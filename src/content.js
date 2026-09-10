(function startYTFlix() {
  "use strict";

  const core = globalThis.YTFlixCore;
  if (!core) return;

  const ROOT_ID = "ytflix-root";
  const WATCH_EXTRAS_ID = "ytflix-watch-extras";
  const ACTIVE_ATTRIBUTE = "data-ytflix-enabled";
  const MODE_ATTRIBUTE = "data-ytflix-mode";
  const ROUTE_ATTRIBUTE = "data-ytflix-route";
  const LIGHTS_DOWN_ATTRIBUTE = "data-ytflix-lights-down";
  const STARTUP_ID = "ytflix-startup";
  const MOOD_ID = "ytflix-mood-picker";
  const PROFILE_ID = "ytflix-profile-picker";
  const TOAST_ID = "ytflix-still-watching";
  const REMOVAL_TOAST_ID = "ytflix-removal-toast";
  const CLAIM_STARTUP_MESSAGE = "ytflix-claim-startup";
  const STARTUP_SOUND_MESSAGE = "ytflix-play-startup-sound";
  const STARTUP_MINIMUM_DURATION = 2100;
  const STARTUP_EXIT_DURATION = 320;
  const EMPTY_STATE_TIMEOUT = 6500;
  const DIALOG_EXIT_DURATION = 180;
  const STILL_WATCHING_DELAY = 45 * 60 * 1000;
  const TOPIC_SHELF_SELECTOR = "ytd-chips-shelf-with-video-shelf-renderer";
  const TOPIC_TAB_SELECTOR = "button[role='tab']";
  const TOPIC_CARD_LIMIT = 12;
  const TOPIC_WAIT_TIMEOUT = 2600;
  const TOPIC_DISCOVERY_ATTEMPTS = 4;
  const TOPIC_DISCOVERY_DELAY = 850;
  const CARD_SELECTORS = [
    "yt-lockup-view-model",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-grid-playlist-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-renderer",
    "ytd-compact-video-renderer"
  ];

  const state = {
    enabled: false,
    signature: "",
    observer: null,
    renderTimer: null,
    navigationTimer: null,
    locationTimer: null,
    lastHref: location.href,
    avatarSource: "",
    emptyHref: "",
    emptySince: 0,
    fallbackHref: "",
    isNavigating: false,
    startupSoundRequested: false,
    startupStartedAt: 0,
    startupExitTimer: null,
    startupRemoveTimer: null,
    myList: [],
    hiddenCards: [],
    activeView: "",
    activeMood: "",
    lastCards: [],
    lightsDown: false,
    stillWatchingTimer: null,
    stillWatchingHref: "",
    topicRails: [],
    topicCollectionHref: "",
    topicCollectionPromise: null,
    topicCollectionComplete: false,
    topicCollectionToken: 0
  };

  document.documentElement.dataset.ytflixPending = "true";

  function makeElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function createStartupOverlay() {
    const overlay = makeElement("div", "ytflix-startup");
    overlay.id = STARTUP_ID;
    overlay.setAttribute("aria-hidden", "true");

    const ribbons = makeElement("div", "ytflix-startup__ribbons");
    ["-210px", "-140px", "-72px", "0px", "72px", "140px", "210px"].forEach((offset, index) => {
      const ribbon = makeElement("span", "ytflix-startup__ribbon");
      ribbon.style.setProperty("--ytflix-ribbon-index", String(index));
      ribbon.style.setProperty("--ytflix-ribbon-offset", offset);
      ribbons.appendChild(ribbon);
    });

    const beam = makeElement("span", "ytflix-startup__beam");
    const monogram = makeElement("div", "ytflix-startup__monogram", "YT");
    const logo = makeElement("div", "ytflix-startup__logo");
    Array.from("YTFLIX").forEach((letter, index) => {
      const character = makeElement("span", "ytflix-startup__letter", letter);
      character.style.setProperty("--ytflix-letter-index", String(index));
      logo.appendChild(character);
    });

    overlay.append(ribbons, beam, monogram, logo);
    return overlay;
  }

  function requestStartupSound() {
    if (state.startupSoundRequested) return;
    state.startupSoundRequested = true;
    void chrome.runtime.sendMessage({ type: STARTUP_SOUND_MESSAGE }).catch(() => {});
  }

  function startStartupSequence() {
    if (state.startupStartedAt || document.getElementById(STARTUP_ID)) return;
    state.startupStartedAt = performance.now();
    delete document.documentElement.dataset.ytflixPending;
    document.body.appendChild(createStartupOverlay());
    requestStartupSound();
  }

  function finishStartupSequence(immediate = false) {
    const overlay = document.getElementById(STARTUP_ID);
    if (!overlay) return;

    window.clearTimeout(state.startupExitTimer);
    window.clearTimeout(state.startupRemoveTimer);
    const elapsed = performance.now() - state.startupStartedAt;
    const delay = immediate ? 0 : Math.max(0, STARTUP_MINIMUM_DURATION - elapsed);

    state.startupExitTimer = window.setTimeout(() => {
      overlay.classList.add("is-complete");
      state.startupRemoveTimer = window.setTimeout(
        () => overlay.remove(),
        immediate ? 0 : STARTUP_EXIT_DURATION
      );
    }, delay);
  }

  async function claimStartupSequence() {
    const route = core.classifyRoute(location.href);
    if (route === "unsupported" || route === "shorts") return;

    try {
      const result = await chrome.runtime.sendMessage({ type: CLAIM_STARTUP_MESSAGE });
      if (result?.claimed) startStartupSequence();
    } catch (_error) {
      // Keep loading the interface if the startup ident cannot be claimed.
    }
  }

  function nativeScope() {
    const pageManager = document.querySelector("ytd-app ytd-page-manager");
    const activePage = pageManager
      ? Array.from(pageManager.children).find((child) => !child.hidden && !child.hasAttribute("hidden"))
      : null;
    return activePage || pageManager || document.querySelector("ytd-app") || document;
  }

  function textFrom(root, selectors) {
    if (!root) return "";
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const value = node?.getAttribute("title") || node?.textContent;
      if (value && value.trim()) return value.replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function bestImageSource(image) {
    if (!image) return "";
    if (image.currentSrc && !image.currentSrc.startsWith("data:")) return image.currentSrc;
    if (image.src && !image.src.startsWith("data:")) return image.src;

    const srcset = image.getAttribute("srcset") || "";
    const candidates = srcset
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean);
    return candidates[candidates.length - 1] || "";
  }

  function playbackProgress(cardNode) {
    const progressNode = cardNode.querySelector(
      [
        "ytd-thumbnail-overlay-resume-playback-renderer #progress",
        "#progress.ytd-thumbnail-overlay-resume-playback-renderer",
        "yt-thumbnail-overlay-progress-bar-view-model #progress",
        ".ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment"
      ].join(",")
    );
    if (!progressNode) return 0;

    const inlineWidth = progressNode.style.width || "";
    const styleAttribute = progressNode.getAttribute("style") || "";
    const percentage = inlineWidth.endsWith("%")
      ? Number.parseFloat(inlineWidth)
      : Number(styleAttribute.match(/width:\s*([\d.]+)%/i)?.[1]);
    if (Number.isFinite(percentage) && percentage > 0) return percentage;

    const parentWidth = progressNode.parentElement?.getBoundingClientRect().width || 0;
    const width = progressNode.getBoundingClientRect().width;
    return parentWidth > 0 ? (width / parentWidth) * 100 : 0;
  }

  function findDestination(cardNode) {
    const preferredSelectors = [
      "a.ytLockupMetadataViewModelTitle[href]",
      "a[href^='/watch']",
      "a[href^='/playlist']",
      "a[href^='/playables']",
      "a[href^='/shorts']",
      "a#video-title[href]",
      "a#video-title-link[href]",
      "a#thumbnail[href]"
    ];

    for (const selector of preferredSelectors) {
      const anchor = cardNode.querySelector(selector);
      if (anchor) return anchor.href;
    }

    const anchors = cardNode.querySelectorAll(
      "a.yt-simple-endpoint[href], a[href]"
    );

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || "";
      if (/^\/(watch|playlist|playables|shorts)/.test(href) || /^https?:\/\//.test(href)) return anchor.href;
    }

    return "";
  }

  function extractCard(cardNode) {
    const href = findDestination(cardNode);
    const title = textFrom(cardNode, [
      "a.ytLockupMetadataViewModelTitle",
      ".ytLockupMetadataViewModelHeadingReset",
      "a#video-title",
      "a#video-title-link",
      "#video-title",
      "h3",
      "yt-formatted-string#title"
    ]);
    const thumbnailImage = cardNode.querySelector("ytd-thumbnail img, yt-image img, img.yt-core-image, img");
    const channel = textFrom(cardNode, [
      ".ytContentMetadataViewModelMetadataRow a[href^='/@']",
      "a.ytAttributedStringLink[href^='/@']",
      "ytd-channel-name a",
      "#channel-name a",
      "#channel-name",
      ".ytd-channel-name"
    ]);
    const modernMetadataRows = Array.from(
      cardNode.querySelectorAll(".ytContentMetadataViewModelMetadataRow")
    )
      .map((node) => node.textContent.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const metadataParts = (modernMetadataRows.length > 1
      ? modernMetadataRows.slice(1)
      : Array.from(cardNode.querySelectorAll("#metadata-line span, .inline-metadata-item"))
          .map((node) => node.textContent.replace(/\s+/g, " ").trim())
          .filter(Boolean)
    ).slice(0, 2);
    let duration = textFrom(cardNode, [
      ".ytThumbnailBottomOverlayViewModelTimestamp",
      "yt-thumbnail-bottom-overlay-view-model",
      "ytd-thumbnail-overlay-time-status-renderer #text",
      "badge-shape .yt-badge-shape__text",
      ".ytp-time-duration"
    ]);
    const durationMatch = duration.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
    if (durationMatch) duration = durationMatch[0];
    else {
      const thumbnailText = cardNode.querySelector("a.ytLockupViewModelContentImage[href]")?.textContent || "";
      duration = thumbnailText.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0] || "";
    }
    const allText = cardNode.textContent || "";
    const nearestShortShelf = cardNode.closest(
      "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-shorts"
    );
    const isCollection = Boolean(
      cardNode.matches("ytd-playlist-renderer, ytd-grid-playlist-renderer") ||
      cardNode.querySelector("a[href^='/playlist?list='], a[href*='youtube.com/playlist?list=']")
    );

    return core.normalizeCard({
      channel,
      duration,
      href,
      metadata: metadataParts.join(" · "),
      progress: playbackProgress(cardNode),
      sponsored: Boolean(cardNode.closest("ytd-ad-slot-renderer")) || /\bSponsored\b/i.test(allText),
      isCollection,
      isShort: Boolean(nearestShortShelf) || /\/shorts\//.test(href),
      thumbnail: bestImageSource(thumbnailImage),
      title
    });
  }

  function collectCards() {
    const cards = [];
    const root = nativeScope();

    for (const cardNode of root.querySelectorAll(CARD_SELECTORS.join(","))) {
      if (cardNode.closest(TOPIC_SHELF_SELECTOR)) continue;
      const card = extractCard(cardNode);
      if (!card) continue;
      cards.push(card);
    }

    return core.filterHiddenCards(core.dedupeCards(cards), state.hiddenCards).slice(0, 64);
  }

  function findTopicShelf() {
    const shelves = Array.from(nativeScope().querySelectorAll(TOPIC_SHELF_SELECTOR));
    const namedShelf = shelves.find((shelf) => {
      const heading = textFrom(shelf, ["h2", "yt-shelf-header-layout"]);
      return heading.toLocaleLowerCase() === "explore more topics";
    });
    return namedShelf || shelves.find((shelf) => (
      shelf.querySelectorAll(TOPIC_TAB_SELECTOR).length > 1 &&
      shelf.querySelector(CARD_SELECTORS.join(","))
    )) || null;
  }

  function topicTabLabel(button) {
    return String(button?.textContent || button?.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function topicTabs(shelf) {
    const seen = new Set();
    return Array.from(shelf?.querySelectorAll(TOPIC_TAB_SELECTOR) || []).filter((button) => {
      const label = topicTabLabel(button);
      const key = label.toLocaleLowerCase();
      if (!label || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function selectedTopicLabel(shelf) {
    const selected = topicTabs(shelf).find((button) => button.getAttribute("aria-selected") === "true");
    return topicTabLabel(selected);
  }

  function collectTopicCards(shelf) {
    const cards = [];
    for (const cardNode of shelf?.querySelectorAll(CARD_SELECTORS.join(",")) || []) {
      const card = extractCard(cardNode);
      if (card) cards.push(card);
    }
    return core.filterHiddenCards(core.dedupeCards(cards), state.hiddenCards).slice(0, TOPIC_CARD_LIMIT);
  }

  function visibleTopicButton(shelf, label) {
    return Array.from(shelf?.querySelectorAll("button") || []).find((button) => (
      String(button.textContent || "").replace(/\s+/g, " ").trim() === label &&
      !button.disabled &&
      button.getClientRects().length > 0
    )) || null;
  }

  function waitForTopicCondition(predicate, token, timeout = TOPIC_WAIT_TIMEOUT) {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const check = () => {
        if (token !== state.topicCollectionToken || location.href !== state.topicCollectionHref) {
          resolve(false);
          return;
        }

        let passed = false;
        try {
          passed = Boolean(predicate());
        } catch (_error) {
          passed = false;
        }

        if (passed) {
          resolve(true);
          return;
        }
        if (performance.now() - startedAt >= timeout) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 70);
      };
      check();
    });
  }

  function waitForTopicDelay(token, delay) {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve(
          token === state.topicCollectionToken &&
          location.href === state.topicCollectionHref
        );
      }, delay);
    });
  }

  async function discoverTopicShelf(token) {
    let shelf = findTopicShelf();
    for (let attempt = 0; !shelf && attempt < TOPIC_DISCOVERY_ATTEMPTS; attempt += 1) {
      if (token !== state.topicCollectionToken || location.href !== state.topicCollectionHref) {
        return null;
      }

      // The topic shelf sits below YouTube's initially rendered Home feed. YTFLIX
      // owns the visible scroll surface, so advancing the hidden native page can
      // trigger its lazy loader without moving the interface the viewer is using.
      window.scrollTo(0, document.documentElement.scrollHeight);
      if (!await waitForTopicDelay(token, TOPIC_DISCOVERY_DELAY)) return null;
      shelf = findTopicShelf();
    }
    return shelf;
  }

  async function selectTopic(label, token) {
    const shelf = findTopicShelf();
    if (!shelf) return null;
    if (selectedTopicLabel(shelf) === label) {
      if (collectTopicCards(shelf).length) return shelf;
      const loaded = await waitForTopicCondition(() => {
        const currentShelf = findTopicShelf();
        return Boolean(currentShelf && collectTopicCards(currentShelf).length);
      }, token);
      return loaded ? findTopicShelf() : null;
    }

    const previousSignature = core.buildSignature("topic", collectTopicCards(shelf));
    const button = topicTabs(shelf).find((candidate) => topicTabLabel(candidate) === label);
    if (!button) return null;
    button.click();

    const updated = await waitForTopicCondition(() => {
      const currentShelf = findTopicShelf();
      if (!currentShelf || selectedTopicLabel(currentShelf) !== label) return false;
      const cards = collectTopicCards(currentShelf);
      return cards.length > 0 && core.buildSignature("topic", cards) !== previousSignature;
    }, token);

    return updated ? findTopicShelf() : null;
  }

  async function expandTopic(shelf, token) {
    const showMore = visibleTopicButton(shelf, "Show more");
    if (!showMore) return shelf;

    const cardCount = collectTopicCards(shelf).length;
    showMore.click();
    await waitForTopicCondition(() => {
      const currentShelf = findTopicShelf();
      return Boolean(
        currentShelf &&
        (collectTopicCards(currentShelf).length > cardCount || visibleTopicButton(currentShelf, "Show less"))
      );
    }, token, 1800);
    return findTopicShelf() || shelf;
  }

  async function collapseTopic(shelf, token) {
    const showLess = visibleTopicButton(shelf, "Show less");
    if (!showLess) return;
    showLess.click();
    await waitForTopicCondition(() => {
      const currentShelf = findTopicShelf();
      return Boolean(currentShelf && !visibleTopicButton(currentShelf, "Show less"));
    }, token, 1200);
  }

  function publishTopicRail(title, cards) {
    state.topicRails = core.normalizeTopicRails([
      ...state.topicRails.filter((rail) => rail.title !== title),
      { title, cards }
    ]);
    state.signature = "";
    scheduleRender(0);
  }

  async function collectTopicRails(token) {
    let shelf = findTopicShelf();
    if (!shelf) return;

    const labels = topicTabs(shelf).map(topicTabLabel);
    const originalLabel = selectedTopicLabel(shelf) || labels[0] || "";
    const originalExpanded = Boolean(visibleTopicButton(shelf, "Show less"));

    try {
      for (const label of labels) {
        if (token !== state.topicCollectionToken || location.href !== state.topicCollectionHref) return;
        shelf = await selectTopic(label, token);
        if (!shelf) continue;
        shelf = await expandTopic(shelf, token);
        const cards = collectTopicCards(shelf);
        if (cards.length) publishTopicRail(label, cards);
        await collapseTopic(shelf, token);
      }
    } finally {
      if (token !== state.topicCollectionToken || location.href !== state.topicCollectionHref) return;
      if (originalLabel) {
        shelf = await selectTopic(originalLabel, token);
        if (shelf && originalExpanded) await expandTopic(shelf, token);
      }
    }
  }

  async function discoverAndCollectTopicRails(token, href) {
    const nativeScrollTop = window.scrollY;
    try {
      const shelf = await discoverTopicShelf(token);
      if (!shelf) return;
      await collectTopicRails(token);
    } finally {
      if (location.href === href) window.scrollTo(0, nativeScrollTop);
    }
  }

  function resetTopicCollection() {
    state.topicCollectionToken += 1;
    state.topicRails = [];
    state.topicCollectionHref = "";
    state.topicCollectionPromise = null;
    state.topicCollectionComplete = false;
  }

  function maybeCollectTopicRails(route) {
    if (route !== "home") {
      if (state.topicCollectionHref || state.topicCollectionPromise || state.topicRails.length) {
        resetTopicCollection();
      }
      return;
    }
    if (state.topicCollectionHref && state.topicCollectionHref !== location.href) resetTopicCollection();
    if (state.topicCollectionPromise || state.topicCollectionComplete) return;

    state.topicCollectionHref = location.href;
    const token = ++state.topicCollectionToken;
    const collection = discoverAndCollectTopicRails(token, location.href);
    state.topicCollectionPromise = collection;
    void collection
      .catch(() => {})
      .finally(() => {
        if (token !== state.topicCollectionToken) return;
        state.topicCollectionPromise = null;
        state.topicCollectionComplete = true;
      });
  }

  function getNativePageTitle(route) {
    const root = nativeScope();
    const selectorsByRoute = {
      channel: [
        "ytd-channel-name #text",
        "#channel-header-container #text",
        "ytd-c4-tabbed-header-renderer #text"
      ],
      playlist: ["ytd-playlist-header-renderer h1", "ytd-playlist-header-renderer #title"],
      feed: ["ytd-browse[page-subtype] h1", "ytd-browse h1"]
    };
    const nativeTitle = textFrom(root, selectorsByRoute[route] || []);
    return nativeTitle || core.routeLabel(location.href);
  }

  function getNativeAccountButton() {
    const selectors = [
      "ytd-masthead #avatar-btn",
      "button#avatar-btn",
      "button[aria-label*='Google Account']",
      "button[aria-label*='Account menu']"
    ];

    for (const selector of selectors) {
      const button = Array.from(document.querySelectorAll(selector)).find(
        (candidate) => !candidate.closest(`#${ROOT_ID}`)
      );
      if (button) return button;
    }

    const nativeAvatar = Array.from(
      document.querySelectorAll("ytd-masthead img, ytd-topbar-menu-button-renderer img, yt-avatar-shape img")
    ).find((image) => /\/yti\//.test(bestImageSource(image)));
    const avatarButton = nativeAvatar?.closest("button, [role='button']");
    if (avatarButton && !avatarButton.closest(`#${ROOT_ID}`)) return avatarButton;

    return null;
  }

  function getNativeAvatarSource() {
    const buttonImageSource = bestImageSource(getNativeAccountButton()?.querySelector("img"));
    if (buttonImageSource) state.avatarSource = buttonImageSource;

    if (!state.avatarSource) {
      const profileImage = Array.from(document.images).find((image) => {
        if (image.closest(`#${ROOT_ID}`)) return false;
        const source = bestImageSource(image);
        return /\/yti\//.test(source) || Boolean(image.closest("ytd-masthead, ytd-topbar-menu-button-renderer"));
      });
      const profileImageSource = bestImageSource(profileImage);
      if (profileImageSource) state.avatarSource = profileImageSource;
    }

    if (!state.avatarSource) {
      for (const script of document.scripts) {
        const match = script.textContent.match(
          /https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/yti\/[^"\\\s]+/
        );
        if (!match) continue;
        state.avatarSource = match[0].replace(/\\u0026/g, "&");
        break;
      }
    }

    return state.avatarSource;
  }

  function updateAccountButton(accountButton) {
    if (!accountButton) return;
    const avatarSource = getNativeAvatarSource();
    const existingAvatar = accountButton.querySelector("img");
    if (avatarSource && existingAvatar?.src === avatarSource) return;

    accountButton.replaceChildren();
    accountButton.classList.remove("is-fallback");
    if (avatarSource) {
      const avatar = document.createElement("img");
      avatar.src = avatarSource;
      avatar.alt = "";
      accountButton.appendChild(avatar);
      accountButton.disabled = false;
    } else {
      accountButton.textContent = "A";
      accountButton.classList.add("is-fallback");
      accountButton.disabled = false;
    }
  }

  function syncHeaderAvatar() {
    updateAccountButton(document.querySelector(`#${ROOT_ID} .ytflix-account`));
  }

  function showSavedView() {
    state.activeView = "my-list";
    state.activeMood = "";
    state.signature = "";
    scheduleRender(0);
  }

  function chooseMood(mood) {
    closeDialog(MOOD_ID);
    if (mood === "surprise") {
      const choices = state.lastCards.filter((card) => core.videoIdFromUrl(card.href));
      const pick = choices[Math.floor(Math.random() * choices.length)];
      if (pick) location.assign(pick.href);
      return;
    }

    state.activeView = "mood";
    state.activeMood = mood;
    state.signature = "";
    scheduleRender(0);
  }

  function openMoodPicker() {
    closeDialog(MOOD_ID);
    const dialog = makeElement("dialog", "ytflix-dialog ytflix-mood-picker");
    dialog.id = MOOD_ID;
    dialog.setAttribute("aria-labelledby", "ytflix-mood-title");
    const panel = makeElement("section", "ytflix-mood-picker__panel");
    const close = makeElement("button", "ytflix-dialog__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close mood picker");
    close.addEventListener("click", () => dismissDialog(dialog));
    panel.appendChild(close);
    panel.appendChild(makeElement("p", "ytflix-eyebrow", "Tonight on YTFLIX"));
    const title = makeElement("h2", "ytflix-mood-picker__title", "What are we watching?");
    title.id = "ytflix-mood-title";
    panel.appendChild(title);
    panel.appendChild(
      makeElement("p", "ytflix-mood-picker__copy", "Pick a mood. We’ll recut what YouTube already has waiting for you.")
    );

    const choices = makeElement("div", "ytflix-mood-picker__choices");
    [
      ["funny", "Something funny", "Comedy, sketches and excellent nonsense"],
      ["comfort", "Background comfort", "Calm, cozy and easy to keep on"],
      ["music", "Date-night music", "Live sessions, playlists and acoustic sets"],
      ["deep", "Something absorbing", "Documentaries, essays and interviews"],
      ["surprise", "Surprise me", "Skip the debate and press play"]
    ].forEach(([value, label, description]) => {
      const button = makeElement("button", "ytflix-mood-choice");
      button.type = "button";
      button.append(
        makeElement("strong", "ytflix-mood-choice__label", label),
        makeElement("span", "ytflix-mood-choice__description", description)
      );
      button.addEventListener("click", () => chooseMood(value));
      choices.appendChild(button);
    });
    panel.appendChild(choices);
    dialog.appendChild(panel);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dismissDialog(dialog);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismissDialog(dialog);
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
    close.focus();
  }

  function openProfilePicker() {
    closeDialog(PROFILE_ID);
    const dialog = makeElement("dialog", "ytflix-dialog ytflix-profile-picker");
    dialog.id = PROFILE_ID;
    dialog.setAttribute("aria-labelledby", "ytflix-profile-title");
    const panel = makeElement("section", "ytflix-profile-picker__panel");
    const close = makeElement("button", "ytflix-dialog__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close profile picker");
    close.addEventListener("click", () => dismissDialog(dialog));
    panel.appendChild(close);
    panel.appendChild(makeElement("p", "ytflix-eyebrow", "Profiles"));
    const title = makeElement("h2", "ytflix-profile-picker__title", "Who’s watching?");
    title.id = "ytflix-profile-title";
    panel.appendChild(title);

    const choices = makeElement("div", "ytflix-profile-picker__choices");
    const personal = makeElement("button", "ytflix-profile-choice");
    personal.type = "button";
    const personalAvatar = makeElement("span", "ytflix-profile-choice__avatar");
    const avatarSource = getNativeAvatarSource();
    if (avatarSource) {
      const avatar = document.createElement("img");
      avatar.src = avatarSource;
      avatar.alt = "";
      personalAvatar.appendChild(avatar);
    } else {
      personalAvatar.textContent = "A";
    }
    personal.append(personalAvatar, makeElement("span", "ytflix-profile-choice__label", "My YTFLIX"));
    personal.addEventListener("click", () => dismissDialog(dialog));

    const dateNight = makeElement("button", "ytflix-profile-choice");
    dateNight.type = "button";
    dateNight.append(
      makeElement("span", "ytflix-profile-choice__avatar is-date-night", "♥"),
      makeElement("span", "ytflix-profile-choice__label", "Date Night")
    );
    dateNight.addEventListener("click", () => {
      dismissDialog(dialog);
      window.setTimeout(openMoodPicker, DIALOG_EXIT_DURATION);
    });
    choices.append(personal, dateNight);
    panel.appendChild(choices);

    const youtubeAccount = makeElement("button", "ytflix-profile-picker__account", "Open YouTube account");
    youtubeAccount.type = "button";
    youtubeAccount.addEventListener("click", () => {
      closeDialog(PROFILE_ID);
      getNativeAccountButton()?.click();
    });
    panel.appendChild(youtubeAccount);

    dialog.appendChild(panel);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dismissDialog(dialog);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismissDialog(dialog);
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
    personal.focus();
  }

  function setLightsDown(enabled) {
    state.lightsDown = Boolean(enabled);
    document.documentElement.toggleAttribute(LIGHTS_DOWN_ATTRIBUTE, state.lightsDown);
    const button = document.querySelector(".ytflix-lights-toggle");
    if (button) {
      button.classList.toggle("is-active", state.lightsDown);
      button.textContent = state.lightsDown ? "Lights up" : "Lights down";
      button.setAttribute("aria-pressed", String(state.lightsDown));
    }
  }

  function createHeader(route) {
    const header = makeElement("header", "ytflix-header");
    const left = makeElement("div", "ytflix-header__left");
    const logo = makeElement("a", "ytflix-logo", "YTFLIX");
    logo.href = "https://www.youtube.com/";
    logo.setAttribute("aria-label", "YouTube home");
    left.appendChild(logo);

    const nav = makeElement("nav", "ytflix-nav");
    nav.setAttribute("aria-label", "Primary");
    const links = [
      ["Home", "/"],
      ["My Shows", "/feed/subscriptions"],
      ["Watch Again", "/feed/history"],
      ["My Library", "/feed/you"]
    ];

    for (const [label, path] of links) {
      const anchor = makeElement("a", "ytflix-nav__link", label);
      anchor.href = `https://www.youtube.com${path}`;
      if (
        (path === "/" && route === "home" && !state.activeView) ||
        (path !== "/" && location.pathname.startsWith(path))
      ) {
        anchor.classList.add("is-active");
      }
      nav.appendChild(anchor);
    }

    const myList = makeElement("button", "ytflix-nav__link ytflix-nav__button", "My List");
    myList.type = "button";
    myList.classList.toggle("is-active", state.activeView === "my-list");
    myList.addEventListener("click", showSavedView);
    nav.appendChild(myList);
    left.appendChild(nav);

    const tools = makeElement("div", "ytflix-header__tools");
    const search = makeElement("form", "ytflix-search");
    search.setAttribute("role", "search");
    const searchInput = makeElement("input", "ytflix-search__input");
    searchInput.type = "search";
    searchInput.placeholder = "Titles, people, genres";
    searchInput.setAttribute("aria-label", "Search YouTube");
    if (route === "search") searchInput.value = new URL(location.href).searchParams.get("search_query") || "";
    search.appendChild(searchInput);
    search.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      if (query) location.assign(`/results?search_query=${encodeURIComponent(query)}`);
    });
    tools.appendChild(search);

    const moodButton = makeElement("button", "ytflix-header-action", "Tonight’s mood");
    moodButton.type = "button";
    moodButton.addEventListener("click", openMoodPicker);
    tools.appendChild(moodButton);

    if (route === "watch" && !state.activeView) {
      const lightsButton = makeElement(
        "button",
        "ytflix-header-action ytflix-lights-toggle",
        state.lightsDown ? "Lights up" : "Lights down"
      );
      lightsButton.type = "button";
      lightsButton.setAttribute("aria-pressed", String(state.lightsDown));
      lightsButton.addEventListener("click", () => setLightsDown(!state.lightsDown));
      tools.appendChild(lightsButton);
    }

    const accountButton = makeElement("button", "ytflix-account");
    accountButton.type = "button";
    accountButton.setAttribute("aria-label", "Open YouTube account menu");
    accountButton.addEventListener("click", openProfilePicker);
    updateAccountButton(accountButton);
    tools.appendChild(accountButton);

    header.append(left, tools);
    return header;
  }

  function imageNode(card, className) {
    const frame = makeElement("div", className);
    const fallbackThumbnail = core.thumbnailFromUrl(card.href);
    const source = card.thumbnail || fallbackThumbnail;

    function showPlaceholder() {
      let hash = 0;
      for (const character of card.title) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
      frame.style.setProperty("--ytflix-placeholder-hue", String(hash % 360));
      frame.style.setProperty("--ytflix-placeholder-hue-alt", String((hash + 54) % 360));
      frame.classList.add("is-missing");
    }

    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = "";
      const prioritize = className.includes("hero") || className.includes("details");
      image.loading = prioritize ? "eager" : "lazy";
      if (prioritize) image.fetchPriority = "high";
      image.addEventListener("error", () => {
        if (fallbackThumbnail && image.src !== fallbackThumbnail) {
          image.src = fallbackThumbnail;
          return;
        }
        image.remove();
        showPlaceholder();
      });
      frame.appendChild(image);
    } else {
      showPlaceholder();
    }
    return frame;
  }

  function cardKey(card) {
    return core.cardKey(card);
  }

  function isInMyList(card) {
    const key = cardKey(card);
    return state.myList.some((savedCard) => cardKey(savedCard) === key);
  }

  function isHidden(card) {
    return state.hiddenCards.includes(cardKey(card));
  }

  function syncMyListButtons() {
    for (const button of document.querySelectorAll("[data-ytflix-list-key]")) {
      const saved = state.myList.some((card) => cardKey(card) === button.dataset.ytflixListKey);
      button.classList.toggle("is-saved", saved);
      const compact = button.dataset.ytflixListStyle === "compact";
      button.textContent = compact ? (saved ? "✓" : "+") : (saved ? "✓ My List" : "+ My List");
      button.setAttribute("aria-label", saved ? "Remove from My List" : "Add to My List");
      button.title = saved ? "Remove from My List" : "Add to My List";
    }
  }

  async function toggleMyList(card) {
    const key = cardKey(card);
    const exists = state.myList.some((savedCard) => cardKey(savedCard) === key);
    state.myList = exists
      ? state.myList.filter((savedCard) => cardKey(savedCard) !== key)
      : [core.normalizeCard(card), ...state.myList].filter(Boolean);
    await chrome.storage.local.set({ myList: state.myList });
    syncMyListButtons();
    if (state.activeView === "my-list") {
      state.signature = "";
      scheduleRender(0);
    }
  }

  function createMyListButton(card, className = "ytflix-card-action") {
    const compact = className.includes("ytflix-card-action");
    const saved = isInMyList(card);
    const button = makeElement(
      "button",
      className,
      compact ? (saved ? "✓" : "+") : (saved ? "✓ My List" : "+ My List")
    );
    button.type = "button";
    button.dataset.ytflixListKey = cardKey(card);
    button.dataset.ytflixListStyle = compact ? "compact" : "full";
    button.setAttribute("aria-label", saved ? "Remove from My List" : "Add to My List");
    button.title = button.getAttribute("aria-label");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void toggleMyList(card);
    });
    return button;
  }

  function showRemovalToast(card, savedCard) {
    document.getElementById(REMOVAL_TOAST_ID)?.remove();
    const toast = makeElement("aside", "ytflix-removal-toast");
    toast.id = REMOVAL_TOAST_ID;
    toast.setAttribute("role", "status");
    const copy = makeElement("div", "ytflix-removal-toast__copy");
    copy.append(
      makeElement("strong", "", "Removed from YTFLIX"),
      makeElement("span", "", card.title)
    );
    const undo = makeElement("button", "ytflix-removal-toast__button", "Undo");
    undo.type = "button";
    undo.addEventListener("click", async () => {
      const key = cardKey(card);
      state.hiddenCards = state.hiddenCards.filter((hiddenKey) => hiddenKey !== key);
      state.lastCards = core.dedupeCards([card, ...state.lastCards]);
      if (savedCard && !isInMyList(savedCard)) {
        state.myList = core.dedupeCards([savedCard, ...state.myList]);
      }
      await chrome.storage.local.set({ hiddenCards: state.hiddenCards, myList: state.myList });
      toast.remove();
      state.signature = "";
      scheduleRender(0);
    });
    toast.append(copy, undo);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 6500);
  }

  async function hideCard(card) {
    const key = cardKey(card);
    if (state.hiddenCards.includes(key)) return;
    const savedCard = state.myList.find((item) => cardKey(item) === key) || null;
    state.hiddenCards = [key, ...state.hiddenCards];
    state.myList = state.myList.filter((item) => cardKey(item) !== key);
    state.lastCards = state.lastCards.filter((item) => cardKey(item) !== key);
    await chrome.storage.local.set({ hiddenCards: state.hiddenCards, myList: state.myList });
    state.signature = "";
    scheduleRender(0);
    showRemovalToast(card, savedCard);
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return false;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.remove();
    return true;
  }

  function dismissDialog(dialog) {
    if (!dialog || dialog.classList.contains("is-closing")) return;
    dialog.classList.add("is-closing");
    window.setTimeout(() => {
      if (dialog.open) dialog.close();
      else dialog.remove();
    }, DIALOG_EXIT_DURATION);
  }

  function createCard(card, rank) {
    const wrapper = makeElement("article", "ytflix-card");
    const anchor = makeElement("a", "ytflix-card__link");
    anchor.href = card.href;
    anchor.setAttribute("aria-label", `Play ${card.title}`);

    const art = imageNode(card, "ytflix-card__art");
    if (rank) art.appendChild(makeElement("span", "ytflix-card__rank", String(rank)));
    if (card.duration) art.appendChild(makeElement("span", "ytflix-card__duration", card.duration));
    if (card.sponsored) art.appendChild(makeElement("span", "ytflix-card__sponsored", "Sponsored"));
    if (card.progress > 0 && card.progress < 98) {
      const progressTrack = makeElement("span", "ytflix-card__progress");
      const progressBar = makeElement("span", "ytflix-card__progress-bar");
      progressBar.style.transform = `scaleX(${card.progress / 100})`;
      progressTrack.appendChild(progressBar);
      art.appendChild(progressTrack);
    }

    const overlay = makeElement("div", "ytflix-card__overlay");
    const actions = makeElement("div", "ytflix-card__actions");
    const listButton = createMyListButton(card);
    const remove = makeElement("button", "ytflix-card-action ytflix-card-action--remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${card.title} from YTFLIX`);
    remove.title = "Not for me";
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void hideCard(card);
    });
    actions.append(listButton, remove);
    overlay.appendChild(actions);
    overlay.appendChild(makeElement("p", "ytflix-card__match", `${core.matchScore(card)}% your vibe`));
    overlay.appendChild(makeElement("h3", "ytflix-card__title", card.title));
    if (card.channel) overlay.appendChild(makeElement("p", "ytflix-card__channel", card.channel));
    if (card.metadata) overlay.appendChild(makeElement("p", "ytflix-card__metadata", card.metadata));
    anchor.appendChild(art);
    wrapper.append(anchor, overlay);
    return wrapper;
  }

  function createHero(card, pageTitle) {
    const hero = makeElement("section", "ytflix-hero");
    hero.setAttribute("aria-label", "Featured title");
    const art = imageNode(card, "ytflix-hero__art");
    const content = makeElement("div", "ytflix-hero__content");
    content.appendChild(makeElement("p", "ytflix-eyebrow", pageTitle));
    content.appendChild(makeElement("h1", "ytflix-hero__title", card.title));

    const meta = [card.channel, card.metadata].filter(Boolean).join(" · ");
    if (meta) content.appendChild(makeElement("p", "ytflix-hero__meta", meta));
    content.appendChild(
      makeElement("p", "ytflix-hero__description", "Your YouTube feed, recut as tonight’s streaming lineup.")
    );

    const actions = makeElement("div", "ytflix-hero__actions");
    const play = makeElement("a", "ytflix-button ytflix-button--primary", "▶ Play");
    play.href = card.href;
    const listButton = createMyListButton(card, "ytflix-button ytflix-button--secondary");
    actions.append(play, listButton);
    content.appendChild(actions);
    hero.append(art, content);
    return hero;
  }

  function railNames(route, pageTitle) {
    if (route === "home") {
      return ["Trending Now", "More for You", "Fresh on YouTube"];
    }
    if (location.pathname.includes("subscriptions")) {
      return ["Fresh From Your Subscriptions", "Catch Up Tonight", "More From Your Channels"];
    }
    if (location.pathname.includes("history")) {
      return ["Watch It Again", "Pick Up Where You Left Off", "Your Recent Obsessions"];
    }
    return [pageTitle, "Keep Watching", "More For You"];
  }

  function createRail(title, cards, ranked, headingTag = "h2") {
    const section = makeElement("section", "ytflix-rail-section");
    const headingRow = makeElement("div", "ytflix-rail-section__heading");
    headingRow.appendChild(makeElement(headingTag, "ytflix-rail-section__title", title));
    const controls = makeElement("div", "ytflix-rail-controls");
    const previous = makeElement("button", "ytflix-rail-control", "‹");
    const next = makeElement("button", "ytflix-rail-control", "›");
    previous.type = "button";
    next.type = "button";
    previous.setAttribute("aria-label", `Scroll ${title} backward`);
    next.setAttribute("aria-label", `Scroll ${title} forward`);
    controls.append(previous, next);
    headingRow.appendChild(controls);

    const viewport = makeElement("div", "ytflix-rail");
    cards.forEach((card, index) => viewport.appendChild(createCard(card, ranked ? index + 1 : 0)));
    previous.addEventListener("click", () => viewport.scrollBy({ left: -viewport.clientWidth * 0.86, behavior: "smooth" }));
    next.addEventListener("click", () => viewport.scrollBy({ left: viewport.clientWidth * 0.86, behavior: "smooth" }));

    section.append(headingRow, viewport);
    return section;
  }

  function createTopicCollection() {
    const visibleRails = state.topicRails
      .map((rail) => ({
        title: rail.title,
        cards: core.filterHiddenCards(rail.cards, state.hiddenCards)
      }))
      .filter((rail) => rail.cards.length);
    if (!visibleRails.length) return null;

    const section = makeElement("section", "ytflix-topic-collection");
    section.setAttribute("aria-labelledby", "ytflix-topic-collection-title");
    const heading = makeElement("div", "ytflix-topic-collection__heading");
    heading.appendChild(makeElement("p", "ytflix-eyebrow", "Picked from your YouTube Home"));
    const title = makeElement("h2", "ytflix-topic-collection__title", "Explore more topics");
    title.id = "ytflix-topic-collection-title";
    heading.appendChild(title);
    section.appendChild(heading);
    visibleRails.forEach((rail) => section.appendChild(createRail(rail.title, rail.cards, false, "h3")));
    return section;
  }

  function createGrid(title, cards, eyebrow = "Browse YouTube") {
    const section = makeElement("section", "ytflix-grid-section");
    section.appendChild(makeElement("p", "ytflix-eyebrow", eyebrow));
    section.appendChild(makeElement("h1", "ytflix-page-title", title));
    if (!cards.length) {
      section.appendChild(
        makeElement("p", "ytflix-empty-state", "Nothing here yet. Add a title from any card and it’ll be waiting for tonight.")
      );
      return section;
    }
    const grid = makeElement("div", "ytflix-grid");
    cards.forEach((card) => grid.appendChild(createCard(card, 0)));
    section.appendChild(grid);
    return section;
  }

  function createLibraryPage(cards) {
    const wrapper = makeElement("section", "ytflix-library-page");
    wrapper.appendChild(makeElement("p", "ytflix-eyebrow", "Your YouTube"));
    wrapper.appendChild(makeElement("h1", "ytflix-page-title", "My Library"));

    const recentVideos = cards.filter((card) => !card.isCollection);
    const collections = cards.filter((card) => card.isCollection);
    if (recentVideos.length) wrapper.appendChild(createRail("Watch History", recentVideos, false));
    if (collections.length) wrapper.appendChild(createRail("Your Playlists & Collections", collections, false));
    return wrapper;
  }

  function renderPersonalView() {
    document.getElementById(WATCH_EXTRAS_ID)?.remove();
    const signature = [
      "personal",
      state.activeView,
      state.activeMood,
      ...state.myList.map(cardKey),
      ...state.lastCards.map(cardKey)
    ].join("::");
    if (signature === state.signature && document.getElementById(ROOT_ID)) return;
    state.signature = signature;

    const root = makeElement("div", "ytflix-app");
    root.id = ROOT_ID;
    root.dataset.ytflixScrollContext = `personal:${state.activeView}:${state.activeMood}`;
    root.appendChild(createHeader("home"));
    const main = makeElement("main", "ytflix-main ytflix-main--collection");

    if (state.activeView === "my-list") {
      main.appendChild(createGrid("My List", state.myList, "Saved for tonight"));
    } else {
      const labels = {
        funny: "Something funny",
        comfort: "Background comfort",
        music: "Date-night music",
        deep: "Something absorbing"
      };
      const cards = core.filterCardsByMood(state.lastCards, state.activeMood);
      main.appendChild(createGrid(labels[state.activeMood] || "Tonight’s picks", cards, "Matched to your mood"));
    }

    root.appendChild(main);
    installRoot(root);
  }

  function createSkeleton(route) {
    const root = makeElement("div", "ytflix-app ytflix-app--loading");
    root.id = ROOT_ID;
    root.dataset.ytflixScrollContext = `${route}:${location.pathname}${location.search}`;
    root.appendChild(createHeader(route));
    const main = makeElement("main", "ytflix-main");
    const hero = makeElement("div", "ytflix-skeleton ytflix-skeleton--hero");
    main.appendChild(hero);
    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      const row = makeElement("div", "ytflix-skeleton-row");
      for (let cardIndex = 0; cardIndex < 5; cardIndex += 1) {
        row.appendChild(makeElement("div", "ytflix-skeleton ytflix-skeleton--card"));
      }
      main.appendChild(row);
    }
    root.appendChild(main);
    return root;
  }

  function installRoot(root, completesStartup = true) {
    const previousRoot = document.getElementById(ROOT_ID);
    const preserveScroll = Boolean(
      previousRoot &&
      previousRoot.dataset.ytflixScrollContext === root.dataset.ytflixScrollContext
    );
    const scrollTop = preserveScroll ? previousRoot.scrollTop : 0;
    const railOffsets = new Map();
    if (preserveScroll) {
      for (const section of previousRoot.querySelectorAll(".ytflix-rail-section")) {
        const title = section.querySelector(".ytflix-rail-section__title")?.textContent || "";
        const rail = section.querySelector(".ytflix-rail");
        if (title && rail) railOffsets.set(title, rail.scrollLeft);
      }
    }
    previousRoot?.remove();
    document.body.appendChild(root);

    const restoreScroll = () => {
      if (!preserveScroll) return;
      root.scrollTop = scrollTop;
      for (const section of root.querySelectorAll(".ytflix-rail-section")) {
        const title = section.querySelector(".ytflix-rail-section__title")?.textContent || "";
        const rail = section.querySelector(".ytflix-rail");
        if (rail) rail.scrollLeft = railOffsets.get(title) || 0;
      }
    };
    restoreScroll();
    window.requestAnimationFrame(() => {
      restoreScroll();
      delete document.documentElement.dataset.ytflixPending;
      if (completesStartup) finishStartupSequence();
    });
  }

  function renderBrowse(route, cards) {
    window.clearTimeout(state.stillWatchingTimer);
    state.stillWatchingTimer = null;
    state.stillWatchingHref = "";
    document.getElementById(TOAST_ID)?.remove();
    const root = makeElement("div", "ytflix-app");
    root.id = ROOT_ID;
    root.dataset.ytflixScrollContext = `${route}:${location.pathname}${location.search}`;
    root.appendChild(createHeader(route));
    const main = makeElement("main", "ytflix-main");
    const pageTitle = getNativePageTitle(route);

    if (route === "feed" && location.pathname.includes("/history")) {
      main.appendChild(createGrid("Watch History", cards));
    } else if (route === "feed" && location.pathname.includes("/you")) {
      main.appendChild(createLibraryPage(cards));
    } else if (route === "search" || route === "channel" || route === "playlist") {
      if (route === "channel" && cards[0]) main.appendChild(createHero(cards[0], pageTitle));
      main.appendChild(createGrid(pageTitle, cards));
    } else if (route === "home") {
      main.appendChild(createHero(cards[0], pageTitle));
      const continueWatching = cards.filter((card) => card.progress > 0 && card.progress < 98);
      if (continueWatching.length) main.appendChild(createRail("Continue Watching", continueWatching, false));
      main.appendChild(createRail("Top 10 Tonight", cards.slice(0, 10), true));
      if (cards.length > 10) main.appendChild(createRail("More for You", cards.slice(10, 22), false));
      if (cards.length > 22) main.appendChild(createRail("Fresh on YouTube", cards.slice(22, 34), false));
      const topics = createTopicCollection();
      if (topics) main.appendChild(topics);
    } else {
      main.appendChild(createHero(cards[0], pageTitle));
      const groups = core.groupCards(cards, 8);
      const names = railNames(route, pageTitle);
      groups.slice(0, names.length).forEach((group, index) => {
        main.appendChild(createRail(names[index], group, index === 0));
      });
    }

    root.appendChild(main);
    installRoot(root);
  }

  function showStillWatching() {
    if (document.getElementById(TOAST_ID) || core.classifyRoute(location.href) !== "watch") return;
    const toast = makeElement("aside", "ytflix-still-watching");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    const copy = makeElement("div", "ytflix-still-watching__copy");
    copy.append(
      makeElement("strong", "", "Still watching?"),
      makeElement("span", "", "Excellent commitment. Carry on.")
    );
    const dismiss = makeElement("button", "ytflix-still-watching__button", "Obviously");
    dismiss.type = "button";
    dismiss.addEventListener("click", () => toast.remove());
    toast.append(copy, dismiss);
    document.body.appendChild(toast);
  }

  function scheduleStillWatching() {
    if (state.stillWatchingHref === location.href && state.stillWatchingTimer) return;
    window.clearTimeout(state.stillWatchingTimer);
    state.stillWatchingHref = location.href;
    state.stillWatchingTimer = window.setTimeout(showStillWatching, STILL_WATCHING_DELAY);
  }

  function renderWatch(route, cards) {
    const root = makeElement("div", "ytflix-app ytflix-app--watch");
    root.id = ROOT_ID;
    root.dataset.ytflixScrollContext = `${route}:${location.pathname}${location.search}`;
    root.appendChild(createHeader(route));
    installRoot(root);
    scheduleStillWatching();

    document.getElementById(WATCH_EXTRAS_ID)?.remove();
    const recommendations = cards.filter((card) => card.href !== location.href).slice(0, 16);
    if (!recommendations.length) return;

    const extras = makeElement("div", "ytflix-watch-extras");
    extras.id = WATCH_EXTRAS_ID;
    extras.appendChild(createRail("More Like This", recommendations, false));
    const watchScope = nativeScope();
    const comments = watchScope.querySelector("#comments");
    const primary = watchScope.querySelector("#primary-inner");
    if (comments?.parentElement) comments.parentElement.insertBefore(extras, comments);
    else primary?.appendChild(extras);
  }

  function applyPageMode(route) {
    const isWatch = route === "watch";
    if (!isWatch && state.lightsDown) setLightsDown(false);
    document.documentElement.setAttribute(ACTIVE_ATTRIBUTE, "true");
    document.documentElement.setAttribute(MODE_ATTRIBUTE, isWatch ? "watch" : "browse");
    document.documentElement.setAttribute(ROUTE_ATTRIBUTE, route);
  }

  function showNativeRoute(route) {
    finishStartupSequence(true);
    setLightsDown(false);
    closeDialog(MOOD_ID);
    closeDialog(PROFILE_ID);
    document.getElementById(TOAST_ID)?.remove();
    document.getElementById(REMOVAL_TOAST_ID)?.remove();
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(WATCH_EXTRAS_ID)?.remove();
    document.documentElement.removeAttribute(ACTIVE_ATTRIBUTE);
    document.documentElement.removeAttribute(MODE_ATTRIBUTE);
    document.documentElement.setAttribute(ROUTE_ATTRIBUTE, route);
    delete document.documentElement.dataset.ytflixPending;
    state.signature = "";
  }

  function render() {
    if (!state.enabled || !document.body || state.isNavigating) return;
    if (state.activeView) {
      applyPageMode("home");
      renderPersonalView();
      return;
    }

    const route = core.classifyRoute(location.href);
    if (route === "unsupported" || route === "shorts") {
      showNativeRoute(route);
      return;
    }

    const cards = collectCards();
    if (cards.length) state.lastCards = cards;
    if (state.fallbackHref === location.href && !cards.length) {
      showNativeRoute(route);
      return;
    }
    applyPageMode(route);
    syncHeaderAvatar();
    maybeCollectTopicRails(route);

    if (!cards.length) {
      if (route === "watch") {
        state.emptyHref = "";
        state.emptySince = 0;
        renderWatch(route, []);
        return;
      }

      if (state.emptyHref !== location.href) {
        state.emptyHref = location.href;
        state.emptySince = Date.now();
      }

      const remaining = EMPTY_STATE_TIMEOUT - (Date.now() - state.emptySince);
      if (remaining <= 0) {
        state.fallbackHref = location.href;
        showNativeRoute(route);
        return;
      }

      if (!document.getElementById(ROOT_ID)) installRoot(createSkeleton(route), false);
      scheduleRender(Math.max(100, remaining));
      return;
    }

    state.emptyHref = "";
    state.emptySince = 0;
    state.fallbackHref = "";
    const signature = [
      core.buildSignature(`${route}:${location.pathname}${location.search}`, cards),
      core.buildTopicSignature(state.topicRails)
    ].join("::topics::");
    if (signature === state.signature && document.getElementById(ROOT_ID)) return;
    state.signature = signature;

    if (route === "watch") renderWatch(route, cards);
    else renderBrowse(route, cards);
  }

  function scheduleRender(delay) {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(render, delay ?? 180);
  }

  function mutationBelongsToYTFlix(mutation) {
    const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    return Boolean(
      target?.closest?.(
        `#${ROOT_ID}, #${WATCH_EXTRAS_ID}, #${MOOD_ID}, #${PROFILE_ID}, #${TOAST_ID}, #${REMOVAL_TOAST_ID}`
      )
    );
  }

  function startObservers() {
    if (!state.observer) {
      state.observer = new MutationObserver((mutations) => {
        if (mutations.every(mutationBelongsToYTFlix)) return;
        scheduleRender();
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    document.addEventListener("yt-navigate-start", handleYouTubeNavigationStart);
    document.addEventListener("yt-navigate-finish", handleYouTubeNavigation);
    state.locationTimer = window.setInterval(() => {
      if (location.href === state.lastHref) return;
      state.lastHref = location.href;
      resetTopicCollection();
      state.signature = "";
      scheduleRender(50);
    }, 350);
  }

  function stopObservers() {
    state.observer?.disconnect();
    state.observer = null;
    document.removeEventListener("yt-navigate-start", handleYouTubeNavigationStart);
    document.removeEventListener("yt-navigate-finish", handleYouTubeNavigation);
    window.clearInterval(state.locationTimer);
    window.clearTimeout(state.renderTimer);
    window.clearTimeout(state.navigationTimer);
    window.clearTimeout(state.stillWatchingTimer);
    state.locationTimer = null;
    state.renderTimer = null;
    state.navigationTimer = null;
    state.stillWatchingTimer = null;
  }

  function handleYouTubeNavigation() {
    state.isNavigating = false;
    window.clearTimeout(state.navigationTimer);
    state.navigationTimer = null;
    if (location.href !== state.lastHref) {
      state.lastHref = location.href;
      resetTopicCollection();
      state.signature = "";
    }
    scheduleRender(50);
  }

  function handleYouTubeNavigationStart() {
    state.isNavigating = true;
    resetTopicCollection();
    state.activeView = "";
    state.activeMood = "";
    setLightsDown(false);
    closeDialog(MOOD_ID);
    closeDialog(PROFILE_ID);
    window.clearTimeout(state.stillWatchingTimer);
    state.stillWatchingTimer = null;
    state.stillWatchingHref = "";
    document.getElementById(TOAST_ID)?.remove();
    document.getElementById(REMOVAL_TOAST_ID)?.remove();
    window.clearTimeout(state.navigationTimer);
    state.navigationTimer = window.setTimeout(() => {
      state.isNavigating = false;
      scheduleRender(0);
    }, 2500);
    document.documentElement.dataset.ytflixPending = "true";
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(WATCH_EXTRAS_ID)?.remove();
    state.signature = "";
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    if (!state.enabled) {
      state.isNavigating = false;
      resetTopicCollection();
      stopObservers();
      showNativeRoute(core.classifyRoute(location.href));
      return;
    }

    startObservers();
    scheduleRender(0);
  }

  async function initialize() {
    if (!document.body) {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }

    let enabled = true;
    try {
      const settings = await chrome.storage.local.get({
        enabled: true,
        hiddenCards: [],
        myList: []
      });
      enabled = settings.enabled !== false;
      state.hiddenCards = Array.from(
        new Set((settings.hiddenCards || []).map((key) => String(key)).filter(Boolean))
      );
      state.myList = core.dedupeCards(settings.myList || []).filter((card) => !isHidden(card));
    } catch (_error) {
      enabled = true;
    }

    if (enabled) await claimStartupSequence();
    setEnabled(enabled);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.myList) {
        state.myList = core.dedupeCards(changes.myList.newValue || []).filter((card) => !isHidden(card));
        syncMyListButtons();
        if (state.activeView === "my-list") {
          state.signature = "";
          scheduleRender(0);
        }
      }
      if (changes.hiddenCards) {
        state.hiddenCards = Array.from(
          new Set((changes.hiddenCards.newValue || []).map((key) => String(key)).filter(Boolean))
        );
        state.myList = state.myList.filter((card) => !isHidden(card));
        state.lastCards = state.lastCards.filter((card) => !isHidden(card));
        state.signature = "";
        scheduleRender(0);
      }
      if (!changes.enabled) return;
      const nextEnabled = changes.enabled.newValue !== false;
      if (!nextEnabled) {
        setEnabled(false);
        return;
      }

      void claimStartupSequence().finally(() => setEnabled(true));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (
        document.getElementById(MOOD_ID) ||
        document.getElementById(PROFILE_ID)
      ) return;
      if (state.lightsDown) setLightsDown(false);
    });
  }

  initialize();
})();
