import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PredictionView } from "@the-way-here/shared";
import { PredictionContent } from "./Predictions";
const view: PredictionView = { knowledgeBaseId: "demo", understanding: {version:1,score:60,threshold:60,unlocked:false,facets:[]},status:"locked",stale:false };
const render = (data: PredictionView) => renderToStaticMarkup(<MemoryRouter><PredictionContent view={data} refresh={() => undefined} busy={false} /></MemoryRouter>);
describe("prediction page states", () => {
  it("shows the first scan action without a made-up progress or prediction form", () => {
    const html=render(view);
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('重新预测');
    expect(html).not.toContain('已解锁');
    expect(html).not.toContain('超过 60 分');
    expect(html).not.toContain('写满 40 字');
    expect(html).toContain('扫描了解程度');
    expect(html).toContain('尚未解锁');
    expect(html).not.toContain('textarea');
  });
  it("focuses on one prediction action after unlocking and keeps thoughts optional", () => {
    const html=render({...view,status:"ready",stale:true,thoughts:"已有的当前想法",understanding:{...view.understanding,unlocked:true}});
    expect(html).not.toContain("有更新，可以重新预测了");
    expect(html).not.toContain("重新扫描");
    expect(html).not.toContain("上次扫描");
    expect(html).not.toContain("了解度如何评估");
    expect(html).toContain("预测未来");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("补充你的想法（可选）");
    expect(html).toContain("已有的当前想法");
    expect(html).not.toContain("正在预测…");
  });
  it("disables prediction during generation and displays preserved data on failure", () => {
    const ready = {...view, understanding:{...view.understanding,score:76,unlocked:true}};
    expect(render({...ready,status:"running"})).toContain('disabled=""');
    const html=render({...ready,status:"failed",error:"模型不可用"});
    expect(html).toContain('class="prediction-notice prediction-error" role="alert"');
    expect(html).toContain('模型不可用');
    expect(html).toContain('看见未来');
  });
});


it("shows the failure instead of a second stale reminder",()=>{
 const html=render({...view,status:"failed",stale:true,error:"当前维度引用了假设证据",understanding:{...view.understanding,unlocked:true}});
 expect(html).toContain("当前维度引用了假设证据");
 expect(html).not.toContain("有更新，可以重新预测了");
 expect(html).toContain("<h1>看见未来</h1>");
});

it("shows the saved score and both recovery actions after a scan", () => {
 const html=render({...view,understanding:{...view.understanding,score:58,threshold:65,scannedAt:"2026-09-19T00:00:00Z"}});
 expect(html).toContain('aria-valuenow="58"');
 expect(html).toContain('58%');
 expect(html).toContain('65%');
 expect(html).toContain('href="/sources"');
 expect(html).toContain('重新扫描');
 expect(html).not.toContain('textarea');
});
it("keeps a completed zero score distinct from no scan", () => {
 const html=render({...view,understanding:{...view.understanding,score:0,scannedAt:"2026-09-19T00:00:00Z"}});
 expect(html).toContain('aria-valuenow="0"');
 expect(html).toContain('重新扫描');
});
it("disables scanning while running and retains the previous assessment on failure", () => {
 const score={...view.understanding,score:58,scannedAt:"2026-09-19T00:00:00Z"};
 const running=render({...view,understanding:{...score,scanStatus:"running"}});
 expect(running).toContain('disabled=""');
 expect(running).toContain('当前显示上次扫描结果');
 const failed=render({...view,understanding:{...score,scanStatus:"failed",error:"扫描失败，请重试",stale:true}});
 expect(failed).toContain('aria-valuenow="58"');
 expect(failed).toContain('扫描失败，请重试');
 expect(failed).toContain('资料已有变化');
 expect(failed).toContain('重新扫描');
});
