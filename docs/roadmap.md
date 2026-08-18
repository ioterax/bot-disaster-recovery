# Roadmap

## Fases do produto

```joint
flowchart LR
  M0[M0<br/>contracts and safe mocks]
  M1[M1<br/>onboarding and inventory]
  M2[M2<br/>continuous discovery]
  M3[M3<br/>Kubernetes Operator]
  M4[M4<br/>disposable recovery tests]
  M5[M5<br/>approval-gated recovery]
  M6[M6<br/>multi-cloud adapters]
  M0 --> M1 --> M2 --> M3 --> M4 --> M5 --> M6

  classDef done fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef next fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef later fill:#edf1f3,stroke:#6b7f89,color:#031525,stroke-width:2px;
  class M0 done;
  class M1,M2 next;
  class M3,M4,M5,M6 later;
```

## Definition of done por marco

| Marco | Resultado verificável |
| --- | --- |
| M0 | schemas, documentação, pipelines seguras e evidência de mock testados |
| M1 | instalação isolada por tenant, allowlist e inventário editável |
| M2 | reconciliation periódica com provenance, freshness e drift |
| M3 | CRDs versionadas, Operator idempotente, status e finalizers testados |
| M4 | projeto GCP descartável criado, recuperado, validado e removido |
| M5 | execução real protegida por approvals, WIF, policy e break-glass |
| M6 | novos providers sem alteração do modelo central de domínio |

## Critérios para sair do modo mock

- threat model revisado;
- isolamento e cleanup comprovados em falha parcial;
- quotas, orçamento e kill switch testados;
- permissões mínimas documentadas por fase;
- evidence store fora do failure domain;
- runbooks de incidente e rollback aprovados;
- pelo menos três simulações consecutivas dentro do objetivo definido.
