async function configureSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ ehAssistantInstalledAt: new Date().toISOString() });
  configureSidePanel().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanel().catch(console.error);
});

configureSidePanel().catch(console.error);

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EH_ASSISTANT_FETCH_IMAGE") return;
  (async () => {
    const url = new URL(message.url);
    const allowedImageHosts = new Set(["img.engagehub.tsostech.com", "cdn.shopify.com"]);
    if (url.protocol !== "https:" || !allowedImageHosts.has(url.hostname)) {
      throw new Error(`图片域名不在允许列表：${url.hostname || "unknown"}`);
    }
    const response = await fetch(url.toString(), { credentials: "include", cache: "force-cache" });
    if (!response.ok) throw new Error(`图片请求失败：HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error(`返回内容不是图片：${blob.type || "unknown"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${blob.type};base64,${bytesToBase64(bytes)}`;
  })()
    .then(dataUrl => sendResponse({ ok: true, dataUrl }))
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
