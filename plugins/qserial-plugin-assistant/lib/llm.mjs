/**
 * OpenAI 兼容接口调用（覆盖 Ollama / OneAPI / 大多数 LLM 网关）。
 * 使用 Node 全局 fetch + 流式响应（SSE）。
 */

function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (u.endsWith('/chat/completions')) u = u.slice(0, -'/chat/completions'.length);
  if (u.endsWith('/embeddings')) u = u.slice(0, -'/embeddings'.length);
  return u;
}

function buildHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/** 是否已配置可用的对话服务。 */
export function isConfigured(cfg) {
  return cfg.provider !== 'disabled' && !!cfg.baseUrl && !!cfg.model;
}

/** 从错误响应体解析出服务端返回的可读错误信息。 */
function parseErrorBody(bodyText) {
  try {
    const json = JSON.parse(bodyText);
    const msg = json?.error?.message || json?.message;
    return typeof msg === 'string' ? msg : '';
  } catch {
    return '';
  }
}

/** 从错误信息中提取「支持的模型名列表」（如 OpenAI 兼容网关返回 400 时）。 */
function extractSupportedModels(message) {
  const m = /\bmodel names? are\s+([^.]+)\.?/i.exec(message || '');
  if (!m) return null;
  const names = m[1]
    .split(/,|\band\b|\bor\b/)
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9._-]+$/i.test(s));
  return names.length ? names : null;
}

/** 将非 2xx 响应格式化为可读错误，附带可用模型提示。 */
function formatHttpError(prefix, status, bodyText) {
  const base = `${prefix} (HTTP ${status})`;
  const serverMsg = parseErrorBody(bodyText);
  if (!serverMsg) return bodyText ? `${base} ${bodyText.slice(0, 200)}` : base;
  const models = extractSupportedModels(serverMsg);
  return models ? `${base}：${serverMsg}\n可用模型：${models.join(' / ')}` : `${base}：${serverMsg}`;
}

/**
 * 流式对话。逐段回调 onDelta，返回完整文本。
 */
export async function chatStream({ baseUrl, apiKey, model, messages, onDelta }) {
  const url = normalizeBaseUrl(baseUrl) + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.3 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(formatHttpError('LLM 请求失败', res.status, detail));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta);
        }
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }
  return full;
}

/** 非流式对话（用于 MCP / 同步调用）。 */
export async function chatOnce({ baseUrl, apiKey, model, messages }) {
  const url = normalizeBaseUrl(baseUrl) + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.3 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(formatHttpError('LLM 请求失败', res.status, detail));
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * 批量文本向量化。失败抛错（调用方决定是否回退哈希向量）。
 */
export async function embedTexts(baseUrl, apiKey, model, texts) {
  const url = normalizeBaseUrl(baseUrl) + '/embeddings';
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(formatHttpError('Embedding 请求失败', res.status, detail));
  }
  const json = await res.json();
  if (!Array.isArray(json.data)) throw new Error('Embedding 响应缺少 data');
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => (Array.isArray(d.embedding) ? d.embedding : []));
}
