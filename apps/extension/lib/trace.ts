export type Flow = "list-card" | "detail-card" | "agilefant-title" | "agilefant-jd" | "agilefant-finnish" | "agilefant-seniority";

// Translator groups Jev calls into Langfuse sessions and traces with these.
export function trace(flow: Flow, session: string, url: string): Record<string, string> {
  return { "x-jf-session": session, "x-jf-flow": flow, "x-jf-url": url };
}
