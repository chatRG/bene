# Contributing

Thanks for helping build a local-first health app. The project is intentionally small enough to understand in an afternoon, and we would like to keep it that way.

## Ground rules

1. **Offline first.** No telemetry, no required network calls, no accounts. A feature that needs a server must be optional and documented.
2. **One scoring implementation.** Scores live in `src/domain/scoring/` and run on every platform. Do not duplicate them in native code.
3. **Explain the number.** Every score change needs a line in `docs/SCORING.md` and at least one invariant test.
4. **Respect the data.** Health information is sensitive. Do not log it, upload it, or put it in fixtures that look like a real person.
5. **Small PRs.** A screen or a score per PR beats a 4,000-line rewrite.

## Setup

```bash
npm install
npm run dev
npm test
npm run lint
```

## Before opening a PR

- [ ] `npm test` passes.
- [ ] `npm run lint` passes (TypeScript, no unused symbols).
- [ ] `npm run build` succeeds.
- [ ] `npm run shots` renders every screen without console errors or horizontal overflow.
- [ ] New UI works in light and dark mode, at 375 px and 430 px widths.
- [ ] No new network calls (`fetch`, `XMLHttpRequest`, analytics).
- [ ] New score weights are documented in `docs/SCORING.md`.
- [ ] Backup compatibility is preserved, or a migration is included.

## Code style

- TypeScript strict mode; avoid `any`.
- Pure functions for domain logic; React only in `screens/` and `components/`.
- CSS variables from `src/styles/base.css`; no hard-coded palette in components.
- Prefer existing primitives (`Ring`, `Sheet`, `ListRow`, `LineChart`) over new ones.
- Icons come from `lucide-react`; never rely on emoji glyphs for UI chrome (system fonts differ).
- Dates: local `yyyy-MM-dd` keys, ISO timestamps, `date-fns` for formatting.

## Adding a feature

1. Open an issue describing the behaviour and the visible state machine.
2. Add the data shape to `src/domain/types.ts`.
3. Add the pure logic + tests.
4. Wire the store action.
5. Build the screen with existing components.
6. Add a screenshot route in `scripts/screenshots.mjs`.
7. Update the README feature table if user-visible.

## Reporting bugs

Include:

- platform (web / iOS / Android) and version,
- steps to reproduce,
- expected vs actual,
- whether it reproduces after `Reset demo data`,
- a screenshot if visual.

Do not attach a real health backup. Reduce the case with the demo dataset or a synthetic fixture.

## Security

Please do not open a public issue for a vulnerability that could expose health data. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the MIT License.
