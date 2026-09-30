import type { Block, Candidate } from "@job-finder/core";
import type { Kind } from "./highlight";

export type Mark = { id: string; text: string; kind: Kind };

export type Message =
  | { type: "scan" }
  | { type: "mark"; block: string | null; marks: Mark[] }
  | { type: "clear" }
  | { type: "jump"; id: string }
  | { type: "apply"; id: string };

export type Send = <T>(msg: Message) => Promise<T>;

export type Scanned = { url: string; title: string; blocks: Block[]; candidates: Candidate[] };
export type Marked = { found: string[] };
export type Applied = { href: string | null; focused: boolean };
