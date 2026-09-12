import { createContext, useContext, type ReactNode } from "react";
export const VoiceInputContext = createContext<((onConfirm: (text: string) => void) => ReactNode) | null>(null);
export function VoiceInputSlot({ onConfirm }: { onConfirm: (text: string) => void }) {
  return useContext(VoiceInputContext)?.(onConfirm) ?? null;
}
