import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function renderValidationThumbnail(pdf: Buffer): Promise<Buffer> {
  if (process.env.VALIDATION_THUMBNAIL_MOCK_BASE64) {
    return Buffer.from(process.env.VALIDATION_THUMBNAIL_MOCK_BASE64, "base64");
  }
  const directory = await mkdtemp(join(tmpdir(), "spendee-validation-"));
  const input = join(directory, "document.pdf");
  const output = join(directory, "thumbnail");
  try {
    await writeFile(input, pdf);
    await run("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "640", "-png", input, output], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return await readFile(`${output}.png`);
  } catch (error) {
    throw new Error(error instanceof Error && /ENOENT/.test(error.message)
      ? "PDF thumbnail support is unavailable."
      : "Could not render the PDF thumbnail.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
