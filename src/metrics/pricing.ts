/**
 * Runtime-agnostic pricing and cost estimation for AI models.
 *
 * Extracted from transcript.ts so any runtime can use cost estimation
 * without pulling in Claude Code-specific JSONL parsing logic.
 *
 * To add support for a new provider model, add an entry to MODEL_PRICING
 * using a lowercase substring that uniquely identifies the model tier
 * (e.g. "opus", "sonnet", "haiku").
 */

/** Canonical token usage representation shared across all runtimes. */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	modelUsed: string | null;
}

/** Pricing per million tokens (USD). */
export interface ModelPricing {
	inputPerMTok: number;
	outputPerMTok: number;
	cacheReadPerMTok: number;
	cacheCreationPerMTok: number;
}

/** Hardcoded pricing for known Claude models. */
const MODEL_PRICING: Record<string, ModelPricing> = {
	opus: {
		inputPerMTok: 15,
		outputPerMTok: 75,
		cacheReadPerMTok: 1.5, // 10% of input
		cacheCreationPerMTok: 3.75, // 25% of input
	},
	sonnet: {
		inputPerMTok: 3,
		outputPerMTok: 15,
		cacheReadPerMTok: 0.3, // 10% of input
		cacheCreationPerMTok: 0.75, // 25% of input
	},
	haiku: {
		inputPerMTok: 0.8,
		outputPerMTok: 4,
		cacheReadPerMTok: 0.08, // 10% of input
		cacheCreationPerMTok: 0.2, // 25% of input
	},
};

/**
 * Determine the pricing tier for a given model string.
 * Matches on substring: "opus" -> opus pricing, "sonnet" -> sonnet, "haiku" -> haiku.
 * Returns null if unrecognized.
 */
export function getPricingForModel(model: string): ModelPricing | null {
	const lower = model.toLowerCase();
	if (lower.includes("opus")) return MODEL_PRICING.opus ?? null;
	if (lower.includes("sonnet")) return MODEL_PRICING.sonnet ?? null;
	if (lower.includes("haiku")) return MODEL_PRICING.haiku ?? null;
	return null;
}

/**
 * Calculate the estimated cost in USD for a given usage and model.
 * Returns null if the model is unrecognized.
 */
export function estimateCost(usage: TokenUsage): number | null {
	if (usage.modelUsed === null) return null;

	const pricing = getPricingForModel(usage.modelUsed);
	if (pricing === null) return null;

	const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMTok;
	const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMTok;
	const cacheReadCost = (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMTok;
	const cacheCreationCost = (usage.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMTok;

	return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}
