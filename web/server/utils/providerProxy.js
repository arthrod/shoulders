/**
 * Provider proxy utilities: URL construction, auth headers, and usage extraction.
 *
 * The proxy is transparent — native provider format flows through unchanged.
 * These utilities handle server-side concerns: routing to the correct upstream,
 * setting API keys, and parsing usage for billing.
 */

// --- Usage extraction ---

export function extractUsage(provider, data) {
  if (provider === 'anthropic') {
    return {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    }
  }
  if (provider === 'openai') {
    // Responses API: usage at top level or nested in response.completed events
    const usage = data.usage || data.response?.usage
    return {
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
    }
  }
  if (provider === 'google') {
    return {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    }
  }
  return { inputTokens: 0, outputTokens: 0 }
}

// --- Provider URL + headers ---

export function getProviderUrl(provider, model, streaming) {
  if (provider === 'anthropic') {
    return 'https://api.anthropic.com/v1/messages'
  }
  if (provider === 'openai') {
    return 'https://api.openai.com/v1/responses'
  }
  if (provider === 'google') {
    const method = streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`
  }
  throw new Error(`Unknown provider: ${provider}`)
}

export function getProviderHeaders(provider, apiKey) {
  if (provider === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  }
  if (provider === 'openai') {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }
  }
  if (provider === 'google') {
    return {
      'Content-Type': 'application/json',
    }
  }
  return { 'Content-Type': 'application/json' }
}

export function appendGoogleKey(url, apiKey) {
  if (url.includes('?')) return `${url}&key=${apiKey}`
  return `${url}?key=${apiKey}`
}
