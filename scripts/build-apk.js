const fs = require('fs');
const path = require('path');

async function generateApk() {
  const host = "https://bothra-cms.vercel.app";
  const payload = {
    packageId: "com.bothracms.app",
    name: "Bothra CMS",
    launcherName: "Bothra CMS",
    shortName: "Bothra CMS",
    description: "Enterprise Construction Project, Site Operations & Financial Management Platform",
    startUrl: "/?source=pwa",
    host: host,
    webManifestUrl: `${host}/manifest.webmanifest`,
    iconUrl: `${host}/icons/icon-512.png`,
    maskableIconUrl: `${host}/icons/icon-512-maskable.png`,
    themeColor: "#0b1020",
    backgroundColor: "#0b1020",
    navigationColor: "#0b1020",
    navigationColorDark: "#0b1020",
    navigationDividerColor: "#0b1020",
    navigationDividerColorDark: "#0b1020",
    splashScreenFadeOutDuration: 300,
    display: "standalone",
    orientation: "portrait",
    appVersion: "1.0.0",
    appVersionCode: 1,
    signingMode: "new",
    signing: {
      file: null,
      alias: "bothracms",
      keyPassword: "BothraPassword123!",
      storePassword: "BothraPassword123!",
      countryCode: "IN",
      fullName: "Bothra CMS",
      organization: "Bothra CMS",
      organizationalUnit: "Engineering"
    },
    enableNotifications: true,
    enableSiteSettingsShortcut: true,
    fallbackType: "customtabs",
    features: {
      locationDelegation: { enabled: true },
      playBilling: { enabled: false }
    },
    includeSourceCode: false,
    additionalTrustedOrigins: []
  };

  console.log("Requesting APK generation from PWABuilder CloudAPK service...");
  
  const endpoint = "https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const outZip = path.resolve(process.cwd(), "public", "bothra-cms-android.zip");
      fs.writeFileSync(outZip, Buffer.from(buffer));
      console.log(`Success! Package saved to: ${outZip} (${buffer.byteLength} bytes)`);
      return true;
    } else {
      const errText = await response.text();
      console.error(`Error response: ${errText}`);
    }
  } catch (err) {
    console.error(`Fetch failed:`, err.message);
  }
  return false;
}

generateApk();
