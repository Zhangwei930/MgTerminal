# Journal des modifications


## [0.5.28] - 2026-07-24

### Fonctionnalités
- **Centre de diagnostic** : Paramètres → Système propose désormais une carte « Diagnostic » qui regroupe les journaux de plantage, l'historique des connexions (anonymisé) et l'audit d'approbation IA en un rapport JSON à copier ou exporter en un clic ; les limites d'erreur du rendu ainsi que les exceptions non gérées/rejets de promesses globaux sont désormais aussi consignés dans le journal de plantage — ce lien manquait auparavant
- **Journal des appels MCP / CLI** : Enregistre chaque appel du CLI local (magies-terminal-tool-cli) ou d'un client MCP — uniquement le nom de la méthode, le résultat et la durée, jamais les arguments ; conservé 30 jours avec rotation automatique et inclus dans l'export du centre de diagnostic

## [0.5.27] - 2026-07-23

### Fonctionnalités
- **Client de base de données léger**: le coffre prend désormais en charge un type de connexion à une base de données — connectez-vous à MySQL, PostgreSQL, SQL Server ou Oracle via un tunnel d'hôte SSH déjà enregistré, sans avoir à exposer le port de la base de données sur le serveur; l'ouverture d'une connexion à une base de données ouvre un nouvel onglet tout comme une session de terminal, avec un éditeur SQL intégré et un tableau de résultats de requête; les mots de passe de base de données réutilisent le même chiffrement du coffre que les mots de passe d'hôte, au lieu d'être stockés en texte brut dans le stockage local

## [0.5.26] - 2026-07-23

### Fonctionnalités
- **Ajouter un hôte depuis le menu contextuel du groupe**: le menu contextuel d'un groupe dans l'arborescence des hôtes propose désormais « Nouvel hôte », qui préremplit le groupe du nouvel hôte au lieu de passer par le bouton du haut puis de choisir le groupe manuellement

### Améliorations
- **L'animal de bureau au repos marche désormais au lieu de respirer sur place**: l'animation de repos fait aller l'animal de gauche à droite dans sa fenêtre flottante, avec un rebond de pas et un demi-tour retourné à chaque extrémité; le personnage par défaut n'ayant pas de feuille de sprites de marche, le mouvement est une illusion obtenue par transformation CSS pure
- **Le graphique temps réel du moniteur redessiné en panneau HUD néon**: le graphique de l'onglet aperçu passe d'une ligne lissée à une ligne en escalier, sur un fond étoilé sombre fixe avec une lueur à deux couches plus forte et un anneau radar pulsé qui s'étend sur le dernier échantillon de chaque série

## [0.5.25] - 2026-07-22

### Fonctionnalités
- **Animal de bureau**: activez-le dans Réglages → IA → Animal, et un animal flottant déplaçable apparaît n'importe où à l'écran, s'animant selon l'état de l'IA — respiration au repos, rebond pendant l'exécution, balancement en attente de votre approbation, signe de la main à la fin, tremblement en cas d'échec. Comme l'animal a rarement le focus système, la limitation d'animation d'Electron pour les fenêtres non focalisées a été spécifiquement désactivée pour lui, afin qu'il ne paraisse pas figé
- **Interactions directes**: cliquer ouvre/active le panneau de chat IA, en sautant si possible vers la session de terminal occupée; double-clic active la fenêtre principale; clic droit ouvre un menu pour exécuter une commande configurée dans les réglages, ouvrir les réglages IA, réinitialiser la position de l'animal ou le masquer; le survol affiche une bulle de statut plus détaillée
- **Apparence personnalisée**: vous pouvez importer votre propre image ou feuille de sprites, avec des plages d'images par statut (repos/exécution/attente/terminé/échec) pour les feuilles de sprites; taille, opacité, toujours au premier plan et visibilité de la bulle sont réglables
- **Mode privé et alertes de fin**: le mode privé limite la bulle à un statut générique comme « en cours » plutôt que de nommer l'outil actif; les tâches de 10 secondes ou plus peuvent déclencher une notification de bureau optionnelle à la fin ou en cas d'échec
- **Persistance de la position et prise en charge multi-écrans**: l'animal se souvient de l'endroit où vous l'avez déplacé, même après redémarrage ou réactivation; il revient automatiquement au coin par défaut si un écran est déconnecté ou change de résolution

## [0.5.24] - 2026-07-22

### Corrections
- **La sonde de bilan de santé n'avait en réalité jamais lu de fichier de clé** : la fonction asynchrone de lecture de clé privée était appelée sans `await`, si bien qu'elle examinait une Promise non résolue au lieu du contenu du fichier, et chaque clé était silencieusement jugée « pas une clé privée ». Tout hôte reposant sur un fichier de clé local plutôt que sur une clé stockée en ligne échouait invariablement au bilan de santé, alors que la même connexion fonctionnait très bien dans le terminal
- **Un échec de déchiffrement local n'est plus signalé comme une connexion refusée** : un mot de passe ou une clé encore sous forme de substitut chiffré était vidé avant la sonde, si bien que le serveur refusait naturellement une connexion sans aucun identifiant. Le bilan reconnaît désormais « des identifiants sont configurés mais cet appareil ne peut pas les déchiffrer » et oriente vers le déverrouillage du coffre ou la réparation du stockage sécurisé
- **Une clé d'hôte non approuvée ne se fait plus passer pour un échec d'authentification** : la sonde retenait déjà toutes les méthodes d'authentification lorsque la clé de l'hôte est inconnue ou a changé, mais ne le signalait jamais au panneau. Un statut dédié « clé d'hôte non vérifiée » s'affiche désormais, suggérant de se connecter une fois manuellement pour établir la confiance
- **L'avis « clé chiffrée ignorée » ne dépend plus du hasard** : il n'apparaissait auparavant que si aucune méthode d'authentification n'avait été tentée, mais toute machine avec un agent SSH actif essaie toujours l'agent en premier, ce qui empêchait presque toujours cet avis de se déclencher
- **Le bilan de santé réutilise désormais la phrase de passe de clé enregistrée lors d'une connexion interactive** : cette phrase de passe ne s'appliquait auparavant qu'aux connexions normales et n'était jamais consultée par le bilan de santé, si bien qu'une clé protégée par phrase de passe, parfaitement fonctionnelle dans le terminal, échouait toujours au bilan de santé

## [0.5.23] - 2026-07-22

### Corrections
- **Le script de thème au démarrage n'avait jamais été exécuté** : il applique le thème, la couleur d'accentuation et la langue enregistrés avant l'affichage, mais en tant que bloc en ligne la CSP refusait de l'exécuter, d'où un éclair de couleurs erronées au lancement. Il est désormais dans son propre fichier, sans assouplir la politique de sécurité
- **frame-ancestors est maintenant transmis par en-tête** : le navigateur ignore cette directive dans une CSP en `<meta>`, elle ne faisait donc rien. Elle provient à présent des en-têtes app:// et du serveur de développement, avec un nouveau test qui échoue si un script en ligne réapparaît

### Fonctionnalités
- **Lecture des enregistrements cast** : l'application savait enregistrer en asciinema cast v2 sans jamais pouvoir les ouvrir. Lecture, pause, navigation et 1x/2x/4x ; un enregistrement interrompu ignore ses lignes endommagées et en indique le nombre au lieu de refuser le fichier
- **Recherche dans un journal de session** : Cmd/Ctrl+F dans la visionneuse, indépendante de la recherche du terminal en cours
- **Octets par ligne dans le panneau hexadécimal** : bascule entre 8 / 16 / 32, la sortie déjà capturée est réagencée immédiatement
- **Filtrer les notes de version par catégorie** : puces sécurité / fonctionnalités / corrections / améliorations avec leur nombre d'entrées

### Améliorations
- **Suppression de déclarations sans effet possible** : du code défini et jamais appelé, dont une permission d'équipe jamais vérifiée mais affichée comme existante, un champ de groupe sans effet une fois défini, et un analyseur d'invitation WAN dupliquant l'implémentation du processus principal et ne pouvant jamais être chargé
- **Couverture du point d'ancrage des signets** : la conversion décalage d'octets vers numéro de ligne est fixée sur CRLF, hors plage et aller-retour exact

## [0.5.22] - 2026-07-21

### Sécurité
- **Les signatures d'audit d'équipe sont réellement vérifiées** : une coche s'affichait dès qu'un champ `sig` était présent, sans aucune vérification ; chaque entrée est désormais validée par HMAC et signalée comme vérifiée, altérée, non signée ou invérifiable
- **Les sondes ne ramènent plus d'identifiants** : le test de connexion au proxy renvoie un code d'erreur plutôt que le message d'origine (HTTP CONNECT renvoie `Proxy-Authorization`, ProxyCommand la ligne de commande) ; le mappage de champs d'une source ne peut pas contourner le contrôle des secrets de l'inventaire

### Fonctionnalités
- **Renommage par lot en SFTP** : modèles `{name}` / `{ext}` / `{n}` avec remplissage de zéros ; le lot entier est planifié et prévisualisé avant exécution, et tout doublon de nom ou collision avec un fichier non concerné annule l'ensemble
- **Modification groupée des champs d'hôtes** : nom d'utilisateur, groupe, port et étiquettes pour toute une sélection ; les étiquettes s'ajoutent au lieu de remplacer la liste, un champ vide signifie inchangé, et les hôtes gérés par une source de données sont exclus avec leur nombre
- **Recherche d'hôtes structurée** : filtres `tag:` `user:` `group:` `host:` mêlés au texte libre ; un terme n'est un filtre que si un nom de champ connu précède les deux-points, de sorte que les adresses IPv6 et les libellés contenant un deux-points pleine chasse ne sont pas affectés
- **Aide-mémoire des raccourcis via F1** : consultable, groupé par catégorie et lu depuis les raccourcis réellement actifs ; il s'agit lui-même d'un raccourci ordinaire et reconfigurable
- **Envoi hexadécimal sur le port série** : les octets sont écrits tels quels sur l'appareil en contournant l'encodeur de jeu de caractères, avec aperçu des octets et lecture ASCII
- **Mappage des champs d'une source de données** : associer des noms tels que `name` / `ip` / `ssh_port` aux champs canoniques, pour des inventaires externes non modifiables
- **Accès à des capacités déjà présentes** : envoyer une commande à une fenêtre tmux, tester une connexion proxy, reconnaître le certificat lors de l'import d'une clé et proposer les chemins de modules PKCS#11

### Corrections
- **L'import du coffre d'équipe ne signale plus une fausse réussite** : l'import d'un paquet annonçait « N hôtes importés » tout en les rejetant, et la liste restait inchangée ; les hôtes arrivent désormais réellement dans le coffre, le nombre annoncé correspond au résultat réel, et l'ajout n'écrase ni les modifications locales ni les identifiants
- **Les codes d'invitation WAN permettent de rejoindre** : les invitations `magies-follow:2:` étaient toujours analysées comme du LAN et échouaient avec `version`, alors que l'interface proposait explicitement de les accepter ; le transport est maintenant choisi selon la version de l'invitation
- **L'export d'hôtes respecte la sélection** : après avoir coché une partie des hôtes, tous étaient malgré tout exportés
- **Les libellés longs ne débordent plus des menus** : des largeurs fixes poussaient les entrées les plus longues hors du menu et réduisaient leurs icônes à zéro ; trois options du menu de tri débordaient en français
- **L'envoi de commande tmux est accessible** : l'action exigeait un numéro de panneau que l'interface ne pouvait pas fournir, la fonction existait donc sans pouvoir être déclenchée

### Améliorations
- **Les transferts SFTP affichent le temps restant** : absent lorsque le débit est inconnu, et omis pour les lignes de répertoire dont le total compte des fichiers
- **Fraîcheur de la synchronisation dans la barre supérieure** : le survol indique quand les données ont réellement été enregistrées pour la dernière fois, sans ouvrir le panneau
- **Les conversations IA exportées conservent le raisonnement** : replié en Markdown, indenté en texte brut, avec la durée
- **Confort des réglages IA** : les messages rapides disposent d'une recherche, et lorsqu'un modèle local ne présente pas d'appel d'outils, la conséquence est expliquée
- **Les rapports de plantage indiquent ce qui a été envoyé** : comptabilisé seulement après un envoi réussi, les échecs et doublons ne gonflent pas le compteur
- **Les actions sur les processus et tmux utilisent la boîte de dialogue interne** : plus de fenêtres système, la confirmation suit le thème de l'application
- **Le mobile passe par les contrôles qualité** : `mobile/` était entièrement exclu du lint et des tests, et son test n'avait jamais été exécuté par la CI

## [0.5.21] - 2026-07-21

### Sécurité
- **Nettoyage profond du contexte hôte** : supprime récursivement mots de passe, mots de passe Telnet, clés privées et phrases secrètes des objets et tableaux imbriqués
- **Portée de session des capacités publiques** : chaque capacité publique applique une validation fail-closed et ne peut pas sortir des sessions exposées au chat courant
- **Lectures sensibles et audit d’approbation** : Pod describe devient une Sensitive Read ; le processus principal conserve uniquement les métadonnées d’approbation, sans arguments ni identifiants

### Fonctionnalités
- **Confidentialité locale stricte et test du modèle** : services de modèle loopback uniquement, agents externes/recherche web désactivés et vérification des appels d’outils
- **Gestion Docker Compose** : inspection des projets/services et actions explicites up, restart et down
- **Opérations Kubernetes étendues** : Events structurés, état/historique/redémarrage de rollout, Agent Exec, Exec interactif et Port Forward loopback

### Corrections
- **Listes Kubernetes en JSON** : Namespaces, Pods et Deployments ne dépendent plus de tableaux instables, et les erreurs kubectl sont affichées directement
- **Paquets multiplateformes** : corrige le crash Apple Silicon après les Fuses sans Developer ID payant ; Android aligne JDK 21, SDK/Build Tools 36 et v0.5.21

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

### Améliorations
- **Mise en page chat IA style Claude** : colonne de lecture centrée (~44rem) avec typo plus grande ; bulles utilisateur douces et prose assistant sans cadre ; en-tête minimal et compositeur arrondi ; bouton d’envoi circulaire foreground/background ; état vide, récents, thinking et outils plus discrets

## [0.5.17] - 2026-07-20

### Améliorations
- **Réorganisation des boutons-icônes de barre d'outils** : outils d'en-tête vault en cluster thématique ; hauteurs/espacements unifiés ; bande multi-sélection et utilitaires top-tab groupés

## [0.5.16] - 2026-07-20

### Améliorations
- **Thèmes multi-couleurs plus accessibles** : core avec **Claude orange / White / Black** et bleu, vert, violet, rose, ambre, ciel ; bandeau de pastilles en un clic dans Apparence

## [0.5.15] - 2026-07-20

### Améliorations
- **Orange Claude par défaut** : thèmes clairs/sombres par défaut en orange chaud inspiré d'Anthropic/Claude ; Claude en tête de la liste core, **Pure Black** toujours disponible ; thèmes terminal follow-app alignés

## [0.5.14] - 2026-07-20

### Améliorations
- **Refonte des icônes et composants IA** : badges agent/fournisseur en dégradé ; cartes d'appels d'outils avec icônes de catégorie ; barre d'approbation et puces d'état renforcées ; cartes d'artefacts vault/terminal unifiées ; sélecteur slash et menu d'export iconisés

## [0.5.13] - 2026-07-20

### Améliorations
- **Refonte du panneau latéral IA** : lavis ambiant et micro-grille ; en-tête verre + bouton Nouvelle conversation primary ; bulles utilisateur solid primary et cartes assistant avec rail primary ; compositeur flottant avec halo de focus ; état vide, sessions récentes, groupes d'outils, blocs de réflexion et menu agent mis à jour

## [0.5.12] - 2026-07-20

### Améliorations
- **Refonte UI clairement visible** : barre latérale vault avec pastille primary solide pour l'élément actif ; cartes grille d'hôtes avec barre primary, soulèvement et lueur au survol ; contraste scène/sidebar renforcé ; navigation des paramètres en primary solide ; onglets Vault/SFTP avec soulignement primary ; titres de section en petites capitales avec pastilles d'icône

## [0.5.11] - 2026-07-20

### Améliorations
- **Rafraîchissement UI client aligné sur le thème** : chrome de l'application, barre latérale/scène du vault, fenêtre des paramètres et primitives UI partagées suivent mieux le thème actif — navigation en accent primaire, superpositions verre, élévation plus douce, focus et profondeur affinés pour boutons, champs, dialogues, onglets, interrupteurs, états vides et panneaux latéraux

## [0.5.10] - 2026-07-19

### Corrections
- **Superposition de la boîte de dialogue « Nouveautés » trop sombre**: la boîte de dialogue « Nouveautés » assombrissait tellement la fenêtre Paramètres que la navigation de gauche était presque illisible ; l'opacité et le flou de sa superposition sont désormais réduits pour que la navigation en arrière-plan reste lisible (seule cette boîte de dialogue est concernée)

## [0.5.9] - 2026-07-19

### Corrections
- **Impossible de fermer la boîte de dialogue**: les boîtes de dialogue ouvertes dans la fenêtre Paramètres (par ex. le journal « Nouveautés ») ne pouvaient pas être fermées — le X en haut à droite chevauchait la zone de déplacement de la barre de titre, donc les clics étaient interprétés comme un déplacement de la fenêtre. Toutes les boîtes de dialogue sont désormais exclues de cette zone et le X ferme correctement

## [0.5.8] - 2026-07-19

### Sécurité
- **Renforcement de l'IPC de fichiers locaux**: les gestionnaires IPC de lecture/écriture/suppression/énumération de fichiers locaux valident désormais l'expéditeur du renderer appelant et rejettent les contextes webview/invité, afin qu'un XSS du renderer ne puisse pas dégénérer en accès arbitraire aux fichiers locaux (défense en profondeur)
- **Renforcement des dépendances**: toutes les alertes de gravité élevée de l'arbre de dépendances de production corrigées : fast-uri → 4.1.1, fast-xml-parser → 5.10.1, fast-xml-builder → 1.3.0, hono → 4.12.31 ; et, limité au sous-arbre @cursor/sdk, node-gyp → 11.4.2 et tar → 7.5.20 (portée restreinte pour ne pas affecter les builds natifs)

## [0.5.7] - 2026-07-18

### Fonctionnalités
- **Rapports de plantage anonymes (opt-in)** : désactivé par défaut ; une fois activé dans Paramètres → Système, des résumés de plantage assainis (sans chemins, noms d'utilisateur, noms d'hôte ni données de session) sont envoyés pour corriger les plantages plus vite

## [0.5.6] - 2026-07-18

### Sécurité
- **En-tête d’authentification d’inventaire HTTP chiffré** : l’en-tête d’authentification (Authorization / clé API) des sources json_http n’est plus stocké en clair ; il utilise désormais le chiffrement au niveau du champ du vault, et les valeurs en clair existantes sont migrées au premier lancement après la mise à jour
- **Renforcement des dépendances** : undici → 6.27.0, DOMPurify → 3.4.12, uuid → 13.0.2, corrigeant les avis de XSS atteignable et de request smuggling / DoS que les overrides obsolètes touchaient encore

## [0.5.5] - 2026-07-18

### Corrections
- **Faux toasts « Échec de la mise à jour »** : les erreurs de phase de vérification ne sont plus traitées comme des échecs de téléchargement ; état in-flight nettoyé après chaque contrôle IPC
- **Canal de mise à jour Windows arm64** : utiliser `latest-arm64.yml` pour ne pas télécharger les installateurs x64
- **Chemin de contrôle/téléchargement plus fiable** : dual-feed et machine d’état UI pour moins de fausses erreurs en contrôles concurrents

## [0.5.4] - 2026-07-18

### Sécurité
- **Frontière de déverrouillage Vault** : désactivation/changement de PIN et WebAuthn exigent le déverrouillage ou le PIN actuel ; limitation des essais
- **Diagnostics SSH / santé** : arrêt avant auth si clé hôte unknown/changed pour ne jamais envoyer le mot de passe à un MITM
- **Suivi de session** : scellage AES-GCM E2E avec le jeton d’invitation ; relay opaque ; rejet du faux wss/ws TLS
- **IPC des identifiants** : validation du sender pour le déverrouillage vault et encrypt/decrypt
- **Temp / RDP / deep links / journaux / pièces jointes IA** : 0700+symlink-safe, nettoyage cmdkey immédiat si RDP échoue, confirmation Telnet/JMS, pas de log des réponses kbd-int, plafonds de taille des pièces jointes

### Corrections
- Health keyboard-interactive ; défilement des notes de version
- Envoi IA pièces jointes seules ; SFTP/port-forward honorent verifyHostKeys

### Ingénierie
- Ajout de `npm run typecheck` ; premier lot d’erreurs de type production (vault/WebAuthn/update/SFTP)

## [0.5.3] - 2026-07-18

### Corrections
- **Défilement des notes de version** : les notes longues peuvent défiler dans la fenêtre du dialogue

### Améliorations
- Libellé du nombre de changements de la dernière version corrigé ; chaînes « Nouveautés » complétées pour les 10 langues d’interface

## [0.5.2] - 2026-07-18

### Fonctionnalités
- **Coffre d’équipe local-first** : paquets d’inventaire hôtes métadonnées uniquement, rôles (owner/editor/viewer) et audit signé HMAC ; mots de passe et clés privées ne quittent pas l’appareil
- **Suivi de session via relais WAN** : relais TCP NDJSON compatible NAT ; relais local intégré ou `scripts/follow-relay.cjs` auto-hébergé
- **Déverrouillage Vault par passkey d’appareil** : authentificateurs WebAuthn (Touch ID / Windows Hello / clé de sécurité) vérifiés dans le processus principal ; pas de sync multi-appareils cloud
- **KEX post-quantique hybride ssh2 intégré** : privilégie `mlkem768x25519-sha256`, repli classique si non pris en charge
- **Prise en charge des hôtes RDP** : lancement du client bureau à distance système depuis le Vault (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Saut et proxy OpenSSH système** : chaînes de jump et proxies HTTP/SOCKS pour les sessions OpenSSH système

### Améliorations
- **Rafraîchissement global des composants UI** : rayons, ombres douces et anneaux de focus unifiés pour boutons, champs, popovers, panneaux latéraux, états vides et toasts
- **Panneau latéral IA peaufiné** : mise en page Q&R, contrôles modèle/permission, spinner de réflexion carré et typographie de saisie
- **Dialogue journal des versions repensé** : versions repliables, couleurs par section et notes selon la langue de l’interface

## [0.5.0] - 2026-07-17

### Fonctionnalités
- **Panneau de diagnostic Hex/Raw du terminal** : activation optionnelle pour inspecter octet par octet les entrées/sorties brutes de la session, pratique pour déboguer les problèmes d'encodage et de séquences d'échappement
- **Source d'hôtes JSON** : récupération d'inventaires d'hôtes depuis un fichier JSON local ou un point de terminaison HTTP(S) (style CMDB / Ansible / API personnalisée) ; métadonnées uniquement, les inventaires contenant des secrets sont rejetés ; en-têtes d'authentification HTTP pris en charge
- **Partage et import d'inventaires d'hôtes** : export d'inventaires ne contenant que des métadonnées pour la passation d'équipe (y compris au format Ansible YAML), import depuis le presse-papiers
- **Modèles d'espaces de travail nommés** : enregistrez les liaisons d'hôtes, les dispositions fractionnées et les commandes cwd/de démarrage optionnelles comme modèles, applicables en un clic depuis le sélecteur rapide
- **Signets de journaux de connexion** : signets de position de relecture + notes + saut par recherche ; la liste des journaux affiche le nombre de signets
- **Vue en direct des canaux de redirection de ports** : source, cible et statistiques d'octets de trafic par connexion pour les redirections locales/distantes/dynamiques
- **Extensions d'actions de déclencheur onOutput des scripts** : un motif de sortie détecté peut déclencher une notification de bureau, un son, un marqueur d'onglet ou le démarrage de l'enregistrement de session
- **Collage sécurisé et diffusion précise** : délai de collage multiligne / attente d'invite / confirmation des commandes dangereuses ; la diffusion peut cibler précisément l'espace de travail/la sélection/le groupe/la fenêtre
- **Améliorations des canaux OpenSSH système** : GSSAPI/Kerberos et algorithmes post-quantiques (PQ) pris en charge via l'OpenSSH du système ; chaînes de saut et proxies HTTP/SOCKS disponibles
- **KEX post-quantique hybride ssh2 intégré** : préfère `mlkem768x25519-sha256` (ML-KEM-768 + X25519) avec repli classique ; n'exige plus le ssh système
- **Prise en charge des hôtes RDP** : activer RDP sur les hôtes du coffre et lancer le client Bureau à distance du système (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Journal des modifications selon la langue de l'interface** : notes de version dans la langue d'interface actuelle (10 langues)

### Windows ARM64
- **Les installateurs win-arm64 embarquent désormais mosh / ET** : MoshMagies 0.1.9 et EternalTerminal 6.2.10 inaugurent les binaires natifs Windows arm64
- **Flux de mise à jour automatique dédié pour win-arm64** : les métadonnées de mise à jour passent par le canal dédié `latest-arm64.yml` au lieu de suivre les mises à jour x64 (auparavant, les mises à jour arm64 installaient le paquet x64 et tournaient en émulation)

## [0.4.10] - 2026-07-17

### Fonctionnalités
- **Centre de diagnostic des connexions SSH** : « Tester la connexion » dans le panneau d'édition d'hôte + « Lancer le diagnostic » en cas d'échec, avec vérifications pas à pas de DNS / TCP / hôte de rebond / clé d'hôte / authentification / SFTP
- **L'agent SSH comme méthode d'authentification de premier rang** : les hôtes peuvent choisir explicitement l'authentification par agent, consulter les empreintes des clés de l'agent et désigner une identité préférée ; le journal de connexion note la méthode réellement utilisée
- **Instantané de santé multi-hôtes** : vérification groupée en un clic depuis le Vault de la latence, de l'authentification et de la charge/mémoire/disque ; filtrez les hôtes anormaux et exécutez des scripts
- **Fiabilité SFTP phase 1** : reprise des transferts, nouvelles tentatives avec repli automatique, file de transfert persistante (survit aux redémarrages), vérification SHA-256 optionnelle
- **Accueil produit** : guide en trois étapes pour un premier Vault vide ; éléments de commande du sélecteur rapide (paramètres/import/bilan de santé, etc.) ; indications de migration à l'état vide ; conseils après la première connexion réussie ; matrice des fonctionnalités du README

### Corrections
- Les utilisateurs mettant à niveau un Vault existant ne voient plus le guide de premier lancement ; les bilans de santé ferment correctement les connexions de rebond en cas d'échec d'authentification

## [0.4.9] - 2026-07-17

### Améliorations
- **Publications et flux de mise à jour automatique déplacés vers un dépôt de publication dédié** : les installateurs et métadonnées de mise à jour sont désormais publiés dans le dépôt MgTerminal-releases ; les téléchargements du site et la mise à jour automatique intégrée restent inchangés, et les anciens clients continuent de recevoir les mises à jour via des redirections depuis les URL d'origine

## [0.4.8] - 2026-07-16

### Fonctionnalités
- **La connexion rapide prend en charge EternalTerminal** : l'assistant QuickConnect ajoute une entrée de protocole ET (port SSH + port de service ET, 2022 par défaut) ; les binaires clients ET correspondants sont embarqués (macOS / Linux / Windows x64)
- **Autodiagnostic des identifiants** : Paramètres → Système → Protection des identifiants ajoute un « Autodiagnostic » — sonde d'aller-retour chiffrement/déchiffrement plus analyse du magasin d'identifiants listant précisément les entrées indéchiffrables sur cet appareil (hôtes / clés / identités / groupes / proxys), pour repérer facilement les identifiants à ressaisir après une panne du trousseau
- **Premier installateur Windows ARM64** : nouvelle build win-arm64 (mosh / et pas encore embarqués ; la mise à jour automatique suit temporairement le flux x64)
- **Nettoyage des restaurations de session expirées** : les dispositions de restauration de plus de 14 jours sont éliminées au démarrage au lieu de restaurer une masse d'espaces réservés obsolètes

### Corrections
- **Interface russe : 203 textes manquants complétés** (tout l'espace de noms scripts / automatisation / enregistrement retombait en anglais), plus 3 pour le chinois simplifié ; un nouveau test de parité complète empêche les régressions
- La connexion rapide Mosh collectait un chemin mosh-server personnalisé sans l'appliquer ; il est désormais correctement écrit dans la configuration de l'hôte

### Améliorations
- La sélection totale SFTP (Cmd/Ctrl+A) et le rendu de liste partagent désormais une règle de visibilité unique, éliminant les dérives de comportement avec fichiers cachés / termes de filtrage
- Les notes macOS du README correspondent au processus de publication réel (non signé, avec étapes de contournement de Gatekeeper ; mises à jour intégrées non affectées)

## [0.4.7] - 2026-07-15

### Fonctionnalités
- **Langues d'interface étendues à 10** : client et site alignés ; ajout de 日本語 / 한국어 / Deutsch / Français / Español / Português (en / ru / zh-CN / zh-TW existants conservés)
- Paramètres → Apparence → Langue propose toutes les langues prises en charge ; les textes non traduits retombent toujours en anglais

## [0.4.6] - 2026-07-15

### Sécurité
- **La désactivation de la vérification des clés d'hôte SSH n'est plus silencieuse** : avec `verifyHostKeys` désactivé (sessions de terminal et connexions de statistiques mosh), un avertissement explicite est journalisé indiquant que n'importe quelle clé d'hôte est acceptée sans confirmation
- **Avertissement permanent sur la page des paramètres** : après désactivation de « Vérifier les clés d'hôte SSH », un avis de risque d'attaque de l'homme du milieu reste affiché sous l'interrupteur (en / zh-CN / zh-TW). Activé par défaut

## [0.4.5] - 2026-07-15

### Corrections
- **401 / flux vides causés par du chiffré imbriqué** : des enregistrements répétés pendant une panne du trousseau enveloppaient les clés de couches de chiffrement (`enc:v2(enc:v1(...))`) ; la limite de la boucle de déchiffrement corrigée, les imbrications multiples dans le budget se déchiffrent entièrement — plus de « déchiffré puis jeté » ni de fausses erreurs de déchiffrement
- **Un identifiant corrompu ne bloque plus le chargement de tout le magasin** : en cas d'échec de déchiffrement d'un champ, la valeur stockée est conservée telle quelle (fail-soft), le magasin se charge normalement et les clés restent récupérables après réparation du trousseau
- **Clé API de recherche Web** : après un échec de déchiffrement, un simple focus/défocus ne supprime plus une clé enregistrée ; ajout d'avis explicites d'échec de déchiffrement/chiffrement au lieu du silence
- **Détection du chiffré DPAPI Windows corrigée** : le garde anti-double-chiffrement manquait les clés DPAPI (en-tête `AQAAAN`), qu'une panne de trousseau re-chiffrait en chiffré imbriqué ; corrigé
- **Cursor Agent** : en cas d'échec de déchiffrement, le chiffré n'est plus injecté comme clé API dans le processus enfant
- Unification des trois zones Provider / recherche Web / Cursor des paramètres : l'échec de déchiffrement invite clairement à ressaisir la clé, et le changement de langue d'interface n'écrase plus une clé non enregistrée

## [0.4.4] - 2026-07-14

### Corrections
- **IA 401 / flux vides** : quand le déchiffrement de la clé API échoue ou que la clé n'est pas synchronisée vers le processus principal, les requêtes ne partent plus avec l'espace réservé `__IPC_SECURED__` ; elles échouent immédiatement avec invitation à réenregistrer la clé
- L'envoi de messages attend la synchronisation des fournisseurs vers le processus principal, évitant les échecs d'authentification dus aux courses
- Indications d'authentification claires quand la clé locale est inutilisable (échec de déchiffrement / manquante / espace réservé résiduel)

## [0.4.3] - 2026-07-14

### Corrections
- **Déchiffrement des clés API** : le processus principal déchiffre correctement les clés `enc:v2` du coffre local ; en cas d'échec, le chiffré n'est plus envoyé aux fournisseurs comme du texte clair (évitant les 401 et le suffixe `…5Q==`)
- **Reconnaissance des espaces réservés d'identifiants** : les frontières de connexion / gardes de synchronisation cloud reconnaissent aussi `enc:v2`, empêchant d'envoyer le chiffré du coffre local comme mot de passe ou de le téléverser vers la synchronisation
- Messages d'erreur exploitables pour les flux vides du modèle (`NoOutputGeneratedError`) et les échecs d'authentification 401
- La détection d'installation du SDK Cursor passe à `require.resolve`, évitant les faux « non installé »

## [0.4.2] - 2026-07-14

### Corrections
- **Échecs de chiffrement des clés API résolus une fois pour toutes** : quand le trousseau (safeStorage) est indisponible, un coffre chiffré local (`enc:v2`) est utilisé automatiquement ; les mises à jour de l'application ne rendent plus les clés API insauvegardables après invalidation des ACL du trousseau
- macOS essaie toujours d'abord le trousseau système et se replie silencieusement en cas d'échec ; Paramètres → Système affiche le backend actif

## [0.4.1] - 2026-07-14

### Améliorations
- Sélecteur de thèmes : aperçus en cartes (arrière-plan + couleurs primaire/secondaire), bascule de portée Core / Tous, recherche et états vides
- Les thèmes par défaut Snow / Midnight gagnent en contraste et en relief de cartes, avec les palettes de terminal `ui-snow` / `ui-midnight` assorties
- États de sélection et hiérarchie visuelle unifiés : hôtes/arborescence du Vault, liste/arborescence/barre d'onglets SFTP, navigation des paramètres, barre latérale IA, barre supérieure du terminal
- Les listes de thèmes de terminal (dialogue / barre latérale) prennent en charge la recherche et des aperçus de pastilles plus lisibles
- Les couleurs codées en dur (état de synchronisation, toasts d'info, badges de mise à jour, surbrillances de glisser-déposer, etc.) sont regroupées en jetons de thème

## [0.4.0] - 2026-07-13

### Fonctionnalités
- Téléchargements et mises à jour accélérés pour les utilisateurs en Chine : région détectée automatiquement avec bascule vers un miroir national et repli bidirectionnel GitHub
- « Nouveautés » des paramètres affiche désormais les notes de version dans une boîte de dialogue intégrée au lieu de renvoyer vers GitHub
- Nouvelle entrée « Contacter le support » qui copie l'e-mail de contact
- La reconnexion SSH automatique passe au repli exponentiel (de 5 s à 60 s max) ; après 10 échecs consécutifs, elle s'arrête et invite à reconnecter manuellement
- La redirection de ports locale/dynamique réutilise la connexion SSH du terminal déjà authentifiée, évitant une seconde demande de mot de passe/2FA
- L'import de clés de sécurité FIDO2 (sk-*) suggère de passer à l'authentification ssh-agent

### Changements
- Suppression des entrées GitHub « Signaler un problème » et « Communauté » des paramètres

## [0.3.0] - 2026-07-13

### Corrections
- Les échecs de chiffrement de clé API lors de l'enregistrement d'un fournisseur IA ne sont plus avalés en silence ; une erreur localisée claire apparaît sous le champ de clé API

## [0.2.9] - 2026-07-13

### Fonctionnalités
- Mise à jour automatique sur macOS : installation par remplacement du bundle après téléchargement, contournant les restrictions de Squirrel sur les applications non signées (dès 0.2.9, toutes les plateformes se mettent à niveau automatiquement)

### Corrections
- L'icône de l'application conserve le socle arrondi du visuel officiel, cohérent en clair et en sombre

## [0.2.8] - 2026-07-13

### Corrections
- Paquet Windows se fermant silencieusement au lancement : afterPack réinsère le hachage d'intégrité après réécriture de l'asar, avec une vérification CI contre les récidives
- La progression et les erreurs d'installation des mises à jour sont visibles sur toutes les plateformes

## [0.2.7] - 2026-07-13

### Corrections
- Windows publie désormais un installateur x64 sûr au niveau architecture

## [0.2.6] - 2026-07-12

### Sécurité
- La fenêtre de barre d'état empaquetée ignore `VITE_DEV_SERVER_URL` et bloque la navigation / les nouvelles fenêtres
- preload n'ajoute plus le serveur de développement aux origines de confiance sous `app.asar`
- Mises à niveau forcées vers DOMPurify 3.3.2 et undici 6.23.0, corrigeant un XSS atteignable / un DoS de chaîne de décompression
- afterPack répare le hachage d'intégrité des fichiers ASAR et synchronise Info.plist, évitant le plantage de macOS au lancement

### Corrections
- Le test d'intégration de connexion automatique Telnet attend désormais l'invite de commande avant de vérifier l'événement de complétion

## [0.2.5] - 2026-07-12

### Corrections
- Masquage de l'entrée « code source GitHub » dans la section Communauté des paramètres
- Les liens Nouveautés / signalement pointent vers `JasonZhangDad/MgTerminal`, corrigeant les 404
- « Redémarrer maintenant » ne répondait pas : la fermeture pour installer la mise à jour n'est plus annulée par la vérification asynchrone des modifications dans before-quit
- « Redémarrer et mettre à jour » affiche un message clair en cas d'échec ; les plateformes sans installation automatique ouvrent la page Releases

## [0.2.4] - 2026-07-12

### Sécurité
- L'enregistrement des identifiants s'arrête quand le chiffrement est indisponible ; le repli en texte clair est interdit
- Les liens profonds SSH sont désactivés par défaut, les URL contenant des mots de passe sont rejetées et la connexion exige une confirmation
- Le presse-papiers OSC52 est désactivé par défaut
- CSP Electron resserrée, intégrité ASAR et fusibles de sécurité activés
- Suppression de l'autorisation macOS disable-library-validation

## [0.2.3] - 2026-07-11

### Corrections
- Correction : le nom d'hôte `app://` empaqueté était mis en minuscules par Chromium, ce qui faisait refuser à preload l'injection du bridge Electron et cassait le terminal, SFTP, les paramètres, la sélection de fichiers et la redirection de ports
- Reconnaissance unifiée de `app://magiesterminal` dans la fenêtre principale, la fenêtre des paramètres et les vérifications de permissions, restaurant les permissions de presse-papiers et de polices locales

## [0.2.2] - 2026-07-11

### Corrections
- Détails de l'hôte « Select Color Theme » : des ScrollArea imbriquées rendaient les clics de thème inopérants ; passage à un défilement mono-couche avec sélection au pointerdown
- Les boîtes de dialogue de sélection de clé SSH/clé locale n'étaient pas liées à la fenêtre parente, empêchant macOS de les afficher
- La fenêtre Settings ne s'ouvrait pas sous le protocole `app://`
- Les icônes de la barre latérale et de l'installateur passent aux nouvelles ressources d'icônes

## [0.2.1] - 2026-07-11

### CI/CD
- Réactivation des builds automatisées macOS et Windows (mode sans signature de code), fournissant des paquets prêts à l'emploi pour plus de plateformes.

## [0.2.0] - 2026-07-11

### Fonctionnalités
- Correction des événements IPC de mise à jour automatique envoyés à une seule fenêtre ; diffusion à toutes les fenêtres (principale + paramètres les reçoivent toutes deux)
- Unification des machines à états de la vérification manuelle et de la mise à jour automatique, éliminant trois états parallèles
- La « Vérification des mises à jour » manuelle détecte les versions via l'API GitHub, puis déclenche de façon asynchrone le téléchargement electron-updater si une mise à jour existe
- Après un clic sur « Vérifier les mises à jour » dans la fenêtre des paramètres, la progression du téléchargement s'affiche en direct dans l'interface
- L'application déclenche automatiquement une vérification `electron-updater` 5 secondes après le démarrage, sans clic manuel
- Le téléchargement démarre automatiquement à la découverte d'une nouvelle version (`autoDownload=true`)
- Un toast persistant apparaît à la fin du téléchargement ; cliquer sur « Redémarrer maintenant » installe
- Un échec de téléchargement affiche un toast d'erreur avec un repli « Ouvrir Releases »
- La barre de progression de Settings > System affiche en direct le téléchargement automatique, pilotée par `useUpdateCheck`
- Les plateformes Linux deb/rpm/snap et autres non prises en charge par electron-updater sont ignorées automatiquement et conservent le comportement de notification via l'API GitHub

### Notes de conception
- `broadcastToAllWindows` remplace l'envoi unique `getSenderWindow`, garantissant que chaque fenêtre reçoit les événements IPC
- Le champ `manualCheckStatus` suit l'état UI de la vérification manuelle (idle/checking/available/up-to-date/error) et est rendu avec `autoDownloadStatus` selon la priorité dans l'interface
- `SettingsSystemTab` ne détient plus d'état de mise à jour local ; il reçoit unidirectionnellement les données unifiées de `useUpdateCheck`
- Les deux systèmes auparavant indépendants (notifications API GitHub + téléchargement manuel electron-updater) fusionnent en une machine à états unique : `useUpdateCheck` est la source de vérité qui pilote à la fois le toast d'`App.tsx` et la barre de progression de `SettingsSystemTab`
- Les écouteurs IPC persistants globaux sont enregistrés une seule fois dans `autoUpdateBridge.init()`, évitant les enregistrements/nettoyages répétés à chaque demande de téléchargement manuel
- `autoInstallOnAppQuit=false` : pas d'installation silencieuse, le redémarrage est déclenché par l'utilisateur

### Changements d'interface（SettingsSystemTabProps）
- Supprimés : `autoDownloadStatus`, `downloadPercent`
- Ajoutés : `updateState` (UpdateState complet), `checkNow`, `installUpdate`, `openReleasePage`

### Remarques
- Sémantique de `checkNow` : utilise l'API GitHub (`performCheck`) pour détecter les nouvelles versions ; si une mise à jour existe et qu'electron-updater n'a pas commencé le téléchargement, `bridge.checkForUpdate()` est déclenché de façon asynchrone pour lancer le flux de téléchargement automatique
- Cette fonctionnalité ne vaut que pour les applications empaquetées (Windows NSIS, macOS dmg/zip, Linux AppImage) ; le mode dev nécessite `forceDevUpdateConfig=true` + `dev-app-update.yml` pour les tests (voir `.gitignore`)
- L'ancien toast `hasUpdate` est supprimé tant que `autoDownloadStatus !== 'idle'`, évitant les doublons avec le nouveau toast

### Améliorations CI / build
- Builds macOS / Windows ignorées (certificats de signature de code payants requis), concentration sur les paquets Linux gratuits
- Mise à niveau du compilateur Linux x64 (AlmaLinux 8) : Clang en priorité, repli sur gcc-toolset-13
- Mise à niveau du compilateur Linux arm64 (Debian Bullseye) : de `build-essential` à `clang-14 + lld-14`
- Le job de release ne dépend plus des builds macOS/Windows ; les push de tags publient la release directement depuis les artefacts Linux
- Validation assouplie des artefacts deb : les fichiers introuvables émettent un avertissement au lieu d'une erreur, pour que les sauts de plateforme ne fassent plus échouer la CI
