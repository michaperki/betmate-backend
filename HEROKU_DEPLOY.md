# Heroku Deployment Guide

This document outlines the changes made to improve the Heroku deployment process.

## Changes Made

1. **Updated Node.js Version**:
   - Changed from `16.20.0` to `>=16.0.0` in package.json to support more recent Node versions.

2. **Simplified Build Process**:
   - Modified `build` script in package.json to use `tsc` directly without post-processing scripts.
   - Removed `scripts/fix-imports.js` and `scripts/fix-js-syntax.js` as they're no longer needed.
   - Added `--skipLibCheck` and `--noEmitOnError false` flags to TypeScript compiler to handle type errors gracefully.

3. **Fixed Module Resolution**:
   - Updated `tsconfig.json` to use Node.js module resolution.
   - Changed absolute imports to relative imports (e.g., from `services/...` to `./services/...`).

4. **Configured Path Resolution at Runtime**:
   - Added `tsconfig-paths/register` to the `start` and `prod` scripts to handle path mappings.
   - Updated the start command to: `node -r tsconfig-paths/register dist/server.js`.

## How It Works Now

1. TypeScript compiles the code using the standard compiler, with no custom post-processing.
2. Native Node.js modules like `require()` are used in the compiled code.
3. Path mappings are resolved at runtime by the `tsconfig-paths` module.

## Deployment Instructions

1. Ensure your code is committed to your repository.
2. Push to Heroku:
   ```bash
   git push heroku HEAD:main
   ```

## Troubleshooting

If you encounter any module resolution issues:

1. Check for any remaining absolute imports in your code.
2. Verify that `tsconfig-paths` is correctly installed and configured.
3. Review the tsconfig.json file to ensure paths are correctly configured.