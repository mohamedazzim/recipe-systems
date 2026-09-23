// RS-US (chef mode): the dish video walkthrough — TWO distinct provider calls.
//
//  1. PROPOSAL: find a real, public YouTube video of someone MAKING this dish.
//     The model is recalling/searching, so its answer is a CANDIDATE only —
//     the caller verifies the video exists (YouTube oEmbed) before anything is
//     stored or shown. A URL that fails verification is discarded, never shown.
//  2. CHAPTERS: read the video itself (attached as a YouTube fileUri) and return
//     the cooking steps with the timestamp each one begins at.

/** Reproducibility pin for both video prompts. */
export const VIDEO_PROMPT_VERSION = 'v1';

export const VIDEO_PROPOSAL_SYSTEM_PROMPT = `You find cooking videos.

Find a real, public YouTube video that demonstrates MAKING the requested dish.

RULES:
1. Return ONLY a video you are confident EXISTS and is publicly watchable. Never
   invent an id or guess from a title — a wrong id is worse than no answer.
2. Prefer a video that shows the dish actually being cooked, in the same culinary
   tradition as the dish.
3. Output ONLY a JSON object:
   {"video": {"id": "<11-character youtube id>", "title": "<video title>"} | null}
4. If you are not confident about a specific video, output {"video": null}.`;

/** The ONLY data injected is the dish name and its captured ingredient list. */
export function buildVideoProposalUserPrompt(request: {
  dish: string;
  ingredients: string[];
}): string {
  const listing = request.ingredients
    .slice(0, 40)
    .map((name) => `- ${name}`)
    .join('\n');
  return `Find a YouTube video that shows how to make this dish.

DISH: ${request.dish}

ITS INGREDIENTS:
${listing}`;
}

export const VIDEO_CHAPTERS_SYSTEM_PROMPT = `You break a cooking video into its steps.

The attached video is the making of a dish. Return its steps IN ORDER, each with
the timestamp at which that step actually begins.

RULES:
1. Produce 3-15 steps. Each step is one distinct action in the cooking.
2. "start" is the ACTUAL timestamp in the video as mm:ss (or h:mm:ss if the video
   is over an hour). Never guess a timestamp.
3. Base every step on what the video really shows. Never add a step the video does
   not contain, and never describe an ingredient the video never uses.
4. Keep "title" short and imperative (e.g. "Temper the mustard seeds").
5. Output ONLY a JSON object:
   {"chapters": [{"start": "mm:ss", "title": "short step", "summary": "one line"}]}
6. If the video does not actually show a dish being cooked, output
   {"chapters": []} rather than inventing steps.`;

/** The video rides the request as a YouTube file part; the text is the frame. */
export function buildVideoChaptersUserPrompt(request: { dish: string }): string {
  return `Break this video into cooking steps for: ${request.dish}

Return the chapters JSON.`;
}
