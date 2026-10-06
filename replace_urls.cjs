const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('e:/emg/src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace fetch('/api/...
  if (content.includes("fetch('/api/") || content.includes('fetch(`/api/')) {
    content = content.replace(/fetch\('\/api\/([^']+)'/g, 'fetch(`${API_BASE_URL}/api/$1`');
    content = content.replace(/fetch\(`\/api\/([^`]+)`/g, 'fetch(`${API_BASE_URL}/api/$1`');
    changed = true;
  }

  // Replace API_BASE definitions
  if (content.includes('const API_BASE =')) {
    content = content.replace(/const API_BASE = 'http:\/\/localhost:5000\/api';/g, "const API_BASE = API_BASE_URL + '/api';");
    content = content.replace(/const API_BASE = 'http:\/\/localhost:5000';/g, 'const API_BASE = API_BASE_URL;');
    content = content.replace(/const API_BASE = \(import\.meta as any\)\.env\?\.VITE_API_URL \|\| 'http:\/\/localhost:5000';/g, 'const API_BASE = API_BASE_URL;');
    content = content.replace(/const API_BASE = \(import\.meta as any\)\.env\?\.VITE_API_URL \|\| '';/g, 'const API_BASE = API_BASE_URL;');
    changed = true;
  }

  if (changed) {
    // Determine relative path depth
    const depth = file.substring('e:/emg/src'.length + 1).split(/\\|\//).length - 1;
    let relativeImport = '';
    for (let i = 0; i < depth; i++) relativeImport += '../';
    if (depth === 0) relativeImport = './';

    let importStmt = "import { API_BASE_URL } from '" + relativeImport + "config';\n";

    // Check if API_BASE_URL is already imported
    if (!content.includes('API_BASE_URL } from')) {
      const lastImportIndex = content.lastIndexOf('import ');
      if (lastImportIndex !== -1) {
        const nextNewline = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, nextNewline + 1) + importStmt + content.slice(nextNewline + 1);
      } else {
        content = importStmt + content;
      }
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
