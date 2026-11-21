import { expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifyDreamNavigation(page) {
  const rows = page.locator('.desktop-navigation > .desktop-nav-row');
  const future = rows.getByRole('link', { name: '看见未来', exact: true });
  const dreams = rows.getByRole('link', { name: '梦境', exact: true });
  await expect(future).toHaveClass(/\bactive\b/);
  await expect(dreams.locator('svg')).toBeVisible();
  const futureBox = await future.boundingBox();
  const dreamBox = await dreams.boundingBox();
  expect(dreamBox.x).toBe(futureBox.x);
  expect(dreamBox.width).toBe(futureBox.width);
  expect(dreamBox.y).toBeGreaterThan(futureBox.y);
  await dreams.click();
  await expect(dreams).toHaveAttribute('aria-current', 'page');
  await expect(future).not.toHaveClass(/\bactive\b/);
  await expect(page.getByRole('heading', { name: '今晚，在哪里入梦？' })).toBeVisible();
}

export async function verifyDreamStageGroups(page) {
  await page.getByRole('link', { name: '全部入梦点 · 重新发现' }).click();
  const lifeMap = await page.evaluate(async () => (await fetch('/api/views/life-map')).json());
  await expect(page.locator('.dream-point-group > h2')).toHaveText(lifeMap.stages.map(stage => stage.page.title));
  const firstStage = page.locator('.dream-point-group').first();
  const firstEvent = lifeMap.stages[0].relatedEvents[0];
  await expect(firstStage.locator('summary b').first()).toHaveText(firstEvent.title);
}

export async function verifyDreams({ page, origin, stateRoot, captures, sampleId }) {
  const id = randomUUID(), previousRunId = randomUUID();
  const home = path.join(stateRoot, 'dreams', createHash('sha256').update('demo').digest('hex'));
  const title = '如果当时去另一座城市';
  const dreamTitle = '如果2020年6月，我先做短期项目';
  const legacySentence = '这是一段旧版推演的准备说明，描述当时的处境、要参考的材料和接下来需要逐条核对的问题。';
  const takeaways = ['匿名样例说明通勤会改变一天的节奏。'];
  const evidence = [{ pageId: sampleId, line: 5, quote: '仅用于匿名 Web 功能验收。', date: '2020-12-31' }];
  const actual = { text: '留在原城市完成项目。', verdict: 'supported', evidence };
  const report = { decision: legacySentence.repeat(8), summary: '如果先去另一座城市做短期项目，你会试着搭班车，再决定要不要在附近租房。', actualPath: actual, takeaways,
    actualTimeline: [{ date: '2020-12-31', finding: actual }],
    comparison: [{ dimension: '生活节奏', actual: '维持原通勤', branches: [{ id: 'move', text: '换一条通勤路线', relation: '通勤改变', claimIndex: 0 }] }],
    branches: [{ id: 'move', title: '换城市', intervention: '接受另一座城市的岗位', status: 'reviewed', timeline: [{ horizon: '换城市后的第一周', date: '2020-07-01',
      possibility: '先适应新的通勤路线。', condition: '已有新岗位', basis: evidence, review: actual },
    { horizon: '2020年暑假熟悉环境', possibility: '熟悉项目安排。', condition: '短期出差', basis: [], review: actual },
    { horizon: '2020年暑假参加面谈', possibility: '与项目负责人面谈。', condition: '行程可调整', basis: [], review: actual },
    { horizon: '开始新项目', date: '2021-03-01', possibility: '只能乘公交上班。', condition: '住在项目附近', basis: evidence,
      review: { text: '当地同时有通勤班车。', verdict: 'contradicted', evidence, revision: '如果住在项目附近，可以尝试通勤班车。' } },
    { horizon: '适应了一阵子以后', possibility: '回看工作的变化。', condition: '工作稳定', basis: [], review: actual }], gaps: [] }],
  };
  let active;
  async function persist(run) {
    const directory = path.join(home, run.id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'state.tmp'), JSON.stringify({ version: 1, config: { knowledgeBaseId: 'demo' }, run, fingerprint: run.id, effort: 'high' }));
    await rename(path.join(directory, 'state.tmp'), path.join(directory, 'state.json'));
  }
  const intercept = async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const input = route.request().postDataJSON();
    active = { id, previousRunId, knowledgeBaseId: 'demo', createdAt: '2020-06-02T12:00:00.000Z',
      title: dreamTitle, status: 'running', phase: 'analyze', until: '2021-06-01', runtimeId: 'codex', model: 'anonymous-browser',
      point: { ...input.point, source: { kind: input.point.kind, pointId: input.point.pointId }, title } };
    await persist({ ...active, id: previousRunId, title: undefined, previousRunId: undefined, status: 'ready',
      report: { ...report, branches: [], summary: '匿名上一版摘要。' } });
    await persist(active);
    await route.fulfill({ status: 202, json: active });
  };
  const startRoute = url => url.pathname === '/api/dreams';
  const suggestionsRoute = url => url.pathname === '/api/dreams/suggestions';
  const suggest = async route => {
    const { point } = route.request().postDataJSON();
    expect(point.decisionAt).toEqual({ earliest: '2020-06-01', latest: '2020-06-01' });
    await route.fulfill({ json: { suggestions: ['试住新城市一个月', '先申请异地协作'] } });
  };
  await page.route(startRoute, intercept);
  await page.route(suggestionsRoute, suggest);
  try {
    await page.goto(origin + '/predict-self');
    await verifyDreamNavigation(page);
    await verifyDreamStageGroups(page);
    await expect(page.locator('.desktop-navigation > .desktop-nav-row a[aria-current="page"]')).toHaveText('梦境');
    await page.getByRole('button', { name: '重新发现', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /新发现|没有找到/ })).toBeVisible();
    await page.locator('details.dream-point summary').first().click();
    await page.getByRole('button', { name: '这不是分岔，忽略' }).click();
    await page.getByRole('button', { name: '已忽略', exact: true }).click();
    await page.locator('details.dream-point summary').click();
    await page.getByRole('button', { name: '恢复入梦点' }).click();
    await expect(page.getByText('还没有忽略的入梦点')).toBeVisible();
    await page.getByRole('navigation', { name: '梦境导航' }).getByRole('link', { name: '梦境' }).click();
    await page.getByRole('textbox', { name: '描述入梦点' }).fill(title);
    await page.getByRole('button', { name: '描述并入梦' }).click();
    await page.getByLabel(/大概是什么时候/).fill('2020-06-01');
    await page.getByLabel(/当时实际选了什么/).fill('留在原城市');
    await page.getByLabel(/之后发生了哪些大事/).fill('同年完成项目。');
    await page.getByRole('button', { name: '保存为入梦点' }).click();
    await expect(page.getByRole('button', { name: '我描述的 1' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('summary').filter({ hasText: title }).click();
    await page.getByRole('button', { name: '收藏入梦点', exact: true }).click();
    await expect(page.getByRole('button', { name: '取消收藏入梦点' })).toBeVisible();
    await page.getByRole('button', { name: '从这里入梦' }).click();
    await expect(page.getByRole('heading', { name: '入梦准备' })).toBeVisible();
    await page.getByRole('button', { name: '我记得不太一样，修改' }).click();
    await expect(page.getByLabel('开始日期')).toHaveValue('2020-06-01');
    await page.getByRole('button', { name: '推荐几个假如' }).click();
    await expect(page.getByRole('checkbox', { name: /试住新城市一个月/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /先申请异地协作/ })).toBeVisible();
    await page.getByRole('checkbox', { name: /试住新城市一个月/ }).uncheck();
    await page.getByRole('textbox', { name: '自己加一个假如' }).fill('先做短期项目');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await page.getByRole('checkbox', { name: new RegExp(title) }).uncheck();
    await page.getByRole('button', { name: '到 T 之后 1 年' }).click();
    await page.getByRole('textbox', { name: '补充你记得的' }).fill('实际通勤一小时。');
    await page.getByRole('button', { name: '入梦', exact: true }).click();
    await expect(page.getByRole('list', { name: '入梦进度' }).locator('[aria-current="step"]')).toContainText('推演各条路径');
    await expect(page.getByText('推演各条路径', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: dreamTitle })).toBeVisible();
    expect(active.point).toMatchObject({ alternatives: ['先做短期项目'], horizon: 'one-year', supplement: '实际通勤一小时。' });
    await page.getByRole('link', { name: '离开去做别的，醒了通知我' }).click();
    await page.getByRole('button', { name: '做梦中', exact: true }).click();
    const current = page.getByRole('link', { name: new RegExp(dreamTitle) });
    await expect(current).toHaveCount(1);
    await current.click();
    await persist({ ...active, status: 'ready', phase: undefined, finishedAt: new Date().toISOString(), report });
    await page.reload();
    await page.getByRole('link', { name: '醒来', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: dreamTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '梦境导航' })).toContainText(dreamTitle);
    await expect(page.locator('.dream-summary')).toContainText(report.summary);
    const original = page.locator('.dream-original');
    await expect(original.locator('p').first()).toBeHidden();
    await original.getByText('查看原始推演设定').click();
    await expect(original.locator('p').first()).toBeVisible();
    await expect(original.locator('p').first()).toContainText(legacySentence);
    await original.getByText('查看原始推演设定').click();
    const crowdedNodes = page.getByRole('button', { name: /换城市 · 2020年暑假/ });
    await expect(crowdedNodes).toHaveCount(2);
    const hitAreas = await crowdedNodes.locator('.dream-chart-hit').evaluateAll(elements => elements.map(element => {
      const { left, right, width } = element.getBoundingClientRect();
      return { left, right, width };
    }));
    expect(hitAreas[0].right).toBeLessThan(hitAreas[1].left);
    expect(hitAreas[0].width).toBeGreaterThanOrEqual(30);
    for (const [index, name] of ['2020年暑假熟悉环境', '2020年暑假参加面谈'].entries()) {
      await crowdedNodes.nth(index).locator('.dream-chart-hit').click();
      await expect(page.locator('.dream-node-inspector').getByRole('heading', { name })).toBeVisible();
    }
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1024, height: originalViewport.height });
    await crowdedNodes.first().locator('.dream-chart-hit').click();
    await expect(page.locator('.dream-node-inspector').getByRole('heading', { name: '2020年暑假熟悉环境' })).toBeVisible();
    const narrowHit = await crowdedNodes.first().locator('.dream-chart-hit').boundingBox();
    expect(narrowHit.width).toBeGreaterThanOrEqual(30);
    await page.locator('.dream-path-layout').screenshot({ path: path.join(captures, 'dreams-legacy-path.png'), animations: 'disabled' });
    await page.setViewportSize(originalViewport);
    await page.getByRole('button', { name: '时间未标注', exact: true }).click();
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.locator('.dream-slices').getByRole('button', { name: /适应了一阵子以后/ }).click();
    await expect(page.locator('.dream-node-inspector').getByRole('heading', { name: '适应了一阵子以后' })).toBeInViewport();
    await page.setViewportSize(originalViewport);
    await expect(page.getByRole('heading', { name: '路径对比' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '换一条通勤路线', exact: true })).toBeVisible();
    await page.getByText('查看修正过的节点', { exact: true }).click();
    await expect(page.getByText('如果住在项目附近，可以尝试通勤班车。', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: '换城市 · 换城市后的第一周' }).press('Enter');
    const inspector = page.locator('.dream-node-inspector');
    const sourceLink = inspector.getByRole('link', { name: '浏览器样例 · 第 5 行', includeHidden: true });
    await expect(inspector).toContainText('先适应新的通勤路线。');
    await expect(sourceLink).toBeHidden();
    await inspector.getByText('查看依据与核对', { exact: true }).click();
    await expect(sourceLink).toBeVisible();
    await expect(page.locator('.dream-node-inspector').locator('time[datetime="2020-12-31"]')).toBeVisible();
    await page.locator('.dream-node-inspector').getByRole('link', { name: '浏览器样例 · 第 5 行' }).click();
    await expect(page.locator('.reader')).toContainText(evidence[0].quote);
    await page.getByRole('button', { name: '返回梦境', exact: true }).click();
    await expect(page.locator('.dream-node-inspector').getByRole('heading', { name: '换城市后的第一周' })).toBeInViewport();
    await page.getByRole('button', { name: '以这个节点再梦一次' }).click();
    await expect(page.getByText(/承接上一版的假设情境/)).toBeVisible();
    await expect(page.getByLabel(/大概是什么时候/)).toHaveValue('2020-07-01');
    await page.goBack();
    await page.getByRole('button', { name: '换城市 · 换城市后的第一周' }).press('Enter');
    await page.getByRole('button', { name: '我觉得不对，补充一下' }).click();
    await expect(page.getByText('请重新核对这一处：2020-07-01 · 换城市后的第一周')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '补充你记得的' })).toBeFocused();
    await expect(page.getByRole('textbox', { name: '补充你记得的' })).toHaveValue('实际通勤一小时。');
    await page.goBack();
    await page.getByRole('button', { name: '换城市 · 换城市后的第一周' }).press('Enter');
    await page.getByRole('button', { name: '返回说明' }).click();
    await page.getByRole('button', { name: '2021', exact: true }).click();
    await expect(page.getByRole('button', { name: '2021', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '梦 A · 换城市' }).click();
    await expect(page.getByRole('button', { name: '梦 A · 换城市' })).toHaveAttribute('aria-pressed', 'false');
    await page.getByText('与上一版的差别', { exact: true }).click();
    await expect(page.getByText('匿名上一版摘要。')).toBeVisible();
    await page.getByRole('button', { name: '收藏', exact: true }).click();
    await expect(page.getByRole('button', { name: '已收藏', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '收藏为洞察', exact: true }).click();
    await page.getByRole('button', { name: '确认收藏' }).click();
    await expect(page.getByRole('button', { name: '已收藏为洞察', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(captures, 'dreams-report.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '再梦一次', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '补充你记得的' })).toHaveValue('实际通勤一小时。');
    await page.goto(origin + '/dreams/insights');
    await expect(page.getByText(takeaways[0])).toBeVisible();
    await page.goto(origin + '/knowledge');
    await expect(page.getByRole('heading', { name: '从梦境带回的洞察' })).toBeVisible();
    await expect(page.getByText(takeaways[0])).toBeVisible();
    const unreviewedId = randomUUID();
    const unknown = { verdict: 'unknown', text: '没有后续记录。', evidence: [] };
    const legacyTitle = '如果2020年6月，我没有离开原来的城市';
    await persist({ ...active, id: unreviewedId, previousRunId: undefined, status: 'ready', phase: undefined,
      title: legacyTitle + '，可能先休假或做短期项目',
      point: { ...active.point, question: '假如我没有离开原来的城市', alternatives: ['先休假', '做短期项目'] },
      report: { ...report, verification: 'unreviewed', actualPath: unknown, actualTimeline: [],
        branches: report.branches.map(branch => ({ ...branch, timeline: branch.timeline.map(node => ({ ...node, review: unknown })) })) } });
    await page.goto(origin + '/dreams/' + unreviewedId);
    await expect(page.getByRole('heading', { level: 1, name: legacyTitle, exact: true })).toBeVisible();
    await expect(page.getByText('未核对的梦', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '人生路径' })).toBeVisible();
    await expect(page.locator('.dream-summary')).toContainText(report.summary);
    await expect(page.getByRole('heading', { name: '路径对比' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '收藏为洞察' })).toHaveCount(0);
    await page.goto(origin + '/dreams');
    await expect(page.locator(`a[href="/dreams/${unreviewedId}"]`)).toContainText('未核对的梦');
    await expect(page.locator(`a[href="/dreams/${unreviewedId}"] h3`)).toHaveText(legacyTitle);
    const deleteDialog = page.getByRole('alertdialog', { name: '删除这个梦境？' });
    async function deleteCard(runId, confirm) {
      const card = page.locator('.dream-card-frame').filter({ has: page.locator(`a[href="/dreams/${runId}"]`) });
      await card.getByRole('button', { name: /删除梦境/ }).click();
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.getByRole('button', { name: confirm ? '删除梦境' : '取消', exact: true }).click();
      await expect(deleteDialog).toHaveCount(0);
      await expect(card).toHaveCount(confirm ? 0 : 1);
    }
    await deleteCard(previousRunId, false);
    await deleteCard(previousRunId, true);
    await page.goto(origin + '/dreams/' + id);
    await expect(page.getByText('关联梦境已删除')).toBeVisible();
    await expect(page.getByRole('heading', { name: '梦境总结' })).toBeVisible();
    await page.goto(origin + '/dreams');
    await deleteCard(id, true);
    await page.reload();
    await expect(page.locator(`a[href="/dreams/${id}"]`)).toHaveCount(0);
    await page.goto(origin + '/dreams/insights');
    await expect(page.getByText(takeaways[0])).toBeVisible();
    await expect(page.getByText('来源梦境已删除')).toBeVisible();
  } finally {
    await page.unroute(startRoute, intercept);
    await page.unroute(suggestionsRoute, suggest);
  }
}
