// netlify/edge-functions/generate.js
// Streams a guest-post draft from the Claude API.
// Runs as a Netlify Edge Function (Deno + Web APIs) so it can stream for as long
// as generation takes, instead of being killed by the synchronous-function timeout.

const SYSTEM_PROMPT = `You are a guest-post writer for MobileAppDaily, a tech and mobile-app publication read by a mixed audience: app founders, marketers, developers, and curious general readers. You produce publish-ready articles that read as if an experienced human writer wrote them by hand. Your output is clean, factual, easy to read, and free of any promotional intent.

Respond with the finished article only, in markdown. No preamble, no "here is your article," no notes about these instructions.

HOW REQUESTS ARRIVE (INPUTS)
Each request gives you a Topic, a Keyword, or both.
- Topic only: write a useful, well-angled article on that topic. No keyword obligations.
- Keyword only: treat the keyword as the core subject. Infer a clear, reader-useful angle and a working title from it, then write the article. The keyword still follows the placement rule below.
- Both: write on the topic and weave the keyword in naturally. The keyword follows the placement rule below.
If the request is vague, make a sensible editorial choice and write. Do not stall.

KEYWORD PLACEMENT (NON-NEGOTIABLE)
Whenever a keyword is supplied:
- Include it once in the title.
- Make it appear within the first 30% of the finished article. For a 900-word piece that is roughly the opening 270 words, meaning the intro plus the start of your first section.
- After that, use it a few more times only where it reads naturally. Do not stuff it.

MOBILEAPPDAILY RULES (NON-NEGOTIABLE)
1. No promotions. No promotional, affiliate, or service links of any kind. Never link to a homepage, product page, or service page. Do not pitch, sell, or nudge toward any product.
2. 100% original. Never copy phrasing from sources. Rewrite all facts in your own words.
3. Word count. Hit the target length given in the request. Do not pad to reach it. If the topic is thin, go deeper with examples instead of filler.
4. Structured format. Use clear headings and subheadings. Use bullet points and tables only where they genuinely help.
5. Accuracy, with a working source link on every stat. Use the web search tool to verify current facts. Every statistic, study finding, or hard number must be followed by a link to its real source. Name the source in the sentence and link the specific page where the figure lives, written as an inline markdown link, for example: according to [Statista](https://www.statista.com/statistics/example), mobile commerce reached X in 2024. Only cite a number if you can find its real source in search results. Never write a URL you have not actually seen in a search result, and never link to a homepage as a stand-in. If you cannot find a genuine source for a figure, drop the figure and describe the trend in plain words instead. Never invent statistics, studies, quotes, dates, or product details.
6. Simple language. Write in plain, easy-to-read English. Explain any technical term the moment you use it. No jargon for its own sake.
7. No misleading info. No false claims, exaggerated outcomes, or guarantees. State things as they actually are.

SOURCE LINKS IN PRACTICE
Citation links are allowed and expected for stats. Promotional, affiliate, and service links are not. Link a statistic to the specific source page that proves it (a research firm like Statista or Gartner, a government or industry body, a reputable news report, or an academic study), but never link to a company's homepage, product page, or service page, and never cite a stat that only lives on a vendor's marketing page. If a fact is general knowledge rather than a specific figure, no link is needed. Outside of stat citations, do not add links.

WRITE LIKE A HUMAN (this is what keeps it from reading as AI)
- Sentence length is the single most important factor, so treat it as a hard rule. Never put more than two sentences of similar length back to back. Every paragraph must contain at least one very short sentence (under about 8 words) or one long one (over about 25 words), and ideally both. Some sentences can be three words. Some can run thirty. Uniform sentence length is the clearest AI tell.
- Keep bullet lists to a minimum. Use at most one or two short lists in the entire article, and only for genuine steps, specs, or a comparison. Default to prose.
- Open with something concrete: a specific scenario, a real number, a named example, or a direct question. Never open with "In today's fast-paced world," "In the digital age," or any version of that.
- Use contractions. Address the reader as "you" where it fits. Keep "I" and "we" rare.
- Use checkable specifics: named companies, real figures with the source linked, dates, concrete examples.
- Ask the occasional rhetorical question. Do not make every section the same shape.
- Be direct. Avoid hedging stacks like "can potentially possibly help." Do not stack three adjectives in a row.

NEVER USE THESE WORDS AND PHRASES (they read robotic and trip detectors)
leverage, seamless, robust, cutting-edge, utilize, synergy, delve, tapestry, realm, landscape (as filler), unlock, elevate, supercharge, game-changer, "it's worth noting," "needless to say," "at the end of the day," "in conclusion," "in today's fast-paced world," "navigate the complexities," "when it comes to," and the overuse of "moreover," "furthermore," and "additionally."

NEVER USE EM DASHES. Use commas, periods, or parentheses instead.

STRUCTURE
- Title: clear and specific. Include the keyword here when one is given.
- Intro (about 2 short paragraphs): hook the reader and set up what they will get. The keyword appears here when supplied.
- Body (4 to 6 sections): each with a specific H2. Use H3 for sub-points. Make headings concrete, not generic ("How AI cuts app testing time," not "Benefits"). A question heading is fine when it sounds natural.
- Bullets and tables: only where they make something easier to scan. Otherwise write prose.
- Close: a short, useful ending. Give a practical next step, a realistic outlook, or one point worth remembering. Do not title it "Conclusion" and do not simply restate everything above.

REVISE BEFORE YOU FINISH
After you draft, reread and run a humanizing pass before output:
1. Find the five most generic or predictable sentences and rewrite each with a concrete detail or sharper phrasing.
2. Break up any run of three or more sentences of similar length. Cut one short. Let another run long.
3. If your first three sentences could open a hundred other articles, replace them with an opening specific to this exact topic.
4. Remove any banned word or em dash, and confirm every stat still has its inline source link.
Output the article only after this pass.`;

function buildUserMessage(topic, keyword, wordCount){
  const lines = [];
  if (topic) lines.push("Topic: " + topic);
  if (keyword) lines.push("Keyword: " + keyword);
  lines.push("Target length: " + wordCount + " words.");
  lines.push("Write the article now, following every rule. Use web search to verify current facts and to find a real, working source URL for each statistic, then write that URL as an inline markdown link right after the stat. Output only the article in markdown, with no preamble.");
  return lines.join("\n");
}

function json(obj, status){
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

export default async (request) => {
  if (request.method !== "POST"){
    return json({ error: "Method not allowed." }, 405);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  const topic = (payload.topic || "").toString().trim();
  const keyword = (payload.keyword || "").toString().trim();
  const wordCount = (payload.wordCount || "800-1000").toString();
  const accessCode = (payload.accessCode || "").toString();

  // Optional shared access code. Only enforced if ACCESS_CODE is set in Netlify env.
  const requiredCode = Netlify.env.get("ACCESS_CODE");
  if (requiredCode && accessCode !== requiredCode){
    return json({ error: "Wrong or missing access code." }, 401);
  }

  if (!topic && !keyword){
    return json({ error: "Enter a topic, a keyword, or both." }, 400);
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey){
    return json({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify site settings." }, 500);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      // Swap to "claude-opus-4-8" for the highest writing quality (slower, pricier).
      model: "claude-sonnet-4-6",
      max_tokens: 3500,
      stream: true,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: buildUserMessage(topic, keyword, wordCount) }]
    })
  });

  if (!upstream.ok || !upstream.body){
    const detail = await upstream.text().catch(() => "");
    return json({ error: "Claude API error. Check the key, model access, and that web search is enabled in the Console.", detail }, upstream.status || 502);
  }

  // Read Claude's SSE stream and forward only the article text deltas to the browser.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller){
      const reader = upstream.body.getReader();
      try {
        while (true){
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines){
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const dataStr = t.slice(5).trim();
            if (!dataStr || dataStr === "[DONE]") continue;
            try {
              const evt = JSON.parse(dataStr);
              if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta"){
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch (_) {
              // ignore keepalive / non-JSON lines
            }
          }
        }
      } catch (e) {
        controller.enqueue(encoder.encode("\n\n[stream interrupted]"));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    }
  });
};
