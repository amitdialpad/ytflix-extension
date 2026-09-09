# Contributing to YTFLIX

Thanks for helping make this properly useless.

## Before you start

- Search existing issues and pull requests before starting overlapping work.
- Keep changes focused. A selector fix and a new feature are easier to review as separate PRs.
- Preserve native YouTube behavior on routes YTFLIX does not support.
- Do not add tracking, remote code, API keys, or a dependency on the YouTube API.
- Do not hide, block, or interfere with ads.

## Local workflow

1. Fork and clone the repository.
2. Create a branch from `main`.
3. Load the repository folder through Chrome's **Load unpacked** flow.
4. Make your change.
5. Run:

   ```sh
   node --check src/core.js
   node --check src/content.js
   node --check popup/popup.js
   node --test tests/core.test.js
   ```

6. Reload the extension from `chrome://extensions` and test YouTube again.

## What to test

Please check the routes touched by your change. Useful coverage includes:

- Home
- My Shows
- Watch Again
- My Library
- Search results
- Channel and playlist pages
- A watch page
- Switching between YTFLIX and classic YouTube from the popup

Because YouTube serves different layouts to different accounts and regions, include your Chrome version and a short description of what you saw in the PR.

## Pull requests

Tell us:

- What changed and why.
- Which routes you tested.
- Which automated checks passed.
- Whether the change affects YouTube extraction selectors.

A short video is welcome when the change is visual, but it is not required.
