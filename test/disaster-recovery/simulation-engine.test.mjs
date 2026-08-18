import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const script = new URL('../../scripts/simulate-recovery.mjs', import.meta.url);

test('mock engine emits structured evidence without external mutations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dr-evidence-'));
  await execFileAsync(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      DR_CONFIRMATION: 'SIMULATE',
      DR_SCENARIO: 'database-recovery',
      DR_TARGET: 'sample-database-dr-restore',
      DR_RECOVERY_POINT_AGE_MINUTES: '5',
      DR_TARGET_RPO_MINUTES: '15',
      DR_PHASES: 'catalog,restore,validate',
      DR_EVIDENCE_DIRECTORY: directory,
    },
  });

  const evidence = JSON.parse(await readFile(join(directory, 'database-recovery.json'), 'utf8'));
  assert.equal(evidence.run.result, 'PASSED');
  assert.equal(evidence.guardrails.externalMutations, 0);
  assert.equal(evidence.objectives.actualRpoMinutes, 5);
  assert.deepEqual(evidence.phases.map(({ name }) => name), ['catalog', 'restore', 'validate']);
  assert.match(evidence.integrity.contentDigest, /^[a-f0-9]{64}$/);
});

test('mock engine fails closed when confirmation is absent', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [script.pathname], {
      env: {
        ...process.env,
        DR_SCENARIO: 'terraform-drift',
        DR_PHASES: 'plan',
        DR_TERRAFORM_SCENARIO: 'resource-deleted',
      },
    }),
    /confirmation must equal SIMULATE/,
  );
});

test('mock engine rejects a database recovery point outside RPO', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [script.pathname], {
      env: {
        ...process.env,
        DR_CONFIRMATION: 'SIMULATE',
        DR_SCENARIO: 'database-recovery',
        DR_TARGET: 'sample-database-dr-restore',
        DR_RECOVERY_POINT_AGE_MINUTES: '20',
        DR_TARGET_RPO_MINUTES: '15',
        DR_PHASES: 'restore',
      },
    }),
    /recovery point exceeds RPO/,
  );
});
