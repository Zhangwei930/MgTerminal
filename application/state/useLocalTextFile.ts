import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

/** UTF-8 files start with this; left in place it becomes part of the first field. */
const BOM = "﻿";

/**
 * Picks a text file and reads it, in one step.
 *
 * The pieces already exist on the bridge; this is the boundary that keeps a
 * component from reaching into infrastructure for them.
 */
export const useLocalTextFile = () => {
  const pickAndRead = useCallback(
    async (
      title: string,
      filters?: Array<{ name: string; extensions: string[] }>,
    ): Promise<{ path: string; text: string } | null> => {
      const bridge = magiesTerminalBridge.get();
      const path = await bridge?.selectFile?.(title, undefined, filters);
      if (!path) return null;

      const buffer = await bridge?.readLocalFile?.(path);
      if (!buffer) throw new Error("The file could not be read.");

      const text = new TextDecoder("utf-8").decode(buffer);
      return { path, text: text.startsWith(BOM) ? text.slice(BOM.length) : text };
    },
    [],
  );

  return { pickAndRead };
};
