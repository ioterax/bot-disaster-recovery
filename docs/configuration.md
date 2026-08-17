# Configuration plan

## Decision

Use a versioned YAML document as the primary configuration contract, backed by JSON Schema. Use environment variables only for process bootstrap and emergency runtime overrides, and use a secret manager for secret values.

A variables-only design is simple initially but becomes difficult to validate and audit when organizations have multiple repositories, projects, recovery phases and feature toggles. Structured YAML keeps those relationships explicit and reviewable. JSON Schema gives IDE completion and allows the GitHub App to reject invalid plans before running anything.

## Configuration layers

1. **Built-in defaults:** safe values owned by the application. All operational features default to disabled.
2. **Repository plan:** `dr.config.yaml`, reviewed with the same controls as infrastructure code.
3. **Installation settings:** organization-level repository allowlists and policy ceilings owned by the GitHub App installation.
4. **Runtime overrides:** a small set of environment variables used by an operator or orchestrator for a single execution.
5. **Secret resolution:** values fetched at runtime using workload identity; never merged into logs or persisted in the repository.

An installation-level policy is a ceiling: a repository cannot enable a capability that the organization has forbidden.

## Allowed environment variables

| Variable | Purpose | Secret |
| --- | --- | --- |
| `DR_CONFIG_PATH` | Path to the plan; defaults to `dr.config.yaml` | No |
| `DR_RUN_ID` | Correlation identifier supplied by the orchestrator | No |
| `DR_LOG_LEVEL` | `error`, `warn`, `info` or `debug`; defaults to `info` | No |
| `DR_DRY_RUN` | Forces non-mutating execution; must default to `true` | No |
| `DR_GITHUB_TOKEN` | Short-lived GitHub App installation token | Yes |
| `DR_ID_TOKEN` | Short-lived OIDC token when supplied by the runtime | Yes |

Do not create environment variables for every YAML field. Do not place GCP service-account JSON keys, IAM snapshots, encryption material or kubeconfigs in repository variables.

## Feature toggles

Feature toggles control code paths, not authorization. Each toggle requires all of the following before an operation can run:

1. enabled in the repository plan;
2. permitted by the GitHub App installation policy;
3. supported by the installed adapter;
4. authorized by workload identity;
5. allowed for the selected execution mode;
6. accepted by scenario guardrails.

Unknown toggles must fail schema validation. New toggles should default to `false` and document their required permissions.

## IAM snapshot contract

An IAM snapshot should contain normalized declarative data and recovery metadata:

- project/folder/organization resource identifiers;
- service-account identities, excluding private keys;
- roles, members, conditions and policy etags;
- Workload Identity pools, providers and bindings;
- schema version, source commit, creation time and recovery dependency order;
- SHA-256 digest and KMS key version used for envelope encryption.

The vault path in configuration is a reference, not a secret. Snapshot reads should be limited to the recovery workload identity. Snapshot writes should use a separate backup identity where practical, preventing a compromised recovery process from silently replacing trusted backups.

## Validation and lifecycle

- Validate syntax and schema on every pull request.
- Resolve repositories to immutable commit SHAs for each recovery run.
- Reject duplicate source roles and projects not matching the configured simulation labels.
- Record the effective configuration after redacting secret references.
- Sign evidence and retain it independently from the infrastructure being recovered.
- Introduce scheduled execution only after cleanup, quotas, budget alerts and kill-switch behavior are tested manually.

## Guardrail evaluation order

1. Validate the configuration schema and installation policy ceiling.
2. Check the global kill switch before requesting workload identity.
3. Resolve the source repositories to immutable commits.
4. Prove that the target project is allowlisted and carries disposable labels.
5. Estimate changes, deletions and cost; reject values above configured ceilings.
6. Confirm that the scenario cannot alter organization or folder IAM.
7. Take and verify the required recovery points before mutation.
8. Execute one phase at a time and stop on a failed health gate.
9. Run cleanup regardless of the scenario outcome.
10. Sign and retain redacted evidence outside the recovered failure domain.

Database simulations must restore into a new `-dr-restore` instance and validate connectivity, schema checksum and read-only queries. GKE simulations must target a `-dr-sandbox` cluster and require private networking and Workload Identity before FluxCD is bootstrapped.
