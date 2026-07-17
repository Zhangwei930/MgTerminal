import { useCallback, useEffect, useState } from "react";
import type { PortForwardChannel } from "../../domain/models";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

export function usePortForwardChannels(): {
  channels: PortForwardChannel[];
  refresh: () => Promise<void>;
} {
  const [channels, setChannels] = useState<PortForwardChannel[]>([]);

  const refresh = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.listPortForwardChannels) {
      setChannels([]);
      return;
    }
    try {
      const result = await bridge.listPortForwardChannels();
      setChannels(Array.isArray(result?.channels) ? result.channels : []);
    } catch {
      setChannels([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const bridge = magiesTerminalBridge.get();
    const unsubscribe = bridge?.onPortForwardChannels?.((payload) => {
      setChannels(Array.isArray(payload?.channels) ? payload.channels : []);
    });
    return () => {
      unsubscribe?.();
    };
  }, [refresh]);

  return { channels, refresh };
}
