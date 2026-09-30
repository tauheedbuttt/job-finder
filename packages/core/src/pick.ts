import { jev, type Options } from "./jev";
import type { Block, Candidate, Pick } from "./schemas";

// Choice allows 255 options, one is kept for none.
export const LIMIT = 254;
const CLIP = 1500;

export type ApplyOptions = Options & { confirm?: number };

function criteria(ids: string[], none: string): Record<string, string | null> {
  return { ...Object.fromEntries(ids.map((id) => [id, null])), none };
}

export async function pickApply(candidates: Candidate[], opts: ApplyOptions = {}): Promise<Pick> {
  const list = candidates.slice(0, LIMIT);
  if (!list.length) return { id: null, confidence: 1 };
  const first = await jev(
    { candidates: list },
    {
      apply: {
        type: "choice",
        instructions:
          "`candidates` are clickable elements on a job posting page. Which candidate, by its `id`, does a job seeker click to start applying for this job?",
        criteria: criteria(
          list.map((c) => c.id),
          "No candidate starts an application for this job.",
        ),
      },
    },
    opts,
  );
  const { choice, probabilities } = first.answers.apply;
  const winner = list.find((c) => c.id === choice);
  if (!winner) return { id: null, confidence: probabilities.none ?? 0 };
  const second = await jev(
    { candidate: winner },
    {
      confirm: {
        type: "noul",
        instructions: "Does clicking `candidate` start an application for the job, or open the application form or page?",
        criteria: {
          true: "It is the apply action for this job.",
          false: "It is navigation, sharing, saving, login, cookies, or another job.",
        },
      },
    },
    opts,
  );
  const p = second.answers.confirm.noul;
  return p >= (opts.confirm ?? 0.5) ? { id: winner.id, confidence: p } : { id: null, confidence: 1 - p };
}

export async function pickDescription(blocks: Block[], opts: Options = {}): Promise<Pick> {
  const list = blocks.slice(0, LIMIT);
  if (!list.length) return { id: null, confidence: 1 };
  const state = { blocks: list.map((b) => ({ ...b, text: b.text.slice(0, CLIP) })) };
  const { answers } = await jev(
    state,
    {
      description: {
        type: "choice",
        instructions:
          "`blocks` are text blocks from a web page, clipped at the end. Which block, by its `id`, is the main description of a single job posting, with its duties and requirements?",
        criteria: criteria(
          list.map((b) => b.id),
          "No block is a job description.",
        ),
      },
    },
    opts,
  );
  const { choice, probabilities } = answers.description;
  const hit = list.some((b) => b.id === choice);
  return { id: hit ? choice : null, confidence: probabilities[choice] ?? 0 };
}
