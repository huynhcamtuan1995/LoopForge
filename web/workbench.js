// In-page conversation workbench. Same layout as the React /next/ app, but the
// assistant turn uses the Codex controls: model, approval mode, one resumable
// session, live progress and draft cards.
(() => {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const MODE_KEY = 'agentflow.assistantApprovalMode';
  const MODES = [
    { id: 'confirm', name: _t('先问我', 'Ask first'), desc: _t('执行前先让你确认', 'Ask for confirmation before executing') },
    { id: 'assisted', name: _t('帮我批准', 'Auto-approve low risk'), desc: _t('低风险的写入直接做，重要操作仍会问你', 'Run low-risk writes directly; still ask for important actions') },
    { id: 'auto', name: _t('完全访问', 'Full access'), desc: _t('在你的权限内直接执行', 'Execute directly within your permissions') },
  ];
  const KIND = { doc: _t('文档', 'Doc'), prototype: _t('页面', 'Page'), api: _t('接口', 'API'), diff: _t('变更', 'Diff'), report: _t('报告', 'Report'), ppt: _t('幻灯片', 'Slides'), browser: _t('浏览器', 'Browser'), file: _t('文件', 'File'), sop: 'SOP' };
  const STATUS = { backlog: _t('待规划', 'Backlog'), todo: _t('待处理', 'To Do'), in_progress: _t('进行中', 'In Progress'), in_review: _t('评审中', 'In Review'), blocked: _t('受阻', 'Blocked'), done: _t('已完成', 'Done'), closed: _t('已关闭', 'Closed'), cancelled: _t('已取消', 'Cancelled') };
  const LANE = { queued: _t('排队', 'Queued'), running: _t('执行中', 'Running'), waiting: _t('待确认', 'Waiting'), done: _t('已完成', 'Done'), failed: _t('失败', 'Failed') };
  const NODE = { pending: _t('待开始', 'Pending'), queued: _t('排队', 'Queued'), running: _t('执行中', 'Running'), waiting_approval: _t('待确认', 'Waiting Approval'), succeeded: _t('已完成', 'Succeeded'), done: _t('已完成', 'Done'), failed: _t('失败', 'Failed'), skipped: _t('跳过', 'Skipped'), cancelled: _t('已取消', 'Cancelled') };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pid = id => `u:${id || 0}`;
  const displayName = raw => { const s = String(raw || '').trim(); const m = s.match(/^[^()（）]+[(（]([^()（）]+)[)）]$/); return m ? m[1] : (s || _t('成员', 'Member')); };
  const statusLabel = s => STATUS[s] || s || '';
  const closed = s => s === 'done' || s === 'closed' || s === 'cancelled';
  const tone = s => s === 'in_progress' ? 'live' : (s === 'in_review' || s === 'blocked' ? 'wait' : (s === 'done' ? 'done' : (s === 'closed' || s === 'cancelled' ? 'stop' : 'idle')));
  const timeLabel = at => { const d = new Date(at); if (Number.isNaN(d.getTime())) return ''; const diff = Date.now() - d.getTime(); if (diff < 60000) return _t('刚刚', 'Just now'); if (diff < 3600000) return _t(Math.floor(diff / 60000) + ' 分钟前', Math.floor(diff / 60000) + 'm ago'); if (diff < 86400000) return _t(Math.floor(diff / 3600000) + ' 小时前', Math.floor(diff / 3600000) + 'h ago'); return (d.getMonth() + 1) + '/' + d.getDate(); };
  const sessionKey = id => 'lf.space.ai.' + id;
  const draftKey = id => 'lf.draft.' + id;

  async function req(path, init) {
    const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      let detail = text;
      try { detail = JSON.parse(text).error || text; } catch { /* plain */ }
      throw new Error(detail || ('HTTP ' + res.status));
    }
    return text ? JSON.parse(text) : null;
  }
  const send = (method, path, body) => req(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  const S = {
    spaces: [], people: {}, me: 'u:0', meName: _t('我', 'Me'), projects: [], activeId: '',
    sidebar: true, panel: false, panelView: { type: 'overview' }, slide: 0,
    booting: true, error: '', toast: '', dialog: null, catalog: null,
    model: localStorage.getItem('lf.workbench.model') || '',
    approvalMode: MODES.some(m => m.id === localStorage.getItem(MODE_KEY)) ? localStorage.getItem(MODE_KEY) : 'confirm',
    query: '', text: '', toAi: true, files: [], uploading: false,
    activity: [], answer: '', generationId: '', knownArts: {},
  };
  let host, slots, timer, composing = false;

  function space() { return S.spaces.find(s => s.id === S.activeId) || null; }
  function person(id) { return S.people[id] || { id, name: id === 'ai' ? 'LoopForge AI' : _t('成员', 'Member') }; }
  function projectName(id) { return S.projects.find(p => p.id === id)?.name || ''; }
  function currentProject() { return (typeof window.currentProject === 'function' && window.currentProject()?.id) || S.projects[0]?.id || ''; }

  function mapMessage(m) {
    const author = m.kind === 'ai' ? 'ai' : pid(m.userId);
    if (m.author && m.kind !== 'ai' && !S.people[author]) S.people[author] = { id: author, name: displayName(m.author) };
    return {
      kind: m.kind, id: m.id, author, at: m.createdAt, body: m.body || '', toAi: !!m.toAi,
      aiStatus: m.aiStatus, aiError: m.aiError, aiProgress: m.aiProgress, aiSessionId: m.aiSessionId,
      artifactId: m.artifactId, issueId: m.issueId, runId: m.runId, nodeId: m.nodeId, nodeName: m.nodeName,
      nodeStatus: m.nodeStatus, resolved: m.resolved, workflowName: m.workflowName, attachments: m.attachments || [],
    };
  }

  function applySpace(v, raw) {
    (v.members || []).forEach(m => { S.people[pid(m.userId)] = { id: pid(m.userId), name: displayName(m.name), title: m.title || '' }; });
    const lanes = (v.lanes || []).map(l => ({
      id: 'lane-' + (l.runId || l.messageId), runId: l.runId, name: l.workflowName, status: l.status === 'succeeded' ? 'done' : (l.status === 'failed' || l.status === 'cancelled' || l.dispatchError ? 'failed' : (l.nodes || []).some(n => n.status === 'waiting_approval') || l.status === 'waiting' ? 'waiting' : (l.status === 'pending' || l.status === 'queued' ? 'queued' : 'running')),
      nodes: (l.nodes || []).map(n => ({ id: n.id, name: n.name, status: n.status, agent: n.agentName || n.agentId || '' })),
    }));
    const messages = (raw || []).map(mapMessage);
    return {
      id: v.id, draft: false, title: v.title, summary: v.summary || '', projectId: v.projectId, project: v.projectName || projectName(v.projectId),
      requirement: v.requirement || null, pinned: !!v.pinned, updatedAt: v.updatedAt,
      members: (v.members || []).map(m => pid(m.userId)),
      lanes, artifacts: v.artifacts || [], approvals: messages.filter(m => m.kind === 'approval'),
      messages, pending: v.pendingApprovals || 0, live: v.liveRuns || 0, loaded: true,
    };
  }

  async function boot() {
    try {
      const me = await req('/api/auth/current');
      const u = me.user || {};
      S.me = pid(u.id); S.meName = u.chineseName || u.loginName || _t('我', 'Me');
      S.people[S.me] = { id: S.me, name: S.meName };
      S.projects = await req('/api/projects');
      const lists = await Promise.all(S.projects.slice(0, 20).map(async p => {
        const items = await req('/api/spaces?projectId=' + encodeURIComponent(p.id)).catch(() => []);
        return items.map(i => ({ id: i.id, title: i.title, projectId: i.projectId, project: p.name, requirement: i.requirement, pinned: !!i.pinned, updatedAt: i.updatedAt, pending: i.pendingApprovals || 0, live: i.liveRuns || 0, lanes: [], artifacts: [], messages: [], members: [], loaded: false, draft: false }));
      }));
      S.spaces = lists.flat().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      S.booting = false;
      if (!S.spaces.length) newDraft();
      else { S.activeId = S.spaces[0].id; await openSpace(S.activeId); }
    } catch (err) {
      S.booting = false; S.error = err.message || String(err);
    }
    window.AgentFlowAssistantModels?.load?.().then(cat => {
      if (!S.model) S.model = cat?.default || window.AgentFlowAssistantModels?.DEFAULT || '';
      paintComposerChrome();
    }).catch(() => {});
    paint();
    schedule();
  }

  async function openSpace(id) {
    const s = S.spaces.find(x => x.id === id);
    if (s?.draft || String(id).startsWith('draft-')) { S.activeId = id; S.text = localStorage.getItem(draftKey(id)) || ''; paint(); return; }
    S.activeId = id;
    const [v, raw] = await Promise.all([req('/api/spaces/' + id), req('/api/spaces/' + id + '/messages')]);
    const loaded = applySpace(v, raw);
    const i = S.spaces.findIndex(x => x.id === id);
    if (i >= 0) S.spaces[i] = loaded; else S.spaces.unshift(loaded);
    S.text = localStorage.getItem(draftKey(id)) || '';
    const known = Object.prototype.hasOwnProperty.call(S.knownArts, id);
    const prev = S.knownArts[id] || new Set();
    const fresh = known ? loaded.artifacts.filter(a => !prev.has(a.id)).pop() : null;
    S.knownArts[id] = new Set(loaded.artifacts.map(a => a.id));
    paint();
    if (fresh) showArtifact(fresh.id);
  }

  function newDraft() {
    const project = S.projects.find(p => p.id === currentProject()) || S.projects[0];
    if (!project) { toast(_t('还没有可访问的项目', 'No accessible projects yet')); return; }
    let d = S.spaces.find(s => s.draft && s.projectId === project.id);
    if (!d) {
      d = { id: 'draft-' + Date.now(), draft: true, title: _t('新会话', 'New session'), projectId: project.id, project: project.name, messages: [], members: [S.me], lanes: [], artifacts: [], updatedAt: new Date().toISOString(), pinned: false, loaded: true };
      S.spaces.unshift(d);
    }
    S.activeId = d.id; S.panelView = { type: 'overview' }; S.text = localStorage.getItem(draftKey(d.id)) || '';
    paint();
  }

  function toast(text) { S.toast = text; paintToast(); clearTimeout(toast._t); toast._t = setTimeout(() => { S.toast = ''; paintToast(); }, 3600); }
  function go(view, id) { if (typeof switchView === 'function') switchView(view); if (view === 'issues' && id && typeof openIssueDetail === 'function') openIssueDetail(id); }

  function paint() {
    if (!slots) return;
    const s = space();
    slots.app.className = 'app codex' + (S.sidebar ? ' with-sidebar' : '') + (S.panel && s && !s.draft ? ' with-panel' : '');
    paintSidebar();
    paintHeader();
    paintTimeline();
    paintPanel();
    paintDialog();
    paintToast();
    paintComposerChrome();
  }

  function paintSidebar() {
    const q = S.query.trim().toLowerCase();
    const list = S.spaces.filter(s => !q || `${s.title} ${s.requirement ? s.requirement.title : ''} ${s.project}`.toLowerCase().includes(q));
    const groups = [
      [_t('置顶', 'Pinned'), list.filter(s => s.pinned && !closed(s.requirement?.status))],
      [_t('最近', 'Recent'), list.filter(s => !s.pinned && !closed(s.requirement?.status))],
      [_t('需求已完成', 'Completed'), list.filter(s => closed(s.requirement?.status))],
    ].filter(g => g[1].length);
    slots.sidebar.innerHTML = `
      <div class="sb-top"><span class="sb-heading">${_t('会话', 'Sessions')}</span><button class="icon-btn" data-act="sidebar" title="${_t('收起侧栏', 'Collapse sidebar')}" type="button">${icon('panel')}</button></div>
      <button class="new-space" data-act="new" type="button">${icon('plus')}${_t('新会话', 'New session')}</button>
      <label class="sb-search">${icon('search')}<input data-search placeholder="${_t('搜索会话', 'Search sessions')}" value="${esc(S.query)}"></label>
      <nav class="sb-list">${groups.map(([name, items]) => `<section><h6>${name}</h6>${items.map(s => {
        const active = s.id === S.activeId ? ' active' : '';
        const meta = [s.requirement && ('#' + s.requirement.number + ' ' + statusLabel(s.requirement.status)), s.lanes.length ? _t(s.lanes.length + ' 条 SOP', s.lanes.length + ' SOPs') : '', S.projects.length > 1 ? s.project : ''].filter(Boolean).join(' · ');
        const side = s.live ? `<span class="live" title="${_t('SOP 执行中', 'SOP running')}"></span>` : `<time>${esc(s.draft ? '' : timeLabel(s.updatedAt))}</time>`;
        return `<button type="button" class="sb-item${active}" data-space="${esc(s.id)}"><span class="sb-glyph ${s.requirement ? 'req tone-' + tone(s.requirement.status) : 'chat'}"></span><span class="sb-item-main"><span class="sb-item-title">${esc(s.title)}</span>${meta ? `<span class="sb-item-meta">${esc(meta)}</span>` : ''}</span><span class="sb-item-side">${side}</span></button>`;
      }).join('')}</section>`).join('') || `<p class="sb-empty">${_t('没有匹配的会话', 'No matching sessions')}</p>`}</nav>
      <div class="sb-foot"><button class="sb-link" data-act="classic" type="button" title="${_t('之前在 AI 助手里的会话和任务对话', 'Previous sessions and task threads from the classic AI assistant')}">${icon('history')}${_t('旧版会话', 'Classic sessions')}<small>${_t('之前的对话', 'Previous threads')}</small></button></div>`;
    const input = slots.sidebar.querySelector('[data-search]');
    if (input && document.activeElement !== input) input.value = S.query;
  }

  function paintHeader() {
    const s = space();
    if (!s || S.booting || S.error) { slots.header.innerHTML = ''; return; }
    const req = s.requirement;
    slots.header.innerHTML = `
      <div class="sh-left">
        ${S.sidebar ? '' : `<button class="icon-btn" data-act="sidebar" type="button" title="${_t('展开侧栏', 'Expand sidebar')}">${icon('panel')}</button>`}
        <div class="sh-title"><h1 data-act="rename" title="${_t('重命名', 'Rename')}">${esc(s.title)}</h1><span>${esc(s.draft ? _t('新会话 · ', 'New session · ') + s.project : s.project)}</span></div>
        ${s.draft ? '' : `<button class="icon-btn sm${s.pinned ? ' on' : ''}" data-act="pin" type="button" title="${s.pinned ? _t('取消置顶', 'Unpin') : _t('置顶', 'Pin')}">${icon('pin')}</button>`}
      </div>
      ${req ? `<button class="req-chip tone-${tone(req.status)}" data-issue="${esc(req.id)}" type="button"><b>#${esc(req.number)}</b><span>${esc(req.title)}</span><em>${esc(statusLabel(req.status))}</em></button>` : ''}
      <div class="sh-right">
        ${!req && s.messages.length ? `<button class="ghost-btn" data-act="requirement" type="button">${_t('建需求', 'Create requirement')}</button>` : ''}
        ${s.draft ? '' : `<button class="ghost-btn" data-act="sop" type="button">${_t('跑 SOP', 'Run SOP')}</button>`}
        ${s.lanes && s.lanes.length ? `<button class="ghost-btn" data-act="progress" type="button">${_t('进度', 'Progress')}</button>` : ''}
        ${s.draft ? '' : `<button class="icon-btn${S.panel ? ' on' : ''}" data-act="panel-toggle" type="button" title="${_t('产物和进度', 'Artifacts & progress')}">${icon('right')}</button>`}
      </div>`;
  }

  function aiBody(m) {
    if (!m.body) return { message: '', drafts: [] };
    try { const p = JSON.parse(m.body); if (p && typeof p.message === 'string') return { message: p.message, drafts: p.drafts || [] }; } catch { /* text */ }
    return { message: m.body, drafts: [] };
  }

  function paintTimeline() {
    const s = space();
    const near = slots.timeline.scrollHeight - slots.timeline.scrollTop - slots.timeline.clientHeight < 80;
    if (S.booting) { slots.timeline.innerHTML = `<div class="empty-main">${_t('正在读取会话…', 'Loading sessions…')}</div>`; return; }
    if (S.error) { slots.timeline.innerHTML = `<div class="empty-main"><h2>${_t('无法连接 LoopForge 后端', 'Cannot connect to LoopForge backend')}</h2><p class="muted">${esc(S.error)}</p></div>`; return; }
    if (!s) { slots.timeline.innerHTML = `<div class="empty-main"><h2>${_t('还没有可访问的项目', 'No accessible projects yet')}</h2></div>`; return; }
    if (!s.messages.length) {
      const prompts = [
        _t('帮我做一个能在侧边栏打开的页面 demo', 'Build a page demo that opens in the side panel'),
        _t('做一页产品介绍 PPT', 'Create a one-page product intro slide deck'),
        _t('跑一个 SOP，并在旁边看进度', 'Run an SOP and watch progress in the side panel'),
        _t('先帮我把这件事理清楚', 'Help me think through this first'),
      ];
      slots.timeline.innerHTML = `<div class="timeline-inner"><div class="cx-welcome"><h2>${s.draft ? _t('要做什么？', 'What would you like to build?') : _t('这个会话还没有消息', 'No messages in this session yet')}</h2><p>${_t('直接说。页面、图片和 PPT 会在旁边打开，不会只给你一个云端路径。', 'Just ask. Pages, images, and slides open in the side panel—not just a cloud file path.')}</p><div class="wl-prompts">${prompts.map((p, i) => `<button type="button" data-prompt="${i}"><span>${esc(p)}</span></button>`).join('')}</div></div></div>`;
      return;
    }
    slots.timeline.innerHTML = `<div class="timeline-inner">${s.messages.map(renderMessage).join('')}</div>`;
    if (near) slots.timeline.scrollTop = slots.timeline.scrollHeight;
  }

  function artOf(id) { return space()?.artifacts.find(a => a.id === id); }
  function rawURL(id) { return '/api/spaces/' + encodeURIComponent(space().id) + '/artifacts/' + encodeURIComponent(id) + '/raw'; }
  function isImage(format) { return format === 'png' || format === 'jpeg' || format === 'gif' || format === 'webp'; }
  function scrubPaths(text) {
    return String(text || '').replace(/(^|[\s`（(])((?:\/(?:tmp|data|home|var|root|Users|workspace|opt)|~)(?:\/[^\s`'"）)]+)+)/g, '$1' + _t('（云端路径打不开，产物在旁边打开）', ' (cloud path cannot be opened; artifact opens in the side panel)'));
  }
  function attachmentHTML(m) {
    const s = space();
    return (m.attachments || []).map(a => {
      if (s && String(a.mimeType || '').startsWith('image/') && a.mimeType !== 'image/svg+xml') {
        return `<img class="cx-shot" alt="${esc(a.name)}" src="/api/spaces/${encodeURIComponent(s.id)}/attachments/${encodeURIComponent(a.id)}">`;
      }
      return `<span class="chip">${esc(a.name)}</span>`;
    }).join('');
  }
  function eventData(ev) {
    let data = ev && ev.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = { text: data }; } }
    return data || {};
  }
  function ingestEvents(events) {
    const activity = [];
    const open = {};
    let answer = '';
    events.forEach(ev => {
      const d = eventData(ev);
      const tool = String(d.tool || '').replace(/^mcp__agentflow_session__/, '');
      if (tool === 'submit_assistant_reply') return;
      if (d.kind === 'answer' && d.text) answer = d.full ? d.text : answer + d.text;
      else if (d.kind === 'tool') {
        const line = { kind: 'tool', id: d.id || '', text: d.text || tool || _t('正在执行', 'Running') };
        if (d.id) open[d.id] = line;
        activity.push(line);
      } else if (d.kind === 'toolDone' && open[d.id]) open[d.id].done = true;
      else if (d.kind === 'status' && d.text) activity.push({ kind: 'status', text: d.text });
    });
    S.activity = activity.slice(-12);
    S.answer = answer;
  }
  function activityHTML() {
    const lines = S.activity.map(ev => `<div class="${ev.done ? 'done' : 'on'}">${esc(ev.text || '')}</div>`).join('');
    const answer = S.answer ? (typeof renderMarkdown === 'function' ? renderMarkdown(scrubPaths(S.answer)) : esc(S.answer)) : '';
    return `<div class="cx-activity">${lines || `<div class="on">${_t('正在回复…', 'Replying…')}</div>`}</div>${answer ? `<div class="msg-body">${answer}</div>` : ''}`;
  }
  function liveNode(id) {
    if (!id) return null;
    return [...slots.timeline.querySelectorAll('[data-live]')].find(n => n.dataset.live === id) || null;
  }

  function renderMessage(m) {
    if (m.kind === 'milestone') return `<div class="cx-quiet">${esc(m.body || '')} · ${esc(timeLabel(m.at))}</div>`;
    if (m.kind === 'decision' || m.kind === 'note') return `<div class="cx-quiet">${esc(person(m.author).name)}${_t('：', ': ')}${esc(m.body)} · ${esc(timeLabel(m.at))}</div>`;
    if (m.kind === 'dispatch' || m.kind === 'sop') return `<div class="msg-card"><button class="cx-card" type="button" data-lane="${esc(m.runId || '')}"><b>${esc(m.workflowName || 'SOP')}</b><small>${_t('查看进度', 'View progress')}</small></button></div>`;
    if (m.kind === 'approval') return `<div class="msg-card"><div class="cx-card${m.resolved ? '' : ' pending'}"><b>${esc(m.nodeName || _t('待确认', 'Pending approval'))}</b><p>${esc(m.body || '')}</p>${m.resolved ? `<small>${_t('已处理', 'Resolved')}</small>` : `<div class="card-actions"><button class="btn btn-primary sm" type="button" data-decide="approve" data-run="${esc(m.runId)}" data-node="${esc(m.nodeId)}">${_t('批准', 'Approve')}</button><button class="btn sm" type="button" data-decide="reject" data-run="${esc(m.runId)}" data-node="${esc(m.nodeId)}">${_t('打回', 'Reject')}</button></div>`}</div></div>`;
    if (m.kind === 'artifact' && m.artifactId) {
      const a = artOf(m.artifactId) || { id: m.artifactId, title: m.body || _t('产物', 'Artifact'), kind: 'file' };
      if (isImage(a.format)) return `<figure class="cx-figure"><img class="cx-shot" alt="${esc(a.title)}" src="${rawURL(a.id)}"><figcaption><button type="button" data-artifact="${esc(a.id)}">${esc(a.title)}</button></figcaption></figure>`;
      return `<div class="msg-card"><button class="cx-card" type="button" data-artifact="${esc(m.artifactId)}"><b>${esc(a.title || m.body || _t('产物', 'Artifact'))}</b><small>${esc(KIND[a.kind] || _t('产物', 'Artifact'))} · ${_t('在侧边栏打开', 'Open in side panel')}</small></button></div>`;
    }
    if (m.kind === 'progress') return `<div class="cx-quiet${m.nodeStatus === 'failed' ? ' bad' : ''}">${esc(m.body)} · ${esc(timeLabel(m.at))}</div>`;
    if (m.author !== 'ai') {
      const mine = m.author === S.me;
      return `<div class="${mine ? 'cx-user' : 'cx-other'}"><div class="cx-meta">${esc(mine ? _t('你', 'You') : person(m.author).name)} · ${esc(timeLabel(m.at))}</div><div>${esc(m.body).replace(/\n/g, '<br>')}</div>${attachmentHTML(m)}</div>`;
    }
    const parsed = aiBody(m);
    const body = m.aiStatus === 'failed'
      ? `<div class="msg-body">${esc(m.aiError || _t('回复失败', 'Reply failed'))}</div>`
      : m.aiStatus === 'running'
        ? `<div data-live="${esc(m.aiSessionId || '')}">${activityHTML()}</div>`
        : `<div class="msg-body">${typeof renderMarkdown === 'function' ? renderMarkdown(scrubPaths(parsed.message || '')) : esc(parsed.message).replace(/\n/g, '<br>')}</div>`;
    const drafts = (parsed.drafts || []).map((d, i) => draftCard(d, i, m.id)).join('');
    const copy = m.aiStatus === 'running' ? '' : `<button type="button" class="cx-copy" data-copy="${esc(m.id)}">${_t('复制', 'Copy')}</button>`;
    return `<div class="cx-agent"><div class="cx-meta"><span>LoopForge</span>${copy}<time>${esc(timeLabel(m.at))}</time></div>${body}${attachmentHTML(m)}${drafts}</div>`;
  }

  function draftCard(d, index, messageId) {
    const kind = window.AgentFlowAssistant?.draftLabel?.(d.tool) || d.tool;
    const title = window.AgentFlowAssistant?.draftTitle?.(d) || d.body?.name || d.body?.title || d.tool;
    if (d.saved || d.auto) return `<section class="ai-draft ai-draft-auto"><strong>${d.saved ? _t('已执行', 'Executed') : _t('待执行', 'Pending')} · ${esc(kind)} · ${esc(title)}</strong></section>`;
    return `<section class="ai-draft"><strong>${esc(kind)} · ${esc(title)}</strong><p>${esc(d.body?.description || d.body?.prompt || '')}</p><button class="button primary small" type="button" data-draft="${index}" data-mid="${esc(messageId)}">${_t('确认执行', 'Confirm & run')}</button></section>`;
  }

  function paintPanel() {
    const s = space();
    if (!S.panel || !s || s.draft) { slots.panel.innerHTML = ''; return; }
    const view = S.panelView;
    let body = '';
    if (view.type === 'artifact') {
      const a = s.artifacts.find(x => x.id === view.id);
      body = a ? artifactPreview(a) : `<p class="muted">${_t('产物不存在', 'Artifact not found')}</p>`;
    } else if (view.type === 'lane') {
      const lane = s.lanes.find(l => l.runId === view.id || l.id === view.id);
      body = lane ? lanePreview(lane) : `<p class="muted">${_t('没有这条 SOP', 'SOP not found')}</p>`;
    } else {
      const req = s.requirement;
      body = `
        ${req ? `<button class="req-block tone-${tone(req.status)}" type="button" data-issue="${esc(req.id)}"><b>#${esc(req.number)} ${esc(req.title)}</b><em>${esc(statusLabel(req.status))}</em></button>` : `<p class="muted small">${_t('还没有关联需求。', 'No linked requirement yet.')}</p><button class="btn sm" data-act="requirement" type="button">${_t('建需求', 'Create requirement')}</button>`}
        <h5>SOP <span class="grow"></span></h5>
        ${s.lanes.length ? s.lanes.map(l => `<button class="lane-row" type="button" data-lane="${esc(l.runId || l.id)}"><div class="lr-head"><b>${esc(l.name)}</b><span class="muted">${esc(LANE[l.status] || l.status)}</span></div></button>`).join('') : `<p class="muted small">${_t('还没有跑 SOP。', 'No SOPs run yet.')}</p><button class="btn sm" data-act="sop" type="button">${_t('跑一个 SOP', 'Run an SOP')}</button>`}
        <h5>${_t('产物', 'Artifacts')}</h5>
        ${s.artifacts.length ? s.artifacts.map(a => `<button class="artifact-row" type="button" data-artifact="${esc(a.id)}"><b>${esc(a.title)}</b><small class="muted">${esc(a.kind)} · v${a.version}</small></button>`).join('') : `<p class="muted small">${_t('还没有产物。', 'No artifacts yet.')}</p>`}
        <h5>${_t('成员', 'Members')}</h5>
        <ul class="member-list">${s.members.map(id => `<li>${esc(person(id).name)}</li>`).join('')}</ul>`;
    }
    const title = view.type === 'overview' ? _t('产物和进度', 'Artifacts & progress') : view.type === 'lane' ? _t('SOP 进度', 'SOP progress') : _t('预览', 'Preview');
    slots.panel.innerHTML = `<div class="panel-head"><b>${title}</b><span class="grow"></span>${view.type !== 'overview' ? `<button class="icon-btn" type="button" data-act="panel-home" title="${_t('返回', 'Back')}">←</button>` : ''}<button class="icon-btn" type="button" data-act="panel-toggle" title="${_t('关闭', 'Close')}">×</button></div><div class="panel-body">${body}</div>`;
  }

  function lanePreview(lane) {
    const done = lane.nodes.filter(n => n.status === 'succeeded' || n.status === 'done' || n.status === 'skipped').length;
    const pct = lane.nodes.length ? Math.round(done / lane.nodes.length * 100) : (lane.status === 'done' ? 100 : 0);
    return `<h3>${esc(lane.name)}</h3><p class="muted small">${esc(LANE[lane.status] || lane.status)} · ${pct}%</p><div class="cx-bar"><span style="width:${pct}%"></span></div><ul class="lane-nodes">${lane.nodes.map(n => `<li><b>${esc(n.name)}</b> <span class="muted">${esc(NODE[n.status] || n.status)}</span>${n.agent ? ` · ${esc(n.agent)}` : ''}</li>`).join('')}</ul><button class="btn sm" type="button" data-open-run="${esc(lane.runId || '')}">${_t('在运行记录里打开', 'Open in runs')}</button>`;
  }

  function slidesOf(a) {
    if (a.format === 'json') {
      try {
        const parsed = JSON.parse(a.body || '{}');
        const slides = Array.isArray(parsed) ? parsed : parsed.slides;
        if (Array.isArray(slides)) return slides.map(s => ({ title: s.title || '', body: [s.body, ...(s.bullets || [])].filter(Boolean).join('\n') }));
      } catch { /* markdown */ }
    }
    return String(a.body || '').split(/\n---\n/).map(part => {
      const lines = part.trim().split('\n');
      return { title: (lines[0] || '').replace(/^#+\s*/, ''), body: lines.slice(1).join('\n') };
    }).filter(s => s.title || s.body);
  }

  function artifactPreview(a) {
    const head = `<h3>${esc(a.title)} <small class="muted">v${a.version || 1} · ${esc(KIND[a.kind] || a.kind || '')}</small></h3>`;
    if (isImage(a.format)) return `${head}<img class="cx-shot" alt="${esc(a.title)}" src="${rawURL(a.id)}">`;
    if (a.format === 'html' || a.kind === 'prototype') return `${head}<div class="live-frame"><iframe sandbox="allow-scripts allow-forms" src="${rawURL(a.id)}" title="${esc(a.title)}"></iframe></div>`;
    if (a.kind === 'browser' && a.url) {
      const internal = a.url.startsWith('/');
      return `${head}<div class="browser"><div class="browser-bar"><span class="url">${esc(a.url)}</span>${internal ? '' : `<a href="${esc(a.url)}" target="_blank" rel="noopener">${_t('新窗口打开', 'Open in new window')}</a>`}</div>${internal ? `<div class="live-frame"><iframe sandbox="allow-scripts allow-forms" src="${esc(a.url)}" title="${esc(a.title)}"></iframe></div>` : `<p class="muted small">${_t('外部页面在新窗口打开，避免带上平台登录态。', 'External pages open in a new window to avoid sharing platform credentials.')}</p>`}</div>`;
    }
    if (a.kind === 'ppt') {
      const slides = slidesOf(a);
      const i = Math.min(S.slide || 0, Math.max(slides.length - 1, 0));
      const slide = slides[i] || { title: a.title, body: a.summary || '' };
      const md = typeof renderMarkdown === 'function' ? renderMarkdown(slide.body || '') : esc(slide.body || '');
      return `${head}<div class="ppt live-ppt"><div class="slide md-slide"><div class="md"><h2>${esc(slide.title)}</h2>${md}</div><span class="slide-no">${i + 1} / ${Math.max(slides.length, 1)}</span></div><div class="ppt-bar"><div class="ppt-thumbs">${slides.map((_, n) => `<button type="button" data-slide="${n}" class="${n === i ? 'on' : ''}">${n + 1}</button>`).join('')}</div></div></div>`;
    }
    if (a.kind === 'diff' || String(a.body || '').includes('\n+++') || String(a.body || '').startsWith('diff ')) {
      const lines = String(a.body || '').split('\n').map(line => {
        const cls = line.startsWith('+') && !line.startsWith('+++') ? 'ad' : (line.startsWith('-') && !line.startsWith('---') ? 'rm' : (line.startsWith('@@') ? 'hunk' : ''));
        return `<span class="${cls}">${esc(line)}</span>`;
      }).join('');
      return `${head}<pre class="diff-code">${lines}</pre>`;
    }
    const md = typeof renderMarkdown === 'function' && (a.format === 'markdown' || !a.format) ? renderMarkdown(a.body || a.summary || '') : `<pre>${esc(a.body || a.summary || '')}</pre>`;
    return `${head}<div class="md">${md}</div>`;
  }

  function paintDialog() {
    const d = S.dialog;
    if (!d) { slots.dialog.innerHTML = ''; return; }
    const s = space();
    if (d.type === 'requirement') {
      slots.dialog.innerHTML = modal(_t('建需求', 'Create requirement'), _t('写清楚要做什么，之后跑的 SOP 都挂在这个需求下', 'Describe what to build; subsequent SOP runs will attach to this requirement'), `
        <label class="field">${_t('标题', 'Title')}<input data-field="title" value="${esc(s?.title === '新会话' || s?.title === _t('新会话', 'New session') ? '' : s?.title || '')}"></label>
        <label class="field">${_t('描述', 'Description')}<textarea data-field="description" rows="5">${esc(s?.summary || '')}</textarea></label>
        <label class="field">${_t('优先级', 'Priority')}<select data-field="priority"><option value="medium">${_t('中', 'Medium')}</option><option value="high">${_t('高', 'High')}</option><option value="urgent">${_t('紧急', 'Urgent')}</option><option value="low">${_t('低', 'Low')}</option></select></label>
        <div class="modal-foot"><button class="btn" type="button" data-act="close">${_t('取消', 'Cancel')}</button><button class="btn btn-primary" type="button" data-act="save-req">${_t('创建', 'Create')}</button></div>`);
    } else if (d.type === 'invite') {
      slots.dialog.innerHTML = modal(_t('邀请成员', 'Invite members'), _t('从项目里选一个人', 'Choose someone from the project'), `<div data-roster>${_t('正在读取…', 'Loading…')}</div><div class="modal-foot"><button class="btn" type="button" data-act="close">${_t('关闭', 'Close')}</button></div>`);
      req('/api/spaces/' + s.id + '/members').then(r => {
        const box = slots.dialog.querySelector('[data-roster]');
        if (!box) return;
        const have = new Set(s.members);
        box.innerHTML = (r.roster || []).filter(u => !have.has(pid(u.userId))).map(u => `<button class="btn block" type="button" data-invite="${u.userId}">${esc(u.name)}</button>`).join('') || `<p class="muted">${_t('没有可邀请的人', 'No one available to invite')}</p>`;
      }).catch(err => { const box = slots.dialog.querySelector('[data-roster]'); if (box) box.textContent = err.message; });
    } else if (d.type === 'sop') {
      slots.dialog.innerHTML = modal(_t('跑 SOP', 'Run SOP'), _t('选择已发布的流程', 'Select a published workflow'), `<div data-catalog>${_t('正在读取…', 'Loading…')}</div><div class="modal-foot"><button class="btn" type="button" data-act="close">${_t('取消', 'Cancel')}</button><button class="btn btn-primary" type="button" data-act="save-sop">${_t('启动', 'Start')}</button></div>`);
      req('/api/spaces/' + s.id + '/catalog').then(c => {
        S.catalog = c;
        const box = slots.dialog.querySelector('[data-catalog]');
        if (!box) return;
        box.innerHTML = (c.workflows || []).map(w => `<label class="check-row"><input type="checkbox" value="${esc(w.id)}"> <b>${esc(w.name)}</b> <small class="muted">${_t((w.nodes || 0) + ' 个步骤', (w.nodes || 0) + ' steps')}</small></label>`).join('') || `<p class="muted">${_t('这个项目还没有 SOP', 'No SOPs in this project yet')}</p>`;
      }).catch(err => { const box = slots.dialog.querySelector('[data-catalog]'); if (box) box.textContent = err.message; });
    } else if (d.type === 'artifact') {
      slots.dialog.innerHTML = modal(_t('新建产物', 'New artifact'), '', `
        <label class="field">${_t('标题', 'Title')}<input data-field="title"></label>
        <label class="field">${_t('类型', 'Type')}<select data-field="kind"><option value="doc">${_t('文档', 'Doc')}</option><option value="api">${_t('接口', 'API')}</option><option value="prototype">${_t('原型', 'Prototype')}</option><option value="report">${_t('报告', 'Report')}</option></select></label>
        <label class="field">${_t('正文', 'Body')}<textarea data-field="body" rows="6"></textarea></label>
        <div class="modal-foot"><button class="btn" type="button" data-act="close">${_t('取消', 'Cancel')}</button><button class="btn btn-primary" type="button" data-act="save-art">${_t('保存', 'Save')}</button></div>`);
    }
  }

  function modal(title, sub, body) {
    return `<div class="modal-backdrop"><div class="modal" role="dialog"><div class="modal-head"><div><h3>${esc(title)}</h3>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}</div><button class="icon-btn" type="button" data-act="close">×</button></div><div class="modal-body">${body}</div></div></div>`;
  }

  function paintToast() {
    slots.toast.innerHTML = S.toast ? `<div class="toast">${esc(S.toast)}</div>` : '';
  }

  function paintComposerChrome() {
    const bar = slots.composer.querySelector('.composer-bar');
    if (!bar) return;
    const mode = MODES.find(m => m.id === S.approvalMode) || MODES[0];
    const models = window.AgentFlowAssistantModels;
    const toggle = bar.querySelector('[data-model-toggle]');
    if (toggle && models?.paint) models.paint(toggle, S.model);
    const label = bar.querySelector('[data-mode-label]');
    if (label) label.textContent = mode.name;
    const running = !!space()?.messages?.some(m => m.aiStatus === 'running');
    const sendBtn = bar.querySelector('[data-act="send"],[data-act="stop"]');
    if (sendBtn) {
      sendBtn.dataset.act = running ? 'stop' : 'send';
      sendBtn.textContent = running ? '■' : '↑';
      sendBtn.title = running ? _t('停止', 'Stop') : _t('发送', 'Send');
    }
    const ta = slots.composer.querySelector('textarea');
    if (ta && document.activeElement !== ta) ta.placeholder = running ? _t('发送会打断当前回复', 'Sending will interrupt the current reply') : _t('给 LoopForge 发消息，或贴一张图', 'Message LoopForge, or paste an image');
    bar.querySelector('.target-toggle')?.classList.toggle('ai', S.toAi);
    bar.querySelector('.target-toggle')?.classList.toggle('people', !S.toAi);
    const t = bar.querySelector('.target-toggle');
    if (t) t.innerHTML = S.toAi ? _t('✦ AI 回复', '✦ AI reply') : _t('仅成员', 'Members only');
  }

  function buildComposer() {
    slots.composer.innerHTML = `
      <div class="composer-wrap"><div class="composer">
        <div class="wb-files" hidden></div>
        <textarea rows="1" placeholder="${_t('给 LoopForge 发消息，或贴一张图', 'Message LoopForge, or paste an image')}"></textarea>
        <input class="wb-file" type="file" multiple hidden>
        <div class="composer-bar">
          <button class="icon-btn" type="button" data-act="file" title="${_t('添加图片或文件', 'Attach image or file')}">+</button>
          <button class="icon-btn" type="button" data-act="mention" title="${_t('提及', 'Mention')}">@</button>
          <div class="ai-compose-model">
            <button type="button" class="ai-model-toggle" data-model-toggle aria-haspopup="listbox"><span class="ai-model-icon" data-family="glm">${_t('智', 'Z')}</span><span data-model-label>${_t('模型', 'Model')}</span></button>
            <div class="ai-model-menu" hidden role="listbox"></div>
          </div>
          <div class="ai-compose-mode">
            <button type="button" class="ai-model-toggle ai-mode-toggle" data-mode-toggle title="${_t('审批模式', 'Approval mode')}"><span data-mode-label>${_t('请求批准', 'Ask approval')}</span></button>
            <div class="ai-model-menu ai-mode-menu" hidden role="listbox"></div>
          </div>
          <button class="target-toggle ai" type="button" data-act="target">${_t('✦ AI 回复', '✦ AI reply')}</button>
          <span class="grow"></span>
          <button class="send ready" type="button" data-act="send" title="${_t('发送', 'Send')}">↑</button>
        </div>
      </div><p class="composer-hint">${_t('页面、图片和 PPT 会在右侧打开', 'Pages, images, and slides open on the right')}</p></div>`;
    const ta = slots.composer.querySelector('textarea');
    ta.addEventListener('compositionstart', () => { composing = true; });
    ta.addEventListener('compositionend', () => { composing = false; });
    ta.addEventListener('input', () => { S.text = ta.value; const s = space(); if (s) localStorage.setItem(draftKey(s.id), ta.value); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; });
    ta.addEventListener('keydown', e => {
      if (composing || e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    ta.addEventListener('paste', e => {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    });
    slots.composer.querySelector('[data-mode-toggle]').onclick = e => { e.stopPropagation(); paintModeMenu(); };
    slots.composer.querySelector('[data-model-toggle]').onclick = e => {
      e.stopPropagation();
      const menu = slots.composer.querySelector('.ai-model-menu:not(.ai-mode-menu)');
      const open = menu.hidden;
      closeMenus();
      if (open && window.AgentFlowAssistantModels?.renderList) {
        window.AgentFlowAssistantModels.renderList(menu, S.model, id => { S.model = id; localStorage.setItem('lf.workbench.model', id); closeMenus(); paintComposerChrome(); });
        menu.hidden = false;
      }
    };
  }

  function paintModeMenu() {
    const menu = slots.composer.querySelector('.ai-mode-menu');
    const open = menu.hidden;
    closeMenus();
    if (!open) return;
    menu.hidden = false;
    menu.innerHTML = MODES.map(m => `<button type="button" class="ai-model-option ai-mode-option${m.id === S.approvalMode ? ' is-active' : ''}" data-mode="${m.id}"><span class="ai-mode-copy"><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span></button>`).join('');
  }
  function closeMenus() { slots?.composer?.querySelectorAll('.ai-model-menu').forEach(m => { m.hidden = true; }); }

  async function submit(text, opts) {
    const s = space();
    const body = (text ?? slots.composer.querySelector('textarea').value).trim();
    if (!s || (!body && !S.files.length) || S.uploading) return;
    if (!opts?.steered && !s.draft && s.messages.some(m => m.aiStatus === 'running')) { await steer(body); return; }
    if (body.startsWith('/建需求')) { S.dialog = { type: 'requirement' }; paintDialog(); return; }
    if (body.startsWith('/跑') || body === '/sop') { if (s.draft) await promote(s, _t('跑 SOP', 'Run SOP')); S.dialog = { type: 'sop' }; paintDialog(); return; }
    const toAi = opts?.toAi ?? (S.toAi || /@AI/i.test(body));
    slots.composer.querySelector('textarea').value = '';
    S.text = '';
    if (s) localStorage.removeItem(draftKey(s.id));
    try {
      const id = s.draft ? await promote(s, body.slice(0, 36) || _t('新会话', 'New session')) : s.id;
      const target = S.spaces.find(x => x.id === id);
      const posted = await send('POST', '/api/spaces/' + id + '/messages', {
        body, toAi, model: S.model, approvalMode: S.approvalMode,
        aiSessionId: localStorage.getItem(sessionKey(id)) || '',
        attachments: S.files.map(f => ({ id: f.id })),
      });
      S.files = [];
      if (posted.reply?.aiSessionId) localStorage.setItem(sessionKey(id), posted.reply.aiSessionId);
      await openSpace(id);
      refreshActive().catch(() => {});
      if (target) schedule();
    } catch (err) { toast(err.message || _t('没有发出去', 'Failed to send')); }
  }

  async function stopTurn(quiet) {
    const s = space();
    const live = s?.messages.find(m => m.aiStatus === 'running' && m.aiSessionId);
    if (!live || !S.generationId) { if (!quiet) toast(_t('这一轮还没开始，稍后再停', 'This turn has not started yet, try stopping again in a moment')); return false; }
    await send('POST', '/api/assistant/sessions/' + encodeURIComponent(live.aiSessionId) + '/generation/cancel?generationId=' + encodeURIComponent(S.generationId));
    return true;
  }

  async function steer(text) {
    try { await stopTurn(true); } catch { /* already finished */ }
    const start = Date.now();
    while (Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 400));
      const s = space();
      if (!s) return;
      await openSpace(s.id);
      if (!space()?.messages.some(m => m.aiStatus === 'running')) break;
    }
    await submit(text, { steered: true, toAi: true });
  }

  async function promote(draft, title) {
    const created = await send('POST', '/api/spaces', { projectId: draft.projectId, title: title.slice(0, 80), summary: '', creatorTitle: '' });
    S.spaces = S.spaces.filter(s => s.id !== draft.id);
    S.activeId = created.id;
    return created.id;
  }

  async function refreshActive() {
    const s = space();
    if (!s || s.draft) return;
    const ai = s.messages.find(m => m.aiStatus === 'running' && m.aiSessionId);
    const laneLive = s.lanes.some(l => l.status === 'running' || l.status === 'waiting' || l.status === 'queued');
    if (!ai && !laneLive) return;
    if (ai) {
      try {
        const job = await req('/api/assistant/sessions/' + encodeURIComponent(ai.aiSessionId) + '/generation');
        S.generationId = job.id || S.generationId;
        if (job.status && job.status !== 'running') {
          S.activity = []; S.answer = ''; S.generationId = '';
          await openSpace(s.id);
          paintComposerChrome();
          return;
        }
        ingestEvents(job.events || []);
      } catch { /* the space reload below still shows new artifacts */ }
    }
    const view = await req('/api/spaces/' + s.id).catch(() => null);
    const prev = S.knownArts[s.id] || new Set();
    const fresh = (view?.artifacts || []).some(a => !prev.has(a.id));
    if (laneLive || fresh || (ai && !liveNode(ai.aiSessionId))) await openSpace(s.id);
    const node = liveNode(ai?.aiSessionId);
    if (node && ai) node.innerHTML = activityHTML();
    paintComposerChrome();
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(() => { refreshActive().catch(() => {}); }, 2000);
  }

  async function confirmDraft(messageId, index) {
    const s = space();
    const m = s?.messages.find(x => x.id === messageId);
    const d = m && aiBody(m).drafts[index];
    if (!d) return;
    if (!(await afConfirm({ title: _t('执行平台操作', 'Execute platform action'), message: _t('将通过平台接口执行 ' + d.tool + '。', 'Will execute ' + d.tool + ' via platform API.'), confirmText: _t('执行', 'Execute') }))) return;
    try {
      const args = {};
      if (d.path && Object.keys(d.path).length) args.path = d.path;
      if (d.query && Object.keys(d.query).length) args.query = d.query;
      if (d.body !== undefined && d.body !== null) args.body = d.body;
      const res = await send('POST', '/mcp', { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: d.tool, arguments: args } });
      if (res.error || res.result?.isError) throw new Error(res.error?.message || res.result?.content?.[0]?.text || _t('提交失败', 'Submission failed'));
      toast(_t('已执行', 'Executed'));
      await submit(_t('已确认刚才的草稿，请继续下一步。如果计划已完成，直接总结，不要再提交新草稿。', 'Confirmed the draft above, please continue to the next step. If the plan is complete, summarize directly without submitting another draft.'), { toAi: true });
    } catch (err) { toast(err.message || _t('执行失败', 'Execution failed')); }
  }

  function icon(name) {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
      panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
      pin: '<path d="m12 17 1-5 4-1-5-5-1 4-5 1 6 6z"/>',
      file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
      user: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M19 8v6M22 11h-6"/>',
      right: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
      history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    };
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  }

  async function showArtifact(id) {
    const s = space();
    if (!s || !id) return;
    const a = await req('/api/spaces/' + s.id + '/artifacts/' + id);
    const i = s.artifacts.findIndex(x => x.id === id);
    if (i >= 0) s.artifacts[i] = a; else s.artifacts.push(a);
    S.panel = true; S.panelView = { type: 'artifact', id }; S.slide = 0;
    paint();
  }

  let renaming = false;
  function beginRename(node) {
    const s = space();
    if (!s || s.draft || !node || node.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'title-input';
    input.value = s.title;
    node.textContent = '';
    node.append(input);
    input.focus();
    input.select();
    const save = async () => {
      if (renaming) return;
      renaming = true;
      const title = input.value.trim();
      try {
        if (title && title !== s.title) await send('PATCH', '/api/spaces/' + s.id, { title });
        await openSpace(s.id);
      } catch (err) { toast(err.message); paintHeader(); }
      renaming = false;
    };
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { renaming = true; paintHeader(); renaming = false; }
    });
    input.addEventListener('blur', () => { if (!renaming) save(); });
  }

  function onClick(e) {
    const copyBtn = e.target.closest('.md-code-copy,.cx-copy');
    if (copyBtn && host.contains(copyBtn)) {
      const text = copyBtn.classList.contains('md-code-copy')
        ? (copyBtn.closest('.md-code-block')?.querySelector('code')?.textContent || '')
        : scrubPaths(aiBody(space()?.messages.find(m => m.id === copyBtn.dataset.copy) || {}).message || '');
      navigator.clipboard.writeText(text).then(() => toast(_t('已复制', 'Copied'))).catch(() => toast(_t('没有复制成功', 'Failed to copy')));
      return;
    }
    const slide = e.target.closest('[data-slide]');
    if (slide && host.contains(slide)) { S.slide = Number(slide.dataset.slide); paintPanel(); return; }
    const t = e.target.closest('[data-act],[data-space],[data-prompt],[data-mode],[data-decide],[data-draft],[data-lane],[data-artifact],[data-issue],[data-invite],[data-open-run]');
    if (!t || !host.contains(t)) return;
    if (t.dataset.space) { S.panelView = { type: 'overview' }; openSpace(t.dataset.space).catch(err => toast(err.message)); return; }
    if (t.dataset.prompt !== undefined) {
      const text = [
        _t('帮我做一个能在侧边栏打开的页面 demo', 'Build a page demo that opens in the side panel'),
        _t('做一页产品介绍 PPT', 'Create a one-page product intro slide deck'),
        _t('跑一个 SOP，并在旁边看进度', 'Run an SOP and watch progress in the side panel'),
        _t('先帮我把这件事理清楚', 'Help me think through this first'),
      ][Number(t.dataset.prompt)];
      if (!text) return;
      if (t.dataset.prompt === '2') { const s = space(); const run = async () => { if (s?.draft) await promote(s, _t('跑 SOP', 'Run SOP')); S.dialog = { type: 'sop' }; paintDialog(); }; run().catch(err => toast(err.message)); return; }
      S.toAi = true; submit(text); return;
    }
    if (t.dataset.mode) { S.approvalMode = t.dataset.mode; localStorage.setItem(MODE_KEY, S.approvalMode); closeMenus(); paintComposerChrome(); return; }
    if (t.dataset.decide) { const decide = async () => { const reason = t.dataset.decide === 'reject' ? await afPrompt({ title: _t('打回', 'Reject'), label: _t('打回原因', 'Rejection reason'), multiline: true, confirmText: _t('打回', 'Reject') }) : ''; if (t.dataset.decide === 'reject' && reason === null) return; await send('POST', '/api/spaces/' + space().id + '/decisions', { runId: t.dataset.run, nodeId: t.dataset.node, action: t.dataset.decide, reason: reason || '' }); await openSpace(space().id); }; decide().catch(err => toast(err.message)); return; }
    if (t.dataset.draft !== undefined) { confirmDraft(t.dataset.mid, Number(t.dataset.draft)); return; }
    if (t.dataset.lane) { S.panel = true; S.panelView = { type: 'lane', id: t.dataset.lane }; paint(); return; }
    if (t.dataset.artifact) { showArtifact(t.dataset.artifact).catch(err => toast(err.message)); return; }
    if (t.dataset.issue) { go('issues', t.dataset.issue); return; }
    if (t.dataset.invite) { send('POST', '/api/spaces/' + space().id + '/members', { userId: Number(t.dataset.invite), title: '' }).then(() => { S.dialog = null; return openSpace(space().id); }).catch(err => toast(err.message)); return; }
    if (t.dataset.openRun) { if (typeof openRunFromId === 'function') openRunFromId(t.dataset.openRun, { forceRuns: true }); else go('runs'); return; }
    const act = t.dataset.act;
    if (act === 'sidebar') { S.sidebar = !S.sidebar; paint(); }
    else if (act === 'new') newDraft();
    else if (act === 'classic') { localStorage.setItem('agentflow.chat.classic', '1'); location.reload(); }
    else if (act === 'pin') { const s = space(); send('PATCH', '/api/spaces/' + s.id, { pinned: !s.pinned }).then(() => openSpace(s.id)).catch(err => toast(err.message)); }
    else if (act === 'rename') beginRename(t);
    else if (act === 'stop') stopTurn().then(ok => { if (ok) toast(_t('已停止', 'Stopped')); }).catch(err => toast(err.message));
    else if (act === 'progress') { const s = space(); const lane = s?.lanes.find(l => l.status === 'running' || l.status === 'waiting' || l.status === 'queued') || s?.lanes[0]; S.panel = true; S.panelView = lane ? { type: 'lane', id: lane.runId || lane.id } : { type: 'overview' }; paint(); }
    else if (act === 'panel' || act === 'panel-home') { S.panel = true; S.panelView = { type: 'overview' }; paint(); }
    else if (act === 'panel-toggle') { S.panel = !S.panel; paint(); }
    else if (act === 'requirement') { S.dialog = { type: 'requirement' }; paintDialog(); }
    else if (act === 'invite') { S.dialog = { type: 'invite' }; paintDialog(); }
    else if (act === 'sop') { const s = space(); const run = async () => { if (s?.draft) await promote(s, _t('跑 SOP', 'Run SOP')); S.dialog = { type: 'sop' }; paintDialog(); }; run().catch(err => toast(err.message)); }
    else if (act === 'close') { S.dialog = null; paintDialog(); }
    else if (act === 'file') slots.composer.querySelector('.wb-file').click();
    else if (act === 'mention') { const ta = slots.composer.querySelector('textarea'); ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + '@'; ta.focus(); S.text = ta.value; }
    else if (act === 'target') { S.toAi = !S.toAi; paintComposerChrome(); }
    else if (act === 'send') submit();
    else if (act === 'save-req') saveRequirement();
    else if (act === 'save-sop') saveSop();
    else if (act === 'save-art') saveArtifact();
  }

  async function saveRequirement() {
    const s = space();
    const title = slots.dialog.querySelector('[data-field="title"]').value.trim();
    const description = slots.dialog.querySelector('[data-field="description"]').value.trim();
    const priority = slots.dialog.querySelector('[data-field="priority"]').value;
    if (!title) return toast(_t('写一个标题', 'Enter a title'));
    try {
      const id = s.draft ? await promote(s, title) : s.id;
      await send('POST', '/api/spaces/' + id + '/requirement', { title, description, priority });
      S.dialog = null;
      await openSpace(id);
    } catch (err) { toast(err.message); }
  }
  async function saveSop() {
    const ids = [...slots.dialog.querySelectorAll('input:checked')].map(el => el.value);
    if (!ids.length) return toast(_t('先选一个 SOP', 'Select an SOP first'));
    try {
      const r = await send('POST', '/api/spaces/' + space().id + '/sops', { workflowIds: ids, inputs: [] });
      S.dialog = null;
      S.panel = true;
      S.panelView = { type: 'overview' };
      if (r?.dispatchError) toast(r.dispatchError);
      await openSpace(space().id);
      const lane = space()?.lanes.find(l => l.status === 'running' || l.status === 'queued' || l.status === 'waiting') || space()?.lanes.at(-1);
      if (lane) { S.panel = true; S.panelView = { type: 'lane', id: lane.runId || lane.id }; paint(); }
    } catch (err) { toast(err.message); }
  }
  async function saveArtifact() {
    const title = slots.dialog.querySelector('[data-field="title"]').value.trim();
    const kind = slots.dialog.querySelector('[data-field="kind"]').value;
    const body = slots.dialog.querySelector('[data-field="body"]').value;
    if (!title) return toast(_t('写一个标题', 'Enter a title'));
    try {
      await send('POST', '/api/spaces/' + space().id + '/artifacts', { kind, title, body, format: 'markdown', announce: true });
      S.dialog = null;
      await openSpace(space().id);
    } catch (err) { toast(err.message); }
  }

  async function addFiles(list) {
    const s = space();
    if (!s) return;
    S.uploading = true;
    try {
      for (const file of list) {
        const form = new FormData();
        form.append('projectId', s.projectId);
        form.append('file', file, file.name || 'image.png');
        const res = await fetch('/api/assistant/attachments', { method: 'POST', credentials: 'include', body: form });
        const text = await res.text();
        if (!res.ok) throw new Error((JSON.parse(text).error) || _t('上传失败', 'Upload failed'));
        S.files.push(JSON.parse(text));
      }
      const box = slots.composer.querySelector('.wb-files');
      box.hidden = !S.files.length;
      box.innerHTML = S.files.map(f => `<span class="chip">${esc(f.name)}</span>`).join('');
    } catch (err) { toast(err.message); }
    finally { S.uploading = false; }
  }

  function mount(el) {
    host = el;
    host.innerHTML = '<div class="app codex embedded with-sidebar" data-app><aside class="sidebar" data-sidebar></aside><main class="main"><header class="space-header" data-header></header><div class="timeline" data-timeline></div><div data-composer></div></main><aside class="panel" data-panel></aside></div><div data-dialog></div><div data-toast></div>';
    slots = {
      app: host.querySelector('[data-app]'), sidebar: host.querySelector('[data-sidebar]'), header: host.querySelector('[data-header]'),
      timeline: host.querySelector('[data-timeline]'), composer: host.querySelector('[data-composer]'), panel: host.querySelector('[data-panel]'),
      dialog: host.querySelector('[data-dialog]'), toast: host.querySelector('[data-toast]'),
    };
    buildComposer();
    host.addEventListener('click', onClick);
    host.addEventListener('input', e => {
      if (!e.target.matches('[data-search]')) return;
      S.query = e.target.value;
      const pos = e.target.selectionStart;
      paintSidebar();
      const again = slots.sidebar.querySelector('[data-search]');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    host.querySelector('.wb-file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
    document.addEventListener('click', e => { if (!e.target.closest('.ai-compose-model,.ai-compose-mode')) closeMenus(); });
    document.getElementById('projectSwitcher')?.addEventListener('change', () => { if (space()?.draft) newDraft(); });
    boot();
  }

  window.LoopForgeWorkbench = { mount };
})();
