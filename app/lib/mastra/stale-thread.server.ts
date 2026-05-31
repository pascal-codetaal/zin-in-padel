/** OpenAI Responses API item id referenced in Mastra memory but no longer on OpenAI. */
const STALE_OPENAI_ITEM_RE =
  /Item with id 'rs_[^']+' not found/i;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * True when Mastra replayed thread memory that references an expired or
 * foreign OpenAI response item (common after Mastra Studio tests against prod DB).
 */
export function isStaleOpenAiThreadError(error: unknown): boolean {
  if (STALE_OPENAI_ITEM_RE.test(errorMessage(error))) return true;

  let cause: unknown = error instanceof Error ? error.cause : undefined;
  while (cause) {
    if (STALE_OPENAI_ITEM_RE.test(errorMessage(cause))) return true;
    cause = cause instanceof Error ? cause.cause : undefined;
  }

  return false;
}
