import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zeladf.app',
  appName: 'ZelaDF',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#1f4b8f',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    appendUserAgent: 'ZelaDF/1.0',
    // Permite que a WebView renderize por trás da status bar e navigation bar
    // para que as CSS safe areas (env(safe-area-inset-*)) funcionem
    backgroundColor: '#ece7de',
  },
};

export default config;
