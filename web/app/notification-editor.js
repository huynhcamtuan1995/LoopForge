// Compact SOP Bot settings and the shared AI schedule/assistant notification editor.
const nodeBotCache=new Map(),notificationBotRequests=new Map();
const defaultAIInstruction='用简洁自然的语气总结本次实际完成的事项、已有验证结果和后续需要关注的事情。不要包含凭据、原始日志或无关上下文。';
function notificationPayload(bindings){return(bindings||[]).map(b=>({botId:b.botId||'',events:[...(b.events||[])],template:b.template||'',scope:b.scope||'',contentMode:b.contentMode||'template',aiInstruction:b.aiInstruction||'',waitingPolicy:b.waitingPolicy||'actionable'}))}
function notificationUsesAI(binding){return binding.contentMode==='ai'||!!binding.aiInstruction||/\{\{\s*ai\./.test(binding.template||'')}
function notificationVariables(sourceType){return sourceType==='run'?['issue.title','project','workflow','node','status','url','input','result','error','ai.summary','ai.title','ai.body']:['task.name','project','status','url','result','error','ai.summary','ai.title','ai.body']}
function loadNotificationBots(projectId){
 if(notificationBotRequests.has(projectId))return notificationBotRequests.get(projectId);
 const request=api(`/api/notification-bots?projectId=${encodeURIComponent(projectId)}`,{silent:true}).then(bots=>{nodeBotCache.set(projectId,{bots,error:''})}).catch(e=>{nodeBotCache.set(projectId,{bots:[],error:e.message})}).finally(()=>notificationBotRequests.delete(projectId));
 notificationBotRequests.set(projectId,request);return request;
}
function normalizeWorkflowNotifications(wf){
 const legacy=(wf.nodes||[]).flatMap(n=>n.notifications||[]);
 let binding=(wf.notifications||[])[0]||legacy.find(b=>b.scope==='run')||legacy[0];
 wf.notifications=binding?[{...binding,scope:'run',events:['succeeded'],contentMode:'ai',template:binding.scope==='run'?binding.template||'':'',aiInstruction:binding.scope==='run'?binding.aiInstruction||'':''}]:[];
 (wf.nodes||[]).forEach(n=>{delete n.notifications});
}
// Chinese insertion buttons explain the existing English template variables.
const sopNotificationFieldData=[
  ['issue.title','需求名称','例如：登录校验优化','Requirement name','e.g. Login validation polish'],
  ['workflow','SOP 名称','例如：需求交付流程','SOP name','e.g. Delivery SOP'],
  ['ai.body','完成汇报','独立 AI 根据本次输出与产物编写的整体报告','Completion report','Summary report authored by AI from outputs & artifacts'],
  ['url','查看详情','本次运行的详情链接','View details','Link to this run'],
  ['project','项目名称','当前 SOP 所属项目','Project name','Project containing this SOP'],
  ['ai.summary','简短摘要','完成汇报的精简内容','Short summary','Concise version of the report'],
  ['ai.title','汇报标题','本次完成汇报的标题','Report title','Title of this completion report'],
  ['status','完成状态','例如：SOP 已完成','Status','e.g. SOP completed'],
  ['result','节点执行结果','各节点的执行结果汇总','Node results','Summary of outputs across all steps'],
  ['issue.id','需求编号','关联需求的内部编号','Issue ID','Internal ID of the linked requirement'],
  ['node','节点名称','完成汇报中为“全部节点”','Node name','Shows "all nodes" in completion reports'],
  ['input','任务输入','本次运行接收的任务内容','Task input','Input received by this run'],
  ['error','错误说明','完成时通常为空','Error','Usually blank on completion'],
  ['task.name','定时任务名称','仅定时任务有此信息','Task name','Available for scheduled tasks only']
];
function getDefaultAIInstruction(){
  return (typeof lfT==='function'?lfT:z=>z)(defaultAIInstruction,'Summarize concisely what was completed, verification results so far, and follow-ups needed. Omit credentials, raw logs, and unrelated context.');
}
function getRecommendedSOPNotificationTemplate(){
  return (typeof lfT==='function'?lfT:z=>z)(recommendedSOPNotificationTemplate,'Requirement "{{issue.title}}" completed\n\n{{ai.body}}\n\n{{url}}');
}
function sopNotificationFieldButtons(fields){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return fields.map(([key,labelZh,descZh,labelEn,descEn])=>`<button type="button" class="button ghost small" data-sop-notification-field="${escapeHTML(key)}" title="${escapeHTML(_t(descZh,descEn||descZh))}">＋ ${escapeHTML(_t(labelZh,labelEn||labelZh))}</button>`).join('');
}
const recommendedSOPNotificationTemplate='需求「{{issue.title}}」已完成\n\n{{ai.body}}\n\n{{url}}';
function sopNotificationHTML(bindings,options){
 const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
 const cached=nodeBotCache.get(options.projectId),bots=cached?.bots||[],binding=bindings[0];
 return `<label>${_t('通知 Bot','Notify Bot')}<select class="select" data-sop-notification-bot><option value="">${_t('不启用通知','Disabled')}</option>${binding?.botId&&!bots.some(b=>b.id===binding.botId)?`<option value="${escapeHTML(binding.botId)}" selected>${_t('Bot 不可访问，请重新选择','Bot unavailable, choose another')}</option>`:''}${bots.map(b=>`<option value="${escapeHTML(b.id)}" ${binding?.botId===b.id?'selected':''} ${!b.enabled||!b.target?'disabled':''}>${escapeHTML(b.name)} · ${b.target?`${b.target.type==='group'?_t('群聊','Group'):_t('单聊','DM')}${_t('：',': ')}${escapeHTML(b.target.name)}`:_t('未绑定聊天','Unbound chat')}</option>`).join('')}</select></label><div class="notification-config-head"><span>${cached?.error?escapeHTML(cached.error):!cached?_t('正在获取本项目 Bot…','Loading project Bots…'):_t('选中后自动提醒失败、待人工处理，并在 SOP 完成后发送汇报。','Sends alerts on failure or awaiting-human and a summary report when the SOP finishes.')}</span><button type="button" class="button ghost small" data-notification-refresh>${_t('刷新 Bot','Refresh Bots')}</button><button type="button" class="button ghost small" data-notification-manage>${_t('Bot 管理','Manage Bots')}</button></div>${binding?`<p class="prop-hint">${_t('SOP 完成后使用所选 Bot 配置的 CodeBuddy 模型单独生成整体报告，凭据沿用本次 SOP 执行身份。缺少凭据或生成失败时发送标准完成消息。','On completion, generates a report with the Bot CodeBuddy model using this run credentials; falls back to the standard message on failure.')}</p><details data-sop-notification-custom><summary>${_t('自定义完成汇报（选填）','Customize report (optional)')}</summary><label>${_t('AI 编写要求','AI writing instructions')}<textarea class="input" rows="3" data-sop-notification-instruction placeholder="${escapeHTML(getDefaultAIInstruction())}">${escapeHTML(binding.aiInstruction||'')}</textarea></label><div class="sop-message-compose"><div class="sop-message-edit"><div class="sop-message-help"><b>${_t('完成消息','Completion message')}</b><p class="prop-hint">${_t('直接写想说的话，点击下面的内容即可插入。按钮会插入英文占位符，发送时自动替换为实际内容，不需要手动记忆或输入。留空则使用默认汇报。','Write your message and click chips below to insert placeholders automatically resolved at send time. Leave blank for the default report.')}</p><div class="sop-message-fields">${sopNotificationFieldButtons(sopNotificationFieldData.slice(0,4))}<button type="button" class="button ghost small" data-sop-notification-recommended>${_t('用推荐格式','Use recommended')}</button></div><details class="sop-more-fields"><summary>${_t('更多可插入内容','More fields')}</summary><div class="sop-message-fields">${sopNotificationFieldButtons(sopNotificationFieldData.slice(4,10))}</div><p class="prop-hint">${_t('项目名称是当前项目，简短摘要是完成汇报的精简内容，节点执行结果会汇总各步骤的输出。','Project name is the current project, Short summary condenses the report, and Node results aggregate outputs from every step.')}</p></details></div><label>${_t('消息内容','Message template')}<textarea class="input" rows="5" data-sop-notification-template placeholder="${_t('留空使用默认汇报。也可以点击「用推荐格式」，再修改文案。','Leave empty for default report, or click Use recommended and edit.')}">${escapeHTML(binding.template||'')}</textarea></label></div><div class="sop-notification-example"><div><b>${_t('接收者看到的消息示例','Recipient message preview')}</b><small>${_t('示例数据 · 不发送通知','Sample data · not sent')}</small></div><div class="markdown-body" data-sop-notification-preview aria-live="polite">${_t('展开后加载示例…','Expand to load preview…')}</div><p class="prop-hint">${_t('以示例需求「登录校验优化」展示。实际内容会替换为本次需求和执行结果；AI 编写要求在实际执行时生效。','Shown with a sample requirement; real runs substitute actual details and apply AI writing instructions.')}</p></div></div><p class="prop-hint">${_t('独立 AI 汇总所有节点的输出、验证信息和历史产物，提炼需求的整体成果。以上设置仅影响完成汇报，失败与待人工提醒始终使用标准消息。','Independent AI summarizes node outputs, checks, and artifacts. Only affects completion reports; failures and approvals always use standard messages.')}</p></details>`:''}`;
}
function mountSOPNotificationEditor(host,bindings,options,onChange){
 const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
 const revision=(host._notificationEditorRevision||0)+1;host._notificationEditorRevision=revision;
 const expanded=host.querySelector('[data-sop-notification-custom]')?.open;
 host.innerHTML=sopNotificationHTML(bindings,options);
 const details=host.querySelector('[data-sop-notification-custom]');if(details)details.open=!!expanded;
 const reload=()=>{if(host.isConnected&&host._notificationEditorRevision===revision)mountSOPNotificationEditor(host,bindings,options,onChange)};
 if(!nodeBotCache.has(options.projectId))loadNotificationBots(options.projectId).then(reload);
 host.querySelector('[data-notification-refresh]').onclick=()=>{nodeBotCache.delete(options.projectId);loadNotificationBots(options.projectId).then(reload)};
 host.querySelector('[data-notification-manage]').onclick=()=>switchView('bots');
 host.querySelector('[data-sop-notification-bot]').onchange=e=>{const old=bindings[0];bindings.splice(0,bindings.length,...(e.target.value?[{botId:e.target.value,scope:'run',events:['succeeded'],contentMode:'ai',template:old?.template||'',aiInstruction:old?.aiInstruction||''}]:[]));onChange();mountSOPNotificationEditor(host,bindings,options,onChange)};
 let timer=null,previewVersion=0;
 const preview=()=>{
  clearTimeout(timer);const version=++previewVersion;
  if(!details?.open||!bindings[0])return;
  const output=host.querySelector('[data-sop-notification-preview]');output.textContent=_t('正在更新示例…','Updating preview…');
  timer=setTimeout(async()=>{
   if(!host.isConnected||host._notificationEditorRevision!==revision)return;
   try{const result=await api('/api/notification-preview',{method:'POST',silent:true,body:JSON.stringify({projectId:options.projectId,binding:notificationPayload([bindings[0]])[0],sourceType:'run'})});
    if(host.isConnected&&host._notificationEditorRevision===revision&&version===previewVersion)output.innerHTML=renderMarkdown(result.content);
   }catch(e){if(host.isConnected&&host._notificationEditorRevision===revision&&version===previewVersion)output.textContent=e.message}
  },250);
 };
 details?.addEventListener('toggle',()=>{if(details.open)preview()});
 const area=host.querySelector('[data-sop-notification-template]');
 const update=()=>{bindings[0].template=area.value;bindings[0].contentMode='ai';onChange();preview()};
 area?.addEventListener('input',update);
 host.querySelectorAll('[data-sop-notification-field]').forEach(button=>button.onclick=()=>{const field=sopNotificationFieldData.find(f=>f[0]===button.dataset.sopNotificationField);area.focus();area.setRangeText(`{{${field[0]}}}`,area.selectionStart,area.selectionEnd,'end');update()});
 host.querySelector('[data-sop-notification-recommended]')?.addEventListener('click',()=>{area.value=getRecommendedSOPNotificationTemplate();area.focus();update()});
 host.querySelector('[data-sop-notification-instruction]')?.addEventListener('input',e=>{bindings[0].aiInstruction=e.target.value;bindings[0].contentMode='ai';onChange();preview()});
 if(expanded)preview();
}
function notificationBindingsHTML(bindings,options){
 const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
 const cached=nodeBotCache.get(options.projectId),bots=cached?.bots||[],task=options.sourceType!=='run',node=options.kind==='node',sop=options.kind==='sop';
 return `<div class="notification-config-head"><span>${task?_t('执行成功或失败后，通知 Bot 已绑定的聊天','Notify bound Bot chat after execution succeeds or fails'):node?_t('仅在需要介入时发送标准提醒','Sends standard alerts only when human action is required'):_t('整个 SOP 完成后，汇总所有节点的状态与结果','Summarizes all step statuses and results when the SOP finishes')}</span><button type="button" class="button ghost small" data-notification-refresh>${_t('刷新 Bot','Refresh Bots')}</button><button type="button" class="button ghost small" data-notification-manage>${_t('Bot 管理','Manage Bots')}</button></div>${cached?.error?`<p role="alert" class="notification-config-error">${escapeHTML(cached.error)}</p>`:''}${!cached?`<p class="prop-hint">${_t('正在获取本项目机器人…','Loading project Bots…')}</p>`:''}${(bindings||[]).map((binding,index)=>`<section class="notification-config-card" data-notification-index="${index}"><div class="notification-config-title"><b>${_t(`通知 ${index+1}`,`Notification ${index+1}`)}</b><button type="button" class="button ghost small danger" data-notification-remove>${_t('移除','Remove')}</button></div><label>${_t('通知 Bot','Notify Bot')}<select class="select" data-notification-bot><option value="">${_t('选择已绑定聊天的 Bot','Select a bound Bot')}</option>${binding.botId&&!bots.some(b=>b.id===binding.botId)?`<option value="${escapeHTML(binding.botId)}" selected>${_t('Bot 已删除或不可访问，请重新选择','Bot removed or unavailable, choose another')}</option>`:''}${bots.map(bot=>`<option value="${escapeHTML(bot.id)}" ${binding.botId===bot.id?'selected':''} ${!bot.enabled||!bot.target?'disabled':''}>${escapeHTML(bot.name)} · ${bot.target?`${bot.target.type==='group'?_t('群聊','Group'):_t('单聊','DM')}${_t('：',': ')}${escapeHTML(bot.target.name)}`:_t('未绑定聊天','Unbound chat')}${!bot.enabled?_t('（停用）',' (Disabled)'):''}</option>`).join('')}</select></label>${task?`<label>${_t('触发条件','Trigger events')}</label><div class="bot-trigger-options">${[['succeeded',_t('执行成功','Succeeded')],['failed',_t('执行失败','Failed')]].map(([value,label])=>`<label><input type="checkbox" data-notification-event="${value}" ${(binding.events||[]).includes(value)?'checked':''}>${label}</label>`).join('')}</div>`:''}<label>${_t('内容方式','Content mode')}<select class="select" data-notification-mode><option value="template" ${binding.contentMode!=='ai'?'selected':''}>${_t('自定义模板，可插入 AI 内容','Custom template (supports AI fields)')}</option><option value="ai" ${binding.contentMode==='ai'?'selected':''}>${_t('AI 编写整段通知','AI authors full notification')}</option></select></label><div class="notification-presets"><span>${_t('快速开始','Presets')}</span><button type="button" class="button ghost small" data-notification-preset="progress">${_t('简洁进展','Brief update')}</button><button type="button" class="button ghost small" data-notification-preset="complete">${_t('完成消息','Completion')}</button><button type="button" class="button ghost small" data-notification-preset="ai">${_t('AI 汇报','AI report')}</button></div><label>${binding.contentMode==='ai'?_t('消息结构（选填）','Message structure (optional)'):_t('消息模板','Message template')}<textarea class="input" rows="5" data-notification-template placeholder="${binding.contentMode==='ai'?_t('留空由 AI 编写标题和正文，也可用变量调整结构','Leave empty for AI-authored title & body, or use variables to structure it'):_t('自由编写标题和正文，例如：需求「{{issue.title}}」的流程已完成','Compose title & body, e.g. SOP for "{{issue.title}}" completed')}">${escapeHTML(binding.template||'')}</textarea></label><div class="notification-variable-buttons">${notificationVariables(options.sourceType).filter(name=>!sop||!['node','input','error'].includes(name)).map(name=>`<button type="button" data-notification-variable="${name}" title="${_t(`插入 {{${name}}}`,`Insert {{${name}}}`)}">{{${name}}}</button>`).join('')}</div>${notificationUsesAI(binding)?`<label>${_t('AI 编写要求','AI writing instructions')}<textarea class="input" rows="3" data-notification-instruction placeholder="${escapeHTML(getDefaultAIInstruction())}">${escapeHTML(binding.aiInstruction||'')}</textarea></label><p class="prop-hint">${sop?_t('汇总各节点生成的 AI 报告、执行状态和结果；未生成 AI 报告的节点使用执行结果。','Aggregates per-step AI reports, statuses, and results (falls back to step output if none).'):_t('复用定时任务的 AI 输出；未生成通知内容时使用执行结果或状态摘要。','Reuses scheduled task AI output, or execution summary if empty.')}${_t('重试不会重新调用 AI。',' Retries do not re-invoke AI.')}</p>`:''}<div class="notification-preview"><div><b>${_t('示例预览','Sample preview')}</b><small>${_t('不发送 · AI 部分为示例','Not sent · AI sections are samples')}</small></div><pre data-notification-preview>${_t('正在渲染预览…','Rendering preview…')}</pre></div></section>`).join('')}<button type="button" class="button ghost small" data-notification-add ${(bindings||[]).length>=3?'disabled':''}>${_t('＋ 添加 Bot 通知','+ Add Bot notification')}</button>`;
}
function mountNotificationEditor(host,bindings,options,onChange=()=>{}){
 const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
 if(!host)return;
 if(options.kind==='sop'){mountSOPNotificationEditor(host,bindings,options,onChange);return}
 const focused=host.querySelector('textarea:focus'),focusRow=focused?.closest('[data-notification-index]')?.dataset.notificationIndex,focusSelector=focused?.hasAttribute('data-notification-template')?'[data-notification-template]':'[data-notification-instruction]',selection=focused?[focused.selectionStart,focused.selectionEnd]:null;const editorRevision=(host._notificationEditorRevision||0)+1;host._notificationEditorRevision=editorRevision;
 const scrolling=host.closest('.prop-body,.schedule-config-pane,.ai-draft-body');const scrollTop=scrolling?.scrollTop;
 host.innerHTML=notificationBindingsHTML(bindings,options);
 if(scrolling&&scrollTop!==undefined)scrolling.scrollTop=scrollTop;if(selection&&focusRow!==undefined){const area=host.querySelector(`[data-notification-index="${focusRow}"] ${focusSelector}`);if(area){area.focus();area.setSelectionRange(...selection)}}
 if(!nodeBotCache.has(options.projectId))loadNotificationBots(options.projectId).then(()=>{if(host.isConnected&&host._notificationEditorRevision===editorRevision)mountNotificationEditor(host,bindings,options,onChange)});
 const render=()=>{onChange();mountNotificationEditor(host,bindings,options,onChange)};
 host.querySelector('[data-notification-refresh]').onclick=()=>{nodeBotCache.delete(options.projectId);loadNotificationBots(options.projectId).then(()=>{if(host.isConnected&&host._notificationEditorRevision===editorRevision)mountNotificationEditor(host,bindings,options,onChange)})};
 host.querySelector('[data-notification-manage]').onclick=()=>switchView('bots');
 host.querySelector('[data-notification-add]').onclick=()=>{if(bindings.length>=3)return;bindings.push({botId:'',events:options.kind==='sop'?['succeeded']:options.sourceType==='run'?['failed','waiting']:['succeeded','failed'],template:'',scope:options.kind==='sop'?'run':'node',contentMode:'template'});render()};
 host.querySelectorAll('[data-notification-index]').forEach(row=>{
  const index=Number(row.dataset.notificationIndex),binding=bindings[index];let timer=null,previewVersion=0;
  const preview=()=>{if(options.kind==='node')return;clearTimeout(timer);const version=++previewVersion;timer=setTimeout(async()=>{if(!row.isConnected)return;try{const result=await api('/api/notification-preview',{method:'POST',silent:true,body:JSON.stringify({projectId:options.projectId,binding:notificationPayload([binding])[0],sourceType:options.sourceType})});if(row.isConnected&&version===previewVersion)(row.querySelector('[data-notification-preview]')||{}).textContent=result.content}catch(e){if(row.isConnected&&version===previewVersion)(row.querySelector('[data-notification-preview]')||{}).textContent=e.message}},250)};
  row.querySelector('[data-notification-bot]').onchange=e=>{binding.botId=e.target.value;onChange();preview()};
  row.querySelector('[data-notification-scope]')?.addEventListener('change',e=>{binding.scope=e.target.value;if(binding.scope==='run'){binding.events=(binding.events||[]).filter(x=>x!=='waiting');if(!binding.events.length)binding.events=['succeeded']}render()});
  row.querySelectorAll('[data-notification-event]').forEach(el=>el.onchange=()=>{binding.events=[...row.querySelectorAll('[data-notification-event]:checked')].map(x=>x.dataset.notificationEvent);render()});
  row.querySelector('[data-notification-waiting-policy]')?.addEventListener('change',e=>{binding.waitingPolicy=e.target.value;onChange();preview()});
  row.querySelector('[data-notification-mode]')?.addEventListener('change',e=>{binding.contentMode=e.target.value;if(binding.contentMode==='ai'){binding.template='';binding.aiInstruction=binding.aiInstruction||getDefaultAIInstruction()}render()});
  row.querySelector('[data-notification-template]')?.addEventListener('input',e=>{const hadAI=!!row.querySelector('[data-notification-instruction]');binding.template=e.target.value;onChange();preview();if(notificationUsesAI(binding)&&!hadAI){binding.aiInstruction=binding.aiInstruction||getDefaultAIInstruction();mountNotificationEditor(host,bindings,options,onChange)}});
  row.querySelector('[data-notification-instruction]')?.addEventListener('input',e=>{binding.aiInstruction=e.target.value;onChange();preview()});
  row.querySelectorAll('[data-notification-variable]').forEach(button=>button.onclick=()=>{const area=row.querySelector('[data-notification-template]');area.focus();area.setRangeText(`{{${button.dataset.notificationVariable}}}`,area.selectionStart,area.selectionEnd,'end');binding.template=area.value;onChange();if(notificationUsesAI(binding)&&!row.querySelector('[data-notification-instruction]'))render();else preview()});
  row.querySelectorAll('[data-notification-preset]').forEach(button=>button.onclick=()=>{
   const preset=button.dataset.notificationPreset;
   if(preset==='ai'){binding.contentMode='ai';binding.template='';binding.aiInstruction=getDefaultAIInstruction()}
   else if(preset==='complete'){binding.contentMode='template';binding.events=['succeeded'];if(options.sourceType==='run')binding.scope='run';binding.template=options.sourceType==='run'?_t('### 需求「{{issue.title}}」的 SOP 已完成\n\n{{ai.summary}}\n\n{{url}}','### SOP for "{{issue.title}}" completed\n\n{{ai.summary}}\n\n{{url}}'):_t('### {{task.name}} 已完成\n\n{{ai.summary}}\n\n{{url}}','### {{task.name}} completed\n\n{{ai.summary}}\n\n{{url}}');binding.aiInstruction=getDefaultAIInstruction()}
   else{binding.contentMode='template';binding.aiInstruction='';binding.template=options.sourceType==='run'?_t('### 需求「{{issue.title}}」的 SOP 已完成\n\n{{result}}\n\n{{url}}','### SOP for "{{issue.title}}" completed\n\n{{result}}\n\n{{url}}'):'### {{task.name}} · {{status}}\n{{url}}'}
   render();
  });
  row.querySelector('[data-notification-remove]').onclick=()=>{bindings.splice(index,1);render()};preview();
 });
}
