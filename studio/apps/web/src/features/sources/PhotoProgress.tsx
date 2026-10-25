import type { PhotoStep } from "./photo-flow";
import { useI18n } from "../../shared/i18n";

export function PhotoProgress({ step, completed = [], disabled = false, onStep }: { step: PhotoStep; completed?: PhotoStep[]; disabled?: boolean; onStep: (step: PhotoStep) => void }) {
  const { t } = useI18n();
  return <nav aria-label={t("照片记忆步骤")}><ol className="photo-progress">{([{ value: 2, label: "认人" }, { value: 3, label: "讲故事" }] as const).map(({ value, label }, index) => {
    const current = value === step;
    return <li key={label} className={current ? "current" : completed.includes(value) ? "done" : ""}><button type="button" disabled={disabled} aria-current={current ? "step" : undefined} onClick={() => onStep(value)}><span aria-hidden="true" /><b>{index + 1} {t(label)}</b></button></li>;
  })}</ol></nav>;
}
