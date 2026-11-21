// AI 助手设置：生成中消息的发送方式、主动派发与每轮自定义规则。只对当前用户生效。
const ASSISTANT_RULES_MAX=4000;
const assistantPrefsUI={saved:null,loading:false,saving:false,error:''};

function assistantPrefsSignedIn(){return !!state.currentUser&&!state.currentUser.isGuest}
function assistantPrefsForm(){return document.querySelector('#assistantPrefsForm')}
function assistantPrefsDraft(form){return {proactiveRoles:form.proactiveRoles.checked,proactiveSops:form.proactiveSops.checked,steerOnSend:form.messageDuringGeneration.value==='steer',instructions:form.instructions.value.trim()}}
function assistantPrefsDirty(form){
 const saved=assistantPrefsUI.saved;if(!saved||!form)return false;
 const draft=assistantPrefsDraft(form);
 return draft.proactiveRoles!==!!saved.proactiveRoles||draft.proactiveSops!==!!saved.proactiveSops||draft.steerOnSend!==!!saved.steerOnSend||draft.instructions!==(saved.instructions||'');
}
function assistantPrefsSwitchRow(name,title,help,on){
 return `<label class="asst-switch-row"><span><b>${title}</b><small>${help}</small></span><input type="checkbox" role="switch" name="${name}" ${on?'checked':''}></label>`;
}
function assistantPrefsFormHTML(p){
 const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
 const rules=p.instructions||'';
 return `<form id="assistantPrefsForm" class="asst-form" novalidate><fieldset ${assistantPrefsUI.saving?'disabled':''}>
  <section class="asst-panel"><header class="asst-panel-head"><h2>${_t('消息发送','Message sending')}</h2></header>
   <div class="asst-rows"><label class="asst-switch-row" for="assistantPrefsMessageDuringGeneration"><span><b>${_t('生成中发送消息','Send during generation')}</b><small>${_t('排队会等当前回复结束；立即发送会打断当前回复，保留已输出内容并继续处理新消息。','Queue waits for the current reply to finish; Send now interrupts it, keeps what was already generated, and processes the new message.')}</small></span>
    <select id="assistantPrefsMessageDuringGeneration" class="input" name="messageDuringGeneration"><option value="queue" ${p.steerOnSend?'':'selected'}>${_t('排队','Queue')}</option><option value="steer" ${p.steerOnSend?'selected':''}>${_t('立即发送','Send now')}</option></select>
   </label></div></section>
  <section class="asst-panel"><header class="asst-panel-head"><h2>${_t('主动派发','Proactive dispatch')}</h2><p>${_t('打开后 AI 助手会更主动地把事情交给角色或 SOP。派角色不需要确认；走 SOP 仍按审批模式先征求同意，完全权限下直接启动。','When enabled, the assistant delegates tasks to Roles or SOPs more proactively. Role delegation runs without confirmation; SOPs follow approval mode unless in full-access mode.')}</p></header>
   <div class="asst-rows">
    ${assistantPrefsSwitchRow('proactiveRoles',_t('主动派角色','Proactive Role delegation'),_t('整件事是某个角色的本职（如独立评审、整套测试），或改了高风险代码需要复核时，直接交给这个角色。','Delegate directly when a task clearly belongs to a Role (e.g. independent review, full test suite) or high-risk edits need review.'),p.proactiveRoles)}
    ${assistantPrefsSwitchRow('proactiveSops',_t('主动走 SOP','Proactive SOP dispatch'),_t('遇到要落到仓库的新需求时，先交给项目里用途对得上的 SOP，而不是自己直接改代码。','Route new repository changes to a matching project SOP instead of editing code directly.'),p.proactiveSops)}
   </div></section>
  <section class="asst-panel"><header class="asst-panel-head"><h2>${_t('自定义规则','Custom instructions')}</h2><p>${_t('每轮对话都会带上这些规则，适合写你的习惯和偏好；不会越过审批模式和平台规则。','Included in every turn for your habits and preferences; never overrides approval mode or platform rules.')}</p></header>
   <label class="asst-rules-label" for="assistantPrefsRules">${_t('规则','Rules')}</label>
   <textarea id="assistantPrefsRules" class="input asst-rules" name="instructions" rows="8" maxlength="${ASSISTANT_RULES_MAX}" placeholder="${_t('例如：回复先给结论再给细节；改代码前先说明要改哪些文件；不要自动发起 MR。','e.g. Start replies with the conclusion; list files before editing; do not open MRs automatically.')}">${escapeHTML(rules)}</textarea>
   <div class="asst-rules-foot"><span id="assistantPrefsCount" class="asst-count">${rules.length} / ${ASSISTANT_RULES_MAX}</span></div></section>
  <div class="asst-actions"><button type="submit" class="button primary" id="assistantPrefsSave" disabled>${assistantPrefsUI.saving?_t('保存中…','Saving…'):_t('保存','Save')}</button></div>
 </fieldset></form>`;
}
function renderAssistantSettings(){
 const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
 const host=document.querySelector('#assistantContent');if(!host)return;
 if(!assistantPrefsSignedIn()){host.innerHTML=`<section class="asst-panel asst-empty"><p>${_t('登录后可以设置 AI 助手。','Sign in to configure the AI assistant.')}</p></section>`;return}
 if(assistantPrefsUI.error&&!assistantPrefsUI.saved){host.innerHTML=`<section class="asst-panel asst-empty"><p>${escapeHTML(assistantPrefsUI.error)}</p><button type="button" class="button" data-assistant-prefs-retry>${_t('重试','Retry')}</button></section>`;host.querySelector('[data-assistant-prefs-retry]').onclick=loadAssistantSettings;return}
 if(!assistantPrefsUI.saved){host.innerHTML=`<section class="asst-panel asst-empty"><p>${_t('正在读取设置…','Loading settings…')}</p></section>`;return}
 host.innerHTML=assistantPrefsFormHTML(assistantPrefsUI.saved);
 const form=assistantPrefsForm(),save=form.querySelector('#assistantPrefsSave'),count=form.querySelector('#assistantPrefsCount');
 const refresh=()=>{count.textContent=`${form.instructions.value.length} / ${ASSISTANT_RULES_MAX}`;save.disabled=assistantPrefsUI.saving||!assistantPrefsDirty(form)};
 form.addEventListener('input',refresh);
 form.addEventListener('change',refresh);
 form.onsubmit=async event=>{
  event.preventDefault();
  if(assistantPrefsUI.saving||!assistantPrefsDirty(form))return;
  const draft=assistantPrefsDraft(form);
  assistantPrefsUI.saving=true;save.disabled=true;save.textContent=_t('保存中…','Saving…');
  try{
   assistantPrefsUI.saved=await api('/api/assistant/preferences',{method:'PUT',body:JSON.stringify(draft)});
   document.querySelector('#chatNextFrame')?.contentWindow?.postMessage({type:'agentflow-assistant-preferences-changed'},location.origin);
   toast(_t('AI 助手设置已保存','AI assistant settings saved'));
  }catch(err){toast(err.message||_t('保存失败，请重试','Save failed, please try again'))}
  finally{assistantPrefsUI.saving=false;save.textContent=_t('保存','Save');refresh()}
 };
}
async function loadAssistantSettings(){
 if(!assistantPrefsSignedIn()){renderAssistantSettings();return}
 if(assistantPrefsUI.loading)return;
 const form=assistantPrefsForm();
 if(form&&assistantPrefsDirty(form))return;
 assistantPrefsUI.loading=true;assistantPrefsUI.error='';
 if(!assistantPrefsUI.saved)renderAssistantSettings();
 try{assistantPrefsUI.saved=await api('/api/assistant/preferences',{silent:true})}
 catch(err){assistantPrefsUI.error=err.message||(typeof lfT==='function'?lfT('读取设置失败','Failed to load settings'):'Failed to load settings')}
 finally{assistantPrefsUI.loading=false;renderAssistantSettings()}
}
