import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { AgentContext } from "../collaboration/model";
const initial: AgentContext = { scope: "此刻", title: "一起往下想", summary: "沿着当前生活记录和已有理解继续聊。", defaultMode: "read", suggestions: [] };
const Context = createContext<{ context: AgentContext; setContext: Dispatch<SetStateAction<AgentContext>> } | null>(null);
export function InspectorProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState(initial);
  return <Context.Provider value={{ context, setContext }}>{children}</Context.Provider>;
}
export function useInspector() { return useContext(Context); }
export function PageAgentContext({ context }: { context: AgentContext }) {
  const inspector = useInspector();
  const identity = JSON.stringify(context);
  useEffect(() => {
    inspector?.setContext(context);
    return () => inspector?.setContext((current) => current === context ? initial : current);
  }, [identity]);
  return null;
}
