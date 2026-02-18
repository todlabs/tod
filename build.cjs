const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Building with TypeScript...');
  const tscPath = path.join(__dirname, 'node_modules', '.bin', 'tsc');
  execSync(`"${tscPath}" -p .`, { 
    stdio: 'inherit',
    shell: true
  });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
