# Renaming the app

The app is now called **Bene** (renamed from the working name Bevel Community). This checklist documents the rename and how to change it again. Use one consistent brand name and keep the trademark notice accurate.

## 1. Decide scope

| Change | Required? | Notes |
|---|---|---|
| Display name | Yes | What users see under the icon. Can differ from the repository name. |
| Wordmark/UI strings | Yes | Onboarding, coach, Pro, About. |
| Bundle id / application id | Usually | Changing it creates a new app identity; existing installs will not update. Do this before the first store upload. |
| Repository name | Optional | Independent of the binary. |
| Icon | Optional | `assets/icon.png` + `assets/splash.png`, then regenerate. |

## 2. Display name and identifiers

- `capacitor.config.ts` — `appName`, `appId`
- `ios/App/App/Info.plist` — `CFBundleDisplayName`
- `ios/App/App.xcodeproj/project.pbxproj` — `PRODUCT_BUNDLE_IDENTIFIER` (or change it in Xcode)
- `android/app/src/main/res/values/strings.xml` — `app_name`, `title_activity_main`, `package_name`, `custom_url_scheme`
- `android/app/build.gradle` — `namespace`, `applicationId`
- `android/app/src/main/AndroidManifest.xml` — usually inherits the label; check it
- `package.json` — `name` (npm package, not user-facing)
- `index.html` — `<title>`, Apple web-app title
- `public/manifest.webmanifest` — `name`, `short_name`, `description`
- `README.md`, `NOTICE.md`, `CHANGELOG.md`, `docs/*`

After editing, run:

```bash
npm run build
npx cap sync
```

For iOS, re-open the workspace in Xcode; for Android, let Gradle sync. If the bundle id changed, remove the old app from the simulator/device before reinstalling.

## 3. UI strings

Search for `Bene` in `src/` and decide each occurrence:

- **Brand mark / onboarding** — the product name.
- **“Bene Intelligence”** — the coach. Rename to `<Name> Intelligence` or simply **Coach**.
- **“Bene Pro”** — the subscription. Rename to `<Name> Pro`.
- **Demo copy** — “Bene backup”, “Bene account” etc.
- **Settings / About / NOTICE** — keep the “not affiliated with Finerpoint” statement; add the new trademark owner if applicable.

A quick audit:

```bash
grep -rn "Bene" src index.html public README.md docs NOTICE.md | grep -v node_modules
```

Do not rename historical references in `NOTICE.md` that are required to describe the clean-room source; instead clarify that the product is now called `<New Name>`.

## 4. Icons and splash

Replace `assets/icon.png` (1024×1024, opaque) and `assets/splash.png` (2732×2732), then:

```bash
npx capacitor-assets generate --iconBackgroundColor '#F7F6F2' --splashBackgroundColor '#F7F6F2'
```

PWA icons in `public/icon-*.png` should be regenerated from the same artwork.

## 5. Trademark check

Before publishing:

- Search the chosen name in the App Store, Play Store, USPTO/UKIPO/EUIPO, and a domain registrar.
- Avoid names confusingly similar to Bevel, Whoop, Oura, Apple Health or Google Health.
- Keep the health disclaimer and the “not a medical device” language.
- Update `NOTICE.md` with the new name and any new trademark attribution.

## 6. Verification after rename

```bash
npm run lint && npm test && npm run build
npm run shots
```

Check that the onboarding wordmark, chat header, paywall, profile, settings/about, PWA install prompt, iOS home screen and Android launcher all show the new name. The bundle id change is the only step that cannot be undone for existing installs.
