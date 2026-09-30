import { reply, type ChoiceAnswer, type NoulAnswer, type Question, type ScoreAnswer } from "./schemas";

export const BASE = "http://localhost:8790";

export type Options = { base?: string; fetch?: typeof fetch; signal?: AbortSignal };

type Typed<Q extends Question> = Q["type"] extends "noul" ? NoulAnswer : Q["type"] extends "choice" ? ChoiceAnswer : ScoreAnswer;

export type Reply<Q extends Record<string, Question>> = { model: string; answers: { [K in keyof Q]: Typed<Q[K]> } };

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export async function jev<const Q extends Record<string, Question>>(state: unknown, questions: Q, options: Options = {}): Promise<Reply<Q>> {
  const send = options.fetch ?? fetch;
  const url = `${(options.base ?? BASE).replace(/\/+$/, "")}/jev`;
  const res = await send(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, questions }),
    signal: options.signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? JSON.stringify(body.detail) : res.statusText;
    throw new JevError(`Jev ${res.status}: ${detail}`, res.status);
  }
  const parsed = reply.safeParse(body);
  if (!parsed.success) throw new JevError(`Jev reply malformed: ${parsed.error.message}`, res.status);
  for (const [key, q] of Object.entries(questions)) {
    const a = parsed.data.answers[key];
    if (a?.type !== q.type) throw new JevError(`Jev answer for ${key} missing or not ${q.type}`, res.status);
  }
  return parsed.data as Reply<Q>;
}
