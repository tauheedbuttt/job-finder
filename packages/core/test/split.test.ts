import { describe, expect, it } from "vitest";
import { splitSentences } from "../src/index";

const texts = (input: string) => splitSentences(input).map((s) => s.text);

describe("splitSentences", () => {
  it("gives stable ids in order", () => {
    const out = splitSentences("Haemme kehittäjää. Työ on Helsingissä!");
    expect(out).toEqual([
      { id: "s0", text: "Haemme kehittäjää." },
      { id: "s1", text: "Työ on Helsingissä!" },
    ]);
  });

  it("keeps lowercase continuations after abbreviations", () => {
    expect(texts("Osaat mm. ohjelmointia, esim. testausta ym. muuta. Palkka on n. 5 000 €.")).toEqual([
      "Osaat mm. ohjelmointia, esim. testausta ym. muuta.",
      "Palkka on n. 5 000 €.",
    ]);
  });

  it("splits bullets and newlines, dropping markers", () => {
    const input = "Edellytämme:\n• Sujuva suomen kieli\n- English is fine\n* Tiimityö\n1. Python\n\n  \nLisätietoja antaa Matti.";
    expect(texts(input)).toEqual([
      "Edellytämme:",
      "Sujuva suomen kieli",
      "English is fine",
      "Tiimityö",
      "Python",
      "Lisätietoja antaa Matti.",
    ]);
  });

  it("handles unicode punctuation and quotes", () => {
    expect(texts("Äänekoski on kaunis… Öljyä ei tarvita? «Tule mukaan!» Kiitos.")).toEqual([
      "Äänekoski on kaunis…",
      "Öljyä ei tarvita?",
      "«Tule mukaan!»",
      "Kiitos.",
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(splitSentences(" \n\t ")).toEqual([]);
  });
});
