export interface CliMetadata {
  packageName: string;
  version: string;
}

export function resolveCliText(args: string[], metadata: CliMetadata): string | null {
  const command = args[0] ?? null;

  switch (command) {
    case "-v":
    case "--version":
      return `${metadata.packageName} ${metadata.version}`;
    case "-h":
    case "--help":
      return [
        `${metadata.packageName} ${metadata.version}`,
        "",
        "Usage:",
        "  klinex",
        "  klinex --help",
        "  klinex --version",
        "",
        "Install:",
        "  bunx @klinex/klinex",
        "  brew install klinex/tap/klinex",
      ].join("\n");
    default:
      return null;
  }
}
