(function startYTFlix() {
  "use strict";

  const core = globalThis.YTFlixCore;
  if (!core) return;

  const ROOT_ID = "ytflix-root";
  const WATCH_EXTRAS_ID = "ytflix-watch-extras";
  const ACTIVE_ATTRIBUTE = "data-ytflix-enabled";
  const MODE_ATTRIBUTE = "data-ytflix-mode";
  const ROUTE_ATTRIBUTE = "data-ytflix-route";
  const STARTUP_ID = "ytflix-startup";
  const CLAIM_STARTUP_MESSAGE = "ytflix-claim-startup";
  const STARTUP_SOUND_MESSAGE = "ytflix-play-startup-sound";
  const STARTUP_MINIMUM_DURATION = 2100;
  const STARTUP_EXIT_DURATION = 320;
  const EMPTY_STATE_TIMEOUT = 6500;
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
    startupRemoveTimer: null
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
      const card = extractCard(cardNode);
      if (card) cards.push(card);
    }

    return core.dedupeCards(cards).slice(0, 64);
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

    return null;
  }

  function getNativeAvatarSource() {
    const buttonImageSource = bestImageSource(getNativeAccountButton()?.querySelector("img"));
    if (buttonImageSource) state.avatarSource = buttonImageSource;

    if (!state.avatarSource) {
      const profileImage = Array.from(document.images).find((image) => {
        if (image.closest(`#${ROOT_ID}`)) return false;
        return /\/yti\//.test(bestImageSource(image));
      });
      const profileImageSource = bestImageSource(profileImage);
      if (profileImageSource) state.avatarSource = profileImageSource;
    }

    if (!state.avatarSource) {
      for (const script of document.scripts) {
        const match = script.textContent.match(/https:\/\/yt3\.ggpht\.com\/yti\/[^"\\\s]+/);
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
      accountButton.textContent = "f";
      accountButton.classList.add("is-fallback");
      accountButton.disabled = false;
    }
  }

  function syncHeaderAvatar() {
    updateAccountButton(document.querySelector(`#${ROOT_ID} .ytflix-account`));
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
        (path === "/" && route === "home") ||
        (path !== "/" && location.pathname.startsWith(path))
      ) {
        anchor.classList.add("is-active");
      }
      nav.appendChild(anchor);
    }
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

    const accountButton = makeElement("button", "ytflix-account");
    accountButton.type = "button";
    accountButton.setAttribute("aria-label", "Open YouTube account menu");
    accountButton.addEventListener("click", () => getNativeAccountButton()?.click());
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
      image.loading = className.includes("hero") ? "eager" : "lazy";
      if (className.includes("hero")) image.fetchPriority = "high";
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

  function createCard(card, rank) {
    const anchor = makeElement("a", "ytflix-card");
    anchor.href = card.href;
    anchor.setAttribute("aria-label", `Play ${card.title}`);

    const art = imageNode(card, "ytflix-card__art");
    if (rank) art.appendChild(makeElement("span", "ytflix-card__rank", String(rank)));
    if (card.duration) art.appendChild(makeElement("span", "ytflix-card__duration", card.duration));
    if (card.sponsored) art.appendChild(makeElement("span", "ytflix-card__sponsored", "Sponsored"));

    const overlay = makeElement("div", "ytflix-card__overlay");
    overlay.appendChild(makeElement("h3", "ytflix-card__title", card.title));
    if (card.channel) overlay.appendChild(makeElement("p", "ytflix-card__channel", card.channel));
    if (card.metadata) overlay.appendChild(makeElement("p", "ytflix-card__metadata", card.metadata));
    anchor.append(art, overlay);
    return anchor;
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

    const play = makeElement("a", "ytflix-button ytflix-button--primary", "▶ Play");
    play.href = card.href;
    content.appendChild(play);
    hero.append(art, content);
    return hero;
  }

  function railNames(route, pageTitle) {
    if (route === "home") {
      return ["Trending Now", "Because You Watched Everything", "Fresh on YouTube"];
    }
    if (location.pathname.includes("subscriptions")) {
      return ["Fresh From Your Subscriptions", "Catch Up Tonight", "More From Your Channels"];
    }
    if (location.pathname.includes("history")) {
      return ["Watch It Again", "Pick Up Where You Left Off", "Your Recent Obsessions"];
    }
    return [pageTitle, "Keep Watching", "More For You"];
  }

  function createRail(title, cards, ranked) {
    const section = makeElement("section", "ytflix-rail-section");
    const headingRow = makeElement("div", "ytflix-rail-section__heading");
    headingRow.appendChild(makeElement("h2", "ytflix-rail-section__title", title));
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

  function createGrid(title, cards) {
    const section = makeElement("section", "ytflix-grid-section");
    section.appendChild(makeElement("p", "ytflix-eyebrow", "Browse YouTube"));
    section.appendChild(makeElement("h1", "ytflix-page-title", title));
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

  function createSkeleton(route) {
    const root = makeElement("div", "ytflix-app ytflix-app--loading");
    root.id = ROOT_ID;
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
    document.getElementById(ROOT_ID)?.remove();
    document.body.appendChild(root);
    window.requestAnimationFrame(() => {
      delete document.documentElement.dataset.ytflixPending;
      if (completesStartup) finishStartupSequence();
    });
  }

  function renderBrowse(route, cards) {
    const root = makeElement("div", "ytflix-app");
    root.id = ROOT_ID;
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

  function renderWatch(route, cards) {
    const root = makeElement("div", "ytflix-app ytflix-app--watch");
    root.id = ROOT_ID;
    root.appendChild(createHeader(route));
    installRoot(root);

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
    document.documentElement.setAttribute(ACTIVE_ATTRIBUTE, "true");
    document.documentElement.setAttribute(MODE_ATTRIBUTE, isWatch ? "watch" : "browse");
    document.documentElement.setAttribute(ROUTE_ATTRIBUTE, route);
  }

  function showNativeRoute(route) {
    finishStartupSequence(true);
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
    const route = core.classifyRoute(location.href);
    if (route === "unsupported" || route === "shorts") {
      showNativeRoute(route);
      return;
    }

    const cards = collectCards();
    if (state.fallbackHref === location.href && !cards.length) {
      showNativeRoute(route);
      return;
    }
    applyPageMode(route);
    syncHeaderAvatar();

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
    const signature = core.buildSignature(`${route}:${location.pathname}${location.search}`, cards);
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
    return Boolean(target?.closest?.(`#${ROOT_ID}, #${WATCH_EXTRAS_ID}`));
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
    state.locationTimer = null;
    state.renderTimer = null;
    state.navigationTimer = null;
  }

  function handleYouTubeNavigation() {
    state.isNavigating = false;
    window.clearTimeout(state.navigationTimer);
    state.navigationTimer = null;
    if (location.href !== state.lastHref) {
      state.lastHref = location.href;
      state.signature = "";
    }
    scheduleRender(50);
  }

  function handleYouTubeNavigationStart() {
    state.isNavigating = true;
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
      const settings = await chrome.storage.local.get({ enabled: true });
      enabled = settings.enabled !== false;
    } catch (_error) {
      enabled = true;
    }

    if (enabled) await claimStartupSequence();
    setEnabled(enabled);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.enabled) return;
      const nextEnabled = changes.enabled.newValue !== false;
      if (!nextEnabled) {
        setEnabled(false);
        return;
      }

      void claimStartupSequence().finally(() => setEnabled(true));
    });
  }

  initialize();
})();
