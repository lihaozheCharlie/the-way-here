# Product

<!-- impeccable:product-schema 1 -->

## Platform

macOS desktop (Electron); a React renderer backed by a local service.

## Best-fit user

- Primary: a reflective individual who has accumulated diaries, conversations, notes, or AI chats and wants somewhere private to keep talking without having to explain their whole history again.
- Secondary: an open-source adopter with an existing Markdown/Obsidian Vault who values local ownership, traceable understanding, and control over what an Agent may change.
- Validation gap: this best-fit segment is inferred from the current product and one deep usage context; it has not yet been validated across multiple external users or Vault structures.

## Product Purpose

The Way Here is a long-term personal companion that remembers where the user came from and becomes more understanding through continued conversation. The recurring loop is: say what happened, talk until the missing context becomes clearer, retain a traceable understanding, and return later without starting over. Success is not more pages viewed or more knowledge generated; it is more honest expression, fewer repeated explanations, more useful corrections, and more moments where the user can describe what is happening in their own words.

## Positioning

**Core promise:** “有什么，都可以聊聊。我会记得你的来路，也会坦白哪些地方还不懂你。你先说，我们再一起把生活慢慢理清。”

Unlike a generic AI chat that forgets context or a note system that waits to be managed, The Way Here keeps original words, accumulated understanding, unanswered questions, and conversation in one local, traceable relationship. It does not claim to understand the user at first contact; it becomes more useful as the user talks, corrects it, and lets relevant history accumulate.

The friend framing is an experience promise, not a claim of consciousness, emotional reciprocity, therapy, or replacement for human relationships. The Agent must stay honest about uncertainty, preserve provenance, and use durable value, evidence quality, and impact scope to decide whether a conversation should update durable knowledge.

## Operating Context

- The user opens the native desktop client, which starts its local service, and returns when something happens that they want to say out loud, during a difficult decision, when a familiar pattern repeats, or when they simply do not want to start the story from the beginning again.
- The product reads an existing Vault with separate Knowledge Sources and My Knowledge layers.
- The import path accepts local Markdown, TXT, folders, and supported payment statements; future connectors must never appear as working actions before they exist.
- Reading, searching, following knowledge links, inspecting sources, and asking Codex are core recurring workflows.
- Internal Markdown records and constructed knowledge can be edited in the main client or an external editor. External directory connections and detached reading windows remain read-only. Editing preserves original metadata and protected source relations.

## Capabilities and Constraints

- Preserve all current constructed pages, original notes, build Skills, links, and Codex workflows; the GUI adapts to them instead of renaming private files or hard-coding this Vault.
- Local-first service bound to `127.0.0.1`; no account system and no public-network assumptions.
- React web client with a Fastify server and Markdown as the durable data format.
- Current delivery scope is macOS desktop, including the main window, detached reading/conversation windows, Preferences, and a floating Quick Capture window. Mobile and tablet adaptation, touch-specific interaction, narrow-screen navigation, and mobile visual QA are out of scope until separately prioritized; feature work must not add them incidentally.
- Full reading must always remain available. Summaries are navigation aids, never replacements for source or synthesis pages.
- A completed person-perspective reread of a letter remains in the current knowledge base's Agent conversation history and is also retained as a durable letter version. The original letter is never overwritten; the reading surface defaults to the latest completed version and offers a provenance-labelled history switcher only when at least two versions exist.
- Agent actions must keep query, scoped knowledge updates, and health checks distinct, while exposing progress, actual changes, and any high-impact confirmation states.
- All Agent interactions share one conversation implementation. Most pages, including Questions, use a right Inspector with current/history tabs and a 48px folded rail. It starts folded for each window load; explicit conversation actions open it without discarding drafts on folding. There is only one active conversation surface per window. Independent conversation windows retain the same knowledge-base context.
- The standalone Workbench / co-creation page is no longer part of the product. Legacy `/workbench` URLs redirect to home instead of opening a parallel Agent surface.

## Brand Commitments

- Product name: “The Way Here”. It describes both the path that brought the user here and the traceable path from a judgment back to its evidence.
- Relationship: a long-term friend who remembers, asks, and accepts correction—not an omniscient analyst, therapist, judge, or life manager.
- Voice: calm, direct, specific, conversational, non-judgmental, and comfortable saying “I don't know yet”. Prefer “说说看 / 一起聊聊 / 还不懂 / 可以纠正我” over “导入材料 / 处理任务 / 构建画像” on everyday surfaces.
- Trust: never hide the difference between original records, current understanding, and new inference. Friendliness cannot weaken provenance, privacy, or change-scope boundaries.

## Product Layers

1. **At This Moment / 此刻** — the conversational home. It states the relationship promise, then directly asks one traceable question the user may care about or want to clarify. A compact Life Records entry for diaries, conversations, and bills provides the other starting path, followed by compact recent-understanding and keyword previews, with pending-record and unread-letter notices only when applicable. Full collections remain on their secondary pages.
2. **Worth Talking About / 值得聊聊** — a filterable topic grid grown from what is understood and what is still missing, initially showing four topics. Selecting a topic highlights it and opens or restores its conversation in the shared right Inspector. Evidence remains available from each topic.
3. **Life Records / 生活记录** — the user's original words and evidence. Local files, folders, and supported statements remain readable in full and never become disposable input after processing.
4. **Existing Understanding / 已有理解** — current themes, stages, patterns, relationships, letters, quotes, and their evidence paths. Every item can be revisited, supplemented, or corrected.
5. **Contextual Companion** — one shared Agent conversation across the product, hosted in the right Inspector or the question workspace. The Agent listens first, then decides whether the conversation only needs an answer or contains durable, well-supported understanding worth retaining; validation mode checks system health. Conversation history stays within the selected personal space.
## Evidence on Hand

- Anonymous end-to-end evidence: `../../../vault/demo/sources/` and `../../../vault/demo/wiki/`.
- Current-state and conversation-prompt evidence: `../../../vault/demo/wiki/11 状态追踪/状态追踪总览.md` and `../../../vault/demo/wiki/11 状态追踪/值得聊聊.md`.
- Longitudinal structures: life stages, events and decisions, personal lines, recurring cycles, real-life systems, relationship roles, thinking models, letters, and quotes under `../../../vault/demo/wiki/`.
- Existing functional implementation and server APIs under `apps/web/`, `apps/server/`, and `packages/life-views/`.
- No user research across multiple external Vaults yet; portability beyond the current adapter remains an explicit validation gap.

## Product Principles

1. Ask one concrete, evidence-aware question instead of confronting the user with a blank input or a wall of choices; keep bringing in Life Records visibly available as another path.
2. Evidence before interpretation; interpretation before advice.
3. Understanding grows through conversation and correction; never present a cold-start inference as intimacy.
4. Growth is increased choice and clearer judgment, not a score or streak.
5. Summaries must lead somewhere: into full evidence, a related pattern, or a useful conversation.
6. Progressive disclosure over truncation: reduce initial load without hiding the complete knowledge.
7. Local ownership and reversible edits outrank convenience.

## Accessibility & Inclusion

- Keyboard navigation, visible focus, semantic headings, readable Chinese typography, sufficient contrast, and reduced-motion support are baseline requirements for the desktop experience.
- The interface must not rely on color alone to distinguish evidence state, attention state, or confirmation status.


## 2026-09 桌面迁移

主交付平台为 macOS Electron 桌面应用。按用户提供的纸灰底、灰绿强调三栏设计重构：左侧空间与栏目、中间工作内容、右侧常驻 AI Inspector。新增原生菜单、独立阅读/深聊、随手记、偏好设置与语音确认。原有知识、来源、照片/账单、任务及多知识库能力必须保留。浏览器入口继续供开发与兼容使用。


### 原目录连接

生活记录优先连接用户已有目录，原文留在原处并随外部编辑刷新；生成 Wiki、来源引用和允许的缓存属于应用目录。外部来源只读，自动 Wiki 更新可关闭，失败和待更新状态可见。旧式复制导入作为明确的一次性操作保留，照片与账单缓存流程保持不变。

### Desktop redesign authority

The supplied desktop UX design establishes a paper-gray and gray-green interface with restrained panel shadows, serif reading/editing text, and native window controls. The implementation and current DESIGN.md replace the earlier forest palette and floating drawer descriptions. Source folders and file lists open at 240/280px and fold to 48px; at narrower desktop widths auxiliary panes fold first to keep the primary reading area usable. Quick Capture is a separate floating window with persistent drafts, explicit save and optional native dictation. Preferences owns AI settings, persistent conversation hints/daily opener controls, and personal-space naming.
