# Byline — Guest Post Writer

A small web app that drafts guest posts with the Claude API. Type a topic and/or a target keyword, and it returns a sourced, structured, ~800–1000 word draft. It runs real web search server-side, so statistics come back with working source links. Anyone with the URL can use it; no Claude account needed on their end.

It's built as a static page plus one Netlify Edge Function that proxies the Claude API. The function streams the draft back token by token, which also sidesteps Netlify's synchronous-function timeout (a normal function would get killed mid-generation).

---

## What's in here

```
byline-gp-writer/
├── index.html                      # the whole frontend (UI + streaming logic)
├── netlify.toml                    # config + route for the edge function
├── netlify/edge-functions/
│   └── generate.js                 # calls Claude, runs web search, streams the draft
└── README.md
```

There are no npm dependencies to install. The markdown renderer loads from a CDN in the browser; the edge function uses built-in web APIs.

---

## Deploy in ~10 minutes

### 1. Get an Anthropic API key
- Sign in at https://console.anthropic.com, go to **API Keys**, create one, and copy it.
- **Enable web search.** In the Console, an org admin has to turn on the web search tool, or every request will error. (Console → Settings/Privacy area where server tools are toggled.) See the web search docs: https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool

### 2. Put this folder in Netlify
Either option works:
- **Drag and drop:** zip the `byline-gp-writer` folder (or just drag the folder) onto https://app.netlify.com/drop.
- **Git:** push the folder to a GitHub repo, then in Netlify choose **Add new site → Import an existing project** and pick the repo. No build command needed; publish directory is the repo root (`.`).

### 3. Set environment variables
In Netlify: **Site configuration → Environment variables → Add a variable.**

| Key | Required | Value |
|-----|----------|-------|
| `ANTHROPIC_API_KEY` | Yes | your Claude API key from step 1 |
| `ACCESS_CODE` | Optional | a shared passphrase. If set, users must type it to generate. Leave it unset to keep the tool open. |

After adding or changing env vars, **redeploy** (Deploys → Trigger deploy → Deploy site) so the function picks them up.

### 4. Use it
Open your site URL, enter a topic and/or keyword, pick a length, and click **Write the draft**. The draft streams in, then renders with a small diagnostics strip (word count, reading time, and whether the keyword landed in the first 30%).

---

## Costs (read this before sharing the link widely)

Every generation costs you, the key owner, on two lines:
- **Model tokens** for the draft (Sonnet is the default; a ~1000-word sourced article is usually a few cents).
- **Web search**, billed separately by Anthropic at roughly **$10 per 1,000 searches**, plus the extra input tokens the search results add. This tool allows up to 4 searches per draft.

Two practical guardrails:
- Set `ACCESS_CODE` so only people you trust can run it. A public URL with no gate means anyone can spend your credits.
- Set a monthly spend limit in the Anthropic Console.

Confirm current pricing at https://www.anthropic.com/pricing and the web-search add-on cost in the web search docs linked above, since these change.

---

## Customizing

**Change the rules / publication.** The entire writing brief lives in the `SYSTEM_PROMPT` string at the top of `netlify/edge-functions/generate.js`. Edit it there to retarget another publication, change the banned-word list, adjust the keyword rule, and so on. Redeploy after editing.

**Higher quality drafts.** In the same file, change the model from `claude-sonnet-4-6` to `claude-opus-4-8`. Opus writes better but is slower and costs more.

**More or fewer searches.** Change `max_uses` on the `web_search` tool (lower = cheaper and faster, higher = more thorough sourcing).

**Rename the tool.** "Byline" is a placeholder. Change the wordmark and `<title>` in `index.html`.

---

## Honest limits

- **This will not reliably beat ZeroGPT on its own.** AI detectors score statistical patterns in text and are largely model-agnostic, so Claude's output can be flagged just like any other model's. The prompt is tuned to read human (uneven sentence rhythm, concrete specifics, no AI-tell vocabulary), which lowers scores, but no prompt clears every detector on every run. The reliable last step is a short human edit on top of the draft. Treat the output as a strong first draft, not a finished post.
- **Source links depend on web search actually running.** If web search isn't enabled in the Console, the draft will either skip stats or the request will error. The function is written to never invent a URL, so a missing source means it couldn't verify one, by design.
- **Long edge cases.** On rare runs where Claude pauses a very long search-heavy turn, a draft can come back short. Just generate again. Lowering `max_uses` makes this less likely.
- **Not legal/financial advice, etc.** Same content judgment you'd apply to any draft applies here.
