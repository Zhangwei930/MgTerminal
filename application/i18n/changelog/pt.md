# Registro de alterações


## [0.5.22] - 2026-07-21

### Segurança
- **As assinaturas de auditoria da equipa passam a ser mesmo verificadas**: antes bastava o evento ter o campo `sig` para exibir um visto, sem qualquer verificação; agora cada entrada é validada por HMAC e apresentada como verificada, adulterada, sem assinatura ou não verificável
- **As sondagens deixam de trazer credenciais**: o teste de ligação por proxy devolve um código de erro em vez da mensagem original (o HTTP CONNECT reflete `Proxy-Authorization` e o ProxyCommand a linha de comandos); o mapeamento de campos de uma fonte não consegue contornar a verificação de segredos do inventário

### Funcionalidades
- **Mudança de nome em lote no SFTP**: modelos `{name}` / `{ext}` / `{n}` com preenchimento de zeros; todo o lote é planeado e pré-visualizado antes de correr, e qualquer nome repetido ou colisão com um ficheiro alheio cancela a operação inteira
- **Edição em lote de campos de anfitriões**: nome de utilizador, grupo, porta e etiquetas para toda uma seleção; as etiquetas são acrescentadas em vez de substituírem a lista, um campo vazio significa manter, e os anfitriões geridos por uma fonte de dados são excluídos com a respetiva contagem
- **Pesquisa estruturada de anfitriões**: filtros `tag:` `user:` `group:` `host:` misturados com texto livre; um termo só é filtro quando antes dos dois pontos existe um nome de campo conhecido, pelo que endereços IPv6 e etiquetas com dois pontos de largura total não são afetados
- **Folha de atalhos com F1**: pesquisável, agrupada por categoria e lida a partir das associações realmente em vigor; ela própria é um atalho comum e reconfigurável
- **Envio hexadecimal por porta série**: os bytes são escritos no dispositivo tal como introduzidos, contornando o codificador de conjunto de caracteres, com pré-visualização de bytes e leitura ASCII
- **Mapeamento de campos da fonte de dados**: permite associar nomes como `name` / `ip` / `ssh_port` aos campos canónicos, para inventários externos que não podem ser alterados
- **Acesso a capacidades já existentes**: enviar um comando para uma janela tmux, testar a ligação por proxy, reconhecer o certificado ao importar uma chave e sugerir caminhos de módulos PKCS#11

### Correções
- **A importação do Vault de equipa deixa de comunicar um sucesso falso**: importar um pacote anunciava «N anfitriões importados» enquanto os descartava, e a lista não mudava; agora os anfitriões chegam realmente ao Vault, o número indicado corresponde ao que foi acrescentado, e apenas se adiciona sem sobrescrever alterações locais nem credenciais
- **Os códigos de convite WAN permitem entrar**: os convites `magies-follow:2:` eram sempre lidos como LAN e falhavam com `version`, apesar de a interface se propor aceitá-los; o transporte passa a ser escolhido pela versão do convite
- **A exportação de anfitriões respeita a seleção**: depois de assinalar apenas alguns, eram exportados todos
- **As etiquetas longas deixam de sair dos menus**: as larguras fixas empurravam as entradas mais longas para fora do menu e reduziam os seus ícones a zero; no menu de ordenação três opções transbordavam em francês
- **O envio de comandos para o tmux está acessível**: a ação exigia um número de painel que a interface não conseguia fornecer, pelo que a funcionalidade existia mas não podia ser acionada

### Melhorias
- **As transferências SFTP mostram o tempo restante**: ausente quando a taxa é desconhecida e omitido nas linhas de diretório, cujo total conta ficheiros
- **Frescura da sincronização na barra superior**: ao passar o rato vê-se quando os dados chegaram efetivamente pela última vez, sem abrir o painel
- **As conversas de IA exportadas mantêm o raciocínio**: recolhido em Markdown, indentado em texto simples e com a duração
- **Comodidade das definições de IA**: as mensagens rápidas ganharam pesquisa e, quando um modelo local não apresenta chamada de ferramentas, explica-se o que isso implica
- **Os relatórios de falhas mostram o que foi enviado**: contabilizado apenas após um envio bem-sucedido, para que falhas e duplicados não inflacionem o valor
- **As ações sobre processos e tmux usam a caixa de diálogo da aplicação**: sem janelas do sistema, a confirmação segue o tema da aplicação
- **O móvel passa pelos controlos de qualidade**: `mobile/` estava totalmente excluído do lint e dos testes, e o seu teste nunca tinha sido executado na CI

## [0.5.21] - 2026-07-21

### Segurança
- **Sanitização profunda do contexto do host**: remove recursivamente senhas, senhas Telnet, chaves privadas e frases secretas de objetos e matrizes aninhados
- **Escopo de sessão das capacidades públicas**: cada capacidade pública aplica validação fail-closed e não pode sair das sessões expostas ao chat atual
- **Leituras sensíveis e auditoria de aprovação**: Pod describe vira Sensitive Read; o processo principal persiste apenas metadados de aprovação, sem argumentos ou credenciais

### Recursos
- **Privacidade local estrita e teste de modelo**: permite somente modelos em loopback, desativa agentes externos/pesquisa web e verifica chamadas de ferramentas
- **Gerenciamento Docker Compose**: inspeciona projetos e serviços e executa ações explícitas up, restart e down
- **Operações Kubernetes expandidas**: Events estruturados, status/histórico/reinício de rollout, Agent Exec, Exec interativo e Port Forward em loopback

### Correções
- **Listas Kubernetes via JSON**: Namespaces, Pods e Deployments não analisam mais tabelas instáveis e erros do kubectl são exibidos diretamente
- **Pacotes multiplataforma**: corrige a falha Apple Silicon após Fuses sem Developer ID pago; Android alinha JDK 21, SDK/Build Tools 36 e v0.5.21

## [0.5.20] - 2026-07-21

### Features
- **System Manager Kubernetes**: remote kubectl for Pods/Deployments (list, logs, describe); delete pod / scale deployment with confirmation; MCP/CLI expose read and controlled write tools
- **Local LLM privacy hardening**: Ollama/LM Studio paths and approval audit; secrets never sent into LLM context
- **Session cast recording**: asciinema cast v2 records input; resize emits geometry markers; startStream stores cols/rows
- **SFTP conflict compare + true byte resume**: conflict dialog shows metadata compare; drag-drop resume uses `startOffset` append without deleting the target
- **Capability catalog expansion**: Kubernetes domain catalog registration, quasi-plugin registration, CLI/MCP/sidebar tool specs aligned

### Improvements
- **System Overview monitoring look**: resource bars and overview closer to a live monitoring HUD
- **SSH config / Vault import UX**: import flow and messaging polish

## [0.5.19] - 2026-07-20

### Improvements
- **Auto model catalog + UX**: providers fetch live `/models` after API key entry; loading/error/retry status; live list preferred over offline presets
- **GPT-5.6 / Grok / Gemini presets**: updated Codex/Cursor/OpenCode and OpenAI/xAI/Google defaults
- **xAI (Grok) provider**: first-class `api.x.ai` preset
- **ChatGPT branding**: Codex agent displays as ChatGPT with OpenAI icon; agent icons resolve by brand

## [0.5.18] - 2026-07-20

### Melhorias
- **Layout de chat IA no estilo Claude**: coluna de leitura central (~44rem) com tipografia maior; bolhas suaves do usuário e prosa do assistente sem borda; cabeçalho mínimo e compositor arredondado; botão de envio circular foreground/background; vazio, recentes, thinking e ferramentas mais discretos

## [0.5.17] - 2026-07-20

### Melhorias
- **Redesign dos botões de ícone da barra**: ferramentas do vault em cluster temático; alturas/espaçamentos unificados; faixa multi-seleção e utilitários do topo agrupados

## [0.5.16] - 2026-07-20

### Melhorias
- **Temas multicolor mais fáceis**: core com **Claude laranja / White / Black** e azul, verde, roxo, rosa, âmbar, céu; faixa de chips de um toque em Aparência

## [0.5.15] - 2026-07-20

### Melhorias
- **Laranja Claude como padrão**: temas claro/escuro padrão em laranja quente inspirado no Anthropic/Claude; Claude no topo da lista core, **Pure Black** ainda disponível; temas de terminal follow-app alinhados

## [0.5.14] - 2026-07-20

### Melhorias
- **Redesign de ícones e componentes de IA**: badges de agente/provedor com gradiente; cartões de ferramentas com ícones de categoria; barra de aprovação e chips de status reforçados; artefatos vault/terminal unificados; seletor slash e menu de exportação iconizados

## [0.5.13] - 2026-07-20

### Melhorias
- **Redesign do painel lateral de IA**: lavagem ambiental e micrograde; cabeçalho de vidro + botão Novo chat primary; bolhas do usuário solid primary e cartões do assistente com trilho primary; compositor flutuante com brilho de foco; estado vazio, sessões recentes, grupos de ferramentas, blocos de pensamento e menu de agente atualizados

## [0.5.12] - 2026-07-20

### Melhorias
- **Redesign de UI claramente visível**: barra lateral do vault com pílula primary sólida no item ativo; cartões de hosts com barra primary, elevação e brilho no hover; maior contraste palco/sidebar; navegação de configurações em primary sólido; abas Vault/SFTP com sublinhado primary; títulos de seção em maiúsculas compactas com chips de ícone

## [0.5.11] - 2026-07-20

### Melhorias
- **Atualização da UI do cliente alinhada ao tema**: chrome do app, barra lateral/palco do vault, janela de configurações e primitivos de UI compartilhados seguem o tema ativo com mais clareza — navegação com acento primário, sobreposições em vidro, elevação mais suave e foco/profundidade refinados em botões, campos, diálogos, abas, interruptores, estados vazios e painéis laterais

## [0.5.10] - 2026-07-19

### Correções
- **Sobreposição do diálogo «Novidades» escura demais**: o diálogo «Novidades» escurecia tanto a janela de Configurações que a navegação à esquerda ficava quase ilegível; agora a opacidade e o desfoque da sua sobreposição são reduzidos para que a navegação atrás continue legível (afeta apenas este diálogo)

## [0.5.9] - 2026-07-19

### Correções
- **Não era possível fechar o diálogo**: os diálogos abertos na janela de Configurações (p. ex., o registro de «Novidades») não podiam ser fechados — o X no canto superior direito sobrepunha a região de arraste da barra de título, então os cliques eram tratados como arraste da janela. Agora todos os diálogos ficam fora dessa região e o X fecha de forma confiável

## [0.5.8] - 2026-07-19

### Segurança
- **Reforço do IPC de arquivos locais**: os manipuladores IPC de leitura/gravação/exclusão/enumeração de arquivos locais agora validam o sender do renderer chamador e rejeitam contextos webview/convidado, de modo que um XSS do renderer não possa escalar para acesso arbitrário a arquivos locais (defesa em profundidade)
- **Reforço de dependências**: resolvidos todos os avisos de severidade alta na árvore de dependências de produção: fast-uri → 4.1.1, fast-xml-parser → 5.10.1, fast-xml-builder → 1.3.0, hono → 4.12.31; e, restrito à subárvore do @cursor/sdk, node-gyp → 11.4.2 e tar → 7.5.20 (com escopo restrito para não afetar as compilações nativas)

## [0.5.7] - 2026-07-18

### Funcionalidades
- **Relatórios de falhas anônimos (opcional)**: desligado por padrão; quando ativado em Configurações → Sistema, resumos de falhas higienizados (sem caminhos, nomes de usuário, hosts ou dados de sessão) são enviados para corrigir falhas mais rápido

## [0.5.6] - 2026-07-18

### Segurança
- **Cabeçalho de autenticação de inventário HTTP criptografado**: o cabeçalho de autenticação (Authorization / chave de API) das fontes json_http não é mais armazenado em texto simples; agora usa criptografia em nível de campo do vault, e os valores em texto simples existentes são migrados no primeiro início após a atualização
- **Reforço de dependências**: undici → 6.27.0, DOMPurify → 3.4.12, uuid → 13.0.2, corrigindo avisos de XSS alcançável e request smuggling / DoS que os overrides desatualizados ainda atingiam

## [0.5.5] - 2026-07-18

### Correções
- **Toasts falsos de «Falha na atualização»**: erros da fase de verificação deixam de ser tratados como falha de download; estado in-flight limpo após cada verificação IPC
- **Canal de atualização Windows arm64**: usar `latest-arm64.yml` para não baixar instaladores x64
- **Caminho de verificação/download mais confiável**: dual-feed e máquina de estados da UI reduzem erros falsos por verificações concorrentes

## [0.5.4] - 2026-07-18

### Segurança
- **Limite de desbloqueio do Vault**: desativar/alterar PIN e WebAuthn exigem desbloqueio ou PIN atual; limite de tentativas
- **Diagnóstico/saúde SSH**: abortar antes da autenticação se a chave do host for unknown/changed para não enviar senha a um MITM
- **Acompanhamento de sessão**: selagem AES-GCM E2E com token de convite; relay opaco; rejeição de wss/ws falsos
- **IPC de credenciais**: validar o sender no desbloqueio do vault e em encrypt/decrypt
- **Temp / RDP / deep links / logs / anexos de IA**: 0700+symlink-safe, limpeza imediata de cmdkey se o RDP falhar, confirmação Telnet/JMS, sem logs de respostas kbd-int, limites de tamanho de anexos

### Correções
- Health com keyboard-interactive; notas com scroll
- Envio de IA só com anexos; SFTP/port-forward honram verifyHostKeys

### Engenharia
- Adicionar `npm run typecheck`; primeiro lote de erros de tipo de produção (vault/WebAuthn/update/SFTP)

## [0.5.3] - 2026-07-18

### Correções
- **Rolagem do diálogo de novidades**: notas longas podem ser roladas dentro da janela do diálogo

### Melhorias
- Texto da contagem de alterações da versão mais recente corrigido; strings de «Novidades» preenchidas nos 10 idiomas da interface

## [0.5.2] - 2026-07-18

### Funcionalidades
- **Vault de equipe local-first**: pacotes de inventário só com metadados, papéis (owner/editor/viewer) e auditoria HMAC; senhas e chaves privadas não saem do dispositivo
- **Follow de sessão via relé WAN**: relé TCP NDJSON amigável a NAT; relé local embutido ou `scripts/follow-relay.cjs` auto-hospedado
- **Desbloqueio do Vault com passkey do dispositivo**: autenticadores WebAuthn (Touch ID / Windows Hello / chave de segurança) verificados no processo principal; não é sync multi-dispositivo na nuvem
- **KEX pós-quântico híbrido ssh2 embutido**: prefere `mlkem768x25519-sha256` e volta a algoritmos clássicos se não suportado
- **Suporte a hosts RDP**: abre o cliente de área de trabalho remota do sistema a partir do Vault (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Jump e proxy OpenSSH do sistema**: cadeias de jump e proxies HTTP/SOCKS em sessões OpenSSH do sistema

### Melhorias
- **Atualização global de componentes de UI**: raios, sombras suaves e anéis de foco unificados em botões, entradas, popovers, painéis laterais, estados vazios e toasts
- **Painel lateral de IA refinado**: layout de Q&A, controles de modelo/permissão, spinner de pensamento quadrado e tipografia de entrada
- **Diálogo de changelog redesenhado**: versões recolhíveis, cores por seção e notas no idioma da UI

## [0.5.0] - 2026-07-17

### Funcionalidades
- **Painel de diagnóstico de fluxo Hex/Raw do terminal**: ativação opcional para inspecionar byte a byte a entrada/saída bruta da sessão, útil para depurar problemas de codificação e sequências de escape
- **Fonte de hosts JSON**: obtenção de inventários de hosts a partir de um arquivo JSON local ou endpoint HTTP(S) (estilo CMDB / Ansible / API personalizada); apenas metadados, inventários com segredos são rejeitados; cabeçalhos de autenticação HTTP suportados
- **Compartilhamento e importação de inventários de hosts**: exportação de inventários somente de metadados para passagem entre equipes (incluindo o formato Ansible YAML), importação da área de transferência
- **Modelos nomeados de espaços de trabalho**: salve vinculações de hosts, layouts divididos e comandos cwd/de inicialização opcionais como modelos, aplicáveis com um clique no alternador rápido
- **Marcadores de logs de conexão**: marcadores de posição de reprodução + notas + salto por busca; a lista de logs mostra a contagem de marcadores
- **Visão ao vivo dos canais de encaminhamento de portas**: origem, destino e estatísticas de bytes de tráfego por conexão para encaminhamentos locais/remotos/dinâmicos
- **Extensões de ações do gatilho onOutput de scripts**: ao casar um padrão de saída, pode disparar notificação de desktop, som, marcador de aba ou iniciar a gravação da sessão
- **Colagem segura e difusão precisa**: atraso de colagem multilinha / espera pelo prompt / confirmação de comandos perigosos; a difusão pode mirar precisamente espaço de trabalho/seleção/grupo/janela
- **Melhorias no canal OpenSSH do sistema**: GSSAPI/Kerberos e algoritmos pós-quânticos (PQ) suportados via OpenSSH do sistema; cadeias de jump e proxies HTTP/SOCKS disponíveis
- **KEX pós-quântico híbrido do ssh2 embutido**: prefere `mlkem768x25519-sha256` (ML-KEM-768 + X25519) com fallback clássico; não exige mais o ssh do sistema
- **Suporte a hosts RDP**: ativar RDP em hosts do Vault e iniciar o cliente de área de trabalho remota do sistema (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Registro de alterações segue o idioma da interface**: notas da versão no idioma atual da UI (10 idiomas)

### Windows ARM64
- **Instaladores win-arm64 agora incluem mosh / ET**: MoshMagies 0.1.9 e EternalTerminal 6.2.10 estreiam binários nativos Windows arm64
- **Canal de atualização automática dedicado para win-arm64**: os metadados de atualização passam ao canal dedicado `latest-arm64.yml` em vez de seguir as atualizações x64 (antes as atualizações arm64 instalavam o pacote x64 e rodavam em emulação)

## [0.4.10] - 2026-07-17

### Funcionalidades
- **Central de diagnóstico de conexões SSH**: "Testar conexão" no painel de edição do host + "Executar diagnóstico" quando a conexão falha, com verificações passo a passo de DNS / TCP / host de salto / chave do host / autenticação / SFTP
- **Agente SSH como autenticação de primeira classe**: os hosts podem escolher explicitamente a autenticação por agente, ver as impressões digitais das chaves no agente e definir uma identidade preferida; o log de conexão registra o método realmente usado
- **Instantâneo de saúde multi-host**: verificação em lote com um clique no Vault de latência, autenticação e carga/memória/disco; filtre hosts anômalos e execute scripts
- **Confiabilidade SFTP fase 1**: transferências retomáveis, novas tentativas automáticas com recuo, fila de transferências persistente (sobrevive a reinícios), verificação SHA-256 opcional
- **Onboarding produtizado**: guia de três passos para o primeiro Vault vazio; itens de comando do alternador rápido (configurações/importação/verificação de saúde etc.); dicas de migração no estado vazio; sugestões após a primeira conexão bem-sucedida; matriz de recursos no README

### Correções
- Usuários que atualizam um Vault existente não veem mais o guia de primeiro uso; as verificações de saúde fecham corretamente as conexões de salto quando a autenticação falha

## [0.4.9] - 2026-07-17

### Melhorias
- **Lançamentos e canal de atualização automática movidos para um repositório de publicação dedicado**: instaladores e metadados de atualização agora são publicados no repositório MgTerminal-releases; os downloads do site e a atualização automática no app permanecem iguais, e clientes antigos continuam recebendo atualizações via redirecionamentos dos URLs originais

## [0.4.8] - 2026-07-16

### Funcionalidades
- **Conexão rápida suporta EternalTerminal**: o assistente QuickConnect ganha uma entrada de protocolo ET (porta SSH + porta do serviço ET, padrão 2022); os binários cliente de ET correspondentes vêm incluídos (macOS / Linux / Windows x64)
- **Autoverificação de credenciais**: Configurações → Sistema → Proteção de credenciais ganha "Autoverificação" — uma sonda de ida e volta de criptografia/descriptografia mais uma varredura do repositório que lista as entradas exatas que este dispositivo não consegue descriptografar (hosts / chaves / identidades / grupos / proxies), facilitando localizar credenciais a redigitar após uma falha do chaveiro
- **Primeiro instalador Windows ARM64**: nova build win-arm64 (mosh / et ainda não incluídos; a atualização automática segue temporariamente o canal x64)
- **Limpeza de restaurações de sessão expiradas**: layouts de restauração com mais de 14 dias são descartados na inicialização, em vez de restaurar montes de espaços reservados obsoletos

### Correções
- **Interface russa: 203 textos ausentes preenchidos** (todo o namespace de scripts / automação / gravação caía para o inglês), mais 3 do chinês simplificado; um novo teste de paridade completa evita regressões
- A conexão rápida do Mosh coletava um caminho personalizado de mosh-server sem aplicá-lo; agora ele é gravado corretamente na configuração do host

### Melhorias
- A seleção total do SFTP (Cmd/Ctrl+A) e a renderização da lista agora compartilham uma única regra de visibilidade, eliminando desvios de comportamento com arquivos ocultos / termos de filtro
- As notas de macOS do README agora refletem o processo real de lançamento (sem assinatura, com etapas de liberação no Gatekeeper; atualizações no app não afetadas)

## [0.4.7] - 2026-07-15

### Funcionalidades
- **Idiomas da interface ampliados para 10**: cliente e site alinhados; adicionados 日本語 / 한국어 / Deutsch / Français / Español / Português (mantidos en / ru / zh-CN / zh-TW)
- Configurações → Aparência → Idioma oferece todos os idiomas suportados; textos não traduzidos ainda caem para o inglês

## [0.4.6] - 2026-07-15

### Segurança
- **Desativar a verificação de chaves de host SSH não é mais silencioso**: com `verifyHostKeys` desligado (sessões de terminal e conexões de estatísticas do mosh), um aviso explícito é registrado informando que qualquer chave de host está sendo aceita sem confirmação
- **Aviso persistente na página de configurações**: após desligar "Verificar chaves de host SSH", um alerta de risco de ataque intermediário permanece visível sob o interruptor (en / zh-CN / zh-TW). O padrão continua ligado

## [0.4.5] - 2026-07-15

### Correções
- **401 / fluxos vazios por texto cifrado aninhado**: salvar repetidamente durante uma falha do chaveiro envolvia as chaves em camadas de criptografia (`enc:v2(enc:v1(...))`); com o limite do laço de descriptografia corrigido, aninhamentos múltiplos dentro do orçamento são totalmente descriptografados — sem mais "descriptografou certo e descartou" nem falsas falhas de descriptografia
- **Uma credencial corrompida não derruba mais o carregamento de todo o repositório**: na falha de descriptografia de um campo, o valor armazenado é mantido como está (fail-soft), o repositório carrega normalmente e as chaves permanecem recuperáveis após o reparo do chaveiro
- **Chave de API da busca na web**: após uma falha de descriptografia, apenas focar/desfocar não apaga mais uma chave salva; adicionados avisos explícitos de falha de descriptografia/criptografia em vez de silêncio
- **Identificação do cifrado DPAPI do Windows corrigida**: a proteção contra dupla criptografia deixava passar chaves DPAPI (cabeçalho `AQAAAN`), que uma falha do chaveiro recriptografava em cifrado aninhado; corrigido
- **Cursor Agent**: na falha de descriptografia, o cifrado não é mais injetado como chave de API no processo filho
- Unificação das três áreas Provider / busca na web / Cursor das configurações: a falha de descriptografia pede claramente para reinserir a chave, e trocar o idioma da interface não sobrescreve mais uma chave não salva

## [0.4.4] - 2026-07-14

### Correções
- **IA 401 / fluxos vazios**: quando a descriptografia da chave de API falha ou a chave não sincronizou com o processo principal, as requisições não saem mais com o espaço reservado `__IPC_SECURED__`; falham imediatamente com um aviso para salvar a chave novamente
- O envio de mensagens aguarda a sincronização dos provedores com o processo principal, evitando falhas de autenticação por corrida
- Orientações claras de autenticação quando a chave local está inutilizável (falha de descriptografia / ausente / espaço reservado residual)

## [0.4.3] - 2026-07-14

### Correções
- **Descriptografia de chaves de API**: o processo principal descriptografa corretamente as chaves `enc:v2` do cofre local; em caso de falha, o cifrado não é mais enviado aos provedores como texto puro (evitando 401 e o sufixo `…5Q==`)
- **Reconhecimento de espaços reservados de credenciais**: as fronteiras de conexão / guardas de sincronização em nuvem também reconhecem `enc:v2`, evitando enviar o cifrado do cofre local como senha ou carregá-lo na sincronização
- Mensagens de erro acionáveis para fluxos vazios do modelo (`NoOutputGeneratedError`) e falhas de autenticação 401
- A detecção de instalação do SDK do Cursor passa a `require.resolve`, evitando falsos "não instalado"

## [0.4.2] - 2026-07-14

### Correções
- **Falhas de criptografia de chaves de API resolvidas de vez**: quando o chaveiro (safeStorage) está indisponível, um cofre criptografado local (`enc:v2`) é usado automaticamente; atualizações do app não impedem mais salvar chaves de API após a invalidação das ACL do chaveiro
- O macOS ainda tenta primeiro o chaveiro do sistema e recua silenciosamente na falha; Configurações → Sistema mostra o backend ativo

## [0.4.1] - 2026-07-14

### Melhorias
- Seletor de temas: prévias em cartões (fundo + cores primária/secundária), alternância de escopo Core / Todos, busca e estados vazios
- Os temas padrão Snow / Midnight ganham contraste e profundidade de cartões, com as paletas de terminal `ui-snow` / `ui-midnight` sincronizadas
- Estados de seleção e hierarquia visual unificados: hosts/árvore do Vault, lista/árvore/barra de abas do SFTP, navegação das configurações, barra lateral de IA, barra superior do terminal
- As listas de temas do terminal (diálogo / barra lateral) suportam busca e prévias de amostras de cor mais claras
- Cores fixas no código (status de sincronização, toasts informativos, selos de atualização, destaques de arrastar e soltar etc.) consolidadas em tokens de tema

## [0.4.0] - 2026-07-13

### Funcionalidades
- Downloads e atualizações acelerados para usuários na China: região detectada automaticamente com troca para um espelho nacional e retorno bidirecional ao GitHub
- "Novidades" das configurações agora mostra as notas de cada versão em um diálogo no app, sem redirecionar ao GitHub
- Nova entrada "Falar com o suporte" que copia o e-mail de contato
- A reconexão automática SSH passa a recuo exponencial (de 5 s até 60 s); após 10 falhas consecutivas, para e pede reconexão manual
- O encaminhamento de portas local/dinâmico reutiliza a conexão SSH do terminal já autenticada, dispensando uma segunda senha/2FA
- Importar chaves de segurança FIDO2 (sk-*) sugere mudar para a autenticação ssh-agent

### Alterações
- Removidas das configurações as duas entradas do GitHub "Relatar problema" e "Comunidade"

## [0.3.0] - 2026-07-13

### Correções
- Falhas de criptografia da chave de API ao salvar um provedor de IA não são mais engolidas em silêncio; um erro localizado claro aparece sob o campo da chave de API

## [0.2.9] - 2026-07-13

### Funcionalidades
- macOS suporta atualização automática: instala substituindo o bundle após o download, contornando as restrições do Squirrel para apps sem assinatura (a partir da 0.2.9, todas as plataformas podem atualizar automaticamente)

### Correções
- O ícone do app mantém a base arredondada do material oficial, consistente nos modos claro e escuro

## [0.2.8] - 2026-07-13

### Correções
- Pacote do Windows fechava silenciosamente ao iniciar: o afterPack reincorpora o hash de integridade após reescrever o asar, com verificação de CI contra recaídas
- O progresso e os erros da instalação de atualizações ficam visíveis em todas as plataformas

## [0.2.7] - 2026-07-13

### Correções
- O Windows publica um instalador x64 seguro em nível de arquitetura

## [0.2.6] - 2026-07-12

### Segurança
- A janela de bandeja empacotada ignora `VITE_DEV_SERVER_URL` e bloqueia navegação / novas janelas
- O preload não adiciona mais o servidor de desenvolvimento às origens confiáveis sob `app.asar`
- Substituições de dependências atualizadas para DOMPurify 3.3.2 e undici 6.23.0, corrigindo XSS alcançável / DoS de cadeia de descompressão
- O afterPack repara o hash de integridade dos arquivos ASAR e sincroniza o Info.plist, evitando travamento do macOS na inicialização

### Correções
- O teste de integração do login automático de Telnet agora espera pelo prompt de comando antes de verificar o evento de conclusão

## [0.2.5] - 2026-07-12

### Correções
- Oculta a entrada "código-fonte no GitHub" na seção Comunidade das configurações
- Os links de novidades / relato de problemas apontam para `JasonZhangDad/MgTerminal`, corrigindo 404
- Corrigido "Reiniciar agora" sem resposta: a saída para instalar a atualização não é mais cancelada pela verificação assíncrona de alterações no before-quit
- "Reiniciar e atualizar" mostra um aviso claro em caso de falha; plataformas sem instalação automática abrem a página de Releases

## [0.2.4] - 2026-07-12

### Segurança
- O salvamento de credenciais para quando a criptografia está indisponível; recuar para texto puro é proibido
- Links profundos SSH desativados por padrão, URLs contendo senhas são rejeitados e a conexão exige confirmação
- Área de transferência OSC52 desativada por padrão
- CSP do Electron endurecida, integridade ASAR e fusíveis de segurança ativados
- Removida a permissão disable-library-validation do macOS

## [0.2.3] - 2026-07-11

### Correções
- Corrigido: o nome de host `app://` empacotado era convertido para minúsculas pelo Chromium, fazendo o preload recusar a injeção do bridge do Electron e quebrando terminal, SFTP, configurações, seleção de arquivos e encaminhamento de portas
- Reconhecimento unificado de `app://magiesterminal` na janela principal, na de configurações e nas verificações de permissões, restaurando as permissões de área de transferência e fontes locais

## [0.2.2] - 2026-07-11

### Correções
- Detalhes do host "Select Color Theme": ScrollAreas aninhadas deixavam os cliques de tema sem resposta; mudança para rolagem de camada única com seleção por pointerdown
- Os diálogos de seleção de arquivo de chave SSH/chave local não estavam vinculados à janela pai, impedindo o macOS de exibi-los
- A janela Settings não abria sob o protocolo `app://`
- Os ícones da barra lateral e do instalador passam aos novos recursos de ícone

## [0.2.1] - 2026-07-11

### CI/CD
- Reativadas as builds automáticas de macOS e Windows (modo sem assinatura de código), oferecendo pacotes prontos para uso em mais plataformas.

## [0.2.0] - 2026-07-11

### Funcionalidades
- Corrigido o envio dos eventos IPC de atualização automática a uma única janela; agora são difundidos a todas (principal + configurações recebem)
- Unificadas as máquinas de estado da verificação manual e da atualização automática, eliminando três estados paralelos
- A "Verificação de atualizações" manual detecta versões pela API do GitHub e, ao encontrar atualização, dispara assincronamente o download do electron-updater
- Após clicar em "Verificar atualizações" na janela de configurações, o progresso do download aparece ao vivo na interface
- O app dispara automaticamente uma verificação do `electron-updater` 5 segundos após iniciar, sem clique manual
- Ao encontrar nova versão, o download começa automaticamente (`autoDownload=true`)
- Ao concluir o download, um toast persistente aparece; clicar em "Reiniciar agora" instala
- Se o download falhar, um toast de erro aparece com a alternativa "Abrir Releases"
- A barra de progresso de Settings > System mostra ao vivo o download automático, conduzida pelo `useUpdateCheck`
- Plataformas Linux deb/rpm/snap e outras sem suporte do electron-updater são puladas automaticamente, mantendo o comportamento de notificação pela API do GitHub

### Notas de design
- `broadcastToAllWindows` substitui o envio único `getSenderWindow`, garantindo que todas as janelas recebam os eventos IPC
- O campo `manualCheckStatus` acompanha o estado da verificação manual na interface (idle/checking/available/up-to-date/error) e é renderizado junto ao `autoDownloadStatus` por prioridade
- `SettingsSystemTab` não mantém mais estado local de atualização; recebe unidirecionalmente os dados unificados do `useUpdateCheck`
- Os dois sistemas antes independentes (notificações pela API do GitHub + download manual do electron-updater) fundem-se em uma máquina de estados: `useUpdateCheck` é a única fonte de verdade que conduz o toast do `App.tsx` e a barra de progresso do `SettingsSystemTab`
- Os ouvintes IPC persistentes globais são registrados uma única vez em `autoUpdateBridge.init()`, evitando registrar/limpar ouvintes a cada solicitação de download manual
- `autoInstallOnAppQuit=false`: sem instalação silenciosa, o reinício é acionado pelo usuário

### Alterações de interface（SettingsSystemTabProps）
- Removidos: `autoDownloadStatus`, `downloadPercent`
- Adicionados: `updateState` (UpdateState completo), `checkNow`, `installUpdate`, `openReleasePage`

### Observações
- Semântica de `checkNow`: usa a API do GitHub (`performCheck`) para detectar novas versões; havendo atualização e o electron-updater ainda não tendo começado o download, dispara assincronamente `bridge.checkForUpdate()` para iniciar o fluxo de download automático
- Este recurso só vale para apps empacotados (Windows NSIS, macOS dmg/zip, Linux AppImage); o modo dev requer `forceDevUpdateConfig=true` + `dev-app-update.yml` para testes (ver `.gitignore`)
- O antigo toast `hasUpdate` é suprimido enquanto `autoDownloadStatus !== 'idle'`, evitando duplicidade com o novo toast

### Melhorias de CI / build
- Builds de macOS / Windows puladas (exigem certificados pagos de assinatura de código), com foco em pacotes Linux gratuitos
- Atualização do compilador Linux x64 (AlmaLinux 8): Clang preferido, com gcc-toolset-13 como alternativa
- Atualização do compilador Linux arm64 (Debian Bullseye): de `build-essential` para `clang-14 + lld-14`
- O job de release não depende mais das builds de macOS/Windows; pushes de tag publicam a release diretamente dos artefatos Linux
- Validação suavizada dos artefatos deb: arquivos não encontrados emitem aviso em vez de erro, evitando que pulos de plataforma quebrem a CI
