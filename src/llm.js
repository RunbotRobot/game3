// Provider abstraction. Every provider takes {system, user} and returns parsed JSON.
// Adding a provider here is the only place that should ever know about HTTP.

import { getApiKey, keyedProviders } from './state.js';

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini (free tier)',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-3.6-flash',
    async listModels(key) {
      // Paginated, and the capability field has moved once already
      // (supportedGenerationMethods -> supportedActions), so accept either and
      // never filter down to nothing: an empty dropdown is worse than a noisy one.
      const models = [];
      let pageToken = '';
      for (let page = 0; page < 6; page++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`
          + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
        const r = await fetch(url);
        if (!r.ok) throw await describe(r);
        const j = await r.json();
        models.push(...(j.models || []));
        pageToken = j.nextPageToken || '';
        if (!pageToken) break;
      }
      const names = models
        .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), methods: m.supportedGenerationMethods || m.supportedActions || [] }))
        .filter((m) => m.id && !/embedding|aqa|imagen|veo|tts|image-generation/i.test(m.id));
      const generative = names.filter((m) => m.methods.some((x) => /generateContent|generateInteraction|interactions/i.test(x)));
      return (generative.length ? generative : names).map((m) => m.id);
    },
    async complete({ key, model, system, user, temperature }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature, responseMimeType: 'application/json', maxOutputTokens: 4096 },
          safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
            .map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
        }),
      });
      if (!r.ok) throw await describe(r);
      const j = await r.json();
      const parts = j.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || '').join('');
      if (!text) throw new Error(`empty response (${j.candidates?.[0]?.finishReason || 'unknown reason'})`);
      return text;
    },
  },

  groq: {
    label: 'Groq (free tier, very fast)',
    keyUrl: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    listModels: (key) => openaiListModels('https://api.groq.com/openai/v1/models', key),
    complete: (o) => openaiComplete('https://api.groq.com/openai/v1/chat/completions', o),
  },

  openrouter: {
    label: 'OpenRouter (free model pool)',
    keyUrl: 'https://openrouter.ai/keys',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    async listModels() {
      const r = await fetch('https://openrouter.ai/api/v1/models');
      if (!r.ok) throw await describe(r);
      const j = await r.json();
      return (j.data || []).map((m) => m.id).filter((id) => id.endsWith(':free')).sort();
    },
    complete: (o) => openaiComplete('https://openrouter.ai/api/v1/chat/completions', o),
  },

  anthropic: {
    label: 'Anthropic Claude (paid, best prose)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-haiku-4-5-20251001',
    async listModels(key) {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      if (!r.ok) throw await describe(r);
      return ((await r.json()).data || []).map((m) => m.id);
    },
    async complete({ key, model, system, user, temperature }) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model, max_tokens: 4096, temperature, system,
          messages: [{ role: 'user', content: user }, { role: 'assistant', content: '{' }],
        }),
      });
      if (!r.ok) throw await describe(r);
      const j = await r.json();
      return '{' + (j.content || []).map((c) => c.text || '').join('');
    },
  },

  local: {
    label: 'No API — offline dream engine',
    keyUrl: null,
    defaultModel: 'dream',
    listModels: async () => ['dream'],
    complete: async ({ user }) => JSON.stringify(dream(user)),
  },
};

async function openaiListModels(url, key) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) throw await describe(r);
  return ((await r.json()).data || []).map((m) => m.id).sort();
}

async function openaiComplete(url, { key, model, system, user, temperature }) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature, max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw await describe(r);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty response');
  return text;
}

async function describe(r) {
  let detail = '';
  try {
    const body = await r.text();
    detail = (JSON.parse(body).error?.message) || body.slice(0, 300);
  } catch { /* non-JSON error body */ }
  const hint = r.status === 429 ? ' — rate limit'
    : r.status === 400 || r.status === 404 ? ' — check the model name in settings'
    : r.status === 401 || r.status === 403 ? ' — check your API key'
    : '';
  const e = new Error(`${r.status} ${r.statusText}${detail ? `: ${detail}` : ''}${hint}`);
  e.status = r.status;
  return e;
}

/** Overload and rate limiting are worth waiting out or routing around; a bad key
 *  or a bad model name is not — retrying those just wastes the player's time. */
export function isTransient(e) {
  if (e?.status) return [408, 409, 425, 429, 500, 502, 503, 504, 529].includes(e.status);
  return /network|failed to fetch|load failed|timeout|aborted/i.test(e?.message || '');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Model ids the provider actually offered us, cached in the save so a fallback
 *  does not need a network round trip in the middle of a failing turn. */
async function knownModels(state, providerId) {
  const cache = (state.settings.knownModels = state.settings.knownModels || {});
  const fresh = cache[providerId];
  if (fresh?.length) return fresh;
  const list = await PROVIDERS[providerId].listModels(getApiKey(providerId));
  cache[providerId] = list.slice(0, 60);
  return cache[providerId];
}

/** Everything we are willing to try for one turn, best first. Lazy, because the
 *  alternates cost a network call we should not make unless the first choice failed. */
async function* candidates(state) {
  const primaryId = state.settings.provider;
  const primary = PROVIDERS[primaryId] || PROVIDERS.local;
  const chosen = state.settings.model || primary.defaultModel;
  yield { providerId: primaryId, model: chosen, patient: true };

  // Same provider, different model: a 503 is usually one model being hammered.
  if (primaryId !== 'local') {
    let alts = [];
    try { alts = await knownModels(state, primaryId); } catch { /* offer nothing */ }
    const ranked = alts.filter((m) => m !== chosen).sort((a, b) => scoreModel(b) - scoreModel(a));
    for (const m of ranked.slice(0, 2)) yield { providerId: primaryId, model: m };
  }

  // Then any other provider we hold a key for.
  for (const id of keyedProviders()) {
    if (id === primaryId || !PROVIDERS[id]) continue;
    yield { providerId: id, model: PROVIDERS[id].defaultModel };
  }
}

/**
 * Ask for one JSON object, working down the fallback chain.
 * Transient failures on the chosen model are waited out before moving on, since
 * switching model mid-story is more disruptive than a few seconds of delay.
 */
export async function ask({ state, system, user, temperature, onNotice, onStatus }) {
  if (state.settings.provider !== 'local' && !getApiKey(state.settings.provider)) {
    throw new Error('no API key set — open ⚙ settings');
  }

  let last;
  let switched = false;

  for await (const cand of candidates(state)) {
    const provider = PROVIDERS[cand.providerId];
    const key = getApiKey(cand.providerId);
    if (!provider || (cand.providerId !== 'local' && !key)) continue;

    const patience = cand.patient ? [0, 1500, 4000] : [0];
    for (let i = 0; i < patience.length; i++) {
      if (patience[i]) {
        onStatus?.(`the world is busy — trying again in ${Math.round(patience[i] / 1000)}s…`);
        await sleep(patience[i]);
      }
      try {
        const raw = await provider.complete({
          key, model: cand.model, system, user,
          temperature: temperature ?? state.settings.temperature ?? 1,
        });
        const parsed = extractJson(raw);
        if (switched) {           // remember what actually worked
          state.settings.provider = cand.providerId;
          state.settings.model = cand.model;
        }
        return parsed;
      } catch (e) {
        last = e;

        // A retired model id is worth healing in place rather than falling past.
        if (isRetiredModel(e) && provider.listModels) {
          const replacement = await rediscover(provider, key).catch(() => null);
          if (replacement && replacement !== cand.model) {
            onNotice?.(`⟡ "${cand.model}" is gone; speaking through ${replacement} now.`);
            state.settings.model = replacement;
            cand.model = replacement;
            i = -1;               // start this candidate's patience over
            continue;
          }
        }
        if (/JSON/i.test(e.message || '')) {
          user = `${user}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.`;
          continue;
        }
        if (!isTransient(e)) break;   // bad key or bad request: the chain will not help
      }
    }

    switched = true;
    onNotice?.(`⟡ ${cand.model} would not answer. trying something else…`);
  }

  throw last || new Error('nothing answered');
}

const isRetiredModel = (e) =>
  /404|not found|no longer available|is not supported|deprecat/i.test(e?.message || '');

async function rediscover(provider, key) {
  return pickBestModel(await provider.listModels(key));
}

/**
 * Rank a model id for this game: fast, cheap, current, and on a free tier.
 * Match on whole words — an earlier version tested /mini/ against the id and
 * every *gemini* model matched it.
 */
export function scoreModel(id) {
  const words = String(id).toLowerCase().split(/[^a-z0-9.]+/);
  const has = (...w) => w.some((x) => words.includes(x));
  let n = 0;
  if (has('flash', 'mini', 'haiku', 'instant', 'small')) n += 100;
  if (has('lite', 'thinking', 'preview', 'exp', 'experimental', 'tuning', 'latest', '8b')) n -= 40;
  if (has('pro', 'sonnet', 'large')) n += 20;
  if (has('opus', 'ultra')) n -= 10;                       // capable, but slow and dear per turn
  const version = parseFloat((id.match(/(\d+(?:\.\d+)?)/) || [])[1] || '0');
  return n + Math.min(version, 99);
}

export function pickBestModel(list) {
  return [...list].sort((a, b) => scoreModel(b) - scoreModel(a))[0] || null;
}

/** Models wrap JSON in prose, fences, or trailing commas. Be forgiving. */
export function extractJson(raw) {
  const text = String(raw).replace(/^﻿/, '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(text); } catch { /* fall through to scanning */ }

  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object in response');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      const slice = text.slice(start, i + 1);
      try { return JSON.parse(slice); } catch { return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')); }
    }
  }
  throw new Error('unterminated JSON in response');
}

// --- offline fallback -------------------------------------------------------
// Playable with no key at all, so the engine can always be exercised.
const FRAGMENTS = {
  place: ['a corridor of standing water', 'the underside of a bridge that has no river',
    'a stairwell that only descends', 'a field of switched-off streetlights',
    'the inside of a bell', 'a station where the timetable is handwritten'],
  detail: ['Something has been recently moved.', 'The air tastes faintly of pennies.',
    'A sound arrives a half-second after its cause.', 'Your shadow settles late.',
    'There is writing here, in your own hand.', 'The temperature has an opinion.'],
  turn: ['That works, mostly.', 'Not the way you intended.', 'It gives, and keeps giving.',
    'Nothing happens, loudly.', 'It was already done.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function dream(user) {
  const action = (user.match(/PLAYER INPUT:\s*(.+)/)?.[1] || 'you wait').trim().slice(0, 80);
  return {
    narration: `${pick(FRAGMENTS.turn)} You ${action.replace(/^you\s+/i, '')}, and find yourself at ${pick(FRAGMENTS.place)}.\n\n${pick(FRAGMENTS.detail)} ${pick(FRAGMENTS.detail)}`,
    sensory: { motion: pick(['drift', 'pulse', 'scatter', 'still', 'storm']) },
    choices: ['look closer', 'go back', 'say something aloud'],
    ops: [{ op: 'inc', path: 'player.resources.clarity', value: Math.random() < 0.5 ? -1 : 1 }],
  };
}
