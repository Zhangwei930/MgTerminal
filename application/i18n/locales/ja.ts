import type { Messages } from './types';
import { jaCoreMessages } from './ja/core';
import { jaVaultMessages } from './ja/vault';
import { jaTerminalMessages } from './ja/terminal';
import { jaAiMessages } from './ja/ai';
import { jaSystemManagerMessages } from './ja/systemManager';
import { jaScriptsMessages } from './ja/scripts';

export type { Messages } from './types';

const ja: Messages = {
  ...jaCoreMessages,
  ...jaVaultMessages,
  ...jaTerminalMessages,
  ...jaAiMessages,
  ...jaSystemManagerMessages,
  ...jaScriptsMessages,
};

export default ja;
