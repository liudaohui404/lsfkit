const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "src");
const distDir = path.join(__dirname, "dist");
const readmeFile = path.join(__dirname, "README.md");

function getScriptMeta(scriptPath) {
  const content = fs.readFileSync(scriptPath, "utf8");
  const metaMatch = content.match(
    /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/,
  );
  if (!metaMatch) return null;

  const meta = {};
  const lines = metaMatch[1].split("\n");
  lines.forEach((line) => {
    const match = line.match(/\/\/ @([\w-]+)\s+(.+)/);
    if (match) {
      const [, key, value] = match;
      meta[key] = value.trim();
    }
  });
  return meta;
}

const scripts = [];

// Method 1: Get script info from meta.json in src folders
if (fs.existsSync(srcDir)) {
  const folders = fs.readdirSync(srcDir);
  folders.forEach((folder) => {
    const metaPath = path.join(srcDir, folder, "meta.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      scripts.push({
        name: meta.name || folder,
        description: meta.description || "No description",
        version: meta.version || "0.1",
        path: `dist/${folder}.user.js`,
      });
    }
  });
}

// Method 2: Get script info from built files in dist folder
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  files.forEach((file) => {
    if (file.endsWith(".user.js")) {
      const scriptPath = path.join(distDir, file);
      const meta = getScriptMeta(scriptPath);
      if (meta) {
        // Only add if not already added via meta.json (to avoid duplicates)
        const alreadyAdded = scripts.some((s) => s.name === meta.name);
        if (!alreadyAdded) {
          scripts.push({
            name: meta.name || file,
            description: meta.description || "No description",
            version: meta.version || "0.1",
            path: `./src/${file.replace(".user.js", "")}/README.md`,
          });
        }
      }
    }
  });
}

let readmeContent = `# lsfkit\n\nMy collection of [Tampermonkey](https://www.tampermonkey.net/) userscripts.\n\n## Scripts\n\n`;

scripts.forEach((script) => {
  readmeContent += `### [${script.name}](${script.path})\n`;
  readmeContent += `- **Version**: \`${script.version}\`\n`;
  readmeContent += `- **Description**: ${script.description}\n\n`;
});

fs.writeFileSync(readmeFile, readmeContent);
console.log("README.md updated successfully!");
