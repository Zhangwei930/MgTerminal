import type { Messages } from './types';
import { deCoreMessages } from './de/core';
import { deVaultMessages } from './de/vault';
import { deTerminalMessages } from './de/terminal';
import { deAiMessages } from './de/ai';
import { deSystemManagerMessages } from './de/systemManager';
import { deScriptsMessages } from './de/scripts';

export type { Messages } from './types';

const de: Messages = {
  ...deCoreMessages,
  ...deVaultMessages,
  ...deTerminalMessages,
  ...deAiMessages,
  ...deSystemManagerMessages,
  ...deScriptsMessages,
};

export default de;
