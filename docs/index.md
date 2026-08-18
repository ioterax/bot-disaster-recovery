---
title: StormHarbor
description: Visão unificada e continuamente reconciliada da capacidade de recuperação.
hide:
  - navigation
  - toc
---

<div class="hero" markdown>

# StormHarbor

**Recuperação deixa de ser uma promessa.**

O Disaster Recovery Control Plane da StormHarbor transforma repositórios, cloud, clusters, backups e políticas em uma visão verificável de **recovery readiness** — sem retirar de cada sistema a autoridade sobre seu próprio domínio.

[Conhecer a arquitetura](architecture/control-plane.md){ .md-button .md-button--primary }
[Explorar as simulações](operations/pipelines.md){ .md-button }

</div>

<div class="metric-grid" markdown>
<div class="metric-card" markdown>
**FSoT**
Autoridade distribuída por domínio
</div>
<div class="metric-card" markdown>
**ITSCM**
Serviços, criticidade, RTO e RPO
</div>
<div class="metric-card" markdown>
**GCP-first**
Cloud extensível por adapters
</div>
<div class="metric-card" markdown>
**Evidence-driven**
Cada teste produz prova auditável
</div>
</div>

## Uma visão operacional única

O produto não tenta copiar todos os sistemas para um repositório. Ele mantém um índice operacional e um grafo de dependências, continuamente reconciliados com as fontes autoritativas.

```joint
flowchart LR
  subgraph S[FONTES AUTORITATIVAS]
    GH[GitHub<br/>planos e desired state]
    TF[Terraform backend<br/>runtime state]
    GC[GCP APIs<br/>cloud actual state]
    KA[Kubernetes API<br/>cluster actual state]
    ES[Evidence store<br/>provas imutáveis]
  end

  subgraph C[DR CONTROL PLANE]
    D[Discover]
    N[Normalize]
    X[Correlate]
    P[Evaluate policy]
    O[Orchestrate]
    V[Validate and prove]
    D --> N --> X --> P --> O --> V
  end

  GH --> D
  TF --> D
  GC --> D
  KA --> D
  V --> ES

  classDef source fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef core fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  class GH,TF,GC,KA,ES source;
  class D,N,X,P,O,V core;
```

## Do inventário à recuperação

1. **Descobrir:** ler apenas os repositórios autorizados, assets GCP e objetos Kubernetes.
2. **Correlacionar:** ligar serviço, owner, código, módulo Terraform, projeto, cluster, workload, banco e backup.
3. **Avaliar:** comparar RTO/RPO, freshness, drift, dependências, controles e último teste.
4. **Planejar:** construir uma DAG de recuperação, congelada em revisões imutáveis.
5. **Executar:** aplicar fases idempotentes com approvals, guardrails, timeout e health gates.
6. **Provar:** produzir evidência assinada fora do failure domain recuperado.

!!! info "Estado atual"
    O repositório contém pipelines de mock sem credenciais ou mutações externas. Elas existem para validar contratos, ordem, métricas, guardrails e formato de evidência antes da implementação dos adapters reais.

## Para quem é

- lideranças que precisam demonstrar continuidade de serviços;
- equipes de plataforma responsáveis por GCP, GKE, Terraform e GitOps;
- SREs que precisam testar runbooks repetidamente;
- risco, auditoria e compliance que precisam de evidência rastreável;
- application owners que precisam conhecer dependências e readiness.

## Explore por objetivo

| Quero entender… | Próxima leitura |
| --- | --- |
| o posicionamento e os limites do produto | [Visão de produto](product/overview.md) |
| por que o GitHub não contém toda a verdade | [Federated Source of Truth](architecture/federated-source-of-truth.md) |
| como o inventário vira dependency graph | [Inventário e dependências](architecture/inventory.md) |
| como CRDs e Operator participam da recuperação | [CRDs e Operator](kubernetes/crds-and-operator.md) |
| como as pipelines simulam cenários sem risco | [Pipelines](operations/pipelines.md) |
| como RTO/RPO são medidos e provados | [Evidências](operations/evidence.md) |
