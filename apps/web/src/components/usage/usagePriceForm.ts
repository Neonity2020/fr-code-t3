import type { UsageModelPriceOverride } from "@t3tools/contracts";

export const USAGE_PRICE_FIELDS = [
  { key: "inputCostPerMillionTokens", label: "输入", optional: false },
  { key: "outputCostPerMillionTokens", label: "输出", optional: false },
  { key: "cacheReadCostPerMillionTokens", label: "缓存读取", optional: true },
  { key: "cacheWriteCostPerMillionTokens", label: "缓存写入", optional: true },
] as const;

export type UsagePriceForm = { model: string } & Record<
  (typeof USAGE_PRICE_FIELDS)[number]["key"],
  string
>;

export function usagePriceForm(model = "", price?: UsageModelPriceOverride): UsagePriceForm {
  return {
    model,
    inputCostPerMillionTokens: price?.inputCostPerMillionTokens.toString() ?? "",
    outputCostPerMillionTokens: price?.outputCostPerMillionTokens.toString() ?? "",
    cacheReadCostPerMillionTokens: price?.cacheReadCostPerMillionTokens?.toString() ?? "",
    cacheWriteCostPerMillionTokens: price?.cacheWriteCostPerMillionTokens?.toString() ?? "",
  };
}

/** Blank cache prices use the input rate; explicit zero means free. */
export function parseUsagePriceForm(
  form: UsagePriceForm,
): { model: string; price: UsageModelPriceOverride } | null {
  const model = form.model.trim();
  if (model.length === 0) return null;
  const rates: Partial<Record<(typeof USAGE_PRICE_FIELDS)[number]["key"], number>> = {};
  for (const field of USAGE_PRICE_FIELDS) {
    const raw = form[field.key].trim();
    if (raw === "") {
      if (field.optional) continue;
      return null;
    }
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    rates[field.key] = value;
  }
  if (
    rates.inputCostPerMillionTokens === undefined ||
    rates.outputCostPerMillionTokens === undefined
  ) {
    return null;
  }
  return {
    model,
    price: {
      inputCostPerMillionTokens: rates.inputCostPerMillionTokens,
      outputCostPerMillionTokens: rates.outputCostPerMillionTokens,
      ...(rates.cacheReadCostPerMillionTokens === undefined
        ? {}
        : { cacheReadCostPerMillionTokens: rates.cacheReadCostPerMillionTokens }),
      ...(rates.cacheWriteCostPerMillionTokens === undefined
        ? {}
        : { cacheWriteCostPerMillionTokens: rates.cacheWriteCostPerMillionTokens }),
    },
  };
}
