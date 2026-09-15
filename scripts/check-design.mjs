import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = ['src/app', 'src/components'];
const STYLE_EXTENSIONS = new Set(['.css', '.scss']);
const rawColor = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i;
const rawBorder = /\bborder(?:-(?:left|right|top|bottom))?\s*:\s*\d+(?:\.\d+)?(?:px|rem)\b/i;
const rawFontSize = /\bfont-size\s*:\s*(?:\d|\.\d)/i;
const rawTransitionDuration = /\btransition(?:-duration)?\s*:[^;]*\b\d+(?:\.\d+)?(?:ms|s)\b/i;
const guardedProperty = /(?:border(?:-[\w-]+)?-width|border-radius|min-(?:width|height)|width|height)\s*:\s*[^;]*\b(?:1px|6px|8px|44px)\b/i;
const guardedCustomProperty = /--[\w-]+\s*:\s*(?:1px|6px|8px|44px|\d+(?:\.\d+)?(?:ms|s))\b/i;
const inlineDesign = /style\s*=\s*\{\{[^}]*?(?:color|background|border|borderRadius|fontSize|transition|margin(?:Top|Right|Bottom|Left)?|padding(?:Top|Right|Bottom|Left)?|gap|rowGap|columnGap|width|height)\s*:\s*['"`]\s*(?:#|rgb|hsl|\d+(?:\.\d+)?(?:px|rem|ms|s))/is;
const staticClassName = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else output.push(path);
  }
  return output;
}

function hasLegacyClass(source) {
  for (const match of source.matchAll(staticClassName)) {
    const classNames = (match[1] ?? match[2] ?? match[3]).split(/\s+/);
    if (classNames.includes('card') || classNames.includes('badge')) return true;
  }
  return false;
}

export function inspectSource(source, filename) {
  const issues = [];

  if (STYLE_EXTENSIONS.has(extname(filename)) && !filename.endsWith('tokens.css')) {
    source.split(/\r?\n/).forEach((line, index) => {
      if (rawColor.test(line)) issues.push(`${filename}:${index + 1} raw color; use a token`);
      if (rawBorder.test(line)) issues.push(`${filename}:${index + 1} raw border; use a token`);
      if (rawFontSize.test(line)) issues.push(`${filename}:${index + 1} raw font-size; use a token`);
      if (rawTransitionDuration.test(line)) issues.push(`${filename}:${index + 1} raw transition duration; use a token`);
      if (guardedProperty.test(line)) issues.push(`${filename}:${index + 1} raw systemic design value; use a token`);
      if (guardedCustomProperty.test(line)) issues.push(`${filename}:${index + 1} guarded value hidden in local custom property`);
    });
  }

  if (/\.[jt]sx$/.test(filename)) {
    if (inlineDesign.test(source)) issues.push(`${filename}: static inline design value; use CSS and a token`);
    if (hasLegacyClass(source)) issues.push(`${filename}: legacy global card/badge class; use shared primitives`);
  }

  return issues;
}

export async function checkDesign(root = process.cwd(), roots = ROOTS) {
  const issues = [];
  for (const folder of roots) {
    for (const filename of await files(join(root, folder))) {
      issues.push(...inspectSource(await readFile(filename, 'utf8'), relative(root, filename)));
    }
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = await checkDesign();
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Design guard passed.');
  }
}
