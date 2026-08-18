# Inventário e dependency graph

## Unidade central: serviço

O inventário começa no serviço de negócio, não no recurso cloud. Assets técnicos existem para explicar se esse serviço pode ser recuperado.

```joint
flowchart LR
  S[checkout-service<br/>critical | RTO 60 | RPO 15]
  R[Git repositories]
  T[Terraform modules]
  P[GCP project]
  N[VPC and DNS]
  K[GKE cluster]
  W[Namespace and workloads]
  D[Cloud SQL]
  B[Recovery points]
  G[GitOps objects]

  S --> R
  R --> T
  T --> P
  P --> N
  N --> K
  K --> W
  S --> D
  D --> B
  R --> G
  G --> W

  classDef service fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:3px;
  classDef code fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef cloud fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef data fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  class S service;
  class R,T,G code;
  class P,N,K,W cloud;
  class D,B data;
```

## Modelo relacional inicial

PostgreSQL é suficiente no MVP. O grafo é representado por entidades e relações tipadas, com consultas recursivas quando necessário.

### SQLite no GitHub?

Um arquivo SQLite pode tecnicamente ser commitado, mas não deve ser a base runtime do produto:

| Uso | Decisão | Motivo |
| --- | --- | --- |
| desenvolvimento local | permitido | setup simples e apenas um writer |
| appliance single-node | permitido com backup externo | operação deliberadamente sem concorrência |
| cache reconstruível de discovery | permitido fora do Git | perda não afeta a fonte autoritativa |
| artifact de uma simulação | permitido, se redigido | snapshot imutável para download e diagnóstico |
| inventário compartilhado | PostgreSQL | concorrência, transações, backup, HA e queries |
| arquivo `.db` versionado no Git | não recomendado | binário sem diff/merge, locking ou escrita concorrente |

GitHub continua adequado a YAML/JSON declarativo, schemas, policies e recovery plans. Uma pipeline não deve alterar e commitar SQLite de volta ao repositório: além de conflitos, isso mistura estado runtime com desired state e exige permissão de escrita desnecessária.

| Tabela | Campos essenciais |
| --- | --- |
| `tenants` | id, name, policy_set_id |
| `services` | id, name, tier, criticality, rto, rpo, owner_id |
| `environments` | id, service_id, name, classification |
| `assets` | id, provider, type, canonical_ref, source, observed_at |
| `dependencies` | source_id, target_id, type, criticality, confidence |
| `repositories` | installation_id, role, owner, name, path, revision |
| `recovery_plans` | service_id, version, source_revision, digest |
| `recovery_points` | asset_id, type, created_at, integrity_status |
| `recovery_runs` | plan_id, state, mode, started_at, finished_at |
| `phase_runs` | run_id, phase, attempt, state, metrics, evidence_uri |
| `findings` | service_id, rule_id, severity, status, first_seen, last_seen |

## Relações

`dependency_type` precisa ter semântica operacional:

- `HOSTED_ON`: workload → cluster;
- `DEPENDS_ON`: service → database;
- `PROVISIONED_BY`: asset → Terraform module;
- `RECONCILED_BY`: workload → GitOps object;
- `AUTHENTICATES_WITH`: workload → service account;
- `NETWORK_REACHES`: workload → endpoint;
- `RECOVERED_FROM`: asset → recovery point;
- `OWNED_BY`: service → team.

Cada relação possui `source`, `confidence`, `observed_at` e, quando inferida, `explanation`. Relações críticas de baixa confiança geram uma tarefa de confirmação humana.

## Readiness por serviço

O score facilita priorização, mas nunca deve esconder controles binários.

| Dimensão | Exemplo de gate |
| --- | --- |
| Coverage | todos os assets críticos estão ligados a um plano |
| Recoverability | recovery point íntegro e dentro do RPO |
| Reproducibility | fontes e módulos resolvidos para revisões imutáveis |
| Access | identidade de recovery e permissões validadas |
| Test recency | último exercício dentro da cadence definida |
| Performance | RTO/RPO medidos dentro do objetivo |
| Evidence | bundle íntegro, assinado e retido |

Exemplo de apresentação: `Readiness 84/100 — BLOCKED`, pois um único gate obrigatório (`database recovery point integrity`) está vermelho. O score não converte bloqueio em aprovação.
