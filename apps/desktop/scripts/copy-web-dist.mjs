import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const sourceDir = path.resolve(workspaceRoot, "apps", "web", "dist");
const targetDir = path.resolve(projectRoot, "web");
const sourceConfigPath = path.resolve(workspaceRoot, "apps", "web", "config.json");
const sourceConfigExamplePath = path.resolve(workspaceRoot, "apps", "web", "config.example.json");
const targetIndexPath = path.resolve(targetDir, "index.html");
const targetConfigPath = path.resolve(targetDir, "config.json");
const targetConfigExamplePath = path.resolve(targetDir, "config.example.json");

if (!fs.existsSync(sourceDir)) {
    throw new Error(`Web dist folder not found: ${sourceDir}`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

// Act on files directly and treat "missing" as fine, rather than checking first: checking and then using leaves a
// window in which the file can change (CodeQL js/file-system-race).
function ifPresent(action) {
    try {
        action();
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
}

ifPresent(() => {
    const indexHtml = fs.readFileSync(targetIndexPath, "utf8");
    const normalizedIndexHtml = indexHtml
        .replace(/src="\/assets\//g, 'src="./assets/')
        .replace(/href="\/assets\//g, 'href="./assets/');
    fs.writeFileSync(targetIndexPath, normalizedIndexHtml, "utf8");
});
ifPresent(() => fs.copyFileSync(sourceConfigPath, targetConfigPath));
ifPresent(() => fs.copyFileSync(sourceConfigExamplePath, targetConfigExamplePath));

console.log(`[heorot-desktop] Copied web dist from ${sourceDir} to ${targetDir} (including config files).`);
