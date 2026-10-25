import { VoiceInputContext } from "./shared/voice-input";
import { VoiceInput } from "./features/desktop/VoiceInput";
import { InspectorProvider } from "./features/desktop/InspectorContext";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppShell } from "./app/AppShell";
import { currentLocale, translate, useI18n } from "./shared/i18n";
import { useLiveRevision } from "./shared/routing";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(translate(currentLocale(), "The Way Here 页面渲染失败"), error, info);
  }

  render() {
    if (this.state.error) return <FatalError message={this.state.error.message} />;
    return this.props.children;
  }
}

function FatalError({ message }: { message: string }) {
  const { t } = useI18n();
  return <div className="fatal-error"><div><span>{t("页面没有正确展开")}</span><h1>{t("页面暂时无法打开")}</h1><p>{message}</p><button onClick={() => window.location.reload()}>{t("重新加载")}</button></div></div>;
}

export default function App() {
  const revision = useLiveRevision();
  return <AppErrorBoundary><VoiceInputContext.Provider value={(onConfirm) => <VoiceInput onConfirm={onConfirm} />}><InspectorProvider><AppShell revision={revision} /></InspectorProvider></VoiceInputContext.Provider></AppErrorBoundary>;
}
