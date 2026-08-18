# AI providers: Codex Cloud e Gemini

## Objetivo e limite

A IA da StormHarbor é uma camada **advisory** para interpretar dados já descobertos. Ela não recebe autoridade cloud, não executa Terraform, não aplica manifests e não aprova recovery.

Casos de uso permitidos:

| AI task type | Input mínimo | Output estruturado |
| --- | --- | --- |
| `inventory-classification` | metadata e labels de assets | serviço, tipo, criticidade sugerida e confidence |
| `dependency-inference` | relações técnicas redigidas | edges sugeridas, confidence e explicação |
| `recovery-plan-review` | plano efetivo redigido | gaps, severidade e mitigação |
| `evidence-summary` | manifesto e resultados de fase | resumo executivo e findings |

Toda sugestão mantém provenance, confidence e estado `PROPOSED` até confirmação humana ou regra determinística independente.

## Arquitetura provider-neutral

```joint
flowchart LR
  P[Pipeline or control plane]
  D[Data policy and redaction]
  R[Profile resolver]
  S[Structured prompt contract]
  O[Codex Cloud adapter]
  G[Gemini Vertex AI adapter]
  A[Gemini API adapter]
  V[Schema and safety validation]
  H[Human review]
  E[AI evidence]

  P --> D --> R --> S
  S --> O
  S --> G
  S --> A
  O --> V
  G --> V
  A --> V
  V --> H --> E

  classDef pipeline fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef policy fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef provider fill:#e6eaf0,stroke:#6b7c8c,color:#031525,stroke-width:2px;
  classDef proof fill:#e8eee8,stroke:#526a59,color:#031525,stroke-width:2px;
  class P pipeline;
  class D,R,S policy;
  class O,G,A provider;
  class V,H,E proof;
```

## Configurações separadas

Não misture qualidade, profundidade de raciocínio e responsabilidade da IA:

| Dimensão | Valores | Função |
| --- | --- | --- |
| `provider` | `codex-cloud`, `gemini-vertex-ai`, `gemini-api` | endpoint, identidade e contrato do adapter |
| `modelTier` | `efficient`, `balanced`, `frontier`, `custom` | perfil portátil de capacidade/custo/latência |
| `model` | ID resolvido ou customizado | modelo exato enviado ao provider |
| `reasoningLevel` | `low`, `medium`, `high` | profundidade portátil comum aos adapters |
| `taskType` | quatro tipos allowlisted | responsabilidade limitada da chamada |
| `mode` | `advisory`, `evaluation` | produção assistiva ou avaliação offline |

O tier não deve selecionar silenciosamente “o modelo mais novo”. Um registry versionado resolve tier → modelo; a run congela modelo, versão do registry e reasoning level no execution plan e no evidence bundle.

## Registry inicial

| Provider | Efficient | Balanced | Frontier |
| --- | --- | --- | --- |
| Codex Cloud | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| Gemini | `gemini-3.5-flash-lite` | `gemini-3.6-flash` | `gemini-3.1-pro-preview` |

Os IDs são defaults iniciais, não um contrato eterno. Mudanças passam por evals e nova versão do registry. O uso de modelo preview deve ser bloqueado em recovery real salvo policy explícita.

A documentação OpenAI posiciona Luna para alto volume, Terra para equilíbrio e Sol para capacidade máxima; a família GPT-5.6 expõe esforços `none`, `low`, `medium`, `high`, `xhigh` e `max`. A StormHarbor usa inicialmente a interseção portátil `low|medium|high`. [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model/)

No Gemini, modelos atuais usam `thinking_level` com suporte dependente do modelo; a camada portátil também restringe a `low|medium|high`. [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking)

## Tradução do reasoning level

```joint
flowchart TB
  L[Portable reasoningLevel]
  LOW[low]
  MED[medium]
  HIGH[high]
  OE[OpenAI reasoning.effort]
  GT[Gemini thinking_level]

  L --> LOW
  L --> MED
  L --> HIGH
  LOW --> OE
  MED --> OE
  HIGH --> OE
  LOW --> GT
  MED --> GT
  HIGH --> GT

  classDef portable fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef provider fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  class L,LOW,MED,HIGH portable;
  class OE,GT provider;
```

Para `custom`, o adapter consulta suas capabilities e rejeita combinação inválida antes de enviar conteúdo. Nunca envie simultaneamente `thinking_level` e `thinking_budget` ao Gemini.

## Exemplo de configuração

```yaml
ai:
  enabled: false
  mode: advisory
  defaultProfile: codex-balanced
  allowedTaskTypes:
    - inventory-classification
    - dependency-inference
    - recovery-plan-review
    - evidence-summary
  profiles:
    - name: codex-balanced
      provider: codex-cloud
      modelTier: balanced
      model: gpt-5.6-terra
      reasoningLevel: medium
    - name: gemini-balanced
      provider: gemini-vertex-ai
      modelTier: balanced
      model: gemini-3.6-flash
      reasoningLevel: medium
  dataPolicy:
    redactSecrets: true
    allowSourceCode: false
    allowInfrastructureState: false
    maxPromptBytes: 65536
    retention: provider-zero-data-retention
  enforcement:
    default: advisory
    blockRecoveryOnProviderFailure: false
```

## Identidade e secrets

- `codex-cloud`: token/API credential resolvido em runtime por secret reference;
- `gemini-vertex-ai`: preferir OIDC/WIF e identidade GCP de curta duração;
- `gemini-api`: API key apenas em secret manager e somente quando Vertex AI não for adequado;
- nenhum token entra no YAML, GitHub input, log ou artifact;
- o job mock atual não solicita nem lê qualquer uma dessas credenciais.

## Política de dados

Antes da chamada:

1. reduzir ao mínimo necessário para o `taskType`;
2. remover secrets, tokens, kubeconfigs, state Terraform e dados pessoais;
3. classificar `metadata-only` ou `redacted-config`;
4. aplicar limite de bytes e lista de campos;
5. calcular digest do input redigido;
6. exigir output em JSON Schema;
7. validar citações para assets/findings existentes;
8. encaminhar para revisão humana.

Não persista raciocínio interno. Registre input redigido, output final estruturado, usage, latência, modelo efetivo, policy decision e digests.

## Falha do provider

Uma indisponibilidade de IA nunca pode bloquear uma recuperação emergencial já aprovada. `required-for-planning` pode impedir a publicação de um plano antes do incidente, mas a run executável congelada precisa permanecer independente do provider. Durante incidentes, falha de IA gera finding e fallback determinístico.

## Evals antes de ativar

- precisão de classificação e dependency edges;
- false positives em findings críticos;
- schema compliance;
- secret-leakage canaries;
- groundedness em asset IDs fornecidos;
- latência, tokens e custo por task type;
- comparação por provider/tier/reasoning level;
- regressão quando o registry muda de modelo.
