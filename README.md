# YTFLIX

> Useless project #4984
>
> I got bored with the YouTube UI, so I made this Chrome extension that turns YouTube into Netflix. Enjoy responsibly.
>
> Want to contribute to this stupid project by fixing bugs or adding another feature? Feel free to raise a PR. Let's make it properly useless.

## [⬇ Download the latest YTFLIX (v0.3.0)](https://github.com/amitdialpad/ytflix-extension/archive/refs/heads/main.zip)

No coding or Git required. This link always downloads the newest version from `main`, including the startup ident, jingle, and extension icon.

## Install in Chrome

1. Click **Download YTFLIX here** above.
2. Unzip the downloaded file. On a Mac, double-click it.
3. Open `chrome://extensions` in Google Chrome.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the unzipped folder named `ytflix-extension-main`.
7. Open YouTube—or reload it if it was already open.

Keep the unzipped folder on your computer after installing it. Chrome needs it to run YTFLIX.

Use the YTFLIX toolbar popup to switch between **Useless project #4984** and classic YouTube.

## Screenshot
<img width="1582" height="893" alt="Screenshot 2026-09-09 at 15 51 18" src="https://github.com/user-attachments/assets/77587554-68c4-48be-8013-8a5d969bf6db" />


YTFLIX recuts the live YouTube desktop interface as a cinematic streaming library. It uses the thumbnails, titles, links, player, account state, and actions already rendered by YouTube. It does not call YouTube APIs or replace the video player.

## What changes

- Home becomes a featured hero with horizontal streaming-style rails.
- YouTube's Explore more topics shelf becomes a set of full, labeled rails, gathered without opening each topic yourself.
- My Shows presents subscriptions as a dedicated poster library.
- Watch Again turns YouTube history into a browsable grid.
- My Library separates recent viewing from playlists and saved collections.
- Search, channel, and playlist pages become cinematic poster grids.
- Watch pages keep YouTube's native player and actions in a darker theater layout, with a quick way to save the video beneath the player.
- YouTube's single-page navigation is observed so YTFLIX rebuilds after route changes.
- A startup cover holds the page until the YTFLIX shell is ready, avoiding a flash of the original homepage.
- A YT-to-YTFLIX ribbon ident and bundled cinematic jingle play together once per Chrome session; the interface appears as soon as the visual finishes while the audio resolves.
- Hover cards reveal My List and “Not for me” controls alongside a playful match score.
- My List is the first homepage rail, followed by any personal mood lists, before Continue Watching.
- The My Lists page lets you create named moods such as Cozy Night or Sunday Morning and sort saved videos into them.
- Continue Watching uses YouTube’s rendered resume progress, while My List and mood lists keep private local picks for later.
- Tonight’s Mood recuts the current recommendations into funny, cozy, musical, or deep-viewing collections—or chooses for you.
- The account avatar opens a playful “Who’s watching?” moment, including a Date Night shortcut into the mood picker.
- Lights Down turns watch pages into a distraction-free cinema view, with a rare “Still watching?” wink for heroic sessions.
- Missing images use varied color artwork instead of repeating a logo placeholder.

## Updating your local copy

Download the latest ZIP using the link at the top, replace your old YTFLIX folder, then press **Reload** on the YTFLIX card at `chrome://extensions`.

If you installed it with Git instead, run:

```sh
git pull
```

Then open `chrome://extensions`, press **Reload** on the YTFLIX card, and refresh YouTube.

## Project structure

```text
manifest.json        Chrome extension manifest
src/core.js          URL, route, card, and thumbnail helpers
src/content.js       YouTube extraction and YTFLIX rendering
src/background.js    One-time startup sound coordination
src/styles.css       Streaming-library presentation and startup cover
offscreen/           Extension-owned startup audio playback
assets/              Bundled startup jingle
icons/               Extension and toolbar icon sizes
popup/               Extension toolbar controls
tests/core.test.js   Dependency-free Node tests for core behavior
```

There is no build step and no package install. Chrome runs the source directly.

## Run the checks

Node.js 20 or newer is recommended.

```sh
node --check src/core.js
node --check src/content.js
node --check src/background.js
node --check offscreen/offscreen.js
node --check popup/popup.js
node --test tests/*.test.js
```

## Contributing

1. Fork the repository and clone your fork.
2. Create a branch: `git switch -c fix/short-description`.
3. Make the smallest useful change.
4. Run the checks above and test the unpacked extension on YouTube.
5. Open a pull request explaining what changed and which YouTube routes you tested.

Bug fixes, selector repairs, accessibility improvements, and properly useless features are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the practical details.

## Prototype boundaries

- Desktop Chrome 109 or newer only; this is not yet packaged for the Chrome Web Store.
- Shorts, Studio, uploads, purchases, account management, and unsupported routes stay native.
- Rail headings are playful presentation labels, not YouTube recommendation metadata.
- Sponsored cards remain labeled when YouTube exposes them; player ads are not intercepted or skipped.
- No remote code, analytics, data collection, third-party services, or hover-preview embeds.
- YTFLIX stores its enabled state, My List, mood lists, and removed-video preferences locally; the startup-ident gate resets when Chrome restarts.

YouTube changes its DOM regularly. If extraction stops working, switch YTFLIX off from the popup and update the selector adapter in `src/content.js`.

## License

[MIT](LICENSE)
