# Security policy

## What this app stores

Bene stores health-related data locally: sleep stages, heart-rate samples, workouts, meals, journal entries, biomarkers, health-record metadata and chat history. On the web this is `localStorage`; in the native shells it is the WebView's local storage inside the app sandbox.

Backups are plain JSON files created by the user and are not encrypted.

## Reporting a vulnerability

Please **do not** open a public issue for anything that could expose user data, including:

- XSS or HTML injection in a rendered health value or chat message,
- a backup import path that can execute code or escape validation,
- service-worker cache poisoning,
- unintended network transmission of health data,
- native shell configuration that exposes app files.

Contact the maintainers privately through the repository hosting provider's security advisory feature, or the contact listed in the repository profile. Include:

- affected version/commit,
- platform,
- reproduction steps,
- impact,
- a suggested fix if you have one.

You should receive an acknowledgement within a few days. Please give us a reasonable window to fix the issue before disclosure.

## Out of scope

- The accuracy of wellness scores; see `docs/SCORING.md` for limitations.
- The absence of encryption in user-created backup files (documented).
- Denial of service by importing an enormous backup in a local-only app (still welcome as a robustness report).
- Issues in third-party dependencies that do not affect this app; report them upstream.

## Hardening notes

- No `dangerouslySetInnerHTML` is used.
- Chat and journal text are rendered as text nodes.
- Backup import validates shape before mutating state.
- The service worker only caches same-origin GET requests.
- No analytics, telemetry or remote logging.
