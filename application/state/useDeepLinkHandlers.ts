/**
 * Deep-link handlers (ssh:// telnet:// jms://) — extracted verbatim from
 * App.tsx to keep the app shell lean. Wires bridge deep-link events to host
 * matching, ephemeral host creation, and the connect flow.
 */

import { useEffect, useEffectEvent } from 'react';
import {
  buildSshDeepLinkConnectionHost,
  buildSshDeepLinkHostDraft,
  findSshDeepLinkHost,
  parseSshDeepLink,
} from '../../domain/sshDeepLink';
import {
  buildTelnetDeepLinkConnectionHost,
  buildTelnetDeepLinkEphemeralHostFromSaved,
  buildTelnetDeepLinkOpenHost,
  findTelnetDeepLinkHost,
  materializeTelnetDeepLinkMatchHost,
  parseTelnetDeepLink,
} from '../../domain/telnetDeepLink';
import {
  buildJmsDeepLinkEphemeralHost,
  isSupportedJmsProtocol,
  parseJmsDeepLink,
} from '../../domain/jmsDeepLink';
import { resolveHostAuth } from '../../domain/sshAuth';
import type { Host, Identity, SSHKey } from '../../domain/models';
import { useI18n } from '../i18n/I18nProvider';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';
import { toast } from '../../components/ui/toast';
import type { VaultSection } from '../../components/VaultView';

interface UseDeepLinkHandlersParams {
  isPeerSessionWindow: boolean;
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  resolveEffectiveHost: (host: Host) => Host;
  handleConnectToHost: (host: Host) => void;
  setEphemeralHosts: React.Dispatch<React.SetStateAction<Host[]>>;
  setDeepLinkHostDraft: (host: Host | null) => void;
  setNavigateToSection: (section: VaultSection | null) => void;
  setActiveTabId: (tabId: string) => void;
}

export function useDeepLinkHandlers({
  isPeerSessionWindow,
  hosts,
  keys,
  identities,
  resolveEffectiveHost,
  handleConnectToHost,
  setEphemeralHosts,
  setDeepLinkHostDraft,
  setNavigateToSection,
  setActiveTabId,
}: UseDeepLinkHandlersParams): void {
  const { t } = useI18n();

  const _handleSshDeepLink = useEffectEvent((payload: { url?: string }) => {
    const rawUrl = payload?.url || '';
    const target = parseSshDeepLink(rawUrl);
    if (!target) {
      toast.warning(t('deepLink.ssh.invalid'));
      return;
    }

    const effectiveHosts = hosts.map((host) => {
      const effectiveHost = resolveEffectiveHost(host);
      const resolvedAuth = resolveHostAuth({ host: effectiveHost, keys, identities });
      return {
        ...effectiveHost,
        username: resolvedAuth.username || effectiveHost.username,
      };
    });
    const matchedEffectiveHost = findSshDeepLinkHost(effectiveHosts, target);

    if (matchedEffectiveHost) {
      const targetLabel = `${target.username ? `${target.username}@` : ''}${target.hostname}${target.port ? `:${target.port}` : ''}`;
      if (!globalThis.confirm(t('deepLink.ssh.confirm', { target: targetLabel }))) return;
      const originalHost = hosts.find((host) => host.id === matchedEffectiveHost.id) ?? matchedEffectiveHost;
      handleConnectToHost(buildSshDeepLinkConnectionHost(originalHost));
      return;
    }

    setDeepLinkHostDraft(buildSshDeepLinkHostDraft(target, {
      id: crypto.randomUUID(),
      now: Date.now(),
    }));
    setNavigateToSection('hosts');
    setActiveTabId('vault');
  });

  useEffect(() => {
    if (isPeerSessionWindow) return;
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onSshDeepLink) return;
    return bridge.onSshDeepLink((payload) => {
      _handleSshDeepLink(payload);
    });
  }, [isPeerSessionWindow]);

  const _handleTelnetDeepLink = useEffectEvent((payload: { url?: string }) => {
    const rawUrl = payload?.url || '';
    const target = parseTelnetDeepLink(rawUrl);
    if (!target) {
      toast.warning(t('deepLink.telnet.invalid'));
      return;
    }

    const effectiveHosts = hosts.map((host) =>
      materializeTelnetDeepLinkMatchHost(resolveEffectiveHost(host), identities),
    );
    const matchedEffectiveHost = findTelnetDeepLinkHost(effectiveHosts, target, {
      ignoreTargetUsername: Boolean(target.password),
    });

    if (matchedEffectiveHost) {
      if (target.password) {
        const ephemeralHost = buildTelnetDeepLinkEphemeralHostFromSaved(matchedEffectiveHost, target, {
          id: crypto.randomUUID(),
          now: Date.now(),
        });
        setEphemeralHosts((prev) => [...prev, ephemeralHost]);
        handleConnectToHost(ephemeralHost);
        return;
      }
      handleConnectToHost(buildTelnetDeepLinkConnectionHost(matchedEffectiveHost));
      return;
    }

    const ephemeralHost = buildTelnetDeepLinkOpenHost(effectiveHosts, target, {
      id: crypto.randomUUID(),
      now: Date.now(),
    });
    setEphemeralHosts((prev) => [...prev, ephemeralHost]);
    handleConnectToHost(ephemeralHost);
  });

  useEffect(() => {
    if (isPeerSessionWindow) return;
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onTelnetDeepLink) return;
    return bridge.onTelnetDeepLink((payload) => {
      _handleTelnetDeepLink(payload);
    });
  }, [isPeerSessionWindow]);

  const _handleJmsDeepLink = useEffectEvent((payload: { url?: string }) => {
    const rawUrl = payload?.url || '';
    const target = parseJmsDeepLink(rawUrl);
    if (!target) {
      toast.warning(t('deepLink.jms.invalid'));
      return;
    }
    if (!isSupportedJmsProtocol(target.protocol)) {
      toast.warning(t('deepLink.jms.unsupported', { protocol: target.protocol }));
      return;
    }
    const ephemeralHost = buildJmsDeepLinkEphemeralHost(target, {
      id: crypto.randomUUID(),
      now: Date.now(),
    });
    setEphemeralHosts((prev) => [...prev, ephemeralHost]);
    handleConnectToHost(ephemeralHost);
  });

  useEffect(() => {
    if (isPeerSessionWindow) return;
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onJmsDeepLink) return;
    return bridge.onJmsDeepLink((payload) => {
      _handleJmsDeepLink(payload);
    });
  }, [isPeerSessionWindow]);
}
