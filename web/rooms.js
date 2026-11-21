let roomsPollTimer = 0;

function roomProjectId() {
  return state.projectFilter || '';
}

function roomWorkflowChoices() {
  return (state.data?.workflows || []).filter(w => catalogGeneric(w)
    ? w.status !== 'draft'
    : w.status === 'published' && (catalogOwned(w.projectId) || catalogShared(w.projectId, w.shared)));
}

function roomWorkflowLabel(w) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  return (w.name || w.id) + (catalogGeneric(w) ? _t('（通用）', ' (Generic)') : '');
}

function activeRoom() {
  const rs = roomState();
  return (rs.items || []).find(item => item.id === rs.activeId) || null;
}

function roomGreeting() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const hour = new Date().getHours();
  const part = hour < 6 ? _t('凌晨好', 'Good night') : hour < 11 ? _t('早上好', 'Good morning') : hour < 14 ? _t('中午好', 'Good noon') : hour < 18 ? _t('下午好', 'Good afternoon') : _t('晚上好', 'Good evening');
  const user = state.currentUser;
  const name = user && !user.isGuest ? (user.chineseName || user.loginName || '') : '';
  return name ? part + _t('，', ', ') + name : part;
}

function roomState() {
  if (!state.rooms) state.rooms = {items: [], activeId: '', sops: [], active: false, mode: 'chat'};
  if (!Array.isArray(state.rooms.sops)) state.rooms.sops = [];
  if (state.rooms.mode !== 'issue') state.rooms.mode = 'chat';
  return state.rooms;
}

function setRoomMode(mode) {
  roomState().mode = mode === 'issue' ? 'issue' : 'chat';
  syncRoomComposer();
  $('#roomInput')?.focus();
}

function roomRunTerminal(status) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function bindRooms() {
  const create = $('#newRoom');
  const form = $('#roomComposer');
  if (!create || create.dataset.bound) return;
  create.dataset.bound = '1';
  create.onclick = createRoom;
  $('#renameRoom').onclick = renameRoom;
  $('#roomModeChat').onclick = () => setRoomMode('chat');
  $('#roomModeIssue').onclick = () => setRoomMode('issue');
  form.onsubmit = event => {
    event.preventDefault();
    submitRoomComposer();
  };
  $('#roomDispatch').onclick = () => {
    if (roomTargetPicked()) dispatchRoomIssue();
    else openRoomMention({targetsOnly: true});
  };
  const input = $('#roomInput');
  input.addEventListener('keydown', event => {
    if (roomMentionKey(event)) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submitRoomComposer();
    }
  });
  input.addEventListener('input', () => {
    syncRoomComposer();
    updateRoomMention();
  });
  input.addEventListener('click', updateRoomMention);
  document.addEventListener('mousedown', event => {
    if (!event.target.closest?.('.room-composer-box')) closeRoomMention();
  });
  $('#roomSOP').addEventListener('change', event => {
    const id = event.target.value;
    if (id) toggleRoomSOP(id, true);
    event.target.value = '';
  });
  document.addEventListener('change', event => {
    if (event.target?.id === 'projectSwitcher' && state.currentView === 'rooms') loadRooms();
  });
}

function toggleRoomSOP(id, force) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const rs = roomState();
  const has = rs.sops.includes(id);
  const want = force === undefined ? !has : force;
  if (want && !has) {
    if (rs.sops.length >= 5) return toast(_t('一次最多派给 5 条 SOP', 'You can dispatch up to 5 SOPs at once'));
    rs.sops.push(id);
  }
  if (!want && has) rs.sops = rs.sops.filter(item => item !== id);
  if ($('#roomSOPList')) fillRoomSOPList();
  else syncRoomComposer();
}

function roomTargetPicked() {
  return roomState().sops.length > 0;
}

function syncRoomComposer() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const rs = roomState();
  const issue = rs.mode === 'issue';
  const names = new Map(roomWorkflowChoices().map(w => [w.id, roomWorkflowLabel(w)]));
  rs.sops = rs.sops.filter(id => names.has(id));
  const picks = $('#roomSOPPicks');
  if (picks) {
    picks.innerHTML = rs.sops.map(id => `<button type="button" class="room-pick" data-unpick="${escapeHTML(id)}" title="${_t('移除', 'Remove')}">${escapeHTML(names.get(id))}<i>×</i></button>`).join('');
    picks.querySelectorAll('[data-unpick]').forEach(button => { button.onclick = () => toggleRoomSOP(button.dataset.unpick, false); });
  }
  $('#roomSOP')?.closest('.room-chip')?.classList.toggle('on', rs.sops.length > 0);
  $('#roomComposer')?.classList.toggle('is-issue', issue);
  $('#roomModeChat')?.classList.toggle('on', !issue);
  $('#roomModeIssue')?.classList.toggle('on', issue);
  const input = $('#roomInput');
  if (input) input.placeholder = issue ? _t('第一行写 Issue 标题，下面写描述。输入 @ 选择 SOP', 'First line is the issue title, below is the description. Type @ to select an SOP') : _t('发消息，输入 @ 提醒同事', 'Send a message, type @ to mention a teammate');
  const picked = roomTargetPicked();
  const dispatch = $('#roomDispatch');
  if (dispatch) {
    dispatch.textContent = !picked ? _t('建单并派发', 'Create & dispatch') : rs.sops.length > 1 ? _t(`建单并派发 ${rs.sops.length} 条 SOP`, `Create & dispatch ${rs.sops.length} SOPs`) : _t('建单并派发', 'Create & dispatch');
    dispatch.title = picked ? _t('第一行作为 Issue 标题，其余作为描述', 'First line is used as issue title; the rest as description') : _t('先选一条 SOP', 'Select an SOP first');
  }
  const hint = $('#roomTargetHint');
  if (hint) {
    hint.textContent = !picked
      ? _t('选择一条或多条 SOP。第一行是标题，回车建单。', 'Select one or more SOPs. First line is the title; press Enter to create.')
      : (rs.sops.length > 1 ? _t(`回车将并行派给 ${rs.sops.length} 条 SOP。`, `Press Enter to dispatch ${rs.sops.length} SOPs in parallel.`) : _t(`回车将建单并派给 SOP「${names.get(rs.sops[0])}」。`, `Press Enter to create & dispatch to SOP "${names.get(rs.sops[0])}".`));
  }
  $('#roomSend')?.classList.toggle('ready', !!input?.value.trim());
  document.querySelectorAll('[data-room-pick]').forEach(button => {
    button.classList.toggle('picked', rs.sops.includes(button.dataset.roomPick));
  });
}

async function loadRooms() {
  bindRooms();
  const rs = roomState();
  const projectId = roomProjectId();
  fillRoomTargets();
  if (!projectId) {
    renderRoomList([]);
    renderRoomThread(null, []);
    renderRoomResources(null);
    return;
  }
  try {
    const rooms = await api('/api/rooms?projectId=' + encodeURIComponent(projectId), {silent: true});
    rs.items = rooms || [];
    if (!rs.items.some(room => room.id === rs.activeId)) rs.activeId = rs.items[0]?.id || '';
    renderRoomList(rs.items);
    await openRoom(rs.activeId);
  } catch (error) {
    toast(error.message);
  }
}

// Poll faster while a dispatched run is still moving so progress feels live.
// Idle rooms back off to 15s; the server only reloads runs whose revision moved.
function scheduleRoomPoll() {
  clearTimeout(roomsPollTimer);
  const delay = roomState().active ? 4000 : 15000;
  roomsPollTimer = setTimeout(async () => {
    if (state.currentView === 'rooms' && roomState().activeId && !document.hidden) await refreshRoomMessages();
    if (state.currentView === 'rooms') scheduleRoomPoll();
  }, delay);
}

function fillRoomTargets() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const sop = $('#roomSOP');
  if (!sop) return;
  sop.innerHTML = `<option value="">${_t('添加 SOP…', 'Add SOP…')}</option>` + roomWorkflowChoices().map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(roomWorkflowLabel(item))}</option>`).join('');
  syncRoomComposer();
}

function renderRoomList(rooms) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const host = $('#roomList');
  const count = $('#roomCount');
  if (count) count.textContent = String(rooms.length);
  if (!host) return;
  if (!rooms.length) {
    host.innerHTML = `<div class="room-empty"><b>${_t('还没有群', 'No rooms yet')}</b><p>${_t('点右上角 ＋ 建一个群', 'Click + in the top right to create a room')}</p></div>`;
    return;
  }
  host.innerHTML = rooms.map(room => `<button type="button" class="room-item ${room.id === roomState().activeId ? 'active' : ''}" data-room="${escapeHTML(room.id)}"><i>#</i><span>${escapeHTML(room.name)}</span><small title="${_t('群成员（即项目成员）', 'Room members (project members)')}">${_t(`${(room.members || []).length} 人`, `${(room.members || []).length}`)}</small></button>`).join('');
  host.querySelectorAll('[data-room]').forEach(button => {
    button.onclick = () => openRoom(button.dataset.room);
  });
}

async function openRoom(id, keepScroll) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const rs = roomState();
  rs.activeId = id || '';
  renderRoomList(rs.items || []);
  const room = (rs.items || []).find(item => item.id === id);
  renderRoomResources(room);
  const title = $('#roomTitle');
  const subtitle = $('#roomSubtitle');
  const rename = $('#renameRoom');
  if (title) title.textContent = room?.name || _t('选择一个群', 'Select a room');
  if (subtitle) subtitle.textContent = room ? _t(`${(room.members || []).length} 位项目成员`, `${(room.members || []).length} project members`) : _t('先在左侧选择或新建一个群', 'Select or create a room on the left');
  if (rename) rename.hidden = !room;
  if (!id) {
    renderRoomThread(null, []);
    return;
  }
  try {
    const messages = await api('/api/rooms/' + encodeURIComponent(id) + '/messages', {silent: true});
    renderRoomThread(room, messages || [], keepScroll);
  } catch (error) {
    toast(error.message);
  }
  scheduleRoomPoll();
}

if (!window.__roomsVisibilityBound) {
  window.__roomsVisibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.currentView === 'rooms' && roomState().activeId) {
      refreshRoomMessages().then(scheduleRoomPoll);
    }
  });
}

async function refreshRoomMessages() {
  const rs = roomState();
  const id = rs.activeId;
  const log = $('#roomLog');
  if (!id || !log) return;
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  try {
    const messages = await api('/api/rooms/' + encodeURIComponent(id) + '/messages', {silent: true});
    if (rs.activeId !== id) return;
    const room = (rs.items || []).find(item => item.id === id);
    renderRoomThread(room, messages || [], !near);
  } catch {}
}

function roomResGroup(title, count, body) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  return `<section class="room-res-group"><div class="room-res-head"><span>${escapeHTML(title)}</span><em>${count}</em></div>${body || `<div class="room-res-more">${_t('暂无', 'None')}</div>`}</section>`;
}

const ROOM_MEMBER_ROLE_LABELS = {owner: '群主', maintainer: '维护者', member: '成员', viewer: '只读'};
function roomMemberRoleLabel(role) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const key = String(role || '').trim().toLowerCase();
  const zh = ROOM_MEMBER_ROLE_LABELS[key] || role || '成员';
  const enMap = {owner: 'Owner', maintainer: 'Maintainer', member: 'Member', viewer: 'Viewer'};
  return _t(zh, enMap[key] || role || 'Member');
}
function roomResItem(icon, iconClass, name, sub, pick) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const tag = pick ? 'button' : 'div';
  const attrs = pick ? ` type="button" data-room-pick="${escapeHTML(pick)}" title="${_t('点击选为派发对象', 'Click to select for dispatch')}"` : '';
  return `<${tag} class="room-res-item ${pick ? '' : 'static'}"${attrs}><span class="room-res-icon ${iconClass}">${escapeHTML(icon)}</span><span class="room-res-text"><b>${escapeHTML(name)}</b>${sub ? `<small>${escapeHTML(sub)}</small>` : ''}</span></${tag}>`;
}

function renderRoomResources(room) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const host = $('#roomResources');
  if (!host) return;
  if (!roomProjectId()) {
    host.innerHTML = `<div class="room-empty"><b>${_t('先选择项目', 'Select a project first')}</b><p>${_t('选好项目后，这里会列出群成员，SOP 可以搜索后派发。', 'Once a project is selected, room members and searchable SOPs appear here.')}</p></div>`;
    return;
  }
  const members = room?.members || [];
  const workflows = roomWorkflowChoices();
  host.innerHTML = [
    roomResGroup(_t('成员', 'Members'), members.length, members.length
      ? members.map(m => `<div class="room-res-item static"><span class="room-res-text"><b>${escapeHTML(m.name || (_t('用户 ', 'User ') + m.userId))}<span class="room-member-tag">${escapeHTML(roomMemberRoleLabel(m.role))}</span></b></span></div>`).join('')
      : `<div class="room-res-more">${_t('这个项目还没有其他成员', 'No other members in this project yet')}</div>`),
    roomResGroup('SOP', workflows.length, workflows.length
      ? `<input id="roomSOPSearch" class="room-sop-search" type="search" placeholder="${_t('搜索要派发的 SOP', 'Search SOPs to dispatch')}" value="${escapeHTML(roomState().sopQuery || '')}"><div id="roomSOPList"></div>`
      : roomNoSOPHint())
  ].join('');
  const search = $('#roomSOPSearch');
  if (search) {
    search.oninput = () => {
      roomState().sopQuery = search.value;
      fillRoomSOPList();
    };
  }
  fillRoomSOPList();
  bindRoomGoSOPs(host);
}

function fillRoomSOPList() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const list = $('#roomSOPList');
  if (!list) return;
  const rs = roomState();
  const query = String(rs.sopQuery || '').trim().toLowerCase();
  const picked = new Set(rs.sops);
  const all = roomWorkflowChoices();
  const rest = all.filter(w => !picked.has(w.id));
  const shown = query
    ? all.filter(w => roomWorkflowLabel(w).toLowerCase().includes(query) || String(w.id).toLowerCase().includes(query))
    : (rs.sopExpanded ? all : all.filter(w => picked.has(w.id)).concat(rest.slice(0, 4)));
  const hidden = query || rs.sopExpanded ? 0 : Math.max(0, rest.length - 4);
  const toggle = !query && rest.length > 4
    ? `<button type="button" class="room-res-more room-res-expand" data-room-sop-expand="${rs.sopExpanded ? 'collapse' : 'expand'}">${rs.sopExpanded ? _t('收起', 'Collapse') : _t('展开其余 ' + hidden + ' 条', 'Show ' + hidden + ' more')}</button>`
    : '';
  list.innerHTML = (shown.length
    ? shown.map(w => roomResItem('≡', 'sop', roomWorkflowLabel(w), (w.nodes || []).length ? _t(w.nodes.length + ' 个节点', w.nodes.length + ' steps') : _t('点选后进入建单', 'Click to use in issue'), w.id)).join('')
    : `<div class="room-res-more">${_t('没有匹配的 SOP', 'No matching SOPs')}</div>`)
    + toggle;
  list.querySelectorAll('[data-room-pick]').forEach(button => {
    button.onclick = () => {
      setRoomMode('issue');
      toggleRoomSOP(button.dataset.roomPick);
    };
  });
  list.querySelector('[data-room-sop-expand]')?.addEventListener('click', event => {
    rs.sopExpanded = event.currentTarget.dataset.roomSopExpand === 'expand';
    fillRoomSOPList();
  });
  syncRoomComposer();
}

function renderRoomThread(room, messages, keepScroll) {
  const log = $('#roomLog');
  if (!log) return;
  const previous = log.scrollTop;
  const rs = roomState();
  rs.active = messages.some(m => m.kind === 'dispatch' && m.runId && !m.runFinal && !roomRunTerminal(m.runStatus || ''));
  // Polls usually return the same thread; skip the rebuild so open 产出摘要,
  // text selection and scroll position survive.
  const signature = (room?.id || '') + '|' + JSON.stringify(messages);
  if (signature === rs.threadSignature && log.childElementCount) return;
  rs.threadSignature = signature;
  if (!room) {
    const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
    log.innerHTML = `<div class="room-hero"><h2>${escapeHTML(roomGreeting())}</h2><p>${roomProjectId() ? _t('在左侧新建或选择一个群开始协作', 'Create or select a room on the left to start collaborating') : _t('先在顶栏选择项目', 'Select a project from the top bar first')}</p></div>`;
    return;
  }
  const mine = Number(state.currentUser?.id) || 0;
  let prevRun = null;
  const dispatchRuns = new Set(messages.filter(m => m.kind === 'dispatch' && m.runId).map(m => m.runId));
  const visible = messages.filter(message => {
    if (message.kind === 'progress' && message.nodeId && message.nodeStatus === 'succeeded') return false;
    if (message.kind === 'progress' && !message.nodeId && dispatchRuns.has(message.runId)) return false;
    return true;
  });
  log.innerHTML = visible.map(message => {
    const html = roomMessageHTML(message, mine, prevRun);
    if (['dispatch', 'progress', 'approval'].includes(message.kind)) prevRun = message;
    else if (message.kind !== 'decision') prevRun = null;
    return html;
  }).join('') || roomGuideHTML();
  log.querySelector('[data-room-try-chat]')?.addEventListener('click', () => setRoomMode('chat'));
  log.querySelector('[data-room-try-issue]')?.addEventListener('click', () => {
    setRoomMode('issue');
    if (!roomTargetPicked()) openRoomMention({targetsOnly: true});
  });
  bindRoomGoSOPs(log);
  log.querySelectorAll('[data-open-issue]').forEach(button => {
    button.onclick = () => openIssueDetail(button.dataset.openIssue);
  });
  log.querySelectorAll('[data-open-run]').forEach(button => {
    button.onclick = () => { location.hash = '#/runs/' + encodeURIComponent(button.dataset.openRun); };
  });
  log.querySelectorAll('[data-decide]').forEach(button => {
    button.onclick = () => decideRoomStep(button.dataset.decide, button.dataset.run, button.dataset.node, button.dataset.name);
  });
  if (keepScroll) log.scrollTop = previous;
  else log.scrollTop = log.scrollHeight;
}

function roomRunStatusLabel(status) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const zh = {running: '运行中', waiting: '等待处理', succeeded: '已完成', failed: '失败', cancelled: '已取消', queued: '排队中'}[status] || status || '排队中';
  const en = {running: 'Running', waiting: 'Waiting', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled', queued: 'Queued'}[status] || status || 'Queued';
  return _t(zh, en);
}

function roomIsSOPAuthor(name) {
  return /^SOP「.*」$/.test(String(name || ''));
}

function roomAuthorName(name) {
  return roomIsSOPAuthor(name) ? String(name).slice(4, -1) : String(name || '');
}

function roomAvatar(name) {
  if (roomIsSOPAuthor(name)) return '<span class="room-avatar sop">SOP</span>';
  return `<span class="room-avatar">${escapeHTML(String(name || '?').slice(0, 1))}</span>`;
}

function roomDispatchHTML(message, author) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const failed = message.dispatchError ? `<p class="room-card-error">${_t('派发未成功：', 'Dispatch failed: ')}${escapeHTML(message.dispatchError)}</p>` : '';
  const key = message.issueNumber ? '#' + message.issueNumber + ' ' : '';
  let run = '';
  if (message.runId) {
    const total = message.runTotal || 0;
    const done = message.runCompleted || 0;
    const pct = total ? Math.round(done * 100 / total) : 0;
    const status = message.runStatus || message.runFinal || 'queued';
    const current = (message.runCurrent || []).length ? _t('正在：', 'Current: ') + message.runCurrent.join(_t('、', ', ')) : '';
    run = `<div class="room-run ${escapeHTML(status)}"><div class="room-run-head"><b>${escapeHTML(message.workflowName || 'SOP')}</b><span>${escapeHTML(roomRunStatusLabel(status))}${total ? _t(` · ${done}/${total} 步`, ` · ${done}/${total} steps`) : ''}</span></div><div class="room-run-track"><i style="width:${pct}%"></i></div>${current ? `<small>${escapeHTML(current)}</small>` : ''}</div>`;
  } else if (!message.dispatchError && !message.workflowId) {
    run = `<small class="room-card-note">${_t('当时只指定了角色，没有启动 SOP', 'Assigned Role only; no SOP started')}</small>`;
  }
  const head = message.lane ? _t(`${author} 并行派发`, `${author} dispatched in parallel`) : _t(`${author} 建了 Issue`, `${author} created issue`);
  const actions = `<div class="room-card-actions"><button type="button" class="button ghost small" data-open-issue="${escapeHTML(message.issueId)}">${_t('打开 Issue', 'Open issue')}</button>${message.runId ? `<button type="button" class="button ghost small" data-open-run="${escapeHTML(message.runId)}">${_t('查看运行', 'View run')}</button>` : ''}</div>`;
  return `<article class="room-message room-card ${message.dispatchError ? 'failed' : ''}"><header>${head}</header><b>${escapeHTML(key + (message.issueTitle || 'Issue'))}</b>${message.lane ? '' : `<p>${_t('派给 ', 'Dispatched to ')}${escapeHTML(message.targetName || _t('未指定', 'Unassigned'))}</p>`}${message.body ? `<p>${escapeHTML(message.body)}</p>` : ''}${failed}${run}${actions}</article>`;
}

function roomProgressHTML(message, prev) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const status = message.nodeStatus || '';
  const icon = status === 'succeeded' ? '✓' : status === 'failed' ? '✗' : status === 'cancelled' ? '■' : '•';
  const lines = String(message.body || '').split('\n');
  const head = lines.shift();
  const rest = lines.join('\n').trim();
  const detail = rest ? `<details><summary>${_t('产出摘要', 'Output summary')}</summary><p>${escapeHTML(rest)}</p></details>` : '';
  const final = !message.nodeId;
  // Consecutive steps of one run already sit under its card; repeat the
  // issue / SOP only when the thread switches to another run or chat.
  const sameRun = prev && prev.runId && prev.runId === message.runId;
  const sop = roomIsSOPAuthor(message.author);
  const where = sameRun ? '' : [message.issueNumber ? '#' + message.issueNumber : '', sop ? '' : message.workflowName || ''].filter(Boolean).join(' · ');
  return `<article class="room-progress ${escapeHTML(status)} ${final ? 'final' : ''}">${roomAvatar(message.author)}<div><header><b>${escapeHTML(roomAuthorName(message.author) || 'SOP')}</b>${where ? `<span>${escapeHTML(where)}</span>` : ''}</header><p><i>${icon}</i>${escapeHTML(head)}</p>${detail}</div></article>`;
}

function roomApprovalHTML(message) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const attrs = `data-run="${escapeHTML(message.runId)}" data-node="${escapeHTML(message.nodeId)}" data-name="${escapeHTML(message.nodeName || message.nodeId)}"`;
  if (message.resolved) {
    return `<div class="room-decision">${escapeHTML(message.nodeName || _t('审批', 'Approval'))} ${_t('已处理', 'resolved')} · <button type="button" class="room-link" data-open-run="${escapeHTML(message.runId)}">${_t('看运行', 'View run')}</button></div>`;
  }
  const actions = `<div class="room-card-actions"><button type="button" class="button primary small" data-decide="approve" ${attrs}>${_t('批准', 'Approve')}</button>${message.canReject ? `<button type="button" class="button ghost small" data-decide="reject" ${attrs}>${_t('打回', 'Reject')}</button>` : ''}<button type="button" class="button ghost small" data-open-run="${escapeHTML(message.runId)}">${_t('看运行', 'View run')}</button></div>`;
  const where = [message.issueNumber ? '#' + message.issueNumber : '', message.issueTitle || ''].filter(Boolean).join(' ');
  return `<article class="room-message room-card room-approval ${message.resolved ? 'resolved' : ''}"><header>${escapeHTML(roomAuthorName(message.author) || 'SOP')} · ${escapeHTML(where)}</header><b>${message.resolved ? '✓' : '⏸'} ${escapeHTML(message.nodeName || '')} ${message.resolved ? _t('审批已处理', 'Approval resolved') : _t('等待审批', 'Awaiting approval')}</b>${message.resolved ? '' : `<p>${escapeHTML(message.body || '')}</p>`}${actions}</article>`;
}

function roomMessageHTML(message, mine, prev) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const own = mine > 0 && Number(message.userId) === mine;
  const author = escapeHTML(message.author || _t('群成员', 'Member'));
  switch (message.kind) {
    case 'dispatch': return roomDispatchHTML(message, author);
    case 'progress': return roomProgressHTML(message, prev);
    case 'approval': return roomApprovalHTML(message);
    case 'decision': return `<div class="room-decision"><b>${author}</b> ${escapeHTML(message.body || '')}</div>`;
  }
  return `<article class="room-message ${own ? 'mine' : ''}"><header>${author}</header><p>${roomTextHTML(message.body || '')}</p></article>`;
}

// roomTextHTML escapes a chat line and highlights @mentions; mentions of the
// current user get an extra class so they stand out.
function roomTextHTML(text) {
  const me = String(state.currentUser?.loginName || '').toLowerCase();
  const names = (activeRoom()?.members || []).map(m => escapeHTML(m.name || '')).filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(^|\\s)@(${names.length ? names.join('|') + '|' : ''}[A-Za-z0-9_.-]+)`, 'g');
  return escapeHTML(text).replace(pattern, (all, lead, name) => {
    const mine = me && name.toLowerCase().startsWith(me);
    return `${lead}<span class="room-at${mine ? ' me' : ''}">@${name}</span>`;
  });
}

function roomNoSOPHint() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  return `<div class="room-res-more">${_t('当前项目还没有可派发的 SOP。', 'No dispatchable SOPs in this project yet.')}<button type="button" class="room-link" data-room-go-sops>${_t('去「SOP 流程」新建或复制一条', 'Go to SOPs to create or copy one')}</button></div>`;
}

function bindRoomGoSOPs(host) {
  host?.querySelectorAll('[data-room-go-sops]').forEach(button => {
    button.onclick = () => switchView('sops');
  });
}

function roomGuideHTML() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const noSOP = !roomWorkflowChoices().length;
  return `<div class="room-guide">
    <h2>${escapeHTML(roomGreeting())}</h2>
    <p class="room-guide-lead">${_t('在这里聊天，或者把一条需求派给 SOP。角色写在流程里，不用再选。', 'Chat here or dispatch a requirement to an SOP. Roles are already configured inside each SOP.')}</p>
    <ol>
      <li><b>${_t('聊天', 'Chat')}</b><span>${_t('回车发送，Shift+Enter 换行。<code>@</code> 用来提醒同事。', 'Enter sends, Shift+Enter adds a line. Type <code>@</code> to mention teammates.')}</span></li>
      <li><b>${_t('建单', 'Issue')}</b><span>${_t('切到「建单」，选一条或多条 SOP，第一行写标题，回车就派发。', 'Switch to Issue, select one or more SOPs, write the title on the first line, and press Enter.')}</span></li>
    </ol>
    <div class="room-guide-actions"><button type="button" class="button ghost small" data-room-try-chat>${_t('发一条消息', 'Send a message')}</button><button type="button" class="button primary small" data-room-try-issue>${_t('建一张单', 'Create an issue')}</button>${noSOP ? `<button type="button" class="button ghost small" data-room-go-sops>${_t('当前项目还没有 SOP，去流程模板', 'No SOPs yet; open templates')}</button>` : ''}</div>
  </div>`;
}

function roomMentionState() {
  const rs = roomState();
  if (!rs.mention) rs.mention = {open: false, items: [], index: 0, start: -1, targetsOnly: false};
  return rs.mention;
}

function roomMentionToken(input) {
  const before = input.value.slice(0, input.selectionStart);
  const match = before.match(/(^|\s)@([^\s@]{0,30})$/);
  return match ? {start: before.length - match[2].length - 1, query: match[2]} : null;
}

function roomMentionItems(query, targetsOnly) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const q = String(query || '').trim().toLowerCase();
  const hit = (...values) => !q || values.some(value => String(value || '').toLowerCase().includes(q));
  const items = [];
  const wantSOP = targetsOnly || roomState().mode === 'issue';
  if (wantSOP) {
    roomWorkflowChoices().forEach(w => {
      if (hit(w.name, w.id)) items.push({kind: 'sop', id: w.id, name: roomWorkflowLabel(w), sub: (w.nodes || []).length ? _t(w.nodes.length + ' 个步骤，派发后立即运行', w.nodes.length + ' steps; starts immediately on dispatch') : _t('派发后立即运行', 'Starts immediately on dispatch')});
    });
  }
  if (!targetsOnly) {
    (activeRoom()?.members || []).forEach(m => {
      if (hit(m.name)) items.push({kind: 'member', id: String(m.userId), name: m.name || _t('用户 ', 'User ') + m.userId, sub: roomMemberRoleLabel(m.role)});
    });
  }
  return items.slice(0, 40);
}

function openRoomMention({targetsOnly = false, token = null} = {}) {
  const ms = roomMentionState();
  ms.open = true;
  ms.targetsOnly = targetsOnly;
  ms.start = token ? token.start : -1;
  ms.items = roomMentionItems(token?.query || '', targetsOnly);
  ms.index = 0;
  renderRoomMention(token?.query || '');
}

function closeRoomMention() {
  const ms = roomMentionState();
  ms.targetsOnly = false;
  if (!ms.open) return;
  ms.open = false;
  const box = $('#roomMention');
  if (box) box.hidden = true;
}

function updateRoomMention() {
  const input = $('#roomInput');
  if (!input) return;
  const token = roomMentionToken(input);
  if (token && (!token.query || roomMentionItems(token.query, false).length)) openRoomMention({token});
  else if (!roomMentionState().targetsOnly) closeRoomMention();
}

function renderRoomMention(query) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const box = $('#roomMention');
  const ms = roomMentionState();
  if (!box) return;
  const groups = [['sop', _t('SOP · 建单并运行', 'SOP · Create & run')], ['member', _t('成员 · 提醒', 'Members · Mention')]];
  let html = ms.targetsOnly ? `<div class="room-mention-title">${_t('选这条 Issue 要跑的 SOP', 'Select the SOP to run for this issue')}</div>` : '';
  groups.forEach(([kind, label]) => {
    const rows = ms.items.map((item, index) => ({item, index})).filter(row => row.item.kind === kind);
    if (!rows.length && !(kind === 'sop' && !query && !roomWorkflowChoices().length)) return;
    html += `<div class="room-mention-group">${escapeHTML(label)}</div>`;
    if (!rows.length) html += roomNoSOPHint();
    html += rows.map(({item, index}) => `<button type="button" class="room-mention-item ${index === ms.index ? 'active' : ''}" data-mention="${index}"><span class="room-res-icon ${item.kind === 'member' ? '' : item.kind}">${escapeHTML(item.kind === 'sop' ? '≡' : (item.name || '?').slice(0, 1))}</span><span><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.sub || '')}</small></span></button>`).join('');
  });
  if (!ms.items.length && !html.includes('room-mention-group')) html += `<div class="room-mention-empty">${roomState().mode === 'issue' || ms.targetsOnly ? _t(`没有匹配「${escapeHTML(query)}」的 SOP 或成员`, `No SOPs or members matching "${escapeHTML(query)}"`) : _t(`没有匹配「${escapeHTML(query)}」的成员`, `No members matching "${escapeHTML(query)}"`)}</div>`;
  box.innerHTML = html;
  box.hidden = false;
  box.querySelectorAll('[data-mention]').forEach(button => {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => pickRoomMention(ms.items[Number(button.dataset.mention)]);
  });
  bindRoomGoSOPs(box);
  box.querySelector('.room-mention-item.active')?.scrollIntoView({block: 'nearest'});
}

function roomMentionKey(event) {
  const ms = roomMentionState();
  if (!ms.open || event.isComposing) return false;
  if (event.key === 'Escape') {
    event.preventDefault();
    ms.targetsOnly = false;
    closeRoomMention();
    return true;
  }
  if (!ms.items.length) return false;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    ms.index = (ms.index + (event.key === 'ArrowDown' ? 1 : ms.items.length - 1)) % ms.items.length;
    renderRoomMention(roomMentionToken($('#roomInput'))?.query || '');
    return true;
  }
  if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
    event.preventDefault();
    pickRoomMention(ms.items[ms.index]);
    return true;
  }
  return false;
}

function pickRoomMention(item) {
  const input = $('#roomInput');
  const ms = roomMentionState();
  if (!item || !input) return;
  if (ms.start >= 0) {
    const caret = input.selectionStart;
    const insert = item.kind === 'member' ? '@' + item.name + ' ' : '';
    input.value = input.value.slice(0, ms.start) + insert + input.value.slice(caret).replace(/^ /, insert ? '' : '');
    const next = ms.start + insert.length;
    input.setSelectionRange(next, next);
  }
  if (item.kind === 'sop') {
    roomState().mode = 'issue';
    toggleRoomSOP(item.id, true);
  }
  ms.targetsOnly = false;
  closeRoomMention();
  syncRoomComposer();
  input.focus();
  if (item.kind === 'sop' && !input.value.trim()) toast((typeof lfT === 'function' ? lfT : z => z)('已选好 SOP，第一行写 Issue 标题，回车建单', 'SOP selected. Write issue title on line 1 and press Enter'));
}

async function decideRoomStep(action, runId, nodeId, name) {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const id = roomState().activeId;
  if (!id) return;
  let reason = '';
  if (action === 'reject') {
    reason = await afPrompt({title: _t('打回「' + name + '」', 'Reject "' + name + '"'), message: _t('说明要改什么，会带给被打回的步骤。', 'Explain what needs changes; this is passed to the rejected step.'), label: _t('打回原因', 'Rejection reason'), placeholder: _t('例如：边界情况没覆盖', 'e.g. Edge cases not covered'), confirmText: _t('打回', 'Reject')});
    if (reason == null) return;
  }
  try {
    await api('/api/rooms/' + encodeURIComponent(id) + '/decisions', {method: 'POST', body: JSON.stringify({runId, nodeId, action, reason: String(reason || '').trim()})});
    toast(action === 'approve' ? _t('已批准', 'Approved') : _t('已打回', 'Rejected'));
    await refreshRoomMessages();
  } catch (error) {
    toast(error.message);
  }
}

async function renameRoom() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const room = activeRoom();
  if (!room) return toast(_t('先选择一个群', 'Select a room first'));
  const name = await afPrompt({title: _t('重命名协作群', 'Rename room'), message: _t('新名称会显示在左侧群列表和顶栏。', 'The new name appears in the room list and header.'), label: _t('群名称', 'Room name'), placeholder: _t('例如：需求值班群', 'e.g. Triage Room'), defaultValue: room.name, confirmText: _t('保存', 'Save')});
  if (name == null) return;
  const next = String(name).trim();
  if (!next || next === room.name) return;
  try {
    const updated = await api('/api/rooms/' + encodeURIComponent(room.id), {method: 'PATCH', body: JSON.stringify({name: next})});
    room.name = updated.name || next;
    renderRoomList(roomState().items || []);
    const title = $('#roomTitle');
    if (title) title.textContent = room.name;
    toast(_t('已重命名', 'Renamed'));
  } catch (error) {
    toast(error.message);
  }
}

async function createRoom() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const projectId = roomProjectId();
  if (!projectId) return toast(_t('先在顶栏选择项目', 'Select a project from the top bar first'));
  const name = await afPrompt({title: _t('新建协作群', 'Create room'), message: _t('群名称会显示在当前项目的群列表里。', 'Room name appears in the project room list.'), label: _t('群名称', 'Room name'), placeholder: _t('例如：需求值班群', 'e.g. Triage Room'), confirmText: _t('创建', 'Create')});
  if (!name || !String(name).trim()) return;
  try {
    const room = await api('/api/rooms', {method: 'POST', body: JSON.stringify({projectId, name: String(name).trim()})});
    roomState().activeId = room.id;
    await loadRooms();
    toast(_t('已创建协作群', 'Room created'));
  } catch (error) {
    toast(error.message);
  }
}

function submitRoomComposer() {
  if (roomState().mode === 'issue') dispatchRoomIssue();
  else sendRoomMessage();
}

async function sendRoomMessage() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const id = roomState().activeId;
  const input = $('#roomInput');
  const body = input?.value.trim();
  if (!id) return toast(_t('先选择一个群', 'Select a room first'));
  if (!body) return;
  try {
    await api('/api/rooms/' + encodeURIComponent(id) + '/messages', {method: 'POST', body: JSON.stringify({body})});
    input.value = '';
    closeRoomMention();
    syncRoomComposer();
    await openRoom(id);
  } catch (error) {
    toast(error.message);
  }
}

function splitRoomIssueText(text) {
  const lines = String(text || '').split('\n');
  const title = (lines.shift() || '').trim().slice(0, 200);
  return {title, description: lines.join('\n').trim()};
}

async function dispatchRoomIssue() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const rs = roomState();
  const id = rs.activeId;
  if (!id) return toast(_t('先选择一个群', 'Select a room first'));
  const {title, description} = splitRoomIssueText($('#roomInput')?.value);
  const workflowIds = rs.sops.slice();
  if (!title) return toast(_t('第一行写 Issue 标题', 'Write issue title on line 1'));
  if (!workflowIds.length) return toast(_t('请选择要派发的 SOP', 'Select at least one SOP to dispatch'));
  const button = $('#roomDispatch');
  button.disabled = true;
  try {
    const result = await api('/api/rooms/' + encodeURIComponent(id) + '/issues', {method: 'POST', body: JSON.stringify({title, description, workflowIds})});
    $('#roomInput').value = '';
    rs.sops = [];
    rs.mode = 'chat';
    closeRoomMention();
    syncRoomComposer();
    if (result.issue) {
      const items = state.data.issues || [];
      const index = items.findIndex(issue => issue.id === result.issue.id);
      if (index >= 0) items[index] = result.issue;
      else items.unshift(result.issue);
      state.data.issues = items;
    }
    await openRoom(id);
    const started = (result.tasks || []).length;
    toast(result.dispatchError ? _t('Issue 已创建，部分派发未成功：', 'Issue created, partial dispatch failed: ') + result.dispatchError : (started ? _t(`已建单并启动 ${started} 条 SOP，进度会显示在卡片上`, `Created issue and started ${started} SOP(s); progress appears on the card`) : _t('Issue 已创建，但没有启动 SOP', 'Issue created, no SOP started')));
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

bindRooms();
if ((state.currentView || activeViewName()) === 'rooms') loadRooms();
