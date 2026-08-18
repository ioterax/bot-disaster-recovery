# Arquitetura do control plane

## Decisão principal

O control plane é executado fora do GKE que pode precisar recuperar. Ele não substitui GitHub, Terraform, GCP, Kubernetes ou o evidence store: mantém um modelo materializado, com provenance e freshness, e orquestra operações usando adapters.

[Baixar o diagrama editável em XML do draw.io](../assets/diagrams/control-plane.drawio.xml){ .md-button .md-button--primary }

## Diagrama em camadas

```joint
flowchart TB
  subgraph L1[EXPERIENCE]
    UI[Customer portal]
    API[Public API and CLI]
    APP[GitHub App]
  end

  subgraph L2[FEDERATED SOURCES OF TRUTH]
    DR[DR repository<br/>policies and plans]
    TG[Terraform repository<br/>desired infrastructure]
    TB[Remote backend<br/>Terraform state]
    GO[GitOps repository<br/>desired workloads]
    GA[GCP APIs and CAI<br/>actual cloud state]
    KA[Kubernetes API<br/>actual cluster state]
    VA[Secret Manager and KMS<br/>secret authority]
  end

  subgraph L3[DR CONTROL PLANE — OUTSIDE RECOVERY TARGET]
    IN[Ingestion and adapters]
    IV[Inventory service]
    DG[Dependency graph]
    PE[Policy and ITSCM engine]
    OR[Recovery orchestrator]
    EV[Evidence service]
    PR[Plugin registry]
    IN --> IV --> DG --> PE --> OR --> EV
    PR --> IN
    PR --> OR
  end

  subgraph L4[EXECUTION]
    TF[Terraform runner]
    CP[GCP foundation adapter]
    DB[Database recovery adapter]
    KO[Kubernetes DR Operator]
    FX[FluxCD bootstrap adapter]
  end

  subgraph L5[PERSISTENCE AND OBSERVABILITY]
    PG[(PostgreSQL)]
    Q[Durable queue]
    OT[OpenTelemetry]
    ES[Immutable evidence store]
  end

  UI --> API
  APP --> IN
  DR --> IN
  TG --> IN
  TB --> IN
  GO --> IN
  GA --> IN
  KA --> IN
  VA --> OR
  OR --> TF
  OR --> CP
  OR --> DB
  OR --> KO
  OR --> FX
  IV --> PG
  DG --> PG
  OR --> Q
  OR --> OT
  EV --> ES

  classDef experience fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef source fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef core fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef execute fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  classDef persist fill:#e8eee8,stroke:#526a59,color:#031525,stroke-width:2px;
  class UI,API,APP experience;
  class DR,TG,TB,GO,GA,KA,VA source;
  class IN,IV,DG,PE,OR,EV,PR core;
  class TF,CP,DB,KO,FX execute;
  class PG,Q,OT,ES persist;
```

Todos os conectores são retos no portal e ortogonais no XML do draw.io. As cores identificam responsabilidade, não estado operacional.

## Componentes e contratos

| Componente | Responsabilidade | Não deve fazer |
| --- | --- | --- |
| Ingestion/adapters | buscar deltas, normalizar IDs, registrar provenance | decidir recovery sozinho |
| Inventory service | materializar serviços, assets, owners e environments | substituir a fonte autoritativa |
| Dependency graph | armazenar relações tipadas e gerar DAGs | inferir dependência crítica sem confiança |
| Policy/ITSCM engine | avaliar gaps, tiers, RTO/RPO e readiness | conceder permissão cloud |
| Orchestrator | congelar plano, executar fases e health gates | residir apenas no cluster recuperável |
| Evidence service | registrar inputs, decisões, métricas e outputs | armazenar secrets ou tokens |
| Plugin registry | resolver capabilities e versões de adapters | carregar plugin não assinado em produção |

## Topologia GCP-first

O deployment inicial deve usar um **projeto dedicado de management/DR**, separado dos projetos protegidos. Banco, fila, chaves de assinatura e evidências devem atravessar regiões ou projetos conforme o threat model. Para SaaS, o control plane pode migrar para uma conta operada pelo fornecedor sem alterar os contratos de domínio.

```joint
flowchart LR
  subgraph M[MANAGEMENT PROJECT]
    C[Control plane]
    P[(PostgreSQL HA)]
    Q[Durable queue]
    K[KMS signing keys]
  end
  subgraph V[SECURITY VAULT PROJECT]
    S[Secret Manager]
    E[Retention-locked evidence]
  end
  subgraph T[PROTECTED PROJECT]
    G[GKE and workloads]
    D[Cloud SQL]
    I[Cloud resources]
  end
  subgraph R[RECOVERY PROJECT]
    RG[Recovery GKE]
    RD[Restored database]
    RI[Recovered foundation]
  end

  C --> P
  C --> Q
  C --> K
  C --> S
  C --> I
  C --> G
  C --> D
  C --> RI
  C --> RD
  C --> RG
  C --> E

  classDef management fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef vault fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef protected fill:#ffe8e8,stroke:#b83a3a,color:#031525,stroke-width:2px;
  classDef recovery fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  class C,P,Q,K management;
  class S,E vault;
  class G,D,I protected;
  class RG,RD,RI recovery;
```

## Orquestração como máquina de estados

Uma execução deve ser persistida antes de começar e avançar somente por transições válidas.

```joint
stateDiagram-v2
  [*] --> Pending
  Pending --> Planning: configuration accepted
  Planning --> AwaitingApproval: plan and policy pass
  Planning --> Rejected: policy fails
  AwaitingApproval --> Running: approval and identity granted
  AwaitingApproval --> Cancelled: denied or expired
  Running --> Paused: kill switch or operator pause
  Paused --> Running: explicit resume
  Running --> Validating: execution phases pass
  Running --> Failed: phase or timeout fails
  Validating --> Succeeded: service health passes
  Validating --> Failed: validation fails
  Rejected --> Evidencing
  Cancelled --> Evidencing
  Failed --> Evidencing
  Succeeded --> Evidencing
  Evidencing --> [*]
```

O cleanup é uma trilha paralela `always`, não uma transição opcional. Uma falha de cleanup deve aparecer como resultado próprio, sem apagar a causa original.

## Disponibilidade do próprio control plane

- API stateless e horizontalmente escalável;
- PostgreSQL com PITR e testes de restore;
- fila durável com idempotency key por comando;
- leases para impedir dois executors na mesma fase;
- tokens de curta duração obtidos somente quando necessários;
- último plano executável exportado de forma assinada para cenário break-glass;
- métricas e evidências fora do failure domain principal.
