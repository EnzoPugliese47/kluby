/** Safe area + Capacitor en pantallas operativas (panel, puerta, publi). */
(function initOpsNativeShell() {
  const cap = window.Capacitor;
  const isNative = cap?.isNativePlatform?.() === true;
  if (isNative) document.documentElement.classList.add("cap-native");
  if (isNative || window.matchMedia("(max-width: 900px)").matches) {
    document.documentElement.classList.add("mobile-ui");
  }
  if (!isNative) return;
  const sb = cap.Plugins?.StatusBar;
  if (!sb) return;
  Promise.resolve()
    .then(() => sb.setOverlaysWebView?.({ overlay: false }))
    .then(() => sb.setBackgroundColor?.({ color: "#0a0a0f" }))
    .then(() => sb.setStyle?.({ style: "DARK" }))
    .catch(() => {});
})();
