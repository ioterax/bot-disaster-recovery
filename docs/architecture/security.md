# Arquitetura de segurança

## Trust boundaries

```joint
flowchart LR
  U[User and approver]
  GH[GitHub App]
  CP[DR Control Plane]
  WIF[Workload Identity Federation]
  GCP[GCP protected resources]
  K8S[Kubernetes API]
  VAULT[Secret Manager and KMS]
  EVID[Immutable evidence]

  U --> GH
  GH --> CP
  CP --> WIF
  WIF --> GCP
  WIF --> K8S
  CP --> VAULT
  CP --> EVID

  classDef identity fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef control fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef target fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef proof fill:#e8eee8,stroke:#526a59,color:#031525,stroke-width:2px;
  class U,GH,WIF identity;
  class CP control;
  class GCP,K8S,VAULT target;
  class EVID proof;
```

## Controles obrigatórios

| Controle | Implementação esperada |
| --- | --- |
| Tenant isolation | tenant ID em todas as chaves, policies e queries; testes contra IDOR |
| Authentication | GitHub App e identidade corporativa; sessões curtas |
| Cloud access | OIDC/WIF, sem chaves persistentes, audience e subject restritos |
| Authorization | RBAC do produto + policy por action/resource/environment |
| Approval | segregação solicitante/aprovador e expiração da aprovação |
| Secrets | apenas resource references; redaction antes de log/evidence |
| Supply chain | actions e imagens por digest/SHA, SBOM e assinatura |
| Runtime | egress allowlist, network policy, read-only filesystem |
| Evidence | hash, assinatura, retenção, WORM e projeto independente |
| Emergency | kill switch global e break-glass time-bound auditado |

## Ordem de autorização

Uma feature flag só habilita código. A operação requer simultaneamente:

1. capability habilitada no plano;
2. teto da policy de instalação permitindo;
3. adapter compatível e confiável;
4. target e labels na allowlist;
5. risk/cost/change plan dentro dos limites;
6. aprovação válida para modo recovery;
7. identidade efêmera autorizada na fase atual;
8. kill switch desativado imediatamente antes da mutação.

## IAM snapshot

Snapshots incluem contas, papéis, bindings, conditions, providers e Workload Identity, mas nunca chaves privadas. O writer de backup e o reader de recovery devem ser identidades diferentes quando possível. O bundle criptografado contém schema version, source revision, digest e ordem de dependência.

Para payload pequeno, Secret Manager pode guardar versões. Para snapshots maiores, use Cloud Storage versionado com retention lock e criptografia KMS, mantendo no Secret Manager apenas URI e digest.
