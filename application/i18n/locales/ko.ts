import type { Messages } from './types';
import { koCoreMessages } from './ko/core';
import { koVaultMessages } from './ko/vault';
import { koTerminalMessages } from './ko/terminal';
import { koAiMessages } from './ko/ai';
import { koSystemManagerMessages } from './ko/systemManager';
import { koScriptsMessages } from './ko/scripts';

export type { Messages } from './types';

const ko: Messages = {
  ...koCoreMessages,
  ...koVaultMessages,
  ...koTerminalMessages,
  ...koAiMessages,
  ...koSystemManagerMessages,
  ...koScriptsMessages,
};

export default ko;
