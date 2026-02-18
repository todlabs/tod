const { execSync } = require('child_process');

try {
  console.log('Building with TypeScript...');
  execSync('npx -y typescript tsc -p .', { 
    stdio: 'inherit',
    shell: true
  });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
