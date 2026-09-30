// Keeps only the final state of spinner redraws so prefixed logs stay one clean line each.
const noise = /\x1b\[\?25[lh]|\x1b\[K/g;
let rest = "";
const clean = (line) => line.slice(line.lastIndexOf("\r") + 1).replace(noise, "");

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const lines = (rest + chunk).split("\n");
  rest = lines.pop() ?? "";
  for (const line of lines) {
    const text = clean(line);
    if (text.trim()) process.stdout.write(`${text}\n`);
  }
});
process.stdin.on("end", () => {
  const text = clean(rest);
  if (text.trim()) process.stdout.write(`${text}\n`);
});
