#!/usr/bin/env node
import { chmod } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function makeExecutable() {
  const binPath = join(__dirname, '..', 'dist', 'bin', 'oats.js');
  
  try {
    // Make the file executable (755 = rwxr-xr-x)
    await chmod(binPath, '755');
    console.log(`✅ Made ${binPath} executable`);
  } catch (error) {
    // On Windows, this might fail but it's OK since Windows doesn't use Unix permissions
    if (process.platform !== 'win32') {
      console.error(`Failed to make ${binPath} executable:`, error);
      process.exit(1);
    }
  }
}

makeExecutable();