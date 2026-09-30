import { describe, expect, it } from "vitest";
import { locate } from "../lib/highlight";

describe("locate", () => {
  it("finds a sentence across inline elements and whitespace", () => {
    document.body.innerHTML = "<p>Alku. Työ sisältää <b>suomen</b>\n   kielen käyttöä. Loppu.</p>";
    const range = locate(document.body, "Työ sisältää suomen kielen käyttöä.");
    expect(range?.toString().replace(/\s+/g, " ")).toBe("Työ sisältää suomen kielen käyttöä.");
    expect(range?.startContainer.textContent).toBe("Alku. Työ sisältää ");
    expect(range?.startOffset).toBe(6);
  });

  it("matches list items without separating whitespace", () => {
    document.body.innerHTML = "<ul><li>Python</li><li>Sujuva suomi</li></ul>";
    expect(locate(document.body, "Sujuva suomi")?.toString()).toBe("Sujuva suomi");
  });

  it("ignores script text", () => {
    document.body.innerHTML = "<script>var a = 'Englanti riittää.'</script><p>Englanti riittää.</p>";
    const range = locate(document.body, "Englanti riittää.");
    expect(range?.startContainer.parentElement?.tagName).toBe("P");
  });

  it("returns null when missing or blank", () => {
    document.body.innerHTML = "<p>Jotain muuta.</p>";
    expect(locate(document.body, "Ei löydy.")).toBeNull();
    expect(locate(document.body, "  ")).toBeNull();
  });
});
