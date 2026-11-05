# Bothra CMS — Android Web Application & APK Guide

Bothra CMS is fully configured as a progressive native-feeling web application for Android smartphones and tablets. It can be installed directly from the browser as a native WebAPK without needing the Google Play Store, or compiled into a standalone `.apk` package.

---

## Method 1: Instant 1-Tap Installation on Android (Recommended)

Every Android device running Google Chrome, Samsung Internet, Edge, or Opera can install Bothra CMS directly to the home screen and app drawer.

### Features when installed on Android:
- **Standalone Native Experience**: Runs without browser address bars, navigation buttons, or browser tabs.
- **Offline Reliability**: Powered by `/sw.js` and `/offline` fallback—cached pages, forms, and documents remain accessible even without mobile signal.
- **Home Screen App Launcher Shortcuts**: Long-press the app icon on Android to quickly access:
  - 📋 **Mark Attendance** (GPS check-in)
  - 📸 **Daily Site Report (DSR)**
  - 📖 **Day Book**
  - 💬 **Team Messages**
- **Hardware & Notch Safe Area**: Automatically adapts to Android camera hole-punches, notches, and Android 10+ navigation gesture bars.

### How to Install:
1. Open the website on your Android phone using **Google Chrome**.
2. Tap the **"Install App"** button on the bottom prompt that automatically appears, OR:
   - Tap the **Three Dots (⋮)** in the top-right corner of Chrome.
   - Tap **"Install app"** (or **"Add to Home screen"**).
3. Tap **"Install"** in the Android confirmation popup.
4. The **Bothra CMS** app icon will appear directly in your Android app drawer and home screen.

---

## Method 2: Generate Standalone Android APK (.apk / .aab) with Google Bubblewrap

Google provides [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) to package PWAs into native Android `.apk` (for direct installation) and `.aab` (for Google Play Store).

### Step 1: Install Bubblewrap CLI
```bash
npm install -g @bubblewrap/cli
```

### Step 2: Initialize from your deployed URL
```bash
bubblewrap init --manifest https://<your-deployed-domain>/manifest.webmanifest
```

Bubblewrap will automatically read:
- App Name: `Bothra CMS — Construction & Site Operations`
- Package ID: `com.bothracms.app`
- Icons: `icon-192.png`, `icon-512-maskable.png`
- Theme & Navigation: `#0b1020`

### Step 3: Build the Android APK
```bash
bubblewrap build
```
This produces `app-release-signed.apk` in the project directory, ready to install directly on any Android device via WhatsApp, USB, or Google Drive.

---

## Method 3: Build with Capacitor & Android Studio

If you want native device plugins (Bluetooth, NFC, Biometrics, Background Geolocation), use the included `capacitor.config.json`:

```bash
# 1. Install Capacitor dependencies
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Add Android platform
npx cap add android

# 3. Open project in Android Studio
npx cap open android
```
In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)** to produce your release `.apk`.

---

## Verification & Manifest Details
- Web Manifest: [`public/manifest.webmanifest`](/manifest.webmanifest) and [`public/manifest.json`](/manifest.json)
- Service Worker: [`public/sw.js`](/sw.js)
- Digital Asset Links: [`public/.well-known/assetlinks.json`](/.well-known/assetlinks.json)
- Service Worker Auto-Registration: [`src/components/pwa/ServiceWorkerRegister.tsx`](/src/components/pwa/ServiceWorkerRegister.tsx)
- Android Install Banner & Dialog: [`src/components/pwa/AndroidInstallPrompt.tsx`](/src/components/pwa/AndroidInstallPrompt.tsx)
