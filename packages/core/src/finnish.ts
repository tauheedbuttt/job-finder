import { jev, type Options } from "./jev";
import { thresholds as limits, type Finnish, type NoulQuestion, type Sentence, type Span, type Thresholds } from "./schemas";

export type FinnishOptions = Options & { thresholds?: Partial<Thresholds> };

const overall: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Does this job require or indicate Finnish language skill in any way?",
    input: "`sentences` is a job description, or one part of it. Each item has the original text `fi` and its English translation `en`.",
  },
  criteria: {
    true: "Finnish skill is required, preferred, an advantage, or implied by the job.",
    false: "Nothing in the job asks for or implies Finnish skill.",
  },
};

function needed(i: number): NoulQuestion {
  return {
    type: "noul",
    instructions: `Does the sentence \`sentences[${i}]\` say that Finnish language skill is needed, wanted, or an advantage for this job? Read both its original text \`fi\` and English translation \`en\`.`,
    criteria: {
      true: "The sentence asks for, prefers, or values Finnish skill.",
      false: "The sentence does not ask for Finnish skill.",
    },
  };
}

function waived(i: number): NoulQuestion {
  return {
    type: "noul",
    instructions: `Does the sentence \`sentences[${i}]\` say that Finnish is not needed, or that English is enough for this job? Read both its original text \`fi\` and English translation \`en\`.`,
    criteria: {
      true: "The sentence says Finnish is not required or that English alone is enough.",
      false: "The sentence does not say that.",
    },
  };
}

export function finnishQuestions(sentences: Sentence[]): Record<string, NoulQuestion> {
  const questions: Record<string, NoulQuestion> = { requires_finnish: overall };
  sentences.forEach((s, i) => {
    questions[`fi_${s.id}`] = needed(i);
    questions[`en_${s.id}`] = waived(i);
  });
  return questions;
}

// Keeps each request small; every chunk gets the whole-JD question too.
export const CHUNK = 40;

export async function checkFinnish(input: { sentences: Sentence[] }, options: FinnishOptions = {}): Promise<Finnish> {
  const t = limits.parse(options.thresholds ?? {});
  const chunks: Sentence[][] = [];
  for (let i = 0; i < input.sentences.length; i += CHUNK) chunks.push(input.sentences.slice(i, i + CHUNK));
  if (!chunks.length) chunks.push([]);
  const replies = await Promise.all(chunks.map((sentences) => jev({ sentences }, finnishQuestions(sentences), options)));
  const score = Math.max(...replies.map((r) => r.answers.requires_finnish!.noul));
  const verdict = score >= t.yes ? "yes" : score <= t.no ? "no" : "unclear";
  const spans: Span[] = [];
  chunks.forEach((sentences, c) => {
    const { answers } = replies[c]!;
    for (const s of sentences) {
      const red = answers[`fi_${s.id}`]!.noul;
      const green = answers[`en_${s.id}`]!.noul;
      const [kind, p] = green > red ? (["green", green] as const) : (["red", red] as const);
      if (p >= t.span) spans.push({ id: s.id, kind, p });
    }
  });
  return { verdict, score, spans };
}
