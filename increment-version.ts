import fs from 'fs';
import path from 'path';

const packagePath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

const versionParts = packageJson.version.split('.');
let major = parseInt(versionParts[0]) || 1;
let minor = parseInt(versionParts[1]) || 0;

minor += 1;

const newVersion = `${major}.${minor}`;
packageJson.version = newVersion;

fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

// Also update a version file for the frontend
const versionTsPath = path.resolve(process.cwd(), 'src/version.ts');
const buildDate = new Date().toISOString().split('T')[0];
fs.writeFileSync(versionTsPath, `export const APP_VERSION = "${newVersion}";\nexport const BUILD_DATE = "${buildDate}";\n`);

console.log(`Version incremented to ${newVersion} (${buildDate})`);
