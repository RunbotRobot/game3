// Provider abstraction. Every provider takes {system, user} and returns parsed JSON.
// Adding a provider here is the only place that should ever know about HTTP.

import { getApiKey } from './state.js';

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini (free tier)',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-2.5-flash',
    async listModels(key) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`);
      if (!r.ok) throw new Error(await describe(r));
      const j = await r.json();
      return (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((n) => !/embedding|aqa|imagen|veo|tts/i.test(n));
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
      if (!r.ok) throw new Error(await describe(r));
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
      if (!r.ok) throw new Error(await describe(r));
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
      if (!r.ok) throw new Error(await describe(r));
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
      if (!r.ok) throw new Error(await describe(r));
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
  if (!r.ok) throw new Error(await describe(r));
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
  if (!r.ok) throw new Error(await describe(r));
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
  const hint = r.status === 429 ? ' — free-tier rate limit; wait a moment'
    : r.status === 400 || r.status === 404 ? ' — check the model name in settings'
    : r.status === 401 || r.status === 403 ? ' — check your API key'
    : '';
  return `${r.status} ${r.statusText}${detail ? `: ${detail}` : ''}${hint}`;
}

/** Ask the current provider for one JSON object. Retries once on a parse failure. */
export async function ask({ state, system, user, temperature }) {
  const provider = PROVIDERS[state.settings.provider] || PROVIDERS.local;
  const key = getApiKey();
  if (!key && provider !== PROVIDERS.local) throw new Error('no API key set — open ⚙ settings');
  const model = state.settings.model || provider.defaultModel;
  const opts = { key, model, system, user, temperature: temperature ?? state.settings.temperature ?? 1 };

  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete(attempt === 0 ? opts
      : { ...opts, user: `${user}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.` });
    try { return extractJson(raw); } catch (e) { last = e; }
  }
  throw last;
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
