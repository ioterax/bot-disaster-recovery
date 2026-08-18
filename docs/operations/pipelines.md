# Pipelines de simulação

## Objetivo

As pipelines são um acceptance harness para contratos e guardrails. Elas imitam recovery com dados sintéticos, produzem evidência verificável e **não** executam `terraform`, `gcloud`, `kubectl` ou `flux`.

Todas possuem:

- `workflow_dispatch` e confirmação literal `SIMULATE`;
- `contents: read`, sem `id-token: write`;
- inputs recebidos por environment, nunca interpolados diretamente no shell;
- runtime fixado e verificado;
- fases explícitas e ordenadas;
- motor compartilhado `scripts/simulate-recovery.mjs`;
- artifact JSON com retenção declarada;
- Job Summary legível por operador.

## Fluxo principal

```joint
flowchart TD
  M[Manual dispatch]
  C{Confirmation equals SIMULATE?}
  S{Select scenario}
  F[Full project loss]
  G[GCP project loss]
  T[Terraform drift]
  I[IAM recovery]
  D[Database recovery]
  K[GKE recovery]
  X[FluxCD bootstrap]
  E[Structured evidence]
  R[Job summary and artifact]
  Z[Reject without credentials]

  M --> C
  C --> S
  C --> Z
  S --> F
  S --> G
  S --> T
  S --> I
  S --> D
  S --> K
  S --> X
  F --> E
  G --> E
  T --> E
  I --> E
  D --> E
  K --> E
  X --> E
  E --> R

  classDef entry fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef gate fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef scenario fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  classDef proof fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef reject fill:#ffe8e8,stroke:#b83a3a,color:#031525,stroke-width:2px;
  class M entry;
  class C,S gate;
  class F,G,T,I,D,K,X scenario;
  class E,R proof;
  class Z reject;
```

## Catálogo de cenários

| Workflow | Guardrails específicos | Fases simuladas |
| --- | --- | --- |
| `disaster-recovery-simulation.yml` | roteamento exato e concurrency por repositório | delega um cenário |
| `simulate-gcp-project-loss.yml` | target `-dr-sandbox` | contexto, billing/labels, project, APIs, KMS, backend, handoff |
| `simulate-terraform-drift.yml` | cenário em allowlist e zero mutation | source SHA, backend metadata, refresh-only plan, classify, policy |
| `simulate-iam-recovery.yml` | snapshot dentro do RPO e sem chaves privadas | catalog, normalize, redact, integrity, dependency order, restore |
| `simulate-database-recovery.yml` | target novo `-dr-restore` e recovery point dentro do RPO | catalog, checksum, isolated restore, connectivity, schema/query |
| `simulate-gke-recovery.yml` | cluster `-dr-sandbox` | target UID, network, quota, cluster, WI, Operator, policy/health |
| `simulate-flux-bootstrap.yml` | path relativo sem traversal | cluster, revision, controllers, sources, Kustomize, Helm, health |
| `simulate-ai-analysis.yml` | provider, tier, reasoning, task type e data class em enums fechados | data policy, model resolution, structured analysis, validation, human review |
| `simulate-full-recovery.yml` | dependency order e cleanup `always` | compõe seis workflows e valida todos os artifacts |

## Full project loss

```joint
flowchart LR
  F[Foundation]
  I[IAM]
  T[Terraform]
  D[Database]
  K[GKE]
  X[FluxCD]
  A[Aggregate evidence]
  C[Cleanup verification]

  F --> I --> T --> D --> K --> X --> A
  F --> C
  I --> C
  T --> C
  D --> C
  K --> C
  X --> C

  classDef phase fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef evidence fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef cleanup fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  class F,I,T,D,K,X phase;
  class A evidence;
  class C cleanup;
```

O aggregate job baixa os artifacts dos componentes, rejeita cenário ausente, resultado diferente de `PASSED` ou qualquer mutação externa, preserva a ordem e cria um manifesto com digest próprio.

## Contrato do mock engine

Inputs principais:

| Variável | Regra |
| --- | --- |
| `DR_CONFIRMATION` | deve ser `SIMULATE` |
| `DR_SCENARIO` | enum fechado |
| `DR_PHASES` | lista não vazia sem duplicatas |
| `DR_TARGET` | suffix e formato compatíveis com o cenário |
| `DR_*_AGE_MINUTES` | inteiro não negativo dentro do target RPO |
| `DR_GITOPS_PATH` | relativo e sem path traversal |
| `DR_EVIDENCE_DIRECTORY` | diretório do artifact; valor interno do runner |

Output JSON:

```json
{
  "schemaVersion": "1.0.0",
  "run": {
    "mode": "simulation",
    "scenario": "database-recovery",
    "result": "PASSED"
  },
  "objectives": {
    "targetRpoMinutes": 15,
    "actualRpoMinutes": 5
  },
  "guardrails": {
    "cloudIdentityRequested": false,
    "externalMutations": 0
  },
  "phases": [],
  "integrity": {
    "algorithm": "sha256",
    "signature": "not-signed-mock"
  }
}
```

`not-signed-mock` é intencional e impede confundir scaffolding com evidência de produção.

### Simular um AI provider

```bash
DR_CONFIRMATION=SIMULATE \
DR_AI_PROVIDER=codex-cloud \
DR_AI_MODEL_TIER=balanced \
DR_AI_REASONING_LEVEL=medium \
DR_AI_TASK_TYPE=recovery-plan-review \
DR_AI_DATA_CLASSIFICATION=metadata-only \
node scripts/simulate-ai-provider.mjs
```

O mesmo workflow aceita `gemini-vertex-ai` ou `gemini-api`. Em modo mock, ele resolve o modelo e valida todas as políticas sem ler credenciais nem chamar o provider.

## Executar localmente

```bash
DR_CONFIRMATION=SIMULATE \
DR_SCENARIO=gke-recovery \
DR_TARGET=sample-gke-dr-sandbox \
DR_PHASES=target-identity,private-network,cluster,operator-install,policy-health \
node scripts/simulate-recovery.mjs
```

O arquivo será criado em `artifacts/evidence/gke-recovery.json`.

## Evolução para adapters reais

A troca do mock por execução real deve manter o mesmo contrato de fase e evidência, acrescentando:

1. planning read-only e diff serializado;
2. approval environment para `mode=recovery`;
3. OIDC/WIF apenas no job mutável;
4. action images e actions fixadas por digest/SHA;
5. policy check imediatamente antes de cada mutation;
6. timeout, retry classificado e idempotency key;
7. validação independente do executor;
8. cleanup sempre executado e evidenciado;
9. assinatura KMS e upload para storage imutável.

!!! warning "Não habilitar schedule ainda"
    Execução periódica deve entrar somente depois de orçamento, quotas, isolamento, cleanup sob falha, kill switch e emergency stop terem sido comprovados em ambientes descartáveis.
