export type DevicePlatform = "ios" | "android" | "desktop";

export interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

export interface IosBrowserContext {
  isIos: boolean;
  isSafari: boolean;
  isThirdPartyBrowser: boolean;
  isInAppBrowser: boolean;
}

function getNav(nav?: NavigatorLike): NavigatorLike {
  if (nav) return nav;
  if (typeof navigator === "undefined") return {};
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

export function isIosDevice(nav?: NavigatorLike): boolean {
  const { userAgent = "", platform = "", maxTouchPoints = 0 } = getNav(nav);
  if (!userAgent && !platform) return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ reports Macintosh in userAgent, distinguished by touch support
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isAndroidDevice(nav?: NavigatorLike): boolean {
  const { userAgent = "" } = getNav(nav);
  return /Android/i.test(userAgent);
}

export function detectDevicePlatform(nav?: NavigatorLike): DevicePlatform {
  if (isIosDevice(nav)) return "ios";
  if (isAndroidDevice(nav)) return "android";
  return "desktop";
}

export function getIosBrowserContext(nav?: NavigatorLike): IosBrowserContext {
  const { userAgent = "" } = getNav(nav);
  const ios = isIosDevice(nav);
  if (!ios) {
    return {
      isIos: false,
      isSafari: false,
      isThirdPartyBrowser: false,
      isInAppBrowser: false,
    };
  }

  const isThirdPartyBrowser = /CriOS|EdgiOS|FxiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(userAgent);
  const isKnownWebView = /FBAN|FBAV|Instagram|WhatsApp|LinkedInApp|Line\/|MicroMessenger|Snapchat|Twitter|GSA\//i.test(
    userAgent
  );
  // Real Safari & iOS third-party browsers contain "Safari/", whereas WKWebView in-app webviews typically omit it
  const hasSafariToken = /Safari\//i.test(userAgent);
  const isInAppBrowser = isKnownWebView || (!isThirdPartyBrowser && !hasSafariToken);
  const isSafari = !isInAppBrowser && !isThirdPartyBrowser && hasSafariToken;

  return {
    isIos: true,
    isSafari,
    isThirdPartyBrowser,
    isInAppBrowser,
  };
}

/** Shared helper for NotificationBanner & PushToggle so iPhone prompt works even before Notification exists in Safari tabs */
export function shouldShowIosPushInstallPrompt(params: {
  ios: boolean;
  installed: boolean;
  hasNotificationApi: boolean;
  notificationPermission?: string;
}): boolean {
  if (!params.ios || params.installed) return false;
  if (!params.hasNotificationApi) return true;
  return params.notificationPermission !== "granted";
}
