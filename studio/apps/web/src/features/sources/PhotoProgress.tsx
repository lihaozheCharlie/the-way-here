import { photoSteps, type PhotoStep } from "./photo-flow";

export function PhotoProgress({ step, completed = [], disabled = false, onStep }: { step: PhotoStep; completed?: PhotoStep[]; disabled?: boolean; onStep: (step: PhotoStep) => void }) {
  return <nav aria-label="照片记忆步骤"><ol className="photo-progress">{photoSteps.map((label, index) => {
    const value = (index + 1) as PhotoStep;
    return <li key={label} className={value === step ? "current" : completed.includes(value) ? "done" : ""}><button type="button" disabled={disabled} aria-current={value === step ? "step" : undefined} onClick={() => onStep(value)}><span aria-hidden="true" /><b>{value} {label}</b></button></li>;
  })}</ol></nav>;
}
