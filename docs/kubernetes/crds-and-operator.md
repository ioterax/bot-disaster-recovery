# CRDs e Operator Kubernetes

## Papel na arquitetura

O Operator é o especialista Kubernetes do produto. Ele roda um control loop dentro de cada cluster gerenciado e reconcilia Custom Resources. O orchestrator externo cria ou acompanha esses recursos, mas permanece responsável pela DAG global que inclui GCP, Terraform, IAM e bancos.

```joint
flowchart LR
  CP[External DR Control Plane]
  API[Kubernetes API]
  OP[DR Operator]
  PLAN[DisasterRecoveryPlan]
  TARGET[RecoveryTarget]
  RUN[RecoveryRun]
  FLUX[FluxCD]
  WORK[Workloads and data services]

  CP --> API
  API --> PLAN
  API --> TARGET
  API --> RUN
  PLAN --> OP
  TARGET --> OP
  RUN --> OP
  OP --> API
  OP --> FLUX
  FLUX --> WORK

  classDef outside fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:3px;
  classDef api fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef crd fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef runtime fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  class CP outside;
  class API api;
  class PLAN,TARGET,RUN crd;
  class OP,FLUX,WORK runtime;
```

!!! danger "Limite arquitetural"
    Se o cluster desaparecer, Operator, Flux e CRDs desaparecem com ele. O control plane externo primeiro recupera foundation e GKE; somente depois reinstala o Operator e recria os Custom Resources a partir do execution plan congelado.

## API group e versionamento

O API group neutro proposto é `recovery.controlplane.io`. O primeiro contrato pode usar `v1alpha1`; produção exige conversion strategy e política de compatibilidade antes de promover para `v1beta1`/`v1`.

| CRD | Escopo | Fonte | Objetivo |
| --- | --- | --- | --- |
| `DisasterRecoveryPlan` | Namespaced | materializado do plano global | desired state Kubernetes, objetivos e fases permitidas |
| `RecoveryTarget` | Namespaced | discovery + confirmação | cluster/namespace alvo, constraints e referências |
| `RecoveryRun` | Namespaced | orchestrator externo | uma execução imutável, seu approval e estado |

Evite CRDs cluster-scoped no MVP. Um namespace de management dedicado reduz blast radius e simplifica RBAC multi-tenant.

## DisasterRecoveryPlan

```yaml
apiVersion: recovery.controlplane.io/v1alpha1
kind: DisasterRecoveryPlan
metadata:
  name: checkout-production
  namespace: dr-system
spec:
  serviceRef: checkout
  source:
    repository: platform/gitops
    revision: 4c8d9e7f1a2b3c4d5e6f7890123456789012abcd
    path: clusters/recovery/checkout
  objectives:
    rto: 60m
    rpo: 15m
  strategy:
    fluxBootstrap: true
    orderedHealthGates:
      - infrastructureReady
      - fluxReady
      - workloadsAvailable
      - serviceReachable
  policyRef:
    name: critical-services
status:
  observedGeneration: 3
  conditions: []
```

Regras:

- `revision` é SHA imutável, nunca branch durante uma run;
- `spec` descreve intenção; controllers nunca escrevem em `spec`;
- `status.observedGeneration` demonstra qual geração foi processada;
- referências a secrets usam `SecretKeySelector`, nunca valor inline;
- validação CEL impede combinações perigosas ainda no API server.

## RecoveryTarget

```yaml
apiVersion: recovery.controlplane.io/v1alpha1
kind: RecoveryTarget
metadata:
  name: checkout-dr-sandbox
  namespace: dr-system
spec:
  provider: gcp
  projectRef: sample-dr-sandbox
  cluster:
    name: checkout-dr-sandbox
    location: europe-west1
    privateEndpointRequired: true
    workloadIdentityRequired: true
  allowedNamespaces:
    - checkout
  disposableLabels:
    purpose: disaster-recovery-simulation
    disposable: "true"
status:
  discoveredClusterUid: 8d8ab676-39b1-49b4-a585-bc9de6b6a45a
  lastVerifiedAt: "2026-08-18T10:00:00Z"
  conditions: []
```

O Operator confirma que UID, projeto, cluster e labels continuam correspondendo ao target antes de cada ação. Nome igual não é prova de identidade.

## RecoveryRun

```yaml
apiVersion: recovery.controlplane.io/v1alpha1
kind: RecoveryRun
metadata:
  name: checkout-20260818-001
  namespace: dr-system
  labels:
    recovery.controlplane.io/mode: simulation
spec:
  planRef:
    name: checkout-production
  targetRef:
    name: checkout-dr-sandbox
  mode: Simulation
  executionPlanDigest: sha256:2cf24dba5fb0a30e...
  approval:
    id: approval-01
    expiresAt: "2026-08-18T12:00:00Z"
  requestedPhases:
    - BootstrapFlux
    - ReconcileWorkloads
    - ValidateService
status:
  phase: ReconcilingWorkloads
  startedAt: "2026-08-18T10:01:14Z"
  phaseRuns: []
  conditions: []
```

Depois da criação, campos operacionais de `RecoveryRun.spec` devem ser imutáveis por CEL/admission. Cancelamento usa um campo explícito (`spec.cancel: true`) ou subresource/API do control plane, nunca edição arbitrária do plano executado.

## Control loop

```joint
flowchart TD
  W[Watch RecoveryRun event]
  G[Read latest object and generation]
  L[Acquire per-run lease]
  P[Validate plan, target, policy and kill switch]
  D[Compute next idempotent action]
  A[Apply through Kubernetes API]
  H[Evaluate health gate]
  S[Patch status and emit event]
  R[Requeue with bounded backoff]
  F[Finalize evidence references]

  W --> G --> L --> P --> D --> A --> H --> S
  S --> R --> G
  H --> F

  classDef observe fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef decide fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef mutate fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  classDef record fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  class W,G,L observe;
  class P,D,H decide;
  class A mutate;
  class S,R,F record;
```

### Requisitos do reconciler

- processar pelo resource version mais recente;
- usar lease/idempotency key contra execução duplicada;
- não manter estado essencial apenas em memória;
- aplicar server-side apply com field manager próprio;
- limitar concurrency por tenant, cluster e failure domain;
- retry somente de erros transitórios, com backoff e jitter;
- classificar erros permanentes em `Degraded=True`;
- observar `generation`, não loops provocados apenas por `status`;
- respeitar deadline global e timeout por health gate;
- verificar kill switch antes de qualquer etapa mutável.

## Conditions e fases

Use conditions padronizadas e independentes:

| Type | Significado |
| --- | --- |
| `Accepted` | schema, referências e policy são válidos |
| `TargetVerified` | identidade e guardrails do target foram confirmados |
| `Progressing` | há uma ação em curso |
| `Ready` | todos os health gates solicitados passaram |
| `Degraded` | erro permanente ou objetivo não atingido |
| `EvidencePublished` | referências e digests foram persistidos externamente |

Cada condition inclui `status`, `reason`, `message`, `observedGeneration` e `lastTransitionTime`. Mensagens não podem conter tokens, payloads de secrets ou kubeconfig.

## Finalizers

Um finalizer `recovery.controlplane.io/run-protection` existe somente quando há trabalho assíncrono que precisa terminar antes da remoção:

1. bloquear novas etapas;
2. revogar credenciais/leases temporários;
3. executar cleanup permitido pelo execution plan;
4. publicar o último status/evidence reference;
5. remover o finalizer.

Finalizer não pode ficar preso indefinidamente. Deve haver deadline, reason visível e procedimento administrativo auditado. Recursos externos nunca são apagados apenas porque um Custom Resource foi removido, salvo política explícita e target descartável.

## RBAC mínimo

O Operator não precisa de `cluster-admin`. Separe ServiceAccounts por controller/capability quando o blast radius justificar. O núcleo normalmente requer:

- get/list/watch/patch em seus CRDs e `/status`;
- get/create/update em Leases;
- get/list/watch em workloads e objetos Flux necessários;
- patch restrito aos namespaces allowlisted;
- create em Events;
- nenhuma leitura genérica de Secrets; somente nomes explicitamente referenciados.

## Instalação após perda do cluster

```joint
sequenceDiagram
  participant C as External control plane
  participant G as GCP adapter
  participant K as New GKE API
  participant O as DR Operator
  participant F as FluxCD

  C->>G: recover network, cluster and identity
  G-->>C: cluster endpoint and verified UID
  C->>K: install pinned Operator bundle
  K-->>C: deployment available
  C->>K: apply Plan, Target and immutable Run
  K->>O: watch RecoveryRun
  O->>F: bootstrap immutable Git revision
  F-->>O: sources and kustomizations ready
  O-->>K: Ready=True and phase metrics
  C->>K: read status and evidence references
```

## Testes necessários

- envtest/unit tests para defaulting, validation e transitions;
- idempotência com reconcile repetido;
- perda de leader no meio de uma fase;
- API throttling e watch reconnect;
- target com mesmo nome e UID diferente;
- Git revision ausente ou não assinada;
- timeout e cancelamento durante Flux reconciliation;
- finalizer com dependência externa indisponível;
- proibição de secret leakage em status, logs e Events;
- upgrade de CRD com objetos de versões anteriores.
