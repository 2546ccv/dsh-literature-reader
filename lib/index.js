/**
 * dsh-literature-reader — host half (plain ESM, zero imports, no build step).
 *
 * Registers the `/lit` logical RPC channel. The browser half asks for
 * one-shot concept explanations / translations of selected text; this half
 * answers with a DIRECT `ctx.llm.stream()` call that never touches the
 * session history, never occupies the agent's context window, and runs a
 * minimal system prompt with a hard token cap — the token-saving core of the
 * plugin.
 *
 * Zero runtime imports on purpose: the plugin loads through a junction into
 * the profile's node_modules, where resolving extra packages is
 * environment-dependent. Config arrives as the raw patch-layer object and is
 * merged with defaults here. TypeScript types for Config live in
 * `lib/types/index.d.ts`.
 */

/** Stable Cordis plugin name. */
export const name = 'literature-reader';

/** Services required before the channel can serve: the wire + the LLM seam + the HTTP server. */
export const inject = ['connection', 'llm', 'webServer'];

/** Factory defaults; the patch layer's `config:` object is merged over these. */
const DEFAULTS = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  maxChars: 2000,
  maxTokensExplain: 200,
  maxTokensTranslate: 300,
  temperature: 0.2,
  explainSystem:
    'You are a concise academic reading assistant. Explain the selected term or passage from a research paper. ' +
    'Answer in the language the user used to ask (default: Chinese). Be precise and compact: one short paragraph, ' +
    'plain definitions, no greetings, no markdown headers.',
  translateSystem:
    'You are a precise academic translator. Translate the selected passage into fluent, accurate Simplified Chinese ' +
    '(if the source is Chinese, translate it into English). Keep technical terms, formulas, and citations intact. ' +
    'Output only the translation, no explanations.',
};

/** Merge the raw patch config over defaults (numbers coerced; unknown keys ignored). */
function resolveConfig(raw) {
  const cfg = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULTS)) {
      const value = raw[key];
      if (value === undefined || value === null) continue;
      if (typeof DEFAULTS[key] === 'number') {
        const n = Number(value);
        if (Number.isFinite(n)) cfg[key] = n;
      } else if (typeof DEFAULTS[key] === 'string') {
        cfg[key] = String(value);
      } else {
        cfg[key] = value;
      }
    }
  }
  return cfg;
}

/**
 * Build one hand-rolled user message (Message shape used by the LLM seam).
 * Constructed directly instead of importing the factory so the host half
 * stays dependency-free.
 */
function userMessage(text) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  };
}

/**
 * Core ask logic shared by the RPC channel and the local HTTP endpoint:
 * one-shot explain/translate through ctx.llm.stream(), never touching the
 * session history.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {ReturnType<typeof resolveConfig>} config - resolved config.
 * @param {{text: string, mode?: string, provider?: string, model?: string}} payload
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ok: true, value: {text: string}} | {ok: false, error: unknown}>}
 */
async function runAsk(ctx, config, payload, signal) {
  const { text, mode, provider, model } = payload ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    return {
      ok: false,
      error: {
        code: 'bad-request',
        message: 'ask requires a non-empty string payload.text',
        details: { issues: [] },
      },
    };
  }
  const kind = mode === 'translate' ? 'translate' : 'explain';
  const system = kind === 'translate' ? config.translateSystem : config.explainSystem;
  const maxTokens = kind === 'translate' ? config.maxTokensTranslate : config.maxTokensExplain;
  const clipped = text.length > config.maxChars ? text.slice(0, config.maxChars) : text;
  // Client-selected provider/model win over the patch config when present.
  const effectiveProvider = typeof provider === 'string' && provider ? provider : config.provider;
  const effectiveModel = typeof model === 'string' && model ? model : config.model;

  let out = '';
  for await (const chunk of ctx.llm.stream({
    provider: effectiveProvider,
    model: effectiveModel,
    system,
    messages: [userMessage(clipped)],
    temperature: config.temperature,
    maxTokens,
    signal,
  })) {
    if (chunk.type === 'text-delta') out += chunk.text;
    if (chunk.type === 'finish' && chunk.kind === 'error') {
      return {
        ok: false,
        error: { code: 'internal', message: chunk.failure?.message ?? 'LLM call failed', details: {} },
      };
    }
  }
  return { ok: true, value: { text: out.trim() } };
}

/** Enumerate the provider/model directory for settings surfaces. */
async function listModelsDirectory(ctx) {
  const providers = ctx.llm.listProviders();
  const directory = [];
  for (const p of providers) {
    let models = [];
    try {
      models = await ctx.llm.listModels(p.id);
    } catch {
      models = [];
    }
    directory.push({ provider: p.id, name: p.name, models: models.map((m) => m.id) });
  }
  return { providers: directory };
}

/**
 * Plugin body: mount the `/lit` RPC channel plus the local HTTP endpoint
 * `/lit-http/ask` (background service for browser extensions / scripts),
 * both answering one-shot explain/translate through ctx.llm.stream().
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {unknown} [rawConfig] - raw patch-layer config object.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  const disposers = [];

  const channel = ctx.connection.rpc.handle(
    '/lit',
    async (endpoint, payload, signal) => {
      try {
        switch (endpoint) {
          case 'ask':
            return await runAsk(ctx, config, payload, signal);
          case 'models':
            return { ok: true, value: await listModelsDirectory(ctx) };
          default:
            return {
              ok: false,
              error: { code: 'bad-request', message: `unknown endpoint: ${endpoint}`, details: { issues: [] } },
            };
        }
      } catch (err) {
        return {
          ok: false,
          error: { code: 'internal', message: err instanceof Error ? err.message : String(err), details: {} },
        };
      }
    },
    { authority: 'loopback' },
  );
  disposers.push(channel);

  // Local HTTP background endpoint for browser extensions and local scripts:
  //   POST /lit-http/ask   {text, mode?, provider?, model?} -> {ok, value:{text}}
  //   POST /lit-http/models {} -> {ok, value:{providers}}
  // Loopback-only (the DSH web server binds 127.0.0.1 by default), CORS-free
  // on purpose: the response is only readable by local callers.
  if (ctx.webServer) {
    const httpRoute = ctx.webServer.register({
      kind: 'prefix',
      path: '/lit-http',
      async handler(req, res) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const send = (status, body) => {
          res.statusCode = status;
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method !== 'POST') {
            return send(405, { ok: false, error: { code: 'bad-request', message: 'use POST', details: { issues: [] } } });
          }
          let raw = '';
          for await (const chunk of req) raw += chunk;
          if (raw.length > 65536) {
            return send(413, { ok: false, error: { code: 'bad-request', message: 'payload too large', details: { issues: [] } } });
          }
          let payload = {};
          try {
            payload = raw ? JSON.parse(raw) : {};
          } catch {
            return send(400, { ok: false, error: { code: 'bad-request', message: 'invalid JSON', details: { issues: [] } } });
          }
          const path = req.url?.split('?')[0] ?? '';
          if (path === '/lit-http/ask' || path === '/lit-http/ask/') {
            const result = await runAsk(ctx, config, payload, undefined);
            return send(result.ok ? 200 : 400, result);
          }
          if (path === '/lit-http/models' || path === '/lit-http/models/') {
            return send(200, { ok: true, value: await listModelsDirectory(ctx) });
          }
          return send(404, { ok: false, error: { code: 'bad-request', message: 'unknown path', details: { issues: [] } } });
        } catch (err) {
          send(500, {
            ok: false,
            error: { code: 'internal', message: err instanceof Error ? err.message : String(err), details: {} },
          });
        }
      },
    });
    disposers.push(httpRoute);
  }

  return () => {
    for (const dispose of disposers.splice(0)) void dispose();
  };
}
