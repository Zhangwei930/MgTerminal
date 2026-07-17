import type { SessionFollowPublicState, SessionFollowAuditEvent } from "../../domain/sessionFollow";

declare global {
  interface MagiesTerminalBridge {
    followStart?(payload: {
      sessionId: string;
      displayName?: string;
    }): Promise<{ success: boolean; error?: string; state?: SessionFollowPublicState; peerId?: string }>;
    followStop?(payload: { sessionId: string }): Promise<{ success: boolean; error?: string; state?: null }>;
    followJoin?(payload: {
      sessionId: string;
      displayName?: string;
    }): Promise<{ success: boolean; error?: string; state?: SessionFollowPublicState; peerId?: string }>;
    followLeave?(payload: { sessionId: string }): Promise<{ success: boolean; error?: string; state?: SessionFollowPublicState | null }>;
    followRequestControl?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; error?: string; state?: SessionFollowPublicState }>;
    followGrantControl?(payload: {
      sessionId: string;
      targetPeerId: string;
    }): Promise<{ success: boolean; error?: string; state?: SessionFollowPublicState }>;
    followRevokeControl?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; error?: string; state?: SessionFollowPublicState }>;
    followGetState?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; state?: SessionFollowPublicState | null }>;
    followGetAudit?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; events?: SessionFollowAuditEvent[] }>;
    followClearAudit?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; error?: string; events?: SessionFollowAuditEvent[] }>;
    followLanCreateInvite?(payload: {
      sessionId: string;
      hostLabel?: string;
      displayName?: string;
    }): Promise<{
      success: boolean;
      error?: string;
      invite?: {
        sessionId: string;
        port: number;
        hosts: string[];
        token: string;
        code: string;
        shareString: string;
        expiresAt: number;
        hostLabel?: string;
      };
    }>;
    followLanStopInvite?(payload: { sessionId: string }): Promise<{ success: boolean }>;
    followLanGetInvite?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; invite?: {
      sessionId: string;
      port: number;
      hosts: string[];
      token: string;
      code: string;
      shareString: string;
      expiresAt: number;
      hostLabel?: string;
      peerCount?: number;
    } | null }>;
    followLanDecodeInvite?(payload: {
      shareString?: string;
      value?: string;
    }): Promise<{ ok: boolean; payload?: {
      v: number;
      host: string;
      port: number;
      token: string;
      sessionId: string;
      hostLabel?: string;
      expiresAt: number;
    }; error?: string }>;
    openFollowSessionWindow?(payload: {
      sessionId: string;
      title?: string;
      hostLabel?: string;
    }): Promise<{ success: boolean; error?: string }>;
    onFollowSessionOpen?(
      cb: (payload: { sessionId: string; title?: string; hostLabel?: string }) => void,
    ): () => void;
    onFollowState?(
      cb: (payload: { sessionId: string; state: SessionFollowPublicState | null }) => void,
    ): () => void;
    onFollowInputDenied?(
      cb: (payload: { sessionId: string; reason?: string }) => void,
    ): () => void;
  }
}

export {};
