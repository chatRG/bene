# Security policy

## What this app stores

Bene stores health-related data locally: sleep stages, heart-rate samples, workouts, meals, journal entries, biomarkers, health-record metadata and chat history. On the web, this data is in `localStorage`. In the native shells, it is in the WebView's local storage inside the app sandbox.

Backups are plain JSON files that the user creates. They are not encrypted.

## Reporting a vulnerability

Please **do not** open a public issue for anything that could expose user data, including:

- XSS or HTML injection in a rendered health value or chat message,
- a backup import path that can execute code or escape validation,
- service-worker cache poisoning,
- unintended network transmission of health data,
- native shell configuration that exposes app files.

Contact the maintainers privately through the security advisory feature of the repository hosting provider, or through the contact in the repository profile. Include:

- affected version/commit,
- platform,
- reproduction steps,
- impact,
- a suggested fix if you have one.

You should receive an acknowledgement within a few days. Please give us a reasonable window to fix the issue before disclosure.

## Out of scope

- The accuracy of wellness scores. See `docs/SCORING.md` for limitations.
- The absence of encryption in user-created backup files (documented).
- Denial of service by importing an enormous backup in a local-only app. We still welcome this as a robustness report.
- Issues in third-party dependencies that do not affect this app. Report them upstream.

## Hardening notes

- Bene does not use `dangerouslySetInnerHTML`.
- Bene renders chat and journal text as text nodes.
- Backup import validates the shape before it mutates state.
- The service worker caches only same-origin GET requests.
- Bene has no analytics, telemetry or remote logging.
