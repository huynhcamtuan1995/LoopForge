function issueCanClose(issue){
  return issue?.closureAllowed===true&&!issueClarifying(issue.id);
}
function issueCanDelete(issue){
  return issue?.deletionAllowed===true&&!issueClarifying(issue.id);
}
function issueDeletionBlock(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(issueClarifying(issue?.id))return{code:'clarifying',reason:_t('正在澄清，请先停止澄清后再删除','Clarifying in progress; stop clarification before deleting')};
  if(issueCanDelete(issue))return null;
  return issue?.deletionBlock?.reason?issue.deletionBlock:{code:'unknown',reason:_t('暂时无法确认删除条件，请刷新后重试','Unable to verify deletion eligibility right now; refresh and retry')};
}
function issueDeletePath(id,force){
  return `/api/issues/${encodeURIComponent(id)}${force?'?force=true':''}`;
}
function issueDeletionWarning(force,external){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return _t(`需求、评论和澄清记录将被删除。${force?'关联的任务、运行记录、日志、产物和执行工作区将一并清理。':''}删除后无法恢复。${external?'外部原单会保留，后续同步可能重新导入。':''}`,`The requirement, comments, and clarification history will be deleted. ${force?'Linked tasks, run records, logs, outputs, and workspaces will be cleaned up as well. ':''}This cannot be undone. ${external?'The external source item remains and future syncs may re-import it.':''}`);
}
function issueDeletionContextHTML(issue,{menu=false}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const block=issueDeletionBlock(issue);
  if(!block)return '';
  const label=block.code==='clarifying'?_t('查看澄清','View clarification'):block.runId?_t('查看相关运行','View related run'):block.code==='active'||block.code==='succeeded'?_t('查看任务与记录','View tasks & runs'):_t('查看需求详情','View requirement');
  return `<button type="button" class="${menu?'issue-popover-item':'button ghost small'}" data-issue-deletion-context="${escapeHTML(issue.id)}" aria-label="${escapeHTML(_t(`${label}：${issue.title||issue.id}，${block.reason}`,`${label}: ${issue.title||issue.id} — ${block.reason}`))}">${menu?huiIcon('arrow-right','popover-icon'):''}${label}</button>`;
}
function issueDeleteControlHTML(issue,{menu=false}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const block=issueDeletionBlock(issue),cls=menu?'issue-popover-item':'button ghost small';
  const reasonId=`issue-delete-reason-${menu?'menu':'detail'}-${issue.id}`;
  const label=!block&&issue.deletionRequiresForce?_t('强制删除','Force delete'):_t('删除需求','Delete requirement');
  const button=`<button type="button" class="${cls}${block?'':' danger'}" ${menu?'data-action="delete"':`data-delete-issue="${escapeHTML(issue.id)}"`}${block?` disabled aria-describedby="${escapeHTML(reasonId)}"`:''}>${menu?huiIcon('trash','popover-icon'):''}${label}</button>`;
  if(!block)return button;
  return `<div class="issue-delete-control">${button}<p class="issue-delete-reason" id="${escapeHTML(reasonId)}">${escapeHTML(block.reason)}</p>${issueDeletionContextHTML(issue,{menu})}</div>`;
}
function bindIssueDeletionContext(root){
  root.querySelectorAll('[data-issue-deletion-context]').forEach(button=>button.onclick=e=>{
    e.stopPropagation();
    const id=button.dataset.issueDeletionContext;
    const detailIssue=state.issueDetailData?.issue?.id===id?state.issueDetailData.issue:null;
    const issue=(root.id==='issueDetailBody'?detailIssue:null)||(state.data.issues||[]).find(i=>i.id===id)||detailIssue;
    if(!issue)return;
    const block=issueDeletionBlock(issue);
    if(!block)return;
    hideIssueActionMenu();
    if(block.runId){closeIssueDrawer();openRunFromId(block.runId,{forceRuns:true})}
    else openIssueDetail(id,block.code==='clarifying'?'clarify':block.code==='active'||block.code==='succeeded'?'activity':'overview');
  });
}
const issueStatuses=[['backlog','Backlog'],['todo','Todo'],['in_progress','In progress'],['in_review','In review'],['done','Done'],['closed','Closed'],['blocked','Blocked'],['cancelled','Cancelled']];
function latestIssueTask(i){
  const tasks=(state.data.tasks||[]).filter(t=>t.issueId===i.id);
  if(tasks.length){
    tasks.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)||String(b.id).localeCompare(String(a.id)));
    return tasks[0];
  }
  return (state.data.tasks||[]).find(x=>x.id===i.latestTaskId)||null;
}
function latestIssueRun(i, task){
  const runs=state.data.runs||[];
  if(task){
    const hit=runs.find(x=>x.id===task.runId);
    if(hit)return hit;
  }
  // issueNumber is not unique: Gongfeng uses IID, TAPD uses per-project local numbers.
  // Matching on number steals another issue's succeeded run (e.g. gf #23 vs TAPD #23).
  const linked=runs.filter(r=>r.executionContext?.issueId===i.id&&!r.executionContext?.parentRunId);
  if(!linked.length)return null;
  linked.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  return linked[0];
}
function issueExecution(i){
  const p=(state.data.projects||[]).find(x=>x.id===i.projectId),task=latestIssueTask(i),run=latestIssueRun(i,task)||(state.issueDetailData?.run?.id&&state.issueDetailData.issue?.id===i.id?state.issueDetailData.run:null),workflowId=i.workflowId||defaultSOPForIssue(i),w=(state.data.workflows||[]).find(x=>x.id===workflowId);
  return {project:p,task,run,workflow:w}
}
const SOP_LANES=[{id:'product',label:'产品'},{id:'frontend',label:'前端'},{id:'backend',label:'后端'},{id:'design',label:'设计'},{id:'repair',label:'修复'}];
function normalizeSOPLane(raw){
  const v=String(raw||'').trim().toLowerCase();
  if(['product','产品','prd'].includes(v))return 'product';
  if(['frontend','front','前端'].includes(v))return 'frontend';
  if(['backend','back','后端'].includes(v))return 'backend';
  if(['design','设计','uiux'].includes(v))return 'design';
  if(['repair','fix','issue','bugfix','修复','缺陷'].includes(v))return 'repair';
  return 'other';
}
function inferSOPLane(wf){
  if(!wf)return 'other';
  if(wf.sopLane)return normalizeSOPLane(wf.sopLane);
  const hay=`${wf.id||''} ${wf.name||''} ${(wf.tags||[]).join(' ')}`.toLowerCase();
  if(/generic-product|产品交付|(product.+(delivery|prd))/.test(hay))return 'product';
  if(/generic-frontend|前端交付|(frontend.+delivery)/.test(hay))return 'frontend';
  if(/generic-design|设计交付/.test(hay))return 'design';
  if(/generic-backend|后端交付|requirement-development|loopforge|需求开发/.test(hay))return 'backend';
  if(/issue-fix|缺陷修复/.test(hay))return 'repair';
  return 'other';
}
function sopLaneLabel(lane){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return _t(({product:'产品',frontend:'前端',backend:'后端',design:'设计',repair:'修复',other:'其他'})[lane]||'其他',({product:'Product',frontend:'Frontend',backend:'Backend',design:'Design',repair:'Fix',other:'Other'})[lane]||'Other')}
function laneStatusLabel(status){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return _t(({not_started:'未开始',active:'进行中',waiting:'待确认',attention:'需要介入',succeeded:'已完成',closed:'已闭环'})[status]||status||'未开始',({not_started:'Not started',active:'In progress',waiting:'Needs approval',attention:'Needs attention',succeeded:'Done',closed:'Delivered'})[status]||status||'Not started')}
function isRequirementWorkItem(issue){
  const kind=String(issue?.kind||'').toLowerCase();
  const source=String(issue?.source||'').toLowerCase();
  if(source==='gongfeng'||kind==='issue')return false;
  return kind==='requirement'||source==='tapd'||source==='local'||source==='';
}
function projectSOPBindings(project){
  const listed=(project?.sopBindings||[]).filter(b=>String(b.workflowId||'').trim());
  if(listed.length)return listed.slice().sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  const wf=String(project?.workflowId||'').trim();
  return wf?[{id:'sop-default',workflowId:wf,order:1}]:[];
}
function normalizePlaybookList(books){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const seen=new Set();
  const out=[];
  (books||[]).forEach((b,i)=>{
    const id=String(b.id||'').trim()||('pb-'+(i+1));
    if(seen.has(id))return;
    seen.add(id);
    const bindings=(b.bindings||[]).filter(x=>String(x.workflowId||'').trim()).map((x,j)=>({workflowId:x.workflowId,order:j+1,assigneeUserId:Number(x.assigneeUserId)||0,handoff:x.handoff||[],dependsOn:x.dependsOn||[]}));
    out.push({id,name:String(b.name||'').trim()||_t('未命名套餐','Untitled playbook'),default:!!b.default,bindings});
  });
  if(out.length&&!out.some(b=>b.default))out[0].default=true;
  let found=false;
  return out.map(b=>{
    if(b.default&&!found){found=true;return b}
    return {...b,default:false};
  });
}
function projectPlaybooks(project){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const named=normalizePlaybookList(project?.sopPlaybooks);
  if(named.length)return named;
  const legacy=projectSOPBindings(project);
  if(!legacy.length)return [];
  return [{id:'default',name:_t('默认流程','Default SOP'),default:true,bindings:legacy}];
}
function projectPlaybook(project,id){
  const books=projectPlaybooks(project);
  const want=String(id||'').trim();
  return books.find(b=>b.id===want)||books.find(b=>b.default)||books[0]||null;
}
function playbookNames(project,id){
  const book=arguments.length>1?projectPlaybook(project,id):projectPlaybook(project,projectPlaybooks(project).find(b=>b.default)?.id);
  return (book?.bindings||[]).map(b=>{
    const wf=(state.data.workflows||[]).find(w=>w.id===b.workflowId);
    return wf?.name||b.workflowId;
  }).filter(Boolean);
}
function materializePlaybook(draft){
  const bindings=projectSOPBindings(draft).map((b,i)=>({workflowId:b.workflowId,order:i+1,assigneeUserId:Number(b.assigneeUserId)||0}));
  draft.sopBindings=bindings;
  if(bindings.length)draft.workflowId=bindings[0].workflowId;
  return bindings;
}
// 不使用 SOP 的需求在对话里澄清和改代码；选一个 SOP 触发后服务端会清掉这个标记。
function issueWithoutSOP(issue){
  return String(issue?.sopMode||'').trim().toLowerCase()==='none';
}
function openIssueInChatById(issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=(state.data.issues||[]).find(i=>i.id===issueId)||(state.issueDetailData?.issue?.id===issueId?state.issueDetailData.issue:null);
  if(!issue)return toast(_t('未找到工作项','Work item not found'));
  openIssueInChat(issue);
}
function effectiveIssueSOPBindings(issue){
  const listed=(issue?.sopBindings||[]).filter(b=>String(b.workflowId||'').trim());
  if(listed.length)return listed.slice().sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  const wf=String(issue?.workflowId||'').trim();
  return wf?[{id:'sop-default',workflowId:wf,order:1,assigneeUserId:issue.assigneeUserId||0}]:[];
}
function clientIssueLanes(issue){
  if(state.issueDetailData?.requirement?.issue?.id===issue.id&&Array.isArray(state.issueDetailData.requirement.lanes)){
    return state.issueDetailData.requirement.lanes;
  }
  const bindings=effectiveIssueSOPBindings(issue);
  const tasks=(state.data.tasks||[]).filter(t=>t.issueId===issue.id);
  const runs=(state.data.runs||[]).filter(r=>r.executionContext?.issueId===issue.id&&!r.executionContext?.parentRunId);
  const by={};
  const ensure=(wfId,meta)=>{
    if(!by[wfId])by[wfId]={lane:meta.lane||'other',label:meta.label||wfId,workflowId:wfId,workflowName:meta.label||wfId,status:'not_started',started:false,runCount:0,tokens:0,assigneeUserId:meta.assigneeUserId||0,bindingId:meta.bindingId||'',handoff:meta.handoff||[],order:meta.order||0,dependsOn:meta.dependsOn||[]};
    return by[wfId];
  };
  bindings.forEach((b,i)=>{
    const wf=(state.data.workflows||[]).find(w=>w.id===b.workflowId)||{id:b.workflowId,name:b.workflowId};
    const lane=ensure(b.workflowId,{lane:inferSOPLane(wf),label:wf.name||b.workflowId,assigneeUserId:b.assigneeUserId,bindingId:b.id,handoff:b.handoff,order:b.order||i+1,dependsOn:b.dependsOn});
    if(!lane.stages?.length)lane.stages=plannedSOPNodes(null,wf);
  });
  runs.forEach(run=>{
    const wf=run.workflowSnapshot?.id?run.workflowSnapshot:(state.data.workflows||[]).find(w=>w.id===run.workflowId)||{id:run.workflowId,name:run.workflowId};
    const lane=ensure(run.workflowId,{lane:inferSOPLane(wf),label:wf.name||run.workflowId});
    lane.started=true;
    lane.runCount+=1;
    lane.tokens+=(run.usage?.totalTokens||0);
    lane.workflowId=run.workflowId;
    lane.workflowName=wf.name||run.workflowId;
    lane.latestRunId=run.id;
    const nodeFailed=Object.values(run.nodes||{}).some(n=>n?.status==='failed');
    const nodeWait=Object.values(run.nodes||{}).some(n=>n?.status==='waiting_approval');
    lane.status=run.status==='queued'?'active':nodeFailed||run.status==='failed'||run.status==='cancelled'?'attention':nodeWait||run.status==='waiting'?'waiting':run.status==='succeeded'?'succeeded':['running','queued'].includes(run.status)?'active':'active';
  });
  tasks.forEach(task=>{
    if(!task.workflowId)return;
    const wf=(state.data.workflows||[]).find(w=>w.id===task.workflowId)||{id:task.workflowId};
    const lane=ensure(task.workflowId,{lane:inferSOPLane(wf),label:wf.name||task.workflowId});
    if(!lane.workflowName)lane.workflowName=wf.name||task.workflowId;
    if(!lane.started&&['queued','dispatched','running'].includes(task.status)){lane.started=true;lane.status='active'}
  });
  const out=bindings.map(b=>by[b.workflowId]).filter(Boolean);
  Object.values(by).forEach(lane=>{
    if(out.some(x=>x.workflowId===lane.workflowId))return;
    if(lane.started){lane.orphan=true;out.push(lane)}
  });
  return collapseSingleSOPLane(bindings, by, runs, out);
}
function collapseSingleSOPLane(bindings, by, runs, out){
  if(bindings.length!==1)return out;
  const startedLanes=Object.values(by).filter(l=>l.started);
  if(startedLanes.length>1)return out;
  const started=runs.filter(r=>by[r.workflowId]?.started).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id||'').localeCompare(String(a.id||'')));
  const latest=started.length?by[started[0].workflowId]:Object.values(by).find(l=>l.started);
  if(!latest)return out;
  const run=started[0];
  if(run?.workflowSnapshot?.name){
    latest.workflowName=run.workflowSnapshot.name;
    latest.label=run.workflowSnapshot.name;
  }
  latest.orphan=false;
  latest.bindingId=latest.bindingId||bindings[0].id||'';
  latest.assigneeUserId=latest.assigneeUserId||bindings[0].assigneeUserId||0;
  latest.order=bindings[0].order||latest.order||1;
  if(run)latest.latestRunId=run.id;
  return [latest];
}
function issueSOPLabel(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  // 对话需求没有 SOP；工作区记录清理后也不回落到建单时记下的默认 SOP。
  if(conversationWorkspaceIssue(issue))return _t('对话工作区','Chat workspace');
  if(issueWithoutSOP(issue))return _t('不使用 SOP','No SOP');
  const lanes=clientIssueLanes(issue).filter(l=>!l.orphan);
  if(lanes.length===1){
    const name=String(lanes[0].workflowName||lanes[0].label||'').trim();
    if(name&&name!==lanes[0].workflowId)return name;
  }
  const w=(state.data.workflows||[]).find(x=>x.id===issue?.workflowId);
  return w?.name||_t('未关联','Unlinked');
}
function suggestedWorkflowForLane(lane,issue){
  const projectId=issue?.projectId||state.projectFilter;
  const workflows=state.data.workflows||[];
  const match=workflows.find(w=>!w.generic&&inferSOPLane(w)===lane&&(!w.projectId||w.projectId===projectId))||workflows.find(w=>w.generic&&inferSOPLane(w)===lane);
  return match?.id||'';
}
function issueSOPQuickAdds(issue,boundIds){
  return SOP_LANES.map(lane=>{
    const workflowId=suggestedWorkflowForLane(lane.id,issue);
    if(!workflowId||boundIds.has(workflowId))return null;
    const wf=(state.data.workflows||[]).find(w=>w.id===workflowId);
    const label=sopLaneLabel(lane.id);
    return {lane:lane.id,label,workflowId,name:wf?.name||label};
  }).filter(Boolean);
}
function playbookStepNames(book){
  return (book?.bindings||[]).map(b=>{
    const wf=(state.data.workflows||[]).find(w=>w.id===b.workflowId);
    return wf?.name||b.workflowId;
  }).filter(Boolean);
}
function issueLaneDots(issue){
  const lanes=clientIssueLanes(issue).filter(l=>!l.orphan);
  if(lanes.length<2)return '';
  return `<span class="issue-lane-dots">${lanes.map(l=>`<i class="lane-dot ${escapeHTML(l.status||'not_started')}" title="${escapeHTML(l.label||l.workflowName||l.lane)} · ${escapeHTML(laneStatusLabel(l.status))}"></i>`).join('')}</span>`;
}
function issueOwnerSummary(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const primary=issueAssigneeName(i)||_t('未指定','Unassigned');
  const extra=[...new Set((i.sopBindings||[]).map(b=>Number(b.assigneeUserId)||0).filter(id=>id&&id!==Number(i.assigneeUserId)))];
  return extra.length?`${primary} · +${extra.length}`:primary;
}
function issueHasFailedNode(run){
  return Object.values(run?.nodes||{}).some(n=>n?.status==='failed');
}
function issueRunHealth(i){
  const {task,run}=issueExecution(i);
  if(issueExecutionBlocked(i))return'closed';
  if(issueTrackerClosed(i))return'closed';
  if(conversationWorkspaceIssue(i,run))return deliveryLocked(i)||conversationIssueStage(i).key==='closed'?'closed':'active';
  if(run&&['queued','running','waiting'].includes(run.status))return'active';
  if(isGhostRun(run))return'active';
  if(run?.status==='succeeded')return'closed';
  if(run?.status==='failed'||run?.status==='cancelled'||issueHasFailedNode(run))return'attention';
  if(issueClarifying(i.id))return'active';
  if(clarificationNeedsConfirm(i))return'attention';
  if(task&&['queued','dispatched','running'].includes(task.status))return'active';
  if(!task||!run)return'not_started';
  return'not_started';
}
function issueHealthRank(i){return ({attention:0,active:1,not_started:2,closed:3}[issueRunHealth(i)]??4)}
function currentRunNode(i){
  const {run,workflow}=issueExecution(i);if(!run||run.status==='queued')return null;
  const defs=run.workflowSnapshot?.nodes||workflow?.nodes||[];
  const entries=Object.entries(run.nodes||{});
  const hit=entries.find(([,n])=>n.status==='failed')||entries.find(([,n])=>n.status==='waiting_approval')||entries.find(([,n])=>n.status==='running');
  if(!hit)return null;
  const node=defs.find(n=>n.id===hit[0]);
  const agent=(state.data.agents||[]).find(x=>x.id===node?.agentId);
  return {id:hit[0], nodeRun:hit[1], def:node, agent};
}
function issueActor(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(issueExecution(i).run?.status==='queued')return{kind:'active',title:_t('排队中','Queued'),sub:_t('获得项目名额后自动启动','Starts when a project slot frees up')};
  const live=currentRunNode(i);
  const bound=(state.data.agents||[]).find(x=>x.id===i.assigneeId);
  if(live?.nodeRun?.status==='waiting_approval')return{kind:'waiting',title:_t('待你审批','Awaiting approval'),sub:live.def?.name||_t('人工门禁','Human gate')};
  if(live?.nodeRun?.status==='failed')return{kind:'attention',title:_t('需要介入','Needs attention'),sub:_t(`${live.def?.name||'当前节点'} · 门禁失败`,`${live.def?.name||'Current step'} · Gate failed`)};
  if(live?.nodeRun?.status==='running')return{kind:'active',title:live.agent?.name||_t('Agent 执行中','Agent running'),sub:live.def?.name||_t('运行中','Running')};
  if(issueClarifying(i.id))return{kind:'active',title:_t('澄清分析中','Clarifying'),sub:_t('关闭网页也不会中断','Continues in background')};
  const task=latestIssueTask(i);
  if(task&&['queued','dispatched','running'].includes(task.status))return{kind:'active',title:_t('正在启动','Starting'),sub:task.status==='queued'?_t('排队中','Queued'):_t('调度中','Dispatching')};
  if(issueRunHealth(i)==='attention')return{kind:'attention',title:_t('需要介入','Needs attention'),sub:issueCurrentStage(i).hint||_t('运行失败或已中断','Failed or interrupted')};
  if(bound)return{kind:'bound',title:bound.name,sub:_t('已绑定 Agent','Assigned Agent')};
  return{kind:'idle',title:_t('尚未执行','Not started'),sub:_t('触发后由 SOP 节点 Agent 接手','Handled by SOP step Agents once triggered')};
}
function issueOutcome(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const health=issueRunHealth(i),stage=issueCurrentStage(i);
  if(issueManuallyClosed(i))return{key:'closed',short:_t('已关闭','Closed'),title:_t('需求已关闭','Requirement closed'),body:_t('该需求已在 LoopForge 中手动关闭。如需继续修改或执行，请先重新打开。','Closed manually in LoopForge. Reopen before making further changes or running an SOP.')};
  if(issueTrackerClosed(i)&&!issueMergedDelivery(i))return{key:'closed',short:_t('已关闭','Closed'),title:gongfengIssueClosed(i)?_t('工蜂已关闭','Gongfeng closed'):_t('外部工作项已关闭','External work item closed'),body:_t('请先在外部系统重新打开工作项，等待状态同步后再执行。','Reopen in the external tracker first and wait for sync before executing.')};
  if(deliveryLocked(i)){const label=deliveryLockedLabel(i);const isMerged=label==='MR 已合入'||label==='MR merged';const isIntegrated=label==='已合入基线'||label==='Integrated to baseline';const isClosed=label==='关闭'||label==='Closed';const short=isMerged?_t('已合入','Merged'):isIntegrated?_t('已合入基线','Integrated'):isClosed?_t('关闭','Closed'):_t('已交付','Delivered');return{key:'closed',short,title:label,body:isMerged?_t('关联 MR 已合入默认分支。如需继续修改，请用重新触发再开一条 SOP。','Linked MR merged into default branch. Re-trigger to start a new SOP.'):isIntegrated?_t('关联 MR 已合入集成分支，尚未进默认分支。如需继续修改，请用重新触发再开一条 SOP。','Linked MR merged into integration branch, pending default branch. Re-trigger to start a new SOP.'):isClosed?_t('需求已关闭。如需继续修改或执行，请用重新触发再开一条 SOP。','Requirement closed. Re-trigger to start a new SOP.'):_t('SOP 已全部通过。如需继续修改，请用重新触发再开一条 SOP。','SOP passed all steps. Re-trigger to start a new SOP.')};}
  if((i.status||'')==='done'){const isDelivered=stage.label==='交付闭环'||stage.label==='Delivered';return{key:'closed',short:isDelivered?_t('已交付','Delivered'):_t('已完成','Done'),title:isDelivered?_t('交付闭环','Delivered'):_t('需求已完成','Requirement done'),body:isDelivered?_t('SOP 已全部通过。如需继续修改，请先重新打开后再触发新的 SOP。','All SOP steps passed. Reopen before triggering another SOP.'):_t('需求已完成。','Requirement completed.')};}
  if(clarificationNeedsConfirm(i)){
    return{key:'confirm',short:_t('待确认','Confirm'),title:_t('请确认澄清结论并写回原单','Confirm clarification & write back'),body:_t('结论已追加到平台说明。确认写回原单（追加评论）后，即可开始触发需求执行 SOP。','Summary appended to platform description. Confirm write-back to source item before triggering SOP.')};
  }
  if(conversationWorkspaceIssue(i)){const c=conversationIssueStage(i);return{key:c.ended?'idle':c.key==='closed'?'closed':'active',short:c.short,title:_t(`对话交付 · ${c.label}`,`Chat delivery · ${c.label}`),body:c.hint};}
  if(latestIssueRun(i)?.status==='cancelled')return{key:'attention',short:_t('已取消','Cancelled'),title:_t('运行已取消','Run cancelled'),body:_t('这次运行已结束且工作区已清理，不能接着原记录重试。可以重新触发整条 SOP。','This run ended and its workspace was cleaned up; it cannot be retried in place. Re-trigger the SOP instead.')};
  if(health==='attention')return{key:'attention',short:_t('失败','Failed'),title:_t('运行失败','Run failed'),body:_t(`停在「${stage.label}」。可从失败节点重试，或整条重新触发。`,`Stopped at "${stage.label}". Retry from failed step or re-trigger the SOP.`)};
  if(stage.key==='waiting')return{key:'waiting',short:_t('待确认','Waiting'),title:_t('等待确认','Awaiting approval'),body:_t(`「${stage.label}」需要批准后才会继续。`,`"${stage.label}" requires approval to continue.`)};
  if(health==='active')return{key:'active',short:_t('进行中','In progress'),title:_t('进行中','In progress'),body:_t(`当前在「${stage.label}」。`,`Currently at "${stage.label}".`)};
  if(health==='closed')return{key:'closed',short:_t('已完成','Done'),title:_t('已完成','Done'),body:_t('全部节点已通过。结果不对可以重新触发整条，或点某个节点从那里重跑。','All steps passed. Re-trigger the SOP or rerun from a specific step if adjustments are needed.')};
  return{key:'idle',short:_t('未开始','Not started'),title:_t('尚未执行','Not started'),body:_t('触发后会按 SOP 执行。未绑定仓库时会先确认绑定。','Executes the SOP when triggered. You will be prompted if no repository is bound.')};
}
function issueIdForRun(runId){
  const run=(state.data.runs||[]).find(r=>r.id===runId)||(state.activeRun?.id===runId?state.activeRun:null);
  return run?.executionContext?.issueId||(state.data.tasks||[]).find(t=>t.runId===runId)?.issueId||null
}
function gongfengIssueClosed(i){
  return String(i?.source||'').toLowerCase()==='gongfeng' && String(i?.externalRef?.externalState||'').toLowerCase()==='closed';
}
function deliveryLocked(i){return String(i?.deliveryState||'').toLowerCase()==='merged'}
function issueManuallyClosed(i){return String(i?.status||'').toLowerCase()==='closed'&&String(i?.closeSource||'').toLowerCase()!=='external'}
function issueExternalState(i){return String(i?.externalRef?.externalState||'').trim().toLowerCase()}
function issueTrackerClosed(i){
  if(String(i?.status||'').toLowerCase()==='closed'&&String(i?.closeSource||'').toLowerCase()==='external')return true;
  if(gongfengIssueClosed(i))return true;
  const s=issueExternalState(i);
  return s==='closed'||s==='已关闭';
}
function issueInPlanning(i){
  const s=issueExternalState(i);
  return s==='planned'||s==='规划中'||s==='planning';
}
function issueExternallyDone(i){
  return ['done','已完成','完成','合入','已合入'].includes(issueExternalState(i));
}
function deliveryMRLinked(i){return deliveryMRList(i).length>0}
// 待处理 MR：已创建但还没合入的 MR（opened/reopened）。状态未知的历史 MR 不计入，避免数字虚高。
function pendingDeliveryMRCount(i){return deliveryMRList(i).filter(m=>['opened','reopened'].includes(String(m.state||'').toLowerCase())).length}
// 多仓库交付每个仓库一个 MR；旧数据只有 deliveryMrUrl。
function deliveryMRList(i){
  const withRef=m=>{const hit=String(m.url).match(/git\.example\.com\/(.+?)(?:\/-)?\/merge_requests\/(\d+)/);return{...m,project:m.project||hit?.[1]||'',iid:m.iid||Number(hit?.[2])||0}};
  const list=(i?.deliveryMrs||[]).filter(m=>String(m?.url||'').trim());
  if(list.length)return list.map(withRef);
  const url=String(i?.deliveryMrUrl||'').trim();
  return url?[withRef({url,state:i?.deliveryMrState||''})]:[];
}
const deliveryMRStateText={merged:'已合入',integrated:'已合入基线',opened:'待合入',reopened:'待合入',closed:'已关闭'};
function deliveryMRButtons(issue,{cls='button ghost small'}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const list=deliveryMRList(issue);
  const enState={merged:'Merged',integrated:'Integrated to baseline',opened:'Pending merge',reopened:'Pending merge',closed:'Closed'};
  return list.map(mr=>{
    const iid=mr.iid||String(mr.url).match(/merge_requests\/(\d+)/)?.[1]||'';
    const repo=mr.repository||String(mr.project||'').split('/').pop();
    const label=list.length>1?_t(`打开 MR · ${repo||'仓库'}${iid?` !${iid}`:''}`,`Open MR · ${repo||'Repo'}${iid?` !${iid}`:''}`):_t('打开 MR','Open MR');
    const stKey=String(mr.state||'').toLowerCase();
    const st=deliveryMRStateText[stKey]?_t(deliveryMRStateText[stKey],enState[stKey]||deliveryMRStateText[stKey]):'';
    return `<a class="${cls}" href="${escapeHTML(safeURL(mr.url))}" target="_blank" rel="noopener noreferrer" title="${escapeHTML([mr.project,st].filter(Boolean).join(' · ')||mr.url)}">${escapeHTML(label)} ↗</a>`;
  }).join('');
}
function deliveryLockedLabel(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(issueManuallyClosed(i))return _t('关闭','Closed');
  const state=String(i?.deliveryMrState||'').toLowerCase();
  // 旧版手动关闭会写入 deliveryState=merged、deliveryMrState=closed，但没有 MR 链接。
  if(!deliveryMRLinked(i))return state==='closed'?_t('已关闭','Closed'):_t('交付闭环','Delivered');
  switch(state){
    case 'merged':return _t('MR 已合入','MR merged');
    case 'integrated':return _t('已合入基线','Integrated to baseline');
    case 'closed':return _t('MR 已关闭','MR closed');
    default:return _t('交付闭环','Delivered');
  }
}
// 工蜂合入 MR 后会把工单关掉。有真实合入结果时，展示以 MR 为准。
function issueMergedDelivery(i){
  if(!deliveryLocked(i))return false;
  const label=deliveryLockedLabel(i);
  return ['MR 已合入','已合入基线','MR merged','Integrated to baseline'].includes(label);
}
// 对话里直接改代码的需求：只在对话工作区里做，没有派发过 SOP。对话工作区没有节点，
// 状态按 MR 交付推进；会话删除后工作区记录可能已经不在，所以也认需求上记的来源会话。
function conversationWorkspaceIssue(i,run=issueExecution(i).run){
  if(!i||latestIssueTask(i))return false;
  if(run&&run.kind!=='workspace')return false;
  const runs=(state.data.runs||[]).filter(r=>r.executionContext?.issueId===i.id&&!r.executionContext?.parentRunId);
  if(runs.some(r=>r.kind!=='workspace'))return false;
  return run?.kind==='workspace'||runs.length>0||!!String(i.conversationSessionId||'').trim();
}
function conversationIssueStage(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const states=deliveryMRList(i).map(m=>String(m.state||'').toLowerCase());
  if(states.length){
    if(states.every(s=>s==='merged'))return{key:'closed',label:_t('MR 已合入','MR merged'),short:_t('已合入','Merged'),width:100,hint:_t('对话提交的 MR 已合入默认分支','MR created from chat has merged into the default branch')};
    if(states.every(s=>s==='merged'||s==='integrated'))return{key:'closed',label:_t('已合入基线','Integrated to baseline'),short:_t('已合入基线','Integrated'),width:100,hint:_t('对话提交的 MR 已合入集成分支，尚未进默认分支','MR merged into integration branch, pending default branch')};
    if(states.every(s=>s==='closed'))return{key:'closed',ended:true,label:_t('MR 已关闭','MR closed'),short:_t('MR 已关闭','MR closed'),width:100,hint:_t('MR 没有合入就关闭了，需要继续时在对话里重新提交','MR was closed without merging; resubmit in chat to continue')};
    return{key:'active',label:_t('MR 待合入','MR pending'),short:_t('待合入','Pending merge'),width:60,hint:_t('对话已提交 MR，合入默认分支后需求自动完成','MR opened in chat; completes when merged into default branch')};
  }
  const status=String(i?.status||'').toLowerCase();
  if(status==='done')return{key:'closed',label:_t('已完成','Done'),short:_t('已完成','Done'),width:100,hint:_t('需求已完成','Requirement completed')};
  if(status==='in_review')return{key:'active',label:_t('已直推 · 待验收','Pushed · Review'),short:_t('待验收','Pending review'),width:60,hint:_t('改动已直接推送到共享分支，没有 MR，验收后可关闭需求','Changes pushed directly without MR; review and close')};
  return{key:'active',label:_t('对话开发中','Chat dev'),short:_t('开发中','In dev'),width:15,hint:_t('在对话工作区里直接改代码，提交 MR 后进入待合入','Developing in chat workspace; moves to pending merge after opening MR')};
}
// 对话需求没有 SOP 节点，进度列按交付阶段显示文字；合入或关闭后沿用原来的显示。
// MR 没合入就关闭（ended）不算交付完成，进度条置灰而不是绿色。
function conversationIssueProgress(i,run){
  if(issueManuallyClosed(i)||issueTrackerClosed(i)||deliveryLocked(i)||!conversationWorkspaceIssue(i,run))return null;
  const stage=conversationIssueStage(i);
  return{text:stage.short,width:stage.width,title:stage.hint,done:stage.key==='closed'&&!stage.ended,ended:!!stage.ended};
}
// 打开需求关联的会话；项目成员看到的是只读会话，私人会话仍只对本人可见。
function issueConversationURL(issue,session){
  const url=new URL('/',location.origin);
  url.searchParams.set('projectId',issue.projectId);
  if(session)url.searchParams.set('chatSession',session);else url.searchParams.set('chatIssue',issue.id);
  url.hash='/collaboration';
  return url.href;
}
function deliveryBlockReason(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(issueManuallyClosed(i))return _t('工作项已关闭，请先重新打开工作项再触发 SOP','Work item is closed; reopen it before triggering an SOP');
  if(!deliveryLocked(i))return'';
  const label=deliveryLockedLabel(i);
  if(['已关闭','关闭','Closed'].includes(label))return _t('工作项已关闭，请先重新打开工作项再触发 SOP','Work item is closed; reopen it before triggering an SOP');
  return (label==='交付闭环'||label==='Delivered')?_t('工作项已交付闭环，请先重新打开后再触发 SOP','Work item is delivered; reopen it before triggering an SOP'):_t(`${label}，请先重新打开工作项再触发 SOP`,`${label}; reopen work item before triggering SOP`);
}
function issueExecutionBlocked(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(issueTrackerClosed(i)&&!issueManuallyClosed(i))return _t('外部工作项已关闭，请先在外部系统重新打开','External work item is closed; reopen it in the external tracker first');
  const blocked=deliveryBlockReason(i);
  if(blocked)return blocked;
  return'';
}
function closedTrackerHint(issue){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const label=issue?.source==='gongfeng'?_t('工蜂','Gongfeng'):_t('外部工作项','External tracker');return `<span class="muted" title="${_t(`${label}已关闭，不能触发 SOP`,`${label} is closed; cannot trigger SOP`)}">${_t(`${label}已关闭，不能触发`,`${label} closed`)}</span>`}
function deliveredHint(issue){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const label=deliveryLockedLabel(issue);return `<span class="muted" title="${escapeHTML(_t(`${label}，请在详情中重新打开后才可触发`,`${label}; reopen in details before triggering`))}">${escapeHTML(label)}</span>`}
function reopenDeliveredButton(issue,{cls='button primary small'}={}){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;if(issueTrackerClosed(issue)||(!issueManuallyClosed(issue)&&!deliveryLocked(issue)))return'';return `<button type="button" class="${cls}" data-reopen-issue="${escapeHTML(issue.id)}">${_t('重新打开','Reopen')}</button>`}
function canRetriggerIssue(issue,run){
  if(!issue||issueManuallyClosed(issue)||issueTrackerClosed(issue))return false;
  if(clarificationNeedsConfirm(issue))return false;
  const current=run||latestIssueRun(issue);
  if(current&&['queued','running','waiting'].includes(current.status))return false;
  if(deliveryLocked(issue))return true;
  return ['succeeded','failed','cancelled'].includes(current?.status);
}
function retriggerButton(issue,run,{ghost=false,cls}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!canRetriggerIssue(issue,run))return'';
  const klass=cls||(ghost?'button ghost small':'button primary small');
  return `<button type="button" class="${klass}" data-retrigger-issue="${escapeHTML(issue.id)}" title="${_t('整条 SOP 从头再开一条新运行，旧记录保留','Start a fresh SOP run from the beginning; old records remain')}">${_t('重新触发','Re-trigger')}</button>`;
}
function triggerSOPButton(issue,{ghost=false,cls='button primary small',text}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(issueWithoutSOP(issue))return `<button class="${ghost?'button ghost small':cls}" data-chat-issue="${escapeHTML(issue.id)}" title="${_t('这条需求不使用 SOP','This requirement does not use an SOP')}">${_t('去对话处理','Open in chat')}</button>`;
  if(issueExecutionBlocked(issue))return issueTrackerClosed(issue)&&!issueManuallyClosed(issue)?closedTrackerHint(issue):deliveredHint(issue);
  if(clarificationNeedsConfirm(issue))return `<button class="${ghost?'button ghost small':cls}" data-start-clarify title="${_t('请先确认澄清结论并写回原单','Confirm clarification summary and write back first')}">${_t('去确认结论','Confirm summary')}</button>`;
  return `<button class="${ghost?'button ghost small':cls}" data-dispatch-issue="${escapeHTML(issue.id)}">${text||_t('触发','Trigger')}</button>`;
}
function issueActionButtons(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const {task,run}=issueExecution(i),stage=issueCurrentStage(i),health=issueRunHealth(i);
  const more=`<button type="button" class="issue-act-more" data-issue-menu="${escapeHTML(i.id)}" title="${_t('更多操作','More actions')}" aria-label="${_t('更多操作','More actions')}"><svg class="agent-icon harness-icon" data-icon="more-horizontal" width="16" height="16" aria-hidden="true" focusable="false"></svg></button>`;
  // 对话工作区没有节点，查看打开需求详情里的对话交付，而不是空的运行页。
  if(conversationWorkspaceIssue(i,run))return `<button type="button" class="issue-act" data-open-issue="${escapeHTML(i.id)}" data-dtab="sop">${_t('查看','View')}</button>${more}`;
  if(issueManuallyClosed(i)||deliveryLocked(i)||issueTrackerClosed(i))return `${run?`<button type="button" class="issue-act" data-view-run="${escapeHTML(run.id)}">${_t('查看','View')}</button>`:''}${more}`;
  if(issueClarifying(i.id))return `<button type="button" class="issue-act" data-open-issue="${escapeHTML(i.id)}" data-dtab="clarify">${_t('查看分析','View analysis')}</button>${more}`;
  if(clarificationNeedsConfirm(i))return `<button type="button" class="issue-act primary" data-open-issue="${escapeHTML(i.id)}" data-dtab="clarify">${_t('确认结论','Confirm')}</button>${more}`;
  if(stage.key==='waiting')return `<button type="button" class="issue-act primary" data-open-issue="${escapeHTML(i.id)}" data-dtab="sop">${run?.pauseRequested?_t('继续流程','Resume'):_t('去确认','Review')}</button>${more}`;
  if(run?.status==='cancelled')return `${run?`<button type="button" class="issue-act" data-view-run="${escapeHTML(run.id)}">${_t('查看','View')}</button>`:''}${more}`;
  if(run?.status==='failed'){
    return `<button type="button" class="issue-act danger" data-open-issue="${escapeHTML(i.id)}" data-dtab="sop" title="${_t('查看失败原因并选择恢复方式','View failure details and choose recovery')}">${_t('处理失败','Resolve')}</button>${more}`;
  }
  if(health==='active'||health==='attention')return `<button type="button" class="issue-act" data-view-run="${escapeHTML(run?.id||'')}">${_t('查看','View')}</button>${more}`;
  if(health==='closed')return `${run?`<button type="button" class="issue-act" data-view-run="${escapeHTML(run.id)}">${_t('查看','View')}</button>`:''}${more}`;
  if(issueWithoutSOP(i))return `<button type="button" class="issue-act primary" data-chat-issue="${escapeHTML(i.id)}" title="${_t('这条需求不使用 SOP，在对话里澄清和改代码','No SOP assigned; clarify and edit code in chat')}">${_t('去对话','Chat')}</button>${more}`;
  return `<button type="button" class="issue-act primary" data-trigger-issue="${escapeHTML(i.id)}" title="${i.workflowId?_t('整条 SOP 从头执行','Run entire SOP from start'):_t('尚未绑定 SOP，触发时会先确认绑定','No SOP bound yet; confirm binding before running')}">${_t('触发','Trigger')}</button>${more}`;
}
function setIssueRunFilter(value,toggle=true){
  const next=toggle&&state.issueRunFilter===value?'':(value||'');
  state.issueRunFilter=next;
  resetListPage('issues');
  const sel=$('#issueRunFilter');if(sel)sel.value=next;
  if(next==='attention'&&state.issueView==='kanban')setIssueView('table',false);
  if(!$('#issuesView')?.classList.contains('active'))switchView('issues');
  else renderIssues();
}
let issueMenuPopover=null,issueMenuTrigger=null;
function ensureIssueMenuPopover(){
  if(issueMenuPopover)return issueMenuPopover;
  issueMenuPopover=document.createElement('div');
  issueMenuPopover.id='issueActionPopover';
  issueMenuPopover.className='issue-action-popover';
  issueMenuPopover.hidden=true;
  document.body.appendChild(issueMenuPopover);
  document.addEventListener('click',e=>{
    if(issueMenuPopover.hidden)return;
    if(issueMenuPopover.contains(e.target)||e.target.closest('[data-issue-menu]'))return;
    hideIssueActionMenu();
  });
  window.addEventListener('resize',hideIssueActionMenu,{passive:true});
  window.addEventListener('scroll',hideIssueActionMenu,{passive:true});
  document.addEventListener('keydown',e=>{
    if(issueMenuPopover.hidden)return;
    if(e.key==='Escape'){
      e.preventDefault();
      hideIssueActionMenu();
      issueMenuTrigger?.focus({preventScroll:true});
    }else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();
      const items=[...issueMenuPopover.querySelectorAll('button:not(:disabled)')];
      const current=items.indexOf(document.activeElement);
      const next=e.key==='Home'?0:e.key==='End'?items.length-1:(current+(e.key==='ArrowUp'?-1:1)+items.length)%items.length;
      items[next]?.focus();
    }else if(e.key==='Tab'){
      hideIssueActionMenu();
      issueMenuTrigger?.focus({preventScroll:true});
    }
  });
  return issueMenuPopover;
}
function hideIssueActionMenu(){
  issueMenuTrigger?.setAttribute('aria-expanded','false');
  if(issueMenuPopover&&!issueMenuPopover.hidden){
    issueMenuPopover.hidden=true;
    issueMenuPopover.innerHTML='';
  }
}
function showIssueActionMenu(e,issueId){
  e.preventDefault();
  e.stopPropagation();
  const issue=(state.data?.issues||[]).find(i=>i.id===issueId);
  if(!issue)return;
  issueMenuTrigger?.setAttribute('aria-expanded','false');
  issueMenuTrigger=e.currentTarget;
  issueMenuTrigger.setAttribute('aria-expanded','true');
  issueMenuTrigger.setAttribute('aria-controls','issueActionPopover');
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const menu=ensureIssueMenuPopover();
  const isClosed=issue.status==='done'||issueManuallyClosed(issue)||deliveryLocked(issue);
  menu.innerHTML=`
    <button type="button" class="issue-popover-item" data-action="edit">${huiIcon('edit','popover-icon')}${_t('编辑需求','Edit requirement')}</button>
    ${issueTrackerClosed(issue)||(!isClosed&&!issueCanClose(issue))?'':!isClosed?`<button type="button" class="issue-popover-item danger" data-action="close">${huiIcon('close','popover-icon')}${_t('关闭需求','Close requirement')}</button>`:`<button type="button" class="issue-popover-item" data-action="reopen">${huiIcon('undo','popover-icon')}${_t('重新打开','Reopen')}</button>`}
    ${issueDeleteControlHTML(issue,{menu:true})}
  `;
  window.AgentFlowHarnessIcons?.hydrate?.(menu);
  menu.querySelector('[data-action="edit"]').onclick=ev=>{
    ev.stopPropagation();
    hideIssueActionMenu();
    openIssue(issue);
  };
  const deleteBtn=menu.querySelector('[data-action="delete"]');
  if(deleteBtn&&!deleteBtn.disabled)deleteBtn.onclick=ev=>{
    ev.stopPropagation();
    hideIssueActionMenu();
    deleteIssueById(issue.id);
  };
  bindIssueDeletionContext(menu);
  const closeBtn=menu.querySelector('[data-action="close"]');
  if(closeBtn){
    closeBtn.onclick=ev=>{
      ev.stopPropagation();
      hideIssueActionMenu();
      closeIssueById(issue.id);
    };
  }
  const reopenBtn=menu.querySelector('[data-action="reopen"]');
  if(reopenBtn){
    reopenBtn.onclick=ev=>{
      ev.stopPropagation();
      hideIssueActionMenu();
      reopenDeliveredIssue(issue.id);
    };
  }
  menu.hidden=false;
  menu.querySelector('button:not(:disabled)')?.focus();
  const btn=e.currentTarget;
  const rect=btn.getBoundingClientRect();
  const menuWidth=menu.offsetWidth||136;
  const menuHeight=menu.offsetHeight||72;
  let left=rect.right-menuWidth;
  left=Math.max(8,Math.min(left,window.innerWidth-menuWidth-8));
  let top=rect.bottom+4;
  if(top+menuHeight>window.innerHeight-8){
    top=rect.top-menuHeight-4;
  }
  menu.style.position='fixed';
  menu.style.left=`${Math.round(left)}px`;
  menu.style.top=`${Math.round(Math.max(8,top))}px`;
}
function bindIssueRowActions(root=document){
  bindIssueTriggers(root);
  root.querySelectorAll('[data-issue-menu]').forEach(button=>button.onclick=e=>showIssueActionMenu(e,button.dataset.issueMenu));
  root.querySelectorAll('[data-edit-issue]').forEach(button=>button.onclick=e=>{e.stopPropagation();const id=button.dataset.editIssue;openIssue((state.data.issues||[]).find(i=>i.id===id)||(id?{id}:null))});
  root.querySelectorAll('[data-open-issue]').forEach(button=>button.onclick=e=>{e.stopPropagation();openIssueDetail(button.dataset.openIssue,button.dataset.dtab||'sop')});
  root.querySelectorAll('[data-open-logs]').forEach(button=>button.onclick=e=>{e.stopPropagation();openRunFromId(button.dataset.openLogs,{forceRuns:true})});
  root.querySelectorAll('[data-open-run]').forEach(button=>button.onclick=e=>{e.stopPropagation();openRunFromId(button.dataset.openRun)});
  root.querySelectorAll('[data-view-run]').forEach(button=>button.onclick=e=>{e.stopPropagation();if(button.dataset.viewRun){switchView('runs');showRunDetail(button.dataset.viewRun)}});
  root.querySelectorAll('[data-resume-run]').forEach(button=>button.onclick=e=>{e.stopPropagation();resumeRun(button.dataset.resumeRun,button)});
  root.querySelectorAll('[data-pass-node]').forEach(button=>button.onclick=e=>{e.stopPropagation();passFailedNode(button.dataset.passNode,button.dataset.node,button)});
  root.querySelectorAll('[data-reopen-issue]').forEach(button=>button.onclick=e=>{e.stopPropagation();reopenDeliveredIssue(button.dataset.reopenIssue)});
  root.querySelectorAll('[data-retrigger-issue]').forEach(button=>button.onclick=e=>{e.stopPropagation();retriggerIssue(button.dataset.retriggerIssue)});
  root.querySelectorAll('[data-chat-issue]').forEach(button=>button.onclick=e=>{e.stopPropagation();openIssueInChatById(button.dataset.chatIssue)});
  root.querySelectorAll('[data-rerun-from-here]').forEach(button=>button.onclick=e=>{e.stopPropagation();openRerunFromNode(state.issueDetailData?.run,button.dataset.rerunFromHere)});
  root.querySelectorAll('[data-close-issue]').forEach(button=>button.onclick=e=>{e.stopPropagation();closeIssueById(button.dataset.closeIssue)});
}
function issueLaneStage(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const lanes=clientIssueLanes(i).filter(l=>l.started);
  if(lanes.length<2)return null;
  const attn=lanes.find(l=>l.status==='attention');
  if(attn)return{key:'attention',label:_t(`失败 · ${attn.label}`,`Failed · ${attn.label}`),hint:_t(`${attn.label}需要介入`,`${attn.label} requires attention`)};
  const wait=lanes.find(l=>l.status==='waiting');
  if(wait)return{key:'waiting',label:_t(`${wait.label}待确认`,`${wait.label} waiting`),hint:_t(`${wait.label}等待人工判断`,`${wait.label} awaiting human decision`)};
  const active=lanes.find(l=>l.status==='active');
  if(active)return{key:'active',label:_t(`${active.label}进行中`,`${active.label} running`),hint:_t(`${active.label}正在执行`,`${active.label} in progress`)};
  if(lanes.every(l=>l.status==='succeeded'||l.status==='closed'))return{key:'closed',label:_t('交付闭环','Delivered'),hint:_t('已跑过的泳道均已通过','All executed lanes passed')};
  return{key:'active',label:lanes.map(l=>l.label).join(' / '),hint:_t('多条 SOP 并行','Multiple SOPs in parallel')};
}
function issueNestedWaitingStage(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const snap=state.issueDetailData?.requirement;
  if(snap?.issue?.id!==i.id||snap.overall?.status!=='waiting')return null;
  const findWait=stages=>{
    for(const st of stages||[]){
      if(st.status==='waiting_approval')return st;
      const deep=findWait(st.children);
      if(deep)return deep;
    }
    return null;
  };
  for(const lane of snap.lanes||[]){
    if(!lane.started||lane.status!=='waiting')continue;
    const hit=findWait(lane.stages);
    if(hit)return{key:'waiting',label:hit.name||hit.nodeId,hint:_t('等待人工判断','Awaiting human review')};
  }
  return null;
}
function issueCurrentStage(i){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const {task,run,workflow}=issueExecution(i);
  if(issueManuallyClosed(i))return{key:'closed',label:_t('已关闭','Closed'),hint:_t('需求已手动关闭，重新打开后才可再次触发 SOP','Closed manually; reopen before triggering an SOP')};
  if(issueTrackerClosed(i)&&!issueMergedDelivery(i))return{key:'closed',label:gongfengIssueClosed(i)?_t('工蜂已关闭','Gongfeng closed'):_t('已关闭','Closed'),hint:_t('外部工作项已关闭','External work item is closed')};
  if(deliveryLocked(i))return{key:'closed',label:deliveryLockedLabel(i),hint:_t('重新打开后才可再次触发 SOP','Reopen before triggering an SOP')};
  if(conversationWorkspaceIssue(i,run))return conversationIssueStage(i);
  if(!run){
    if(issueClarifying(i.id))return{key:'active',label:_t('澄清分析中','Clarifying'),hint:_t('关闭网页也不会中断，完成后可回来查看','Continues in background even if you close this tab')};
    if(clarificationNeedsConfirm(i)){
      return{key:'confirm',label:_t('待确认结论','Confirm summary'),hint:_t('确认写回原单（追加评论）后即可开始触发需求','Confirm write-back to start executing the requirement')};
    }
    if(task&&['queued','dispatched','running'].includes(task.status)){
      return{key:'active',label:task.status==='queued'?_t('排队中','Queued'):_t('运行中','Running'),hint:_t('任务已调度，正在准备执行工作区与 Agent 环境','Task dispatched; preparing workspace and Agent environment')};
    }
    if((i.status||'')==='done')return{key:'closed',label:_t('已完成','Done'),hint:_t('需求已完成','Requirement completed')};
    if(i.clarification?.status==='in_progress'&&(i.clarification.questions||[]).length){
      return{key:'clarifying',label:_t('待澄清','Needs clarification'),hint:_t('澄清问题等待回答，不影响直接触发 SOP','Questions waiting for answers; does not block triggering SOP')};
    }
    if(i.kind==='requirement'){
      const ready=i.clarification?.status==='ready';
      const multi=issueLaneStage(i);
      if(multi)return multi;
      return{key:'not_started',label:ready?_t('澄清已完成','Clarified'):_t('等待执行','Pending run'),hint:ready?_t('可以进入研发 SOP','Ready to start development SOP'):_t('尚未创建运行','No run started yet')};
    }
    return{key:'not_started',label:_t('等待执行','Pending run'),hint:_t('尚未创建运行','No run started yet')};
  }
  if(run.status==='queued')return{key:'active',label:_t('排队中','Queued'),hint:_t('获得项目名额后自动启动','Starts when a project slot opens')};
  const multi=issueLaneStage(i);
  if(multi)return multi;
  if(run.status==='succeeded'){
    if(String(i.deliveryState||'').toLowerCase()==='reopened')return{key:'active',label:issueStatusLabel(i.status),hint:_t('已重新打开，当前状态以需求状态为准','Reopened; tracking current requirement status')};
    return{key:'closed',label:_t('交付闭环','Delivered'),hint:_t('全部节点已通过','All steps passed')};
  }
  const nestedWait=issueNestedWaitingStage(i);
  if(nestedWait)return nestedWait;
  const definitions=run.workflowSnapshot?.nodes||workflow?.nodes||[],byID=new Map(definitions.map(n=>[n.id,n])),entries=Object.entries(run.nodes||{});
  const ghost=isGhostRun(run);
  const current=entries.find(([,n])=>n.status==='failed')||entries.find(([,n])=>n.status==='waiting_approval')||entries.find(([,n])=>n.status==='running')||entries.find(([,n])=>n.status==='pending_input')||entries.find(([,n])=>n.status==='cancelled');
  if(current){
    const [id,node]=current,name=byID.get(id)?.name||id;
    if(node.status==='failed')return{key:'attention',label:_t(`失败 · ${name}`,`Failed · ${name}`),hint:String(node.error||_t('门禁失败','Gate failed')).slice(0,120)};
    if(node.status==='waiting_approval')return{key:'waiting',label:name,hint:_t('等待人工判断','Awaiting human review')};
    if(node.status==='cancelled')return{key:'attention',label:_t(`已取消 · ${name}`,`Cancelled · ${name}`),hint:_t('可重新触发整条 SOP，不能接着这次运行重试','Re-trigger the SOP; cancelled runs cannot be retried')};
    if(node.status==='running'||node.status==='pending_input'){
      const hint=ghost?_t('运行状态已失效，但节点仍在执行，建议取消','Run status stale while step still active; consider cancelling'):String(node.activity||_t('Agent 正在执行','Agent running'));
      return{key:'active',label:name,hint};
    }
    return{key:'active',label:name,hint:_t('Agent 正在执行','Agent running')};
  }
  if(run.status==='failed')return{key:'attention',label:_t('运行失败','Run failed'),hint:_t('打开查看失败原因','Open to view failure details')};
  if(run.status==='cancelled')return{key:'attention',label:_t('运行已取消','Run cancelled'),hint:_t('可重新触发整条 SOP，不能接着这次运行重试','Re-trigger the SOP; cancelled runs cannot be retried')};
  const last=[...entries].reverse().find(([,n])=>n.status==='succeeded');return{key:'not_started',label:last?(byID.get(last[0])?.name||last[0]):_t('等待调度','Pending dispatch'),hint:last?_t('等待下一节点','Waiting for next step'):_t('尚未开始','Not started')}
}
