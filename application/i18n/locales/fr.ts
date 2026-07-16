import type { Messages } from './types';
import { frCoreMessages } from './fr/core';
import { frVaultMessages } from './fr/vault';
import { frTerminalMessages } from './fr/terminal';
import { frAiMessages } from './fr/ai';
import { frSystemManagerMessages } from './fr/systemManager';
import { frScriptsMessages } from './fr/scripts';

export type { Messages } from './types';

const fr: Messages = {
  ...frCoreMessages,
  ...frVaultMessages,
  ...frTerminalMessages,
  ...frAiMessages,
  ...frSystemManagerMessages,
  ...frScriptsMessages,
};

export default fr;
