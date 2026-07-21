export type TargetOs = 'linux' | 'darwin' | 'win32' | 'unknown';

export interface SessionCapabilities {
  targetOs: TargetOs;
  hasTmux: boolean;
  hasDocker: boolean;
  hasKubectl: boolean;
  probedAt: number;
}

export interface SystemProcessInfo {
  pid: number;
  ppid: number;
  user: string;
  stat: string;
  cpuPercent: number;
  memPercent: number;
  rssKb: number;
  vszKb: number;
  elapsed: string;
  command: string;
}

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: number;
  activity?: string;
  group?: string;
}

export interface TmuxWindowInfo {
  index: number;
  name: string;
  panes: number;
  active: boolean;
  layout: string;
}

export interface TmuxPaneInfo {
  index: number;
  title: string;
  command: string;
  active: boolean;
  pid: number;
  width: number;
  height: number;
}

export interface TmuxClientInfo {
  name: string;
  tty: string;
  activity: string;
  session: string;
}

export type TmuxManageAction =
  | { action: 'killSession'; sessionName: string }
  | { action: 'renameSession'; sessionName: string; newName: string }
  | { action: 'detachSession'; sessionName: string }
  | { action: 'createWindow'; sessionName: string; windowName?: string }
  | { action: 'killWindow'; sessionName: string; windowIndex: number }
  | { action: 'renameWindow'; sessionName: string; windowIndex: number; newName: string }
  | { action: 'killPane'; sessionName: string; windowIndex: number; paneIndex: number }
  | { action: 'splitPane'; sessionName: string; windowIndex: number; paneIndex?: number; direction: 'horizontal' | 'vertical' }
  | { action: 'sendKeys'; sessionName: string; windowIndex: number; paneIndex?: number; keys: string; enter?: boolean }
  | { action: 'selectWindow'; sessionName: string; windowIndex: number }
  | { action: 'killServer' };

export interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
}

export interface DockerStatInfo {
  id: string;
  name: string;
  cpuPercent: number;
  memUsage: string;
  memPercent: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

export interface DockerImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdAt: string;
  digest?: string;
  name: string;
}

export interface DockerComposeProjectInfo {
  name: string;
  status: string;
  configFiles: string[];
}

export interface DockerComposeServiceInfo {
  name: string;
  containerName: string;
  state: string;
  status: string;
  health: string;
  publishers: string;
}

export type DockerComposeProjectAction = 'up' | 'down' | 'restart' | 'start' | 'stop';

/** Unique per `docker images` row — same layer id can have multiple repo:tag lines. */
export function dockerImageRowKey(image: DockerImageInfo): string {
  return `${image.id}\0${image.repository}\0${image.tag}`;
}

export type DockerContainerAction =
  | 'start'
  | 'stop'
  | 'restart'
  | 'rm'
  | 'pause'
  | 'unpause'
  | 'kill'
  | 'rename';

export type DockerImageManageAction =
  | { action: 'pull'; imageRef: string }
  | { action: 'rm'; imageId: string; force?: boolean }
  | { action: 'prune'; all?: boolean }
  | { action: 'tag'; imageId: string; repository: string; tag?: string };

export type SystemManagerSubTab = 'overview' | 'processes' | 'tmux' | 'docker' | 'kubernetes';

export interface KubernetesNamespaceInfo {
  name: string;
  status: string;
  age: string;
}

export interface KubernetesPodInfo {
  name: string;
  namespace: string;
  ready: string;
  status: string;
  restarts: number;
  age: string;
  node: string;
  ip: string;
}

export interface KubernetesDeploymentInfo {
  name: string;
  namespace: string;
  ready: string;
  upToDate: string;
  available: string;
  age: string;
}

export interface KubernetesEventInfo {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  count: number;
  objectKind: string;
  objectName: string;
  source: string;
  firstSeen: string;
  lastSeen: string;
}

export interface KubernetesContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  current: boolean;
}

export interface TerminalPopupIcon {
  kind: 'image';
  src: string;
  backgroundColor?: string;
  alt?: string;
}

export interface TerminalPopupPayload {
  popupId?: string;
  title: string;
  icon?: TerminalPopupIcon;
  parentSessionId: string;
  sourceSession: import('../../types').TerminalSession;
  startupCommand: string;
  localShellType?: import('../../types').TerminalSession['shellType'];
}
