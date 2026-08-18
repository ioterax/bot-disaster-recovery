# StormHarbor

[![DR simulation](https://github.com/ferreiraad/disaster-recovery-control-plane/actions/workflows/disaster-recovery-simulation.yml/badge.svg)](https://github.com/ferreiraad/disaster-recovery-control-plane/actions/workflows/disaster-recovery-simulation.yml)
[![Documentation](https://img.shields.io/badge/docs-MkDocs-526CFE)](docs/index.md)
[![Status](https://img.shields.io/badge/status-safe%20simulation-0B7285)](#estado-do-projeto)

**Disaster Recovery Control Plane** para descobrir dependências, avaliar continuamente a capacidade de recuperação e orquestrar Disaster Recovery em GitHub, Terraform, Google Cloud e Kubernetes.

O produto aplica um **Federated Source of Truth (FSoT)**: cada sistema continua autoritativo no seu domínio; o control plane descobre, normaliza, correlaciona e reconcilia essas fontes em uma visão única de readiness, RTO, RPO, planos, execuções e evidências.

## O problema que resolve

Planos de DR costumam estar separados da infraestrutura real. Repositórios descrevem intenção, APIs mostram o estado observado, backups vivem em outro domínio e evidências de teste ficam dispersas. O resultado é uma pergunta difícil de responder: **este serviço pode ser recuperado agora, dentro do RTO e RPO acordados?**

O Disaster Recovery Control Plane conecta essas informações sem substituir suas fontes originais:

| Domínio | Fonte autoritativa | Responsabilidade do control plane |
| --- | --- | --- |
| Política e plano de DR | repositório DR | validar, versionar e aprovar |
| Infraestrutura desejada | repositório Terraform | correlacionar módulos, planos e revisões |
| Estado Terraform | backend remoto | verificar disponibilidade, lineage e drift |
| Estado desejado Kubernetes | repositório GitOps | resolver a revisão imutável de recuperação |
| Estado real de cloud | APIs GCP / Cloud Asset Inventory | descobrir assets e relações |
| Estado real Kubernetes | Kubernetes API | reconciliar CRDs, workloads e saúde |
| Segredos | Secret Manager + KMS | guardar apenas referências e usar identidade efêmera |
| Evidências | storage externo e imutável | assinar, reter e consultar |
| Índice operacional | PostgreSQL | materializar inventário, grafo, runs e métricas |

## Arquitetura em uma frase

O **control plane externo ao cluster recuperável** coordena discovery, inventário, políticas e recovery; o **Operator dentro do Kubernetes** reconcilia somente recursos Kubernetes por meio de CRDs.

```text
Federated Sources          DR Control Plane              Recovery targets
GitHub / TF Backend  ───►  Discover + Correlate   ───►  GCP foundation
GCP / Kubernetes API ───►  Policy + ITSCM         ───►  Terraform
Vault / Evidence      ───►  Orchestrate + Prove   ───►  GKE + DR Operator
```

Essa separação evita o paradoxo de hospedar o cérebro da recuperação dentro do cluster que ele precisa reconstruir.

## Capacidades do produto

- onboarding por GitHub App com repositórios explicitamente autorizados;
- inventário de serviços, owners, ambientes, assets e dependências;
- mapeamento de criticidade, RTO, RPO, recovery tier e plano por serviço;
- discovery GCP-first por APIs e Cloud Asset Inventory;
- detecção read-only de drift Terraform e correlação com o backend remoto;
- integração GitOps para restaurar FluxCD e workloads em revisão imutável;
- CRDs para planos, targets e execuções Kubernetes;
- Operator Kubernetes com control loops idempotentes e status observável;
- simulações isoladas com guardrails, health gates e cleanup obrigatório;
- evidências estruturadas de cada fase e score de recovery readiness;
- arquitetura de adapters preparada para AWS, Azure e outros engines GitOps.
- AI providers configuráveis para Codex Cloud e Gemini, com tiers, reasoning level, tipos de tarefa, redaction e revisão humana.

## Fluxo de recuperação

```text
preflight → foundation → IAM → Terraform → database → GKE
          → Operator/CRDs → FluxCD → workloads → validation → evidence
```

Cada transição depende de um health gate. Falha, timeout, violação de policy ou kill switch interrompe novas mutações; cleanup e coleta de evidência continuam.

## Estado do projeto

O repositório é um **scaffold de arquitetura e simulação segura**. As pipelines atuais:

- são executadas apenas manualmente com confirmação literal `SIMULATE`;
- mantêm `contents: read` e não solicitam token OIDC de cloud;
- validam targets descartáveis, RPO e caminhos recebidos;
- executam um motor de mock determinístico por fases;
- produzem evidência JSON e Job Summary;
- simulam seleção de provider/modelo de IA sem ler credenciais ou chamar APIs;
- não autenticam na GCP, não executam Terraform e não alteram Kubernetes.

Isso permite evoluir contratos, guardrails e observabilidade antes de habilitar operações reais.

## Executar localmente

O runtime está fixado em **Node.js 26.6.0**.

```bash
nvm install
nvm use
node --run check:runtime
node --run test:disaster-recovery
```

Para simular localmente sem acesso externo:

```bash
DR_CONFIRMATION=SIMULATE \
DR_SCENARIO=terraform-drift \
DR_PHASES=immutable-source,backend-init,refresh-only-plan,classify,policy-evaluation \
DR_TERRAFORM_SCENARIO=resource-deleted \
node scripts/simulate-recovery.mjs
```

## Documentação para clientes

O portal MkDocs contém visão executiva, diagramas, arquitetura, modelo federado, inventário, ITSCM, segurança, CRDs/Operator, pipelines e roadmap.

```bash
./scripts/serve-docs.sh
```

O script cria/reutiliza `.venv-docs`, instala as versões travadas de MkDocs e inicia o servidor. Argumentos adicionais são encaminhados ao `mkdocs serve`.

Abra `http://127.0.0.1:8000`. O menu lateral possui seções recolhíveis e um botão burger persistente também em desktop.

- [Início da documentação](docs/index.md)
- [Arquitetura do control plane](docs/architecture/control-plane.md)
- [XML editável do draw.io](docs/assets/diagrams/control-plane.drawio.xml)
- [CRDs e Operator](docs/kubernetes/crds-and-operator.md)
- [Pipelines de simulação](docs/operations/pipelines.md)
- [Plano de configuração](config/dr.config.example.yaml)

## Guardrails essenciais

- identidade efêmera via GitHub OIDC e Workload Identity Federation;
- nenhuma chave privada em snapshots, repositórios ou evidências;
- targets reais sujeitos a approval environment e política organizacional;
- fonte imutável, allowlist, labels descartáveis e limites de custo/mudança;
- restauração de banco sempre em nova instância;
- control plane e evidence store fora do failure domain recuperado;
- feature flag nunca substitui autorização ou policy;
- toda mutação deve ser idempotente, auditável e interrompível.

## Próximos marcos

1. GitHub App, onboarding e política de instalação.
2. Inventory API e PostgreSQL com grafo de dependências.
3. Discovery adapters para GitHub, Terraform, GCP e Kubernetes.
4. CRDs `DisasterRecoveryPlan`, `RecoveryTarget` e `RecoveryRun`.
5. Operator Kubernetes e orchestrator externo com filas duráveis.
6. Simulações em projeto descartável e evidence store imutável.
7. Recovery real com aprovação, break-glass e auditoria.

## Contribuição

Mudanças com operação real devem documentar threat model, permissões mínimas, idempotência, rollback, kill switch, evidências esperadas e plano de teste em ambiente descartável.
