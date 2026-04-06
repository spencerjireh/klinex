import packageMetadata from "./package.json" with { type: "json" };
import { resolveCliText } from "./src/cli.ts";
import { main } from "./src/index.ts";

const cliText = resolveCliText(Bun.argv.slice(2), {
  packageName: packageMetadata.name,
  version: packageMetadata.version,
});

if (cliText !== null) {
  console.log(cliText);
} else {
  await main();
}
