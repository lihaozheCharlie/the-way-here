import { createContext, useContext, useEffect, type ReactNode } from "react";

export type LoadedReader = { pageId: string; isSource: boolean; category: string };

const ReaderLocationContext = createContext<(value: LoadedReader | undefined) => void>(() => {});

export function ReaderLocationProvider({ publish, children }: { publish: (value: LoadedReader | undefined) => void; children: ReactNode }) {
  return <ReaderLocationContext.Provider value={publish}>{children}</ReaderLocationContext.Provider>;
}

export function usePublishReaderLocation(value: LoadedReader | undefined) {
  const publish = useContext(ReaderLocationContext);
  const pageId = value?.pageId;
  const isSource = value?.isSource;
  const category = value?.category;
  useEffect(() => {
    publish(pageId ? { pageId, isSource: Boolean(isSource), category: category || "" } : undefined);
    return () => publish(undefined);
  }, [publish, pageId, isSource, category]);
}
