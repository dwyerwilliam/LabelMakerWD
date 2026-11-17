import fs from 'fs';
import path from 'path';

console.log('Checking packaged build artifacts...');

const artifactsDir = path.resolve('releases/artifacts');
if (!fs.existsSync(artifactsDir)) {
  console.log('Artifacts directory not created yet. Run `npm run package:win` or `npm run package:mac` to produce release packages.');
  process.exit(0);
}

const files = fs.readdirSync(artifactsDir);
console.log('Found release artifacts:', files);
