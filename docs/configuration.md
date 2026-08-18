# Plano de configuração

## Decisão

Use um documento YAML versionado como contrato principal, validado por JSON Schema. Variáveis de ambiente servem apenas ao bootstrap do processo e a overrides emergenciais de uma execução; valores secretos pertencem a um secret manager.

Uma configuração somente por variáveis parece simples, mas se torna difícil de validar e auditar quando há múltiplos repositórios, projetos, fases e feature toggles. YAML mantém as relações explícitas; JSON Schema fornece validação e permite rejeitar planos inválidos antes de qualquer execução.

O `dr.config.yaml` é o contrato global da StormHarbor, mesmo usando a convenção `apiVersion`/`kind`. Ele não se torna automaticamente um objeto Kubernetes. O control plane valida e congela esse plano, então materializa apenas o recorte Kubernetes como `DisasterRecoveryPlan`, `RecoveryTarget` e `RecoveryRun` depois que as CRDs correspondentes estiverem instaladas no API server.

## Camadas de configuração

1. **Defaults internos:** valores seguros; capabilities mutáveis começam desabilitadas.
2. **Plano no repositório:** `dr.config.yaml`, revisado como infrastructure code.
3. **Política da instalação:** allowlists e limites máximos da organização.
4. **Overrides de runtime:** conjunto pequeno, válido para uma execução.
5. **Resolução de secrets:** valores buscados com workload identity, nunca persistidos ou impressos.

A policy da instalação é um teto: um repositório não habilita capability proibida pela organização.

## Perfis de IA

`spec.ai` mantém provider, tier, modelo exato, reasoning level e task type separados. A configuração começa com `enabled: false` e `mode: advisory`. A matriz e as regras de tradução estão em [AI providers](architecture/ai-providers.md).

Model IDs não são secrets; credenciais são resolvidas em runtime. Terraform state, kubeconfig, tokens e secrets são proibidos no prompt. O control plane registra apenas input redigido, output estruturado, modelo efetivo, métricas e digests.

## Variáveis permitidas

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

Feature toggles controlam code paths, não autorização. Cada operação exige:

1. enabled in the repository plan;
2. permitted by the GitHub App installation policy;
3. supported by the installed adapter;
4. authorized by workload identity;
5. allowed for the selected execution mode;
6. accepted by scenario guardrails.

Unknown toggles must fail schema validation. New toggles should default to `false` and document their required permissions.

## Contrato do IAM snapshot

An IAM snapshot should contain normalized declarative data and recovery metadata:

- project/folder/organization resource identifiers;
- service-account identities, excluding private keys;
- roles, members, conditions and policy etags;
- Workload Identity pools, providers and bindings;
- schema version, source commit, creation time and recovery dependency order;
- SHA-256 digest and KMS key version used for envelope encryption.

The vault path in configuration is a reference, not a secret. Snapshot reads should be limited to the recovery workload identity. Snapshot writes should use a separate backup identity where practical, preventing a compromised recovery process from silently replacing trusted backups.

## Validação e lifecycle

- Validate syntax and schema on every pull request.
- Resolve repositories to immutable commit SHAs for each recovery run.
- Reject duplicate source roles and projects not matching the configured simulation labels.
- Record the effective configuration after redacting secret references.
- Sign evidence and retain it independently from the infrastructure being recovered.
- Introduce scheduled execution only after cleanup, quotas, budget alerts and kill-switch behavior are tested manually.

## Ordem de avaliação dos guardrails

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
