import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const rootDir = process.cwd();

const mappings = [
  { source: "apps", docs: "docs/apps" },
  { source: "packages", docs: "docs/packages" },
  { source: "plugins", docs: "docs/plugins" },
];

const missingFiles: string[] = [];

function checkReadme(dir: string) {
  const readmePath = join(dir, "README.md");
  if (!existsSync(readmePath)) {
    missingFiles.push(relative(rootDir, readmePath));
  }
}

function checkDoc(docDir: string, name: string) {
  const docPath = join(docDir, `${name}.md`);
  if (!existsSync(docPath)) {
    missingFiles.push(relative(rootDir, docPath));
  }
}

console.log("Checking READMEs and Docs...");

for (const { source, docs } of mappings) {
  const sourceDir = join(rootDir, source);
  const docsDir = join(rootDir, docs);

  if (!existsSync(sourceDir)) {
    continue;
  }

  const items = readdirSync(sourceDir);

  for (const item of items) {
    const itemPath = join(sourceDir, item);
    // Skip hidden files/dirs
    if (item.startsWith(".")) continue;

    if (statSync(itemPath).isDirectory()) {
      // Check source README
      checkReadme(itemPath);

      // Check doc file
      checkDoc(docsDir, item);
    }
  }
}

if (missingFiles.length > 0) {
  console.error("\u001b[31mError: The following files are missing:\u001b[0m");
  missingFiles.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}

console.log("\u001b[32mAll checks passed.\u001b[0m");
