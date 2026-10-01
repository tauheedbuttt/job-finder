import { z } from "zod";

// Instructions and criteria accept plain text or JSON structure.
const text = z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export const noulQuestion = z.object({
  type: z.literal("noul"),
  instructions: text,
  criteria: z.object({ true: text.optional(), false: text.optional() }).optional(),
});

export const choiceQuestion = z.object({
  type: z.literal("choice"),
  instructions: text,
  criteria: z.record(z.string(), text.nullable()),
});

export const scoreQuestion = z.object({
  type: z.literal("score"),
  instructions: text,
  criteria: z.array(text).min(2).max(10),
});

export const question = z.discriminatedUnion("type", [noulQuestion, choiceQuestion, scoreQuestion]);
export const questions = z.record(z.string(), question);

export const noulAnswer = z.object({ type: z.literal("noul"), noul: z.number() });

export const choiceAnswer = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});

export const scoreAnswer = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string(), z.string()),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});

export const answer = z.discriminatedUnion("type", [noulAnswer, choiceAnswer, scoreAnswer]);

export const reply = z.object({
  model: z.string(),
  answers: z.record(z.string(), answer),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).partial().optional(),
});

export const sentence = z.object({ id: z.string(), fi: z.string(), en: z.string() });

export const thresholds = z.object({
  yes: z.number().min(0).max(1).default(0.7),
  no: z.number().min(0).max(1).default(0.3),
  span: z.number().min(0).max(1).default(0.6),
});

export const span = z.object({ id: z.string(), kind: z.enum(["red", "green"]), p: z.number() });

export const finnish = z.object({
  verdict: z.enum(["yes", "no", "unclear"]),
  score: z.number(),
  spans: z.array(span),
});

export const verdict = finnish.pick({ verdict: true, score: true });

export const fast = z.object({ finnish: verdict, experience: verdict });

export const candidate = z.object({
  id: z.string(),
  tag: z.string(),
  text: z.string(),
  href: z.string(),
  aria: z.string(),
  context: z.string(),
});

export const block = z.object({ id: z.string(), text: z.string(), source: z.enum(["jsonld", "dom"]) });

export const pick = z.object({ id: z.string().nullable(), confidence: z.number() });

export type NoulQuestion = z.infer<typeof noulQuestion>;
export type ChoiceQuestion = z.infer<typeof choiceQuestion>;
export type ScoreQuestion = z.infer<typeof scoreQuestion>;
export type Question = z.infer<typeof question>;
export type NoulAnswer = z.infer<typeof noulAnswer>;
export type ChoiceAnswer = z.infer<typeof choiceAnswer>;
export type ScoreAnswer = z.infer<typeof scoreAnswer>;
export type Answer = z.infer<typeof answer>;
export type Sentence = z.infer<typeof sentence>;
export type Thresholds = z.infer<typeof thresholds>;
export type Span = z.infer<typeof span>;
export type Finnish = z.infer<typeof finnish>;
export type Verdict = z.infer<typeof verdict>;
export type Fast = z.infer<typeof fast>;
export type Candidate = z.infer<typeof candidate>;
export type Block = z.infer<typeof block>;
export type Pick = z.infer<typeof pick>;
