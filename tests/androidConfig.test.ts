// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), "utf8")

describe("Android configuration", () => {
  it("disables Firebase auto registration before explicit push opt-in", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    for (const name of [
      "firebase_messaging_auto_init_enabled",
      "firebase_analytics_collection_enabled",
    ]) {
      expect(manifest).toMatch(
        new RegExp(
          `<meta-data\\s+android:name="${name}"\\s+android:value="false"\\s*/>`,
        ),
      )
    }
  })

  it("declares permissions required by the implemented native flows", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    const permissions = [
      "android.permission.INTERNET",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.CAMERA",
      "android.permission.POST_NOTIFICATIONS",
    ]

    for (const permission of permissions) {
      expect(manifest).toContain(`android:name="${permission}"`)
    }
    for (const permission of [
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
    ]) {
      expect(manifest).not.toContain(`android.permission.${permission}`)
    }
  })

  it("excludes session data from cloud backup and device transfer", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    expect(manifest).toContain('android:allowBackup="false"')
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"')
    expect(manifest).toContain(
      'android:dataExtractionRules="@xml/data_extraction_rules"',
    )
    const legacy = new DOMParser().parseFromString(
      read("android/app/src/main/res/xml/backup_rules.xml"),
      "text/xml",
    )
    const modern = new DOMParser().parseFromString(
      read("android/app/src/main/res/xml/data_extraction_rules.xml"),
      "text/xml",
    )
    for (const section of [
      legacy.querySelector("full-backup-content"),
      modern.querySelector("cloud-backup"),
      modern.querySelector("device-transfer"),
    ]) {
      expect(section).not.toBeNull()
      for (const domain of [
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
        "device_root",
        "device_file",
        "device_database",
        "device_sharedpref",
      ]) {
        expect(
          section?.querySelector(`exclude[domain="${domain}"][path="."]`),
        ).not.toBeNull()
      }
    }
  })

  it("keeps the OAuth callback aligned across web and Android", () => {
    const document = new DOMParser().parseFromString(
      read("android/app/src/main/AndroidManifest.xml"),
      "text/xml",
    )
    const cameraAction = [
      ...document.querySelectorAll("queries intent action"),
    ].some(
      (action) =>
        action.getAttribute("android:name") ===
        "android.media.action.IMAGE_CAPTURE",
    )
    expect(cameraAction).toBe(true)
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    const authProvider = read("src/auth/AuthProvider.tsx")
    const capacitorConfig = read("capacitor.config.ts")

    expect(manifest).toContain('android:scheme="com.zeladf.app"')
    expect(manifest).toContain('android:host="auth-callback"')
    expect(authProvider).toContain('"com.zeladf.app://auth-callback"')
    expect(capacitorConfig).toContain("appId: 'com.zeladf.app'")
  })

  it("packages the expected SplashScreen and StatusBar settings", () => {
    const config = JSON.parse(
      read("android/app/src/main/assets/capacitor.config.json"),
    )

    expect(config.appId).toBe("com.zeladf.app")
    expect(config.plugins.StatusBar).toMatchObject({
      overlaysWebView: true,
      style: "LIGHT",
      backgroundColor: "#00000000",
    })
    expect(config.plugins.SplashScreen).toMatchObject({
      launchAutoHide: false,
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    })
  })

  it("uses product tests instead of the Capacitor scaffold", () => {
    expect(
      existsSync(
        resolve(
          root,
          "android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java",
        ),
      ),
    ).toBe(false)
    expect(
      existsSync(
        resolve(
          root,
          "android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java",
        ),
      ),
    ).toBe(false)
    expect(
      existsSync(
        resolve(
          root,
          "android/app/src/test/java/com/zeladf/app/DeepLinkUrlTest.java",
        ),
      ),
    ).toBe(true)
    expect(
      existsSync(
        resolve(
          root,
          "android/app/src/androidTest/java/com/zeladf/app/AppConfigTest.java",
        ),
      ),
    ).toBe(true)
  })

  it("keeps native calls connected to their declared capabilities", () => {
    const gps = read("src/lib/gps.ts")
    const push = read("src/lib/push.ts")
    const reportForm = read("src/NewReportForm.tsx")

    expect(gps).toContain("Geolocation.requestPermissions()")
    expect(gps).toContain("Geolocation.getCurrentPosition(")
    expect(push).toContain("PushNotifications.requestPermissions()")
    expect(push).toContain("PushNotifications.register()")
    expect(reportForm).toContain("accept={PHOTO_ACCEPT}")
    expect(reportForm).toContain('capture="environment"')
  })

  it("keeps push disabled by default and cleans it before logout", () => {
    const app = read("src/App.tsx")
    const authProvider = read("src/auth/AuthProvider.tsx")
    const push = read("src/lib/push.ts")
    const environment = read(".env.example")

    expect(environment).toContain("VITE_PUSH_ENABLED=false")
    expect(app).not.toContain("registerForPushNotifications")
    expect(push).toContain('import.meta.env.VITE_PUSH_ENABLED === "true"')
    expect(push).toContain("PushNotifications.unregister()")
    expect(push).toContain("PushNotifications.removeAllListeners()")
    expect(
      authProvider.indexOf("unregisterPushNotifications(user.id)"),
    ).toBeLessThan(authProvider.indexOf("authService.signOut()"))
  })
})
