import type { ComponentProps, FormEventHandler, ReactNode } from "react";
import { Icon } from "./ui";

/** Native controls keep their refs, labels and events; focus styling lives in form-controls.css. */
export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`text-control ${className}`.trim()} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`text-control ${className}`.trim()} />;
}

export function SelectInput({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`text-control ${className}`.trim()} />;
}

type SearchFieldProps = Omit<ComponentProps<"input">, "children" | "type" | "onSubmit"> & {
  "aria-label": string;
  trailing?: ReactNode;
  formId?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

/** Only the enclosing field paints focus. Submit searches also own their form landmark. */
export function SearchField({ className = "", trailing, formId, onSubmit, ...props }: SearchFieldProps) {
  const shellClass = `search-field text-field-shell ${className}`.trim();
  const content = <><Icon name="search" size={16} /><TextInput autoComplete="off" {...props} />{trailing}</>;
  return onSubmit
    ? <form id={formId} className={shellClass} role="search" onSubmit={onSubmit}>{content}</form>
    : <label className={shellClass}>{content}</label>;
}
