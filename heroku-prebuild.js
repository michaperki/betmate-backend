const fs = require('fs');
const path = require('path');

console.log('===== HEROKU PREBUILD SCRIPT =====');
console.log('Checking for lockfiles in root directory:');

const rootFiles = fs.readdirSync('.');
console.log('Files in root:', rootFiles);

// Check for yarn.lock and package-lock.json
if (rootFiles.includes('yarn.lock')) {
  console.log('Found yarn.lock, removing...');
  fs.unlinkSync('yarn.lock');
  console.log('yarn.lock removed');
}

console.log('Verifying package-lock.json exists:', rootFiles.includes('package-lock.json'));
console.log('===== PREBUILD SCRIPT COMPLETE =====');