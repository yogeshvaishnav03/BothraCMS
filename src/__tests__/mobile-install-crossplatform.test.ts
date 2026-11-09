import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  isIosDevice,
  isAndroidDevice,
  detectDevicePlatform,
  getIosBrowserContext,
  shouldShowIosPushInstallPrompt,
} from "../lib/device-platform";

describe("Cross-Platform iPhone (iOS) & Android App Support", () => {
  describe("Device Platform Detection", () => {
    it("detects iPhone Safari accurately", () => {
      const nav = {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      };
      expect(isIosDevice(nav)).toBe(true);
      expect(isAndroidDevice(nav)).toBe(false);
      expect(detectDevicePlatform(nav)).toBe("ios");
      expect(getIosBrowserContext(nav)).toEqual({
        isIos: true,
        isSafari: true,
        isThirdPartyBrowser: false,
        isInAppBrowser: false,
      });
    });

    it("detects modern iPadOS reporting MacIntel with touch points", () => {
      const nav = {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      };
      expect(isIosDevice(nav)).toBe(true);
      expect(detectDevicePlatform(nav)).toBe("ios");
      expect(getIosBrowserContext(nav).isSafari).toBe(true);
    });

    it("does not misclassify macOS desktop Safari as iOS", () => {
      const nav = {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 0,
      };
      expect(isIosDevice(nav)).toBe(false);
      expect(detectDevicePlatform(nav)).toBe("desktop");
    });

    it("detects Chrome on iOS as third-party browser (not Safari and not in-app webview)", () => {
      const nav = {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      };
      expect(getIosBrowserContext(nav)).toEqual({
        isIos: true,
        isSafari: false,
        isThirdPartyBrowser: true,
        isInAppBrowser: false,
      });
    });

    it("detects iOS in-app webviews (WhatsApp / Instagram) so users are prompted to open in Safari", () => {
      const waNav = {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21C62 WhatsApp/2.24.1 N",
        platform: "iPhone",
        maxTouchPoints: 5,
      };
      expect(getIosBrowserContext(waNav)).toEqual({
        isIos: true,
        isSafari: false,
        isThirdPartyBrowser: false,
        isInAppBrowser: true,
      });

      const webviewNoSafari = {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      };
      expect(getIosBrowserContext(webviewNoSafari).isInAppBrowser).toBe(true);
    });

    it("detects Android mobile Chrome", () => {
      const nav = {
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
        platform: "Linux armv81",
        maxTouchPoints: 5,
      };
      expect(isAndroidDevice(nav)).toBe(true);
      expect(isIosDevice(nav)).toBe(false);
      expect(detectDevicePlatform(nav)).toBe("android");
    });

    it("detects Windows desktop Chrome", () => {
      const nav = {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        platform: "Win32",
        maxTouchPoints: 0,
      };
      expect(detectDevicePlatform(nav)).toBe("desktop");
    });
  });

  describe("iOS Notification Banner Reachability", () => {
    it("shows Add-to-Home-Screen alert prompt in iOS Safari tab even when window.Notification is undefined", () => {
      expect(
        shouldShowIosPushInstallPrompt({
          ios: true,
          installed: false,
          hasNotificationApi: false,
        })
      ).toBe(true);
    });

    it("does not show iOS install prompt when already launched as standalone Home Screen app", () => {
      expect(
        shouldShowIosPushInstallPrompt({
          ios: true,
          installed: true,
          hasNotificationApi: true,
          notificationPermission: "default",
        })
      ).toBe(false);
    });
  });

  describe("Repository Mobile Configuration & Markup Integrity", () => {
    const root = path.resolve(__dirname, "../..");

    it("configures Capacitor for both iOS and Android with HTTPS server URL", () => {
      const cap = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
      expect(cap.appId).toBe("com.bothracms.app");
      expect(cap.server?.url).toMatch(/^https:\/\//);
      expect(cap.ios).toBeDefined();
      expect(cap.ios.contentInset).toBe("automatic");
      expect(cap.android).toBeDefined();
    });

    it("configures Apple Web App metadata, 180x180 touch icon, and viewportFit cover", () => {
      const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
      expect(layout).toContain("appleWebApp");
      expect(layout).toContain('title: "Bothra CMS"');
      expect(layout).toContain("/icons/apple-touch-icon.png");
      expect(layout).toContain('viewportFit: "cover"');
      expect(fs.existsSync(path.join(root, "public/icons/apple-touch-icon.png"))).toBe(true);
    });

    it("ensures NotificationBanner invokes shouldShowIosPushInstallPrompt instead of returning early on missing Notification", () => {
      const banner = fs.readFileSync(path.join(root, "src/components/layout/NotificationBanner.tsx"), "utf8");
      expect(banner).toContain("shouldShowIosPushInstallPrompt");
      expect(banner).not.toContain('if (typeof window === "undefined" || !("Notification" in window)');
    });

    it("supports both iOS and Android flows on /install and global install prompt", () => {
      const installPage = fs.readFileSync(path.join(root, "src/app/install/page.tsx"), "utf8");
      const prompt = fs.readFileSync(path.join(root, "src/components/pwa/AndroidInstallPrompt.tsx"), "utf8");

      expect(installPage).toContain("Bothra CMS for iPhone & iPad");
      expect(installPage).toContain("Bothra CMS for Android");
      expect(installPage).toContain("/api/download/apk");
      expect(installPage).toContain("Add to Home Screen");

      expect(prompt).toContain("Install on iPhone / iPad");
      expect(prompt).toContain("Add to Home Screen");
      expect(prompt).toContain("triggerAndroidInstall");
      expect(prompt).toContain("triggerAppInstall");
    });
  });
});
