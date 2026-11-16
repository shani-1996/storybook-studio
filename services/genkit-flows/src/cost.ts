import type { ModelsConfig, Usage } from "./schemas.js";

/** Returns null when prices are not configured yet (never guess a price). */
export function estimateCostUsd(usage: Usage, cfg: ModelsConfig): number | null {
  if (cfg.usdPerMillionInputTokens == null || cfg.usdPerMillionOutputTokens == null) return null;
  return (
    (usage.inputTokens * cfg.usdPerMillionInputTokens + usage.outputTokens * cfg.usdPerMillionOutputTokens) / 1_000_000
  );
}
