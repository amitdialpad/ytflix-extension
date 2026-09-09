# YTFLIX

> Useless project #4984
>
> I got bored with the YouTube UI, so I made this Chrome extension that turns YouTube into Netflix. Enjoy responsibly.
>
> Want to contribute to this stupid project by fixing bugs or adding another feature? Feel free to raise a PR. Let's make it properly useless.

YTFLIX recuts the live YouTube desktop interface as a cinematic streaming library. It uses the thumbnails, titles, links, player, account state, and actions already rendered by YouTube. It does not call YouTube APIs or replace the video player.

## Demo

https://github.com/user-attachments/assets/ec2c28fb-028b-4a8c-ad27-364254dadd25


## Install from source

You need desktop Google Chrome and Git.

```sh
git clone https://github.com/amitdialpad/ytflix-extension.git
cd ytflix-extension
```

Then:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the cloned `ytflix-extension` folder.
5. Open or reload `https://www.youtube.com`.

Use the YTFLIX toolbar popup to switch between **Useless project #4984** and classic YouTube.

## What changes

- Home becomes a featured hero with horizontal streaming-style rails.
- My Shows presents subscriptions as a dedicated poster library.
- Watch Again turns YouTube history into a browsable grid.
- My Library separates recent viewing from playlists and saved collections.
- Search, channel, and playlist pages become cinematic poster grids.
- Watch pages keep YouTube's native player and actions in a darker theater layout.
- YouTube's single-page navigation is observed so YTFLIX rebuilds after route changes.
- A startup cover holds the page until the YTFLIX shell is ready, avoiding a flash of the original homepage.
- Missing images use varied color artwork instead of repeating a logo placeholder.

## Updating your local copy

```sh
git pull
```

Then open `chrome://extensions`, press **Reload** on the YTFLIX card, and refresh YouTube.

## Project structure

```text
manifest.json        Chrome extension manifest
src/core.js          URL, route, card, and thumbnail helpers
src/content.js       YouTube extraction and YTFLIX rendering
src/styles.css       Streaming-library presentation and startup cover
popup/               Extension toolbar controls
tests/core.test.js   Dependency-free Node tests for core behavior
```

There is no build step and no package install. Chrome runs the source directly.

## Run the checks

Node.js 20 or newer is recommended.

```sh
node --check src/core.js
node --check src/content.js
node --check popup/popup.js
node --test tests/core.test.js
```

## Contributing

1. Fork the repository.
2. Create a branch: `git switch -c fix/short-description`.
3. Make the smallest useful change.
4. Run the checks above and test the unpacked extension on YouTube.
5. Open a pull request explaining what changed and which YouTube routes you tested.

Bug fixes, selector repairs, accessibility improvements, and properly useless features are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the practical details.

## Prototype boundaries

- Desktop Chrome only; this is not yet packaged for the Chrome Web Store.
- Shorts, Studio, uploads, purchases, account management, and unsupported routes stay native.
- Rail headings are playful presentation labels, not YouTube recommendation metadata.
- Sponsored cards remain labeled when YouTube exposes them; player ads are not intercepted or skipped.
- No remote code, analytics, data collection, or extension-originated network requests.
- The only saved setting is whether YTFLIX is on or off.

YouTube changes its DOM regularly. If extraction stops working, switch YTFLIX off from the popup and update the selector adapter in `src/content.js`.

## License

[MIT](LICENSE)
