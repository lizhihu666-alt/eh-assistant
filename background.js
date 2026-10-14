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

// A generous completion-token ceiling, not a target -- the model stops on
// its own well before this in the normal case (billing is by tokens actually
// generated, so a high cap costs nothing unused). Needed because "reasoning"
// models (e.g. the company gateway's DeepSeek V4 Pro) spend a variable,
// sometimes large, number of tokens on an invisible internal reasoning pass
// before ever writing the final answer; 1024 was far too tight and produced
// a confirmed real failure mode: the whole budget got consumed by reasoning,
// finish_reason came back "length", and the visible content was empty.
const MAX_COMPLETION_TOKENS = 8192;

// One entry per selectable AI provider in the settings panel. Each provider's
// endpoint/host is hardcoded here (never taken from message input), so
// picking a provider can never reach an arbitrary host.
const AI_PROVIDERS = {
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-5",
    buildRequest(message) {
      return {
        headers: {
          "content-type": "application/json",
          "x-api-key": message.apiKey,
          "anthropic-version": "2023-06-01",
          // Anthropic's explicit opt-in for calling the Messages API directly
          // from a browser context (no server-side proxy). Acceptable here
          // because this is a single-user local extension where the user
          // supplies their own key -- not a distributed public product.
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: message.model || this.defaultModel,
          max_tokens: MAX_COMPLETION_TOKENS,
          messages: [{ role: "user", content: message.prompt }]
        })
      };
    },
    extractText(payload) {
      return payload?.content?.map(block => block?.text || "").join("") || "";
    },
    extractFinishReason(payload) {
      return payload?.stop_reason || "";
    }
  },
  // OpenAI and DeepSeek both expose an OpenAI-compatible chat-completions
  // endpoint, so they share the exact same request/response shape -- only
  // the endpoint, default model and auth header text differ.
  ...openAiCompatibleProviders({
    openai: { endpoint: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
    // DeepSeek: cheap pay-as-you-go with a one-time free token grant for new
    // accounts -- not literally free ongoing, but cheap enough it barely
    // matters for this feature's per-call token usage.
    deepseek: { endpoint: "https://api.deepseek.com/chat/completions", defaultModel: "deepseek-chat" },
    // Company-internal LiteLLM gateway (proxies DeepSeek V4 models under a
    // company-issued Virtual Key). Also OpenAI-compatible, per the
    // company's own integration docs. The model string is deliberately the
    // full display name (with spaces) rather than a short id -- that's what
    // the company's own docs specify and confirmed working.
    //
    // extraBody.enable_thinking: false -- confirmed via direct testing that
    // this gateway's backend (LiteLLM's error message for an unsupported
    // param named it as "dashscope") is a hybrid reasoning model that burns
    // 1000+ invisible "thinking" tokens per call unless told not to. With
    // this flag: same optimize-prompt request went from ~15.7s to ~1.8s with
    // equivalent output quality. This param is specific to this gateway's
    // backend -- do not add it to openai/deepseek, which aren't guaranteed
    // to tolerate an unrecognized field the same way.
    company: {
      endpoint: "https://litellm.wangoon.cn/v1/chat/completions",
      defaultModel: "JF Merchant Center Management-deepseek-v4-flash",
      extraBody: { enable_thinking: false }
    }
  })
};

function openAiCompatibleProviders(providers) {
  const entries = Object.entries(providers).map(([key, config]) => [
    key,
    {
      ...config,
      buildRequest(message) {
        return {
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${message.apiKey}`
          },
          body: JSON.stringify({
            model: message.model || this.defaultModel,
            max_tokens: MAX_COMPLETION_TOKENS,
            messages: [{ role: "user", content: message.prompt }],
            ...this.extraBody
          })
        };
      },
      extractText(payload) {
        return payload?.choices?.[0]?.message?.content || "";
      },
      extractFinishReason(payload) {
        return payload?.choices?.[0]?.finish_reason || "";
      }
    }
  ]);
  return Object.fromEntries(entries);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EH_ASSISTANT_FETCH_IMAGE") {
    (async () => {
      const url = new URL(message.url);
      const allowedImageHosts = new Set([
        "img.engagehub.tsostech.com",
        "cdn.shopify.com",
        "prodenv-merchant-public.s3.us-west-2.amazonaws.com"
      ]);
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
  }

  if (message?.type === "EH_ASSISTANT_CALL_AI") {
    (async () => {
      const provider = AI_PROVIDERS[message.provider] || AI_PROVIDERS.anthropic;
      if (!message.apiKey) throw new Error("尚未配置 API Key，请先在设置里填写。");
      const { headers, body } = provider.buildRequest(message);
      const response = await fetch(provider.endpoint, { method: "POST", headers, body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`AI 请求失败：HTTP ${response.status}${payload?.error?.message ? `，${payload.error.message}` : ""}`);
      }
      const text = provider.extractText(payload);
      if (!text) {
        const finishReason = provider.extractFinishReason?.(payload) || "";
        const truncatedHint = (finishReason === "length" || finishReason === "max_tokens")
          ? "，模型把 token 预算全用在内部推理上了，没写出正式回答（常见于推理类模型），可以在设置里换一个非推理模型试试"
          : "";
        throw new Error(`AI 返回内容为空${finishReason ? `（finish_reason: ${finishReason}）` : ""}${truncatedHint}。`);
      }
      return text;
    })()
      .then(text => sendResponse({ ok: true, text }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
});
