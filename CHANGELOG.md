# changelog

every release of tisco, newest first. versions follow [semver](https://semver.org).

## [0.5.0] · 2026-10-24

### added

- requests about how the footage looks are judged instead of refused: "the clips where he is smiling", "the well-lit takes". tisco extracts **three stills per clip** (start, middle, end) locally and sends them with the transcripts, after a separate upload confirmation.
- mixed requests are judged on what was said and what was shown. findings show a `look` score next to `match`.
- also published to GitHub Packages as `@ailiahq/tisco`. npm stays `@ailia/tisco`.
- terminal GIFs of the request, findings, and approve/undo flow in the README.

### changed

- judgments use `typesafe/jev-1.14` instead of `typesafe/jev-1.13`. decisions cached by 0.4.x are not reused; the cache key includes the model.
- first-run directory permission now says tisco may extract stills as well as audio.

requests that depend only on recording quality, file measurements, or history and taste are still refused with the missing evidence named. in mixed requests, those parts are still set aside.

## [0.4.1] · 2026-10-16

### changed

- the repository moved to the `ailiahq` organization. package metadata and README links point at github.com/ailiahq/tisco.
- releases are published by CI. every push runs the typecheck, unit tests, and terminal walkthrough; `v*` tags publish to npm.

## [0.4.0] · 2026-09-21

### added

- Jev judges clips against one shared workspace state: the directory structure, folder membership, transcripts, earlier findings, and your selections. a clip's questions are answered in a single batch and split back into per-clip decisions.
- a workspace too large for one request is split into batches deterministically. nothing is silently truncated.
- follow-up requests can ask which existing folder fits the selected clips. a folder is suggested only when it is the clear winner **and** strongly related on its own.

### changed

- the decision cache key includes a digest of the workspace, so folder or transcript changes invalidate reuse.

### removed

- the one-transcript-at-a-time classifier API.

## [0.3.1] · 2026-09-21

### added

- requests can target clips in a named existing folder: "find the price takes in day2". a folder mentioned only as a destination is never searched.

### changed

- README reorganized with badges and a guided workflow.

## [0.3.0] · 2026-09-21

first public release, on npm as `@ailia/tisco`.

- ask in plain language which clips said something. speech is transcribed by `microsoft/mai-transcribe-2` and judged by `typesafe/jev-1.13`, both through OpenRouter.
- findings are `MATCH`, `REVIEW`, `NO MATCH`, or `NOT JUDGED`, with match probabilities and transcript openings.
- create folders, move, and rename clips. every source and destination path is previewed, review candidates stay unchecked, and nothing changes before approval.
- `/undo` restores the latest applied plan from its journal.
- tisco asks before scanning a directory and before uploading any audio.

[0.5.0]: https://github.com/ailiahq/tisco/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/ailiahq/tisco/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/ailiahq/tisco/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ailiahq/tisco/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ailiahq/tisco/releases/tag/v0.3.0
