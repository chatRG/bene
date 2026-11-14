# Notice and attribution

## Unofficial status

Bevel Community is an independent, clean-room project. It is not affiliated with, endorsed by, sponsored by, or connected to Finerpoint, Inc., Starlight Tech LLC, or the Bevel app.

“Bevel”, “Bevel: AI Health Coach”, and associated logos are trademarks of their respective owners. This repository does not include any Bevel application code, binaries, assets, fonts, or proprietary content. The UI is an original implementation inspired by publicly visible product behaviour and App Store screenshots.

## Clean-room sources

The behavioural specification used to design this build was assembled from public material:

- Bevel's public help centre (feature documentation, settings paths, error states).
- Bevel's public methodology blog (score inputs, ranges, the deep-sleep target curve, food-quality contributor points).
- Public App Store listing screenshots and metadata.
- Public App Store reviews for edge-case behaviour.
- The public NOOP project (architecture inspiration for an offline, local-first health app; no code copied).

No private API, binary, or proprietary algorithm is used. Where the vendor does not publish weights or thresholds, this project uses an independent model documented in [docs/SCORING.md](docs/SCORING.md).

## Third-party software

| Package | License | Use |
|---|---|---|
| React / React DOM | MIT | UI runtime |
| React Router | MIT | hash routing |
| Zustand | MIT | persisted state |
| date-fns | MIT | date formatting |
| lucide-react | ISC | icon set |
| Inter (via Fontsource) | OFL-1.1 | UI typeface |
| Capacitor | MIT | iOS/Android shells |
| Vite / Vitest / TypeScript | MIT / Apache-2.0 | build and tests |
| Playwright | Apache-2.0 | local visual/E2E checks (dev only) |

See each package's license for full text. The Inter font is distributed under the SIL Open Font License.

## Health disclaimer

This application produces wellness estimates. It is not a medical device, does not diagnose or treat any condition, and must not be used to make medication or treatment decisions. If you feel unwell, contact a qualified clinician.

## Privacy

The app contains no analytics, telemetry, advertising SDKs, or network calls. All data stays in the local app container; backups are user-initiated files. Demo data is synthetic.
