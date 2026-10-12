import { jev, type Options } from "./jev";
import { thresholds as limits, type Finnish, type NoulQuestion, type Sentence, type Span, type Fast, type Thresholds, type Verdict } from "./schemas";

export type FinnishOptions = Options & { thresholds?: Partial<Thresholds> };

const QUESTION = "Does this job require or indicate Finnish language skill in any way?";

const CRITERIA = {
  true: "Finnish skill is required, preferred, an advantage, or implied by the job.",
  false: "Nothing in the job asks for or implies Finnish skill.",
};

const overall: NoulQuestion = {
  type: "noul",
  instructions: {
    question: QUESTION,
    input: "`sentences` is a job description, or one part of it. Each item has the original text `fi` and its English translation `en`.",
  },
  criteria: CRITERIA,
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

// Many employers write in Finnish only as a filter, so the ad language alone is never evidence.
const fast: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Does this job description explicitly ask for Finnish language skill?",
    input: "`text` is a job description in its original language, possibly cut at the end. `title`, when present, is the job title.",
    note: "The description being written in Finnish is not evidence. Only count text that states Finnish skill is required, preferred, or an advantage.",
  },
  criteria: {
    true: "The text states that Finnish skill is required, preferred, or an advantage.",
    false: "The text never states a Finnish skill requirement, even if it is written in Finnish.",
  },
};

// Keeps one list-mode request small; Finnish demands sit early in most JDs.
export const CAP = 6000;

// Stated demands only; experience as an advantage still lets a newcomer apply.
const experience: NoulQuestion = {
  type: "noul",
  instructions: {
    question: "Does this job require prior work experience in this role or field?",
    input: "`text` is a job description in its original language, possibly cut at the end. `title`, when present, is the job title.",
    note: "Only count text that demands experience, such as years of experience or 'kokemusta edellytetään'. Experience named only as an advantage ('eduksi', 'nice to have'), trainee, summer job, entry level or 'no experience needed' is not a demand.",
  },
  criteria: {
    true: "The text states that prior experience in this kind of work is required.",
    false: "The text does not demand prior experience, or says it is optional or not needed.",
  },
};

// Shared so callers can merge them into one call with own questions.
export const FAST = { finnish: fast, experience };

export async function checkFast(input: { text: string }, options: FinnishOptions = {}): Promise<Fast> {
  const t = limits.parse(options.thresholds ?? {});
  const level = (score: number): Verdict => ({ verdict: score >= t.yes ? "yes" : score <= t.no ? "no" : "unclear", score });
  const { answers } = await jev({ text: input.text.slice(0, CAP) }, { requires_finnish: fast, requires_experience: experience }, options);
  return { finnish: level(answers.requires_finnish.noul), experience: level(answers.requires_experience.noul) };
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
