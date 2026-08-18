# Federated Source of Truth

## O termo

**Federated Source of Truth (FSoT)** é um padrão arquitetural descritivo, não uma especificação formal única. Ele expressa um modelo no qual diferentes sistemas permanecem autoritativos em seus domínios e uma camada coordenadora oferece interoperabilidade, correlação e visão unificada.

Definição adotada pelo produto:

> Cada sistema permanece autoritativo para seu domínio. O DR Control Plane descobre, normaliza, correlaciona e reconcilia essas fontes em uma visão operacional unificada da capacidade de recuperação.

## Matriz de autoridade

| Entidade/campo | Autoridade | Cópia no control plane | Regra de conflito |
| --- | --- | --- | --- |
| recovery plan e policy | repositório DR | documento validado + commit SHA | Git vence; execução congela SHA |
| infraestrutura desejada | repositório Terraform | módulos, endereços e SHA | Git vence |
| lineage/state Terraform | backend remoto | serial, lineage, digest e freshness | backend vence |
| workloads desejados | repositório GitOps | objetos normalizados e SHA | Git vence |
| recurso GCP existente | GCP API/CAI | asset com timestamp e provenance | API mais recente vence |
| objeto Kubernetes existente | Kubernetes API | UID, generation, status e timestamp | API vence |
| secret | Secret Manager | somente resource reference e versão | vault vence; valor nunca é copiado |
| evidence | evidence store | índice, digest e URI | objeto imutável vence |
| owner/RTO/RPO | cadastro governado do produto ou integração ITSM | valor e provenance | policy de ownership por atributo |

## Reconciliation

```joint
sequenceDiagram
  participant S as Authoritative source
  participant A as Adapter
  participant N as Normalizer
  participant I as Inventory
  participant P as Policy engine
  participant E as Evidence

  S->>A: snapshot or delta + cursor
  A->>N: provider payload + provenance
  N->>I: canonical assets and relations
  I->>I: upsert by canonical identity
  I->>P: changed service graph
  P->>P: evaluate freshness, drift, RTO and RPO
  P->>E: decision + inputs + rule version
```

## Por que não GitHub para tudo

GitHub é excelente para desired state, revisão, histórico e aprovação. Ele não é o local adequado para state Terraform, estado runtime, métricas, segredos, locks distribuídos ou evidências que precisam sobreviver à perda/comprometimento da própria organização GitHub.

O control plane também não é “a nova verdade”. PostgreSQL funciona como **índice operacional materializado**. Cada registro precisa de:

- `source_system` e `source_resource_id`;
- `observed_at` e `expires_at`;
- `source_revision`, etag ou resource version;
- `content_digest`;
- nível de confiança quando a relação for inferida;
- estado de reconciliação e último erro.

## Consistência e stale data

O produto aceita consistência eventual para inventário, mas não para decisões críticas. Antes de uma recovery run:

1. congele commits e versões das fontes declarativas;
2. force refresh das fontes usadas no plano;
3. rejeite dados além do freshness budget;
4. recalcule policy sobre o snapshot congelado;
5. atribua um digest ao execution plan;
6. registre qualquer mudança posterior como novo drift, sem alterar silenciosamente o run em curso.

!!! warning "Regra de segurança"
    Ausência ou indisponibilidade de uma fonte crítica produz estado `UNKNOWN`, nunca `HEALTHY`. Em recovery real, `UNKNOWN` bloqueia a execução salvo procedimento break-glass explicitamente governado.
