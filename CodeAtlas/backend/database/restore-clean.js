const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const files = [
  'server/ai.ts',
  'server/analyze/crawl.ts',
  'server/analyze/docs.ts',
  'server/analyze/explain.ts',
  'server/analyze/index.ts',
  'server/analyze/issues.ts',
  'server/analyze/lang.ts',
  'server/analyze/pipeline.ts',
  'server/analyze/resolve.ts',
  'server/auth.ts',
  'server/chat.ts',
  'server/db.ts',
  'server/env.ts',
  'server/github.ts',
  'server/index.ts',
  'server/jobs.ts',
  'server/paths.ts',
  'server/prompts.ts',
  'server/repos.ts',
  'server/store.ts',
];

for (const f of files) {
  let content = execSync(`git -C D:\\ show HEAD:${f}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const isAnalyze = f.startsWith('server/analyze/');
  if (isAnalyze) {
    content = content.replace(/(from\s+["'])\.\.\/shared\//g, '$1../../../shared/');
    content = content.replace(/(from\s+["'])\.\.\/\.\.\/shared\//g, '$1../../../shared/');
  } else {
    content = content.replace(/(from\s+["'])\.\.\/shared\//g, '$1../../shared/');
  }

  // Also in index.ts distDir: path.join(PROJECT_ROOT, "frontend", "dist")
  if (f === 'server/index.ts') {
    content = content.replace(
      'path.join(PROJECT_ROOT, "dist")',
      'path.join(PROJECT_ROOT, "frontend", "dist")'
    );
  }

  const dest = path.join(process.cwd(), 'backend', f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
  console.log(`Restored ${dest}`);
}
console.log('Finished restoring clean server files.');

