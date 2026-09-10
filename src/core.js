(function exposeYTFlixCore(globalScope) {
  "use strict";

  function parseUrl(input) {
    try {
      return new URL(input, "https://www.youtube.com");
    } catch (_error) {
      return new URL("https://www.youtube.com/");
    }
  }

  function classifyRoute(input) {
    const url = parseUrl(input);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") return "home";
    if (path === "/watch") return "watch";
    if (path === "/results") return "search";
    if (path === "/playlist") return "playlist";
    if (path === "/shorts" || path.startsWith("/shorts/")) return "shorts";
    if (path === "/feed" || path.startsWith("/feed/")) return "feed";
    if (
      path.startsWith("/@") ||
      path.startsWith("/channel/") ||
      path.startsWith("/c/") ||
      path.startsWith("/user/")
    ) {
      return "channel";
    }

    return "unsupported";
  }

  function routeLabel(input) {
    const url = parseUrl(input);
    const route = classifyRoute(url.href);

    if (route === "search") {
      const query = url.searchParams.get("search_query") || "Search";
      return `Results for “${query}”`;
    }

    if (route === "playlist") return "This Collection";
    if (route === "channel") return "Channel Spotlight";
    if (route === "watch") return "Now Playing";
    if (route === "home") return "Tonight on YouTube";

    const feedName = url.pathname.split("/").filter(Boolean).pop() || "feed";
    const labels = {
      subscriptions: "Fresh From Your Subscriptions",
      history: "Watch It Again",
      you: "My Library",
      playlists: "My Playlists",
      trending: "New & Popular"
    };

    return labels[feedName] || feedName.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function videoIdFromUrl(input) {
    const url = parseUrl(input);
    let videoId = "";

    if (url.hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (!/(^|\.)youtube\.com$/.test(url.hostname)) {
      return "";
    } else if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else if (/^\/(shorts|live|embed)\//.test(url.pathname)) {
      videoId = url.pathname.split("/").filter(Boolean)[1] || "";
    }

    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "";
  }

  function thumbnailFromUrl(input) {
    const videoId = videoIdFromUrl(input);
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
  }

  function cardKey(card) {
    const href = String(card?.href || "");
    return videoIdFromUrl(href) || href;
  }

  function filterHiddenCards(cards, hiddenKeys) {
    const hidden = new Set((hiddenKeys || []).map((key) => String(key)));
    return (cards || []).filter((card) => !hidden.has(cardKey(card)));
  }

  function normalizeCard(rawCard) {
    if (!rawCard || typeof rawCard !== "object") return null;

    const title = String(rawCard.title || "").replace(/\s+/g, " ").trim();
    const hrefValue = String(rawCard.href || "").trim();
    if (!title || !hrefValue) return null;

    let href;
    try {
      href = new URL(hrefValue, "https://www.youtube.com").href;
    } catch (_error) {
      return null;
    }

    if (!/^https?:$/.test(new URL(href).protocol)) return null;

    const rawProgress = Number(rawCard.progress);
    const progress = Number.isFinite(rawProgress) ? Math.min(100, Math.max(0, rawProgress)) : 0;

    return {
      title,
      href,
      thumbnail: String(rawCard.thumbnail || "").trim(),
      channel: String(rawCard.channel || "").replace(/\s+/g, " ").trim(),
      metadata: String(rawCard.metadata || "").replace(/\s+/g, " ").trim(),
      duration: String(rawCard.duration || "").replace(/\s+/g, " ").trim(),
      progress,
      isCollection: Boolean(rawCard.isCollection),
      sponsored: Boolean(rawCard.sponsored),
      isShort: Boolean(rawCard.isShort)
    };
  }

  function matchScore(card) {
    const source = `${card?.title || ""}|${card?.href || ""}`;
    let hash = 0;
    for (const character of source) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return 92 + (hash % 8);
  }

  function filterCardsByMood(cards, mood) {
    const keywords = {
      funny: ["comedy", "funny", "laugh", "stand-up", "standup", "sketch", "blooper"],
      comfort: ["cozy", "relax", "calm", "ambient", "lofi", "cooking", "travel", "satisfying"],
      music: ["music", "song", "concert", "live", "mix", "playlist", "acoustic", "session"],
      deep: ["documentary", "history", "science", "interview", "explained", "essay", "story"]
    };
    const terms = keywords[mood] || [];
    if (!terms.length) return [...(cards || [])];

    const matches = (cards || []).filter((card) => {
      const haystack = `${card.title} ${card.channel} ${card.metadata}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
    return matches.length ? matches : [...(cards || [])];
  }

  function eligibleForRail(card) {
    return Boolean(card && card.title && card.href && !card.isShort);
  }

  function dedupeCards(rawCards) {
    const seen = new Set();
    const cards = [];

    for (const rawCard of rawCards || []) {
      const card = normalizeCard(rawCard);
      if (!eligibleForRail(card)) continue;

      const videoId = card.isCollection ? "" : videoIdFromUrl(card.href);
      const key = videoId
        ? `video:${videoId}`
        : card.href.replace(/([?&])pp=[^&]+/, "$1").replace(/[?&]$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }

    return cards;
  }

  function groupCards(cards, groupSize) {
    const size = Math.max(1, Number(groupSize) || 8);
    const groups = [];

    for (let index = 0; index < cards.length; index += size) {
      groups.push(cards.slice(index, index + size));
    }

    return groups;
  }

  function buildSignature(route, cards) {
    return [route, ...(cards || []).slice(0, 48).map((card) => `${card.href}|${card.title}`)].join("::");
  }

  function normalizeTopicRails(rawRails) {
    const rails = [];
    const railByTitle = new Map();

    for (const rawRail of rawRails || []) {
      const title = String(rawRail?.title || "").replace(/\s+/g, " ").trim();
      if (!title) continue;

      const cards = dedupeCards(rawRail?.cards || []);
      if (!cards.length) continue;

      const titleKey = title.toLocaleLowerCase();
      const existing = railByTitle.get(titleKey);
      if (existing) {
        existing.cards = dedupeCards([...existing.cards, ...cards]);
        continue;
      }

      const rail = { title, cards };
      railByTitle.set(titleKey, rail);
      rails.push(rail);
    }

    return rails;
  }

  function normalizeMoodLists(rawLists) {
    const lists = [];
    const seenIds = new Set();

    for (const [index, rawList] of (rawLists || []).entries()) {
      if (!rawList || typeof rawList !== "object") continue;
      const name = String(rawList.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!name) continue;

      const requestedId = String(rawList.id || "").trim();
      let id = requestedId || `mood-${index + 1}`;
      while (seenIds.has(id)) id = `${id}-${index + 1}`;
      seenIds.add(id);
      lists.push({ id, name, cards: dedupeCards(rawList.cards || []) });
    }

    return lists;
  }

  function buildTopicSignature(topicRails) {
    return normalizeTopicRails(topicRails)
      .map((rail) => `${rail.title}::${rail.cards.slice(0, 16).map((card) => cardKey(card)).join("|")}`)
      .join("::topic::");
  }

  const api = {
    buildSignature,
    buildTopicSignature,
    cardKey,
    classifyRoute,
    dedupeCards,
    eligibleForRail,
    filterHiddenCards,
    filterCardsByMood,
    groupCards,
    matchScore,
    normalizeCard,
    normalizeMoodLists,
    normalizeTopicRails,
    routeLabel,
    thumbnailFromUrl,
    videoIdFromUrl
  };

  globalScope.YTFlixCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
