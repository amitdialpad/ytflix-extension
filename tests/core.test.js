"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");

test("classifies supported YouTube route families", () => {
  const routes = [
    ["https://www.youtube.com/", "home"],
    ["https://www.youtube.com/watch?v=123", "watch"],
    ["https://www.youtube.com/results?search_query=design", "search"],
    ["https://www.youtube.com/feed/subscriptions", "feed"],
    ["https://www.youtube.com/@dialpad/videos", "channel"],
    ["https://www.youtube.com/channel/UC123", "channel"],
    ["https://www.youtube.com/playlist?list=123", "playlist"],
    ["https://www.youtube.com/shorts/abc", "shorts"],
    ["https://www.youtube.com/account", "unsupported"]
  ];

  for (const [url, expected] of routes) assert.equal(core.classifyRoute(url), expected);
});

test("uses the live search query in the route label", () => {
  assert.equal(
    core.routeLabel("https://www.youtube.com/results?search_query=interaction%20design"),
    "Results for “interaction design”"
  );
});

test("normalizes, deduplicates, and preserves sponsored cards", () => {
  const cards = core.dedupeCards([
    { title: "  A   Good Video  ", href: "/watch?v=1", sponsored: true },
    { title: "A Good Video", href: "https://www.youtube.com/watch?v=1" },
    { title: "Another Video", href: "/watch?v=2" }
  ]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, "A Good Video");
  assert.equal(cards[0].sponsored, true);
  assert.equal(cards[0].href, "https://www.youtube.com/watch?v=1");
});

test("deduplicates time-stamped variants of the same video", () => {
  const cards = core.dedupeCards([
    { title: "First visit", href: "/watch?v=dQw4w9WgXcQ&t=10s" },
    { title: "Second visit", href: "/watch?v=dQw4w9WgXcQ&t=90s" }
  ]);

  assert.equal(cards.length, 1);
});

test("keeps collections that happen to share a lead video", () => {
  const cards = core.dedupeCards([
    { title: "Collection One", href: "/watch?v=dQw4w9WgXcQ&list=PLONE", isCollection: true },
    { title: "Collection Two", href: "/watch?v=dQw4w9WgXcQ&list=PLTWO", isCollection: true }
  ]);

  assert.equal(cards.length, 2);
});

test("filters Shorts from cinematic rails", () => {
  const cards = core.dedupeCards([
    { title: "Landscape", href: "/watch?v=1" },
    { title: "Vertical", href: "/shorts/2", isShort: true }
  ]);

  assert.deepEqual(cards.map((card) => card.title), ["Landscape"]);
});

test("groups cards deterministically", () => {
  const cards = Array.from({ length: 10 }, (_, index) => ({ title: `Card ${index}` }));
  const groups = core.groupCards(cards, 4);
  assert.deepEqual(groups.map((group) => group.length), [4, 4, 2]);
});

test("builds a stable signature from the visible content", () => {
  const cards = [{ href: "https://www.youtube.com/watch?v=1", title: "One" }];
  assert.equal(
    core.buildSignature("home", cards),
    "home::https://www.youtube.com/watch?v=1|One"
  );
});

test("extracts YouTube video IDs from supported URL shapes", () => {
  const videoId = "dQw4w9WgXcQ";
  assert.equal(core.videoIdFromUrl(`/watch?v=${videoId}&pp=tracking`), videoId);
  assert.equal(core.videoIdFromUrl(`https://youtu.be/${videoId}?si=tracking`), videoId);
  assert.equal(core.videoIdFromUrl(`/shorts/${videoId}`), videoId);
  assert.equal(core.videoIdFromUrl(`/live/${videoId}`), videoId);
  assert.equal(core.videoIdFromUrl(`/embed/${videoId}`), videoId);
});

test("rejects non-video destinations and malformed IDs", () => {
  assert.equal(core.videoIdFromUrl("/playlist?list=PL123"), "");
  assert.equal(core.videoIdFromUrl("/playables/game"), "");
  assert.equal(core.videoIdFromUrl("/watch?v=too-short"), "");
  assert.equal(core.videoIdFromUrl("https://example.com/watch?v=dQw4w9WgXcQ"), "");
});

test("builds a reliable YouTube thumbnail fallback", () => {
  assert.equal(
    core.thumbnailFromUrl("/watch?v=dQw4w9WgXcQ"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  );
  assert.equal(core.thumbnailFromUrl("/playlist?list=PL123"), "");
});
