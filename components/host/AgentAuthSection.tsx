/**
 * SSH Agent auth section for the host details panel: shows the identities the
 * agent currently holds (type, fingerprint, comment) and lets the user pin a
 * preferred identity for this host.
 */
import { Check, KeyRound, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { useApplicationBackend } from "../../application/state/useApplicationBackend";
import { cn } from "../../lib/utils";

export interface AgentAuthSectionProps {
  preferredFingerprint?: string;
  onSelectPreferred: (fingerprint: string | undefined) => void;
}

type AgentIdentitiesState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; identities: MagiesTerminalAgentIdentity[] };

export const AgentAuthSection: React.FC<AgentAuthSectionProps> = ({
  preferredFingerprint,
  onSelectPreferred,
}) => {
  const { t } = useI18n();
  const { listSshAgentIdentities } = useApplicationBackend();
  const [state, setState] = useState<AgentIdentitiesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void listSshAgentIdentities().then((result) => {
      if (cancelled) return;
      if (!result.available) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", identities: result.identities });
    });
    return () => {
      cancelled = true;
    };
  }, [listSshAgentIdentities]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        {t("hostDetails.agent.loading")}
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="p-2 text-xs text-muted-foreground">
        {t("hostDetails.agent.unavailable")}
      </div>
    );
  }

  if (state.identities.length === 0) {
    return (
      <div className="p-2 text-xs text-muted-foreground">
        {t("hostDetails.agent.empty")}
      </div>
    );
  }

  const rowClass = (selected: boolean) =>
    cn(
      "w-full flex items-center gap-2 rounded-md border p-2 text-left transition-colors",
      selected
        ? "border-primary/60 bg-primary/5"
        : "border-border/60 bg-secondary/40 hover:bg-secondary/70",
    );

  return (
    <div className="space-y-1.5" data-testid="agent-identities">
      <button
        type="button"
        className={rowClass(!preferredFingerprint)}
        onClick={() => onSelectPreferred(undefined)}
      >
        <KeyRound size={14} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs">{t("hostDetails.agent.anyIdentity")}</span>
        {!preferredFingerprint && <Check size={14} className="shrink-0 text-primary" />}
      </button>
      {state.identities.map((identity) => {
        const selected = preferredFingerprint === identity.fingerprint;
        return (
          <button
            type="button"
            key={identity.fingerprint || identity.comment}
            className={rowClass(selected)}
            onClick={() => onSelectPreferred(identity.fingerprint)}
          >
            <KeyRound size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {identity.comment || identity.keyType}
              </span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {identity.keyType} · SHA256:{identity.fingerprint}
              </span>
            </span>
            {selected && <Check size={14} className="shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
};

export default AgentAuthSection;
