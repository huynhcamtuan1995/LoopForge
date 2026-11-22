function setIssueView(view, rerender=true){
  state.issueView=view==='kanban'?'kanban':'table';
  localStorage.setItem('agentflow.issueView',state.issueView);
  $$('[data-issue-view]').forEach(b=>b.classList.toggle('active',b.dataset.issueView===state.issueView));
  if(rerender&&state.data)renderIssues();
}

function enhanceIssueFilters(){
  ['#issueStatusFilter','#issueAssigneeFilter','#issueRunFilter','#sourceFilter'].forEach(sel=>window.enhanceSelect?.($(sel)));
}

// Items keep the click handlers app.js assigns; the menu only adds open/close
// and keyboard behaviour around them.
function bindIssueHeadingMenu(){
  const trigger=$('#issueHeadingMore'),menu=$('#issueHeadingMenu');
  if(!trigger||!menu||trigger.dataset.menuBound)return;
  trigger.dataset.menuBound='1';
  const items=()=>[...menu.querySelectorAll('[role="menuitem"]')].filter(el=>!el.hidden&&!el.disabled);
  let open=false;
  const close=focusTrigger=>{
    if(!open)return;
    open=false;
    window.HuiSelect?.release(close);
    menu.classList.remove('is-open');
    menu.inert=true;
    trigger.setAttribute('aria-expanded','false');
    if(focusTrigger)trigger.focus();
  };
  const show=(focusLast=false)=>{
    if(open)return;
    window.HuiSelect?.claim(close);
    open=true;
    menu.inert=false;
    menu.classList.add('is-open');
    trigger.setAttribute('aria-expanded','true');
    const list=items();
    (focusLast?list[list.length-1]:list[0])?.focus();
  };
  trigger.addEventListener('click',e=>{e.stopPropagation();open?close(true):show()});
  trigger.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show(e.key==='ArrowUp')}
  });
  menu.addEventListener('keydown',e=>{
    const list=items(),at=list.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();close(true)}
    else if(e.key==='Tab')close(false);
    else if(e.key==='ArrowDown'){e.preventDefault();list[(at+1)%list.length]?.focus()}
    else if(e.key==='ArrowUp'){e.preventDefault();list[(at-1+list.length)%list.length]?.focus()}
    else if(e.key==='Home'){e.preventDefault();list[0]?.focus()}
    else if(e.key==='End'){e.preventDefault();list[list.length-1]?.focus()}
  });
  menu.addEventListener('click',e=>{if(e.target.closest('[role="menuitem"]'))close(false)});
  document.addEventListener('pointerdown',e=>{if(open&&!trigger.contains(e.target)&&!menu.contains(e.target))close(false)});
  window.addEventListener('resize',()=>close(false),{passive:true});
}

function renderIssueAssigneeFilter(projectIssues=[]){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const sel=$('#issueAssigneeFilter');if(!sel)return;
  const current=state.issueAssigneeFilter||'';
  const members=projectMembers(state.projectFilter);
  const userMap=new Map();
  members.forEach(m=>{
    const u=userById(m.userId);
    if(u)userMap.set(String(u.id), userDisplay(u));
  });
  projectIssues.forEach(i=>{
    if(i.assigneeUserId){
      const uid=String(i.assigneeUserId);
      if(!userMap.has(uid)){
        const u=userById(i.assigneeUserId);
        userMap.set(uid, u?userDisplay(u):_t(`用户 ${uid}`,`User ${uid}`));
      }
    }else if(i.assigneeId&&i.assigneeType==='agent'){
      const aid=String(i.assigneeId);
      if(!userMap.has(aid)){
        const a=(state.data.agents||[]).find(x=>x.id===aid);
        userMap.set(aid, a?.name?`Agent: ${a.name}`:`Agent: ${aid}`);
      }
    }
    (i.sopBindings||[]).forEach(b=>{
      const uid=Number(b.assigneeUserId)||0;
      if(!uid)return;
      const key=String(uid);
      if(userMap.has(key))return;
      const u=userById(uid);
      userMap.set(key, u?userDisplay(u):_t(`用户 ${key}`,`User ${key}`));
    });
  });
  const owns=(i,id)=>String(i.assigneeUserId)===id||String(i.assigneeId)===id||(i.sopBindings||[]).some(b=>String(b.assigneeUserId)===id);
  const meta=n=>n?` data-meta="${_t(`${n} 条`,`${n}`)}"`:'';
  const unassigned=projectIssues.filter(i=>!i.assigneeUserId&&!i.assigneeId&&!(i.sopBindings||[]).some(b=>b.assigneeUserId)).length;
  let html=`<option value="">${escapeHTML(_t('全部责任人','All owners'))}</option><option value="unassigned"${meta(unassigned)}${current==='unassigned'?' selected':''}>${escapeHTML(_t('未指定责任人','Unassigned'))}</option>`;
  for(const [id, label] of userMap.entries()){
    html+=`<option value="${escapeHTML(id)}"${meta(projectIssues.filter(i=>owns(i,id)).length)}${current===id?' selected':''}>${escapeHTML(label)}</option>`;
  }
  sel.innerHTML=html;
  sel.value=current;
}

function normalizeIssueTitleSearch(value){
  return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
}

function issueMatchesQuery(issue,project,query){
  const raw=String(query||'').trim().toLocaleLowerCase();
  if(!raw)return true;
  const title=String(issue?.title||''),normalizedTitle=normalizeIssueTitleSearch(title),normalizedQuery=normalizeIssueTitleSearch(raw);
  const titleTokens=raw.split(/[\s\p{P}\p{S}]+/u).map(normalizeIssueTitleSearch).filter(Boolean);
  if(normalizedQuery&&normalizedTitle.includes(normalizedQuery))return true;
  if(titleTokens.length&&titleTokens.every(token=>normalizedTitle.includes(token)))return true;
  const key=`${project?.key||'ISS'}-${issue?.number||''}`,external=issue?.externalRef?.externalId||issue?.externalRef?.externalIid||'';
  return `${key} ${title} ${issue?.description||''} ${external}`.toLocaleLowerCase().includes(raw);
}

function filteredIssues(){
  const projects=state.data.projects||[];
  let issues=(state.data.issues||[]).filter(i=>!state.projectFilter||i.projectId===state.projectFilter);
  if(state.sourceFilter)issues=issues.filter(i=>(i.source||'local')===state.sourceFilter);
  if(state.issueStatusFilter)issues=issues.filter(i=>issueMatchesStatusFilter(i,state.issueStatusFilter));
  if(state.issueAssigneeFilter){
    if(state.issueAssigneeFilter==='unassigned'){
      issues=issues.filter(i=>!i.assigneeUserId&&!i.assigneeId&&!(i.sopBindings||[]).some(b=>b.assigneeUserId));
    }else{
      issues=issues.filter(i=>String(i.assigneeUserId)===state.issueAssigneeFilter||String(i.assigneeId)===state.issueAssigneeFilter||(i.sopBindings||[]).some(b=>String(b.assigneeUserId)===state.issueAssigneeFilter));
    }
  }
  if(state.issueRunFilter==='mr')issues=issues.filter(i=>pendingDeliveryMRCount(i)>0);
  else if(state.issueRunFilter)issues=issues.filter(i=>issueRunHealth(i)===state.issueRunFilter);
  if(state.issueQuery){
    issues=issues.filter(i=>issueMatchesQuery(i,projects.find(x=>x.id===i.projectId),state.issueQuery));
  }
  const priority={urgent:0,high:1,medium:2,low:3};
  return [...issues].sort((a,b)=>issueHealthRank(a)-issueHealthRank(b)||(priority[a.priority]??4)-(priority[b.priority]??4)||(b.number||0)-(a.number||0));
}

function renderIssues(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const tapdImport=document.querySelector("#importTAPDIssue");if(tapdImport)tapdImport.hidden=!currentProject()?.tapdWorkspaceId;
  watchClarifyingIssues();
  const projectIssues=(state.data.issues||[]).filter(i=>!state.projectFilter||i.projectId===state.projectFilter);
  renderProjectContext(projectIssues);
  renderIssueAssigneeFilter(projectIssues);
  const statusSel=$('#issueStatusFilter');if(statusSel&&statusSel.value!==state.issueStatusFilter)statusSel.value=state.issueStatusFilter||'';
  const issues=filteredIssues();
  syncIssueSelection(issues);
  const paged=state.issueView==='kanban'?null:paginateList('issues',issues);
  const visibleIssues=paged?paged.items:issues;
  renderIssueBulkActions(visibleIssues);
  $$('[data-issue-view]').forEach(b=>b.classList.toggle('active',b.dataset.issueView===state.issueView));
  const board=$('#issueBoard');
  board.classList.toggle('kanban-mode',state.issueView==='kanban');
  if(state.issueView==='kanban'){
    board.innerHTML=renderIssueKanban(issues);
    bindIssueKanban();
    bindIssueSelection(visibleIssues);
    return;
  }
  const emptyTitle=state.issueRunFilter==='attention'?_t('没有需要介入的工作项','No issues need attention'):state.issueRunFilter==='mr'?_t('没有待处理 MR 的需求','No requirements with pending MRs'):_t('当前项目没有匹配的工作项','No matching issues in this project');
  const emptyHint=state.issueRunFilter==='attention'?_t('待确认澄清结论、门禁失败、运行失败或已中断的工作项会显示在这里。','Items needing clarification confirmation, gate failures, failed runs, or interruptions appear here.'):state.issueRunFilter==='mr'?_t('已提 MR 但还没合入的需求会显示在这里。','Requirements with open MRs not yet merged appear here.'):_t('从 GitHub 同步，或在本平台新建需求。','Sync from GitHub or create a new requirement here.');
  const keyWidth=issueKeyColumnWidth(paged.items);
  const pager=pagerHTML('issues',paged)||(paged.total?`<nav class="pager pager-summary" aria-label="${escapeHTML(_t('分页','Pagination'))}"><span class="pager-meta">${escapeHTML(_t(`共 ${paged.total} 条`,`${paged.total} total`))}</span></nav>`:'');
  board.innerHTML=`<div class="issue-table-card"><div class="issue-table-scroll"><div class="issue-table${state.issueSelectionMode?' issue-table-selectable':''}" data-page-anchor="issues" style="--issue-col-key:${keyWidth}"><div class="issue-table-row issue-table-head" role="row">${state.issueSelectionMode?`<div class="issue-select-cell">${issueSelectAllCheckbox(_t('全选本页可删除的需求','Select all deletable issues on this page'))}</div>`:''}<span>${_t('编号','Key')}</span><span>${_t('标题','Title')}</span><span>${_t('来源','Source')}</span><span>${_t('责任人','Owner')}</span><span>${_t('仓库','Repository')}</span><span>${_t('优先级','Priority')}</span><span>${_t('关联 SOP','Bound SOP')}</span><span>${_t('当前环节','Stage')}</span><span>${_t('进度','Progress')}</span><span>${_t('操作','Actions')}</span></div><div class="issue-table-body">${paged.items.map(issueRow).join('')||`<div class="issue-table-empty">${huiIcon('search')}<b>${emptyTitle}</b><p>${emptyHint}</p></div>`}</div></div></div>${pager}</div>`;
  $$('.issue-table-row[data-id]').forEach(el=>el.onclick=()=>openIssueDetail(el.dataset.id));
  bindIssueRowActions(board);
  bindPager(board);
  bindIssueSelection(visibleIssues);
}

let clarifyPoll=null;
function watchClarifyingIssues(){
  const busy=(state.data.issues||[]).some(i=>i.clarification?.status==='analyzing')||issueClarifyJobs.size>0;
  if(busy&&!clarifyPoll)clarifyPoll=setInterval(()=>{if(!document.hidden)refreshIssues()},4000);
  if(!busy&&clarifyPoll){clearInterval(clarifyPoll);clarifyPoll=null}
}

function issueKanbanCard(i){
  const {project:p,run,workflow:w}=issueExecution(i);
  const stage=issueCurrentStage(i);
  const progress=issueListProgress(i,run,w);
  const key=issueKeyLabel(i);
  const convo=conversationIssueProgress(i,run);
  // 对话工作区在会话删除后会被取消，那不是失败。
  const isFailed=!conversationWorkspaceIssue(i,run)&&Boolean(run&&(['failed','cancelled'].includes(run.status)||issueHasFailedNode(run)));
  const needsConfirm=clarificationNeedsConfirm(i);
  const cardTone=needsConfirm?' needs-confirm':(isFailed?' needs-attention':'');
  return `<article class="kanban-card${cardTone}" draggable="true" data-id="${escapeHTML(i.id)}">
    <div class="kanban-card-top"><b>${escapeHTML(key)}</b>${issueSelectionCheckbox(i)}</div>
    <h4 title="${escapeHTML(i.title)}">${issueTitleMarkup(i.title)}</h4>
    <div class="kanban-card-meta">
      ${issuePriorityMarkup(i.priority)}
      <span class="kanban-stage ${stage.key}" title="${escapeHTML(stage.hint||'')}">${issueStageBadge(stage)}</span>
    </div>
    ${convo?`<div class="kanban-card-progress${convo.done?' done':convo.ended?' ended':''}" title="${escapeHTML(convo.title)}"><span>${escapeHTML(convo.text)}</span><div class="issue-progress-track"><i style="width:${convo.width}%"></i></div></div>`:`<div class="kanban-card-progress${progress.pct>=100&&!isFailed?' done':''}"><span>${progress.done}/${progress.total||'—'} · ${progress.pct}%</span><div class="issue-progress-track"><i style="width:${progress.pct}%"></i></div></div>`}
    <div class="kanban-card-actions">${issueActionButtons(i)}</div>
  </article>`;
}

function renderIssueKanban(issues){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return `<div class="kanban-board">${issueStatuses.map(([status])=>{
    const col=issues.filter(i=>(i.status||'backlog')===status);
    return `<section class="kanban-column" data-status="${status}">
      <header>${huiIcon(issueStatusIcon(status))}<b>${issueStatusLabel(status)}</b><span>${col.length}</span></header>
      <div class="kanban-column-body">${col.map(issueKanbanCard).join('')||`<div class="kanban-empty">${huiIcon('check')}${escapeHTML(_t('暂无卡片','No cards'))}</div>`}</div>
    </section>`;
  }).join('')}</div>`;
}

let kanbanDragMoved=false;
function bindIssueKanban(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  $$('.kanban-card').forEach(card=>{
    card.ondragstart=e=>{
      kanbanDragMoved=false;
      e.dataTransfer.setData('text/plain',card.dataset.id);
      e.dataTransfer.effectAllowed='move';
      card.classList.add('dragging');
    };
    card.ondrag=()=>{kanbanDragMoved=true};
    card.ondragend=()=>card.classList.remove('dragging');
    card.onclick=()=>{if(kanbanDragMoved){kanbanDragMoved=false;return}openIssueDetail(card.dataset.id)};
  });
  bindIssueRowActions($('#issueBoard'));
  $$('.kanban-column').forEach(col=>{
    col.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';col.classList.add('drop-target')};
    col.ondragleave=e=>{if(!col.contains(e.relatedTarget))col.classList.remove('drop-target')};
    col.ondrop=async e=>{
      e.preventDefault();
      col.classList.remove('drop-target');
      const id=e.dataTransfer.getData('text/plain');
      const issue=(state.data.issues||[]).find(i=>i.id===id);
      const next=col.dataset.status;
      if(!issue||(issue.status||'backlog')===next)return;
      const prev=issue.status;
      issue.status=next;
      renderIssues();
      try{
        await persistIssue(issue);
        toast(_t('状态已更新','Status updated'),'ok');
      }catch(err){
        issue.status=prev;
        renderIssues();
        toast(err.message,'err');
      }
    };
  });
}
function issueStatusLabel(value){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return ({backlog:_t('待规划','Backlog'),todo:_t('待处理','To do'),in_progress:_t('进行中','In progress'),in_review:_t('评审中','In review'),done:_t('已完成','Done'),blocked:_t('已阻塞','Blocked'),cancelled:_t('已取消','Cancelled'),closed:_t('已关闭','Closed')}[value]||value||'—');
}
function issueStatusIcon(value){return ({backlog:'circle',todo:'clock',in_progress:'user-hold',in_review:'pending-review',done:'check',closed:'close',blocked:'alert',cancelled:'close'}[value]||'circle')}
function huiIcon(name,cls=''){return `<svg class="agent-icon harness-icon${cls?` ${cls}`:''}" data-icon="${escapeHTML(name)}" width="14" height="14" aria-hidden="true" focusable="false"></svg>`}
// stage.key alone is not enough: 「已关闭」 shares closed with merged deliveries.
function issueStageTone(stage){
  const key=stage?.key||'',label=String(stage?.label||'');
  if(key==='active')return /排队|queued/i.test(label)?{tone:'info',icon:'clock'}:{tone:'info',icon:'lamp'};
  if(key==='waiting')return {tone:'warn',icon:'user-hold'};
  if(key==='confirm')return {tone:'warn',icon:'pending-review'};
  if(key==='clarifying')return {tone:'warn',icon:'user-hold'};
  if(key==='attention')return {tone:'error',icon:'alert'};
  if(key==='closed')return ['已完成','交付闭环','MR 已合入','已合入基线','Done','Delivered','MR merged','Integrated to baseline'].includes(label)?{tone:'success',icon:'check'}:{tone:'neutral',icon:'close'};
  return {tone:'neutral',icon:'circle'};
}
function issueStageBadge(stage){
  const {tone,icon}=issueStageTone(stage);
  const mark=icon==='lamp'?'<span class="hui-lamp" aria-hidden="true"><i></i></span>':huiIcon(icon);
  return `<span class="hui-badge" data-tone="${tone}" data-stage-icon="${icon}">${mark}<span class="hui-badge-label">${escapeHTML(stage?.label||'')}</span></span>`;
}
function issuePriorityMarkup(value){
  const pri=value||'medium';
  const icon={urgent:'priority-bolt',high:'priority-high',medium:'priority-medium',low:'priority-low'}[pri]||'priority-medium';
  return `<span class="issue-priority ${escapeHTML(pri)}">${huiIcon(icon)}<span>${issuePriorityLabel(pri)}</span></span>`;
}
// 来源：GitHub、工蜂与 TAPD 由外部同步，其余都算平台新建；取值与来源筛选器保持一致。
function issueSourceLabel(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const s=metricsIssueSource(i);
  if(s==='github')return 'GitHub';
  if(s==='gongfeng')return _t('工蜂','Gongfeng');
  if(s==='tapd')return 'TAPD';
  return _t('平台新建','Platform');
}
function issueSourceMarkup(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const s=metricsIssueSource(i)||'local';
  const tone=s==='github'?'github':s==='gongfeng'?'gongfeng':s==='tapd'?'tapd':'local';
  const label=issueSourceLabel(i);
  return `<span class="issue-source-chip tone-${tone}" title="${escapeHTML(_t('需求来源：','Source: '))}${escapeHTML(label)}">${escapeHTML(label)}</span>`;
}
// 与顶栏、项目成员保持一致：复用统一头像组件（真实头像 + 首字回退），不再自绘姓氏。
function issueOwnerAvatar(i){
  if(!i.assigneeUserId&&i.assigneeId&&i.assigneeType==='agent')return `<span class="hui-avatar is-agent" aria-hidden="true">${huiIcon('robot')}</span>`;
  // 未指定责任人时只留「未指定」文字，不再额外画一个占位头像框。
  if(!i.assigneeUserId&&!i.assigneeId)return '';
  const user=i.assigneeUserId?userById(i.assigneeUserId):null;
  if(!user)return `<span class="hui-avatar is-empty" aria-hidden="true">${huiIcon('user')}</span>`;
  return `<span class="issue-assignee-avatar">${userAvatarHTML(user,48)}</span>`;
}
function issueStatusText(issue){
  return issueStatusLabel(issueStatusBucket(issue));
}
function issueWaitingToExecute(i){
  if(!i||issueManuallyClosed(i)||issueTrackerClosed(i)||deliveryLocked(i)||issueInPlanning(i)||issueFinished(i))return false;
  const status=i.status||'backlog';
  if(status==='done'||status==='cancelled')return false;
  if(status==='todo')return true;
  // “待执行”只补充尚未进入业务流转的 backlog；进行中、评审中和
  // 已阻塞必须留在各自的状态筛选中，即使它们暂时没有 Run。
  if(status!=='backlog')return false;
  const stage=issueCurrentStage(i);
  return stage.key==='not_started'||stage.key==='clarifying'||stage.label==='等待执行'||stage.label==='Pending run';
}
function issueFinished(i){
  if(!i)return false;
  if(issueMergedDelivery(i))return true;
  if(issueManuallyClosed(i)||issueTrackerClosed(i))return false;
  if(deliveryLocked(i))return deliveryLockedLabel(i)!=='关闭'&&deliveryLockedLabel(i)!=='Closed';
  if(issueExternallyDone(i))return true;
  const {run}=issueExecution(i);
  if(run?.status==='succeeded')return true;
  return !run&&(i.status||'')==='done';
}
function issueStatusBucket(issue){
  if(!issue)return 'backlog';
  if((issue.status==='closed'||issueTrackerClosed(issue))&&!issueMergedDelivery(issue))return 'closed';
  const stage=issueCurrentStage(issue);
  if(stage.key==='closed'){
    const label=stage.label||'';
    if(['已关闭','关闭','MR 已关闭','工蜂已关闭','Closed','MR closed','Gongfeng closed'].includes(label))return 'closed';
    if(['已完成','交付闭环','MR 已合入','已合入基线','Done','Delivered','MR merged','Integrated to baseline'].includes(label))return 'done';
  }
  return issue.status||'backlog';
}
function issueMatchesStatusFilter(issue,filter){
  return !filter||issueStatusBucket(issue)===filter;
}
function issuePriorityLabel(value){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return ({urgent:_t('紧急','Urgent'),high:_t('高','High'),medium:_t('中','Medium'),low:_t('低','Low')}[value]||value||'—');
}
function taskStatusLabel(value){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return ({queued:_t('排队中','Queued'),dispatched:_t('已调度','Dispatched'),running:_t('运行中','Running'),completed:_t('已完成','Completed'),failed:_t('失败','Failed'),cancelled:_t('已取消','Cancelled')}[value]||value||'—');
}
function issueKeyLabel(i){
  if(i.source==='gongfeng'&&i.externalRef?.externalIid) return `#${i.externalRef.externalIid}`;
  if(i.source==='tapd'&&i.externalRef?.externalId) return String(i.externalRef.externalId);
  const p=(state.data.projects||[]).find(x=>x.id===i.projectId);
  return `${p?.key||'ISS'}-${i.number||''}`;
}
function issueKeyMarkup(i){
  const raw=String(issueKeyLabel(i)||'');
  const m=raw.match(/^(.*?)(\d+)$/);
  if(!m) return `<span class="issue-key-num">${escapeHTML(raw)}</span>`;
  return `<span class="issue-key-prefix">${escapeHTML(m[1])}</span><span class="issue-key-num">${escapeHTML(m[2])}</span>`;
}
function issueKeyColumnWidth(issues){
  let maxLen=0;
  for(const i of (issues||[])){
    const len=String(issueKeyLabel(i)||'').length;
    if(len>maxLen)maxLen=len;
  }
  if(maxLen>=10)return '120px';
  if(maxLen>=7)return '96px';
  return '76px';
}
function issueTagTone(tag){
  const t=String(tag||'').toLowerCase();
  if(/bug|缺陷|故障/.test(t)) return 'danger';
  if(/巡检|监控|告警|inspect|monitor|alert/i.test(t)) return 'warn';
  if(/mr|审查|review/i.test(t)) return 'accent';
  if(/前端|ui|交互|frontend/i.test(t)) return 'cyan';
  return 'neutral';
}
function issueTitleMarkup(title){
  const tags=[];
  let rest=String(title||'');
  const re=/^\s*(?:\[([^[\]【】]{1,24})\]|【([^[\]【】]{1,24})】)\s*/;
  let m;
  while((m=rest.match(re))){tags.push(m[1]||m[2]);rest=rest.slice(m[0].length)}
  rest=rest.trim()||title||'';
  const pills=tags.map(t=>`<span class="issue-title-tag tone-${issueTagTone(t)}" title="${escapeHTML(t)}">${escapeHTML(t)}</span>`).join('');
  return `${pills}<b title="${escapeHTML(title||'')}">${escapeHTML(rest)}</b>`;
}
function issueListProgress(i,run,w){
  const raw=run?runProgress(run):{done:0,total:w?.nodes?.length||0,pct:0};
  const forgedClose=deliveryLocked(i)&&String(i?.deliveryMrState||'').toLowerCase()==='closed'&&!deliveryMRLinked(i);
  if((deliveryLocked(i)&&!forgedClose)||gongfengIssueClosed(i)||run?.status==='succeeded'){
    const total=raw.total||w?.nodes?.length||Object.keys(run?.nodes||{}).length||raw.done||0;
    return {done:total||raw.done,total:total||raw.done,pct:100};
  }
  return raw;
}
function issueRow(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const {project:p,run,workflow:w}=issueExecution(i),boundRepos=(state.data.repositories||[]).filter(x=>(i.repositoryIds||[]).includes(x.id)||x.id===i.repositoryId||(!((i.repositoryIds||[]).length||i.repositoryId)&&x.id===p?.defaultRepositoryId)),issueRepos=[boundRepos.find(x=>x.id===i.repositoryId),...boundRepos.filter(x=>x.id!==i.repositoryId)].filter(Boolean),repo=issueRepos[0],unbound=_t('未绑定','Unbound'),repoLabel=issueRepos.length>1?_t(`${repo?.name||unbound} 等${issueRepos.length}个`,`${repo?.name||unbound} +${issueRepos.length-1}`):repo?.name||unbound,health=issueRunHealth(i),stage=issueCurrentStage(i),progress=issueListProgress(i,run,w);
  const sop=issueSOPLabel(i);
  const laneDots=issueLaneDots(i);
  const convo=conversationIssueProgress(i,run);
  const isFailed=!conversationWorkspaceIssue(i,run)&&Boolean(run&&(['failed','cancelled'].includes(run.status)||issueHasFailedNode(run)));
  const needsConfirm=clarificationNeedsConfirm(i);
  let progressText=`${progress.pct}%`;
  let progressCls='';
  let progressTitle=_t(`${progress.done}/${progress.total||0} 节点`,`${progress.done}/${progress.total||0} nodes`);
  let trackWidth=progress.pct;
  if(convo){
    progressText=convo.text;
    progressCls=convo.done?' done':convo.ended?' ended':'';
    trackWidth=convo.width;
    progressTitle=convo.title;
  }else if(isFailed){
    progressText=_t('失败','Failed');
    progressCls=' fail';
    trackWidth=0;
    progressTitle=_t(`门禁或脚本执行失败（${progress.done}/${progress.total||0} 节点）`,`Gate or script failed (${progress.done}/${progress.total||0} nodes)`);
  }else if(needsConfirm){
    progressText=_t('需要确认结论','Confirm conclusion');
    progressCls=' confirm';
    trackWidth=100;
    progressTitle=_t('澄清已完成，需要确认结论后再触发 SOP','Clarification complete; confirm the conclusion before triggering the SOP');
  }else if(progress.pct>=100){
    progressCls=' done';
  }
  const rowTone=needsConfirm?' needs-confirm':(isFailed?' needs-attention':'');
  const owner=issueOwnerSummary(i);
  const pri=i.priority||'medium';
  return `<div class="issue-table-row${rowTone}" role="row" data-id="${escapeHTML(i.id)}">${state.issueSelectionMode?`<div class="issue-select-cell">${issueSelectionCheckbox(i)}</div>`:''}<div class="issue-key-cell" title="${escapeHTML(String(issueKeyLabel(i)||''))}">${issueKeyMarkup(i)}</div><div class="issue-title-cell">${issueTitleMarkup(i.title)}</div><div class="issue-source-cell">${issueSourceMarkup(i)}</div><div class="issue-assignee-cell" title="${escapeHTML(owner)}">${issueOwnerAvatar(i)}<span class="issue-assignee-name">${escapeHTML(owner)}</span></div><div class="issue-repository-cell" title="${escapeHTML(issueRepos.map(r=>r.name).join(_t('、',', '))||unbound)} · ${escapeHTML(i.baseBranch||repo?.defaultBranch||'')}">${escapeHTML(repoLabel)}</div><div class="issue-priority-cell">${issuePriorityMarkup(pri)}</div><div class="issue-workflow-cell" title="${escapeHTML(sop)}">${escapeHTML(sop)}${laneDots}</div><div class="issue-stage-cell ${stage.key}" title="${escapeHTML(stage.hint)}">${issueStageBadge(stage)}</div><div class="issue-progress-cell${progressCls}" title="${escapeHTML(progressTitle)}"><b>${escapeHTML(progressText)}</b><span class="issue-progress-track"><i style="width:${trackWidth}%"></i></span></div><div class="issue-actions-cell">${issueActionButtons(i)}</div></div>`;
}

let refreshIssuesPending=null;
async function refreshIssues(){if(refreshIssuesPending)return refreshIssuesPending;refreshIssuesPending=(async()=>{try{const opt={silent:true};const [issues,tasks,runs]=await Promise.all([api('/api/issues',opt),api('/api/tasks',opt),api('/api/runs',opt)]);state.data.issues=issues;state.data.tasks=tasks;state.data.runs=runs;updateApprovalBadge();renderIssues();if(state.drawerOpen&&state.issueDetailData?.issue?.id){const curId=state.issueDetailData.issue.id,updatedIssue=issues.find(i=>i.id===curId);if(updatedIssue){const curTask=latestIssueTask(updatedIssue),curRunId=curTask?.runId||latestIssueRun(updatedIssue,curTask)?.id,curRun=curRunId?(runs||[]).find(r=>r.id===curRunId):null;const keepClarifyStream=state.issueDetailTab==='clarify'&&(state.issueDetailData.issue.clarification?.status||'')==='analyzing'&&(updatedIssue.clarification?.status||'')==='analyzing';state.issueDetailData.issue=updatedIssue;state.issueDetailData.task=curTask;if(curRun){const previous=state.issueDetailData.run;state.issueDetailData.run=previous?.id===curRun.id&&previous.workflowSnapshot?.nodes?.length?{...previous,...curRun,workflowSnapshot:previous.workflowSnapshot}:curRun;}try{const snap=await api(`/api/issues/${encodeURIComponent(curId)}/requirement`,opt);if(snap)state.issueDetailData.requirement=snap}catch(e){}if(!keepClarifyStream)renderIssueDetailTab()}}}catch(e){toast(e.message)}finally{refreshIssuesPending=null}})();return refreshIssuesPending}
function fillIssueRepositories(projectId,selected){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#issueForm'),project=(state.data.projects||[]).find(p=>p.id===projectId),repos=(state.data.repositories||[]).filter(r=>r.projectId===projectId),box=$('#issueRepoChecks');
  if(!box)return;
  const def=project?.defaultRepositoryId;
  const sel=Array.isArray(selected)?selected:(selected?[selected]:repos.map(r=>r.id));
  box.innerHTML=repos.map(r=>{
    const checked=sel.includes(r.id)?' checked':'';
    return `<label class="repo-check"><input type="checkbox" value="${escapeHTML(r.id)}"${checked}><span>${escapeHTML(r.name)} · ${escapeHTML(r.defaultBranch)}${r.id===def?_t('（默认）',' (default)'):''}</span></label>`;
  }).join('');
}
function selectedIssueRepositoryIds(){
  return [...document.querySelectorAll('#issueRepoChecks input[type="checkbox"]:checked')].map(i=>i.value).filter(Boolean);
}
// Older records stored the configured main branch in baseBranch automatically.
// Apply compatibility only when reading saved issues, never to new form input.
function storedIssueWorkBranch(issue){
  const project=(state.data.projects||[]).find(p=>p.id===issue.projectId);
  const ids=[...new Set([...(issue.repositoryIds||[]),issue.repositoryId].filter(Boolean))];
  if(!ids.length&&project?.defaultRepositoryId)ids.push(project.defaultRepositoryId);
  if(ids.length!==1)return '';
  const repo=(state.data.repositories||[]).find(r=>r.id===ids[0]);
  if(issue.repositoryBranches)return String(issue.repositoryBranches[ids[0]]||'').trim();
  const branch=String(issue.baseBranch||'').trim();
  return branch===String(repo?.defaultBranch||'').trim()?'':branch;
}
function updateIssueBaseBranchInput(input,hint,repositoryIds){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!input)return;
  const repos=(state.data.repositories||[]).filter(r=>(repositoryIds||[]).includes(r.id));
  const ids=JSON.stringify(repos.map(r=>r.id).sort());
  if(repos.length!==1||(input.dataset.repositoryIds&&input.dataset.repositoryIds!==ids))input.value='';
  input.dataset.repositoryIds=ids;
  input.disabled=repos.length!==1;
  const mainBranch=repos.length===1?repos[0].defaultBranch:'';
  input.placeholder=mainBranch?_t(`留空从主分支 ${mainBranch} 新建`,`Leave blank to branch from ${mainBranch}`):_t('留空从各仓库配置的主分支新建','Leave blank to branch from default branch');
  if(hint)hint.textContent=repos.length!==1?_t('指定继续开发分支时请选择一个仓库；留空从各仓库配置的主分支分别新建工作分支。','Select a single repository to specify an existing branch; leave blank to branch from each default branch.'):_t('留空从配置主分支新建工作分支；填写时直接继续该已有分支，不新建。','Leave blank to create a new branch from default; enter a branch name to continue on it directly.');
}
function refreshIssueBaseBranchInput(){
  renderIssueRepositoryBranchInputs($('#issueForm')?.elements.baseBranch,$('#issueBaseBranchHint'),$('#issueRepositoryBranches'),selectedIssueRepositoryIds());
}
function selectedIssueRepositoryBranches(input,host){
  const branches={};
  let ids=[];try{ids=JSON.parse(input?.dataset.repositoryIds||'[]')}catch{}
  if(ids.length===1)branches[ids[0]]=input.value.trim();
  host?.querySelectorAll('[data-repository-branch]').forEach(el=>{branches[el.dataset.repositoryBranch]=el.value.trim()});
  return branches;
}
function renderIssueRepositoryBranchInputs(input,hint,host,repositoryIds,branches){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!input||!host)return;
  branches=branches||selectedIssueRepositoryBranches(input,host);
  const repos=repositoryIds.map(id=>(state.data.repositories||[]).find(r=>r.id===id)).filter(Boolean);
  updateIssueBaseBranchInput(input,hint,repositoryIds);
  input.hidden=repos.length>1;
  if(repos.length===1)input.value=branches[repos[0].id]||'';
  host.hidden=repos.length<2;
  host.innerHTML=repos.length<2?'':repos.map(repo=>`<label class="repository-branch-row"><span>${escapeHTML(repo.name)}</span><input class="input" data-repository-branch="${escapeHTML(repo.id)}" aria-label="${escapeHTML(_t(`${repo.name} 的继续开发分支`,`Existing branch for ${repo.name}`))}" value="${escapeHTML(branches[repo.id]||'')}" placeholder="${escapeHTML(repo.defaultBranch?_t(`留空从主分支 ${repo.defaultBranch} 新建`,`Leave blank to branch from ${repo.defaultBranch}`):_t('留空从配置主分支新建','Leave blank to branch from default branch'))}" autocomplete="off"></label>`).join('');
  if(repos.length>1&&hint)hint.textContent=_t('分别填写各仓库的已有功能分支，直接继续开发；留空的仓库从各自配置的主分支新建工作分支。','Specify existing branches per repository to continue directly; blank repositories branch from their default branch.');
}
function fillIssueAssignees(projectId,value=''){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#issueForm'),picker=$('#issueAssigneePicker');if(!f||!picker)return;
  const project=(state.data.projects||[]).find(p=>p.id===projectId),selected=Number(value)||Number(state.currentUser?.id)||Number(project?.ownerId)||0;
  picker.innerHTML=userCombobox('assigneeUserId',selected,_t('使用项目 Owner','Use project owner'));
  bindUserSearches(f);
}
function openIssue(issue=null){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  state.selectedIssue=issue?.id||null;
  const f=$('#issueForm'),projects=state.data.projects||[];
  f.elements.projectId.innerHTML=projects.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  f.elements.workflowId.innerHTML=`<option value="">${escapeHTML(_t('使用来源默认流程','Use source default SOP'))}</option>`+runnableWorkflowOptions().map(w=>`<option value="${w.id}">${escapeHTML(w.name)}</option>`).join('');
  const v=issue||{id:'',projectId:state.projectFilter||projects[0]?.id||'',title:'',description:'',priority:'medium',status:'backlog',workflowId:'',repositoryId:'',repositoryIds:[],baseBranch:''};
  ['id','projectId','title','description','priority','status','workflowId','baseBranch','tapdId'].forEach(k=>f.elements[k].value=v[k]||'');
  f.elements.baseBranch.value=storedIssueWorkBranch(v);
  f.elements.automationIgnored.checked=v.automationState==='ignored';
  fillIssueRepositories(v.projectId,(v.repositoryIds&&v.repositoryIds.length)?v.repositoryIds:(v.repositoryId?[v.repositoryId]:null));
  fillIssueAssignees(v.projectId,v.assigneeUserId||'');
  f.elements.workflowId.disabled=false;
  if(!f.elements.workflowId.value)f.elements.workflowId.value=defaultSOPForIssue(v);
  let workflowTouched=Boolean(v.workflowId);
  f.elements.workflowId.onchange=()=>{workflowTouched=true};
  delete f.elements.baseBranch.dataset.repositoryIds;
  renderIssueRepositoryBranchInputs(f.elements.baseBranch,$('#issueBaseBranchHint'),$('#issueRepositoryBranches'),selectedIssueRepositoryIds(),v.repositoryBranches||{[v.repositoryId]:storedIssueWorkBranch(v)});
  f.elements.projectId.onchange=()=>{fillIssueRepositories(f.elements.projectId.value);fillIssueAssignees(f.elements.projectId.value,'');renderIssueRepositoryBranchInputs(f.elements.baseBranch,$('#issueBaseBranchHint'),$('#issueRepositoryBranches'),selectedIssueRepositoryIds(),{})};
  $('#issueRepoChecks').onchange=refreshIssueBaseBranchInput;
  $('#issueModalTitle').textContent=issue?`${(projects.find(p=>p.id===v.projectId)?.key||'ISS')}-${v.number} ${v.title}`:_t('新建工作项','New Issue');
  const task=(state.data.tasks||[]).find(t=>t.id===v.latestTaskId);
  let stateHtml=task?_t(`最近任务 ${escapeHTML(task.id)} · ${taskStatusLabel(task.status)} · Run ${escapeHTML(task.runId)}`,`Latest task ${escapeHTML(task.id)} · ${taskStatusLabel(task.status)} · Run ${escapeHTML(task.runId)}`):'';
  if(v.automationState==='ignored')stateHtml+=`${stateHtml?'<br>':''}${_t('定时 SOP：<b>已忽略</b>','Scheduled SOP: <b>Ignored</b>')}`;
  if(v.deliveryState==='merged')stateHtml+=`${stateHtml?'<br>':''}${_t(`交付状态：<b>${escapeHTML(deliveryLockedLabel(v))}，需要重新打开后才能触发</b>`,`Delivery status: <b>${escapeHTML(deliveryLockedLabel(v))}, reopen required before triggering</b>`)}`;
  if(v.externalRef){stateHtml+=`<br>${_t('外部来源','External source')}: <b>${escapeHTML(v.externalRef.source)}</b> · <a href="${escapeHTML(safeURL(v.externalRef.externalUrl))}" target="_blank" rel="noopener noreferrer">${escapeHTML(v.externalRef.externalId)}</a> · ${_t('状态','Status')}: ${escapeHTML(v.externalRef.externalState||'—')}`}
  $('#issueTaskState').innerHTML=stateHtml;
  const reopenBtn=$('#reopenDeliveredIssue'),dispatchBtn=$('#dispatchIssue');
  if(reopenBtn){
    const locked=issue&&deliveryLocked(v);
    reopenBtn.hidden=!locked;
    reopenBtn.onclick=locked?()=>reopenDeliveredIssue(issue.id):null;
  }
  if(dispatchBtn)dispatchBtn.style.display=issue&&!issueExecutionBlocked(v)?'':'none';
  const isNew=!issue?.id,box=$('#issueSyncTargetBox'),note=$('#issueBoundNote');
  const manualBinding=$('#issueManualTapdBinding');
  const showManualBinding=()=>{if(manualBinding)manualBinding.hidden=true};
  if(box){
    box.hidden=true;
    box.querySelectorAll('input[name="syncTarget"]').forEach(el=>{
      el.checked=isNew&&el.value==='local';
      el.required=isNew;
      el.onchange=()=>{showManualBinding();if(!workflowTouched)f.elements.workflowId.value=defaultSOPForIssue({source:el.value,kind:el.value==='gongfeng'?'issue':'requirement'})};
    });
  }
  showManualBinding();
  if(note){note.hidden=isNew||!v.externalRef;const text=$('#issueBoundNoteText');if(text&&v.externalRef){const src=v.externalRef.source==='github'?'GitHub Issue':v.externalRef.source==='tapd'?'TAPD':v.externalRef.source==='gongfeng'?_t('工蜂 Issue','Gongfeng Issue'):_t('外部','External');const id=v.externalRef.externalIid||v.externalRef.externalId||'';text.innerHTML=_t(`已关联 ${src} <b>${escapeHTML(String(id))}</b>。保存只改本平台记录，不会回写外部单据。`,`Linked to ${src} <b>${escapeHTML(String(id))}</b>. Saving only updates the local record and will not write back to the external tracker.`)}}
  const submit=document.querySelector('#issueForm button[type="submit"]');
  if(submit)submit.textContent=isNew?_t('创建需求','Create Issue'):_t('保存','Save');
  $('#issueModal').classList.add('open');
}
function issueFromForm(){
  const f=$('#issueForm'),id=f.elements.id.value,old=canonicalIssue(id);
  const assigneeUserId=Number(f.elements.assigneeUserId?.value)||0;
  const syncTarget=document.querySelector('#issueForm [name="syncTarget"]:checked')?.value||'';
  const source=old.source||(id?'local':syncTarget);
  const workflowId=f.elements.workflowId.value||defaultSOPForIssue({...old,source});
  const repositoryIds=selectedIssueRepositoryIds(),status=f.elements.status.value;
  const closeSource=status==='closed'?(old.status==='closed'?old.closeSource||'manual':'manual'):'';
  return {...old,id,projectId:f.elements.projectId.value,title:f.elements.title.value.trim(),description:f.elements.description.value,priority:f.elements.priority.value,status,closeSource,automationState:f.elements.automationIgnored.checked?'ignored':'eligible',source,workflowId,repositoryId:repositoryIds[0]||'',repositoryIds,baseBranch:f.elements.baseBranch.value.trim(),repositoryBranches:selectedIssueRepositoryBranches(f.elements.baseBranch,$('#issueRepositoryBranches')),assigneeUserId,tapdId:source==='local'?f.elements.tapdId.value.trim():'',externalRef:trackerRefOf(old)||old.externalRef||undefined};
}

// ParseGongfengRepoURL 与后端 domain.ParseGongfengRepoURL 保持一致：把粘贴的
// 将完整的仓库链接和克隆地址解析成统一的仓库信息。
// repoDisplayPath shows host/path for a parsed repository, e.g. github.com/owner/name.
function repoDisplayPath(info,fallback=''){return info?.provider==='ssh'?(info.project||info.cloneUrl||fallback):info?.webUrl?String(info.webUrl).replace(/^https?:\/\//,''):String(fallback||'')}
function repoProviderLabel(info){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const labels={ssh:'Git SSH',https:'Git HTTPS',github:'GitHub',gongfeng:_t('工蜂','Gongfeng')};
  return labels[info?.provider]||'Git';
}
function parseGongfengRepoURL(raw){
  const sshInfo=globalThis.LoopForgeGitSSH?.(raw);if(sshInfo)return sshInfo;
  const managed=globalThis.LoopForgeGongfengRepository?.(raw,state.data?.gongfengHost);if(managed)return managed;
  const httpsInfo=globalThis.LoopForgeGitHTTPS?.(raw);if(httpsInfo)return httpsInfo;
  let publicURL=String(raw||'').trim().replace(/^git clone /,'').replace(/^github:/,'https://github.com/').replace(/^(?:git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)/,'https://github.com/');
  if(publicURL.startsWith('github.com/'))publicURL='https://'+publicURL;
  try{const u=new URL(publicURL);if(u.hostname==='github.com'&&!u.username&&!u.password&&['http:','https:'].includes(u.protocol)){const parts=u.pathname.split('/').filter(Boolean),owner=parts[0],name=(parts[1]||'').replace(/\.git$/,'');if(parts.length>=2&&/^[A-Za-z0-9_.-]+$/.test(owner)&&/^[A-Za-z0-9_.-]+$/.test(name)&&!['.','..'].includes(owner)&&!['.','..'].includes(name))return {project:'github:'+owner+'/'+name,name,webUrl:'https://github.com/'+owner+'/'+name,cloneUrl:'https://github.com/'+owner+'/'+name+'.git',provider:'github'}}}catch(_){}

  return null;
}
// fillRepositoryFromLink 把解析结果填进空缺字段；显式填过的字段不覆盖。
function fillRepositoryFromLink(url,fill){
  const info=parseGongfengRepoURL(url);
  if(!info)return false;
  fill.gongfengProjectId=['ssh','https'].includes(info.provider)?'':info.project;
  if(!String(fill.name||'').trim())fill.name=info.name;
  fill.webUrl=info.provider==='ssh'&&fill.cloneUrl===info.cloneUrl?fill.webUrl:info.webUrl;
  fill.cloneUrl=info.cloneUrl;
  return true;
}
function renderRepositoryCredentialHint(){
  const host=$('#repositoryCredentialHint');if(!host)return;
  const remote=parseGongfengRepoURL($('#repositoryForm')?.elements.repoUrl?.value),ssh=remote?.provider==='ssh',user=userById(state.currentUser?.id)||{};
  host.classList.toggle('git-ssh-missing',ssh);
  host.classList.toggle('repository-credential-hint',!ssh);
  if(ssh){host.setAttribute('role','alert');return renderGitSSHMissingHint(host,remote)}
  host.sshHintVersion=(host.sshHintVersion||0)+1;
  host.hidden=false;
  host.removeAttribute('role');
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const configured=!!user.gitHttpCredentialsConfigured;
  const title=configured?_t('已配置 Git 访问令牌','Git access token configured'):_t('仓库可以先保存，代码任务还需要 Token','Repository saved, but code tasks require a token');
  const message=configured?_t('请确认 Token 已获得目标仓库的访问和写入权限。SOP 使用需求责任人的 Token，未指定时使用项目 Owner 的 Token。','Ensure your token has read/write access to the repository. SOP uses the issue owner\'s token, or the project owner\'s token if unassigned.'):_t('使用仓库进行需求分析、访问私有代码或提交 PR 前，请先配置 Git 访问令牌。SOP 使用需求责任人的 Token，未指定时使用项目 Owner 的 Token。','Configure a Git access token before analyzing repositories, reading private code, or opening PRs. SOP uses the issue owner\'s token, or the project owner\'s if unassigned.');
  host.dataset.configured=String(configured);
  host.innerHTML=`<div><b>${escapeHTML(title)}</b><p>${escapeHTML(message)}</p></div><button type="button" class="button ghost small" data-repository-configure-token>${escapeHTML(configured?_t('个人设置','Profile Settings'):_t('配置 Git 访问令牌','Configure Git Token'))}</button>`;
  host.querySelector('[data-repository-configure-token]').onclick=()=>{
    $('#repositoryModal').classList.remove('open');gotoCredential('gitHttpCredentials');
  };
}
function renderRepositoryList(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;renderRepositoryCredentialHint();const project=(state.data.projects||[]).find(p=>p.id===state.projectFilter),repos=(state.data.repositories||[]).filter(r=>r.projectId===state.projectFilter);$('#repositoryProjectHint').textContent=_t(`当前项目：${project?.name||'—'}。粘贴 GitHub 链接或 Git SSH 地址；集成分支用于检查多个 SOP 执行后是否存在合并冲突，可留空。`,`Current project: ${project?.name||'—'}. Paste a GitHub URL or Git SSH URL; leave the integration branch empty unless checking cross-SOP merge conflicts.`);$('#repositoryList').innerHTML=repos.map(r=>`<button type="button" data-edit-repo="${escapeHTML(r.id)}"><b>${escapeHTML(r.name)}</b><span>${escapeHTML(r.gongfengProjectId||r.cloneUrl)} · ${_t('主分支','Main branch')} ${escapeHTML(r.defaultBranch||'master')} · ${_t('集成分支','Integration branch')} ${escapeHTML(r.integrateBranch||_t('未配置','Not configured'))}</span><em>${project?.defaultRepositoryId===r.id?_t('默认仓库','Default'):_t('编辑','Edit')}</em></button>`).join('')||`<p>${escapeHTML(_t('当前项目还没有绑定代码仓库。','No repositories bound to this project yet.'))}</p>`;$('#repositoryList').querySelectorAll('[data-edit-repo]').forEach(b=>b.onclick=()=>fillRepositoryForm((state.data.repositories||[]).find(r=>r.id===b.dataset.editRepo)))}
function fillRepositoryForm(repo={}){const f=$('#repositoryForm');['id','name','gongfengProjectId','webUrl','cloneUrl','localPath'].forEach(k=>{if(f.elements[k])f.elements[k].value=repo[k]||''});if(f.elements.repoUrl)f.elements.repoUrl.value=repo.provider==='ssh'?repo.cloneUrl:repo.webUrl||repo.cloneUrl||repo.gongfengProjectId||'';
  const nameField=$('#repositoryNameField');if(nameField)nameField.hidden=!repo.id;f.elements.defaultBranch.value=repo.defaultBranch||'master';f.elements.integrateBranch.value=repo.integrateBranch||'';const project=(state.data.projects||[]).find(p=>p.id===state.projectFilter);f.elements.makeDefault.checked=!project?.defaultRepositoryId||project.defaultRepositoryId===repo.id;if(f.elements.repoUrl){f.elements.repoUrl.oninput=renderRepositoryCredentialHint;f.elements.repoUrl.onchange=()=>{renderRepositoryCredentialHint();const form=f.elements,fill={name:form.name.value,gongfengProjectId:form.gongfengProjectId.value,webUrl:form.webUrl.value,cloneUrl:form.cloneUrl.value};if(fillRepositoryFromLink(form.repoUrl.value,fill)){form.name.value=fill.name;form.gongfengProjectId.value=fill.gongfengProjectId;form.webUrl.value=fill.webUrl;form.cloneUrl.value=fill.cloneUrl}}};renderRepositoryCredentialHint()}
function openRepositoryModal(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;if(!state.projectFilter)return toast(_t('请先选择项目','Please select a project first'));gitSSHKeyCache=null;fillRepositoryForm();renderRepositoryList();$('#repositoryModal').classList.add('open')}
async function saveRepository(e){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;e.preventDefault();const f=e.currentTarget,project=(state.data.projects||[]).find(p=>p.id===state.projectFilter);if(f.elements.repoUrl){const fill={name:f.elements.name.value,gongfengProjectId:f.elements.gongfengProjectId.value,webUrl:f.elements.webUrl.value,cloneUrl:f.elements.cloneUrl.value};if(fillRepositoryFromLink(f.elements.repoUrl.value,fill)){f.elements.name.value=fill.name;f.elements.gongfengProjectId.value=fill.gongfengProjectId;f.elements.webUrl.value=fill.webUrl;f.elements.cloneUrl.value=fill.cloneUrl}}const payload={id:f.elements.id.value,projectId:state.projectFilter,provider:(parseGongfengRepoURL(f.elements.repoUrl?.value)?.provider||'gongfeng'),name:f.elements.name.value.trim(),gongfengProjectId:f.elements.gongfengProjectId.value.trim(),webUrl:f.elements.webUrl.value.trim(),cloneUrl:f.elements.cloneUrl.value.trim(),defaultBranch:f.elements.defaultBranch.value.trim(),integrateBranch:f.elements.integrateBranch.value.trim(),localPath:f.elements.localPath.value.trim(),repoUrl:f.elements.repoUrl?f.elements.repoUrl.value.trim():''};try{const repo=await api('/api/repositories',{method:payload.id?'PUT':'POST',body:JSON.stringify(payload)}),idx=(state.data.repositories||[]).findIndex(r=>r.id===repo.id);if(idx>=0)state.data.repositories[idx]=repo;else(state.data.repositories||(state.data.repositories=[])).push(repo);if(f.elements.makeDefault.checked&&project){const saved=await api('/api/projects',{method:'PUT',body:JSON.stringify({...project,defaultRepositoryId:repo.id})});if(saved&&saved.id){const pi=(state.data.projects||[]).findIndex(p=>p.id===saved.id);if(pi>=0)state.data.projects[pi]=saved;project.defaultRepositoryId=repo.id}else project.defaultRepositoryId=repo.id}fillRepositoryForm(repo);renderRepositoryList();renderIssues();toast(repo.provider==='ssh'?_t('仓库已保存；检出和推送使用 Git SSH 密钥。','Repository saved; checkout and push will use your Git SSH key.'):(userById(state.currentUser?.id)||{}).gitHubCredentialConfigured?_t('Git 仓库绑定已保存','Git repository binding saved'):_t('仓库已保存；配置 Git 访问令牌 后才能进行代码交付。','Repository saved; configure a Git access token before code delivery.'))}catch(err){toast(err.message)}}
function fillImportTAPDWorkflow(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const select=$('#importTAPDWorkflow');
  if(!select)return;
  const opts=runnableWorkflowOptions();
  const selected=defaultSOPForIssue({projectId:state.projectFilter,source:'tapd',kind:'requirement'});
  const chosen=opts.some(w=>w.id===selected)?selected:(opts[0]?.id||'');
  select.innerHTML=opts.map(w=>`<option value="${escapeHTML(w.id)}" ${w.id===chosen?'selected':''}>${escapeHTML(w.name)}</option>`).join('')||`<option value="">${escapeHTML(_t('暂无可选 SOP','No available SOPs'))}</option>`;
}
function fillImportTAPDRepository(){
  const host=$('#importTAPDRepository');
  if(!host)return;
  host.dataset.ids='[]';
  const branches=$('#importTAPDRepositoryBranches');if(branches)branches.innerHTML='';
  renderImportTAPDRepositoryPicker();
}
function selectedImportTAPDRepositoryIds(){
  try{return JSON.parse($('#importTAPDRepository')?.dataset.ids||'[]')}catch{return []}
}
function setImportTAPDRepositoryIds(ids){
  const host=$('#importTAPDRepository');
  if(!host)return;
  const repos=(state.data.repositories||[]).filter(r=>r.projectId===state.projectFilter);
  const known=new Set(repos.map(r=>r.id));
  host.dataset.ids=JSON.stringify([...new Set((ids||[]).filter(id=>known.has(id)))]);
  renderImportTAPDRepositoryPicker();
}
function renderImportTAPDRepositoryPicker(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const host=$('#importTAPDRepository');
  if(!host)return;
  const repos=(state.data.repositories||[]).filter(r=>r.projectId===state.projectFilter);
  const selected=selectedImportTAPDRepositoryIds();
  const chosen=new Set(selected);
  const leftover=repos.filter(r=>!chosen.has(r.id));
  const tags=selected.map(id=>{
    const name=repos.find(r=>r.id===id)?.name||id;
    return `<button type="button" class="repo-picker-tag" data-remove-repo="${escapeHTML(id)}">${escapeHTML(name)}<span aria-hidden="true">×</span></button>`;
  }).join('');
  const options=leftover.map(r=>`<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)}</option>`).join('');
  const placeholder=!repos.length?_t('暂无可选仓库','No repositories available'):(!leftover.length?_t('已全部选择','All selected'):_t('选择仓库','Select repository'));
  host.innerHTML=`<div class="repo-picker-field">${tags}<select class="repo-picker-select"${leftover.length?'':' disabled'}><option value="">${placeholder}</option>${options}</select></div>`;
  host.querySelectorAll('[data-remove-repo]').forEach(b=>b.onclick=()=>setImportTAPDRepositoryIds(selected.filter(id=>id!==b.dataset.removeRepo)));
  const sel=host.querySelector('select');
  if(sel)sel.onchange=()=>{if(!sel.value)return;setImportTAPDRepositoryIds([...selected,sel.value])};
  renderIssueRepositoryBranchInputs($('#importTAPDBaseBranch'),$('#importTAPDBaseBranchHint'),$('#importTAPDRepositoryBranches'),selected);
}
function openImportTAPDModal(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!state.projectFilter)return toast(_t('请先在顶部选择一个项目','Please select a project at the top first'));
  const input=$('#importTAPDURL');if(input)input.value='';
  const baseBranch=$('#importTAPDBaseBranch');if(baseBranch)baseBranch.value='';
  fillImportTAPDWorkflow();
  fillImportTAPDRepository();
  $('#importTAPDModal').classList.add('open');
  setTimeout(()=>input?.focus(),0);
}
async function importTAPDStory(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  e.preventDefault();
  const url=$('#importTAPDURL')?.value.trim();
  if(!url)return toast(_t('请粘贴 TAPD 工作项链接或分享文本','Paste a TAPD work item URL or share text'));
  if(!state.projectFilter)return toast(_t('请先选择项目','Please select a project first'));
  const repositoryIds=selectedImportTAPDRepositoryIds();
  if(!repositoryIds.length)return toast(_t('请至少选择一个代码仓库','Select at least one repository'));
  const button=$('#confirmImportTAPD');
  try{
    if(button){button.disabled=true;button.textContent=_t('正在导入…','Importing...')}
    const workflowId=$('#importTAPDWorkflow')?.value.trim();
    const baseBranch=$('#importTAPDBaseBranch')?.value.trim()||'';
    const repositoryBranches=selectedIssueRepositoryBranches($('#importTAPDBaseBranch'),$('#importTAPDRepositoryBranches'));
    const issue=await api('/api/issues/import-tapd',{method:'POST',body:JSON.stringify({projectId:state.projectFilter,url,workflowId:workflowId||undefined,repositoryIds,repositoryId:repositoryIds[0],baseBranch,repositoryBranches})});
    const idx=(state.data.issues||[]).findIndex(i=>i.id===issue.id);
    if(idx>=0)state.data.issues[idx]=issue;else (state.data.issues||(state.data.issues=[])).unshift(issue);
    $('#importTAPDModal').classList.remove('open');
    renderIssues();
    toast(_t(`已导入 TAPD 工作项：${issue.title||issue.id}`,`Imported TAPD issue: ${issue.title||issue.id}`),'ok');
    if(issue.id)openIssueDetail(issue.id);
  }catch(err){toast(err.message)}
  finally{if(button){button.disabled=false;button.textContent=_t('导入','Import')}}
}
function canonicalIssue(id){
  id=String(id||'').trim();
  if(!id)return {};
  return (state.data.issues||[]).find(i=>i.id===id)||(state.issueDetailData?.issue?.id===id?state.issueDetailData.issue:{})||{};
}
function trackerRefOf(issue){
  const ref=issue?.externalRef;
  if(ref&&(ref.externalId||ref.externalIid))return ref;
  return undefined;
}
async function persistIssue(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const id=String(issue.id||'').trim();
  const prior=canonicalIssue(id);
  const payload={...prior,...issue,id};
  if(prior.source)payload.source=prior.source;
  const bound=trackerRefOf(prior)||trackerRefOf(payload);
  if(bound)payload.externalRef=bound;
  else if(payload.externalRef&&!(payload.externalRef.externalId||payload.externalRef.externalIid))delete payload.externalRef;
  delete payload.syncTarget;
  const isNew=!id;
  if(isNew){
    const target=issue.syncTarget||document.querySelector('#issueForm [name="syncTarget"]:checked')?.value;
    if(!target)throw new Error(_t('新建必须选择创建方式','Please choose a creation mode'));
    payload.syncTarget=target;
  }
  const saved=await api('/api/issues',{method:isNew?'POST':'PUT',body:JSON.stringify(payload)});
  rememberIssue(saved, id);
  return saved;
}
async function saveIssue(e){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]');try{button.disabled=true;button.textContent=_t('正在保存…','Saving...');const saved=await persistIssue(issueFromForm());state.selectedIssue=saved.id;$('#issueModal').classList.remove('open');renderIssues();toast(_t('需求已保存','Issue saved'))}catch(err){toast(err.message)}finally{button.disabled=false;button.textContent=_t('保存','Save')}}
async function dispatchIssue(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;try{let issue=issueFromForm();const blocked=issueExecutionBlocked(issue);if(blocked)return toast(blocked);const current=latestIssueTask(issue),rerun=!!current;if(current&&!await afConfirm({title:_t('重新运行确认','Confirm re-run'),message:['queued','dispatched','running'].includes(current.status)?_t('该需求已有进行中的任务，确定额外发起一次重新运行吗？','This issue already has an active task. Start another run?'):_t('该需求已经处理过，确定整条 SOP 重新运行吗？','This issue has already been processed. Re-run the entire SOP?'),confirmText:_t('确认重新运行','Confirm Re-run')}))return;const button=$('#dispatchIssue');button.disabled=true;button.textContent=_t('正在调度…','Dispatching...');issue=await persistIssue(issue);const task=await api(`/api/issues/${issue.id}/dispatch`,{method:'POST',body:JSON.stringify({rerun,workflowId:issue.workflowId||''})});issue.latestTaskId=task.id;issue.status='in_progress';const idx=state.data.issues.findIndex(i=>i.id===issue.id);if(idx>=0)state.data.issues[idx]=issue;if(!state.data.tasks)state.data.tasks=[];const existingTaskIdx=state.data.tasks.findIndex(t=>t.id===task.id);if(existingTaskIdx>=0)state.data.tasks[existingTaskIdx]=task;else state.data.tasks.unshift(task);if(task.runId){startLiveRun(task.runId);try{const run=await api(`/api/runs/${encodeURIComponent(task.runId)}`,{silent:true});if(run?.id){if(!state.data.runs)state.data.runs=[];const rIdx=state.data.runs.findIndex(r=>r.id===run.id);if(rIdx>=0)state.data.runs[rIdx]={...state.data.runs[rIdx],...run};else state.data.runs=sortRunsDescending([run,...state.data.runs]);}}catch(e){}}$('#issueModal').classList.remove('open');renderIssues();await openIssueDetail(issue.id,'sop');toast(rerun?_t('已创建重新运行','Re-run created'):_t('已创建执行任务并启动工作流','Task created and workflow started'),'ok');Promise.all([refreshIssues(),refreshRuns(true)]).catch(()=>{});}catch(err){toast(err.message)}finally{const button=$('#dispatchIssue');button.disabled=false;button.textContent=_t('启动 SOP','Start SOP')}}
async function dispatchIssueById(issueId,rerun=false,workflowId=''){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;try{const issue=(state.data.issues||[]).find(i=>i.id===issueId),blocked=issueExecutionBlocked(issue);if(blocked)return toast(blocked);if(clarificationNeedsConfirm(issue)){openIssueDetail(issueId,'clarify');return toast(_t('请先确认澄清结论后再触发 SOP','Please confirm the clarification conclusion before triggering SOP'))}
const task=await api(`/api/issues/${issueId}/dispatch`,{method:'POST',body:JSON.stringify({rerun,workflowId})});if(issue){issue.latestTaskId=task.id;issue.status='in_progress';if(issueWithoutSOP(issue)&&workflowId){issue.sopMode='';issue.workflowId=workflowId}}if(!state.data.tasks)state.data.tasks=[];const existingTaskIdx=state.data.tasks.findIndex(t=>t.id===task.id);if(existingTaskIdx>=0)state.data.tasks[existingTaskIdx]=task;else state.data.tasks.unshift(task);if(task.runId){startLiveRun(task.runId);try{const run=await api(`/api/runs/${encodeURIComponent(task.runId)}`,{silent:true});if(run?.id){if(!state.data.runs)state.data.runs=[];const rIdx=state.data.runs.findIndex(r=>r.id===run.id);if(rIdx>=0)state.data.runs[rIdx]={...state.data.runs[rIdx],...run};else state.data.runs=sortRunsDescending([run,...state.data.runs]);}}catch(e){}}renderIssues();await openIssueDetail(issueId,'sop');toast(rerun?_t('已创建重新运行','Re-run created'):_t('已启动 SOP','SOP started'),'ok');Promise.all([refreshIssues(),refreshRuns(true)]).catch(()=>{});setTimeout(()=>refreshIssues(),2000);setTimeout(()=>refreshIssues(),10000);}catch(err){if(/澄清/.test(err.message||'')){state.issueDetailTab='clarify';openIssueDetail(issueId,'clarify')}toast(err.message,'err')}}
function defaultSOPForIssue(issue){
  if(issueWithoutSOP(issue))return '';
  const projectId=issue?.projectId||state.projectFilter;
  const project=(state.data.projects||[]).find(p=>p.id===projectId);
  const projectSOP=(project?.workflowId||'').trim();
  const runnable=runnableWorkflowOptions();
  const inRunnable=id=>id&&runnable.some(w=>w.id===id);
  const knownSOP=id=>id&&(state.data.workflows||[]).some(w=>w.id===id);
  const projectFix=projectId?`${projectId}-issue-fix`:'';
  // 项目默认 SOP 是平台通用模板（如新建项目自带的通用后端交付 SOP）时，
  // 工蜂缺陷也默认走它；绑定生产 SOP 的旧项目保持原默认不变。
  const projectSOPDef=(state.data.workflows||[]).find(w=>w.id===projectSOP);
  const genericSOP=!!projectSOPDef&&!!projectSOPDef.generic;
  if(issue?.source==='gongfeng'||issue?.kind==='issue'){
    if(projectFix&&knownSOP(projectFix))return projectFix;
    if(genericSOP)return projectSOP;
    return inRunnable('issue-fix-production')?'issue-fix-production':(runnable[0]?.id||'issue-fix-production');
  }
  const playbook=projectPlaybook(project);
  if(playbook?.bindings?.[0]&&(inRunnable(playbook.bindings[0].workflowId)||knownSOP(playbook.bindings[0].workflowId)))return playbook.bindings[0].workflowId;
  if(inRunnable(projectSOP))return projectSOP;
  if(projectSOP&&knownSOP(projectSOP))return projectSOP;
  return inRunnable('requirement-development-production')?'requirement-development-production':(runnable[0]?.id||'requirement-development-production');
}
function bindIssueTriggers(root=document){root.querySelectorAll('[data-trigger-issue]').forEach(button=>{button.onclick=e=>{e.stopPropagation();e.preventDefault();triggerIssue(button.dataset.triggerIssue)}})}
async function resumeRun(runId,fromEl){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!runId)return toast(_t('没有可继续的运行','No run available to resume'));
  const issue=(state.data.issues||[]).find(i=>i.id===issueIdForRun(runId));
  const blocked=issueExecutionBlocked(issue);if(blocked)return toast(blocked);
  const run=cachedRun(runId);
  if(queuedRunActionBlocked(runId))return;
  if(run?.status==='cancelled')return toast(_t('已取消的运行不能重试','Cancelled runs cannot be retried'));
  let context=readHumanContext(fromEl);
  if(!context && !fromEl?.closest?.('[data-human-context-root]') && runRetryNeedsContext(run)){
    const typed=await afPrompt({title:_t('补充执行上下文','Additional execution context'),message:_t('可补充上下文后再从失败节点继续（例如单测失败用例名）。留空则直接重试，取消则中止。','Optionally add context before resuming from the failed step (e.g. failing test case name). Leave blank to retry directly, or cancel to abort.'),placeholder:_t('例如：修复某用例或调整依赖','e.g. Fix a test case or adjust dependencies'),defaultValue:''});
    if(typed===null)return;
    context=typed.trim();
  }
  try{
    await requestRunActivation(runId,'retry',withHumanContext({reason:_t('从中断处继续','Resume from interruption'),context}));
    const current=await syncRunControlState(runId);
    toast(runControlToast(current,_t('已从失败节点继续，已完成的步骤不会重跑','Resumed from failed step; completed steps will not rerun')));
    Promise.all([refreshIssues(),refreshRuns(true)]).catch(()=>{});
    const issueId=issueIdForRun(runId);
    if(state.drawerOpen&&issueId)openIssueDetail(issueId,'sop');
  }catch(err){toast(err.message)}
}
async function triggerIssue(issueId,workflowId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=(state.data.issues||[]).find(i=>i.id===issueId);
  if(!issue)return toast(_t('未找到工作项','Requirement not found'));
  const blocked=issueExecutionBlocked(issue);if(blocked)return toast(blocked);
  if(issueWithoutSOP(issue)&&!String(workflowId||'').trim()){openIssueDetail(issueId,'sop');return toast(_t('这条需求不使用 SOP，请先选择要运行的 SOP','This requirement uses no SOP; choose an SOP to run first'))}
  const targetWorkflow=String(workflowId||'').trim()||issue.workflowId||defaultSOPForIssue(issue);
  const laneTask=(state.data.tasks||[]).find(t=>t.issueId===issue.id&&t.workflowId===targetWorkflow);
  const latestRun=laneTask?latestIssueRun(issue,laneTask):null;
  if(laneTask&&['queued','dispatched','running'].includes(laneTask.status)&&!await afConfirm({title:_t('发起新运行确认','Confirm new run'),message:_t('这条 SOP 已有进行中的任务，确定再次发起一个新运行吗？','This SOP already has an active task. Start another run?'),confirmText:_t('确认发起','Confirm')}))return;
  if(['failed','cancelled','succeeded'].includes(latestRun?.status)&&!await afConfirm({title:_t('触发整条 SOP 确认','Confirm full SOP trigger'),message:_t('「触发」会把这条 SOP 从头再跑，已完成的步骤也会重做。要从失败节点继续请用「重试」。确定触发？','“Trigger” restarts this SOP from the beginning and reruns completed steps. To continue from a failed step, use “Retry”. Proceed?'),confirmText:_t('确认触发','Confirm trigger')}))return;
  try{
    await dispatchIssueById(issue.id,!!laneTask,targetWorkflow);
  }catch(err){toast(err.message)}
}
async function saveIssueSOPS(issueId,bindings){
  const issue=await api(`/api/issues/${encodeURIComponent(issueId)}/sops`,{method:'PUT',body:JSON.stringify({bindings})});
  const idx=(state.data.issues||[]).findIndex(i=>i.id===issue.id);
  if(idx>=0)state.data.issues[idx]=issue;
  if(state.issueDetailData?.issue?.id===issue.id){
    state.issueDetailData.issue=issue;
    try{const snap=await api(`/api/issues/${encodeURIComponent(issue.id)}/requirement`,{silent:true});if(snap)state.issueDetailData.requirement=snap}catch(e){}
    renderIssueDetailTab();
  }
  renderIssues();
  return issue;
}
function currentIssueSOPBindings(issueId){
  const issue=(state.data.issues||[]).find(i=>i.id===issueId)||state.issueDetailData?.issue;
  return effectiveIssueSOPBindings(issue).map((b,i)=>({id:b.id||('sop-'+b.workflowId),workflowId:b.workflowId,order:i+1,assigneeUserId:Number(b.assigneeUserId)||0,handoff:b.handoff||[],dependsOn:b.dependsOn||[]}));
}
async function addIssueSOP(issueId,workflowId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  workflowId=String(workflowId||'').trim();
  if(!workflowId)return toast(_t('请选择要绑定的 SOP','Select an SOP to bind'));
  const bindings=currentIssueSOPBindings(issueId);
  if(bindings.some(b=>b.workflowId===workflowId))return toast(_t('这条 SOP 已经绑定','This SOP is already bound'));
  bindings.push({workflowId,order:bindings.length+1,assigneeUserId:0,handoff:[]});
  try{await saveIssueSOPS(issueId,bindings);toast(_t('已加上','Added'),'ok')}catch(err){toast(err.message)}
}
async function removeIssueSOP(issueId,workflowId){
  const bindings=currentIssueSOPBindings(issueId).filter(b=>b.workflowId!==workflowId);
  try{await saveIssueSOPS(issueId,bindings)}catch(err){toast(err.message)}
}
async function moveIssueSOP(issueId,workflowId,dir){
  const bindings=currentIssueSOPBindings(issueId);
  const idx=bindings.findIndex(b=>b.workflowId===workflowId);
  const next=idx+dir;
  if(idx<0||next<0||next>=bindings.length)return;
  const swap=bindings[idx];bindings[idx]=bindings[next];bindings[next]=swap;
  try{await saveIssueSOPS(issueId,bindings)}catch(err){toast(err.message)}
}
async function setIssueSOPOwner(issueId,workflowId,userId){
  const bindings=currentIssueSOPBindings(issueId).map(b=>b.workflowId===workflowId?{...b,assigneeUserId:Number(userId)||0}:b);
  try{await saveIssueSOPS(issueId,bindings)}catch(err){toast(err.message)}
}
async function setIssueSOPHandoff(issueId,workflowId,raw){
  const handoff=String(raw||'').split(/[,，]/).map(s=>s.trim()).filter(Boolean);
  const bindings=currentIssueSOPBindings(issueId).map(b=>b.workflowId===workflowId?{...b,handoff}:b);
  try{await saveIssueSOPS(issueId,bindings)}catch(err){toast(err.message)}
}
async function retriggerIssue(issueId,workflowId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=(state.data.issues||[]).find(i=>i.id===issueId)||state.issueDetailData?.issue;
  if(!issue)return toast(_t('未找到工作项','Requirement not found'));
  if(issueTrackerClosed(issue))return toast(_t('外部工作项已关闭，请先在外部系统重新打开','External ticket is closed; reopen it in the external system first'));
  if(issueManuallyClosed(issue))return toast(_t('请先重新打开该需求，再触发 SOP','Reopen this requirement before triggering an SOP'));
  if(clarificationNeedsConfirm(issue)){
    openIssueDetail(issue.id,'clarify');
    return toast(_t('请先确认澄清结论再重新触发','Confirm the clarification conclusion before retriggering'));
  }
  if(!await afConfirm({title:_t('重新触发确认','Confirm retrigger'),message:_t('会整条 SOP 从头再开一条新运行，已完成步骤也会重做，旧记录还在。失败时若只想从失败点继续，请用「重试」。','Starts a new run of the entire SOP from the beginning and reruns completed steps, keeping previous records. To resume from a failed step, use “Retry”.'),confirmText:_t('确认重新触发','Confirm retrigger')}))return;
  try{
    let target=issue;
    if(deliveryLocked(target))target=await reopenDeliveredIssueSilent(target.id);
    const wf=String(workflowId||'').trim()||target.workflowId||defaultSOPForIssue(target);
    if(!String(target.workflowId||'').trim())target=await persistIssue({...target,workflowId:wf});
    const ran=!!(state.data.tasks||[]).some(t=>t.issueId===target.id&&t.workflowId===wf);
    await dispatchIssueById(target.id,ran,wf);
  }catch(err){toast(err.message)}
}
async function reopenDeliveredIssueSilent(issueId){
  const issue=await api(`/api/issues/${encodeURIComponent(issueId)}/reopen`,{method:'POST',body:'{}'});
  const idx=(state.data.issues||[]).findIndex(i=>i.id===issue.id);
  if(idx>=0)state.data.issues[idx]=issue;
  return issue;
}
async function reopenDeliveredIssue(issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!await afConfirm({title:_t('重新打开确认','Confirm reopen'),message:_t('重新打开后，该工作项可以再次触发 SOP。确定继续？','Once reopened, this requirement can trigger SOPs again. Continue?'),confirmText:_t('确认重新打开','Confirm reopen')}))return;
  try{
    const issue=await reopenDeliveredIssueSilent(issueId);
    renderIssues();
    $('#issueModal')?.classList.remove('open');
    if(state.drawerOpen&&state.selectedIssue===issue.id)openIssueDetail(issue.id);
    toast(_t('工作项已重新打开，可以再次触发 SOP','Requirement reopened and ready to trigger SOPs again'));
  }catch(err){toast(err.message)}
}
function canRerunFromNode(r){
  if(!r||gongfengIssueClosed(runContext(r).issue))return false;
  return ['waiting','failed','cancelled','succeeded'].includes(r.status)&&
    !Object.values(r.nodes||{}).some(n=>['running','pending_input'].includes(n?.status))&&
    runNodeChoices(r).some(n=>r.nodes?.[n.id]);
}
function canRerunFromHere(r,nodeId){
  return !!nodeId&&canRerunFromNode(r)&&runNodeChoices(r).some(node=>node.id===nodeId);
}
function runNodeChoices(r){
  const wf=r.workflowSnapshot?.id?r.workflowSnapshot:((state.data.workflows||[]).find(w=>w.id===r.workflowId)||{});
  const defs=wf.nodes||[];
  const seen=new Set();
  const out=[];
  const upstreamReady=id=>{
    const visited=new Set([id]);
    const queue=[id];
    while(queue.length){
      const target=queue.shift();
      for(const edge of wf.edges||[]){
        if(edge.target!==target||visited.has(edge.source))continue;
        if(r.nodes?.[edge.source]?.status!=='succeeded')return false;
        visited.add(edge.source);
        queue.push(edge.source);
      }
    }
    return true;
  };
  for(const n of defs){
    if(!r.nodes?.[n.id]||!upstreamReady(n.id))continue;
    seen.add(n.id);
    out.push({id:n.id,name:n.name||n.id,type:n.type||'',status:r.nodes?.[n.id]?.status||'pending'});
  }
  if(!defs.length){
    for(const [id,nr] of Object.entries(r.nodes||{})){
      if(seen.has(id))continue;
      out.push({id,name:id,type:'',status:nr?.status||'pending'});
    }
  }
  return out;
}
function runNodeAllowsContext(node){return !!node?.type&&!isScriptWorkflowNode(node)}
function afRerunFromNode(run,nodeId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const fields=$('#rerunFromNodeFields');
  const context=$('#rerunFromNodeContext');
  const contextFields=$('#rerunFromNodeContextFields');
  const hint=$('#rerunFromNodeHint');
  if(!$('#confirmModal')||!fields||!context||!contextFields||!hint)return Promise.resolve(null);
  const node=runNodeChoices(run).find(n=>n.id===nodeId);
  if(!node){toast(_t('这个节点现在不能从这里重跑','This step cannot be rerun from here right now'));return Promise.resolve(null)}
  return afOpenDialog(()=>{
    $('#confirmTitle').textContent=_t('从这里重跑','Rerun from here');
    $('#confirmMessage').textContent=_t(`从「${node.name}」及其下游重跑，上游已完成的步骤会保留。${run.workspaceCleanedAt&&!String(run.workspaceCleanedAt).startsWith('0001-')?'工作区已回收：优先恢复已有快照；没有快照时重新准备仓库和已归档的上游产物，未保存的历史文件无法恢复。':''}`,`Rerun from “${node.name}” and its downstream steps while keeping completed upstream steps.${run.workspaceCleanedAt&&!String(run.workspaceCleanedAt).startsWith('0001-')?' Workspace cleaned: existing snapshots are restored first; otherwise repositories and archived upstream artifacts are re-prepared, and unsaved historical files cannot be recovered.':''}`);
    fields.hidden=false;
    context.value='';
    const allowsContext=runNodeAllowsContext(node);
    contextFields.hidden=!allowsContext;
    hint.textContent=allowsContext?_t('补充说明会写进这次执行的上下文。','Additional notes will be written into this run’s context.'):_t('脚本节点不接收补充上下文。','Script steps do not accept additional context.');
    const okBtn=$('#confirmOkBtn');
    okBtn.textContent=_t('开始重跑','Start rerun');
    okBtn.className='button primary';
    $('#confirmCancelBtn').textContent=_t('取消','Cancel');
    setConfirmIcon('info','refresh');
    return {
      focus:allowsContext?context:okBtn,
      value:isOk=>{
        fields.hidden=true;
        return isOk?{nodeId,context:allowsContext?context.value.trim():''}:null;
      },
    };
  });
}
async function openRerunFromNode(run,nodeId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!run?.id)return;
  if(!canRerunFromHere(run,nodeId))return toast(_t('这个节点现在不能从这里重跑','This step cannot be rerun from here right now'));
  const choice=await afRerunFromNode(run,nodeId);
  if(!choice?.nodeId)return;
  const issueId=run.executionContext?.issueId||issueIdForRun(run.id);
  const issue=(state.data.issues||[]).find(i=>i.id===issueId);
  if(issueTrackerClosed(issue))return toast(_t('外部工作项已关闭，请先在外部系统重新打开','External ticket is closed; reopen it in the external system first'));
  if(issueManuallyClosed(issue))return toast(_t('请先重新打开该需求，再从这里重跑','Reopen this requirement before rerunning from here'));
  try{
    if(deliveryLocked(issue))await reopenDeliveredIssueSilent(issue.id);
    await requestRunActivation(run.id,'retry',{nodeId:choice.nodeId,reason:_t('从指定节点重跑','Rerun from specified step'),context:choice.context||''});
    const next=await syncRunControlState(run.id);
    toast(runControlToast(next,_t('已从该节点重跑，上游完成步骤会保留','Rerun started from this step; completed upstream steps are kept')));
    Promise.all([refreshIssues(),refreshRuns(true)]).catch(()=>{});

  }catch(err){toast(err.message,'err')}
}
