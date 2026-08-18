import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const env = process.env;
const providers = new Set(['codex-cloud', 'gemini-vertex-ai', 'gemini-api']);
const tiers = new Set(['efficient', 'balanced', 'frontier', 'custom']);
const reasoningLevels = new Set(['low', 'medium', 'high']);
const taskTypes = new Set([
  'inventory-classification',
  'dependency-inference',
  'recovery-plan-review',
  'evidence-summary',
]);
const dataClassifications = new Set(['metadata-only', 'redacted-config']);

const modelRegistry = {
  'codex-cloud': {
    efficient: 'gpt-5.6-luna',
    balanced: 'gpt-5.6-terra',
    frontier: 'gpt-5.6-sol',
  },
  'gemini-vertex-ai': {
    efficient: 'gemini-3.5-flash-lite',
    balanced: 'gemini-3.6-flash',
    frontier: 'gemini-3.1-pro-preview',
  },
  'gemini-api': {
    efficient: 'gemini-3.5-flash-lite',
    balanced: 'gemini-3.6-flash',
    frontier: 'gemini-3.1-pro-preview',
  },
};

function reject(message) {
  console.error(`AI guardrail rejected the simulation: ${message}`);
  process.exit(1);
}

const provider = env.DR_AI_PROVIDER;
const tier = env.DR_AI_MODEL_TIER;
const reasoningLevel = env.DR_AI_REASONING_LEVEL;
const taskType = env.DR_AI_TASK_TYPE;
const dataClassification = env.DR_AI_DATA_CLASSIFICATION ?? 'metadata-only';

if (env.DR_CONFIRMATION !== 'SIMULATE') reject('confirmation must equal SIMULATE');
if (!providers.has(provider)) reject(`unsupported provider: ${provider ?? '<empty>'}`);
if (!tiers.has(tier)) reject(`unsupported model tier: ${tier ?? '<empty>'}`);
if (!reasoningLevels.has(reasoningLevel)) reject(`unsupported reasoning level: ${reasoningLevel ?? '<empty>'}`);
if (!taskTypes.has(taskType)) reject(`unsupported AI task type: ${taskType ?? '<empty>'}`);
if (!dataClassifications.has(dataClassification)) reject(`unsupported data classification: ${dataClassification}`);

let model = modelRegistry[provider][tier];
if (tier === 'custom') {
  model = env.DR_AI_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(model ?? '')) reject('custom model ID is invalid');
  if (provider === 'codex-cloud' && !model.startsWith('gpt-')) reject('Codex custom model must use an OpenAI GPT model ID');
  if (provider.startsWith('gemini-') && !model.startsWith('gemini-')) reject('Gemini custom model must use a Gemini model ID');
}

const startedAt = new Date();
const syntheticInput = {
  service: 'checkout-service',
  criticality: 'critical',
  assetTypes: ['gcp-project', 'gke-cluster', 'cloud-sql', 'gitops-workload'],
  findingCount: 2,
};
const syntheticOutput = {
  summary: `Synthetic ${taskType} completed for checkout-service.`,
  recommendations: [
    { priority: 'high', code: 'VERIFY_RECOVERY_POINT', confidence: 0.96 },
    { priority: 'medium', code: 'CONFIRM_DEPENDENCY_OWNER', confidence: 0.83 },
  ],
  humanApprovalRequired: true,
};

const evidence = {
  schemaVersion: '1.0.0',
  run: {
    mode: 'simulation',
    scenario: 'ai-analysis',
    result: 'PASSED',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  },
  ai: {
    provider,
    model,
    modelTier: tier,
    reasoningLevel,
    taskType,
    executionMode: 'mock',
  },
  dataPolicy: {
    classification: dataClassification,
    secretsRedacted: true,
    sourceCodeIncluded: false,
    infrastructureStateIncluded: false,
    promptPersisted: false,
  },
  guardrails: {
    providerCalled: false,
    credentialsRead: false,
    toolsEnabled: false,
    externalMutations: 0,
    outputSchemaValidated: true,
    humanApprovalRequired: true,
  },
  syntheticInput,
  syntheticOutput,
};
evidence.integrity = {
  algorithm: 'sha256',
  contentDigest: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
  signature: 'not-signed-mock',
};

const outputDirectory = resolve(env.DR_EVIDENCE_DIRECTORY ?? 'artifacts/evidence');
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, 'ai-analysis.json');
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

const summary = [
  '## StormHarbor AI provider simulation',
  '',
  '| Configuration | Effective value |',
  '| --- | --- |',
  `| Provider | \`${provider}\` |`,
  `| Model tier | \`${tier}\` |`,
  `| Model | \`${model}\` |`,
  `| Reasoning | \`${reasoningLevel}\` |`,
  `| AI task type | \`${taskType}\` |`,
  `| Data classification | \`${dataClassification}\` |`,
  '| External provider called | no |',
  '| Human approval required | yes |',
  '',
  `Evidence digest: \`${evidence.integrity.contentDigest}\``,
  '',
].join('\n');

if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
console.log(`AI simulation evidence written to ${outputPath}`);
