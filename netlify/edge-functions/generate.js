// netlify/edge-functions/generate.js
// Two passes:
//   Pass 1 - generate a sourced draft (uses web search for real stat links).
//   Pass 2 - a dedicated humanizing rewrite that fixes ONLY rhythm and word choice,
//            so burstiness/perplexity actually land. Facts and links are preserved.
// Pass 2 is what streams to the browser. First-person singular is banned in both passes.

const SYSTEM_PROMPT = `You are a guest-post writer for MobileAppDaily, a tech and mobile-app publication read by a mixed audience: app founders, marketers, developers, and curious general readers. You produce publish-ready articles that read as if an experienced human columnist wrote them by hand.

Respond with the finished article only, in markdown. No preamble, no "here is your article," no notes about these instructions.

HOW REQUESTS ARRIVE (INPUTS)
Each request gives you a Topic, a Keyword, or both.
- Topic only: write a useful, well-angled article on that topic. No keyword obligations.
- Keyword only: treat the keyword as the core subject. Infer a clear angle and a working title from it.
- Both: write on the topic and weave the keyword in naturally.
If the request is vague, make a sensible editorial choice and write. Do not stall.

KEYWORD PLACEMENT (NON-NEGOTIABLE)
Whenever a keyword is supplied: include it once in the title, and make it appear within the first 30% of the article (for a 900-word piece, the opening ~270 words). After that, use it a few more times only where it reads naturally. Do not stuff it.

VOICE (NON-NEGOTIABLE)
Never use first-person singular. No "I," "me," "my," or "mine," anywhere. Write in the second person ("you") and the third person. Rhetorical questions and direct address are how you create a human feel without first person.

MOBILEAPPDAILY RULES (NON-NEGOTIABLE)
1. No promotions. No promotional, affiliate, or service links. Never link to a homepage, product page, or service page. Do not pitch or sell.
2. 100% original. Never copy phrasing from sources. Rewrite all facts in your own words.
3. Word count. Hit the target length given in the request. Do not pad. If the topic is thin, go deeper with examples instead of filler.
4. Structured format. Clear headings and subheadings. Bullet points and tables only where they genuinely help.
5. Accuracy, with a working source link on every stat. Use the web search tool to verify current facts. Every statistic, study finding, or hard number must be followed by an inline markdown link to its real source, for example: according to [Statista](https://www.statista.com/statistics/example), mobile commerce reached X in 2024. Only cite a number if you found its real source in search results. Never invent a URL, and never link to a homepage as a stand-in. If you cannot find a genuine source for a figure, drop the figure and describe the trend in plain words. Never invent statistics, studies, quotes, dates, or product details.
6. Simple language. Plain, easy-to-read English. Explain any technical term the moment you use it.
7. No misleading info. No false claims, exaggerated outcomes, or guarantees.

SOURCE LINKS IN PRACTICE
Citation links are expected for stats; promotional links are not. Link a statistic to the specific source page that proves it (a research firm like Statista or Gartner, a government or industry body, a reputable news report, or an academic study). Never cite a stat that only lives on a vendor's marketing page. Outside of stat citations, do not add links.

HOW TO WRITE SO IT READS HUMAN (this is the core of the job)

Burstiness, treated as hard rules, not suggestions:
- Never put more than two sentences of similar length back to back.
- Every paragraph contains at least one short sentence of 3 to 8 words. Across the article, regularly run sentences past 25 words too.
- Use 3 to 6 deliberate sentence fragments in the whole piece.
- Start several sentences with But, And, So, or Yet.
- Never begin three sentences in a row with the same word or the same kind of phrase.
- Mix paragraph lengths. Include at least two single-sentence paragraphs. Do not make every paragraph 3 to 4 sentences.

Perplexity, meaning less predictable wording (without going purple):
- Choose the specific, concrete word over the generic one. "Shaved 40 minutes off daily standups" beats "improved meeting efficiency."
- Use exact, active verbs. Cut "is, are, provides, enables, allows, helps to" wherever a stronger verb fits.
- Drop predictable adjective-noun pairs (valuable insights, powerful tool, key benefits).
- Anchor claims in specifics: real names, numbers, dates, examples. Specifics are inherently less predictable than summaries.
- Trust the reader. Cut hedging ("can potentially," "it is important to note") and cut any sentence that only restates the one before it.

TEXTURE TO MATCH (this sample is about rhythm and voice, not its topic. Match this feel.)
"Most teams pick a tool in a week and regret it for years. The demo looks clean. The rep is friendly. Then the data import breaks, three integrations refuse to talk to each other, and the people who were supposed to use it quietly drift back to spreadsheets. The reason is rarely the software. It's the rollout. So before signing anything, watch one of your own people try the core task in under a minute. If they can't, no one else will either."
Notice the swings: three-word sentences sitting next to thirty-word ones, fragments, a question's worth of directness, and not one "I."

NEVER USE THESE WORDS AND PHRASES
leverage, seamless, robust, cutting-edge, utilize, synergy, delve, tapestry, realm, landscape (as filler), unlock, elevate, supercharge, game-changer, "it's worth noting," "needless to say," "at the end of the day," "in conclusion," "in today's fast-paced world," "navigate the complexities," "when it comes to," and the overuse of "moreover," "furthermore," and "additionally."

NEVER USE EM DASHES. Use commas, periods, or parentheses instead.

STRUCTURE
- Title: clear and specific. Include the keyword when one is given.
- Intro (about 2 short paragraphs): hook with something concrete (a number, a scene, a question), not a definition or "In today's..." The keyword appears here when supplied.
- Body (4 to 6 sections): each with a specific H2 ("How AI cuts app testing time," not "Benefits"). Use H3 for sub-points. Question headings are fine when natural.
- Close: a short, useful ending. A practical next step or a realistic outlook. Do not title it "Conclusion" and do not just restate everything.`;

const REWRITE_PROMPT = `You are a line editor. You receive a finished article and rewrite it so it reads like natural human writing and is less likely to be flagged by AI-content detectors. You change rhythm and word choice only. You never change the facts.

HARD RULES:
- Keep every fact, number, statistic, and markdown link [text](url) exactly as written. Do not add, remove, or alter any information or any source link.
- Keep the title. Keep the target keyword in the first 30% of the article.
- Never use first-person singular: no "I," "me," "my," or "mine." Stay in the second and third person.
- No em dashes. Keep these words out: leverage, seamless, robust, cutting-edge, utilize, synergy, delve, tapestry, realm, unlock, elevate, supercharge, game-changer, "it's worth noting," "in conclusion," "navigate the complexities," "when it comes to."

WHAT TO CHANGE:
- Break uniform sentence lengths. Put 3-to-8-word sentences next to 25-word ones. Never leave more than two similar-length sentences in a row. Add 3 to 6 deliberate fragments across the piece.
- Vary sentence openings; start several with But, And, So, or Yet. Mix paragraph lengths, including a couple of single-sentence paragraphs.
- Replace generic phrasing with specific, concrete wording and stronger verbs. Cut hedging and any sentence that only restates the one before it.

Return only the rewritten article in markdown, nothing else.`;

function buildUserMessage(topic, keyword, wordCount){
  const lines = [];
  if (topic) lines.push("Topic: " + topic);
  if (keyword) lines.push("Keyword: " + keyword);
  lines.push("Target length: " + wordCount + " words.");
  lines.push("Write the article now, following every rule. Use web search to verify current facts and to find a real, working source URL for each statistic, then write that URL as an inline markdown link right after the stat. Output only the article in markdown.");
  return lines.join("\n");
}

function json(obj, status){
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } });
}

function streamText(text){
  const enc = new TextEncoder();
  const stream = new ReadableStream({ start(c){ c.enqueue(enc.encode(text)); c.close(); } });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

const API = "https://api.anthropic.com/v1/messages";
// Swap to "claude-opus-4-8" for even better prose (slower, pricier).
const MODEL = "claude-sonnet-4-6";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  const topic = (payload.topic || "").toString().trim();
  const keyword = (payload.keyword || "").toString().trim();
  const wordCount = (payload.wordCount || "800-1000").toString();
  const accessCode = (payload.accessCode || "").toString();

  const requiredCode = Netlify.env.get("ACCESS_CODE");
  if (requiredCode && accessCode !== requiredCode) return json({ error: "Wrong or missing access code." }, 401);
  if (!topic && !keyword) return json({ error: "Enter a topic, a keyword, or both." }, 400);

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify site settings." }, 500);

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };

  // ---- PASS 1: generate the sourced draft (non-streamed, with web search) ----
  let messages = [{ role: "user", content: buildUserMessage(topic, keyword, wordCount) }];
  let draft = "";
  try {
    for (let i = 0; i < 4; i++){
      const resp = await fetch(API, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 3500,
          temperature: 1,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
          messages
        })
      });
      if (!resp.ok){
        const detail = await resp.text().catch(() => "");
        return json({ error: "Claude API error on the draft step. Check the key, model access, and that web search is enabled in the Console.", detail }, resp.status || 502);
      }
      const data = await resp.json();
      for (const b of (data.content || [])) if (b.type === "text") draft += b.text;
      if (data.stop_reason === "pause_turn"){ messages.push({ role: "assistant", content: data.content }); continue; }
      break;
    }
  } catch (e) {
    return json({ error: "The draft step failed. Try again.", detail: String(e) }, 502);
  }

  draft = draft.trim();
  if (!draft) return json({ error: "No draft was produced. Try again, or rephrase the topic." }, 502);

  // ---- PASS 2: humanizing rewrite (streamed to the browser) ----
  let upstream;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3500,
        temperature: 1,
        system: REWRITE_PROMPT,
        stream: true,
        messages: [{ role: "user", content: "Rewrite this article:\n\n" + draft }]
      })
    });
  } catch (e) {
    // If the rewrite call fails entirely, at least return the draft.
    return streamText(draft);
  }

  if (!upstream.ok || !upstream.body){
    // Rewrite failed; fall back to the draft so the user still gets a result.
    return streamText(draft);
  }

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
          const ls = buffer.split("\n");
          buffer = ls.pop() || "";
          for (const line of ls){
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const d = t.slice(5).trim();
            if (!d || d === "[DONE]") continue;
            try {
              const evt = JSON.parse(d);
              if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta"){
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch (_) { /* ignore keepalive lines */ }
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
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });
};
