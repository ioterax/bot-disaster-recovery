# Ioterax Disaster Recovery Bot

[![Terraform drift simulation](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-terraform-drift.yml/badge.svg)](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-terraform-drift.yml)
[![Main DR simulation](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/disaster-recovery-simulation.yml/badge.svg)](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/disaster-recovery-simulation.yml)
[![IAM recovery simulation](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-iam-recovery.yml/badge.svg)](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-iam-recovery.yml)
[![Database recovery simulation](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-database-recovery.yml/badge.svg)](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-database-recovery.yml)
[![GKE recovery simulation](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-gke-recovery.yml/badge.svg)](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-gke-recovery.yml)
[![Full recovery simulation](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-full-recovery.yml/badge.svg)](https://github.com/ioterax/bot-disaster-recovery/actions/workflows/simulate-full-recovery.yml)
[![Last commit](https://img.shields.io/github/last-commit/ioterax/bot-disaster-recovery)](https://github.com/ioterax/bot-disaster-recovery/commits/develop)
[![Issues](https://img.shields.io/github/issues/ioterax/bot-disaster-recovery)](https://github.com/ioterax/bot-disaster-recovery/issues)

Plug-and-play IT Service Continuity Management (ITSCM) and Disaster Recovery as Code for GitHub organizations, Terraform, Google Cloud and FluxCD.

> Status: architecture and safe simulation scaffold. The current workflows model recovery phases but intentionally make no cloud, IAM, Terraform or Kubernetes changes.

Runtime: **Node.js 26.6.0**, pinned consistently in `.nvmrc`, `.node-version`, `package.json` and GitHub Actions.

## Purpose

The Disaster Recovery Bot is intended to be installed as a GitHub App in an organization. It discovers explicitly authorized Terraform and GitOps repositories, builds a recovery plan, detects infrastructure drift, protects IAM recovery data and periodically proves that the recovery path works in a disposable Google Cloud project.

The target recovery order is:

```text
GitHub App installation
        │
        ├── Terraform repository ──► state/drift inspection
        └── GitOps repository ─────► desired cluster state
                                      │
Encrypted IAM snapshot ───────────────┤
                                      ▼
GCP foundation ► IAM ► Terraform ► cluster ► FluxCD ► workloads ► evidence
```

## Core capabilities

- Monitor an allowlist of Terraform and GitOps repositories.
- Run read-only Terraform plans and classify deleted or changed resources.
- Recreate GCP foundations that Terraform cannot recover after project loss.
- Back up declarative IAM policies, bindings, service accounts and Workload Identity configuration.
- Encrypt IAM snapshots with Cloud KMS and store them in a machine-only Secret Manager vault.
- Bootstrap FluxCD and reconcile workloads from their Git source of truth.
- Simulate isolated failure scenarios and collect RTO, RPO and recovery evidence.
- Enable capabilities per organization through explicit feature toggles.

## Security model

The repository is the desired-state source, not a place for credentials. Configuration files contain resource identifiers and secret references only.

- Prefer GitHub OIDC and GCP Workload Identity Federation over service-account keys.
- Never export private keys as part of an IAM snapshot.
- Grant the recovery identity only the permissions required for the current phase.
- Encrypt every snapshot with a dedicated KMS key and verify its digest before restoration.
- Deny routine human access to the vault. Emergency access must be a separately audited, time-bound break-glass process.
- Run destructive tests only in allowlisted disposable projects carrying the configured simulation label.
- Require GitHub Environment approval before real recovery; simulations remain isolated and non-destructive by default.

Secret Manager is suitable for compact IAM snapshots. If snapshots exceed its payload limit, the planned implementation should use a KMS-encrypted, versioned and retention-locked object in Cloud Storage, with only its digest and object reference stored in Secret Manager.

## Configuration

Use [`config/dr.config.example.yaml`](config/dr.config.example.yaml) as the versioned plan and validate it against [`config/dr.config.schema.json`](config/dr.config.schema.json). The rationale and configuration hierarchy are described in [`docs/configuration.md`](docs/configuration.md).

The recommended precedence is:

```text
schema defaults < repository dr.config.yaml < GitHub App installation settings
                < runtime environment overrides < secret values from the vault
```

Feature toggles are deny-by-default. Enabling a feature does not grant cloud permissions; both the toggle and the corresponding workload identity policy must allow the operation.

## Local runtime

Install and select Node.js 26.6.0, then verify the pin:

```bash
nvm install
nvm use
node --run check:runtime
```

The project currently has no production dependencies. Run the Disaster Recovery guardrail tests with:

```bash
node --run test:disaster-recovery
```

They verify that simulations stay manual and non-privileged, dangerous feature toggles default to disabled, private IAM keys are excluded and recovery phases remain in dependency order.

## Manual simulation workflows

Every public entrypoint is manual through `workflow_dispatch` and requires the literal confirmation `SIMULATE`. Specialized workflows also expose `workflow_call`, allowing the main workflow and the full-recovery workflow to compose them without duplicating recovery logic. They use `sleep 3` to represent real operations while the implementation is still a harmless scaffold.

| Workflow | Scenario | Simulated phases |
| --- | --- | --- |
| `disaster-recovery-simulation.yml` | Main scenario router | selects one conditional path and delegates it |
| `simulate-terraform-drift.yml` | Terraform resource deletion | checkout, init, plan, classify and report |
| `simulate-gcp-project-loss.yml` | GCP project loss | guardrails, foundation, APIs, state and handoff |
| `simulate-iam-recovery.yml` | IAM backup and restore | discover, redact, encrypt, verify and restore |
| `simulate-database-recovery.yml` | Database loss/corruption | select recovery point, restore to a new instance and validate data |
| `simulate-gke-recovery.yml` | GKE cluster loss | network, cluster, identity, policy, FluxCD and workload health |
| `simulate-flux-bootstrap.yml` | Kubernetes/FluxCD loss | cluster readiness, bootstrap, reconcile and health |
| `simulate-full-recovery.yml` | Full project loss | project, IAM, Terraform, database, GKE, FluxCD, workloads and evidence |

Run one from **Actions → select workflow → Run workflow**. Use only synthetic, non-sensitive data. These simulations do not authenticate to GCP and do not invoke Terraform or FluxCLIs.

The recommended entrypoint is **Disaster Recovery - Main**. A full project-loss run composes the specialized workflows in dependency order; a focused run calls only the selected component. Each specialized workflow remains directly runnable for diagnosis and acceptance testing.

## Roadmap

1. GitHub App manifest, installation onboarding and repository allowlisting.
2. Configuration loader, schema validation and feature-toggle evaluation.
3. Read-only Terraform drift engine with signed evidence.
4. IAM snapshotter with envelope encryption, retention and integrity checks.
5. GCP foundation recovery and FluxCD bootstrap adapters.
6. Disposable-project scenario runner, RTO/RPO metrics and scheduled execution.
7. Approval-gated real recovery runbooks and compliance reporting.

Periodic schedules are deliberately deferred until the simulations have isolation controls, cleanup, budget limits and an emergency stop. The manual workflows are the acceptance harness for those controls.

## Recovery guardrails

The example plan codifies fail-closed defaults: allowlisted disposable projects, immutable source revisions, zero permitted deletions during simulation, change and cost ceilings, mandatory cleanup, signed evidence, a kill switch, and no organization/folder IAM changes. Database restores cannot overwrite their source, and GKE recovery requires a private endpoint and Workload Identity.

Real implementations should evaluate these controls before obtaining a cloud token and again before each mutation. A feature toggle can never bypass a guardrail.

## Repository metadata

Suggested GitHub description:

> Plug-and-play ITSCM and Disaster Recovery as Code for Terraform, GCP, IAM and FluxCD.

Suggested topics/keywords:

`itscm`, `disaster-recovery`, `business-continuity`, `terraform`, `gcp`, `iam`, `fluxcd`, `gitops`, `github-app`, `infrastructure-as-code`, `rto`, `rpo`, `chaos-engineering`

## Contributing

Changes must preserve least privilege, isolation and auditability. A pull request that introduces a real cloud operation should include its threat model, required permissions, rollback behavior and a disposable-environment test plan.
