/**
 * Approximate list prices in USD per million tokens, used only for the admin
 * cost estimate. Unknown models report a cost of null. Update as prices change.
 */
const PRICES: Array<[RegExp, { input: number; output: number }]> = [
  [/^claude-fable-5/, { input: 10, output: 50 }],
  [/^claude-opus-5-5/, { input: 4, output: 20 }],
  [/^claude-opus-(5|4-[5-8])/, { input: 5, output: 25 }],
  [/^claude-sonnet-5/, { input: 2, output: 10 }],
  [/^claude-sonnet-4/, { input: 3, output: 15 }],
  [/^claude-haiku-5-5/, { input: 0.1, output: 0.5 }],
  [/^claude-haiku-4/, { input: 1, output: 5 }],
  [/^text-embedding-3-small/, { input: 0.02, output: 0 }],
  [/^text-embedding-3-large/, { input: 0.13, output: 0 }],
];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const entry = PRICES.find(([pattern]) => pattern.test(model));
  if (!entry) return null;
  const { input, output } = entry[1];
  return Math.round(((inputTokens * input + outputTokens * output) / 1_000_000) * 1e6) / 1e6;
}
