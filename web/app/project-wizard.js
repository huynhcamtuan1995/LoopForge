// New-project wizard: a modal over the project list, laid out like the workbench quick-access wizard
// (chatbot/src/QuickAccessWizard.jsx). Step 1 creates the project; later steps edit the saved project
// and can be skipped. Progress lives only in memory.
const PROJECT_WIZARD_STEPS=[
  {id:'basic',title:'基本信息',enTitle:'Basic info',desc:'名称与默认 SOP',enDesc:'Name & default SOP'},
  {id:'repos',title:'代码仓库',enTitle:'Repositories',desc:'绑定 GitHub 仓库',enDesc:'Bind GitHub repos'},
  {id:'members',title:'项目成员',enTitle:'Members',desc:'Owner 与协作成员',enDesc:'Owner & collaborators'},
  {id:'tapd',title:'TAPD 集成',enTitle:'TAPD integration',desc:'可选，导入 TAPD 需求',enDesc:'Optional, import TAPD issues'},
  {id:'done',title:'完成',enTitle:'Done',desc:'开始使用新项目',enDesc:'Start using your project'},
];
function projectWizardSteps(){return PROJECT_WIZARD_STEPS.filter(s=>s.id!=='tapd'||tapdIntegrationAvailable(projectWizardProject()))}
const PW_ICON_PATHS={
  check:'<path d="M5 12.5 10 17 19 7"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  warn:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  gear:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  next:'<path d="m9 6 6 6-6 6"/>',
  flag:'<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  back:'<path d="m15 6-6 6 6 6"/>',
  repo:'<circle cx="6" cy="6" r="2.3"/><circle cx="6" cy="18" r="2.3"/><circle cx="18" cy="8" r="2.3"/><path d="M6 8.3v7.4M18 10.3c0 3.4-4.5 3.6-9.8 6"/>',
};
function pwIcon(name,size=14,width=2){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PW_ICON_PATHS[name]||''}</svg>`}

let projectWizard=null;
function projectWizardStepIndex(step){return projectWizardSteps().findIndex(s=>s.id===step)}
function projectWizardProject(){const id=projectWizard?.projectId;return id?(state.data.projects||[]).find(p=>p.id===id)||null:null}
function projectWizardRepos(){const id=projectWizard?.projectId;return id?(state.data.repositories||[]).filter(r=>r.projectId===id):[]}
function blankProjectWizardRepo(){return {url:'',branch:'main',integrate:''}}

function openProjectWizard(){
  if(projectWizard){focusProjectWizard();return}
  const draft=blankProjectDraft();
  projectWizard={step:'basic',projectId:'',draft,base:clone(draft),done:{},skipped:{},saving:false,error:'',focus:'name',
    seed:Math.random().toString(36).slice(2,6),repo:blankProjectWizardRepo(),returnFocus:document.activeElement||null,hash:location.hash};
  renderProjectWizard();
}
function projectWizardDirty(){
  const w=projectWizard;if(!w||w.step==='done')return false;
  if(w.step==='repos')return !!String(w.repo.url||'').trim();
  return projectDraftDirty(w.draft,w.base);
}
function projectWizardConfirmDiscard(message){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!projectWizardDirty())return Promise.resolve(true);
  return afConfirm({title:_t('放弃未保存的修改？','Discard unsaved changes?'),message,danger:true,confirmText:_t('放弃修改','Discard'),cancelText:_t('继续编辑','Keep editing')});
}
function projectWizardMark(step,done){
  const w=projectWizard;
  if(done){w.done[step]=true;delete w.skipped[step]}else{w.skipped[step]=true;delete w.done[step]}
}
function projectWizardEnter(step){
  const w=projectWizard;if(!w)return;
  w.step=step;w.error='';w.focus='title';w.repo=blankProjectWizardRepo();
  const project=projectWizardProject();
  if(project&&(step==='members'||step==='tapd')){w.draft=projectDraftFrom(project);w.base=clone(w.draft)}
  if(step==='done')w.done.done=true;
  renderProjectWizard();
}
async function closeProjectWizard(opt={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard;if(!w||w.saving)return false;
  if(!opt.force&&!(await projectWizardConfirmDiscard(w.step==='basic'?_t('新项目还没有创建，关闭后填写的内容会丢失。','The project has not been created yet. Closing will discard your input.'):_t('项目已创建并保留，但本步骤未保存的修改会丢失。','The project is saved, but unsaved changes in this step will be lost.'))))return false;
  if(projectWizard!==w)return false;
  projectWizard=null;
  $('#projectWizard')?.remove?.();
  document.body?.classList?.remove('pw-open');
  if(parseProjectAdminRoute(location.hash)?.id==='new')history.replaceState(null,'',projectAdminHash(''));
  if(activeViewName()==='projects')renderProjectAdmin();
  const back=w.returnFocus;
  if(!opt.noFocus&&back&&document.contains(back))back.focus?.();
  return true;
}
// Runs one save request with the footer locked; failures land in the error banner.
async function projectWizardRequest(run,prefix=''){
  const w=projectWizard;if(!w||w.saving)return null;
  w.saving=true;w.error='';renderProjectWizard();
  try{return await run()}
  catch(err){if(projectWizard===w)w.error=prefix+(err?.message||String(err));return null}
  finally{w.saving=false;if(projectWizard===w)renderProjectWizard()}
}
function projectWizardFail(message,focus=''){
  const w=projectWizard;w.error=message;w.focus=focus;renderProjectWizard();return false;
}

async function projectWizardCreate(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard,d=w.draft,projects=state.data.projects||[];
  const ident=generateProjectIdentity(d.name,projects,w.seed);
  const value=buildProjectPayload(clone(d),{id:ident.id,key:ident.key,defaultRepositoryId:''});
  const invalid=validateProjectPayload(value,{creating:true,projects,workflows:state.data.workflows||[]});
  if(invalid)return projectWizardFail(invalid.field==='id'||invalid.field==='key'?_t('无法根据名称生成可用的项目标识，请换个名称重试','Could not generate a valid project ID from the name; please try another name'):invalid.message,['name','workflowId','ownerId'].includes(invalid.field)?invalid.field:'');
  const stored=await projectWizardRequest(async()=>{
    const result=await api('/api/projects',{method:'POST',body:JSON.stringify(value)});
    return storeSavedProject(result,value);
  },_t('创建失败，可修改项目名称后重试：','Creation failed; try changing the project name: '));
  if(!stored||projectWizard!==w)return false;
  w.projectId=stored.id||value.id;
  if(!state.projectFilter){state.projectFilter=w.projectId;localStorage.setItem('agentflow.activeProject',w.projectId)}
  projectWizardMark('basic',true);
  renderAll();
  toast(_t(`项目已创建 · 标识 ${w.projectId} · Key ${stored.key||value.key}`,`Project created · ID ${w.projectId} · Key ${stored.key||value.key}`),'ok');
  projectWizardEnter('repos');
  return true;
}
async function projectWizardAddRepo(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard,project=projectWizardProject();if(!w||w.saving||!project)return false;
  const url=String(w.repo.url||'').trim(),info=parseGongfengRepoURL(url);
  if(!info)return projectWizardFail(url?_t('请输入 GitHub 链接或有效的 Git SSH 地址。CNB 只支持 HTTPS + 访问令牌。','Enter a GitHub URL or valid Git SSH address. CNB only supports HTTPS + access token.'):_t('请先粘贴 GitHub 链接或 Git SSH 地址','Paste a GitHub URL or Git SSH address first'),'repoUrl');
  if(projectWizardRepos().some(r=>info.provider==='ssh'?r.cloneUrl===info.cloneUrl:r.gongfengProjectId===info.project))return projectWizardFail(_t(`仓库 ${info.project} 已经绑定到这个项目`,`Repository ${info.project} is already bound to this project`),'repoUrl');
  const payload={projectId:project.id,provider:info.provider||'gongfeng',name:info.name,gongfengProjectId:info.project,webUrl:info.webUrl,cloneUrl:info.cloneUrl,defaultBranch:String(w.repo.branch||'').trim()||'main',integrateBranch:String(w.repo.integrate||'').trim(),localPath:'',repoUrl:url};
  const makeDefault=projectNeedsDefaultRepository(project);
  let defaultError='';
  const repo=await projectWizardRequest(async()=>{
    const saved=await api('/api/repositories',{method:'POST',body:JSON.stringify(payload)});
    const list=state.data.repositories||(state.data.repositories=[]),ri=list.findIndex(r=>r.id===saved.id);
    if(ri>=0)list[ri]=saved;else list.push(saved);
    if(makeDefault){try{await saveProjectDefaultRepository(project,saved.id)}catch(err){defaultError=_t('仓库已保存，设为默认失败：','Repository saved, failed to set as default: ')+err.message}}
    return saved;
  });
  if(!repo||projectWizard!==w)return false;
  w.repo=blankProjectWizardRepo();w.focus='repoUrl';
  renderAll();renderProjectWizard();
  toast(defaultError||(makeDefault?_t('仓库已保存，并设为默认仓库','Repository saved and set as default'):_t('仓库已保存','Repository saved')),defaultError?'err':'ok');
  return true;
}
async function projectWizardRemoveRepo(repoId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard,project=projectWizardProject(),repo=projectWizardRepos().find(r=>r.id===repoId);
  if(!w||w.saving||!project||!repo)return false;
  const name=repo.name||repo.gongfengProjectId||repo.id,isDefault=project.defaultRepositoryId===repo.id;
  const confirmed=await afConfirm({title:_t('移除仓库','Remove repository'),message:_t(`确定移除仓库「${name}」吗？${isDefault?'\n\n这是当前的默认仓库，移除后会把剩余的第一个仓库设为默认。':''}`,`Remove repository "${name}"?${isDefault?'\n\nThis is the current default repository. Removing it will set the next remaining repository as default.':''}`),danger:true,confirmText:_t('移除','Remove'),cancelText:_t('取消','Cancel')});
  if(!confirmed||projectWizard!==w)return false;
  let notice=_t(`已移除仓库「${name}」`,`Removed repository "${name}"`),tone='ok';
  const ok=await projectWizardRequest(async()=>{
    await api('/api/repositories?id='+encodeURIComponent(repo.id),{method:'DELETE'});
    state.data.repositories=(state.data.repositories||[]).filter(r=>r.id!==repo.id);
    if(isDefault){
      project.defaultRepositoryId='';
      const next=projectWizardRepos()[0];
      if(next){
        try{await saveProjectDefaultRepository(project,next.id);notice+=_t(`，已将「${next.name||next.gongfengProjectId||next.id}」设为默认仓库`,`; "${next.name||next.gongfengProjectId||next.id}" is now the default repository`)}
        catch(err){notice+=_t('，设置新的默认仓库失败：','; failed to set new default repository: ')+err.message;tone='err'}
      }
    }
    return true;
  });
  if(!ok)return false;
  renderAll();toast(notice,tone);
  return true;
}
async function projectWizardSaveProject(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard,saved=projectWizardProject();
  if(!saved)return projectWizardFail(_t('项目不存在或无权访问','Project not found or access denied'));
  const d=w.draft,fields=w.step==='members'?{ownerId:d.ownerId,members:d.members}:{tapdWorkspaceId:d.tapdWorkspaceId,tapdIterationId:d.tapdIterationId};
  const value=buildProjectPayload(clone(saved),fields);
  const invalid=validateProjectPayload(value,{creating:false,projects:state.data.projects||[],workflows:state.data.workflows||[],saved});
  if(invalid)return projectWizardFail(invalid.message);
  const stored=await projectWizardRequest(async()=>storeSavedProject(await api('/api/projects',{method:'PUT',body:JSON.stringify(value)}),value));
  if(stored)renderAll();
  return !!stored;
}
async function projectWizardNext(){
  const w=projectWizard;if(!w||w.saving)return;
  if(w.step==='basic')return projectWizardCreate();
  if(w.step==='repos'){
    if(String(w.repo.url||'').trim()&&!(await projectWizardAddRepo()))return;
    projectWizardMark('repos',projectWizardRepos().length>0);
    return projectWizardEnter('members');
  }
  if(w.step!=='members'&&w.step!=='tapd')return;
  const changed=projectWizardDirty();
  if(changed&&!(await projectWizardSaveProject()))return;
  if(projectWizard!==w)return;
  const p=projectWizardProject()||{};
  if(w.step==='members'){
    projectWizardMark('members',changed||(p.members||[]).some(m=>Number(m.userId)!==Number(p.ownerId)));
    return projectWizardEnter(projectWizardStepIndex('tapd')>=0?'tapd':'done');
  }
  projectWizardMark('tapd',!!(p.tapdWorkspaceId||p.tapdIterationId));
  return projectWizardEnter('done');
}
async function projectWizardSkip(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard;if(!w||w.saving||!['repos','members','tapd'].includes(w.step))return;
  if(!(await projectWizardConfirmDiscard(_t('跳过会放弃本步骤未保存的修改。','Skipping will discard unsaved changes in this step.')))||projectWizard!==w)return;
  const step=w.step;
  projectWizardMark(step,step==='repos'&&projectWizardRepos().length>0);
  projectWizardEnter(projectWizardSteps()[projectWizardStepIndex(step)+1].id);
}
async function projectWizardBack(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard;if(!w||w.saving||!['members','tapd'].includes(w.step))return;
  if(!(await projectWizardConfirmDiscard(_t('返回上一步会放弃本步骤未保存的修改。','Going back will discard unsaved changes in this step.')))||projectWizard!==w)return;
  projectWizardEnter(projectWizardSteps()[projectWizardStepIndex(w.step)-1].id);
}
async function projectWizardStartIssues(){
  const id=projectWizard?.projectId;if(!id)return;
  await closeProjectWizard({force:true,noFocus:true});
  const switcher=$('#projectSwitcher');
  if(switcher){renderProjectSwitcher();switcher.value=id;switcher.dispatchEvent(new Event('change',{bubbles:true}))}
  else{state.projectFilter=id;localStorage.setItem('agentflow.activeProject',id)}
  switchView('issues');
}
async function projectWizardOpenSettings(){
  const id=projectWizard?.projectId;if(!id)return;
  await closeProjectWizard({force:true,noFocus:true});
  openProjectAdminDetail(id);
}
function projectWizardAddMember(){
  const w=projectWizard;if(!w||w.saving||w.step!=='members')return;
  w.draft.members.push({userId:0,role:'member'});w.error='';
  renderProjectWizard();
  setTimeout(()=>[...($('#projectWizard')?.querySelectorAll('[data-pw-member] [data-user-combobox-trigger]')||[])].pop()?.click(),0);
}
function projectWizardRemoveMember(index){
  const w=projectWizard;if(!w||w.saving||w.step!=='members')return;
  w.draft.members.splice(index,1);w.error='';renderProjectWizard();
}

// Rendering.
function pwCard(title,desc,pill,body){return `<section class="pw-card"><header class="pw-card-h"><div><strong>${title}</strong><span>${desc}</span></div>${pill}</header><div class="pw-card-b">${body}</div></section>`}
function pwPill(text,tone='',attrs=''){return `<span class="pw-pill${tone?' is-'+tone:''}"${attrs}>${text}</span>`}
function pwField(label,control,opt={}){return `<div class="pw-field"><label class="pw-label"${opt.for?` for="${opt.for}"`:''}>${label}${opt.required?' <em>*</em>':''}</label>${control}${opt.hint!=null?`<div class="pw-hint"${opt.hintAttrs||''}>${opt.hint}</div>`:''}</div>`}
function pwSelect(html){return html.replace(' id="projectBusinessDomainSelect"','').replace('class="select"','class="pw-input pw-select"')}
function projectWizardRailHTML(w){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const cur=projectWizardStepIndex(w.step);
  const steps=projectWizardSteps().map((s,i)=>{
    const active=i===cur,done=!active&&!!w.done[s.id],skipped=!active&&!done&&!!w.skipped[s.id];
    return `<li class="pw-step${active?' is-active':''}${done?' is-done':''}${skipped?' is-skipped':''}"${active?' aria-current="step"':''}><span class="pw-step-mark">${done?pwIcon('check',13,2.6):s.id==='done'?pwIcon('flag',13,2.2):i+1}</span><div class="pw-step-copy"><div class="pw-step-title">${_t(s.title,s.enTitle)}</div><div class="pw-step-desc">${skipped?_t('<i>已跳过</i> · 可在项目设置补充','<i>Skipped</i> · Configure in project settings'):_t(s.desc,s.enDesc)}</div></div></li>`;
  }).join('');
  return `<aside class="pw-rail"><div class="pw-rail-head"><div class="pw-brand">${pwIcon('folder',20,1.9)}</div><h2 id="projectWizardLabel">${_t('新建项目','New project')}</h2><p>${_t('只需名称即可创建，再按步骤绑定仓库、邀请成员。','Just a name to create, then bind repos and invite members.')}</p></div><ol class="pw-steps">${steps}</ol><p class="pw-rail-foot">${_t('所有配置之后都能在项目设置里修改。','All settings can be changed later in project settings.')}</p></aside>`;
}
function projectWizardHeadHTML(w,title,lede){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return `<div class="pw-kicker">${_t(`第 ${projectWizardStepIndex(w.step)+1} 步，共 ${projectWizardSteps().length-1} 步`,`Step ${projectWizardStepIndex(w.step)+1} of ${projectWizardSteps().length-1}`)}</div><h3 class="pw-title" id="projectWizardTitle" tabindex="-1">${title}</h3><p class="pw-lede">${lede}</p>${w.error?`<p class="pw-note is-err" role="alert">${escapeHTML(w.error)}</p>`:''}`;
}
function projectWizardNamePill(name){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const filled=!!String(name||'').trim();return pwPill(filled?_t('已填写','Filled'):_t('必填','Required'),filled?'ok':'need',' data-pw-name-pill')}
function projectWizardBasicHTML(w){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const d=w.draft,color=String(safeColor(d.color)).toLowerCase();
  const swatches=`<div class="pw-swatches" role="group" aria-label="${_t('品牌色','Brand color')}">${PROJECT_SWATCHES.map(c=>`<button type="button" class="pw-sw${c===color?' is-on':''}" data-pw-color="${c}" style="background:${c};color:${c}" aria-label="${_t(`品牌色 ${c}`,`Brand color ${c}`)}" aria-pressed="${c===color}"></button>`).join('')}</div>`;
  const identity=pwCard(_t('项目身份','Project identity'),_t('项目在工作台、需求和通知里的显示方式','How the project appears in the workbench, issues, and notifications'),projectWizardNamePill(d.name),
    pwField(_t('项目名称','Project name'),`<input class="pw-input" id="pwName" name="name" value="${escapeHTML(d.name||'')}" maxlength="80" placeholder="${_t('例如 Web Console','e.g. Web Console')}" autocomplete="off">`,{for:'pwName',required:true})
    +pwField(_t('品牌色','Brand color'),swatches)
    +pwField(_t('项目说明','Description'),`<textarea class="pw-input" id="pwDescription" name="description" rows="3" placeholder="${_t('可选，这个项目负责什么？Agent 会把它作为上下文。','Optional. What does this project do? Agents will use this as context.')}">${escapeHTML(d.description||'')}</textarea>`,{for:'pwDescription'}));
  const owner=Number(state.currentUser?.id)?'':pwField(_t('项目 Owner','Project Owner'),userCombobox('ownerId',d.ownerId,_t('请选择项目 Owner','Select project Owner')),{required:true,hint:_t('项目的默认责任人，创建后可在项目成员中调整。','Default assignee for the project; can be changed later in project members.')});
  const defaults=pwCard(_t('默认设置','Default settings'),_t('新建需求时自动带上的流程','Default workflow applied to new issues'),pwPill(_t('已预选','Preselected'),'ok'),
    `${pwField(_t('默认 SOP','Default SOP'),pwSelect(projectDefaultSOPField(d)),{required:true})}${owner}`);
  return projectWizardHeadHTML(w,_t('基本信息','Basic info'),_t('只需填写项目名称即可创建，其余都有默认值。','Only a project name is required; everything else has defaults.'))+`<div class="pw-pane">${identity}${defaults}</div>`;
}
function projectWizardRepoHint(url){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const raw=String(url||'').trim(),info=raw?parseGongfengRepoURL(raw):null;
  if(!raw)return _t('例如 https://github.com/owner/repo 或 git@gitlab.com:group/repo.git','e.g. https://github.com/owner/repo or git@gitlab.com:group/repo.git');
  if(info?.provider==='ssh')return _t(`识别为 Git SSH · <b>${escapeHTML(info.name)}</b>。请平台管理员在「平台管理 → Git SSH 主机信任」登记主机公钥，并在个人配置中添加 Git SSH 密钥。`,`Detected Git SSH · <b>${escapeHTML(info.name)}</b>. Ask a platform admin to register the host public key in "Platform Admin → Git SSH Host Trust", and add a Git SSH key in your personal settings.`);
  return info?_t(`识别为 <b>${escapeHTML(info.name)}</b> · ${escapeHTML(repoDisplayPath(info,info.project))}`,`Detected <b>${escapeHTML(info.name)}</b> · ${escapeHTML(repoDisplayPath(info,info.project))}`):_t('请输入 GitHub 链接或 Git SSH 地址','Enter a GitHub URL or Git SSH address');
}
function projectWizardReposHTML(w){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const project=projectWizardProject()||{},repos=projectWizardRepos();
  const list=repos.map(r=>{const path=r.cloneUrl||r.gongfengProjectId||'',name=r.name||path||r.id,shown=repoDisplayPath(parseGongfengRepoURL(r.provider==='ssh'?r.cloneUrl:r.webUrl||path),path);return `<div class="pw-repo" data-pw-repo="${escapeHTML(r.id)}"><span class="pw-repo-ic">${pwIcon('repo',14,1.9)}</span><b title="${escapeHTML(name)}">${escapeHTML(name)}</b><code title="${escapeHTML(shown)}">${escapeHTML(shown)}</code><small>${escapeHTML(r.defaultBranch||'main')}</small>${r.integrateBranch?`<small title="${_t('集成分支','Integration branch')}">${escapeHTML(r.integrateBranch)}</small>`:''}${r.id===project.defaultRepositoryId?`<small class="is-def">${_t('默认','Default')}</small>`:''}<button type="button" class="pw-repo-rm" data-pw-repo-remove="${escapeHTML(r.id)}" title="${_t('移除','Remove')}" aria-label="${_t(`移除仓库 ${escapeHTML(name)}`,`Remove repository ${escapeHTML(name)}`)}">${pwIcon('x',14)}</button></div>`}).join('');
  const body=(list?`<div class="pw-repo-list">${list}</div>`:'')
    +'<div data-github-repositories></div>'
    +pwField(_t('GitHub 链接或 Git SSH 地址','GitHub URL or Git SSH address'),`<input class="pw-input pw-mono" id="pwRepoUrl" name="repoUrl" value="${escapeHTML(w.repo.url)}" placeholder="https://github.com/owner/repo" spellcheck="false" autocomplete="off">`,{for:'pwRepoUrl',hint:projectWizardRepoHint(w.repo.url),hintAttrs:' data-pw-repo-hint'})
    +`<div class="pw-row2">${pwField(_t('主分支','Main branch'),`<input class="pw-input pw-mono" id="pwRepoBranch" name="repoBranch" value="${escapeHTML(w.repo.branch)}" placeholder="main" spellcheck="false">`,{for:'pwRepoBranch'})}${pwField(_t('集成分支','Integration branch'),`<input class="pw-input pw-mono" id="pwRepoIntegrate" name="repoIntegrate" value="${escapeHTML(w.repo.integrate)}" placeholder="${_t('可选','Optional')}" spellcheck="false">`,{for:'pwRepoIntegrate'})}</div>`
    +`<div><button type="button" class="pw-btn pw-btn-outline pw-btn-sm" data-pw-action="add-repo"${w.saving?' disabled':''}>${_t('＋ 添加仓库','+ Add repository')}</button></div>`;
  return projectWizardHeadHTML(w,_t('代码仓库','Repositories'),_t('Agent 执行 SOP 时会克隆这些仓库并在工作分支上提交。第一个仓库会自动设为默认。','Agents clone these repositories and commit on working branches when running SOPs. The first repository is set as default.'))
    +`<div class="pw-pane"><p class="pw-note is-ok">${_t(`✓ 项目「${escapeHTML(project.name||'')}」已创建。仓库添加后立即生效，也可以先跳过。`,`✓ Project "${escapeHTML(project.name||'')}" created. Repositories take effect immediately, or you can skip for now.`)}</p>${pwCard(_t('绑定代码仓库','Bind repository'),_t('粘贴仓库地址，自动识别名称','Paste a repository URL to auto-detect its name'),pwPill(repos.length?_t(`已绑定 ${repos.length} 个`,`${repos.length} bound`):_t('未绑定','None bound'),repos.length?'ok':''),body)}</div>`;
}
function projectWizardPeoplePill(d){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const count=projectPeopleIds(d).length;return pwPill(_t(`${count} 位`,`${count}`),count>1?'ok':'',' data-pw-people-pill')}
function projectWizardMembersHTML(w){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const d=w.draft,owner=userById(d.ownerId);
  const rows=(d.members||[]).map((m,i)=>`<div class="member-row pw-member" data-pw-member="${i}"><span class="member-avatar">${userAvatarHTML(userById(m.userId),48)}</span><span class="pw-member-kind">${_t('成员','Member')}</span>${userCombobox(`member-${i}`,m.userId,_t('请选择项目成员','Select project member'))}<button type="button" class="pw-member-rm" data-pw-member-remove="${i}" title="${_t('移除成员','Remove member')}" aria-label="${_t('移除成员','Remove member')}">${pwIcon('x',14)}</button></div>`).join('');
  const body=`<div class="member-row pw-member is-owner"><span class="member-avatar owner">${userAvatarHTML(owner,48)}</span><span class="pw-member-kind is-owner">Owner</span>${userCombobox('ownerId',d.ownerId,_t('请选择项目 Owner','Select project Owner'))}<span></span></div>${rows}<div><button type="button" class="pw-btn pw-btn-outline pw-btn-sm" data-pw-action="add-member"${w.saving?' disabled':''}>${_t('＋ 添加成员','+ Add member')}</button></div>`;
  return projectWizardHeadHTML(w,_t('项目成员','Project members'),_t('Owner 是项目的默认责任人；成员无需设置角色，可查看和推进项目内所有需求。','The Owner is the default assignee; members have no separate role and can view and advance all project issues.'))
    +`<div class="pw-pane">${pwCard(_t('负责人与成员','Owner & members'),_t('保存后成员即可在工作台切换到该项目','Once saved, members can switch to this project in the workbench'),projectWizardPeoplePill(d),body)}</div>`;
}
function projectWizardTapdHTML(w){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const d=w.draft,filled=!!String(d.tapdWorkspaceId||'').trim();
  const body=`<div class="pw-row2">${pwField('Workspace ID',`<input class="pw-input pw-mono" id="pwTapdWorkspace" name="tapdWorkspaceId" value="${escapeHTML(d.tapdWorkspaceId||'')}" placeholder="${_t('例如 20375341','e.g. 20375341')}" spellcheck="false" autocomplete="off">`,{for:'pwTapdWorkspace'})}${pwField('Iteration ID',`<input class="pw-input pw-mono" id="pwTapdIteration" name="tapdIterationId" value="${escapeHTML(d.tapdIterationId||'')}" placeholder="${_t('留空导入全部','Leave blank to import all')}" spellcheck="false" autocomplete="off">`,{for:'pwTapdIteration'})}</div>`;
  return projectWizardHeadHTML(w,_t('TAPD 集成','TAPD integration'),_t('可选。配置后可在需求页从 TAPD 导入需求，澄清结论会回写到 TAPD 单。','Optional. Once configured, you can import issues from TAPD and sync clarification notes back.'))
    +`<div class="pw-pane">${pwCard(_t('TAPD 需求池','TAPD backlog'),_t('Workspace ID 是 TAPD 项目 URL 中 /tapd_fe/ 后的数字','Workspace ID is the number after /tapd_fe/ in the TAPD project URL'),pwPill(filled?_t('已填写','Filled'):_t('未配置','Not configured'),filled?'ok':''),body)}</div>`;
}
function projectWizardSummary(project,repos){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const p=project||{},def=repos.find(r=>r.id===p.defaultRepositoryId),others=(p.members||[]).filter(m=>Number(m.userId)&&Number(m.userId)!==Number(p.ownerId)).length;
  const sop=projectWorkflowName(p.workflowId)||p.workflowId||'';
  return [
    {key:'project',ok:true,label:_t('项目','Project'),value:`${escapeHTML(p.name||'')} · <code>${escapeHTML(p.id||'')}</code> · <code>${escapeHTML(p.key||'')}</code>`},
    {key:'sop',ok:!!sop,label:_t('默认 SOP','Default SOP'),value:sop?escapeHTML(sop):_t('未配置','Not configured')},
    {key:'repos',ok:repos.length>0,label:_t('代码仓库','Repositories'),value:repos.length?_t(`${repos.length} 个，默认 ${escapeHTML(def?.name||def?.gongfengProjectId||'未设置')}`,`${repos.length}, default ${escapeHTML(def?.name||def?.gongfengProjectId||'Not set')}`):_t('未配置，可稍后在项目设置补充','Not configured; can be added later in project settings')},
    {key:'members',ok:others>0,label:_t('项目成员','Members'),value:others?_t(`${others+1} 位（含 Owner）`,`${others+1} (incl. Owner)`):_t('仅 Owner，可稍后邀请成员','Owner only; can invite members later')},
    {key:'tapd',ok:!!p.tapdWorkspaceId,label:'TAPD',value:p.tapdWorkspaceId?`Workspace <code>${escapeHTML(p.tapdWorkspaceId)}</code>${p.tapdIterationId?` · Iteration <code>${escapeHTML(p.tapdIterationId)}</code>`:''}`:_t('未配置，可稍后在项目设置补充','Not configured; can be added later in project settings')},
  ].filter(i=>i.key!=='tapd'||tapdIntegrationAvailable(p));
}
function projectWizardDoneHTML(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const project=projectWizardProject()||{},items=projectWizardSummary(project,projectWizardRepos());
  const list=items.map(i=>`<li class="${i.ok?'is-ok':'is-warn'}" data-pw-summary="${i.key}">${pwIcon(i.ok?'check':'warn',13,i.ok?2.6:2.2)}<span><b>${i.label}</b> · ${i.value}</span></li>`).join('');
  return `<div class="pw-success-mark">${pwIcon('check',24,2.4)}</div><h3 class="pw-title" id="projectWizardTitle" tabindex="-1">${_t(`项目「${escapeHTML(project.name||'')}」已创建`,`Project "${escapeHTML(project.name||'')}" created`)}</h3><p class="pw-lede">${_t('默认 SOP 已就绪，现在就可以开始第一条需求。跳过的配置随时可以在项目设置里补充。','Default SOP is ready. You can start your first issue now, and configure skipped steps anytime in project settings.')}</p>
    <section class="pw-summary"><div class="pw-summary-title">${_t('已生效配置','Active configuration')}</div><ul class="pw-status-list">${list}</ul></section>
    <div class="pw-actions"><button type="button" class="pw-action is-primary" data-pw-action="start"><span class="pw-action-icon">${pwIcon('play',16)}</span><span><strong>${_t('开始第一条需求','Start your first issue')}</strong><small>${_t('切换到该项目，去需求列表新建或导入需求','Switch to this project and create or import issues')}</small></span>${pwIcon('next',14,2.2)}</button><button type="button" class="pw-action" data-pw-action="settings"><span class="pw-action-icon">${pwIcon('gear',16,1.9)}</span><span><strong>${_t('进入项目设置','Go to project settings')}</strong><small>${_t('修改基本信息，补充仓库、成员和 TAPD','Edit basic info, repositories, members, and TAPD')}</small></span>${pwIcon('next',14,2.2)}</button></div>`;
}
function projectWizardFooterHTML(w){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const dis=w.saving?' disabled':'';
  if(w.step==='done')return `<footer class="pw-footer"><div class="pw-footer-spacer"></div><button type="button" class="pw-btn pw-btn-outline" data-pw-action="close">${_t('关闭','Close')}</button></footer>`;
  const left=w.step==='basic'?`<button type="button" class="pw-btn pw-btn-link" data-pw-action="cancel"${dis}>${_t('取消','Cancel')}</button>`:`<button type="button" class="pw-btn pw-btn-link" data-pw-action="skip"${dis}>${_t('跳过此步','Skip step')}</button>`;
  const back=w.step==='members'||w.step==='tapd'?`<button type="button" class="pw-btn pw-btn-outline" data-pw-action="back"${dis}>${pwIcon('back',14,2.2)}${_t('上一步','Back')}</button>`:'';
  const label=w.saving?_t('正在保存…','Saving…'):w.step==='basic'?_t('创建并继续','Create & continue'):w.step==='tapd'?_t('完成','Finish'):_t('下一步','Next');
  return `<footer class="pw-footer">${left}<div class="pw-footer-spacer"></div><div class="pw-footer-nav">${back}<button type="button" class="pw-btn pw-btn-primary" data-pw-action="next"${dis}>${label}${w.saving?'':pwIcon('next',14,2.2)}</button></div></footer>`;
}
function projectWizardBodyHTML(w){
  if(w.step==='basic')return projectWizardBasicHTML(w);
  if(w.step==='repos')return projectWizardReposHTML(w);
  if(w.step==='members')return projectWizardMembersHTML(w);
  if(w.step==='tapd')return projectWizardTapdHTML(w);
  return projectWizardDoneHTML();
}
function projectWizardHTML(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const w=projectWizard;if(!w)return '';
  return `<div class="pw-backdrop" data-pw-backdrop><div class="pw-dialog" role="dialog" aria-modal="true" aria-labelledby="projectWizardLabel" data-pw-step="${w.step}"${w.saving?' aria-busy="true"':''}>${projectWizardRailHTML(w)}<div class="pw-main"><button type="button" class="pw-close" data-pw-action="close" aria-label="${_t('关闭','Close')}"${w.saving?' disabled':''}>${pwIcon('x',16)}</button><div class="pw-body">${projectWizardBodyHTML(w)}</div>${projectWizardFooterHTML(w)}</div></div></div>`;
}
function projectWizardHost(){
  let host=$('#projectWizard');
  if(host)return host;
  host=document.createElement('div');host.id='projectWizard';host.className='pw-root';
  document.body.appendChild(host);
  bindProjectWizardHost(host);
  return host;
}
// The backdrop and dialog carry the entrance animation, so they are mounted once per open; later
// renders only swap the rail, body and footer inside them.
function renderProjectWizard(){
  const w=projectWizard;if(!w)return;
  const host=projectWizardHost(),dialog=host.querySelector('.pw-dialog'),body=dialog?.querySelector('.pw-body');
  if(!dialog||!body){
    host.innerHTML=projectWizardHTML();
  }else{
    const keepScroll=dialog.dataset.pwStep===w.step?body.scrollTop:0;
    dialog.dataset.pwStep=w.step;
    if(w.saving)dialog.setAttribute('aria-busy','true');else dialog.removeAttribute('aria-busy');
    const close=dialog.querySelector('.pw-close');if(close)close.disabled=!!w.saving;
    const rail=dialog.querySelector('.pw-rail');if(rail)rail.outerHTML=projectWizardRailHTML(w);
    body.innerHTML=projectWizardBodyHTML(w);
    body.scrollTop=keepScroll;
    const footer=dialog.querySelector('.pw-footer');if(footer)footer.outerHTML=projectWizardFooterHTML(w);
  }
  document.body?.classList?.add('pw-open');
  bindUserSearches(host);
  if(w.step==='repos'&&typeof mountGitHubRepoPicker==='function')mountGitHubRepoPicker(host.querySelector('[data-github-repositories]'),repository=>{
    w.repo.url=repository.html_url;w.repo.branch=repository.default_branch||'main';
    const url=host.querySelector('[name="repoUrl"]'),branch=host.querySelector('[name="repoBranch"]');
    url.value=w.repo.url;branch.value=w.repo.branch;syncProjectWizardField(url);
  });
  focusProjectWizard();
}
function focusProjectWizard(){
  const w=projectWizard,host=$('#projectWizard');if(!w||!host)return;
  const target=w.focus==='title'?host.querySelector('#projectWizardTitle'):w.focus?host.querySelector(`[name="${w.focus}"]`):null;
  w.focus='';
  if(!target)return;
  const el=target.type==='hidden'?target.closest('[data-user-combobox]')?.querySelector('[data-user-combobox-trigger]'):target;
  setTimeout(()=>el?.focus?.(),0);
}
function syncProjectWizardField(t){
  const w=projectWizard,d=w.draft,name=t.name;
  if(name==='repoUrl'||name==='repoBranch'||name==='repoIntegrate'){
    w.repo[{repoUrl:'url',repoBranch:'branch',repoIntegrate:'integrate'}[name]]=t.value;
    if(name==='repoUrl'){const hint=$('#projectWizard')?.querySelector('[data-pw-repo-hint]');if(hint)hint.innerHTML=projectWizardRepoHint(t.value)}
    return true;
  }
  if(name==='ownerId'||/^member-\d+$/.test(name)){
    if(name==='ownerId')d.ownerId=Number(t.value)||0;
    else{const m=d.members[Number(name.slice(7))];if(m)m.userId=Number(t.value)||0}
    const pill=$('#projectWizard')?.querySelector('[data-pw-people-pill]');if(pill)pill.outerHTML=projectWizardPeoplePill(d);
    return true;
  }
  if(!['name','description','workflowId','tapdWorkspaceId','tapdIterationId'].includes(name))return false;
  d[name]=t.value;
  if(name==='name'){const pill=$('#projectWizard')?.querySelector('[data-pw-name-pill]');if(pill)pill.outerHTML=projectWizardNamePill(t.value)}
  return true;
}
function bindProjectWizardHost(host){
  const onField=e=>{
    if(!projectWizard||!e.target?.name||!syncProjectWizardField(e.target))return;
    if(projectWizard.error){projectWizard.error='';host.querySelector('.pw-note.is-err')?.remove()}
  };
  host.addEventListener('input',onField);
  host.addEventListener('change',onField);
  let downOnBackdrop=false;
  host.addEventListener('mousedown',e=>{downOnBackdrop=e.target?.matches?.('[data-pw-backdrop]')});
  host.addEventListener('click',e=>{
    const w=projectWizard,t=e.target instanceof Element?e.target:null;if(!w||!t)return;
    if(t.matches('[data-pw-backdrop]')){if(downOnBackdrop&&!w.saving)closeProjectWizard({force:w.step==='done'});downOnBackdrop=false;return}
    const sw=t.closest('[data-pw-color]');
    if(sw){w.draft.color=sw.dataset.pwColor;host.querySelectorAll('[data-pw-color]').forEach(b=>{const on=b===sw;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on))});return}
    const rmRepo=t.closest('[data-pw-repo-remove]');if(rmRepo){projectWizardRemoveRepo(rmRepo.dataset.pwRepoRemove);return}
    const rmMember=t.closest('[data-pw-member-remove]');if(rmMember){projectWizardRemoveMember(Number(rmMember.dataset.pwMemberRemove));return}
    const action=t.closest('[data-pw-action]')?.dataset.pwAction;
    if(action==='next')projectWizardNext();
    else if(action==='skip')projectWizardSkip();
    else if(action==='back')projectWizardBack();
    else if(action==='cancel'||action==='close')closeProjectWizard({force:w.step==='done'});
    else if(action==='add-repo')projectWizardAddRepo();
    else if(action==='add-member')projectWizardAddMember();
    else if(action==='start')projectWizardStartIssues();
    else if(action==='settings')projectWizardOpenSettings();
  });
  host.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.isComposing||!projectWizard)return;
    const name=e.target?.name;
    if(name==='repoUrl'||name==='repoBranch'||name==='repoIntegrate'){e.preventDefault();projectWizardAddRepo()}
    else if(name==='name'||name==='tapdWorkspaceId'||name==='tapdIterationId'){e.preventDefault();projectWizardNext()}
  });
}
// Back/forward or a typed hash moves away from where the wizard was opened; the overlay must not
// linger over another view. Saved steps are already on the server.
function projectWizardOnHashChange(){
  const w=projectWizard;if(!w||location.hash===w.hash)return;
  if(parseProjectAdminRoute(location.hash)?.id==='new'){w.hash=location.hash;return}
  w.saving=false;
  closeProjectWizard({force:true,noFocus:true});
}
window.addEventListener('hashchange',projectWizardOnHashChange);
function projectWizardFocusables(host){
  return [...host.querySelectorAll('button:not([disabled]),input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.offsetParent!==null&&!el.closest('[hidden]'));
}
// Capture phase: an open user picker keeps Escape, and the global handler in app.js (which drops
// .open from the topmost modal without settling afConfirm) must not see the keys handled here.
document.addEventListener('keydown',e=>{
  const w=projectWizard,host=$('#projectWizard');if(!w||!host)return;
  if($('#confirmModal')?.classList.contains('open')){
    if(e.key==='Escape'&&typeof confirmPromiseResolve==='function'){e.preventDefault();e.stopPropagation();confirmPromiseResolve(false)}
    return;
  }
  if(e.key==='Escape'){
    if(host.querySelector('[data-user-combobox].is-open'))return;
    e.preventDefault();e.stopPropagation();
    if(!w.saving)closeProjectWizard({force:w.step==='done'});
    return;
  }
  if(e.key!=='Tab')return;
  const items=projectWizardFocusables(host);if(!items.length)return;
  const first=items[0],last=items[items.length-1],inside=host.contains(document.activeElement);
  if(e.shiftKey&&(document.activeElement===first||!inside)){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(document.activeElement===last||!inside)){e.preventDefault();first.focus()}
},true);
