import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const script = new URL('../../scripts/simulate-ai-provider.mjs', import.meta.url);

async function simulate(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dr-ai-evidence-'));
  await execFileAsync(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      DR_CONFIRMATION: 'SIMULATE',
      DR_AI_PROVIDER: 'codex-cloud',
      DR_AI_MODEL_TIER: 'balanced',
      DR_AI_REASONING_LEVEL: 'medium',
      DR_AI_TASK_TYPE: 'recovery-plan-review',
      DR_AI_DATA_CLASSIFICATION: 'metadata-only',
      DR_EVIDENCE_DIRECTORY: directory,
      ...overrides,
    },
  });
  return JSON.parse(await readFile(join(directory, 'ai-analysis.json'), 'utf8'));
}

test('AI mock resolves portable Codex tier without calling a provider', async () => {
  const evidence = await simulate();
  assert.equal(evidence.ai.model, 'gpt-5.6-terra');
  assert.equal(evidence.ai.reasoningLevel, 'medium');
  assert.equal(evidence.guardrails.providerCalled, false);
  assert.equal(evidence.guardrails.credentialsRead, false);
  assert.equal(evidence.guardrails.externalMutations, 0);
  assert.equal(evidence.syntheticOutput.humanApprovalRequired, true);
});

test('AI mock resolves portable Gemini frontier tier', async () => {
  const evidence = await simulate({
    DR_AI_PROVIDER: 'gemini-vertex-ai',
    DR_AI_MODEL_TIER: 'frontier',
    DR_AI_REASONING_LEVEL: 'high',
    DR_AI_TASK_TYPE: 'dependency-inference',
  });
  assert.equal(evidence.ai.model, 'gemini-3.1-pro-preview');
  assert.equal(evidence.ai.taskType, 'dependency-inference');
});

test('AI mock rejects a model from the wrong provider family', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [script.pathname], {
      env: {
        ...process.env,
        DR_CONFIRMATION: 'SIMULATE',
        DR_AI_PROVIDER: 'gemini-api',
        DR_AI_MODEL_TIER: 'custom',
        DR_AI_MODEL: 'gpt-5.6-terra',
        DR_AI_REASONING_LEVEL: 'medium',
        DR_AI_TASK_TYPE: 'evidence-summary',
      },
    }),
    /Gemini custom model must use a Gemini model ID/,
  );
});
