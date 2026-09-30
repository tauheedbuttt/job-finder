import { jev, type Options } from "./jev";
import { thresholds as limits, type Finnish, type NoulQuestion, type Sentence, type Span, type Thresholds } from "./schemas";

export type FinnishOptions = Options & { thresholds?: Partial<Thresholds> };

const overall: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Does this job require or indicate Finnish language skill in any way?",
    input: "`sentences` is a job description. Each item has the original text `fi` and its English translation `en`.",
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

export async function checkFinnish(input: { sentences: Sentence[] }, options: FinnishOptions = {}): Promise<Finnish> {
  const t = limits.parse(options.thresholds ?? {});
  const { sentences } = input;
  const { answers } = await jev({ sentences }, finnishQuestions(sentences), options);
  const score = answers.requires_finnish!.noul;
  const verdict = score >= t.yes ? "yes" : score <= t.no ? "no" : "unclear";
  const spans: Span[] = [];
  for (const s of sentences) {
    const red = answers[`fi_${s.id}`]!.noul;
    const green = answers[`en_${s.id}`]!.noul;
    const [kind, p] = green > red ? (["green", green] as const) : (["red", red] as const);
    if (p >= t.span) spans.push({ id: s.id, kind, p });
  }
  return { verdict, score, spans };
}
