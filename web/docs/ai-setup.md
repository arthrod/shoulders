---
id: ai-setup
title: "Setup"
subtitle: "Configure AI access, models, privacy controls, and project-specific instructions."
group: AI Assistant
order: 6
---

## Two ways to use AI

Shoulders needs access to an AI provider. There are two options — use whichever suits you, or both:

### Shoulders account

You can sign up for a Shoulders account directly within the app (or at [shoulde.rs](https://shoulde.rs)) to use AI features without managing API keys. New accounts include free AI usage. Requests are routed through the Shoulders proxy, which forwards them to AI providers on your behalf. During the research preview, additional balance is available on request.

### Bring your own API keys

Alternatively, supply your own API keys from one or more providers. Open Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) → Models:

| Provider | Models | Used for |
|----------|--------|----------|
| Anthropic | Opus 4.7, Sonnet 4.6, Haiku 4.5 | Chat, comments, inline suggestions |
| OpenAI | GPT-5.4, GPT-5.4 Mini | Chat, inline suggestions |
| Google | Gemini 3.1 Pro, Gemini 3 Flash, Gemini 2.5 Flash Lite | Chat, inline suggestions |

Keys are stored securely on your computer. They are sent only to the provider's API — nowhere else. You pay the provider at their standard rates.

You can use both methods simultaneously. The model picker in the chat input shows all available models from your API keys and your Shoulders account.

## Models

Eight models are available by default: Opus 4.7, Sonnet 4.6, and Haiku 4.5 from Anthropic; GPT-5.4 and GPT-5.4 Mini from OpenAI; Gemini 3.1 Pro and Gemini 3 Flash from Google. Which models appear depends on your configured keys and account.

The model list is defined in `.shoulders/models.json`. You can add custom endpoints by editing this file — private or self-hosted models, institutional AI servers, or local language models running on your machine. Any service that exposes an OpenAI-compatible, Anthropic, or Google API can be added with a URL and API key variable.

## Extended thinking

Some models support extended thinking, which gives the AI more time to reason through complex problems before responding. This is especially useful for nuanced writing feedback, tricky analysis, or multi-step research questions.

- **Anthropic** — Claude Opus 4.7 and Sonnet 4.6 support adaptive extended thinking.
- **OpenAI** — GPT-5.4 and reasoning models (o-series) support thinking mode.
- **Google** — Gemini 3.1 Pro and Gemini 3 Flash support thinking mode. Gemini 2.5 Flash also supports it with a fixed budget.

You can adjust the thinking effort (low, medium, or high) per model, or disable it entirely. When thinking is active, the AI's reasoning appears as a collapsible section above its response.

## Image generation

The AI can generate images using Gemini 3.1 Flash Image (Nano Banana 2). Ask the AI to create, illustrate, or design something visual, and it will use the `generate_image` tool automatically. Images are saved to your workspace root and displayed inline in the chat.

This works with a Google API key or a Shoulders account — the same access you use for Gemini chat models. Image output is priced at ~$0.067 per image (1K resolution).

## Usage and costs

Shoulders tracks every AI request and its estimated cost. The footer bar shows your monthly total — click it to open Settings → Usage for a detailed breakdown.

- **Monthly breakdown** — cost, token count, and call count per feature (chat, suggestions, comments, references) and per model.
- **Trend** — a bar chart showing the last 12 months of usage.
- **Budget** — set a monthly soft limit. The cost display turns amber when you approach it. It never blocks you from working.

If you use a Shoulders account, costs are deducted per request at real model-specific rates. Your balance can be viewed in the app via Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) → Account, or at [shoulde.rs/account](https://shoulde.rs/account).

## Privacy controls

Shoulders provides 29 AI tools across six categories (workspace, references, feedback, notebooks, web research, creation). Each tool can be individually enabled or disabled in Settings → Tools.

Five tools transmit data to third-party services beyond your AI provider: `web_search` and `fetch_url` (via Exa), `search_papers` (via OpenAlex, with Exa and CrossRef fallbacks), `add_reference` (via CrossRef for DOI lookup), and `generate_image` (via Gemini). These are clearly labelled as external. A single "Disable all external tools" toggle removes all five at once.

Disabled tools are removed from the AI's definitions entirely — the model does not know they exist and cannot attempt to use them.

## Project instructions

Create a file called `_instructions.md` at the root of your workspace. Its contents are included in every AI interaction — chat, comments, and inline suggestions. Use it to set tone, define terminology, specify citation conventions, or provide project-specific context.

Changes take effect immediately — no restart needed. Access the file quickly from the model picker dropdown in the chat input.

:::tip
HTML comments in `_instructions.md` are stripped before the AI sees them. Use them as notes to yourself: `<!-- Remind myself to update this -->`.
:::

## System prompt

The file `.shoulders/system.md` contains the base system prompt used by all AI features. It is loaded when the workspace opens. You can edit it to adjust the AI's default behaviour. For project-specific context, `_instructions.md` is usually the better choice.
