# Visão do produto

## Definição

A StormHarbor é uma plataforma de **Continuous Disaster Recovery Readiness** baseada no conceito de Disaster Recovery Control Plane. Seu resultado principal não é apenas executar restore: é informar, com dados atuais, se cada serviço está recuperável e quais riscos impedem o cumprimento de RTO e RPO.

## Escopo funcional

```joint
flowchart TB
  E[Experience<br/>portal, API, CLI e GitHub App]
  G[Governance<br/>serviços, owners, tiers, RTO e RPO]
  C[Control plane<br/>inventory, graph, policy e orchestration]
  A[Adapters<br/>GitHub, Terraform, GCP, Kubernetes e FluxCD]
  R[Recovery targets<br/>foundation, data, cluster e workloads]
  P[Proof<br/>metrics, logs, artifacts e evidence]

  E --> G --> C --> A --> R --> P

  classDef experience fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef governance fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef control fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef execution fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  classDef proof fill:#e8eee8,stroke:#526a59,color:#031525,stroke-width:2px;
  class E experience;
  class G governance;
  class C control;
  class A,R execution;
  class P proof;
```

## O que entra do ITSM/ITSCM

O produto usa práticas de continuidade de serviço, sem tentar substituir uma suíte completa de ITSM.

| Incluído | Fora do núcleo |
| --- | --- |
| catálogo mínimo de serviços e owners | service desk completo |
| criticidade, impacto e recovery tier | gestão genérica de tickets |
| dependency mapping | CMDB universal da empresa |
| RTO, RPO e recovery plans | todos os processos ITIL |
| exercícios, resultados e exceções | change management completo |
| readiness, evidência e auditoria | gestão financeira de TI |

Integrações futuras podem abrir incidentes, registrar changes e sincronizar atributos de CMDB, mantendo ownership claro por campo.

## Princípios

1. **Federado:** cada domínio mantém sua fonte autoritativa.
2. **Fora do failure domain:** o orquestrador sobrevive ao ambiente recuperado.
3. **Read-only antes de mutate:** discovery e planning antecedem tokens privilegiados.
4. **Fail closed:** ausência de evidência, policy ou identidade bloqueia execução.
5. **Idempotente:** repetir uma fase produz o mesmo estado desejado.
6. **Evidence-first:** cada decisão e transição é explicável depois do incidente.
7. **Extensível:** providers e engines entram por contratos de adapter versionados.

## Experiência desejada

Um usuário instala o GitHub App, autoriza repositórios e conecta uma organização/projetos GCP por workload identity. O produto propõe um inventário, solicita confirmação de ownership e dependências, calcula gaps e recomenda o primeiro exercício seguro. Nenhuma recuperação real é habilitada implicitamente.
