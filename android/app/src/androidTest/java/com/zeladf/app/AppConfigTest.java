package com.zeladf.app;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Testes instrumentados que validam a configuração real do aplicativo
 * ZelaDF em um dispositivo ou emulador Android.
 *
 * Substituem o ExampleInstrumentedTest genérico do scaffold Capacitor
 * (com.getcapacitor.myapp) que verificava o pacote incorreto.
 */
@RunWith(AndroidJUnit4.class)
public class AppConfigTest {

    /** Confere os bloqueios Firebase no manifesto mesclado do aplicativo instalado. */
    @Test
    public void firebaseAutoRegistrationIsDisabled() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ApplicationInfo appInfo = appContext.getPackageManager().getApplicationInfo(
                appContext.getPackageName(), PackageManager.GET_META_DATA);

        assertNotNull("Metadados Firebase devem existir", appInfo.metaData);
        for (String flag : new String[] {
                "firebase_messaging_auto_init_enabled",
                "firebase_analytics_collection_enabled",
        }) {
            assertTrue("Flag Firebase ausente: " + flag, appInfo.metaData.containsKey(flag));
            assertFalse("Inicializacao Firebase deve estar desativada: " + flag,
                    appInfo.metaData.getBoolean(flag, true));
        }
    }

    /**
     * Verifica que o pacote do app é com.zeladf.app (não o padrão do scaffold).
     */
    @Test
    public void packageNameIsCorrect() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.zeladf.app", appContext.getPackageName());
    }

    /**
     * Verifica que as permissões necessárias para os fluxos nativos
     * estão declaradas no AndroidManifest.xml.
     *
     * Sem essas permissões, os plugins Capacitor (Geolocation, Push)
     * e a captura pela WebView precisam ser verificados em aparelho.
     */
    @Test
    public void requiredPermissionsAreDeclared() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo pkgInfo = appContext.getPackageManager().getPackageInfo(
                appContext.getPackageName(), PackageManager.GET_PERMISSIONS);

        assertNotNull("requestedPermissions deve existir", pkgInfo.requestedPermissions);

        String[] expectedPermissions = {
                "android.permission.INTERNET",
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.CAMERA",
                "android.permission.POST_NOTIFICATIONS",
        };

        for (String perm : expectedPermissions) {
            boolean found = false;
            for (String declared : pkgInfo.requestedPermissions) {
                if (declared.equals(perm)) {
                    found = true;
                    break;
                }
            }
            assertTrue("Permissão ausente no manifesto: " + perm, found);
        }
    }

    @Test
    public void broadStoragePermissionsAreAbsent() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = context.getPackageManager().getPackageInfo(
                context.getPackageName(), PackageManager.GET_PERMISSIONS);
        for (String permission : info.requestedPermissions) {
            assertFalse(permission, permission.equals("android.permission.READ_MEDIA_IMAGES")
                    || permission.equals("android.permission.READ_MEDIA_VIDEO")
                    || permission.equals("android.permission.READ_EXTERNAL_STORAGE")
                    || permission.equals("android.permission.WRITE_EXTERNAL_STORAGE"));
        }
        assertEquals("Backup deve estar desativado no aplicativo instalado", 0,
                context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
    }

    /** Verifica que o callback OAuth abre a MainActivity do próprio aplicativo. */
    @Test
    public void oauthDeepLinkResolvesToMainActivity() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("com.zeladf.app://auth-callback"));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(appContext.getPackageName());

        ComponentName component = intent.resolveActivity(appContext.getPackageManager());

        assertNotNull("Deep link OAuth deve resolver uma Activity", component);
        assertEquals(appContext.getPackageName(), component.getPackageName());
        assertEquals(MainActivity.class.getName(), component.getClassName());
    }

    /** Valida as propriedades de Activity necessárias para callbacks OAuth. */
    @Test
    public void mainActivityIsExportedAndSingleTask() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ActivityInfo activityInfo = appContext.getPackageManager().getActivityInfo(
                new ComponentName(appContext, MainActivity.class), 0);

        assertTrue("MainActivity deve aceitar o callback externo", activityInfo.exported);
        assertEquals(ActivityInfo.LAUNCH_SINGLE_TASK, activityInfo.launchMode);
    }

    /** Confere a configuração Capacitor efetivamente empacotada no APK. */
    @Test
    public void packagedCapacitorConfigContainsNativeUiSettings() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject config = new JSONObject(readAsset(appContext, "capacitor.config.json"));
        JSONObject plugins = config.getJSONObject("plugins");
        JSONObject statusBar = plugins.getJSONObject("StatusBar");
        JSONObject splash = plugins.getJSONObject("SplashScreen");

        assertEquals("com.zeladf.app", config.getString("appId"));
        assertTrue(statusBar.getBoolean("overlaysWebView"));
        assertEquals("LIGHT", statusBar.getString("style"));
        assertFalse(splash.getBoolean("launchAutoHide"));
        assertFalse(splash.getBoolean("showSpinner"));
        assertEquals("CENTER_CROP", splash.getString("androidScaleType"));
    }

    private static String readAsset(Context context, String name) throws Exception {
        try (InputStream input = context.getAssets().open(name);
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
