const crypto = require('crypto');

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeUsage = (value = {}) => {
  const usage =
    value?.usageMetadata ||
    value?.usage ||
    value?.metadata?.usage ||
    value?.response?.usageMetadata ||
    value;

  const mathTokens = value?.mathFlow?.actualTokens || null;
  const metadataTokens = value?.metadata?.tokens || null;

  const promptTokens = Math.round(toNumber(
    mathTokens?.prompt ??
      metadataTokens?.prompt ??
      usage?.promptTokenCount ??
      usage?.prompt_tokens,
  ));
  const completionTokens = Math.round(toNumber(
    mathTokens?.completion ??
      metadataTokens?.completion ??
      usage?.candidatesTokenCount ??
      usage?.completion_tokens,
  ));
  const reasoningTokens = Math.round(toNumber(
    mathTokens?.reasoning ??
      metadataTokens?.reasoning ??
      usage?.reasoningTokenCount ??
      usage?.reasoning_tokens,
  ));
  const totalTokens = Math.round(toNumber(
    mathTokens?.total ??
      metadataTokens?.total ??
      usage?.totalTokenCount ??
      usage?.total_tokens,
    promptTokens + completionTokens + reasoningTokens,
  ));

  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens,
  };
};

const resolveModel = (context = {}, resultOrUsage = {}) =>
  context.model ||
  resultOrUsage?.metadata?.model ||
  resultOrUsage?.model ||
  process.env.AI_CHAT_MODEL ||
  process.env.GEMINI_CHAT_MODEL ||
  'unknown';

const resolveProvider = (model = '', context = {}) => {
  if (context.provider) return context.provider;
  const normalized = String(model || '').toLowerCase();
  if (normalized.includes('gemini')) return 'google';
  return 'unknown';
};

const getModelPricing = (model = '') => {
  let configured = {};
  try {
    configured = JSON.parse(process.env.AI_MODEL_PRICING_JSON || '{}');
  } catch (_error) {
    configured = {};
  }

  const normalized = String(model || '').toLowerCase();
  const matchedKey = Object.keys(configured).find((key) => normalized.includes(key.toLowerCase()));
  if (matchedKey) return configured[matchedKey];

  return {
    input: toNumber(process.env.AI_DEFAULT_INPUT_USD_PER_1M, 0.25),
    output: toNumber(process.env.AI_DEFAULT_OUTPUT_USD_PER_1M, 1.5),
    reasoning: toNumber(process.env.AI_DEFAULT_REASONING_USD_PER_1M, 0),
  };
};

const calculateCost = (tokens, model) => {
  const pricing = getModelPricing(model);
  if (!pricing) {
    return { inputCostUsd: null, outputCostUsd: null, totalCostUsd: null };
  }

  const inputCostUsd = (tokens.promptTokens * toNumber(pricing.input, 0)) / 1_000_000;
  const outputCostUsd = (tokens.completionTokens * toNumber(pricing.output, 0)) / 1_000_000;
  const reasoningCostUsd = (tokens.reasoningTokens * toNumber(pricing.reasoning, 0)) / 1_000_000;

  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd + reasoningCostUsd,
  };
};

const buildAiUsageEvent = (context = {}, resultOrUsage = {}) => {
  const model = resolveModel(context, resultOrUsage);
  const provider = resolveProvider(model, context);
  const tokens = normalizeUsage(resultOrUsage);
  const costs = calculateCost(tokens, model);

  return {
    institutionId: context.institutionId ?? null,
    studentId: context.studentId ?? null,
    userId: context.userId ?? null,
    userRole: context.userRole ?? null,
    actorType: context.actorType ?? context.userRole ?? null,
    surface: context.surface ?? null,
    feature: context.feature ?? context.eventType ?? null,
    requestGroupId: context.requestGroupId || crypto.randomUUID(),
    eventType: context.eventType || context.feature || 'ai_usage',
    status: context.status || 'success',
    course: context.course ?? null,
    isImage: Boolean(context.isImage),
    usedOcr: Boolean(context.usedOcr),
    cacheHit: typeof context.cacheHit === 'boolean' ? context.cacheHit : null,
    cacheSource: context.cacheSource ?? null,
    cacheSimilarity: typeof context.cacheSimilarity === 'number' ? context.cacheSimilarity : null,
    retryRequested: Boolean(context.retryRequested),
    estimatedSavedUsd: typeof context.estimatedSavedUsd === 'number' ? context.estimatedSavedUsd : null,
    provider,
    model,
    ...tokens,
    ...costs,
    estimatedCostUsd: costs.totalCostUsd,
    notes: context.notes ?? null,
  };
};

module.exports = {
  buildAiUsageEvent,
  calculateCost,
  normalizeUsage,
};
