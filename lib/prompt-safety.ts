// ============================================
// Prompt Injection Sanitizer (AUDIT-C3 / review C6)
// ============================================

/**
 * Strip common prompt-injection patterns from external/untrusted content
 * before it is embedded in LLM prompts. Acts as a pre-filter; the primary
 * defence is wrapping the content in <UNTRUSTED_EXTERNAL> delimiters via
 * {@link untrustedBlock}.
 */
export function sanitizeExternalContent(content: string): string {
  return content
    .replace(/ignore\s+(all\s+)?(?:previous\s+)?instructions?/gi, '[filtered]')
    .replace(/disregard\s+(all\s+)?(?:previous\s+)?instructions?/gi, '[filtered]')
    .replace(/you\s+are\s+now\s+(?:a?\s*new?\s*)?/gi, '[filtered] ')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/system\s*(?:prompt)?\s*:/gi, '[filtered]:')
    .replace(/\bact\s+as\b/gi, '[filtered]')
    .replace(/\bpretend\s+(?:to\s+be|you\s+are)\b/gi, '[filtered]')
    .replace(/<\/?(?:system|assistant|instructions?)>/gi, '[filtered]');
}

/**
 * Sanitize external content and wrap it in <UNTRUSTED_EXTERNAL> delimiters so
 * the model treats it as data, never instructions.
 */
export function untrustedBlock(content: string): string {
  return `<UNTRUSTED_EXTERNAL>\n${sanitizeExternalContent(content)}\n</UNTRUSTED_EXTERNAL>`;
}
