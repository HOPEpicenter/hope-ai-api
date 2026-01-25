const fs = require("fs");
const path = require("path");

function copyJsonFiles(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath);
      }
      copyJsonFiles(srcPath, destPath);
    } else if (entry.isFile() && entry.name === "function.json") {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyJsonFiles("src", "dist");
