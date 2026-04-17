---
id: tool-api
title: Tool API
subtitle: Use Claude Code or other CLI tools with full access to your workspace.
group: Automation
order: 12
---

## What is the Tool API?

Shoulders exposes its workspace tools -- references, paper search, comments, notebooks,
and canvas -- as a local HTTP API. This lets external CLI tools like
[Claude Code](https://docs.anthropic.com/en/docs/claude-code),
[Aider](https://aider.chat),
or any script that can run `curl` interact with your workspace the same way
the built-in AI chat does.

The API runs on `localhost` whenever the app is open. It uses the exact
same tool code as the built-in chat -- no separate implementation, no feature gaps.
When you add a reference via the API, it appears in your references panel instantly.
When you add a comment, it shows up in the editor margin in real time.

:::note
The Tool API is enabled by default. You can turn it off in
Settings → System → Tool Server.
:::

## Using with Claude Code

The most common use case is running Claude Code in Shoulders' built-in terminal.
Claude Code automatically discovers the API through the workspace configuration
that Shoulders generates.

1. Open a terminal in Shoulders (click the terminal icon in the sidebar,
   or press <kbd>Ctrl</kbd>+<kbd>`</kbd>).
2. Run `claude` to start Claude Code. It reads the workspace configuration
   and learns about the available tools.
3. Ask Claude Code to do something that uses your workspace -- "search my references
   for papers about attention mechanisms", "add a comment on the methodology section",
   "search for recent papers on transformer architectures". Claude Code will call
   the appropriate tools via the API.

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

## Using with other tools

The API is a standard HTTP endpoint. Any tool that can make HTTP requests can use it:

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
