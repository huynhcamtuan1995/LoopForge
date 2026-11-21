// Shared definitions contain no project credentials, notification bindings or run state.
let sharedScheduleCatalog=[];
const sharedScheduleVersionCache=new Map();
let aiScheduleTab='project';
let sharedScheduleQuery='';
let sharedScheduleCatalogRequest=0;
let sharedScheduleCatalogLoading=false;
let sharedScheduleCatalogError='';
let sharedScheduleVersionRequest=0;
let sharedScheduleEditorBaseVersion=0;
let sharedScheduleEditorContext=null;
let sharedSchedulePublishRequest=0;
function rememberSharedScheduleVersions(versions){
  for(const v of versions||[])sharedScheduleVersionCache.set(`${v.id}:${v.version}`,v);
}
function sharedScheduleDefinition(id,version){return sharedScheduleVersionCache.get(`${id}:${version}`)}
async function refreshSharedScheduleCatalog(){
  const request=++sharedScheduleCatalogRequest;
  sharedScheduleCatalogLoading=true;sharedScheduleCatalogError='';renderAISchedulePanels();
  try{
    const items=await api('/api/shared-schedule-tasks',{silent:true});
    if(request!==sharedScheduleCatalogRequest)return sharedScheduleCatalog;
    sharedScheduleCatalog=Array.isArray(items)?items:[];
    rememberSharedScheduleVersions(sharedScheduleCatalog);
    return sharedScheduleCatalog;
  }catch(err){if(request===sharedScheduleCatalogRequest)sharedScheduleCatalogError=err.message;throw err}
  finally{if(request===sharedScheduleCatalogRequest){sharedScheduleCatalogLoading=false;renderAISchedulePanels()}}
}
const aiScheduleTabs=['project','trigger','market','executions'];
async function selectAIScheduleTab(tab){
  aiScheduleTab=aiScheduleTabs.includes(tab)?tab:'project';
  renderAISchedulePanels();
  if(aiScheduleTab==='market')try{await refreshSharedScheduleCatalog()}catch{}
  if(aiScheduleTab==='executions')await refreshScheduleExecutions();
}
function renderAISchedulePanels(){
  const market=aiScheduleTab==='market';
  $$('[data-ai-schedule-tab]').forEach(b=>{const active=b.dataset.aiScheduleTab===aiScheduleTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
  $('#aiScheduleProjectPanel').hidden=aiScheduleTab!=='project';$('#aiScheduleMarketPanel').hidden=!market;
  const trigger=$('#aiScheduleTriggerPanel');if(trigger)trigger.hidden=aiScheduleTab!=='trigger';
  const execPanel=$('#aiScheduleExecPanel');if(execPanel)execPanel.hidden=aiScheduleTab!=='executions';
  $('#sharedScheduleSearchField').hidden=!market;
  $('#aiScheduleProjectCount').textContent=scheduleJobsInView(state.data.scheduleJobs,state.projectFilter).filter(j=>j.skipDispatch&&state.projectFilter).length;
  $('#sharedScheduleMarketCount').textContent=sharedScheduleCatalog.length;
  if(market)renderSharedScheduleMarket();
  if(typeof renderScheduleExecutions==='function')renderScheduleExecutions();
}
function renderSharedScheduleMarket(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const host=$('#sharedScheduleLibrary'),projectId=state.projectFilter;
  const focused=document.activeElement;
  const action=host.contains(focused)?['subscribeShared','readShared'].find(key=>focused.dataset[key]):null;
  const focusId=action?focused.dataset[action]:null;
  const items=sharedScheduleCatalog.filter(v=>[v.name,v.description,v.sourceProjectName,v.sourceProjectId,...(v.parameters||[]).map(p=>p.label)].join(' ').toLowerCase().includes(sharedScheduleQuery));
  const project=currentProject();
  $('#sharedScheduleMarketHint').textContent=projectId?_t(`订阅将添加到「${project?.name||projectId}」，参数、调度和通知由本项目独立配置。新版本发布后可手动升级。`,`Subscriptions are added to "${project?.name||projectId}" with project-local parameters, schedule, and notifications. You can upgrade manually when new versions publish.`):_t('共享任务可跨项目浏览；请先选择项目，再添加订阅。','Browse shared tasks across projects; select a project first to subscribe.');
  const status=$('#sharedScheduleMarketStatus');
  status.innerHTML=sharedScheduleCatalogError?`<div class="shared-schedule-market-error">${_t('读取共享任务失败：','Failed to load shared tasks: ')}${escapeHTML(sharedScheduleCatalogError)} <button type="button" class="button ghost small" data-retry-shared>${_t('重试','Retry')}</button></div>`:'';
  status.querySelector('[data-retry-shared]')?.addEventListener('click',()=>refreshSharedScheduleCatalog().catch(()=>{}));
  host.setAttribute('aria-busy',String(sharedScheduleCatalogLoading));
  if(!sharedScheduleCatalog.length){host.innerHTML=`<div class="shared-schedule-market-empty">${sharedScheduleCatalogLoading?_t('正在读取共享任务…','Loading shared tasks…'):sharedScheduleCatalogError?_t('共享任务暂时无法加载，请重试。','Unable to load shared tasks; please retry.'):_t('还没有共享任务。在本项目的独立 AI 定时任务旁点击「发布共享」，即可供其他项目订阅。','No shared tasks yet. Click "Publish shared" on a standalone AI scheduled task to share it with other projects.')}</div>`;return}
  host.innerHTML=items.map(v=>{
    const count=(state.data.scheduleJobs||[]).filter(j=>projectId&&j.projectId===projectId&&j.sharedTaskId===v.id).length;
    return `<article class="mcp-market-card"><div class="mcp-card-head"><span class="shared-schedule-market-icon"><svg class="agent-icon harness-icon" data-icon="clock" width="22" height="22" aria-hidden="true" focusable="false"></svg></span><div><h3>${escapeHTML(v.name)}</h3><span class="shared-schedule-market-source">${escapeHTML(v.sourceProjectName||v.sourceProjectId)}</span></div><span class="hui-badge" data-tone="neutral" data-size="sm">v${v.version}</span></div><p>${escapeHTML(v.description||_t('暂无用途说明，查看详情了解提示词与业务参数。','No purpose description; view details for prompt and parameters.'))}</p><div class="shared-schedule-market-meta"><span>${_t('推荐 ','Recommended ')}${escapeHTML(scheduleJobTimingLabel(v))}</span><span>${_t(`${(v.parameters||[]).length} 个参数`,`${(v.parameters||[]).length} params`)}</span>${count?`<span class="shared-schedule-subscribed">${_t(`本项目已订阅 ${count} 个`,`Subscribed ${count} in project`)}</span>`:''}</div><div class="shared-schedule-market-actions"><button type="button" class="button ghost small" data-read-shared="${escapeHTML(v.id)}">${_t('查看详情','Details')}</button><button type="button" class="button primary small" data-subscribe-shared="${escapeHTML(v.id)}" ${projectId?'':'disabled'}>${count?_t('继续添加','Subscribe more'):_t('添加订阅','Subscribe')}</button></div></article>`;
  }).join('')||`<div class="shared-schedule-market-empty">${_t('没有匹配的共享任务，试试其他关键词。','No matching shared tasks; try other keywords.')}</div>`;
  host.querySelectorAll('[data-read-shared]').forEach(b=>b.onclick=()=>openSharedScheduleVersions(b.dataset.readShared,false));
  host.querySelectorAll('[data-subscribe-shared]').forEach(b=>b.onclick=()=>{
    if(state.projectFilter!==projectId||!projectId)return toast(_t('请先选择项目','Select a project first'));
    const v=items.find(v=>v.id===b.dataset.subscribeShared);if(!v)return;
    openScheduleJobModal('assistant',{name:v.name,skipDispatch:true,sharedTaskId:v.id,sharedTaskVersion:v.version,parameterValues:{},assistantModel:v.model,cron:v.cron,intervalSec:v.intervalSec});
  });
  window.AgentFlowHarnessIcons?.hydrate(host);
  if(focusId)[...host.querySelectorAll('[data-read-shared],[data-subscribe-shared]')].find(el=>el.dataset[action]===focusId)?.focus();
}
function sharedScheduleRowInfo(job){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!job.sharedTaskId)return '';
  const v=sharedScheduleDefinition(job.sharedTaskId,job.sharedTaskVersion);
  return `<span class="shared-schedule-origin">${_t('订阅','Subscribed')} · v${Number(job.sharedTaskVersion)}${v?` · ${escapeHTML(v.sourceProjectName||v.sourceProjectId)}`:''}</span>`;
}
// Only a pending update stays on the row; publishing and browsing versions
// live in the row's ⋯ menu (sharedScheduleRowMenuItem).
function sharedScheduleRowAction(job){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!job.skipDispatch||!job.sharedTaskId)return '';
  const latest=sharedScheduleCatalog.find(v=>v.id===job.sharedTaskId);
  if(!(latest?.version>job.sharedTaskVersion))return '';
  return `<button type="button" class="button hui-btn-soft small" data-shared-versions="${escapeHTML(job.id)}">${_t(`有新版 v${latest.version}`,`Update v${latest.version}`)}</button>`;
}
function sharedScheduleRowMenuItem(job,item){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!job.skipDispatch)return '';
  if(!job.sharedTaskId)return item('data-publish-schedule',_t('发布共享','Publish shared'),'layers');
  const latest=sharedScheduleCatalog.find(v=>v.id===job.sharedTaskId);
  return latest?.version>job.sharedTaskVersion?'':item('data-shared-versions',_t('查看版本','View versions'),'layers');
}
function bindSharedScheduleRowActions(host){
  host.querySelectorAll('[data-publish-schedule]').forEach(b=>b.onclick=()=>openSharedSchedulePublish(b.dataset.publishSchedule));
  host.querySelectorAll('[data-shared-versions]').forEach(b=>b.onclick=async()=>{
    const job=(state.data.scheduleJobs||[]).find(j=>j.id===b.dataset.sharedVersions);
    if(!job)return;
    const opening=openScheduleJobModal('assistant',job),editorVersion=scheduleModalVersion;
    await opening;
    if(editorVersion===scheduleModalVersion&&$('#scheduleModal').classList.contains('open')&&$('#scheduleJobForm').elements.id.value===job.id)openSharedScheduleVersions(job.sharedTaskId,true);
  });
}
function sharedScheduleFormPayload(f){
  const id=f.elements.sharedTaskId?.value;
  if(!id)return {};
  const parameterValues=Object.fromEntries([...f.querySelectorAll('[data-shared-param]')].map(el=>[el.dataset.sharedParam,el.value]));
  return {sharedTaskId:id,sharedTaskVersion:Number(f.elements.sharedTaskVersion.value),parameterValues,assistantPrompt:''};
}
function sharedSchedulePreview(v,values){
  return String(v.prompt||'').replace(/\{\{\s*params\.([^{}]+?)\s*\}\}/g,(_,name)=>values[name.trim()]??'');
}
function fillSharedScheduleForm(job){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#scheduleJobForm'),section=$('#sharedScheduleBinding');
  const bound=!!job.sharedTaskId&&f.elements.jobKind.value==='assistant';
  f.elements.sharedTaskId.value=bound?job.sharedTaskId:'';
  f.elements.sharedTaskVersion.value=bound?job.sharedTaskVersion:'';
  f.querySelector('[data-schedule-prompt]').hidden=bound||f.elements.jobKind.value!=='assistant';
  f.elements.assistantPrompt.required=!bound&&f.elements.jobKind.value==='assistant';
  section.hidden=!bound;
  f.querySelector('[type="submit"]').disabled=false;
  if(!bound){section.replaceChildren();return}
  const v=sharedScheduleDefinition(job.sharedTaskId,job.sharedTaskVersion);
  if(!v){
    section.innerHTML=`<p class="schedule-field-hint" role="status">${_t('正在读取订阅版本…','Loading subscribed version…')}</p>`;
    f.querySelector('[type="submit"]').disabled=true;
    return;
  }
  const values=Object.fromEntries((v.parameters||[]).map(p=>[p.name,Object.hasOwn(job.parameterValues||{},p.name)?job.parameterValues[p.name]:(p.default||'')]));
  section.innerHTML=`<div class="shared-schedule-section-head"><div><b>${escapeHTML(v.name)}</b><p class="schedule-field-hint">${_t('来源：','Source: ')}${escapeHTML(v.sourceProjectName||v.sourceProjectId)} · ${sharedScheduleEditorContext&&v.version!==sharedScheduleEditorBaseVersion?_t('待保存','Pending save'):_t('固定','Pinned')} v${v.version}</p></div><button type="button" class="button ghost small" data-choose-shared-version aria-expanded="false">${_t('查看 / 切换版本','View / switch version')}</button></div><p class="schedule-field-hint">${escapeHTML(v.description||_t('提示词由共享任务维护；调度、模型、参数和通知保存在当前项目。','Prompt is maintained by the shared task; schedule, model, parameters, and notifications are stored in this project.'))}</p><div class="shared-schedule-values">${(v.parameters||[]).map(p=>`<label>${escapeHTML(p.label)}${p.required?' *':''}<span class="schedule-field-hint">${escapeHTML(p.name)} · ${escapeHTML(p.type)}</span>${p.type==='boolean'?`<select class="select" data-shared-param="${escapeHTML(p.name)}" aria-label="${escapeHTML(p.label)}" ${p.required?'required':''}><option value="">${_t('请选择','Select')}</option><option value="true" ${values[p.name]==='true'?'selected':''}>${_t('是','Yes')}</option><option value="false" ${values[p.name]==='false'?'selected':''}>${_t('否','No')}</option></select>`:`<input class="input" data-shared-param="${escapeHTML(p.name)}" aria-label="${escapeHTML(p.label)}" value="${escapeHTML(values[p.name])}" ${p.required?'required':''} maxlength="2000" ${['integer','number'].includes(p.type)?`type="number" step="${p.type==='integer'?'1':'any'}"`:'type="text"'}>`}</label>`).join('')||`<p class="schedule-field-hint">${_t('此版本没有业务参数。','No parameters in this version.')}</p>`}</div><details class="shared-schedule-preview"><summary>${_t('执行提示词预览','Prompt preview')}</summary><pre></pre></details>`;
  const preview=()=>{section.querySelector('pre').textContent=sharedSchedulePreview(v,sharedScheduleFormPayload(f).parameterValues)};
  section.querySelectorAll('[data-shared-param]').forEach(el=>el.addEventListener('input',preview));
  section.querySelector('[data-choose-shared-version]').onclick=()=>openSharedScheduleVersions(v.id,true);
  preview();
  paintSharedScheduleSaveLabel();
}
async function loadSharedScheduleEditor(job,version,projectId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!job.sharedTaskId)return;
  const active=()=>scheduleModalVersion===version&&state.projectFilter===projectId&&$('#scheduleModal').classList.contains('open');
  try{
    if(!sharedScheduleDefinition(job.sharedTaskId,job.sharedTaskVersion))rememberSharedScheduleVersions(await api(`/api/shared-schedule-tasks/${encodeURIComponent(job.sharedTaskId)}/versions`,{silent:true}));
    if(!active())return;
    if(!sharedScheduleDefinition(job.sharedTaskId,job.sharedTaskVersion))throw new Error(_t('订阅版本不存在','Subscribed version does not exist'));
    fillSharedScheduleForm(job);
  }catch(err){
    if(!active())return;
    $('#sharedScheduleBinding').innerHTML=`<p role="status">${_t(`读取订阅失败：${escapeHTML(err.message)}。请关闭后重试。`,`Failed to load subscription: ${escapeHTML(err.message)}. Close and try again.`)}</p>`;
    $('#scheduleJobForm').querySelector('[type="submit"]').disabled=true;
  }
}
function sharedScheduleParameterRow(p={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const row=document.createElement('div');row.className='shared-schedule-parameter-row';
  row.innerHTML=`<label>${_t('参数名','Name')}<input class="input" data-param-field="name" aria-label="${_t('参数名','Name')}" required pattern="[a-zA-Z][a-zA-Z0-9_]{0,31}" value="${escapeHTML(p.name||'')}" placeholder="days"></label><label>${_t('显示名称','Label')}<input class="input" data-param-field="label" aria-label="${_t('显示名称','Label')}" required maxlength="120" value="${escapeHTML(p.label||'')}" placeholder="${_t('停滞天数','Stale days')}"></label><label>${_t('类型','Type')}<select class="select" data-param-field="type" aria-label="${_t('参数类型','Parameter type')}">${[['string',_t('文本','String')],['integer',_t('整数','Integer')],['number',_t('数字','Number')],['boolean',_t('布尔值','Boolean')]].map(([value,label])=>`<option value="${value}" ${p.type===value?'selected':''}>${label}</option>`).join('')}</select></label><label>${_t('默认值','Default')}<input class="input" data-param-field="default" aria-label="${_t('默认值','Default')}" maxlength="2000" value="${escapeHTML(p.default||'')}"></label><label class="schedule-check"><input type="checkbox" data-param-field="required" ${p.required?'checked':''}>${_t('必填','Required')}</label><button type="button" class="button ghost small" data-remove-parameter aria-label="${_t('删除参数','Remove parameter')}">${_t('删除','Remove')}</button>`;
  row.querySelector('[data-remove-parameter]').onclick=()=>row.remove();
  return row;
}
async function openSharedSchedulePublish(jobId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const job=(state.data.scheduleJobs||[]).find(j=>j.id===jobId);
  if(!job||job.sharedTaskId||!job.skipDispatch)return;
  const request=++sharedSchedulePublishRequest,projectId=state.projectFilter,f=$('#sharedSchedulePublishForm');
  $('#sharedSchedulePublishModal').classList.add('open');f.inert=true;f.querySelector('[type="submit"]').disabled=false;
  $('#sharedSchedulePublishError').textContent=_t('正在读取发布版本…','Loading published versions…');
  try{
    await refreshSharedScheduleCatalog();
    if(request!==sharedSchedulePublishRequest||!$('#sharedSchedulePublishModal').classList.contains('open'))return;
    if(state.projectFilter!==projectId)throw new Error(_t('项目已切换，请关闭后重新发布','Project changed; close and publish again'));
    const prior=sharedScheduleCatalog.find(v=>v.sourceJobId===job.id&&v.sourceProjectId===job.projectId);
    f.elements.sourceJobId.value=job.id;f.elements.sourceProjectId.value=job.projectId;
    f.elements.baseVersion.value=prior?.version||0;
    f.elements.name.value=prior?.name||job.name;f.elements.description.value=prior?.description||'';
    f.elements.prompt.value=prior?.prompt||job.assistantPrompt;f.elements.changeNote.value='';
    $('#sharedScheduleParameterRows').replaceChildren(...(prior?.parameters||[]).map(sharedScheduleParameterRow));
    f.querySelector('[type="submit"]').textContent=_t(`发布 v${(prior?.version||0)+1}`,`Publish v${(prior?.version||0)+1}`);
    $('#sharedSchedulePublishError').textContent='';f.inert=false;f.elements.name.focus();
  }catch(err){if(request===sharedSchedulePublishRequest)$('#sharedSchedulePublishError').textContent=err.message}
}
async function publishSharedSchedule(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  e.preventDefault();const f=e.currentTarget,projectId=state.projectFilter,request=sharedSchedulePublishRequest;
  if(f.elements.sourceProjectId.value!==projectId)return toast(_t('项目已切换，请重新发布','Project changed; please publish again'));
  const parameters=[...f.querySelectorAll('.shared-schedule-parameter-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-param-field]')].map(el=>[el.dataset.paramField,el.type==='checkbox'?el.checked:el.value.trim()])));
  const payload={name:f.elements.name.value.trim(),description:f.elements.description.value.trim(),prompt:f.elements.prompt.value.trim(),parameters,changeNote:f.elements.changeNote.value.trim(),baseVersion:Number(f.elements.baseVersion.value)};
  const button=f.querySelector('[type="submit"]');button.disabled=true;
  try{
    const v=await api(`/api/schedule-jobs/${encodeURIComponent(f.elements.sourceJobId.value)}/publish`,{method:'POST',body:JSON.stringify(payload)});
    rememberSharedScheduleVersions([v]);
    sharedScheduleCatalog=sharedScheduleCatalog.filter(item=>item.id!==v.id).concat(v);
    renderScheduleJobs();
    if(request===sharedSchedulePublishRequest){$('#sharedSchedulePublishModal').classList.remove('open');$('#newAISchedule').focus()}
    toast(_t(`已发布 ${v.name} v${v.version}，其他项目可从「共享任务市场」订阅`,`Published ${v.name} v${v.version}; other projects can subscribe in Shared Marketplace`));
  }catch(err){if(request===sharedSchedulePublishRequest)$('#sharedSchedulePublishError').textContent=err.message}
  finally{if(request===sharedSchedulePublishRequest)button.disabled=false}
}
function resetSharedScheduleVersionEditor(job){
  sharedScheduleEditorBaseVersion=Number(job.sharedTaskVersion)||0;
  sharedScheduleEditorContext=null;
  const host=$('#sharedScheduleVersionEditor');host.hidden=true;host.replaceChildren();
}
function paintSharedScheduleSaveLabel(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#scheduleJobForm'),selected=Number(f.elements.sharedTaskVersion.value);
  if(!sharedScheduleEditorContext)return;
  const expanded=!$('#sharedScheduleVersionEditor').hidden,choose=f.querySelector('[data-choose-shared-version]');
  if(choose){choose.textContent=expanded?_t('收起版本对比','Hide version diff'):_t('查看 / 切换版本','View / switch version');choose.setAttribute('aria-expanded',String(expanded))}
  const changed=selected!==sharedScheduleEditorBaseVersion;
  f.querySelector('[type="submit"]').textContent=changed?_t(`保存并${selected>sharedScheduleEditorBaseVersion?'升级':'切换'}到 v${selected}`,`Save & ${selected>sharedScheduleEditorBaseVersion?'upgrade':'switch'} to v${selected}`):_t('保存 AI 定时任务','Save AI scheduled task');
  $('#scheduleModalTitle').textContent=changed?_t('更新共享任务订阅','Update shared task subscription'):_t('共享任务版本','Shared task version');
  $('#scheduleModalHint').textContent=_t('在这里对比版本、调整参数并保存。保存后，后续执行使用所选版本。','Compare versions, adjust parameters, and save. Future runs use the selected version.');
}
async function openSharedScheduleVersionEditor(id){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#scheduleJobForm'),host=$('#sharedScheduleVersionEditor');
  if(!$('#scheduleModal').classList.contains('open')||f.elements.sharedTaskId.value!==id)return;
  const context={id,editorVersion:scheduleModalVersion,projectId:state.projectFilter,jobId:f.elements.id.value,versions:[],valuesByVersion:new Map()};
  // Reopening the comparison keeps in-progress parameter edits.
  if(sharedScheduleEditorContext?.id===id&&sharedScheduleEditorContext.editorVersion===scheduleModalVersion){
    host.hidden=!host.hidden;paintSharedScheduleSaveLabel();
    if(!host.hidden)host.focus({preventScroll:true});
    return;
  }
  sharedScheduleEditorContext=context;
  const active=()=>sharedScheduleEditorContext===context&&context.editorVersion===scheduleModalVersion&&context.projectId===state.projectFilter&&context.jobId===f.elements.id.value&&f.elements.sharedTaskId.value===id&&$('#scheduleModal').classList.contains('open');
  host.hidden=false;host.textContent=_t('正在读取版本…','Loading versions…');
  f.querySelector('[type="submit"]').disabled=true;
  try{
    const versions=await api(`/api/shared-schedule-tasks/${encodeURIComponent(id)}/versions`,{silent:true});
    if(!active())return;
    if(!Array.isArray(versions)||!versions.length)throw new Error(_t('共享任务不存在','Shared task does not exist'));
    if(!versions.some(v=>v.version===sharedScheduleEditorBaseVersion))throw new Error(_t('当前订阅版本不存在','Subscribed version does not exist'));
    context.versions=versions;rememberSharedScheduleVersions(versions);
    const selectVersion=selected=>{
      if(!active())return;
      const old=Number(f.elements.sharedTaskVersion.value),values=sharedScheduleFormPayload(f).parameterValues;
      context.valuesByVersion.set(old,values);
      const v=versions.find(v=>v.version===selected);if(!v)return;
      const retained=context.valuesByVersion.get(selected)||values;
      const parameterValues=Object.fromEntries((v.parameters||[]).filter(p=>Object.hasOwn(retained,p.name)).map(p=>[p.name,retained[p.name]]));
      fillSharedScheduleForm({sharedTaskId:id,sharedTaskVersion:v.version,parameterValues});
      const current=versions.find(v=>v.version===sharedScheduleEditorBaseVersion);
      host.innerHTML=`<div class="shared-schedule-section-head"><label class="shared-schedule-version-select">${_t('目标版本','Target version')}<select class="select" aria-label="${_t('目标订阅版本','Target subscription version')}">${versions.map(item=>`<option value="${item.version}" ${item.version===v.version?'selected':''}>v${item.version}${item===versions[0]?_t(' · 最新',' · Latest'):''}${item.version===current.version?_t(' · 当前',' · Current'):''}</option>`).join('')}</select></label><span class="shared-schedule-version-current">${_t(`当前 v${current.version}`,`Current v${current.version}`)}${v.version!==current.version?` → v${v.version}`:''}</span></div><p class="schedule-field-hint">${escapeHTML(v.changeNote||_t('暂无版本说明','No release notes'))}</p><details class="shared-schedule-comparison" open><summary>${_t('提示词和参数对比','Prompt & parameters diff')}</summary><div class="shared-schedule-diff"><section><b>${_t(`当前 v${current.version}`,`Current v${current.version}`)}</b><pre>${escapeHTML(current.prompt)}</pre><small>${escapeHTML(sharedScheduleParameterSummary(current))}</small></section><section><b>${_t(`目标 v${v.version}`,`Target v${v.version}`)}</b><pre>${escapeHTML(v.prompt)}</pre><small>${escapeHTML(sharedScheduleParameterSummary(v))}</small></section></div></details>`;
      host.querySelector('select').onchange=e=>selectVersion(Number(e.target.value));
      paintSharedScheduleSaveLabel();
    };
    selectVersion(versions[0].version);
    host.focus({preventScroll:true});host.scrollIntoView?.({block:'nearest'});
  }catch(err){
    if(!active())return;
    host.innerHTML=`<p role="status">${_t(`读取版本失败：${escapeHTML(err.message)}`,`Failed to load versions: ${escapeHTML(err.message)}`)}</p><button type="button" class="button ghost small" data-retry-shared-versions>${_t('重试','Retry')}</button>`;
    host.querySelector('button').onclick=()=>{sharedScheduleEditorContext=null;openSharedScheduleVersionEditor(id)};
  }finally{if(active())f.querySelector('[type="submit"]').disabled=false}
}
async function openSharedScheduleVersions(id,editing){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(editing)return openSharedScheduleVersionEditor(id);
  const request=++sharedScheduleVersionRequest,host=$('#sharedScheduleVersions');
  $('#sharedScheduleVersionTitle').textContent=_t('共享任务详情','Shared task details');
  $('#sharedScheduleVersionModal').classList.add('open');$('#sharedScheduleVersionModal .modal-close').focus();host.textContent=_t('正在读取版本…','Loading versions…');
  try{
    const versions=await api(`/api/shared-schedule-tasks/${encodeURIComponent(id)}/versions`,{silent:true});
    if(request!==sharedScheduleVersionRequest||!$('#sharedScheduleVersionModal').classList.contains('open'))return;
    if(!Array.isArray(versions)||!versions.length)throw new Error(_t('共享任务不存在','Shared task does not exist'));
    rememberSharedScheduleVersions(versions);
    const paint=selected=>{
      const v=versions.find(v=>v.version===selected)||versions[0];
      host.innerHTML=`<p class="modal-hint">${escapeHTML(v.sourceProjectName||v.sourceProjectId)}</p><label class="shared-schedule-version-select">${_t('发布版本','Published version')}<select class="select" aria-label="${_t('发布版本','Published version')}">${versions.map(item=>`<option value="${item.version}" ${item.version===v.version?'selected':''}>v${item.version}${item===versions[0]?_t(' · 最新',' · Latest'):''}</option>`).join('')}</select></label><p>${escapeHTML(v.changeNote||_t('暂无版本说明','No release notes'))}</p><div class="shared-schedule-diff"><section><b>${escapeHTML(v.name)} · v${v.version}</b><pre>${escapeHTML(v.prompt)}</pre><small>${escapeHTML(sharedScheduleParameterSummary(v))}</small></section></div>`;
      host.querySelector('select').onchange=e=>paint(Number(e.target.value));
    };
    paint(versions[0].version);
  }catch(err){if(request===sharedScheduleVersionRequest)host.textContent=_t(`读取失败：${err.message}`,`Load failed: ${err.message}`)}
}
function sharedScheduleParameterSummary(v){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return (v.parameters||[]).map(p=>`${p.label} (${p.name}, ${p.type}${p.required?_t(', 必填',', required'):''}${p.default?_t(`, 默认 ${p.default}`,`, default ${p.default}`):''})`).join(_t('；','; '))||_t('无业务参数','No parameters');
}
function bindSharedScheduleUI(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  $$('[data-ai-schedule-tab]').forEach(b=>b.onclick=()=>selectAIScheduleTab(b.dataset.aiScheduleTab));
  $('#sharedScheduleSearch').oninput=e=>{sharedScheduleQuery=e.target.value.trim().toLowerCase();renderSharedScheduleMarket()};
  ['sharedSchedulePublishModal','sharedScheduleVersionModal'].forEach(id=>{
    $(`#${id} .modal-close`).onclick=()=>{
      $(`#${id}`).classList.remove('open');
      const target=$('#scheduleModal').classList.contains('open')?$('#scheduleJobForm [type="submit"]'):$('#aiScheduleMarketTab');
      target.focus();
    };
  });
  $('#sharedScheduleAddParameter').onclick=()=>{
    const host=$('#sharedScheduleParameterRows');
    if(host.children.length>=20)return toast(_t('最多支持 20 个参数','Up to 20 parameters supported'));
    host.append(sharedScheduleParameterRow());host.lastElementChild.querySelector('input').focus();
  };
  $('#sharedSchedulePublishForm').onsubmit=publishSharedSchedule;
}
