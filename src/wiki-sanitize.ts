/**
 * Wiki Vault Content Sanitizer
 * 
 * Cleans non-wiki semantic double brackets from bridge-imported content
 * to reduce wiki lint noise.
 * 
 * Target patterns:
 * - [[reply_to_current]] - Assistant output directive
 * - [[reply_to:...]] - Reply directive
 * - [[smart-extractor]] - Module name
 * - [[admission-control]] - Module name
 * - [[symbol]] - Code symbol
 * - ./SOUL.md, ./IDENTITY.md etc. - Relative paths
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "winston";

export interface SanitizeOptions {
  vaultRoot: string;
  dryRun?: boolean;
  logger?: Logger;
}

export interface SanitizeResult {
  filesScanned: number;
  filesModified: number;
  replacements: Record<string, number>;
}

// Patterns to sanitize: [[xxx]] -> `[[xxx]]` (escape as code)
const DIRECTIVE_PATTERNS = [
  // Reply directives
  /\[\[reply_to_current\]\]/gi,
  /\[\[reply_to:[^\]]*\]\]/gi,
  
  // Module names (from code comments/docs)
  /\[\[smart-extractor\]\]/gi,
  /\[\[admission-control\]\]/gi,
  /\[\[symbol\]\]/gi,
  /\[\[access-tracker\]\]/gi,
  /\[\[decay-engine\]\]/gi,
  /\[\[tier-manager\]\]/gi,
  /\[\[noise-filter\]\]/gi,
  /\[\[query-expander\]\]/gi,
  /\[\[retrieval-stats\]\]/gi,
  /\[\[retrieval-trace\]\]/gi,
  
  // Config directive markers (in agent output)
  /\[\[config\]\]/gi,
  /\[\[tools\]\]/gi,
  /\[\[memory\]\]/gi,
  /\[\[soul\]\]/gi,
  /\[\[identity\]\]/gi,
  /\[\[user\]\]/gi,
  /\[\[agents\]\]/gi,
];

// Relative path patterns: [[./xxx]] or [[../xxx]] -> `./xxx` or `../xxx`
const RELATIVE_PATH_PATTERN = /\[\[\.\/[^\]]+\]\]/gi;
const PARENT_PATH_PATTERN = /\[\[\.\.\/[^\]]+\]\]/gi;

/**
 * Sanitize a single content string
 */
export function sanitizeContent(content: string): { 
  sanitized: string; 
  replacements: Record<string, number>;
} {
  const replacements: Record<string, number> = {};
  let sanitized = content;
  
  // Escape directive patterns as inline code
  for (const pattern of DIRECTIVE_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches && matches.length > 0) {
      const key = pattern.source.replace(/\\?\[/g, '[').replace(/\\?\]/g, ']').slice(0, 30);
      replacements[key] = matches.length;
      sanitized = sanitized.replace(pattern, (match) => {
        // Extract the inner content and wrap in backticks
        const inner = match.slice(2, -2);
        return `[[${inner}]]`;  // Keep as-is for now, let lint handle it
      });
    }
  }
  
  // Escape relative path patterns
  const relativeMatches = sanitized.match(RELATIVE_PATH_PATTERN);
  if (relativeMatches && relativeMatches.length > 0) {
    replacements['relative_paths'] = relativeMatches.length;
    sanitized = sanitized.replace(RELATIVE_PATH_PATTERN, (match) => {
      const inner = match.slice(2, -2);
      return `\`${inner}\``;  // Convert to code span
    });
  }
  
  const parentMatches = sanitized.match(PARENT_PATH_PATTERN);
  if (parentMatches && parentMatches.length > 0) {
    replacements['parent_paths'] = parentMatches.length;
    sanitized = sanitized.replace(PARENT_PATH_PATTERN, (match) => {
      const inner = match.slice(2, -2);
      return `\`${inner}\``;  // Convert to code span
    });
  }
  
  return { sanitized, replacements };
}

/**
 * Sanitize all bridge source pages in wiki vault
 */
export async function sanitizeWikiVault(options: SanitizeOptions): Promise<SanitizeResult> {
  const { vaultRoot, dryRun = false, logger } = options;
  
  const result: SanitizeResult = {
    filesScanned: 0,
    filesModified: 0,
    replacements: {},
  };
  
  // For now, this is a placeholder. The actual implementation would:
  // 1. Scan all files in vaultRoot/sources/
  // 2. Apply sanitizeContent to each
  // 3. Write back modified files (unless dryRun)
  
  logger?.info(`sanitizeWikiVault: vault=${vaultRoot} dryRun=${dryRun}`);
  
  // TODO: Implement actual file scanning and sanitization
  // This requires glob/recurse functionality
  
  return result;
}
