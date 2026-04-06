interface FormulaOptions {
  output: string;
  version: string;
  darwinArm64Url: string;
  darwinArm64Sha256: string;
  linuxX64Url: string;
  linuxX64Sha256: string;
}

function parseArgs(args: string[]): FormulaOptions {
  const output = readArgValue(args, "--output");
  const version = readArgValue(args, "--version");
  const darwinArm64Url = readArgValue(args, "--darwin-arm64-url");
  const darwinArm64Sha256 = readArgValue(args, "--darwin-arm64-sha256");
  const linuxX64Url = readArgValue(args, "--linux-x64-url");
  const linuxX64Sha256 = readArgValue(args, "--linux-x64-sha256");

  if (!output || !version || !darwinArm64Url || !darwinArm64Sha256 || !linuxX64Url || !linuxX64Sha256) {
    throw new Error(
      "Usage: bun run scripts/generate-homebrew-formula.ts --output <path> --version <version> --darwin-arm64-url <url> --darwin-arm64-sha256 <sha> --linux-x64-url <url> --linux-x64-sha256 <sha>",
    );
  }

  return {
    output,
    version,
    darwinArm64Url,
    darwinArm64Sha256,
    linuxX64Url,
    linuxX64Sha256,
  };
}

function readArgValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function buildFormula(options: FormulaOptions): string {
  return `class Klinex < Formula
  desc "OpenTUI inspector for local dev servers"
  homepage "https://github.com/spencerjireh/klinex"
  version "${options.version}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "${options.darwinArm64Url}"
      sha256 "${options.darwinArm64Sha256}"
    else
      odie "Intel macOS builds are not published yet"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "${options.linuxX64Url}"
      sha256 "${options.linuxX64Sha256}"
    else
      odie "Linux arm64 builds are not published yet"
    end
  end

  def install
    bin.install "klinex"
  end

  test do
    output = shell_output("#{bin}/klinex --version")
    assert_match version.to_s, output
  end
end
`;
}

const options = parseArgs(Bun.argv.slice(2));
await Bun.write(options.output, buildFormula(options));
