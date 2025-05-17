/**
 * This script fixes absolute imports by changing them to relative imports
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define paths to fix
const pathsToFix = [
  'services',
  'controllers',
  'models',
  'helpers',
  'routers',
  'authentication',
  'types',
  'validation',
  'websockets'
];

// Get all TypeScript files
const srcDir = path.join(__dirname, '..', 'src');
const tsFiles = execSync(`find ${srcDir} -name "*.ts"`)
  .toString()
  .trim()
  .split('\n');

console.log(`Found ${tsFiles.length} TypeScript files to check.`);

let totalReplacements = 0;

// Process each file
tsFiles.forEach(filePath => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let fileReplacements = 0;

    // Get the directory of the current file relative to src
    const fileDir = path.dirname(filePath);
    const relativeToSrc = path.relative(fileDir, srcDir);
    const prefix = relativeToSrc ? `${relativeToSrc}/` : './';

    // Fix imports from absolute paths to relative paths
    pathsToFix.forEach(importPath => {
      // Match import statements: from 'services/...' or from 'services'
      const importRegexWithSubPath = new RegExp(`from ['"]${importPath}(\\/[^'"]*)['"]`, 'g');
      const importRegexExact = new RegExp(`from ['"]${importPath}['"]`, 'g');

      // Handle imports with subpaths like 'services/xyz'
      const matchesWithSubPath = content.match(importRegexWithSubPath);
      if (matchesWithSubPath) {
        fileReplacements += matchesWithSubPath.length;
        content = content.replace(importRegexWithSubPath, (match, subPath) => {
          return `from '${prefix}${importPath}${subPath}'`;
        });
        modified = true;
      }

      // Handle exact imports like 'services'
      const matchesExact = content.match(importRegexExact);
      if (matchesExact) {
        fileReplacements += matchesExact.length;
        content = content.replace(importRegexExact, (match) => {
          return `from '${prefix}${importPath}'`;
        });
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed ${fileReplacements} imports in: ${filePath}`);
      totalReplacements += fileReplacements;
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
});

console.log(`Total replacements: ${totalReplacements}`);
console.log('All imports fixed!');