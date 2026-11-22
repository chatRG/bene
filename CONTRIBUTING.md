# Contributing

Thank you for your help with this local-first health app. The project is small enough to understand in one afternoon. We want to keep it small.

## Ground rules

1. **Offline first.** Bene does not use telemetry, required network calls or accounts. A feature that needs a server must be optional and documented.
2. **One scoring implementation.** Scores live in `src/domain/scoring/` and run on every platform. Do not duplicate them in native code.
3. **Explain the number.** Each score change needs a line in `docs/SCORING.md` and at least one invariant test.
4. **Respect the data.** Health information is sensitive. Do not log it or upload it. Do not put it in fixtures that look like a real person.
5. **Small PRs.** Keep pull requests small. One screen or one score for each pull request is better than a 4,000-line rewrite.

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
- [ ] Document new score weights in `docs/SCORING.md`.
- [ ] Keep backup compatibility, or include a migration.

## Code style

- Use TypeScript strict mode. Avoid `any`.
- Use pure functions for domain logic. Use React only in `screens/` and `components/`.
- Use CSS variables from `src/styles/base.css`. Do not hard-code the palette in components.
- Prefer the existing primitives (`Ring`, `Sheet`, `ListRow`, `LineChart`) to new ones.
- Use icons from `lucide-react`. Do not use emoji glyphs for UI chrome, because system fonts differ.
- Use local `yyyy-MM-dd` keys for dates and ISO timestamps. Use `date-fns` for formatting.

## Adding a feature

1. Open an issue that describes the behaviour and the visible state machine.
2. Add the data shape to `src/domain/types.ts`.
3. Add the pure logic and the tests.
4. Wire the store action.
5. Build the screen with existing components.
6. Add a screenshot route in `scripts/screenshots.mjs`.
7. Update the README feature table if the change is user-visible.

## Reporting bugs

Include:

- platform (web / iOS / Android) and version,
- steps to reproduce,
- expected and actual behaviour,
- whether the bug reproduces from a fresh account (no stored data),
- a screenshot if the bug is visual.

Do not attach a real health backup. Reduce the case with synthetic fixture data inside a test, never a real person's health record.

## Security

Please do not open a public issue for a vulnerability that could expose health data. See [SECURITY.md](SECURITY.md).

## License

Bene is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Noncommercial use is free. Commercial use needs a separate paid licence (see [COMMERCIAL.md](COMMERCIAL.md)).

By contributing, you agree that:

1. You license your contribution under the PolyForm Noncommercial License 1.0.0.
2. You grant the maintainer a perpetual, worldwide, irrevocable, royalty-free right to relicense your contribution under any terms, including commercial terms.

If you cannot grant those rights, open an issue before you contribute.
