declare global {
  interface MagiesTerminalRdpLaunchOptions {
    hostname: string;
    port?: number;
    username?: string;
    password?: string;
  }

  interface MagiesTerminalBridge {
    launchRdp?(
      options: MagiesTerminalRdpLaunchOptions,
    ): Promise<{ success: boolean; error?: string }>;
  }
}

export {};
