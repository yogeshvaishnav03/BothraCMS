# Bothra CMS — iPhone (iOS) & Android Mobile App Guide

Bothra CMS runs as an installable mobile application on **both iPhone / iPad (iOS)** and **Android** devices.

---

## 1. Quick Installation for End Users (Recommended — Zero App Store Review Needed)

> **Important Requirement:** Always access your deployed **HTTPS** URL (e.g., `https://bothra-cms.vercel.app` or your custom HTTPS domain). Apple and Google require HTTPS for offline Service Workers, GPS check-in, and Push Notifications.

### On iPhone & iPad (iOS)
Apple does **not** allow `.apk` files or arbitrary binary downloads from websites on iOS. Instead, install Bothra CMS via **Safari**:

1. Open `/install` (or the main login URL) in **Safari** on your iPhone (if someone sent the link on WhatsApp, tap **"Open in Safari"** rather than staying inside the WhatsApp preview).
2. Tap the **Share** button (**⎙** — square with upward arrow) in Safari's toolbar.
3. Scroll down and tap **"Add to Home Screen"** → tap **"Add"**.
4. Open **Bothra CMS** from your iPhone Home Screen icon.
   - Runs **full-screen** (no Safari address bar) with Notch / Dynamic Island safe areas.
   - Supports **Offline Caching & Outbox** (`/sw.js`) and **GPS Check-In**.
   - On **iOS 16.4+**, tap **"Enable Alerts"** after launching from the Home Screen to receive push notifications.

### On Android
Android supports two instant install paths on `/install`:
1. **Direct APK (`bothra-cms.apk`):** Tap **"Download Android APK File (.apk)"** on `/install` (served by `/api/download/apk`) and open the downloaded file to install.
2. **1-Tap Chrome Install (WebAPK):** Tap **"Install App"** on the prompt or Chrome menu (**⋮ → Install app**).

---

## 2. Building Native App Store / TestFlight (`.ipa`) & Google Play (`.aab`/`.apk`) Packages with Capacitor

[`capacitor.config.json`](../capacitor.config.json) is preconfigured for **both `ios` and `android`** pointing `server.url` to the hosted Next.js production server (`https://bothra-cms.vercel.app`, update to your custom HTTPS domain before building).

> Because Bothra CMS uses Next.js Server Components, Prisma, and API routes (`/api/*`), native Capacitor wrappers load the live HTTPS deployment (`server.url`) rather than static HTML files.

### Prerequisites
- **Android `.apk` / `.aab`**: Windows, macOS, or Linux + Android Studio.
- **iPhone `.ipa` / TestFlight**: **macOS + Xcode** (or CI such as GitHub Actions `macos-latest`) + **Apple Developer Program** (\$99/year). Windows cannot compile `.ipa` locally.

### Setup Commands
```bash
# 1. Install Capacitor core, CLI, iOS, and Android platforms
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android

# 2. Generate native projects
npx cap add ios
npx cap add android
npx cap sync

# 3. Open in Xcode (macOS) for iPhone TestFlight / App Store
npx cap open ios

# 4. Open in Android Studio for Android APK / Play Store AAB
npx cap open android
```

### iPhone Distribution Tips
- **Internal Company Rollout:** Distribute via **TestFlight** (up to 10,000 external testers; builds valid 90 days) or **Unlisted App Store Distribution** in App Store Connect to avoid public App Store rejection under Apple Guideline 4.2 (minimum functionality for pure WebViews).
- Verify `NSLocationWhenInUseUsageDescription` in `ios/App/App/Info.plist` before archiving in Xcode so supervisor GPS attendance check-ins prompt correctly on iOS.
