# PROJECT_MAP.md - Módulo de Controle Físico e Lógico de Chumbo (PWA PCP)

## 1. Objetivo Geral e Panorama do Negócio
O objetivo deste módulo é substituir o controle manual de estoque de chumbo (feito anteriormente via PDF anotado com S-Pen) por um sistema digital integrado ao PWA PCP. O sistema deve refletir exatamente a disposição física dos montes de chumbo na fábrica (layout matricial visual) para facilitar a liberação e auditoria, evitando remanejamento de pilhas ou repesagem. O controle exige exatidão no peso (KG) e na quantidade de barras (BR).

## 2. Stack Tecnológica e Ferramentas
- **Frontend / Framework:** Next.js (React)
- **Local Database (Offline-First):** Dexie.js
- **Remote Database (Sync):** Supabase
- **IA de Desenvolvimento:** Cursor AI

## 3. Padrões de Código e Arquitetura (Obrigatório)
- **KISS e DRY:** Mínimo de código para o máximo de resultado. Código modular e autoexplicativo.
- **Idioma do Código:** Nomes de variáveis, tabelas, colunas e funções obrigatoriamente em **INGLÊS**.
- **Idioma da Interface/Comentários:** UI (textos, botões, modais) e comentários no código obrigatoriamente em **PORTUGUÊS (PT-BR)**.
- **Tratamento de Erros:** É estritamente proibido o uso de `catch` vazio. Qualquer erro deve gerar logs detalhados no console e alertas visuais claros em tela (texto em vermelho ou modais) para o usuário.

## 4. Arquitetura do Banco de Dados (Schema)
O banco operará offline via Dexie.js com sincronização bidirecional no Supabase.

- `LeadAlloy` (Liga de Chumbo):
  - `id`, `name` (Ex: Liga 0, Liga 5).
- `LeadBatch` (Lote):
  - `id`, `alloy_id`, `batch_number`, `arrival_date`, `initial_total_weight`, `initial_total_bars`.
  - O saldo atual de peso e barras será calculado dinamicamente com base nas pilhas ativas (ver **4.1**).
- `LeadPile` (Monte de Chumbo na Grade):
  - `id`, `batch_id`, `current_weight`, `current_bars`, `grid_position_x`, `grid_position_y`, `status` (`AVAILABLE`, `PARTIAL`, `CONSUMED`, `RESERVED`).
  - `reserved_for` (texto, opcional): destino da **reserva** (setor/pessoa); `null` se não reservado.
  - `reserved_at` (ISO, opcional): quando foi reservado; `null` se não reservado.
  - Representa um monte físico. Geralmente possui 50 barras, mas os valores podem variar.
- `LeadTransaction` (Histórico de Baixas):
  - `id`, `pile_id`, `deducted_weight`, `deducted_bars`, `destination` (Ex: VRLA, Óxido), `transaction_date`.

### 4.1 Cálculo do saldo do lote (regra explícita)
Os totais do cabeçalho do `LeadBatch` são sempre derivados das pilhas, nunca gravados como fonte da verdade (exceto `initial_total_*`, que são histórico de chegada).

| Regra | Definição |
|--------|-----------|
| Pilhas fora do estoque físico | Somente `CONSUMED` (peso/barras zerados na pilha). Permanecem na grade para espelho e rastreio. |
| **No estoque** (total físico ainda na posição) | Σ `current_weight` / `current_bars` em todas as pilhas com `status` ≠ `CONSUMED` (inclui `RESERVED` e parciais com reserva). |
| **Disponível** (livre para outra reserva/liberação) | Pilhas com (`AVAILABLE` ou `PARTIAL`) **e** `reserved_for === null`. |
| **Reservado** (comprometido, ainda no chão) | Pilhas com `reserved_for !== null` ou `status === RESERVED` (saldo intacto até baixa real em `LeadTransaction`). |
| Consistência | `No estoque` = **Disponível** + **Reservado** (somas de kg/br). |
| Ao concluir baixa total | Ao passar para `CONSUMED`, definir `current_weight = 0` e `current_bars = 0`, limpar `reserved_for` / `reserved_at`. O detalhe da baixa fica no histórico `LeadTransaction`. |
| Conferência com o inicial | `initial_total_weight` / `initial_total_bars` servem de auditoria (chegada do lote); o **estoque operacional** exibido ao usuário é o derivado acima (disponível / reservado / total no estoque). |

## 5. Fluxos e Regras de Negócio
### 5.1 Organização Visual
- **Navegação por Abas:** Cada `LeadAlloy` (Liga) possui sua própria aba.
- **Visualização do Lote:** Dentro da aba, os `LeadBatch` (Lotes) são apresentados em blocos expansíveis ou listagens. O cabeçalho do lote deve exibir o Lote, Data de Chegada, Total de Barras Restantes e Peso Total Restante.
- **Grade Matricial Dinâmica:** Cada lote exibe uma grade bidimensional (de 1x1 até no máximo 7 colunas x 4 linhas). Esta grade mapeia exatamente a posição física do chumbo no estoque (esquerda para a direita, cima para baixo).
- **Célula do Monte (`LeadPile`):** Cada célula mostra visualmente o peso atual (número maior em destaque) e a quantidade de barras atual (número menor, geralmente no canto inferior direito).

### 5.2 Liberação e Baixa
- **Interação Direta:** O usuário pode clicar em um monte para registrar uma liberação.
- **Reserva (MVP):** Montes **totalmente** `AVAILABLE` podem ser marcados como reservados (`status` → `RESERVED`, preenche `reserved_for` e `reserved_at`). O peso/barras **não** mudam; o monte segue contando no estoque e aparece como “reservado” na UI. Não gera `LeadTransaction` (reserva não é baixa). Cancelar reserva devolve a pilha a `AVAILABLE` (ou remove só os campos de reserva se já estiver `PARTIAL` após uma baixa parcial mantendo compromisso).
- **Baixa após reserva:** A baixa real (total ou parcial) usa o mesmo fluxo de liberação; gera `LeadTransaction` e atualiza saldos. Baixa parcial em monte reservado mantém `reserved_for` no saldo restante até zerar ou cancelar a reserva.
- **Baixa Parcial:** Se não for liberado o monte inteiro, o usuário insere o valor consumido. O monte permanece na mesma posição da grade (`grid_position_x`, `grid_position_y`), atualizando seu saldo (`current_weight`, `current_bars`) e assumindo o status visual `PARTIAL` (ex: cor amarela), salvo quando ainda reservado (cor de reserva na UI).
- **Baixa Total:** Quando consumido totalmente, o monte muda para o status `CONSUMED` (ex: riscado ou cinza escuro), mantendo a rastreabilidade da posição original até que o lote inteiro acabe.
- **Atualização Dinâmica:** Toda baixa (parcial ou total) atualiza imediatamente os totais do cabeçalho do Lote.

### 5.3 Reordenação e Remanejamento
- **Drag-and-Drop:** Caso a equipe mova os montes fisicamente na fábrica, o sistema deve permitir arrastar e soltar as células na grade para atualizar as coordenadas `grid_position_x` e `grid_position_y`, mantendo o espelho fiel do estoque físico.

### 5.4 Offline-First e Sincronização (visão geral)
- Todas as ações ocorrem no Dexie.js instantaneamente para garantir operação em áreas da fábrica sem sinal Wi-Fi.
- Um Service Worker ou rotina de background verifica a conexão e sincroniza as filas de mutação com o Supabase.
- Detalhes técnicos obrigatórios na implementação: ver **5.5**.

### 5.5 Estratégia de sincronização Supabase + Dexie
Objetivo: um único estado convergente entre dispositivos, sem perda silenciosa de baixas ou de drag-and-drop quando dois operadores alteram dados com atraso de rede.

**Padrão local**
- **Outbox de mutações:** cada alteração relevante (insert/update em `LeadPile`, insert em `LeadTransaction`, updates em `LeadBatch` se houver) gera um registro em uma tabela Dexie `sync_outbox` com: `id` local, `entity_table`, `entity_id`, `operation` (upsert/delete), `payload` (JSON do row ou diff mínimo), `created_at` local, `attempt_count`, `last_error`.
- **Ordem:** o sync envia a outbox em ordem FIFO por dispositivo; isso preserva causalidade das ações daquele tablet.

**Espelho no Supabase**
- Tabelas espelho alinhadas ao schema (§4), com colunas de controle em cada linha sincronizada:
  - `updated_at` (timestamptz, atualizado em toda escrita vinda do cliente ou do servidor).
  - Opcional: `updated_by_device_id` (text/UUID do aparelho) para diagnóstico, não para regra de negócio.
- **Pull:** após push da outbox, o cliente busca alterações onde `updated_at` > último cursor guardado localmente (`last_pulled_server_updated_at` por tabela ou global monotônico, conforme simplicidade do MVP).

**Conflito e merge (regra única, previsível)**
- **Last-Write-Wins (LWW) por linha:** para a mesma PK (`id` da entidade), vence o registro com maior `updated_at`. O cliente, ao receber pull, aplica sobre Dexie: se `remote.updated_at > local.updated_at`, substitui o row local; caso contrário mantém local e re-enfileira outbox se necessário.
- **Clock skew:** o servidor (Supabase RPC/trigger ou Edge Function) deve preferencialmente **normalizar** `updated_at` para `now()` no servidor no momento do upsert, evitando tablets com hora errada dominarem o merge. O cliente ainda grava `updated_at` local para UX offline; na primeira subida, o servidor devolve o valor canônico e o cliente corrige Dexie.
- **Inserções com UUID:** gerar `id` com UUID v4 no cliente para `LeadPile`, `LeadTransaction`, etc., evita colisão entre dispositivos sem round-trip.
- **Idempotência:** chave única no servidor para reenvio da mesma mutação da outbox (ex.: `client_mutation_id` = UUID da entrada da outbox) evita duplicar `LeadTransaction` se o push repetir após timeout.

**Escopo MVP vs. avançado**
- MVP: LWW + `updated_at` servidor + outbox FIFO + UUIDs.
- Se no futuro houver edição concorrente **no mesmo campo** com alta frequência, avaliar CRDT ou lock otimista por `LeadBatch`; não é requisito inicial.

### 5.6 Implementação atual (Supabase + Vercel, usuário único)
- **Hospedagem:** Next.js na Vercel (HTTPS); variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente de build.
- **Backend:** Postgres no Supabase com tabelas `lead_alloys`, `lead_batches`, `lead_piles`, `lead_transactions`, `lead_pile_events`, colunas `owner_id` (FK `auth.users`) e `updated_at` (carimbadas por trigger antes de update).
- **Auth:** login e-mail/senha no cliente; usuários criados no painel Supabase (sem cadastro público).
- **Cliente:** Dexie permanece a fonte da verdade offline; fila `sync_outbox` envia upserts/deletes via cliente anon + RLS; **Realtime** replica mudanças remotas no Dexie com merge **LWW** por `updated_at`.
- **Primeira subida:** botão “Subir dados locais para a nuvem” enfileira todas as linhas do Dexie e drena a outbox (útil para dados já existentes no navegador antes do login).

## 6. Log de Execução
- [ ] Implementar Schema no Supabase e gerar tipagens.
- [ ] Configurar Dexie.js e lógica de sincronização (Sync Engine).
- [ ] Criar componentes de UI Next.js (Abas de Liga, Cabeçalho de Lotes).
- [ ] Desenvolver Componente de Grade Matricial (Suporte até 7x4 e Drag-and-Drop).
- [ ] Implementar lógicas de Baixa Parcial/Total e cálculos de cabeçalho.
- [ ] Integrar tratamento de erros rigoroso (Alertas visuais e Logs).

## 7. Checklist: PDF legado → schema e fluxos (validação)
Use o PDF antigo (Anotação S-Pen) para confirmar que o digital cobre o mesmo comportamento. Marque cada item quando conferido.

| # | O que olhar no PDF / na operação real | Onde está no mapa digital |
|---|----------------------------------------|---------------------------|
| 1 | Nomes ou códigos das **ligas** (quantas abas, labels) | §5.1 — `LeadAlloy`; abas |
| 2 | Como identificam **lote** e **data de chegada** | `LeadBatch.batch_number`, `arrival_date` |
| 3 | Se o layout é sempre uma **grade** com no máximo **7×4** posições por lote | §5.1 — grade; `grid_position_x/y` |
| 4 | Se anotam **peso** e **barras** por monte/célula | `LeadPile.current_weight`, `current_bars` |
| 5 | Destinos de consumo escritos (VRLA, Óxido, etc.) | `LeadTransaction.destination` — alinhar lista fixa ou livre |
| 6 | Se existe **baixa parcial** por monte sem “apagar” a posição | §5.2 — `PARTIAL`, mesma célula |
| 7 | Se monte zerado some visualmente ou fica riscado no papel | §5.2 — `CONSUMED` + §4.1 zeros |
| 8 | Se **movem** montes no chão e precisam refletir só troca de lugar (sem misturar lote) | §5.3 — DnD = só `grid_position_*` |
| 9 | Casos especiais não no PDF: reserva, lote bloqueado, repesagem | Documentar decisão; hoje fora do escopo do §5 |
|10 | Conferência: soma manual no PDF bate com **somatório só AVAILABLE+PARTIAL** | §4.1 |

Se algum item do PDF **não** tiver correspondência, acrescente regra em §5 ou campo em §4 antes de codificar.