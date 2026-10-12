import taxonomy from './taxonomy.json'

// Single source for ids and display names; scripts/build.mjs checks the
// schema enums against the same file.
export const domainLabel: Record<string, string> = taxonomy.domains
export const actorLabel: Record<string, string> = taxonomy.actors
export const toolLabel: Record<string, string> = taxonomy.tools
