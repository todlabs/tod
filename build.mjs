import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

try {
  console.log('Building...');
  
  await build({
    entryPoints: ['src/index.ts'],
    bundle: false,
    format: 'esm',
    target: 'es2022',
    outdir: 'dist',
    loader: {
      '.tsx': 'jsx',
      '.ts': 'ts',
    },
    jsx: 'automatic',
    jsxImportSource: 'react',
    logLevel: 'info',
  });
  
  console.log('Fixing .js extension imports...');
  
  const fixImports = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        fixImports(filePath);
      } else if (file.endsWith('.js')) {
        let content = fs.readFileSync(filePath, 'utf-8');
        content = content.replace(/from ['"](\.\.\/[^.'"]+)['"]/g, (match, importPath) => {
          if (!importPath.endsWith('.js') && !importPath.endsWith('.mjs')) {
            return `from '${importPath}.js'`;
          }
          return match;
        });
        fs.writeFileSync(filePath, content, 'utf-8');
      }
    }
  };
  
  fixImports('dist');
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
