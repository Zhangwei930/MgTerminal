/**
 * First-launch three-step onboarding: add host → connect → explore features.
 */
import { Check, ChevronRight, FolderInput, Plug, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { ONBOARDING_STEP_IDS, type OnboardingStepId } from "../../domain/onboarding";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  onAddHost?: () => void;
  onImport?: () => void;
  onOpenSettings?: () => void;
}

const STEP_META: Record<
  OnboardingStepId,
  { icon: React.ReactNode; titleKey: string; bodyKey: string }
> = {
  addHost: {
    icon: <FolderInput size={28} className="text-primary" />,
    titleKey: "onboarding.step.addHost.title",
    bodyKey: "onboarding.step.addHost.body",
  },
  connect: {
    icon: <Plug size={28} className="text-primary" />,
    titleKey: "onboarding.step.connect.title",
    bodyKey: "onboarding.step.connect.body",
  },
  explore: {
    icon: <Sparkles size={28} className="text-primary" />,
    titleKey: "onboarding.step.explore.title",
    bodyKey: "onboarding.step.explore.body",
  },
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  open,
  onComplete,
  onAddHost,
  onImport,
  onOpenSettings,
}) => {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const stepId = ONBOARDING_STEP_IDS[stepIndex];
  const meta = STEP_META[stepId];
  const isLast = stepIndex >= ONBOARDING_STEP_IDS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onComplete(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("onboarding.title")}</DialogTitle>
          <DialogDescription>{t("onboarding.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 py-1">
          {ONBOARDING_STEP_IDS.map((id, index) => (
            <div
              key={id}
              className={`h-1.5 w-10 rounded-full transition-colors ${
                index <= stepIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 px-6 py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-sm">
            {meta.icon}
          </div>
          <h3 className="text-base font-semibold">{t(meta.titleKey)}</h3>
          <p className="text-sm text-muted-foreground max-w-sm">{t(meta.bodyKey)}</p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {stepId === "addHost" && (
            <div className="flex w-full gap-2">
              {onAddHost && (
                <Button className="flex-1" onClick={() => { onAddHost(); onComplete(); }}>
                  {t("onboarding.action.addHost")}
                </Button>
              )}
              {onImport && (
                <Button variant="secondary" className="flex-1" onClick={() => { onImport(); onComplete(); }}>
                  {t("onboarding.action.import")}
                </Button>
              )}
            </div>
          )}
          {stepId === "explore" && onOpenSettings && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => { onOpenSettings(); onComplete(); }}
            >
              {t("onboarding.action.openSettings")}
            </Button>
          )}
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={onComplete}>
              {t("onboarding.skip")}
            </Button>
            <Button
              className="flex-1 gap-1"
              onClick={() => {
                if (isLast) onComplete();
                else setStepIndex((i) => i + 1);
              }}
            >
              {isLast ? (
                <>
                  <Check size={14} /> {t("onboarding.done")}
                </>
              ) : (
                <>
                  {t("onboarding.next")} <ChevronRight size={14} />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizard;
