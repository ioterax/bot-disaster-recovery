import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const examplePath = new URL('../../config/dr.config.example.yaml', import.meta.url);
const schemaPath = new URL('../../config/dr.config.schema.json', import.meta.url);

test('the example is a simulation plan with destructive capabilities disabled', async () => {
  const plan = await readFile(examplePath, 'utf8');

  assert.match(plan, /^\s*mode: simulation$/m);
  assert.match(plan, /^\s*gcpFoundationRecovery: false$/m);
  assert.match(plan, /^\s*iamRestore: false$/m);
  assert.match(plan, /^\s*fluxBootstrap: false$/m);
  assert.match(plan, /^\s*periodicSimulation: false$/m);
  assert.match(plan, /^\s*realRecovery: false$/m);
  assert.match(plan, /^\s*enabled: false$/m);
  assert.match(plan, /^\s*cleanup: always$/m);
});

test('AI integration defaults to advisory and protects sensitive infrastructure data', async () => {
  const plan = await readFile(examplePath, 'utf8');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const aiProperties = schema.properties.spec.properties.ai.properties;

  assert.match(plan, /^\s*mode: advisory$/m);
  assert.match(plan, /^\s*redactSecrets: true$/m);
  assert.match(plan, /^\s*allowSourceCode: false$/m);
  assert.match(plan, /^\s*allowInfrastructureState: false$/m);
  assert.match(plan, /^\s*blockRecoveryOnProviderFailure: false$/m);
  assert.equal(aiProperties.dataPolicy.properties.redactSecrets.const, true);
  assert.equal(aiProperties.dataPolicy.properties.allowInfrastructureState.const, false);
  assert.equal(aiProperties.enforcement.properties.blockRecoveryOnProviderFailure.const, false);
});

test('IAM snapshots exclude private keys and deny routine human access', async () => {
  const plan = await readFile(examplePath, 'utf8');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const iamProperties = schema.properties.spec.properties.iamBackup.properties;

  assert.match(plan, /^\s*excludePrivateKeys: true$/m);
  assert.match(plan, /^\s*humanAccess: denied$/m);
  assert.equal(iamProperties.excludePrivateKeys.const, true);
  assert.equal(iamProperties.humanAccess.const, 'denied');
});

test('recovery follows the declared dependency order', async () => {
  const plan = await readFile(examplePath, 'utf8');
  const orderedPhases = ['foundation', 'iam', 'terraform', 'database', 'gke', 'flux', 'workloads', 'validation'];
  const positions = orderedPhases.map((phase) => plan.indexOf(`      - ${phase}`));

  assert.ok(positions.every((position) => position >= 0), 'every recovery phase must be present');
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

test('the schema rejects unknown fields at protected boundaries', async () => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.metadata.additionalProperties, false);
  assert.equal(schema.properties.spec.additionalProperties, false);
  assert.equal(schema.properties.spec.properties.features.additionalProperties, false);
});
