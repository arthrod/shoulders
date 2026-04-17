---
id: privacy
title: "Privacy & Data"
subtitle: "Where your data lives, what leaves your machine, and how to control it."
group: Workspace
order: 16
---

## Your files stay on your machine

Shoulders is a desktop application. Your files live on your local filesystem — no cloud database, no sync layer, no proprietary storage. The app is fully functional offline for all non-AI features: editing, file management, version history, references, terminal, and PDF export.

## What connects to the internet

The only network traffic Shoulders generates:

### AI requests

When you use inline suggestions, chat, or comments, the relevant context is sent to the AI provider you configured (Anthropic, OpenAI, or Google). Requests go directly from your machine to the provider. Shoulders forwards them through a local proxy only to handle browser restrictions — it does not store or inspect them.

### Reference lookups

When you import a reference by DOI, Shoulders queries CrossRef to fetch metadata. The DOI is the only data sent.

### External AI tools

Three optional tools (`web_search`, `search_papers`, `fetch_url`) transmit data to third-party services when the AI uses them. These are labelled as external in Settings and can be disabled individually or all at once.

### Shoulders account

If you use a Shoulders account instead of your own API keys, AI requests are routed through the Shoulders proxy. Usage costs are tracked. Request and response content is not stored. This is entirely optional.

### Telemetry

Shoulders collects anonymous usage telemetry to improve the product — things like which features are used and which themes are popular. No file contents, no personal data, just aggregate patterns. You can opt out in Settings.

## Controlling what is shared

Every AI tool (28 total) can be individually enabled or disabled in Settings → Tools. External tools are clearly labelled. Disabled tools are removed from the AI entirely — the model does not know they exist.

---

For the full legal documents:

- [Privacy Policy](/privacy)
- [Terms of Service](/terms)
