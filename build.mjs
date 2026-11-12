import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("./dist/", import.meta.url);
const source = new URL("./public/", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("./index.html", import.meta.url), new URL("index.html", output));
await cp(new URL("./item.html", import.meta.url), new URL("item.html", output));\nawait cp(new URL("./create.html", import.meta.url), new URL("create.html", output));
await cp(source, output, { recursive: true });

console.log("Static site built successfully in dist/");
