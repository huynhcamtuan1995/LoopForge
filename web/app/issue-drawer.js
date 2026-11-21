// ================= Issue 详情抽屉 =================
const issueClarifyJobs=new Map();
let renderedIssueClarifyKey='';
let submittedClarifyDraft=null;
function issueClarifying(id){
  if(!!id&&issueClarifyJobs.has(id))return true;
  const issue=(state.data.issues||[]).find(i=>i.id===id)||state.issueDetailData?.issue;
  return issue?.id===id&&issue?.clarification?.status==='analyzing';
}
function closeIssueDrawer(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const id=state.issueDetailData?.issue?.id;
  const running=issueClarifying(id);
  state.drawerOpen=false;
  const d=$('#issueDetailDrawer');if(d){d.classList.remove('open');d.setAttribute('aria-hidden','true')}
  if(running)toast(_t('澄清继续在后台进行','Clarification continues in the background'));
}
async function openIssueDetail(id,tab){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!id)return;
  const issueId=String(id);
  state.drawerOpen=true;state.selectedIssue=issueId;state.issueDetailData=null;
  const drawer=$('#issueDetailDrawer');
  if(drawer&&drawer.parentElement!==document.body)document.body.appendChild(drawer);
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden','false');
  $('#issueDetailBody').innerHTML=`<div class="detail-empty">${escapeHTML(_t('正在加载需求详情…','Loading requirement details…'))}</div>`;
  try{
    const detail=await api(`/api/issues/${encodeURIComponent(issueId)}`);const issue=detail.issue;const comments=detail.comments||[];
    const localIssue=(state.data.issues||[]).find(i=>i.id===issueId);
    // Keep local view state, but deletion feedback must come from this fresh detail response.
    const permissions={deletionAllowed:issue.deletionAllowed,deletionRequiresForce:issue.deletionRequiresForce,deletionBlock:issue.deletionBlock,closureAllowed:issue.closureAllowed};
    if(localIssue){Object.assign(issue,localIssue,permissions);Object.assign(localIssue,permissions)}
    const task=latestIssueTask(issue);
    const runId=task?.runId||latestIssueRun(issue, task)?.id;
    let requirement=null;
    try{requirement=await api(`/api/issues/${encodeURIComponent(issueId)}/requirement`,{silent:true})}catch(e){}
    let run=null;
    if(runId){
      try{run=await api(`/api/runs/${runId}`)}catch(e){}
      if(run?.id){
        if(!state.data.runs)state.data.runs=[];
        const rIdx=state.data.runs.findIndex(r=>r.id===run.id);
        if(rIdx>=0)state.data.runs[rIdx]={...state.data.runs[rIdx],...run};
        else state.data.runs=sortRunsDescending([run,...state.data.runs]);
        if(['queued','running','waiting'].includes(run.status))startLiveRun(run.id);
      }
    }
    let deletionTask=null;
    if(issue.deletionBlock?.taskId&&!issue.deletionBlock.runId){
      try{deletionTask=await api(`/api/tasks/${encodeURIComponent(issue.deletionBlock.taskId)}`,{silent:true})}catch(e){}
      if(deletionTask?.issueId!==issueId)deletionTask=null;
    }
    state.issueDetailData={issue,comments,run,task,requirement,deletionTask};
    const health=issueRunHealth(issue),stage=issueCurrentStage(issue),needsConfirm=clarificationNeedsConfirm(issue);
    state.issueDetailTab=tab||(issueClarifying(issueId)||needsConfirm?'clarify':((health==='attention'||health==='active'||stage.key==='waiting')?'sop':'overview'));
    $$('#issueDetailTabs .drawer-tab').forEach(b=>b.classList.toggle('active',b.dataset.dtab===state.issueDetailTab));
    renderIssueDetailTab();
    if(issueClarifying(issueId)){
      restoreIssueClarifyThinking(issueId);
      attachIssueClarifyStream(issueId);
    }
  }catch(e){$('#issueDetailBody').innerHTML=`<div class="detail-empty">${escapeHTML(_t('加载失败：','Load failed: '))}${escapeHTML(e.message)}</div>`}
}
function issueClarifyViewKey(issue,project){
  const c=issue?.clarification||{};
  return JSON.stringify({
    analyzing:!!issueClarifying(issue?.id),
    status:c.status||'',
    lastError:c.lastError||'',
    summary:c.summary||'',
    writeBack:c.writeBackStatus||'',
    writeBackError:c.writeBackError||'',
    questions:(c.questions||[]).map(q=>({question:q.question||'',multi:!!q.multiSelect,options:clarifyQuestionOptions(q)})),
    history:(c.history||[]).map(h=>({role:h.role||'',content:h.content||''})),
    source:issue?.source||'',
    external:issue?.externalRef?.externalUrl||'',
    confirm:!!clarificationNeedsConfirm(issue),
    blocked:issueExecutionBlocked(issue)||''
  });
}
function clarifyQuestionKey(questions){
  return (questions||[]).map(q=>`${q.question||''}\n${clarifyQuestionOptions(q).join('\n')}`).join('\n---\n');
}
function rememberSubmittedClarifyDraft(issue,msg){
  const questions=issue?.clarification?.questions||[];
  const captured=captureIssueClarifyDraft($('#issueDetailBody'));
  const reply=String(msg||'').trim();
  submittedClarifyDraft={
    issueId:issue?.id||'',
    questionKey:clarifyQuestionKey(questions),
    questions:captured?.questions||[],
    extra:captured?.extra||'',
    reply:CLARIFY_AUTO_PROMPTS.includes(reply)?'':reply
  };
}
function clarifyAnswerDraft(issue){
  const saved=submittedClarifyDraft;
  if(!saved||saved.issueId!==issue?.id)return null;
  const status=issue?.clarification?.status||'';
  if(status==='ready'){submittedClarifyDraft=null;return null}
  if(!issueClarifying(issue.id)&&saved.questionKey!==clarifyQuestionKey(issue?.clarification?.questions)){
    submittedClarifyDraft=null;
    return null;
  }
  return saved;
}
function clarifySubmittedHTML(reply){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const text=String(reply||'').trim();
  if(!text||CLARIFY_AUTO_PROMPTS.includes(text))return '';
  return `<div class="clarify-submitted"><b>${escapeHTML(_t('本轮回答已提交','Response submitted'))}</b><p>${escapeHTML(text)}</p></div>`;
}
function clarifyQuestionCardsHTML(questions,saved){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return (questions||[]).map((q,i)=>{
    const picked=saved?.questions?.[i];
    const options=clarifyQuestionOptions(q).map((opt,j)=>`<button type="button" class="issue-clarify-option${picked?.selected?.[j]?' selected':''}" data-multi="${!!q.multiSelect}">${escapeHTML(opt)}</button>`).join('');
    return `<div class="issue-clarify-question"><b>${i+1}. ${escapeHTML(q.question)}</b><div class="issue-clarify-options">${options}</div><input class="issue-clarify-other" data-question="${i}" placeholder="${escapeHTML(_t('其他：自己填写','Other: enter your own'))}" value="${escapeHTML(picked?.other||'')}"></div>`;
  }).join('');
}
function captureIssueClarifyDraft(host){
  if(!host?.querySelectorAll)return null;
  const active=document.activeElement;
  const others=[...host.querySelectorAll('.issue-clarify-other')];
  const questions=[...host.querySelectorAll('.issue-clarify-question')].map(row=>({
    text:row.querySelector('b')?.textContent||'',
    selected:[...row.querySelectorAll('.issue-clarify-option')].map(b=>b.classList.contains('selected')),
    other:row.querySelector('.issue-clarify-other')?.value||''
  }));
  const extra=host.querySelector('#issueClarifyInput');
  if(!questions.length&&!extra)return null;
  let focus=null;
  if(active&&host.contains?.(active)){
    const sel=typeof active.selectionStart==='number'?{start:active.selectionStart,end:active.selectionEnd}:null;
    if(active.id==='issueClarifyInput')focus={kind:'extra',sel};
    else if(active.classList?.contains('issue-clarify-other'))focus={kind:'other',index:others.indexOf(active),sel};
  }
  return {questions,extra:extra?.value||'',focus,scroll:host.scrollTop||0};
}
function restoreIssueClarifySelection(el,sel){
  if(!el||!sel||typeof el.setSelectionRange!=='function')return;
  try{el.setSelectionRange(sel.start,sel.end)}catch{}
}
function restoreIssueClarifyDraft(host,draft){
  if(!host||!draft)return;
  const rows=[...host.querySelectorAll('.issue-clarify-question')];
  const same=rows.length===draft.questions.length&&rows.every((row,i)=>(row.querySelector('b')?.textContent||'')===draft.questions[i].text);
  if(!same)return;
  rows.forEach((row,i)=>{
    const saved=draft.questions[i];
    [...row.querySelectorAll('.issue-clarify-option')].forEach((b,j)=>b.classList.toggle('selected',!!saved.selected[j]));
    const other=row.querySelector('.issue-clarify-other');
    if(other)other.value=saved.other||'';
  });
  const extra=host.querySelector('#issueClarifyInput');
  if(extra)extra.value=draft.extra||'';
  if(host.scrollTop!=null)host.scrollTop=draft.scroll||0;
  if(draft.focus?.kind==='extra'&&extra){
    extra.focus?.();
    restoreIssueClarifySelection(extra,draft.focus.sel);
  }else if(draft.focus?.kind==='other'){
    const input=host.querySelectorAll('.issue-clarify-other')[draft.focus.index];
    if(input){input.focus?.();restoreIssueClarifySelection(input,draft.focus.sel)}
  }
}
function renderIssueDetailTab(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const data=state.issueDetailData;const host=$('#issueDetailBody');if(!data||!host)return;
  const issue=data.issue;if(!issue){host.innerHTML=`<div class="detail-empty">${escapeHTML(_t('未找到该需求','Requirement not found'))}</div>`;renderedIssueClarifyKey='';return}
  const project=(state.data.projects||[]).find(p=>p.id===issue.projectId);
  $('#issueDetailKey').textContent=issueKeyLabel(issue);
  $('#issueDetailTitle').textContent=issue.title||'';
  $('#issueDetailSubtitle').textContent=`${project?.name||'—'} · ${issuePriorityLabel(issue.priority)} · ${issueStatusText(issue)} · ${_t('更新于 ','Updated ')}${new Date(issue.updatedAt).toLocaleString()}`;
  // 答案只存在输入框里。问题没变时跳过重绘，避免轮询和运行推送把正在填的内容清掉。
  const clarifyKey=state.issueDetailTab==='clarify'?issueClarifyViewKey(issue,project):'';
  if(clarifyKey&&clarifyKey===renderedIssueClarifyKey&&host.querySelector?.('.clarify-workspace'))return;
  const clarifyDraft=clarifyKey?captureIssueClarifyDraft(host):null;
  const panes={conversations:`<div class="detail-empty">${escapeHTML(_t('正在加载关联会话…','Loading linked conversations…'))}</div>`,overview:overviewPane(issue,data),operations:operationsPane(issue),clarify:clarifyPane(issue,project),sop:sopPane(issue,data),artifacts:artifactsPane(data),delivery:deliveryPane(issue,data),acceptance:acceptancePane(issue,data),activity:activityPane(issue,data)};
  host.innerHTML=panes[state.issueDetailTab]||`<div class="detail-empty">${escapeHTML(_t('暂无内容','No content'))}</div>`;
  if(state.issueDetailTab==='conversations')void renderIssueConversations(issue,host);
  renderedIssueClarifyKey=clarifyKey;
  host.querySelectorAll('[data-edit-issue]').forEach(b=>b.onclick=()=>{closeIssueDrawer();openIssue(issue)});
  host.querySelectorAll('[data-dispatch-issue]').forEach(b=>b.onclick=()=>triggerIssue(b.dataset.dispatchIssue,b.dataset.workflow));
  host.querySelectorAll('[data-retrigger-issue]').forEach(b=>b.onclick=()=>retriggerIssue(b.dataset.retriggerIssue,b.dataset.workflow));
  host.querySelectorAll('[data-chat-issue]').forEach(b=>b.onclick=()=>openIssueInChatById(b.dataset.chatIssue));
  const noSOPWorkflow=()=>host.querySelector('[data-no-sop-workflow]')?.value||'';
  host.querySelectorAll('[data-no-sop-bind]').forEach(b=>b.onclick=()=>addIssueSOP(b.dataset.noSopBind,noSOPWorkflow()));
  host.querySelectorAll('[data-no-sop-run]').forEach(b=>b.onclick=()=>triggerIssue(b.dataset.noSopRun,noSOPWorkflow()));
  host.querySelectorAll('[data-rerun-from-here]').forEach(b=>b.onclick=()=>openRerunFromNode((b.dataset.run&&(state.data.runs||[]).find(r=>r.id===b.dataset.run))||data.run,b.dataset.rerunFromHere));
  host.querySelectorAll('[data-toggle-sop-row]').forEach(el=>el.onclick=e=>{
    if(e.target.closest('button,a,select,input,.user-combobox'))return;
    const id=el.dataset.toggleSopRow;
    state.issueSOPOpen=state.issueSOPOpen===id?'':id;
    renderIssueDetailTab();
  });
  bindUserSearches(host);
  host.querySelectorAll('[data-sop-assignee] input[type="hidden"]').forEach(input=>input.onchange=()=>setIssueSOPOwner(issue.id, input.closest('[data-sop-assignee]').dataset.sopAssignee, Number(input.value)||0));
  host.querySelectorAll('[data-push-tapd]').forEach(b=>b.onclick=()=>pushIssueToTAPDFromDetail(b.dataset.pushTapd));
  host.querySelectorAll('[data-resync-tapd]').forEach(b=>b.onclick=()=>resyncTAPDIssueById(b.dataset.resyncTapd));
  host.querySelectorAll('[data-reopen-issue]').forEach(b=>b.onclick=()=>reopenDeliveredIssue(b.dataset.reopenIssue));
  host.querySelectorAll('[data-delete-issue]').forEach(b=>b.onclick=()=>deleteIssueById(b.dataset.deleteIssue||issue.id));
  bindIssueDeletionContext(host);
  host.querySelectorAll('[data-close-issue]').forEach(b=>b.onclick=()=>closeIssueById(b.dataset.closeIssue||issue.id));
  host.querySelectorAll('[data-resume-run]').forEach(b=>b.onclick=()=>resumeRun(b.dataset.resumeRun,b));
  host.querySelectorAll('[data-pause-run]').forEach(b=>b.onclick=()=>pauseRun(b.dataset.pauseRun));
  host.querySelectorAll('[data-open-run]').forEach(b=>b.onclick=e=>{e.stopPropagation();openRunFromId(b.dataset.openRun,{forceRuns:true})});
  host.querySelectorAll('[data-open-logs]').forEach(b=>b.onclick=()=>openRunFromId(b.dataset.openLogs,{forceRuns:true}));
  host.querySelectorAll('[data-rerun-from-here]').forEach(b=>b.onclick=()=>openRerunFromNode(cachedRun(b.dataset.run),b.dataset.rerunFromHere));
  host.querySelectorAll('[data-export-logs]').forEach(b=>b.onclick=()=>downloadRunLogs(b.dataset.exportLogs));
  host.querySelectorAll('[data-artifact]').forEach(b=>b.onclick=()=>previewArtifact(data.run,b.dataset.artifact));
  host.querySelectorAll('[data-start-clarify]').forEach(b=>b.onclick=()=>openIssueClarification(true));
  host.querySelectorAll('[data-continue-clarify]').forEach(b=>b.onclick=()=>{
    const current=state.issueDetailData?.issue;
    if(current?.clarification?.lastError){retryIssueClarifyTurn();return;}
    sendIssueClarification();
  });
  host.querySelectorAll('[data-stop-clarify]').forEach(b=>b.onclick=()=>stopIssueClarification(issue.id));
  host.querySelectorAll('[data-retry-clarify]').forEach(b=>b.onclick=()=>retryIssueClarificationWriteBack());
  host.querySelectorAll('[data-retry-clarify-turn]').forEach(b=>b.onclick=()=>retryIssueClarifyTurn());
  host.querySelectorAll('[data-reclarify]').forEach(b=>b.onclick=()=>openIssueClarification(false,true));
  host.querySelectorAll('.issue-clarify-option').forEach(b=>b.onclick=()=>{
    if(b.dataset.multi==='true'){
      b.classList.toggle('selected');
    }else{
      const wasSelected=b.classList.contains('selected');
      b.parentElement.querySelectorAll('.issue-clarify-option').forEach(x=>x.classList.remove('selected'));
      if(!wasSelected)b.classList.add('selected');
    }
  });
  host.querySelectorAll('[data-clarify-model]').forEach(bindClarifyModelPicker);
  bindWaitingActions(host);
  if(state.issueDetailTab==='clarify'&&issueClarifying(issue.id))restoreIssueClarifyThinking(issue.id);
  if(clarifyDraft)restoreIssueClarifyDraft(host,clarifyDraft);
}
function drawerFact(label,value,title){return `<div class="detail-fact"><span>${label}</span><b title="${escapeHTML(title||value||'')}">${value===''||value==null?'—':value}</b></div>`}
function clarificationOverviewCard(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const c=issue.clarification||{},source=issue.source==='gongfeng'?_t('工蜂','Gongfeng'):issue.source==='tapd'?'TAPD':'LoopForge';
  if(issueClarifying(issue.id)||c.status==='analyzing'){
    return `<div class="clarify-overview"><span>…</span><div><b>${escapeHTML(_t('澄清正在后台分析','Clarification analyzing in background'))}</b><small>${escapeHTML(_t('关闭网页也不会中断，点查看可回到分析过程','Closing the page won’t interrupt it. Click View to return to the analysis'))}</small></div><button class="button ghost small" data-start-clarify>${escapeHTML(_t('查看','View'))}</button></div>`;
  }
  if(c.status==='ready'&&c.summary){
    const failed=c.writeBackStatus==='failed';
    const pending=c.writeBackStatus==='pending';
    const cls=failed||pending?'failed':'ready';
    const title=failed?_t('澄清已完成，写回失败','Clarification done; write-back failed'):pending?_t('澄清已完成，待确认写回','Clarification done; pending write-back confirmation'):_t(`已澄清 · ${c.writeBackStatus==='succeeded'?`已写回 ${source}`:'结论已保存'}`,`Clarified · ${c.writeBackStatus==='succeeded'?`Written back to ${source}`:'Conclusion saved'}`);
    return `<div class="clarify-overview ${cls}"><span>${failed||pending?'!':'✓'}</span><div><b>${title}</b><small>${escapeHTML((c.summary||'').slice(0,120))}${c.summary&&c.summary.length>120?'…':''}</small></div><button class="button ghost small" data-start-clarify>${escapeHTML(_t('查看','View'))}</button></div>`;
  }
  if(c.status==='in_progress'){
    return `<div class="clarify-overview"><span>…</span><div><b>${escapeHTML(_t('澄清尚未完成','Clarification in progress'))}</b><small>${escapeHTML(_t('继续回答关键问题，进度已经保存；不影响直接触发 SOP','Continue answering key questions; progress is saved and does not block triggering an SOP'))}</small></div><button class="button ghost small" data-start-clarify>${escapeHTML(_t('继续','Continue'))}</button></div>`;
  }
  return `<div class="clarify-overview"><span>?</span><div><b>${escapeHTML(_t('描述不够清楚？','Description unclear?'))}</b><small>${escapeHTML(_t('结合原单和代码问清关键细节','Clarify key details with the ticket and codebase'))}</small></div><button class="button ghost small" data-start-clarify>${escapeHTML(_t('帮我问清楚','Help clarify'))}</button></div>`;
}
function setIssueClarifyTab(){
  state.issueDetailTab='clarify';
  $$('#issueDetailTabs .drawer-tab').forEach(b=>b.classList.toggle('active',b.dataset.dtab==='clarify'));
}
const CLARIFY_AUTO_PROMPTS=['请先检查这张工作项的描述和相关代码，告诉我还缺哪些关键信息。','请基于已有澄清结论继续检查，还有哪些重要信息需要补充？'];
function clarifyKickoffPending(issue){
  const c=issue?.clarification||{};
  if(c.status==='ready'||c.status==='in_progress')return false;
  return !(c.questions||[]).length;
}
function openIssueClarification(autoStart=false,restart=false){
  const issue=state.issueDetailData?.issue;if(!issue)return;
  setIssueClarifyTab();
  if(issueClarifying(issue.id)&&!restart){
    renderIssueDetailTab();
    restoreIssueClarifyThinking(issue.id);
    attachIssueClarifyStream(issue.id);
    return;
  }
  issue.clarification=issue.clarification||{};
  if(restart||!issue.clarification.status||issue.clarification.status==='needs_user'||issue.clarification.status==='analyzing'){
    if(restart)issue.clarification.questions=[];
  }
  renderIssueDetailTab();
  if(autoStart&&issue.clarification.status==='analyzing')attachIssueClarifyStream(issue.id);
  else if(autoStart&&clarifyKickoffPending(issue))setTimeout(()=>sendIssueClarification(CLARIFY_AUTO_PROMPTS[0]),0);
  else if(restart)setTimeout(()=>sendIssueClarification(CLARIFY_AUTO_PROMPTS[1]),0);
}
function collectIssueClarifyReply(){
  const parts=[];
  $$('.issue-clarify-question').forEach(row=>{
    const question=row.querySelector('b')?.textContent||'';
    const selected=[...row.querySelectorAll('.issue-clarify-option.selected')].map(x=>x.textContent.trim());
    const other=row.querySelector('.issue-clarify-other')?.value.trim();
    const answers=[...selected,...(other?[other]:[])];
    if(answers.length)parts.push(`${question} ${answers.join('、')}`);
  });
  const extra=$('#issueClarifyInput')?.value.trim();
  if(extra)parts.push(extra);
  return parts.join('\n');
}
function retryIssueClarifyTurn(){
  const issue=state.issueDetailData?.issue;if(!issue)return;
  if(issue.clarification)issue.clarification.lastError='';
  const last=(issue.clarification?.history||[]).filter(h=>h.role==='user').pop();
  sendIssueClarification(last?.content||CLARIFY_AUTO_PROMPTS[0]);
}
function issueClarifyThinking(ev,issueId){
  const job=issueId?issueClarifyJobs.get(issueId):null;
  if(job)job.thinking.push(ev);
  const box=$('#issueClarifyThinking');if(!box)return;
  if(job&&state.issueDetailData?.issue?.id!==issueId)return;
  appendIssueClarifyThought(box,ev);
}
function appendIssueClarifyThought(box,ev){
  if(ev.kind!=='tool'&&clarifyThoughtShouldHide(ev&&ev.text))return;
  box.hidden=false;
  const row=document.createElement('div');
  row.className=`think-row ${ev.kind==='tool'?'think-tool':(ev.kind==='status'?'think-status':'think-idea')}`;
  row.innerHTML=`<span class="think-icon">${ev.kind==='tool'?'🔍':(ev.kind==='status'?'⏳':'💭')}</span><span class="think-text">${escapeHTML(ev.kind==='tool'?`${clarifyToolLabel(ev.tool)}${ev.detail?' · '+ev.detail:''}`:(ev.text||''))}</span>`;
  box.appendChild(row);box.scrollTop=box.scrollHeight;
}
function restoreIssueClarifyThinking(issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const job=issueClarifyJobs.get(issueId),box=$('#issueClarifyThinking');
  if(!box)return;
  if(job){
    box.innerHTML='';
    job.thinking.forEach(ev=>appendIssueClarifyThought(box,ev));
  }
  const button=$('[data-continue-clarify]'),stop=$('[data-stop-clarify]'),hint=$('#issueClarifyHint');
  if(button){button.disabled=true;button.textContent=_t('分析中…','Analyzing…')}
  if(stop)stop.hidden=false;
  if(hint)hint.textContent=_t('正在后台分析，关闭网页也不会中断','Analyzing in the background; closing the page won’t interrupt it');
}
function stopIssueClarification(issueId){
  const job=issueClarifyJobs.get(issueId);
  if(job)job.stopping=true;
  api(`/api/issues/${encodeURIComponent(issueId)}/chat-clarify/cancel`,{method:'POST',body:'{}'}).catch(()=>{});
  if(job?.abort)job.abort.abort();
}
async function attachIssueClarifyStream(issueId){
  if(!issueId)return;
  const existing=issueClarifyJobs.get(issueId);
  if(existing?.abort&&!existing.abort.signal.aborted&&existing.attached)return;
  const abort=new AbortController();
  const job={abort,thinking:existing?.thinking||[],attached:true};
  issueClarifyJobs.set(issueId,{...job});
  renderIssues();
  try{
    const resp=await fetch(`/api/issues/${encodeURIComponent(issueId)}/chat-clarify`,{headers:{Accept:'text/event-stream'},signal:abort.signal});
    if(resp.status===404){
      issueClarifyJobs.delete(issueId);
      return;
    }
    if(!resp.ok){let em=`HTTP ${resp.status}`;try{const d=await resp.json();em=d.error||em}catch{}throw new Error(em)}
    const data=await consumeIssueClarifyStream(resp,issueId);
    await applyIssueClarifyDone(issueId,data);
  }catch(err){
    const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
    if(err.name==='AbortError'){
      const current=issueClarifyJobs.get(issueId);
      if(current?.stopping)toast(_t('已停止本轮澄清','Stopped this clarification round'));
      return;
    }
    toast(_t(`澄清失败：${err.message}`,`Clarification failed: ${err.message}`),'err');
    setIssueClarifyLastError(issueId,err.message);
  }finally{
    finishIssueClarifyJob(issueId,abort);
  }
}
function finishIssueClarifyJob(issueId,abort){
  const current=issueClarifyJobs.get(issueId);
  if(current?.abort===abort)issueClarifyJobs.delete(issueId);
  if(state.drawerOpen&&state.issueDetailData?.issue?.id===issueId)renderIssueDetailTab();
  renderIssues();
}
function setIssueClarifyLastError(issueId,message){
  const issue=state.issueDetailData?.issue;
  if(issue?.id!==issueId)return;
  issue.clarification=issue.clarification||{};
  issue.clarification.lastError=message||'';
}
async function applyIssueClarifyDone(issueId,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!data||data.error)throw new Error(data?.error||_t('分析未返回结果','Analysis returned no result'));
  let updated=data.issue;
  if(!updated){
    try{const detail=await api(`/api/issues/${encodeURIComponent(issueId)}`);updated=detail.issue}catch{}
  }
  if(updated){
    const idx=(state.data.issues||[]).findIndex(x=>x.id===updated.id);if(idx>=0)state.data.issues[idx]=updated;
    if(state.issueDetailData?.issue?.id===issueId)state.issueDetailData.issue=updated;
  }
  if(state.drawerOpen&&state.issueDetailData?.issue?.id===issueId)renderIssueDetailTab();
  else{
    renderIssues();
    if($('#dashboardView')?.classList.contains('active'))renderDashboard();
  }
  const result=parseClarifyPayload(data);
  if(result.ready){
    const wb=updated?.clarification?.writeBackStatus;
    if(wb==='pending')toast(_t('澄清完成，请确认结论后再写回原单','Clarification complete; confirm the conclusion before writing back'),'ok');
    else if(wb==='succeeded')toast(_t('澄清完成，已写回原单','Clarification complete; written back to the ticket'),'ok');
    else toast(_t('澄清完成，结论已保存','Clarification complete; conclusion saved'),'ok');
  }
  else toast(_t('澄清已更新，可以回来继续补充','Clarification updated; you can return to add more'),'ok');
}
async function consumeIssueClarifyStream(resp,issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const reader=resp.body.getReader(),decoder=new TextDecoder();let buffer='',done=null;
  const dispatch=(event,dataStr)=>{let payload={};try{payload=JSON.parse(dataStr)}catch{}if(event==='thought')issueClarifyThinking(payload,issueId);else if(event==='done')done=payload;else if(event==='error')done={error:payload.error||_t('分析失败','Analysis failed')}};
  for(;;){
    const next=await reader.read();if(next.done)break;
    buffer+=decoder.decode(next.value,{stream:true});let idx;
    while((idx=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,idx);buffer=buffer.slice(idx+2);let event='message',data='';chunk.split('\n').forEach(line=>{if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data+=line.slice(5).trim()});if(data)dispatch(event,data)}
  }
  return done||{error:_t('分析未返回结果','Analysis returned no result')};
}
async function sendIssueClarification(initialMessage=''){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=state.issueDetailData?.issue;if(!issue)return;
  const issueId=issue.id;
  if(issueClarifyJobs.has(issueId)&&issueClarifyJobs.get(issueId)?.attached)return toast(_t('澄清正在后台进行','Clarification is running in the background'));
  if(issue.clarification?.status==='analyzing'&&!initialMessage){
    attachIssueClarifyStream(issueId);
    return;
  }
  const msg=initialMessage||collectIssueClarifyReply();
  if(!msg)return toast(_t('请先选择或填写答案','Select or enter an answer first'));
  const c=issue.clarification||(issue.clarification={});
  rememberSubmittedClarifyDraft(issue,msg);
  c.lastError='';
  const prev=c.history||[];
  const last=prev[prev.length-1];
  const history=(last&&last.role==='user'&&last.content===msg)?prev.slice():[...prev,{role:'user',content:msg}];
  c.status='analyzing';
  c.history=history;
  const idxSeed=(state.data.issues||[]).findIndex(x=>x.id===issueId);if(idxSeed>=0)state.data.issues[idxSeed].clarification=c;
  const abort=new AbortController();
  issueClarifyJobs.set(issueId,{abort,thinking:[],attached:true});
  renderIssueDetailTab();
  renderIssues();
  try{
    const resp=await fetch(`/api/issues/${encodeURIComponent(issueId)}/chat-clarify`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify({message:msg,history,model:selectedClarifyModel()}),signal:abort.signal});
    if(!resp.ok){let em=`HTTP ${resp.status}`;try{const d=await resp.json();em=d.error||em}catch{}throw new Error(em)}
    const data=(resp.headers.get('Content-Type')||'').includes('text/event-stream')?await consumeIssueClarifyStream(resp,issueId):await resp.json();
    await applyIssueClarifyDone(issueId,data);
  }catch(err){
    if(c.status==='analyzing')c.status=(c.questions||[]).length?'in_progress':'needs_user';
    if(err.name==='AbortError'){
      const current=issueClarifyJobs.get(issueId);
      if(current?.stopping)toast(_t('已停止本轮澄清','Stopped this clarification round'));
      return;
    }
    toast(_t(`澄清失败：${err.message}`,`Clarification failed: ${err.message}`),'err');
    setIssueClarifyLastError(issueId,err.message);
  }finally{
    finishIssueClarifyJob(issueId,abort);
  }
}
async function retryIssueClarificationWriteBack(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=state.issueDetailData?.issue;if(!issue)return;
  try{
    const updated=await api(`/api/issues/${encodeURIComponent(issue.id)}/clarification`,{method:'POST',body:JSON.stringify({ready:true,retry:true})});
    state.issueDetailData.issue=updated;
    const idx=(state.data.issues||[]).findIndex(x=>x.id===updated.id);
    if(idx>=0)state.data.issues[idx]=updated;
    renderIssueDetailTab();
    renderIssues();
    toast(updated.clarification?.writeBackStatus==='succeeded'?_t('已写回原单评论，现在可以触发需求了！','Written back to ticket comments; you can trigger the requirement now!'):updated.clarification?.writeBackStatus==='pending'?_t('结论已保存，尚未写回原单','Conclusion saved, not yet written back to ticket'):_t(`写回仍未成功：${updated.clarification?.writeBackError||'未知错误'}`,`Write-back failed: ${updated.clarification?.writeBackError||'Unknown error'}`),updated.clarification?.writeBackStatus==='succeeded'?'ok':'err');
  }catch(e){toast(e.message,'err')}
}
async function closeIssueById(issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=(state.data.issues||[]).find(i=>i.id===issueId);
  if(!issue)return toast(_t('未找到需求单','Requirement not found'));
  if(issueManuallyClosed(issue)||issueTrackerClosed(issue))return toast(_t('该需求单已处于关闭状态','This requirement is already closed'));
  if(!issueCanClose(issue))return toast(_t('需求正在澄清或执行 SOP，请先停止后再关闭','Requirement is clarifying or running an SOP; stop it before closing'),'err');
  const ok=await afConfirm({
    title:_t('手动关闭需求','Close requirement'),
    message:_t(`确定手动关闭需求「${issue.title||issue.id}」？关闭后可在状态里筛「已关闭」。`,`Close requirement “${issue.title||issue.id}” manually? You can find it later under “Closed”.`),
    confirmText:_t('确认关闭','Confirm close')
  });
  if(!ok)return;
  try{
    const updated=await api(`/api/issues/${encodeURIComponent(issueId)}/close`,{method:'POST'});
    const idx=(state.data.issues||[]).findIndex(i=>i.id===issueId);
    if(idx>=0)state.data.issues[idx]=updated;
    if(state.issueDetailData?.issue?.id===issueId){
      state.issueDetailData.issue=updated;
      renderIssueDetailTab();
    }
    renderIssues();
    toast(_t('需求已关闭','Requirement closed'),'ok');
  }catch(err){
    toast(err.message,'err');
  }
}
async function resyncTAPDIssueById(issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const issue=(state.data.issues||[]).find(i=>i.id===issueId)||state.issueDetailData?.issue;
  if(!issue)return toast(_t('未找到需求单','Requirement not found'));
  if(issue.source!=='tapd'||!issue.externalRef?.externalId)return toast(_t('仅 TAPD 来源的需求支持重新同步','Only TAPD requirements support re-syncing'));
  try{
    const updated=await api(`/api/issues/${encodeURIComponent(issueId)}/resync-tapd`,{method:'POST'});
    const idx=(state.data.issues||[]).findIndex(i=>i.id===issueId);
    if(idx>=0)state.data.issues[idx]=updated;
    if(state.issueDetailData?.issue?.id===issueId){
      state.issueDetailData.issue=updated;
      renderIssueDetailTab();
    }
    renderIssues();
    toast(_t('已从 TAPD 同步最新内容','Synced latest content from TAPD'),'ok');
  }catch(err){
    toast(err.message,'err');
  }
}
function issueProgressActionsHTML(issue,run,{includeIssueActions=false}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const workflowActions=[],logActions=[],issueActions=[];
  if(run){
    const runId=escapeHTML(run.id);
    if(!gongfengIssueClosed(issue)&&!run.pauseRequested)workflowActions.push(refreshRunSOPButtonHTML(run));
    if(!issueExecutionBlocked(issue)){
      if(canManuallyPassFailedNode(run))workflowActions.push(`<button class="button ghost small" data-pass-node="${runId}" data-node="${escapeHTML(failedNodeId(run))}">${escapeHTML(_t('手动通过失败脚本','Pass failed script'))}</button>`);
      if(run.status==='failed')workflowActions.push(triggerSOPButton(issue,{ghost:true,text:_t('整条 SOP 从头触发','Restart SOP')}));
    }
    logActions.push(`<button class="button ghost small" data-open-logs="${runId}">${escapeHTML(_t('查看运行与日志','View run & logs'))}</button>`);
    logActions.push(`<button class="button ghost small" data-export-logs="${runId}">${escapeHTML(_t('导出全部 Worker 日志','Export all worker logs'))}</button>`);
  }
  if(includeIssueActions){
    issueActions.push(`<button class="button ghost small" data-edit-issue>${escapeHTML(_t('编辑需求','Edit requirement'))}</button>`);
    if(issueCanPushTAPD(issue))issueActions.push(`<button class="button ghost small" data-push-tapd="${escapeHTML(issue.id)}">${escapeHTML(_t('同步到 TAPD','Sync to TAPD'))}</button>`);
    if(issueCanClose(issue)&&issue.status!=='done'&&!issueManuallyClosed(issue)&&!issueTrackerClosed(issue)&&!deliveryLocked(issue))issueActions.push(`<button class="button ghost small" data-close-issue="${escapeHTML(issue.id)}">${escapeHTML(_t('关闭需求','Close requirement'))}</button>`);
    issueActions.push(issueDeleteControlHTML(issue));
    if(issue.externalRef?.externalUrl)issueActions.push(`<a class="button ghost small" href="${escapeHTML(safeURL(issue.externalRef.externalUrl))}" target="_blank" rel="noopener noreferrer">${escapeHTML(_t('打开外部链接 ↗','Open external link ↗'))}</a>`);
    if(issue.source==='tapd'&&issue.externalRef?.externalId)issueActions.push(`<button class="button ghost small" data-resync-tapd="${escapeHTML(issue.id)}">${escapeHTML(_t('从 TAPD 同步','Sync from TAPD'))}</button>`);
  }
  const group=(title,items)=>items.some(Boolean)?`<div class="issue-action-group"><span>${title}</span><div class="issue-action-group-buttons">${items.filter(Boolean).join('')}</div></div>`:'';
  const groups=[group(_t('流程处理','Workflow'),workflowActions),group(_t('排查记录','Diagnostics'),logActions),group(_t('需求管理','Requirement'),issueActions)].filter(Boolean);
  return groups.length?`<div class="issue-action-groups">${groups.join('')}</div>`:'';
}
function overviewPane(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const project=(state.data.projects||[]).find(p=>p.id===issue.projectId),workflow=(state.data.workflows||[]).find(w=>w.id===(issue.workflowId||project?.workflowId)),repo=(state.data.repositories||[]).find(r=>r.id===(issue.repositoryId||project?.defaultRepositoryId));
  // 对话工作区不是 SOP 运行：不提供运行、日志和 SOP 操作入口。
  const convo=conversationWorkspaceIssue(issue,data.run);
  const run=convo?null:data.run,out=issueOutcome(issue),stage=issueCurrentStage(issue),task=data.task;
  const waitingId=run&&waitingNodeId(run);
  const isRunning=(run&&['queued','running','waiting'].includes(run.status))||(task&&['queued','dispatched','running'].includes(task.status));
  let actions='';
  if(convo)actions=conversationSessionButton(issue,data)+deliveryMRButtons(issue)+reopenDeliveredButton(issue,{cls:'button ghost small'});
  else if(issueManuallyClosed(issue)||deliveryLocked(issue))actions=reopenDeliveredButton(issue)+deliveryMRButtons(issue);
  else if(out.key==='waiting'&&run&&waitingId&&!gongfengIssueClosed(issue))actions=run.pauseRequested?pausedRunPanelHTML(run):humanDecisionPanelHTML(run.id,waitingId,run.nodes?.[waitingId],run.workflowSnapshot?.nodes?.find(n=>n.id===waitingId),run.workflowSnapshot?.nodes||[]);
  else if(run?.status==='failed')actions=issueExecutionBlocked(issue)?triggerSOPButton(issue):failedResumePanelHTML(run);
  else if(run?.status==='cancelled')actions=triggerSOPButton(issue);
  else if(canRetriggerIssue(issue,run))actions=retriggerButton(issue,run);
  else if(!isRunning&&out.key!=='active'&&out.key!=='closed')actions=triggerSOPButton(issue);
  if(run?.status==='running')actions+=`<button class="button ghost small" data-pause-run="${escapeHTML(run.id)}">${escapeHTML(_t('暂停运行','Pause run'))}</button>`;
  actions+=issueProgressActionsHTML(issue,run,{includeIssueActions:true});

  const ch=convo?conversationHeadState(issue):null;
  const banner=ch?`<div class="issue-outcome conv-outcome ${escapeHTML(ch.tone)}"><span class="conv-outcome-kicker">${escapeHTML(_t('对话交付','Chat delivery'))}</span><b>${escapeHTML(ch.label)}</b><p>${escapeHTML(ch.hint||'')}</p><div class="issue-outcome-actions">${actions}</div></div>`
    :`<div class="issue-outcome ${out.key}"><b>${escapeHTML(out.title)}</b><p>${escapeHTML(out.body)}</p><div class="issue-outcome-actions">${actions}</div></div>`;
  const facts=`<div class="detail-grid">${drawerFact(_t('责任人','Assignee'),issueAssigneeName(issue)||_t('未指定','Unassigned'))}${drawerFact(_t('优先级','Priority'),issuePriorityLabel(issue.priority))}${drawerFact(_t('来源','Source'),issueSourceLabel(issue))}${metricsIssueSource(issue)==='local'?drawerFact(_t('统计关联 TAPD','Metrics TAPD link'),escapeHTML(issue.tapdId||_t('未绑定（仍参与统计）','Unlinked (still counted)'))):''}${drawerFact(_t('触发方式','Trigger'),convo?_t('对话工作区','Chat workspace'):escapeHTML(taskTriggerInfo(data.task).label))}${drawerFact(_t('关联 SOP','Linked SOP'),convo?_t('无 · 对话里直接改代码','None · edited in chat'):(issueWithoutSOP(issue)?_t('不使用 SOP','No SOP'):escapeHTML(workflow?.name||_t('未关联','Unlinked'))))}${drawerFact(_t('代码仓库','Repository'),escapeHTML(repo?.name||_t('未绑定','Unlinked')))}${convo?drawerFact(_t('工作分支','Work branch'),escapeHTML(conversationWorkBranchNames(issue,data)||'—')):drawerFact(_t('继续开发分支','Existing branch'),escapeHTML(storedIssueWorkBranch(issue)||_t('自动新建','Auto-create')))}</div>`;
  return `<div class="detail-section">${banner}${facts}${issue.description?`<div class="detail-desc" style="margin-top:12px">${escapeHTML(issue.description)}</div>`:''}${clarificationOverviewCard(issue)}</div>`;
}
function clarifyHistoryHTML(c){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const rows=[];
  (c.history||[]).forEach(msg=>{
    const content=(msg.content||'').trim();
    if(!content)return;
    if(msg.role==='assistant'){
      let parsed={};try{parsed=JSON.parse(content)}catch{}
      const questions=(parsed.questions||[]).map(q=>`<li>${escapeHTML(q.question||'')}</li>`).join('');
      if(questions)rows.push(`<div class="clarify-turn ai"><span>${escapeHTML(_t('问','Q'))}</span><ul>${questions}</ul></div>`);
    }else if(!CLARIFY_AUTO_PROMPTS.includes(content)){
      rows.push(`<div class="clarify-turn me"><span>${escapeHTML(_t('答','A'))}</span><p>${escapeHTML(content)}</p></div>`);
    }
  });
  if(!rows.length)return'';
  return `<details class="clarify-history"><summary>${escapeHTML(_t(`澄清过程（${rows.length} 条）`,`Clarification history (${rows.length})`))}</summary><div class="clarify-turns">${rows.join('')}</div></details>`;
}
function clarifyPane(issue,project){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const c=recoverClarifyView(issue.clarification||{}),source=issue.source==='gongfeng'?_t('工蜂 Issue','Gongfeng Issue'):issue.source==='tapd'?_t('TAPD 需求','TAPD Requirement'):_t('工作项','Requirement');
  if(c.status==='ready'&&submittedClarifyDraft?.issueId===issue.id)submittedClarifyDraft=null;
  const writeBack=c.writeBackStatus==='succeeded'?_t(`已写回 ${source}`,`Written back to ${source}`):c.writeBackStatus==='failed'?_t('写回失败','Write-back failed'):c.writeBackStatus==='skipped'?_t('仅保存到 LoopForge','Saved to LoopForge only'):'';
  if(c.status==='ready'&&c.summary){
    const pending=c.writeBackStatus==='pending'&&(issue.source==='tapd'||issue.source==='gongfeng')&&issue.externalRef;
    const retry=c.writeBackStatus==='failed'?`<button class="button primary small" data-retry-clarify>${escapeHTML(_t('重试写回原单','Retry write-back'))}</button>`:'';
    const confirm=pending?`<button class="button primary small" data-retry-clarify title="${escapeHTML(_t('确认写回原单（追加评论）之后，即可开始触发需求','After confirming write-back (appends a comment), you can trigger the requirement'))}">${escapeHTML(_t('确认写回原单（追加评论）','Confirm write-back (add comment)'))}</button>`:'';
    const external=issue.externalRef?.externalUrl?`<a class="button ghost small" href="${escapeHTML(safeURL(issue.externalRef.externalUrl))}" target="_blank" rel="noopener noreferrer">${escapeHTML(_t('打开原单 ↗','Open ticket ↗'))}</a>`:'';
    const trigger=!pending&&!issueExecutionBlocked(issue)?`<button class="button primary small" data-dispatch-issue="${escapeHTML(issue.id)}" title="${escapeHTML(_t('按澄清结论触发 SOP','Trigger SOP with clarified conclusion'))}">${escapeHTML(_t('触发需求','Trigger SOP'))}</button>`:'';
    const blockedHint=!pending&&issueExecutionBlocked(issue)?(issueTrackerClosed(issue)&&!issueManuallyClosed(issue)?closedTrackerHint(issue):deliveredHint(issue)):'';
    const stepGuide=pending?`<div class="clarify-next-step-callout"><div class="clarify-step-badge active"><span class="step-num">1</span><span>${escapeHTML(_t('确认写回原单（追加评论）','Confirm write-back (add comment)'))}</span></div><span class="clarify-step-arrow">➔</span><div class="clarify-step-badge"><span class="step-num">2</span><span>${escapeHTML(_t('触发需求执行 SOP','Trigger SOP'))}</span></div></div>`:'';
    const head=pending
      ?`<div class="clarify-ready-head"><span class="clarify-check warn">!</span><div><b>${escapeHTML(_t('请确认澄清结论并写回原单','Confirm clarification & write back'))}</b><small>${escapeHTML(_t('结论已追加到平台说明。确认写回原单（追加评论）后，即可开始触发需求执行 SOP（不会修改原单描述）','Conclusion appended to description. Confirm write-back (adds a comment without editing the ticket body) before triggering the SOP'))}</small></div></div>${stepGuide}`
      :`<div class="clarify-ready-head"><span class="clarify-check">✓</span><div><b>${escapeHTML(_t('澄清已完成','Clarification complete'))}${c.writeBackStatus==='succeeded'?escapeHTML(_t(` · 已写回 ${source} 评论`,` · Written to ${source} comments`)):''}</b><small class="${c.writeBackStatus==='failed'?'danger':''}">${escapeHTML(writeBack||_t('结论已保存到平台说明','Conclusion saved to description'))}${escapeHTML(_t('，可直接触发需求执行 SOP','; ready to trigger SOP'))}</small></div></div>`;
    const actionTip=pending
      ?`<div class="clarify-action-hint">${escapeHTML(_t('确认写回原单（追加评论）后，即可开始触发需求','Confirm write-back (add comment) before triggering the requirement'))}</div>`
      :(trigger?`<div class="clarify-action-hint ok">${escapeHTML(_t('可直接点击「触发需求」开始执行','Click “Trigger SOP” to start execution'))}</div>`:'');
    return `<div class="clarify-workspace">${head}${clarifyVisibleSummary(c.summary)?`<div class="clarify-summary">${escapeHTML(clarifyVisibleSummary(c.summary))}</div>`:''}${c.writeBackError?`<div class="clarify-error">${escapeHTML(c.writeBackError)}</div>`:''}${clarifyHistoryHTML(c)}<div class="clarify-actions">${confirm}${trigger}${blockedHint}${retry}${external}<button class="button ghost small" data-reclarify>${escapeHTML(_t('再问一轮','Ask another round'))}</button>${actionTip}</div></div>`;
  }
  const questions=c.questions||[];
  const analyzing=issueClarifying(issue.id);
  const saved=clarifyAnswerDraft(issue);
  const questionHTML=analyzing?'':clarifyQuestionCardsHTML(questions,saved);
  const submittedHTML=analyzing?clarifySubmittedHTML(saved?.reply):'';
  if(c.status!=='in_progress'&&!analyzing){
    const intro=`<div class="clarify-orb">?</div><h3>${escapeHTML(_t('描述不够清楚？一起问明白','Unclear description? Let’s clarify'))}</h3><p>${escapeHTML(_t('可选步骤。分析师只围绕这张单本身，结合本项目代码问清阻塞开工的细节；不澄清也可以直接触发 SOP。','Optional step. The analyst asks only about blocking details for this ticket using the project codebase; you can also trigger an SOP directly.'))}</p>`;
    return `<div class="clarify-workspace clarify-empty">${intro}<div class="clarify-start-row">${clarifyModelPickerHTML(false)}<button class="button primary" data-start-clarify>${escapeHTML(_t('开始澄清','Start clarification'))}</button></div></div>`;
  }
  const lastError=(!analyzing&&c.lastError)?`<div class="clarify-error req-clarify-retry"><span>${escapeHTML(c.lastError)}</span><button type="button" class="button primary small" data-retry-clarify-turn>${escapeHTML(_t('重新分析','Re-analyze'))}</button></div>`:'';
  const rounds=(c.history||[]).filter(m=>m.role==='assistant').length;
  // Own text node so the sentence matches an English entry; a trailing count does not.
  const roundNote=(!analyzing&&!c.lastError)?_t(`已澄清 ${rounds||0} 轮。`,`Clarified ${rounds||0} round(s).`):'';
  const nextHint=analyzing?_t('正在后台分析，关闭详情不会中断','Analyzing in background; closing details won’t interrupt'):(c.lastError?_t('上次分析未完成，可重新分析','Last analysis did not finish; you can re-analyze'):_t('回答后点「继续澄清」。分析师确认够用后会给出结论；也可以随时直接触发 SOP。','Answer and click “Continue”. The analyst will conclude once sufficient, or you can trigger the SOP anytime.'));
  const composerInput=analyzing?'':`<textarea id="issueClarifyInput" rows="3" placeholder="${escapeHTML(questions.length?_t('点选上面的答案，或补充说明','Select options above or add notes'):_t('补充你认为重要的信息','Add any important details'))}">${escapeHTML(saved?.extra||'')}</textarea>`;
  return `<div class="clarify-workspace"><div class="clarify-intro"><span>AI</span><div><b>${escapeHTML(analyzing?_t('正在分析这张','Analyzing this '):_t('继续完善这张','Refining this '))}${escapeHTML(issue.source==='gongfeng'?'Issue':_t('需求','requirement'))}</b><small>${escapeHTML(analyzing?_t('关闭详情不会中断，再打开可继续看过程','Closing won’t interrupt; reopen to view progress'):_t('每轮只问最关键的 1–3 个问题，只围绕这张单本身','Asks 1–3 key questions per round focused on this ticket'))}</small></div>${clarifyModelPickerHTML(analyzing)}</div>${clarifyVisibleSummary(c.summary)?`<div class="clarify-summary compact">${escapeHTML(clarifyVisibleSummary(c.summary))}</div>`:''}${clarifyHistoryHTML(c)}${submittedHTML}${questionHTML}${lastError}<div id="issueClarifyThinking" class="req-thinking-stream" hidden></div><div class="issue-clarify-composer">${composerInput}<div><span id="issueClarifyHint">${nextHint}${roundNote?` <span>${roundNote}</span>`:''}</span><span><button class="button ghost small" data-stop-clarify ${analyzing?'':'hidden'}>${escapeHTML(_t('停止','Stop'))}</button> <button class="button primary small" data-continue-clarify${analyzing?' disabled':''}>${escapeHTML(analyzing?_t('分析中…','Analyzing…'):(c.lastError?_t('重新分析','Re-analyze'):_t('继续澄清','Continue')))}</button></span></div></div></div>`;
}
function latestClarifyParsed(c){
  const rows=[...(c?.history||[])].reverse();
  for(const msg of rows){
    if(msg.role!=='assistant')continue;
    try{
      const parsed=JSON.parse(msg.content||'');
      if(parsed&&typeof parsed==='object'&&(parsed.questions||parsed.ready))return parsed;
    }catch{}
  }
  return null;
}
function clarifyVisibleSummary(s){
  const t=String(s||'').trim();
  if(!t)return '';
  const proto=clarifyExtractProtocol(t);
  if(proto&&( 'mcpCalls' in proto||'suggestedTitle' in proto||('summary' in proto&&'questions' in proto))){
    const head=t.charAt(0)==='{'||t.charAt(0)==='['?'':t.slice(0,t.indexOf('{')).trim();
    if(head&&!clarifyThoughtShouldHide(head))return head;
    const inner=String(proto.summary||'').trim();
    return inner&&!clarifyThoughtShouldHide(inner)?inner:'';
  }
  if(clarifyThoughtShouldHide(t))return '';
  return t;
}
function clarifyExtractProtocol(s){
  let t=String(s||'').trim();
  if(!t)return null;
  t=t.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
  const start=t.indexOf('{'),end=t.lastIndexOf('}');
  if(start<0||end<=start)return null;
  try{
    const m=JSON.parse(t.slice(start,end+1));
    return m&&typeof m==='object'?m:null;
  }catch{return null}
}
function recoverClarifyView(src){
  const c={...(src||{})};
  const proto=clarifyExtractProtocol(c.summary);
  if(proto){
    if(!(c.questions||[]).length&&Array.isArray(proto.questions)){
      c.questions=normalizeClarifyParsed(proto).questions;
    }
    c.summary=clarifyVisibleSummary(c.summary);
  }
  return c;
}
function clarifyThoughtShouldHide(s){
  let t=String(s||'').trim();
  if(!t)return false;
  t=t.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
  if(t.charAt(0)==='{'||t.charAt(0)==='[')return true;
  if(/"questions"\s*:/.test(t)&&(/"summary"\s*:/.test(t)||/"mcpCalls"\s*:/.test(t)))return true;
  const start=t.indexOf('{'),end=t.lastIndexOf('}');
  if(start<0||end<=start)return false;
  try{
    const m=JSON.parse(t.slice(start,end+1));
    if(!m||typeof m!=='object')return false;
    return 'mcpCalls' in m||'suggestedTitle' in m||('summary' in m&&'questions' in m);
  }catch{return false}
}
function plannedSOPNodes(lane,wf){
  if(lane?.stages?.length)return lane.stages;
  return (wf?.nodes||[]).map(n=>({nodeId:n.id,name:n.name||n.id,status:'pending'}));
}
// 对话需求的「打开会话」：对有权限的项目成员都显示（非创建者只读打开），会话删除后置灰。
function conversationSessionButton(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const conv=data?.requirement?.conversation;
  const id=String(conv?.sessionId||issue.conversationSessionId||'').trim();
  if(!id)return '';
  if(conv?.sessionId&&conv.available===false)return `<button type="button" class="button ghost small" disabled title="${escapeHTML(_t('创建这个需求的对话已删除','The conversation that created this requirement was deleted'))}">${escapeHTML(_t('对话已删除','Conversation deleted'))}</button>`;
  return `<a class="button primary small" href="${escapeHTML(issueConversationURL(issue,id))}" target="_blank" rel="noopener" title="${escapeHTML(_t('不是你创建的对话以只读方式打开','Conversations you did not create open in read-only mode'))}">${escapeHTML(_t('打开会话 ↗','Open conversation ↗'))}</a>`;
}
// 需求快照没加载到时，从运行列表里的对话工作区取仓库与工作分支。
function conversationWorkspaceBranches(issue){
  const seen=new Set(),out=[];
  (state.data.runs||[]).filter(r=>r.kind==='workspace'&&r.executionContext?.issueId===issue.id).forEach(r=>{
    (r.repositories?.length?r.repositories:(r.repository?.name?[r.repository]:[])).forEach(rc=>{
      const key=`${rc.name}\u0000${rc.workBranch||''}`;
      if(!rc.name||seen.has(key))return;
      seen.add(key);out.push({repository:rc.name,webUrl:rc.webUrl,baseBranch:rc.baseBranch,workBranch:rc.workBranch});
    });
  });
  return out;
}
function conversationBranchList(issue,data){
  const conv=data?.requirement?.conversation;
  return conv?.branches?.length?conv.branches:conversationWorkspaceBranches(issue);
}
function conversationWorkBranchNames(issue,data){
  return [...new Set(conversationBranchList(issue,data).map(b=>b.workBranch).filter(Boolean))].join('、');
}
// 分支名保留斜杠（与 GitHub、工蜂自己的链接一致），其他字符照常编码。
function gongfengRefPath(ref){return encodeURIComponent(String(ref||'')).replace(/%2F/gi,'/')}
function conversationRepoIsGitHub(webUrl){try{return new URL(String(webUrl||'')).hostname.toLowerCase()==='github.com'}catch{return false}}
function conversationRepoPlatform(webUrl){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return conversationRepoIsGitHub(webUrl)?'GitHub':_t('工蜂','Gongfeng')}
// 仓库网页地址 + 分支 → 分支页；有基线分支时链到对比页，直接看这次改了什么。
function gongfengBranchLinks(webUrl,work,base){
  const root=String(webUrl||'').trim().replace(/\.git$/,'').replace(/\/+$/,'');
  if(!root||!work||safeURL(root)==='#')return{tree:'',compare:''};
  const sep=conversationRepoIsGitHub(root)?'':'/-';
  return{tree:`${root}${sep}/tree/${gongfengRefPath(work)}`,compare:base&&base!==work?`${root}${sep}/compare/${gongfengRefPath(base)}...${gongfengRefPath(work)}`:''};
}
const conversationMRBadgeTone={merged:'success',integrated:'success',opened:'info',reopened:'info',closed:'neutral'};
// 对话需求按仓库汇总：工作分支 → 目标分支、PR/MR 与状态放在同一张卡片里，分支和 PR/MR 都能直接跳到代码平台。
function conversationRepoCards(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const branches=conversationBranchList(issue,data);
  const mrs=deliveryMRList(issue);
  const pathOf=url=>{try{return new URL(url).pathname.replace(/^\/+|\/+$/g,'').replace(/\.git$/,'')}catch{return ''}};
  const lower=s=>String(s||'').toLowerCase();
  const cards=branches.map(b=>({name:b.repository||_t('仓库','Repository'),path:pathOf(b.webUrl),webUrl:b.webUrl,work:b.workBranch,base:b.baseBranch,mrs:[]}));
  mrs.forEach(mr=>{
    const project=String(mr.project||''),repo=lower(mr.repository||project.split('/').pop());
    let card=cards.find(c=>(project&&lower(c.path)===lower(project))||lower(c.name)===repo);
    if(!card){card={name:mr.repository||project.split('/').pop()||_t('仓库','Repository'),path:project,webUrl:'',work:'',base:'',mrs:[]};cards.push(card)}
    const mrRoot=String(mr.url||'').match(/^(https?:\/\/.+?)\/(?:(?:-\/)?merge_requests|pull)\//)?.[1];
    if(!card.webUrl&&mrRoot)card.webUrl=mrRoot;
    if(!card.path)card.path=project;
    card.mrs.push(mr);
  });
  if(!cards.length)return `<div class="detail-empty compact">${escapeHTML(_t('工作区记录已清理，没有仓库和分支信息','Workspace records cleaned; no repository or branch info'))}</div>`;
  const directPush=String(issue.status||'').toLowerCase()==='in_review';
  const newTab='target="_blank" rel="noopener noreferrer"';
  return `<div class="conv-repos">${cards.map(c=>{
    const mr=c.mrs[c.mrs.length-1],state=String(mr?.state||'').toLowerCase();
    const target=mr?.targetBranch||c.base||'';
    const links=gongfengBranchLinks(c.webUrl,c.work,target);
    const platform=conversationRepoPlatform(c.webUrl),mrWord=platform==='GitHub'?'PR':'MR';
    const root=safeURL(String(c.webUrl||'').trim().replace(/\.git$/,'').replace(/\/+$/,''));
    const ns=c.path&&lower(c.path).endsWith(`/${lower(c.name)}`)?c.path.slice(0,-c.name.length):'';
    const nameHTML=`${ns?`<span>${escapeHTML(ns)}</span>`:''}<b>${escapeHTML(c.name)}</b>`;
    const name=root&&root!=='#'?`<a class="conv-repo-name" href="${escapeHTML(root)}" ${newTab} title="${escapeHTML(_t(`在${platform}打开仓库 ${c.path||c.name}`,`Open repository ${c.path||c.name} on ${platform}`))}">${nameHTML}</a>`:`<div class="conv-repo-name">${nameHTML}</div>`;
    const mrStateMap={merged:_t('已合入','Merged'),integrated:_t('已合入基线','Integrated to baseline'),opened:_t('待合入','Open'),reopened:_t('待合入','Open'),closed:_t('已关闭','Closed')};
    const badge=mr?`<span class="hui-badge" data-size="sm" data-tone="${conversationMRBadgeTone[state]||'neutral'}"><span class="hui-badge-label">${mrWord} ${escapeHTML(mrStateMap[state]||_t('状态未知','Unknown status'))}</span></span>`
      :`<span class="hui-badge" data-size="sm" data-tone="${directPush?'info':'muted'}"><span class="hui-badge-label">${escapeHTML(directPush?_t('已直推','Pushed directly'):_t(`未提交 ${mrWord}`,`No ${mrWord} yet`))}</span></span>`;
    const work=c.work?(links.tree?`<a class="conv-branch" href="${escapeHTML(safeURL(links.tree))}" ${newTab} title="${escapeHTML(_t(`在${platform}打开分支 ${c.work}`,`Open branch ${c.work} on ${platform}`))}">${escapeHTML(c.work)}</a>`:`<span class="conv-branch">${escapeHTML(c.work)}</span>`):`<span class="conv-branch is-empty">${escapeHTML(_t('没有工作分支记录','No work branch recorded'))}</span>`;
    const tail=!target?'':target===c.work?`<span class="conv-flow-note">${escapeHTML(_t('直接提交在这个分支上','Committed directly to this branch'))}</span>`:`<span class="conv-arrow" aria-hidden="true">→</span><span class="conv-branch is-base" title="${escapeHTML(_t('目标分支','Target branch'))}">${escapeHTML(target)}</span>`;
    const flow=`<div class="conv-repo-flow">${work}${tail}</div>`;
    const acts=[
      ...c.mrs.map(m=>{const pr=/\/pull\/\d+/.test(String(m.url||'')),iid=m.iid||String(m.url).match(/(?:merge_requests|pull)\/(\d+)/)?.[1]||'';return `<a class="button ghost small" href="${escapeHTML(safeURL(m.url))}" ${newTab}>${escapeHTML(iid?(pr?`PR #${iid}`:`MR !${iid}`):(pr?_t('打开 PR','Open PR'):_t('打开 MR','Open MR')))} ↗</a>`}),
      links.compare?`<a class="button ghost small" href="${escapeHTML(safeURL(links.compare))}" ${newTab} title="${escapeHTML(target)}...${escapeHTML(c.work)}">${escapeHTML(_t('查看改动 ↗','View diff ↗'))}</a>`:''
    ].filter(Boolean).join('');
    return `<div class="conv-repo"><div class="conv-repo-head">${name}${badge}</div>${flow}${acts?`<div class="conv-repo-actions">${acts}</div>`:''}</div>`;
  }).join('')}</div>`;
}
// 对话需求的阶段卡片：合入为绿、进行中为蓝；没合入就关闭的保持中性，不当成交付成功。
function conversationHeadState(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const st=issueCurrentStage(issue);
  if(issueManuallyClosed(issue))return{tone:'',label:_t('需求已关闭','Requirement closed'),hint:_t('需求已在 LoopForge 中手动关闭，需要继续时先重新打开','Manually closed in LoopForge; reopen to continue')};
  if(issueTrackerClosed(issue)&&!issueMergedDelivery(issue))return{tone:'',label:st.label,hint:_t('外部工作项已关闭','External ticket is closed')};
  if(deliveryLocked(issue)){
    const merged=issueMergedDelivery(issue);
    return{tone:merged?'closed':'',label:st.label,hint:['已合入基线','Integrated to baseline'].includes(st.label)?_t('对话提交的 MR 已合入集成分支，尚未进默认分支','The MR from chat is merged into integration, not yet in the default branch'):merged?_t('对话提交的 MR 已合入，需求已交付','The MR from chat is merged; requirement delivered'):_t('需求已结束，需要继续时先重新打开','Requirement ended; reopen to continue')};
  }
  const c=conversationIssueStage(issue);
  return{tone:c.ended?'':c.key,label:c.label,hint:c.hint};
}
// 对话里直接改代码的需求没有 SOP 节点，执行进展展示对话交付：阶段、会话入口、各仓库的分支与 MR。
function conversationDeliveryHTML(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const head0=conversationHeadState(issue);
  const actions=[conversationSessionButton(issue,data),reopenDeliveredButton(issue,{cls:'button ghost small'})].join('');
  const head=`<div class="issue-outcome conv-outcome ${escapeHTML(head0.tone)}"><span class="conv-outcome-kicker">${escapeHTML(_t('对话交付','Chat delivery'))}</span><b>${escapeHTML(head0.label)}</b><p>${escapeHTML(head0.hint||'')}</p>${actions?`<div class="issue-outcome-actions">${actions}</div>`:''}</div>`;
  return `<div class="detail-section">${head}</div><div class="detail-section"><h3>${escapeHTML(_t('代码交付','Code delivery'))}<span class="sub">${escapeHTML(_t('对话工作区直接改代码，没有 SOP 运行','Code edited directly in chat workspace; no SOP run'))}</span></h3>${conversationRepoCards(issue,data)}</div>`;
}
// 对话需求的代码交付：与执行进展同一套仓库卡片，交付方式指向会话，不链到没有节点的工作区运行。
function deliveryPane(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!conversationWorkspaceIssue(issue,data.run))return sopDeliveryPane(issue,data);
  return `<div class="detail-section"><h3>${escapeHTML(_t('代码仓库与分支','Repositories & branches'))}<span class="sub">${escapeHTML(_t('对话工作区检出的仓库','Repositories checked out in chat workspace'))}</span></h3>${conversationRepoCards(issue,data)}</div><div class="detail-section"><h3>${escapeHTML(_t('交付方式','Delivery'))}<span class="sub">${escapeHTML(_t('在对话工作区里直接改代码，没有 SOP 运行','Edited directly in chat workspace; no SOP run'))}</span></h3><div class="issue-outcome-actions">${conversationSessionButton(issue,data)||`<span class="muted">${escapeHTML(_t('没有关联的会话','No linked conversation'))}</span>`}</div></div>`;
}
function noSOPPaneHTML(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const opts=runnableWorkflowOptions();
  const blocked=issueExecutionBlocked(issue);
  const picker=opts.length
    ?`<div class="no-sop-switch"><select class="select" data-no-sop-workflow aria-label="${escapeHTML(_t('选择 SOP','Select SOP'))}">${opts.map(w=>`<option value="${escapeHTML(w.id)}">${escapeHTML(w.name)}</option>`).join('')}</select><button class="button ghost small" data-no-sop-bind="${escapeHTML(issue.id)}">${escapeHTML(_t('只绑定','Bind only'))}</button>${blocked?'':`<button class="button ghost small" data-no-sop-run="${escapeHTML(issue.id)}">${escapeHTML(_t('绑定并触发','Bind & run'))}</button>`}</div>`
    :`<p class="muted">${escapeHTML(_t('当前项目还没有可运行的 SOP。','This project has no runnable SOP yet.'))}</p>`;
  return `<div class="detail-section"><div class="issue-outcome conv-outcome"><span class="conv-outcome-kicker">${escapeHTML(_t('不使用 SOP','No SOP'))}</span><b>${escapeHTML(_t('这条需求不走 SOP','This requirement skips SOPs'))}</b><p>${escapeHTML(_t('在对话里澄清需求、直接改代码；定时任务不会自动认领它。','Clarify and change code in chat; scheduled jobs won’t pick it up.'))}</p><div class="issue-outcome-actions"><button class="button primary small" data-chat-issue="${escapeHTML(issue.id)}">${escapeHTML(_t('去对话处理','Handle in chat'))}</button></div></div></div><div class="detail-section"><h3>${escapeHTML(_t('改为按 SOP 交付','Switch to SOP delivery'))}<span class="sub">${escapeHTML(_t('绑定后这条需求按 SOP 跟进，也会参与定时触发','Once bound, it follows the SOP and joins scheduled triggers'))}</span></h3>${picker}</div>`;
}
function sopPane(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(conversationWorkspaceIssue(issue,data.run))return conversationDeliveryHTML(issue,data);
  if(issueWithoutSOP(issue))return noSOPPaneHTML(issue);
  const snap=data.requirement||{};
  const lanes=snap.lanes||clientIssueLanes(issue);
  const overall=snap.overall||{};
  const out=issueOutcome(issue);
  const run=data.run;
  const workflow=(state.data.workflows||[]).find(w=>w.id===(issue.workflowId||defaultSOPForIssue(issue)));
  const waitingId=run&&waitingNodeId(run);
  const nodes=run?.workflowSnapshot?.nodes||workflow?.nodes||[];
  let actions='';
  if(issueManuallyClosed(issue)||deliveryLocked(issue))actions=reopenDeliveredButton(issue)+deliveryMRButtons(issue);
  else if(out.key==='waiting'&&waitingId&&!gongfengIssueClosed(issue))actions=run.pauseRequested?pausedRunPanelHTML(run):humanDecisionPanelHTML(run.id,waitingId,run.nodes?.[waitingId],nodes.find(n=>n.id===waitingId),nodes);
  else if(run?.status==='failed')actions=issueExecutionBlocked(issue)?triggerSOPButton(issue):failedResumePanelHTML(run);
  else if(run?.status==='cancelled')actions=triggerSOPButton(issue);
  if(run?.status==='running')actions+=`<button class="button ghost small" data-pause-run="${escapeHTML(run.id)}">${escapeHTML(_t('暂停运行','Pause run'))}</button>`;
  actions+=issueProgressActionsHTML(issue,run);
  const overallFacts=`<div class="req-overall ${out.key}"><b>${escapeHTML(out.title)}</b><p>${escapeHTML(_t(`整体 ${overall.runCount||0} 次执行 · ${formatTokens(overall.tokens||0)} tokens · 周期 ${overall.cycleDurationMs?duration(overall.cycleDurationMs):'—'}`,`Total ${overall.runCount||0} runs · ${formatTokens(overall.tokens||0)} tokens · Cycle ${overall.cycleDurationMs?duration(overall.cycleDurationMs):'—'}`))}</p>${actions?`<div class="issue-outcome-actions">${actions}</div>`:''}</div>`;
  const bound=lanes.filter(l=>!l.orphan);
  const orphans=lanes.filter(l=>l.orphan);
  const busy=bound.find(l=>['active','waiting','attention'].includes(l.status));
  const openId=state.issueSOPOpen||busy?.workflowId||bound[0]?.workflowId||issue.workflowId||'';
  const cards=bound.map((lane,idx)=>{
    const wf=(state.data.workflows||[]).find(w=>w.id===lane.workflowId);
    const laneRun=lane.latestRunId?(state.data.runs||[]).find(r=>r.id===lane.latestRunId):null;
    const open=openId===lane.workflowId;
    const stageRows=(stages,depth)=>(stages||[]).map(n=>`<div class="node-progress-row${depth?' is-child-stage':''}"${depth?` style="padding-left:${depth*20}px"`:''}><span class="node-name">${depth?'└ ':''}${escapeHTML(n.name||n.nodeId)}</span><div class="node-progress-track"><i style="width:${n.status==='succeeded'||n.status==='failed'?100:n.status==='running'||n.status==='waiting_approval'?55:0}%;background:${n.status==='succeeded'?'#34d399':n.status==='failed'?'#f87171':n.status==='waiting_approval'?'#fbbf24':n.status==='running'?'#5b8cff':'#64748b'}"></i></div><span class="status ${n.status}" style="flex-shrink:0">${statusText(n.status)||_t('未开始','Not started')}</span>${n.childRunId?`<button type="button" class="button ghost small" data-open-run="${escapeHTML(n.childRunId)}" title="${escapeHTML(_t('查看这个子 SOP 的运行','View this sub-SOP run'))}">${escapeHTML(_t('查看','View'))}</button>`:''}${!depth&&!issueManuallyClosed(issue)&&!issueTrackerClosed(issue)&&canRerunFromHere(laneRun,n.nodeId)?`<button type="button" class="button ghost small" data-rerun-from-here="${escapeHTML(n.nodeId)}" data-run="${escapeHTML(lane.latestRunId)}">${escapeHTML(_t('从这里重跑','Rerun from here'))}</button>`:''}</div>${stageRows(n.children,depth+1)}`).join('');
    const nodeRows=stageRows(plannedSOPNodes(lane,wf),0);
    const singleSOP=effectiveIssueSOPBindings(issue).length<=1;
    const actionWorkflow=singleSOP&&String(issue.workflowId||'').trim()?issue.workflowId:lane.workflowId;
    const canStart=actionWorkflow&&!issueExecutionBlocked(issue)&&!clarificationNeedsConfirm(issue)&&!lane.started;
    const canRetriggerLane=actionWorkflow&&lane.started&&!issueManuallyClosed(issue)&&!issueTrackerClosed(issue)&&!clarificationNeedsConfirm(issue);
    const trigger=canStart?`<button class="button primary small" data-dispatch-issue="${escapeHTML(issue.id)}" data-workflow="${escapeHTML(actionWorkflow)}">${escapeHTML(_t('触发','Trigger'))}</button>`:(canRetriggerLane?`<button class="button ghost small" data-retrigger-issue="${escapeHTML(issue.id)}" data-workflow="${escapeHTML(actionWorkflow)}">${escapeHTML(_t('重新触发','Retrigger'))}</button>`:'');
    const ownerName=userDisplay(userById(lane.assigneeUserId||issue.assigneeUserId))||_t('需求跟进人','Owner');
    const hint=lane.started?_t(`${lane.runCount||0} 次 · ${formatTokens(lane.tokens||0)}`,`${lane.runCount||0} runs · ${formatTokens(lane.tokens||0)}`):_t('展开可看节点','Expand to view steps');
    return `<article class="req-lane-card req-sop-row ${escapeHTML(lane.status||'')} ${open?'is-open':''}" data-toggle-sop-row="${escapeHTML(lane.workflowId||'')}">
      <div class="req-sop-main">
        <span class="req-sop-idx">${idx+1}</span>
        <div class="req-sop-meta"><b>${escapeHTML(lane.label||lane.workflowName||wf?.name||'SOP')}</b><small>${escapeHTML(sopLaneLabel(lane.lane))} · ${escapeHTML(laneStatusLabel(lane.status))} · ${escapeHTML(ownerName)} · ${escapeHTML(hint)}</small></div>
        <div class="req-sop-acts">${trigger}${lane.latestRunId?`<button class="button ghost small" data-open-run="${escapeHTML(lane.latestRunId)}">${escapeHTML(_t('查看','View'))}</button>`:''}</div>
      </div>
      ${open?`<div class="req-sop-detail">${nodeRows||`<div class="detail-empty">${escapeHTML(lane.started?_t('暂无节点','No steps'):_t('这条 SOP 还没有节点','This SOP has no steps yet'))}</div>`}</div>`:''}
    </article>`;
  }).join('');
  const orphanHtml=orphans.length?`<div class="req-orphan">${orphans.map(lane=>`<div class="req-orphan-row"><span>${escapeHTML(_t(`还跑过 ${lane.label||lane.workflowName||lane.workflowId} · ${laneStatusLabel(lane.status)}`,`Also ran ${lane.label||lane.workflowName||lane.workflowId} · ${laneStatusLabel(lane.status)}`))}</span>${lane.latestRunId?`<button class="button ghost small" data-open-run="${escapeHTML(lane.latestRunId)}">${escapeHTML(_t('查看','View'))}</button>`:''}</div>`).join('')}</div>`:'';
  if(!bound.length&&!orphans.length&&!workflow){
    return `<div class="detail-section"><div class="req-sop-empty"><p>${escapeHTML(_t('这条需求还没有可跑的流程。','This requirement has no runnable SOP yet.'))}</p></div></div>`;
  }
  return `<div class="detail-section">${overallFacts}<div class="req-sop-list">${cards||''}</div>${orphanHtml}</div>`;
}
function artifactsPane(data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const run=data.run;
  if((!run||!run.artifacts?.length)&&data.issue&&conversationWorkspaceIssue(data.issue,run))return `<div class="detail-empty">${escapeHTML(_t('对话需求在会话里直接改代码，不产出 SOP 节点产物。','Chat requirements edit code directly in conversation and do not produce SOP step artifacts.'))}<br>${escapeHTML(_t('改动见「代码交付」，过程见会话记录。','See “Code delivery” for changes and the conversation log for history.'))}</div>`;
  if(!run||!run.artifacts?.length)return `<div class="detail-empty">${escapeHTML(_t('该需求尚未产生交付物。执行 SOP 后，节点按产物契约冻结不可变快照。','No artifacts yet. Once an SOP runs, steps freeze immutable snapshots per artifact contract.'))}</div>`;
  const grouped={};run.artifacts.forEach(a=>{(grouped[a.nodeId]=grouped[a.nodeId]||[]).push(a)});
  const wf=run.workflowSnapshot;
  const html=Object.entries(grouped).map(([nodeId,list])=>`<div class="detail-section"><h3>${escapeHTML(wf?.nodes?.find(n=>n.id===nodeId)?.name||nodeId)}<span class="sub">${escapeHTML(_t(`${list.length} 份快照`,`${list.length} snapshot(s)`))}</span></h3><div class="artifact-grid" style="padding:0">${list.map(a=>`<div class="artifact-card" data-artifact="${escapeHTML(a.id)}"><b>${escapeHTML(a.name)}</b><span>${escapeHTML(a.path)}</span><small>attempt ${a.attempt} · ${Math.max(1,Math.ceil((a.size||0)/1024))} KB</small><code>${escapeHTML((a.sha256||'').slice(0,10))}…</code></div>`).join('')}</div></div>`).join('');
  return html+`<div class="detail-section"><h3>${escapeHTML(_t('运行信息','Run info'))}</h3><div class="delivery-run" data-open-run="${escapeHTML(run.id)}"><span class="dot ${run.status}"></span><div style="flex:1;min-width:0"><div class="strong ellipsis">${escapeHTML(run.workflowSnapshot?.name||run.workflowId)}</div><div class="muted" style="font-size:10.5px">${run.id} · ${runDisplayStatus(run)} · ${duration(run.durationMs)}</div></div><button class="button ghost small">${escapeHTML(_t('查看运行','View run'))}</button></div></div>`;
}
// 多仓库需求按仓库逐组展示；优先用 Run 冻结的仓库上下文（含工作分支），再补需求绑定的仓库。
function deliveryRepositories(issue,run){
  const catalog=state.data.repositories||[],project=(state.data.projects||[]).find(p=>p.id===issue.projectId);
  const frozen=(run?.repositories?.length?run.repositories:(run?.repository?.repositoryId?[run.repository]:[]));
  const ids=[...new Set([...(issue.repositoryIds||[]),issue.repositoryId,...frozen.map(r=>r.repositoryId)].filter(Boolean))];
  if(!ids.length&&project?.defaultRepositoryId)ids.push(project.defaultRepositoryId);
  return ids.map(id=>{const repo=catalog.find(r=>r.id===id)||{},rc=frozen.find(r=>r.repositoryId===id)||{};return{id,name:repo.name||rc.name||id,project:repo.gongfengProjectId||rc.gongfengProjectId||'',defaultBranch:repo.defaultBranch||rc.defaultBranch||'',baseBranch:rc.baseBranch||repo.defaultBranch||rc.defaultBranch||'',workBranch:rc.workBranch||(ids.length===1?storedIssueWorkBranch(issue):'')||'',webUrl:repo.webUrl||rc.webUrl||''}});
}
function deliveryRepoFacts(issue,repos){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!repos.length)return `<div class="detail-grid">${drawerFact(_t('仓库','Repository'),_t('未绑定','Unlinked'))}</div>`;
  const mrs=deliveryMRList(issue),multi=repos.length>1;
  return repos.map(r=>{
    const mr=mrs.find(m=>(m.repositoryId&&m.repositoryId===r.id)||(r.project&&String(m.project||'').toLowerCase()===r.project.toLowerCase()));
    const iid=mr&&(mr.iid||String(mr.url).match(/merge_requests\/(\d+)/)?.[1]);
    const link=(label,url)=>`<div class="detail-fact"><span>${label}</span><b><a href="${escapeHTML(safeURL(url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(url===mr?.url&&iid?`!${iid}`:_t('打开','Open'))} ↗</a></b></div>`;
    const grid=`<div class="detail-grid">${multi?'':drawerFact(_t('仓库','Repository'),escapeHTML(r.name))}${drawerFact(_t('仓库路径','Repository path'),escapeHTML(r.project||'—'))}${drawerFact(_t('配置主分支','Default branch'),escapeHTML(r.defaultBranch||'—'))}${drawerFact(_t('目标主分支','Target base branch'),escapeHTML(r.baseBranch||'—'))}${drawerFact(_t('工作分支','Work branch'),escapeHTML(r.workBranch||_t('待新建','To be created')))}${mr?link(_t('交付 PR','Delivery PR'),mr.url):''}${r.webUrl?link(_t('仓库链接','Repository URL'),r.webUrl):''}</div>`;
    return multi?`<div class="delivery-repo"><div class="delivery-repo-name">${escapeHTML(r.name)}</div>${grid}</div>`:grid;
  }).join('');
}
// SOP 需求的代码交付。
function sopDeliveryPane(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const run=data.run,repos=deliveryRepositories(issue,run),frozen=run?.repositories?.length?run.repositories:(run?.repository?.name?[run.repository]:[]);
  const repoFacts=deliveryRepoFacts(issue,repos);
  const frozenBranches=[...new Set(frozen.map(r=>r.baseBranch).filter(Boolean))];
  const ctx=run?.executionContext;
  const runFacts=`<div class="detail-grid">${drawerFact('Run ID',run?run.id.slice(-14):'—')}${drawerFact('Task ID',data.task?data.task.id.slice(-10):'—')}${drawerFact(_t('触发方式','Trigger'),escapeHTML(taskTriggerInfo(data.task).label))}${drawerFact(_t('状态','Status'),run?`<span class="status ${runDisplayStatusClass(run)}">${runDisplayStatus(run)}</span>`:'—')}${drawerFact(_t('执行仓库','Run repositories'),escapeHTML(frozen.map(r=>r.name).filter(Boolean).join('、')||'—'))}${drawerFact(_t('冻结目标主分支','Frozen base branches'),escapeHTML(frozenBranches.join('、')||'—'))}${drawerFact('Trace ID',ctx?.traceId?ctx.traceId.slice(-14):'—')}</div>`;
  return `<div class="detail-section"><h3>${escapeHTML(_t('代码仓库与分支','Repositories & branches'))}${repos.length>1?`<span class="sub">${escapeHTML(_t(`${repos.length} 个仓库`,`${repos.length} repositories`))}</span>`:''}</h3>${repoFacts}</div><div class="detail-section"><h3>${escapeHTML(_t('交付运行上下文','Delivery run context'))}<span class="sub">${escapeHTML(_t('发起时冻结的仓库与 Trace 关联','Frozen repositories & Trace link at dispatch'))}</span></h3>${run?runFacts+`<div style="margin-top:10px"><button class="button ghost small" data-open-run="${escapeHTML(run.id)}">${escapeHTML(_t('查看运行详情与产物 →','View run details & artifacts →'))}</button></div>`:`<div class="detail-empty">${escapeHTML(_t('尚未发起交付运行','No delivery run started yet'))}</div>`}</div>${run?.input?`<div class="detail-section"><h3>${escapeHTML(_t('任务输入','Task input'))}</h3><div class="detail-desc">${escapeHTML(run.input)}</div></div>`:''}`;
}
// Execution order of a SOP's nodes, same rule as orderNodesByEdges in
// internal/repo/requirement.go: stable topological sort over the edges, array
// order breaks ties, cycles fall back to array order. The editor appends a node
// added in a later SOP version to the end of the array, so without this a gate
// inserted mid-flow is listed after the last node.
function nodesInExecutionOrder(wf){
  const nodes=wf?.nodes||[],edges=wf?.edges||[];
  if(nodes.length<2||!edges.length||nodes.some(n=>!n?.id))return nodes;
  const known=new Set(nodes.map(n=>n.id)),indegree=new Map(),children=new Map();
  for(const e of edges){
    if(e.source===e.target||!known.has(e.source)||!known.has(e.target))continue;
    indegree.set(e.target,(indegree.get(e.target)||0)+1);
    children.set(e.source,[...(children.get(e.source)||[]),e.target]);
  }
  const placed=new Set(),out=[];
  while(out.length<nodes.length){
    const next=nodes.find(n=>!placed.has(n.id)&&!(indegree.get(n.id)>0));
    if(!next){for(const n of nodes)if(!placed.has(n.id)){out.push(n);placed.add(n.id)}break}
    out.push(next);placed.add(next.id);
    for(const c of children.get(next.id)||[])indegree.set(c,indegree.get(c)-1);
  }
  return out;
}
function acceptancePane(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const run=data.run;
  if(conversationWorkspaceIssue(issue,run)){
    const mrs=deliveryMRButtons(issue);
    return `<div class="detail-section"><h3>${escapeHTML(_t('验收方式','Acceptance'))}<span class="sub">${escapeHTML(_t('对话需求没有 SOP 验收门禁','Chat requirements have no SOP acceptance gates'))}</span></h3><div class="detail-desc">${escapeHTML(mrs?_t('在 MR 里评审，合入默认分支后需求自动完成。','Review in the MR; the requirement completes automatically once merged into the default branch.'):String(issue.status||'').toLowerCase()==='in_review'?_t('改动已直推到共享分支，确认没问题后关闭需求即完成验收。','Changes were pushed directly to the shared branch; close the requirement once verified.'):_t('在对话里提交 MR 后，评审合入即完成验收。','Submit an MR in chat, then review and merge to complete acceptance.'))}</div>${mrs?`<div class="issue-outcome-actions">${mrs}</div>`:''}</div>`;
  }
  if(!run)return `<div class="detail-empty">${escapeHTML(_t('尚未执行，暂无验收信息。','Not run yet; no acceptance info available.'))}</div>`;
  const wf=run.workflowSnapshot||(state.data.workflows||[]).find(w=>w.id===run.workflowId);
  const nodes=wf?.nodes||[];
  const gates=nodesInExecutionOrder(wf).map(n=>{const nr=run.nodes?.[n.id]||{},agent=(state.data.agents||[]).find(a=>a.id===n.agentId),verif=roleGates(agent);const isApproval=n.type==='approval';const manual=verif.some(g=>g.mode==='manual');const commands=verif.filter(g=>g.mode==='command');let verdict='—';
    if(nr.status==='succeeded')verdict=isApproval?_t('已批准','Approved'):(commands.length||manual)?_t('门禁通过','Gate passed'):_t('完成','Done');
    if(nr.status==='waiting_approval')verdict=turnsExhausted(nr)?_t('等待确认是否重试','Awaiting retry confirmation'):(isApproval?_t('等待人工判断','Awaiting human decision'):_t('等待人工验收','Awaiting human acceptance'));
    if(nr.status==='failed')verdict=_t('门禁失败','Gate failed');
    if(nr.status==='running')verdict=_t('执行中','Running');
    return {name:n.name||n.id,status:nr.status||'pending',verdict,commands:commands.length,manual,rejectTo:n.rejectTo,nodeId:n.id,nr,node:n};
  });
  const rows=gates.map(g=>`<div class="node-progress-row"><span class="node-name">${escapeHTML(g.name)}</span><span class="pill">${escapeHTML(_t(`${g.commands} 项命令`,`${g.commands} command(s)`))} · ${g.manual?escapeHTML(_t('需人工','Manual')):''}${g.rejectTo?escapeHTML(_t(' · 可打回',' · Reworkable')):''}</span><div style="flex:1"></div><span class="status ${g.status}">${escapeHTML(g.verdict)}</span></div>${g.status==='waiting_approval'?humanDecisionPanelHTML(run.id,g.nodeId,g.nr,g.node,nodes):''}`).join('');
  return `<div class="detail-section"><h3>${escapeHTML(_t('验收门禁','Acceptance gates'))}<span class="sub">${escapeHTML(_t('节点自动验证与人工门禁，失败可打回指定节点','Automated checks and human gates; failures can be sent back to a target step'))}</span></h3>${rows||`<div class="detail-empty">${escapeHTML(_t('该流程没有配置验证门禁','No verification gates configured for this SOP'))}</div>`}</div>`;
}
function formatActivityTime(ts){
  const d=new Date(ts);
  if(Number.isNaN(d.getTime()))return '—';
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function activityEventLabel(type){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return ({
    'run.started':_t('开始执行','Run started'),'run.failed':_t('执行失败','Run failed'),'run.succeeded':_t('执行完成','Run succeeded'),'run.cancelled':_t('已取消','Cancelled'),
    'node.started':_t('节点开始','Step started'),'node.failed':_t('节点失败','Step failed'),'node.retry':_t('准备重试','Preparing retry'),'node.succeeded':_t('节点完成','Step completed'),'node.passed':_t('人工通过节点','Step passed manually'),
    'task.created':_t('创建任务','Task created')
  }[type]||String(type||'').replace(/^node\./,_t('节点 · ','Step · ')).replace(/^run\./,_t('运行 · ','Run · ')));
}
function issueOperationLabel(action){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return {create:_t('创建需求','Create requirement'),update:_t('编辑需求','Edit requirement'),close:_t('关闭需求','Close requirement'),reopen:_t('重新打开','Reopen'),dispatch:_t('触发 SOP','Trigger SOP')}[action]||action||_t('操作','Action');
}
function issueOperationEntries(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const stored=(issue?.operations||[]).map(op=>({
    t:new Date(op.at).getTime(),
    action:op.action||'',
    actor:op.actor||'',
    label:issueOperationLabel(op.action),
    detail:op.detail||''
  })).filter(op=>!Number.isNaN(op.t));
  const inferred=[];
  if(issue?.createdAt&&!stored.some(op=>op.action==='create')){
    inferred.push({t:new Date(issue.createdAt).getTime(),action:'create',actor:'',label:_t('创建需求','Create requirement'),detail:_t('按创建时间补记','Backfilled from creation time')});
  }
  if(issueManuallyClosed(issue)&&issue.deliveryUpdatedAt&&!stored.some(op=>op.action==='close')){
    inferred.push({t:new Date(issue.deliveryUpdatedAt).getTime(),action:'close',actor:'',label:_t('关闭需求','Close requirement'),detail:_t('手动关闭','Manually closed')});
  }
  return stored.concat(inferred).filter(op=>!Number.isNaN(op.t)).sort((a,b)=>b.t-a.t);
}
function operationsPane(issue){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const rows=issueOperationEntries(issue).map(e=>{
    const detail=[e.actor,e.detail].filter(Boolean).join(' · ');
    return `<div class="activity-row"><time>${formatActivityTime(e.t)}</time><b>${escapeHTML(e.label)}</b><p>${escapeHTML(detail||'—')}</p></div>`;
  }).join('');
  return `<div class="detail-section"><h3>${escapeHTML(_t('操作日志','Audit log'))}<span class="sub">${escapeHTML(_t('关闭、重新打开、编辑和触发都会记在这里','Close, reopen, edit, and trigger actions are recorded here'))}</span></h3>${rows?`<div class="activity-list">${rows}</div>`:`<div class="detail-empty compact">${escapeHTML(_t('还没有操作记录','No operations recorded yet'))}</div>`}</div>`;
}
function activityPane(issue,data){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const comments=data.comments||[],task=data.task,run=data.run;
  const commentHtml=comments.slice().reverse().map(c=>`<div class="comment-row"><div class="muted">${c.authorType==='agent'?'Agent':c.authorId||_t('成员','Member')} · ${new Date(c.createdAt).toLocaleString()}</div><p>${escapeHTML(c.body)}</p></div>`).join('')||`<div class="detail-empty compact">${escapeHTML(_t('暂无讨论','No comments yet'))}</div>`;
  const items=[];
  for(const item of [task,data.deletionTask].filter((t,i,all)=>t&&all.findIndex(x=>x?.id===t.id)===i)){
    items.push({t:new Date(item.createdAt).getTime(),type:'task.created',label:item.id===data.deletionTask?.id?_t('阻止删除的任务','Task blocking deletion'):_t('创建任务','Task created'),detail:`${taskStatusLabel(item.status)} · ${item.id}${item.agentId?' · '+item.agentId:''}`});
  }
  for(const e of run?.events||[])items.push({t:new Date(e.timestamp).getTime(),type:e.type||'',label:activityEventLabel(e.type),detail:e.message||''});
  items.sort((a,b)=>b.t-a.t);
  const rows=items.map(e=>{
    const fail=/fail|error/i.test(e.type);
    const detail=e.detail.length>180?e.detail.slice(0,180)+'…':e.detail;
    return `<div class="activity-row${fail?' fail':''}"><time>${formatActivityTime(e.t)}</time><b>${escapeHTML(e.label)}</b><p title="${escapeHTML(e.detail)}">${escapeHTML(detail)}</p></div>`;
  }).join('');
  const empty=conversationWorkspaceIssue(issue,run)?_t('对话需求没有 SOP 任务，执行过程见会话记录','Chat requirements have no SOP tasks; see conversation history for progress'):_t('尚未创建执行任务','No execution task created yet');
  return `<div class="detail-section"><h3>${escapeHTML(_t('讨论与评论','Comments'))}</h3>${commentHtml}</div><div class="detail-section"><h3>${escapeHTML(_t('任务与运行轨迹','Tasks & run trace'))}</h3>${rows?`<div class="activity-list">${rows}</div>`:`<div class="detail-empty compact">${escapeHTML(empty)}</div>`}</div>`;
}


async function deleteIssueById(issueId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(state.issueBulkDeleting)return toast(_t('正在批量删除需求，请稍候','Bulk deleting requirements, please wait'),'info');
  const issue=(state.data.issues||[]).find(i=>i.id===issueId)||state.issueDetailData?.issue;
  if(!issue||issue.id!==issueId)return toast(_t('未找到需求单','Requirement not found'));
  if(!issueCanDelete(issue))return toast(issueDeletionBlock(issue).reason,'err');
  const force=issue.deletionRequiresForce===true;
  const title=force?_t('强制删除需求','Force delete requirement'):_t('删除需求','Delete requirement');
  const external=issue.source==='tapd'||issue.source==='gongfeng';
  if(!await afConfirm({title,message:_t(`确定${title}「${issue.title||issue.id}」？${issueDeletionWarning(force,external)}`,`${title} “${issue.title||issue.id}”? ${issueDeletionWarning(force,external)}`),danger:true,confirmText:force?_t('确认强制删除','Confirm force delete'):_t('确认删除','Confirm delete')}))return;
  try{
    await api(issueDeletePath(issueId,force),{method:'DELETE'});
    state.data.issues=(state.data.issues||[]).filter(i=>i.id!==issueId);
    state.issueSelection?.delete(issueId);
    if(state.issueDetailData?.issue?.id===issueId){closeIssueDrawer();state.issueDetailData=null;state.selectedIssue=null;}
    state.data.tasks=(state.data.tasks||[]).filter(t=>t.issueId!==issueId);
    await refreshRuns();
    renderIssues();
    toast(_t('需求已删除','Requirement deleted'),'ok');
  }catch(err){
    toast(err.message,'err');
    await refreshIssues();
  }
}

// Association does not expose private conversations to other project members.
async function renderIssueConversations(issue,host){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const key=issue.id;host.dataset.conversationIssue=key;
  const link=(session)=>issueConversationURL(issue,session);
  host.innerHTML=`<div class="detail-empty">${escapeHTML(_t('正在加载关联会话…','Loading linked conversations…'))}</div>`;
  try{
    const rows=await api('/api/issues/'+encodeURIComponent(key)+'/conversations',{silent:true});
    if(state.issueDetailData?.issue?.id!==key||state.issueDetailTab!=='conversations')return;
    host.replaceChildren();
    const intro=document.createElement('p');intro.className='muted';intro.textContent=_t('仅展示你有权限访问的会话。私人会话仍仅自己可见。','Only conversations you have access to are shown. Private conversations remain visible only to you.');host.append(intro);
    const start=document.createElement('a');start.className='btn btn-primary';start.href=link('');start.target='_blank';start.rel='noopener';start.textContent=_t('围绕此需求新建会话','New conversation for this requirement');host.append(start);
    if(!rows.length){const empty=document.createElement('p');empty.className='detail-empty';empty.textContent=_t('还没有可见的关联会话','No visible linked conversations yet');host.append(empty)}
    rows.forEach(s=>{const a=document.createElement('a');a.href=link(s.id);a.target='_blank';a.rel='noopener';a.className='issue-conversation-link';a.style.cssText='display:block;padding:12px 0;border-bottom:1px solid var(--border,#eee)';const name=document.createElement('strong');name.textContent=s.title||_t('新对话','New chat');const meta=document.createElement('small');meta.style.cssText='display:block;color:var(--muted)';meta.textContent=(s.shared?_t('共享运行会话','Shared run conversation'):_t('私人会话','Private conversation'))+' · '+(s.participants||[]).length+_t(' 人发过言',' participant(s)');a.append(name,meta);host.append(a)});
  }catch(e){if(state.issueDetailData?.issue?.id===key&&state.issueDetailTab==='conversations')host.textContent=_t('加载关联会话失败：','Failed to load linked conversations: ')+e.message}
}
