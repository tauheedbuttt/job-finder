type Answer = Record<string, unknown>;

export function transport(...replies: Array<(questions: Record<string, unknown>) => Record<string, Answer>>) {
  const calls: Array<{ url: string; body: { state: unknown; questions: Record<string, any> } }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body });
    const reply = replies[calls.length - 1];
    if (!reply) throw new Error("unexpected call");
    const answers = reply(body.questions);
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

export const noul = (p: number) => ({ type: "noul", noul: p });

export const choice = (winner: string, probabilities: Record<string, number>) => ({
  type: "choice",
  choice: winner,
  probabilities,
  confidence: probabilities[winner] ?? 0,
});
