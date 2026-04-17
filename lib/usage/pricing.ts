// Model pricing (USD per 1M tokens) as of 2026-04.
// Keep numbers conservative — we charge the workspace slightly above raw cost.
export const LLM_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-2024-08-06": { input: 2.50, output: 10.00 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  "o1-mini": { input: 3.00, output: 12.00 },
  "o1": { input: 15.00, output: 60.00 },
  // Anthropic
  "claude-sonnet-4-5": { input: 3.00, output: 15.00 },
  "claude-sonnet-4-5-20250929": { input: 3.00, output: 15.00 },
  "claude-opus-4-5": { input: 15.00, output: 75.00 },
  "claude-haiku-4-5": { input: 1.00, output: 5.00 },
};

const DEFAULT_PRICING = { input: 0.15, output: 0.60 };

export function llmCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = LLM_PRICING[model] ?? DEFAULT_PRICING;
  const inputUsd = (inputTokens / 1_000_000) * price.input;
  const outputUsd = (outputTokens / 1_000_000) * price.output;
  return (inputUsd + outputUsd) * 100;
}
