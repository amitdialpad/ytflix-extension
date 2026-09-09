"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackground() {
  const sessionValues = {};
  let messageListener = null;
  const chrome = {
    offscreen: {
      hasDocument: async () => false,
      createDocument: async () => {}
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      },
      sendMessage: async () => {}
    },
    storage: {
      session: {
        async get(defaults) {
          return { ...defaults, ...sessionValues };
        },
        async set(values) {
          Object.assign(sessionValues, values);
        }
      }
    }
  };

  const source = fs.readFileSync(path.join(__dirname, "../src/background.js"), "utf8");
  vm.runInNewContext(source, { chrome, Promise });

  return function dispatch(message) {
    return new Promise((resolve) => {
      const keepsChannelOpen = messageListener(message, {}, resolve);
      if (!keepsChannelOpen) resolve(undefined);
    });
  };
}

test("claims the startup ident only once per extension session", async () => {
  const dispatch = loadBackground();
  const [first, second] = await Promise.all([
    dispatch({ type: "ytflix-claim-startup" }),
    dispatch({ type: "ytflix-claim-startup" })
  ]);

  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal((await dispatch({ type: "ytflix-claim-startup" })).claimed, false);
});
