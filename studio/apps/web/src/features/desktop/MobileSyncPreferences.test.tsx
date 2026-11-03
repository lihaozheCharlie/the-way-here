import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileManifest } from "@the-way-here/shared";
import { enMessages } from "../../shared/i18n/en-messages";
import { IndependentMobileCopyAction, MobileSyncPreferences } from "./MobileSyncPreferences";
const state=vi.hoisted(()=>({manifest:undefined as MobileManifest|undefined,status:"active",english:false}));
vi.mock("../../shared/use-api",()=>({useApi:(route:string)=>({data:route==="/api/mobile-sync"?{manifest:state.manifest,lifecycle:{status:state.status},protocolVersion:1}:route==="/api/agent-provider-presets"?[]:undefined})}));
vi.mock("../../shared/i18n",()=>({useI18n:()=>({t:(key:string)=>state.english?(enMessages[key]||key):key})}));
const label="创建独立的 iCloud 副本…";
beforeEach(()=>{state.manifest={version:1,knowledgeBaseId:"anonymous-legacy-space",name:"Anonymous space",sourcesPath:"sources",wikiPath:"wiki",createdAt:"2026-10-01T00:00:00Z",readOnly:false};state.status="active";state.english=false;vi.stubGlobal("window",{desktop:{prepareMobileWorkspace:vi.fn()}});});
describe("independent mobile workspace copy entry",()=>{
  it("allows writable prepared spaces and pending deletion requests to reach the existing native copy confirmation",()=>{
    for(const status of ["active","requested"]) {state.status=status;const html=renderToStaticMarkup(<MobileSyncPreferences/>);expect(html).toContain(label);expect(html).toContain("旧空间及原待处理任务保留");expect(html).toContain("旧任务不会复制或自动重放");}
    const nativePrepare=vi.fn();const element=IndependentMobileCopyAction({busy:false,onPrepare:nativePrepare});
    const button=element.props.children.find((child:any)=>child?.type==="button");
    expect(button.props.disabled).toBe(false);button.props.onClick();expect(nativePrepare).toHaveBeenCalledTimes(1);
    const busy=IndependentMobileCopyAction({busy:true,onPrepare:nativePrepare});
    expect(busy.props.children.find((child:any)=>child?.type==="button").props.disabled).toBe(true);
  });
  it("hides independent copy for read-only, deleted, purged, and browser-only spaces",()=>{
    state.manifest!.readOnly=true;expect(renderToStaticMarkup(<MobileSyncPreferences/>)).not.toContain(label);
    state.manifest!.readOnly=false;
    for(const status of ["deleted","purged"]) {state.status=status;expect(renderToStaticMarkup(<MobileSyncPreferences/>)).not.toContain(label);}
    state.status="active";vi.stubGlobal("window",{});expect(renderToStaticMarkup(<MobileSyncPreferences/>)).not.toContain(label);
  });
  it("keeps the original first-copy entry and supplies complete English copy semantics",()=>{
    state.manifest=undefined;expect(renderToStaticMarkup(<MobileSyncPreferences/>)).toContain("为 iPhone 准备 iCloud 空间…");
    state.english=true;const html=renderToStaticMarkup(<IndependentMobileCopyAction busy={false} onPrepare={()=>undefined}/>);
    expect(html).toContain("Create an independent iCloud copy");expect(html).toContain("pending tasks are kept");expect(html).toContain("not copied or replayed automatically");expect(html).not.toMatch(/[\u3400-\u9fff]/);
  });
});
