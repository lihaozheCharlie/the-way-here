export function readWindowBounds(preferences, workspace, kind, areas) {
  const value = preferences.get(workspace, `desktop.window.${kind}`);
  if (!value) return {};
  let bounds;
  try { bounds = JSON.parse(value); } catch { return {}; }
  if (!bounds || !['x','y','width','height'].every(key => Number.isFinite(bounds[key])) || bounds.width < 300 || bounds.height < 300 || bounds.width > 20000 || bounds.height > 20000) return {};
  const area = areas.find(area => bounds.x + bounds.width / 2 >= area.x && bounds.x + bounds.width / 2 < area.x + area.width && bounds.y + bounds.height / 2 >= area.y && bounds.y + bounds.height / 2 < area.y + area.height);
  const size = { width: Math.min(bounds.width, area?.width ?? areas[0].width), height: Math.min(bounds.height, area?.height ?? areas[0].height) };
  return area ? { ...size, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - size.width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - size.height)) } : size;
}
export function rememberWindowBounds(win, preferences, workspace, kind) {
  let timer, dirty = false;
  const save = () => {
    clearTimeout(timer);
    if (!dirty || win.isDestroyed()) return;
    try { preferences.set(workspace, `desktop.window.${kind}`, JSON.stringify(win.getNormalBounds())); dirty = false; }
    catch (error) { console.error('Unable to save window preference:', error.message); }
  };
  const changed = () => { dirty = true; clearTimeout(timer); timer = setTimeout(save, 250); };
  win.on('resize', changed); win.on('move', changed); win.on('close', save);
  win.on('closed', () => clearTimeout(timer));
}
