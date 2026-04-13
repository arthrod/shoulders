<template>
  <div>
    <h1>Tool API</h1>
    <p class="docs-subtitle">Use Claude Code or other CLI tools with full access to your workspace.</p>

    <h2>What is the Tool API?</h2>
    <p>
      Shoulders exposes its workspace tools — references, paper search, comments, notebooks,
      and canvas — as a local HTTP API. This lets external CLI tools like
      <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener">Claude Code</a>,
      <a href="https://aider.chat" target="_blank" rel="noopener">Aider</a>,
      or any script that can run <code>curl</code> interact with your workspace the same way
      the built-in AI chat does.
    </p>
    <p>
      The API runs on <code>localhost</code> whenever the app is open. It uses the exact
      same tool code as the built-in chat — no separate implementation, no feature gaps.
      When you add a reference via the API, it appears in your references panel instantly.
      When you add a comment, it shows up in the editor margin in real time.
    </p>

    <DocsCallout type="note">
      The Tool API is enabled by default. You can turn it off in
      Settings → System → Tool Server.
    </DocsCallout>

    <h2>Using with Claude Code</h2>
    <p>
      The most common use case is running Claude Code in Shoulders' built-in terminal.
      Claude Code automatically discovers the API through the workspace configuration
      that Shoulders generates.
    </p>
    <div class="docs-steps">
      <div class="docs-step">
        <span class="docs-step-number">1</span>
        <div class="docs-step-content">
          Open a terminal in Shoulders (click the terminal icon in the sidebar,
          or press <kbd>Ctrl</kbd>+<kbd>`</kbd>).
        </div>
      </div>
      <div class="docs-step">
        <span class="docs-step-number">2</span>
        <div class="docs-step-content">
          Run <code>claude</code> to start Claude Code. It reads the workspace configuration
          and learns about the available tools.
        </div>
      </div>
      <div class="docs-step">
        <span class="docs-step-number">3</span>
        <div class="docs-step-content">
          Ask Claude Code to do something that uses your workspace — "search my references
          for papers about attention mechanisms", "add a comment on the methodology section",
          "search for recent papers on transformer architectures". Claude Code will call
          the appropriate tools via the API.
        </div>
      </div>
    </div>

    <h2>Available tools</h2>
    <p>
      The API exposes domain-specific tools that CLI tools don't have natively. Basic file
      operations (read, write, search) are not included because tools like Claude Code already
      handle those directly.
    </p>
    <table class="docs-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Tools</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>References</td>
          <td>Search library, get reference details, add by DOI/arXiv/BibTeX, insert citation, edit metadata</td>
        </tr>
        <tr>
          <td>Web Research</td>
          <td>Web search, academic paper search, fetch URL content</td>
        </tr>
        <tr>
          <td>Feedback</td>
          <td>Add comment, reply to comment, resolve comment, present choice cards</td>
        </tr>
        <tr>
          <td>Notebooks</td>
          <td>Read notebook, edit cell, run cell, run all cells, add cell, delete cell</td>
        </tr>
        <tr>
          <td>Canvas</td>
          <td>Read canvas, add/edit/delete/move nodes, add/remove edges</td>
        </tr>
      </tbody>
    </table>

    <p>
      Tools you disable in Settings → Tools are also disabled in the API — the same
      permissions apply everywhere.
    </p>

    <h2>Using with other tools</h2>
    <p>
      The API is a standard HTTP endpoint. Any tool that can make HTTP requests can use it:
    </p>
    <pre>
# List available tools
curl -s http://localhost:17532/api/tools \
  -H "Authorization: Bearer $(cat .shoulders/tool-server-token)"

# Call a tool
curl -s -X POST http://localhost:17532/api/tools/call \
  -H "Authorization: Bearer $(cat .shoulders/tool-server-token)" \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_references", "input": {"query": "attention"}}'</pre>
    <p>
      The bearer token is in <code>.shoulders/tool-server-token</code> and regenerates
      each time the app starts. The full tool list with parameters is in
      <code>.shoulders/tool-api.md</code>.
    </p>

    <h2>How it works</h2>
    <p>
      When you open a workspace, Shoulders starts a lightweight HTTP server on port 17532.
      Incoming requests are routed to the same tool execution code that the built-in AI chat
      uses. This means:
    </p>
    <ul>
      <li>Changes are <strong>immediately visible</strong> in the app — a reference added via
        the API appears in the references panel, a comment appears in the editor margin.</li>
      <li>Tool <strong>permissions are shared</strong> — if you disable a tool in Settings,
        it's disabled for both the chat and the API.</li>
      <li>External API costs (web search, paper search) are <strong>tracked</strong> in your
        usage dashboard regardless of whether the call came from the chat or the API.</li>
    </ul>

    <h2>Security</h2>
    <p>
      The API only accepts connections from your own machine (<code>localhost</code>) and
      requires a bearer token that changes every time the app starts. No data leaves your
      machine through the API — it only bridges between CLI tools and the running app.
    </p>
    <p>
      Workspace-level file operations (read, write, edit, delete) and shell commands are
      deliberately <strong>not exposed</strong> through the API. CLI tools like Claude Code
      handle file operations directly with their own safety checks and permission prompts.
    </p>
  </div>
</template>
