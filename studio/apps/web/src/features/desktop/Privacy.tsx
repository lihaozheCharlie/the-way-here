import { useApi } from "../../shared/use-api";

export function Privacy() {
  const { data } = useApi<{ operator?: string; privacyPolicyUrl?: string; supportUrl?: string }>("/api/distribution", 0);
  const mas = typeof window !== "undefined" && window.desktop?.isMacAppStore;
  return <article className="desktop-preferences">
    <header className="preferences-heading"><h1>隐私与数据使用</h1><p>资料由你管理，外部 AI 由你决定是否使用。</p></header>
    <div className="preferences-body">
      <section className="preferences-group"><h2>系统照片库</h2><p>仅在你打开“此刻”的照片入口并授权后读取系统照片库。日期、相册归属、收藏标记、照片类型和照片位置用于本机筛选；搜索结果与预览只在内存中使用，不自动导入知识库，也不发送给 AI。照片库授权可在系统设置的“隐私与安全性 → 照片”中撤回。</p><p>填写拍摄地点搜索时，地点关键词会发送给 Apple 的地理编码服务；照片坐标只在本机参与匹配，不用于该地点查询。点击云端照片的“下载预览”会通过系统照片服务联网获取内容。</p></section>
      <section className="preferences-group"><h2>本机资料</h2><p>记录、知识库、对话、任务快照和索引保存在本机。外部文件夹按系统授权访问，从列表移除不会删除原文件。备份和同步盘中的副本由相应服务管理。</p></section>
      <section className="preferences-group"><h2>可选 AI 服务</h2><p>AI 可能发送输入、日记片段、知识页面、照片预览、账单及历史对话，以回答、整理和更新知识。AI 可读取当前知识库和你授权目录中的任务相关资料，发送范围可能超过当前输入框。</p><p>接收方在“偏好设置 → AI 助手”中显示。{mas ? "内置 Codex 固定使用 OpenAI，只导入你选择的 ChatGPT 登录，不导入外部配置、插件或历史。" : "Codex CLI 使用它自己的模型服务和登录配置；修改该配置前请先撤回许可。"}服务商的保留、训练使用、费用和处理地区受其条款及账户设置约束。</p><p>共享许可默认关闭，更换运行方式或模型厂商需要重新同意。撤回会阻止新任务并停止活动任务；已发送的内容不会自动从第三方删除。</p></section>
      <section className="preferences-group"><h2>语音与密钥</h2><p>麦克风仅在你主动开始后使用。系统支持时优先设备语音识别，否则可能使用 Apple 的语音服务。AI 整理会发送转写及相关任务上下文。</p><p>打包桌面版通过 macOS 系统钥匙串支持的加密保护 AI 设置和 API 密钥。开发用浏览器服务的设置文件不提供这项桌面保护。Codex 自身凭据由 Codex 管理。</p></section>
      <section className="preferences-group"><h2>撤销与删除</h2><p>可在 AI 设置中取消共享许可、移除 API 密钥，在系统设置中撤回麦克风权限。记录与知识库可在应用中删除；相关对话、任务记录和备份需分别清理。卸载应用不代表自动清除所有本机资料，删除前请先备份。</p></section>
      <section className="preferences-group"><h2>联系与完整政策</h2><p>客服：<a href="mailto:644730894@qq.com">644730894@qq.com</a>。反馈前请移除私人记录和密钥。</p>{data?.operator && <p>运营者：{data.operator}</p>}{data?.privacyPolicyUrl ? <p><a href={data.privacyPolicyUrl} target="_blank" rel="noreferrer">完整隐私政策</a></p> : <p>公开隐私政策地址尚未配置，此构建不能作为商店发布版本。</p>}{data?.supportUrl && <p><a href={data.supportUrl} target="_blank" rel="noreferrer">使用帮助与支持</a></p>}</section>
    </div>
  </article>;
}
