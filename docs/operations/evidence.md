# RTO, RPO e evidências

## Medição

RTO e RPO precisam de pontos de medição definidos por serviço.

```joint
flowchart LR
  I[Incident or exercise declared<br/>T0]
  S[Recovery starts<br/>T1]
  D[Dependencies restored<br/>T2]
  H[Service health gate passes<br/>T3]
  B[Business validation passes<br/>T4]

  I --> S --> D --> H --> B

  classDef event fill:#e7edf3,stroke:#274c77,color:#031525,stroke-width:2px;
  classDef technical fill:#f3e8c8,stroke:#9a7628,color:#031525,stroke-width:2px;
  classDef business fill:#f4e8c1,stroke:#9a7628,color:#031525,stroke-width:2px;
  class I,S event;
  class D,H technical;
  class B business;
```

- **Technical recovery time:** `T3 - T0`.
- **Business recovery time:** `T4 - T0`.
- **Execution time:** `T3 - T1`; útil operacionalmente, mas não substitui RTO.
- **Actual RPO:** `T0 - timestamp do recovery point aplicado`.

Pausas de approval ou diagnóstico não devem desaparecer da métrica. Registre intervalos separadamente e apresente tempo total e breakdown.

## Evidence bundle

Cada run produz um manifesto e documentos de fase:

```text
evidence/<run-id>/
├── manifest.json
├── effective-plan.redacted.json
├── policy-decisions.json
├── inventory-snapshot.json
├── phases/
│   ├── foundation.json
│   ├── database.json
│   └── kubernetes.json
├── validations/
│   ├── service-health.json
│   └── data-integrity.json
└── signatures/
    └── manifest.sig
```

O manifesto registra schema version, tenant, run, mode, scenario, source revisions, execution plan digest, timestamps, objectives, actuals, result, artifact digests e versão do executor. Valores secretos e dados pessoais são redigidos antes da persistência.

## Integridade e retenção

1. normalize documentos com serialização determinística;
2. calcule SHA-256 de cada artifact;
3. construa o manifesto com os digests;
4. assine o manifesto com uma chave KMS fora do target;
5. grave em bucket versionado com retenção;
6. valide assinatura e completude ao consultar ou auditar.

Logs ajudam diagnóstico, mas não são sozinhos evidência suficiente. A evidência deve ligar input, policy decision, actor/identity, ação, target, timestamps e resultado.

## Resultado do exercício

| Status | Condição |
| --- | --- |
| `PASSED` | health/business gates passam, RTO/RPO atendidos e bundle íntegro |
| `PASSED_WITH_FINDINGS` | serviço recuperado dentro dos objetivos, com gaps não bloqueantes |
| `FAILED` | recuperação ou validação falha, ou objetivo é excedido |
| `ABORTED` | kill switch, cancelamento ou approval revogado |
| `INCONCLUSIVE` | evidência/fonte crítica indisponível; nunca equivale a sucesso |
