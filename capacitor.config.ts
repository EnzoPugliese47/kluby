import type { CapacitorConfig } from "@capacitor/cli";

/** URL del backend desplegado (Railway). Cambiá acá si usás otro entorno. */
const PRODUCTION_URL = "https://kluby-production-2fa4.up.railway.app";

const config: CapacitorConfig = {
  appId: "com.kluby.app",
  appName: "Kluby",
  webDir: "public",
  server: {
    /** La app Android arranca en la home pública; login solo al reservar. */
    url: `${PRODUCTION_URL}/`,
    androidScheme: "https",
    allowNavigation: [
      "kluby-production-2fa4.up.railway.app",
      "*.up.railway.app",
    ],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0a0a0f",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0f",
    },
  },
};

export default config;
