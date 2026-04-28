---
id: tool-api
title: Tool API
subtitle: Use the shoulders CLI or HTTP API to connect any coding agent to your workspace.
group: Automation
order: 12
---

## What is the Tool API?

Shoulders exposes its workspace tools -- references, paper search, comments, notebooks,
and canvas -- via a CLI and a local HTTP API. This lets external coding agents like
[Claude Code](https://docs.anthropic.com/en/docs/claude-code),
[Codex](https://github.com/openai/codex),
[Gemini CLI](https://github.com/google/gemini-cli),
or any script interact with your workspace the same way
the built-in AI chat does.

The `shoulders` CLI is installed automatically when you first open the app.
The HTTP API runs on `localhost` whenever the app is open. Both use the exact
same tool code as the built-in chat -- no separate implementation, no feature gaps.
When you add a reference via the CLI, it appears in your references panel instantly.
When you add a comment, it shows up in the editor margin in real time.

:::note
The Tool API is enabled by default. You can turn it off in
Settings → System → Tool Server.
:::

## Using the CLI

The `shoulders` command is the simplest way to call workspace tools from a terminal:

```sh
# List all available tools
shoulders --list

# Search your reference library
shoulders search_references --query "attention mechanisms"

# Insert a citation
shoulders cite_reference --key smith2024

# Read a file with document comments
shoulders read_file --path "paper.docx"

# Search for academic papers
shoulders search_papers --query "transformer architectures"

# Show parameters for any tool
shoulders search_references --help
```

The CLI discovers the running Shoulders app automatically by looking for
`.shoulders/tool-server-token` in the current directory or any parent.

## Using with coding agents

Launch coding agents directly from the AI sidebar: click **New**, then choose
an installed agent (Claude Code, Codex, Gemini CLI, etc.). Shoulders
automatically:

- Creates a context file the agent reads on startup (`CLAUDE.md`, `AGENTS.md`,
  or `GEMINI.md` depending on the agent) with tool usage instructions and your
  project instructions from `_instructions.md`
- Injects the tool server URL and token as environment variables
- Provides the `shoulders` CLI on the system PATH

The agent discovers the available tools and can call them immediately --
no manual configuration needed.

:::tip
The generated context file (e.g. `AGENTS.md`) is created once and then
owned by you. Edit it to add project-specific guidance for the agent.
:::

## Available tools

The API exposes domain-specific tools that CLI tools don't have natively. Basic file
operations (read, write, search) are not included because tools like Claude Code already
handle those directly.

| Category | Tools |
|----------|-------|
| References | Search library, get reference details, add by DOI/arXiv/BibTeX, insert citation, edit metadata |
| Web Research | Web search, academic paper search, fetch URL content |
| Feedback | Add comment, reply to comment, resolve comment, present choice cards |
| Notebooks | Read notebook, edit cell, run cell, run all cells, add cell, delete cell |
| Canvas | Read canvas, add/edit/delete/move nodes, add/remove edges |

Tools you disable in Settings → Tools are also disabled in the API -- the same
permissions apply everywhere.

## HTTP API

For scripts or tools that prefer raw HTTP requests:

```sh
# List available tools
curl -s http://localhost:17532/api/tools \
  -H "Authorization: Bearer $(cat .shoulders/tool-server-token)"

# Call a tool
curl -s -X POST http://localhost:17532/api/tools/call \
  -H "Authorization: Bearer $(cat .shoulders/tool-server-token)" \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_references", "input": {"query": "attention"}}'
```

The bearer token is in `.shoulders/tool-server-token` and regenerates
each time the app starts. The full tool list with parameters is in
`.shoulders/tool-api.md`.

## How it works

When you open a workspace, Shoulders starts a lightweight HTTP server on port 17532.
Incoming requests are routed to the same tool execution code that the built-in AI chat
uses. This means:

- Changes are **immediately visible** in the app -- a reference added via
  the API appears in the references panel, a comment appears in the editor margin.
- Tool **permissions are shared** -- if you disable a tool in Settings,
  it's disabled for both the chat and the API.
- External API costs (web search, paper search) are **tracked** in your
  usage dashboard regardless of whether the call came from the chat or the API.

## Security

The API only accepts connections from your own machine (`localhost`) and
requires a bearer token that changes every time the app starts. No data leaves your
machine through the API -- it only bridges between CLI tools and the running app.

Workspace-level file operations (read, write, edit, delete) and shell commands are
deliberately **not exposed** through the API. CLI tools like Claude Code
handle file operations directly with their own safety checks and permission prompts.
