import type { Messages } from './types';
import { ptCoreMessages } from './pt/core';
import { ptVaultMessages } from './pt/vault';
import { ptTerminalMessages } from './pt/terminal';
import { ptAiMessages } from './pt/ai';
import { ptSystemManagerMessages } from './pt/systemManager';
import { ptScriptsMessages } from './pt/scripts';

export type { Messages } from './types';

const pt: Messages = {
  ...ptCoreMessages,
  ...ptVaultMessages,
  ...ptTerminalMessages,
  ...ptAiMessages,
  ...ptSystemManagerMessages,
  ...ptScriptsMessages,
};

export default pt;
