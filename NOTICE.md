# Notice and attribution

## Third-party software

| Package | License | Use |
|---|---|---|
| React / React DOM | MIT | UI runtime |
| React Router | MIT | hash routing |
| Zustand | MIT | persisted state |
| date-fns | MIT | date formatting |
| lucide-react | ISC | icon set |
| Allo | OFL-1.1 | UI typeface |
| Capacitor | MIT | iOS/Android shells |
| Vite / Vitest / TypeScript | MIT / Apache-2.0 | build and tests |
| Playwright | Apache-2.0 | local visual/E2E checks (dev only) |

See each package's license for full text. The Allo font is distributed under the SIL Open Font License. The full licence text is in `src/assets/fonts/OFL.txt`.

## Scoring attribution

Bene's recovery and strain implementations are a TypeScript rewrite of the transparent
`RecoveryScorer` and `StrainScorer` formulas from the NOOP project (`ryanbr/noop`), which is
MIT-licensed. The formulas are documented in [docs/SCORING.md](docs/SCORING.md).

## Health disclaimer

This application produces wellness estimates. It is not a medical device, does not diagnose or treat any condition, and must not be used to make medication or treatment decisions. If you feel unwell, contact a qualified clinician.
