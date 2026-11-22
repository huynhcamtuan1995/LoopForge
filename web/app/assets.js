function assetScopeKey(type){return ({rules:'ruleScope',skills:'skillScope',dockerfiles:'dockerfileScope',environments:'environmentScope',sandboxes:'sandboxScope'})[type]||'ruleScope'}
function isProjectSharedAsset(type){return ['rules','skills','dockerfiles','environments','sandboxes'].includes(type)}
function assetPageCopy(type=state.assetType){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return ({
    rules:{group:_t('Agent 能力','Agent Capabilities'),page:_t('能力资产','Capability Assets'),tab:_t('规则','Rules'),desc:_t('维护当前项目的行为约束和执行规则。','Manage behavior constraints and execution rules for this project.'),create:_t('新建规则','New Rule')},
    skills:{group:_t('Agent 能力','Agent Capabilities'),page:_t('能力资产','Capability Assets'),tab:_t('技能','Skills'),desc:_t('维护当前项目可供角色使用的技能和附加文件。','Manage skills and attached files available to agents in this project.'),create:_t('新建技能','New Skill')},
    dockerfiles:{group:_t('运行环境','Runtime Environment'),page:_t('环境资产','Environment Assets'),tab:'Dockerfile',desc:_t('维护当前项目的容器构建定义。','Manage container build definitions for this project.'),create:_t('新建 Dockerfile','New Dockerfile')},
    environments:{group:_t('运行环境','Runtime Environment'),page:_t('环境资产','Environment Assets'),tab:_t('安装脚本','Install Scripts'),desc:_t('维护安装到隔离执行环境中的工具与依赖。','Manage tools and dependencies installed into isolated execution environments.'),create:_t('新建安装脚本','New Install Script')},
    sandboxes:{group:_t('运行环境','Runtime Environment'),page:_t('环境资产','Environment Assets'),tab:_t('沙箱','Sandboxes'),desc:_t('维护当前项目的运行隔离方式及环境依赖。','Manage runtime isolation modes and environment dependencies for this project.'),create:_t('新建沙箱','New Sandbox')}
  })[type]||{group:_t('运行环境','Runtime Environment'),page:_t('环境资产','Environment Assets'),tab:'Dockerfile',desc:_t('维护当前项目的容器构建定义。','Manage container build definitions for this project.'),create:_t('新建 Dockerfile','New Dockerfile')};
}
function assetSharedDescription(type=state.assetType){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return type==='rules'?_t('查看其他项目共享的规则；共享规则只读，可直接绑定到本项目角色。','View rules shared by other projects. Shared rules are read-only and can be bound to agents in this project.'):type==='skills'?_t('查看其他项目共享的技能；共享技能只读，会自动装入平台上所有对话和定时任务，也可绑定到本项目角色。','View skills shared by other projects. Shared skills are read-only, automatically loaded into all platform conversations and scheduled tasks, and can also be bound to agents.'):_t('查看其他项目共享的环境资产；共享资产只读，可直接用于本项目。','View environment assets shared by other projects. Shared assets are read-only and can be used directly in this project.')}
function assetIconName(type=state.assetType){return ({rules:'gate',skills:'skills',dockerfiles:'layers',environments:'terminal',sandboxes:'server'})[type]||'layers'}
function assetRefIconName(type=state.assetType){return ({rules:'robot',skills:'robot',dockerfiles:'server',environments:'server',sandboxes:'workflow'})[type]||'layers'}
function assetScopeItems(scope){return (state.data[state.assetType]||[]).filter(item=>scope==='shared'?catalogShared(item.projectId,item.shared):catalogOwned(item.projectId))}
function assetMatchesQuery(a,query){const q=String(query||'').trim().toLowerCase();if(!q)return true;return [a?.name,a?.id,a?.description].some(v=>String(v||'').toLowerCase().includes(q))}
function assetFilteredItems(){return assetScopeItems(state[assetScopeKey(state.assetType)]).filter(a=>assetMatchesQuery(a,state.assetQuery))}
// Owned assets win over a same-id shared copy so the editable one opens.
function assetFindVisible(id){if(!id)return null;const owned=assetScopeItems('project').find(x=>x.id===id);if(owned)return {asset:owned,scope:'project'};const shared=assetScopeItems('shared').find(x=>x.id===id);return shared?{asset:shared,scope:'shared'}:null}
function assetProjectName(a){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return (state.data.projects||[]).find(p=>p.id===a?.projectId)?.name||a?.projectId||_t('平台','Platform')}
function assetIsBuiltin(a,type=state.assetType){return (type==='sandboxes'&&(a?.id==='local'||a?.id==='generic-docker'))||(type==='dockerfiles'&&a?.id==='generic-backend')}
function assetStatusHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!catalogOwned(a.projectId))return `<span class="asset-status is-from"><i></i>${_t(`来自 ${escapeHTML(assetProjectName(a))}`,`From ${escapeHTML(assetProjectName(a))}`)}</span>`;
  return `<span class="asset-status ${a.shared?'is-on':''}"><i></i>${a.shared?_t('已共享','Shared'):_t('未共享','Not shared')}</span>`;
}
function assetMetaHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const item=(icon,text)=>`<span>${huiIcon(icon)}${escapeHTML(text)}</span>`;const meta=[];
  if(state.assetType==='rules'){meta.push(item('priority-bolt',_t(`优先级 ${a.priority||0}`,`Priority ${a.priority||0}`)));if(a.global){const bound=(a.workflowIds||[]).length;meta.push(item('globe',bound?_t(`全局 · ${bound} 个 SOP`,`Global · ${bound} SOPs`):_t('全局','Global')))}}
  if(state.assetType==='skills'){
    meta.push(item('doc',_t(`${Object.keys(a.files||{}).length+(a.fileRefs||[]).length} 个文件`,`${Object.keys(a.files||{}).length+(a.fileRefs||[]).length} files`)));
    const src=assetSkillSource(a);
    if(src){const latest=assetSkillLatest(src);meta.push(latest&&latest!==src.version?`<span class="hui-badge" data-tone="warn" data-size="sm"><span class="hui-lamp"><i></i></span><span class="hui-badge-label">SkillHub v${escapeHTML(src.version)} · ${_t('可更新','Update available')}</span></span>`:`<span class="hui-badge" data-tone="accent" data-size="sm">${huiIcon('sparkles')}<span class="hui-badge-label">SkillHub v${escapeHTML(src.version)}</span></span>`)}
  }
  if(state.assetType==='dockerfiles')meta.push(item('doc',_t(`${(a.content||'').split('\n').length} 行`,`${(a.content||'').split('\n').length} lines`)));
  if(state.assetType==='environments')meta.push(item('variable',_t(`${Object.keys(a.variables||{}).length} 个变量`,`${Object.keys(a.variables||{}).length} vars`)));
  if(state.assetType==='sandboxes')meta.push(item('server',sandboxDriverOption(a.driver)));
  const refs=assetReferenceNames(a).length;
  meta.push(item(assetRefIconName(),refs?_t(`${refs} 个${assetRefKindLabel()}引用`,`${refs} ${assetRefKindLabel()} refs`):_t('未被引用','Unreferenced')));
  return meta.join('');
}
function assetCardHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const readonly=!catalogOwned(a.projectId);const go=readonly?_t('查看','View'):_t('编辑','Edit');
  return `<article class="asset-card" role="link" tabindex="0" data-asset-id="${escapeHTML(a.id)}" aria-label="${go} ${escapeHTML(assetKindLabel())} ${escapeHTML(a.name||a.id)}"><div class="asset-card-top"><span class="asset-tile">${huiIcon(assetIconName())}</span><div class="asset-card-name"><h3>${escapeHTML(a.name||a.id)}</h3><code class="asset-mono">${escapeHTML(a.id)}</code></div></div><p class="asset-card-desc">${escapeHTML(a.description||_t('暂无说明','No description'))}</p><div class="asset-meta">${assetMetaHTML(a)}</div><div class="asset-card-foot">${assetStatusHTML(a)}<span class="asset-card-go">${go}${huiIcon('chevron-right')}</span></div></article>`;
}
function assetGridEmptyHTML(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const kind=assetKindLabel(),copy=assetPageCopy();
  if(String(state.assetQuery||'').trim())return `<div class="asset-empty"><b>${_t(`没有匹配「${escapeHTML(state.assetQuery.trim())}」的${escapeHTML(kind)}`,`No ${escapeHTML(kind)} matching "${escapeHTML(state.assetQuery.trim())}"`)}</b><p>${_t('换个关键词试试。','Try another keyword.')}</p></div>`;
  if(state[assetScopeKey(state.assetType)]==='shared'){const hint=['rules','skills'].includes(state.assetType)?_t('请在资产所属项目中共享，或共享一个引用它的角色。','Share it from its owning project, or share an agent that references it.'):_t('请在资产所属项目中共享；共享 SOP 时也会自动共享其环境依赖。','Share it from its owning project; sharing an SOP also shares its environment dependencies.');return `<div class="asset-empty"><b>${_t(`其他项目还没有共享${escapeHTML(kind)}`,`No shared ${escapeHTML(kind)} from other projects yet`)}</b><p>${hint}</p></div>`}
  return `<div class="asset-empty"><b>${_t(`当前项目还没有${/^[A-Za-z]/.test(kind)?' ':''}${escapeHTML(kind)}`,`No ${escapeHTML(kind)} in this project yet`)}</b><p>${assetEmptyHint()}</p><button type="button" class="button primary" data-empty-new>${huiIcon('plus')}${escapeHTML(copy.create)}</button></div>`;
}
function renderAssetGrid(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const list=$('#assetList');if(!list)return;
  const scope=state[assetScopeKey(state.assetType)];
  const items=assetFilteredItems();
  const count=$('#assetCount');if(count)count.innerHTML=`${scope==='shared'?_t('共享','Shared '):_t('本项目','Project ')}${escapeHTML(assetKindLabel())}<b>${items.length}</b>`;
  list.innerHTML=items.map(assetCardHTML).join('')||assetGridEmptyHTML();
  list.querySelector('[data-empty-new]')?.addEventListener('click',()=>openAssetDetail('__new__'));
  list.querySelectorAll('[data-asset-id]').forEach(card=>{
    card.onclick=()=>openAssetDetail(card.dataset.assetId);
    card.onkeydown=e=>{if(e.key==='Enter'&&e.target===card){e.preventDefault();openAssetDetail(card.dataset.assetId)}};
  });
}
function renderAssetListChrome(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const scope=state[assetScopeKey(state.assetType)],copy=assetPageCopy();
  if($('#assetPageEyebrow'))$('#assetPageEyebrow').textContent=copy.group;
  if($('#assetPageTitle'))$('#assetPageTitle').textContent=copy.page;
  if($('#assetPageDescription'))$('#assetPageDescription').textContent=scope==='skillhub'?_t('从 SkillHub 搜索公开技能，查看质量评测与安全认证后安装到本项目。','Search public skills on SkillHub, inspect quality evaluations and security reports, and install them to this project.'):scope==='shared'?assetSharedDescription():copy.desc;
  if($('#newAssetLabel'))$('#newAssetLabel').textContent=copy.create;
  if($('#newAsset'))$('#newAsset').hidden=scope!=='project';
  if(typeof skillhubSyncChrome==='function')skillhubSyncChrome();
  $$('[data-asset-scope]').forEach(btn=>btn.classList.toggle('active',btn.dataset.assetScope===scope));
  $$('[data-asset-scope-count]').forEach(el=>el.textContent=String(assetScopeItems(el.dataset.assetScopeCount).length));
  const search=$('#assetSearch');if(search&&search.value!==(state.assetQuery||''))search.value=state.assetQuery||'';
}
function resetAssetDetailState(){state.assetCreateDefaults={};state.selectedAsset=null;state.assetDirty=false;state.assetDetailKey='';state.assetTab=null;closeAssetMenu()}
function renderAssets(){
  if(!$('#assetsView')||!state.data)return;
  const selected=state.selectedAsset;
  if(selected&&selected!=='__new__'&&state.data[state.assetType]){
    const hit=assetFindVisible(selected);
    if(!hit){
      // Project switch or a remote delete removed the open asset.
      resetAssetDetailState();
      if(routePart(0)===state.assetType&&assetRouteId())history.replaceState(null,'',assetViewHash(state.assetType));
    }else state[assetScopeKey(state.assetType)]=hit.scope;
  }
  renderAssetListChrome();
  const detail=!!state.selectedAsset;
  if($('#assetListPane'))$('#assetListPane').hidden=detail;
  if($('#assetDetailPane'))$('#assetDetailPane').hidden=!detail;
  if(detail)renderAssetDetail();
  else{state.assetDetailKey='';if(state.assetType==='skills'&&state.skillScope==='skillhub'&&typeof renderSkillHubMarket==='function')renderSkillHubMarket();else renderAssetGrid()}
}
function assetCurrent(){
  if(state.selectedAsset==='__new__')return {id:'',name:'',description:'',...state.assetCreateDefaults};
  return assetFindVisible(state.selectedAsset)?.asset||null;
}
function assetDetailHeadHTML(a,{creating=false,dirty=false}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const kind=assetKindLabel(),copy=assetPageCopy(),readonly=!creating&&!catalogOwned(a.projectId);
  const badge=creating?'':readonly?`<span class="asset-badge is-from">${_t(`来自 ${escapeHTML(assetProjectName(a))}`,`From ${escapeHTML(assetProjectName(a))}`)}</span>`:`<span class="asset-badge ${a.shared?'is-on':''}">${a.shared?_t('已共享','Shared'):_t('未共享','Not shared')}</span>`;
  const title=creating?_t(`新建${kind}`,`New ${kind}`):(a.name||a.id);
  const desc=creating?_t(`填写标识和名称后创建${state.assetType==='skills'?'，创建后即可上传文件':''}。`,`Enter ID and name to create${state.assetType==='skills'?', then upload files':''}.`):(a.description||_t('暂无说明','No description'));
  let actions;
  if(creating)actions=`<button type="button" class="button" data-asset-cancel>${_t('取消','Cancel')}</button><button type="submit" form="assetForm" class="button primary" data-asset-save>${huiIcon('plus')}${_t(`创建${escapeHTML(kind)}`,`Create ${escapeHTML(kind)}`)}</button>`;
  else if(readonly)actions=`<span class="asset-badge is-ro">${huiIcon('lock')}${_t('只读 · 可直接在本项目使用','Read-only · Ready to use in this project')}</span>`;
  else{
    const blocked=assetDeleteBlocked(a);
    actions=`<span class="asset-dirty" data-asset-dirty ${dirty?'':'hidden'}><i></i>${_t('未保存','Unsaved')}</span>`+
      `<button type="button" class="button" data-asset-share>${huiIcon(a.shared?'close':'arrow-up')}${a.shared?_t('取消共享','Unshare'):_t('共享给其他项目','Share with other projects')}</button>`+
      `<div class="asset-more"><button type="button" class="button hui-icon-button" id="assetMoreBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="assetMoreMenu" aria-label="${_t('更多操作','More actions')}" title="${_t('更多操作','More actions')}">${huiIcon('more-horizontal')}</button>`+
      `<div id="assetMoreMenu" class="hui-menu asset-menu" role="menu" inert><button type="button" role="menuitem" class="hui-menu-item is-danger" data-asset-delete ${blocked?'disabled aria-disabled="true"':''}>${huiIcon('trash')}<span class="hui-menu-label">${_t(`删除${escapeHTML(kind)}`,`Delete ${escapeHTML(kind)}`)}</span></button>${blocked?`<p class="asset-menu-reason" data-asset-delete-reason>${escapeHTML(blocked)}</p>`:''}</div></div>`+
      `<button type="submit" form="assetForm" class="button primary" data-asset-save>${huiIcon('save')}${_t('保存修改','Save Changes')}</button>`;
  }
  return `<div class="asset-dtitle"><button type="button" class="button hui-icon-button asset-back" data-asset-back aria-label="${_t(`返回${escapeHTML(copy.page)}`,`Back to ${escapeHTML(copy.page)}`)}" title="${_t(`返回${escapeHTML(copy.page)}`,`Back to ${escapeHTML(copy.page)}`)}">${huiIcon('arrow-left')}</button><div class="asset-dtitle-text"><h1><span class="asset-dname">${escapeHTML(title)}</span>${badge}</h1><p>${escapeHTML(desc)}</p></div></div><div class="asset-acts">${actions}</div>`;
}
function renderAssetDetailHead(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const creating=state.selectedAsset==='__new__',copy=assetPageCopy();
  const crumbs=$('#assetCrumbs');
  if(crumbs)crumbs.innerHTML=`<a href="${assetViewHash(state.assetType)}" data-asset-back>${escapeHTML(copy.page)} · ${escapeHTML(copy.tab)}</a>${huiIcon('chevron-right')}<span class="is-current">${escapeHTML(creating?_t(`新建${assetKindLabel()}`,`New ${assetKindLabel()}`):(a.name||a.id))}</span>`;
  const head=$('#assetDetailHead');if(!head)return;
  closeAssetMenu();
  head.innerHTML=assetDetailHeadHTML(a,{creating,dirty:!!state.assetDirty});
  $$('#assetDetailPane [data-asset-back], #assetDetailPane [data-asset-cancel]').forEach(el=>el.onclick=e=>{e.preventDefault();closeAssetDetail()});
  const share=head.querySelector('[data-asset-share]');if(share)share.onclick=()=>toggleAssetShare(a.id);
  const more=$('#assetMoreBtn');if(more)more.onclick=e=>{e.stopPropagation();$('#assetMoreMenu')?.classList.contains('is-open')?closeAssetMenu(true):openAssetMenu()};
  const del=head.querySelector('[data-asset-delete]');if(del)del.onclick=()=>{if(del.disabled)return;closeAssetMenu();deleteAsset(a.id)};
  bindAssetDetailChrome();
  updateAssetStuck();
}
function openAssetMenu(){
  const menu=$('#assetMoreMenu'),btn=$('#assetMoreBtn');if(!menu||!btn)return;
  window.HuiSelect?.closeAll?.();
  menu.inert=false;menu.classList.add('is-open');btn.setAttribute('aria-expanded','true');
  menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
}
function closeAssetMenu(focusTrigger=false){
  const menu=$('#assetMoreMenu'),btn=$('#assetMoreBtn');if(!menu||!menu.classList.contains('is-open'))return;
  menu.classList.remove('is-open');menu.inert=true;btn?.setAttribute('aria-expanded','false');
  if(focusTrigger)btn?.focus();
}
let assetDetailChromeBound=false;
function bindAssetDetailChrome(){
  if(assetDetailChromeBound)return;assetDetailChromeBound=true;
  document.addEventListener('pointerdown',e=>{if(!(e.target instanceof Element)||!e.target.closest('.asset-more'))closeAssetMenu()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#assetMoreMenu')?.classList.contains('is-open')){e.preventDefault();closeAssetMenu(true)}});
  document.addEventListener('scroll',updateAssetStuck,{capture:true,passive:true});
}
function updateAssetStuck(){
  const head=$('#assetDetailHead'),sentinel=$('#assetStickSentinel');
  if(!head||!sentinel||$('#assetDetailPane')?.hidden)return;
  head.classList.toggle('is-stuck',sentinel.getBoundingClientRect().top<head.getBoundingClientRect().top-1);
}
function assetRefsCardHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const refs=assetReferenceNames(a),kind=assetRefKindLabel();
  return `<h4>${_t('被引用','Referenced by')}<span class="asset-side-count">${refs.length}</span></h4><ul class="asset-refs">${refs.length?refs.map(name=>`<li>${huiIcon(assetRefIconName())}<span>${escapeHTML(name)}</span></li>`).join(''):`<li class="is-none">${_t(`还没有${kind}引用这个${escapeHTML(assetKindLabel())}`,`No ${kind} references this ${escapeHTML(assetKindLabel())} yet`)}</li>`}</ul>`;
}
function assetSkillSource(a){const s=a?.source;return state.assetType==='skills'&&s&&s.provider==='skillhub'?s:null}
function assetSkillLatest(src){return typeof skillhubLatestFor==='function'?skillhubLatestFor(src):''}
function assetSkillSourceRowsHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const src=assetSkillSource(a);if(!src)return '';
  const latest=assetSkillLatest(src),homepage=/^https?:\/\//i.test(src.homepage||'')?src.homepage:'';
  const date=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleDateString(_t('zh-CN','en-US')):'—'};
  return `<dt>${_t('来源','Source')}</dt><dd>${homepage?`<a href="${escapeHTML(homepage)}" target="_blank" rel="noopener noreferrer">SkillHub · ${escapeHTML(src.slug)}</a>`:`SkillHub · ${escapeHTML(src.slug)}`}</dd><dt>${_t('版本','Version')}</dt><dd>v${escapeHTML(src.version)}${latest&&latest!==src.version?_t(` · 最新 v${escapeHTML(latest)}`,` · Latest v${escapeHTML(latest)}`):''}</dd><dt>${_t('安装于','Installed')}</dt><dd>${escapeHTML(date(src.installedAt))}</dd>${src.updatedAt&&src.updatedAt!==src.installedAt?`<dt>${_t('更新于','Updated')}</dt><dd>${escapeHTML(date(src.updatedAt))}</dd>`:''}`;
}
function assetSkillSourceActionHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const src=assetSkillSource(a);if(!src||!catalogOwned(a.projectId))return '';
  const latest=assetSkillLatest(src);
  return latest&&latest!==src.version?`<button type="button" class="button primary asset-source-btn" data-skillhub-source-update>${huiIcon('refresh')}${_t(`更新到 v${escapeHTML(latest)}`,`Update to v${escapeHTML(latest)}`)}</button>`:`<button type="button" class="button hui-btn-soft asset-source-btn" data-skillhub-source-check>${huiIcon('refresh')}${_t('检查更新','Check for updates')}</button>`;
}
function assetOverviewCardHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const readonly=!catalogOwned(a.projectId);
  return `<h4>${_t('概览','Overview')}</h4><dl class="asset-kv"><dt>${_t('归属','Owner')}</dt><dd>${readonly?escapeHTML(assetProjectName(a)):_t('本项目','This project')}</dd><dt>${_t('共享','Sharing')}</dt><dd>${readonly?_t('其他项目共享','Shared from another project'):a.shared?_t('已共享','Shared'):_t('未共享','Not shared')}</dd>${assetIsBuiltin(a)?`<dt>${_t('类型','Type')}</dt><dd>${_t('内置','Built-in')}</dd>`:''}${assetSkillSourceRowsHTML(a)}</dl>${assetSkillSourceActionHTML(a)}`;
}
function bindAssetSourceActions(a){
  const card=$('#assetForm [data-asset-overview]');if(!card||!assetSkillSource(a))return;
  const up=card.querySelector('[data-skillhub-source-update]');if(up)up.onclick=()=>typeof openSkillhubUpdate==='function'&&openSkillhubUpdate(a,{latest:assetSkillLatest(a.source),opener:up});
  const check=card.querySelector('[data-skillhub-source-check]');if(check)check.onclick=()=>typeof checkSkillhubUpdate==='function'&&checkSkillhubUpdate(a,check);
}
function refreshAssetAside(a){
  const refs=$('#assetForm [data-asset-refs]');if(refs)refs.innerHTML=assetRefsCardHTML(a);
  const overview=$('#assetForm [data-asset-overview]');if(overview){overview.innerHTML=assetOverviewCardHTML(a);bindAssetSourceActions(a)}
  if(state.assetType==='skills'){refreshSkillFileTree();const summary=$('#assetForm [data-skill-summary]');if(summary)summary.innerHTML=skillFileSummary(a)}
}
function renderAssetDetail({force=false}={}){
  const a=assetCurrent();if(!a)return;
  const key=`${state.assetType}:${state.selectedAsset}`,same=key===state.assetDetailKey;
  renderAssetDetailHead(a);
  if(same&&state.assetDirty&&!force){refreshAssetAside(a);return}
  state.assetDetailKey=key;
  renderAssetForm(a);
}
function markAssetDirty(){
  if(!state.selectedAsset||(state.selectedAsset!=='__new__'&&!catalogOwned(assetCurrent()?.projectId)))return;
  state.assetDirty=true;$('#assetDetailHead [data-asset-dirty]')?.removeAttribute('hidden');
}
function scrollAssetTop(){
  for(let el=$('#assetsView');el;el=el.parentElement)if(el.scrollTop)el.scrollTop=0;
  window.scrollTo?.(0,0);
}
async function confirmAssetLeave(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!state.selectedAsset||!state.assetDirty||!isProjectSharedAsset(activeViewName()))return true;
  const ok=await afConfirm({title:_t('未保存的修改','Unsaved Changes'),message:_t(`当前${assetKindLabel()}有未保存修改，离开将放弃这些修改。继续？`,`The current ${assetKindLabel()} has unsaved changes that will be discarded if you leave. Continue?`),confirmText:_t('放弃并离开','Discard and Leave'),danger:true});
  if(ok)state.assetDirty=false;
  return ok;
}
async function createConversationSandbox(projectId){
  if(!(state.data.projects||[]).some(project=>project.id===projectId))return;
  if(!await confirmAssetLeave())return;
  if(state.projectFilter!==projectId){
    const select=$('#projectSwitcher');
    select.value=projectId;
    await select.onchange({target:select});
    if(state.projectFilter!==projectId)return;
  }
  switchView('sandboxes');
  openAssetDetail('__new__',{driver:'docker'});
}
function openAssetDetail(id,defaults={}){
  if(!id||state.selectedAsset===id)return;
  const type=state.assetType;
  if(id==='__new__'){state[assetScopeKey(type)]='project';state.assetCreateDefaults=defaults}
  state.selectedAsset=id;state.assetDirty=false;state.assetTab=null;state.assetDetailKey='';state.skillUploadStatus='';
  const next=assetViewHash(type,id);
  if(location.hash!==next)history.pushState({assetFrom:assetViewHash(type)},'',next);
  renderAssets();
  scrollAssetTop();
}
async function closeAssetDetail({force=false}={}){
  if(!state.selectedAsset)return true;
  if(!force&&!(await confirmAssetLeave()))return false;
  const type=state.assetType,list=assetViewHash(type);
  const fromList=history.state?.assetFrom===list&&routePart(0)===type&&!!assetRouteId();
  resetAssetDetailState();
  if(fromList)history.back();
  else if(location.hash!==list)history.replaceState(null,'',list);
  renderAssets();
  scrollAssetTop();
  return true;
}
// A shared skill is installed into every conversation and scheduled task on
// the platform, not only offered for binding, so sharing one asks first.
const SHARED_SKILL_NOTICE=typeof lfT==='function'?lfT('共享后，这个技能会自动装入平台上所有用户的对话和定时任务（包括其他项目和无项目的对话），模型可以直接调用。继续？','Once shared, this skill is automatically loaded into all users\' conversations and scheduled tasks across the platform (including other projects and projectless chats), and models can invoke it directly. Continue?'):'共享后，这个技能会自动装入平台上所有用户的对话和定时任务（包括其他项目和无项目的对话），模型可以直接调用。继续？';
async function toggleAssetShare(id){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const item=(state.data[state.assetType]||[]).find(x=>x.id===id);
  if(!item||!catalogOwned(item.projectId))return toast(_t('只能共享本项目的资产','Only assets in this project can be shared'));
  if(!item.shared&&state.assetType==='skills'&&!(await afConfirm({title:_t('共享技能','Share Skill'),message:SHARED_SKILL_NOTICE,confirmText:_t('共享','Share')})))return;
  try{
    const saved={...item,shared:!item.shared};
    await api(`/api/${state.assetType}`,{method:'PUT',body:JSON.stringify(saved)});
    Object.assign(item,saved);
    if(state.selectedAsset===id){renderAssetDetailHead(item);refreshAssetAside(item)}
    else renderAssets();
    const agent=state.data.agents.find(a=>a.id===state.selectedAgent)||state.agentDraft;if(agent)renderAgentAssetsPanel(agent);
    toast(saved.shared?(state.assetType==='skills'?_t('已共享，所有对话和定时任务会自动装入','Shared; automatically loaded into all conversations and scheduled tasks'):_t('已共享，其他项目可绑定','Shared; available for binding in other projects')):_t('已取消共享','Unshared'));
  }catch(e){toast(e.message)}
}
function assetEmptyHint(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return ({rules:_t('规则是写给 Agent 的行为约束，例如编码规范、禁止事项。建好后在「角色定义」里绑定到角色。','Rules are behavior constraints for agents (e.g., coding standards, prohibitions). Bind them in Agent Definitions.'),skills:_t('技能是 Agent 可按需加载的说明和附加文件，例如某个框架的操作手册。建好后在「角色定义」里绑定到角色。','Skills are on-demand instructions and files for agents (e.g., framework guides). Bind them in Agent Definitions.'),dockerfiles:_t('Dockerfile 定义沙箱容器的镜像。建好后在「沙箱管理」里选用；也可以直接用「共享」里的现成配置。','Dockerfiles define sandbox container images. Select one in Sandboxes, or use a shared configuration.'),environments:_t('安装脚本在沙箱初始化时把工具装进隔离环境，例如指定版本的 Go、PHP、Node。建好后在「沙箱管理」里选用。','Install scripts install tools (e.g., specific Go, PHP, Node versions) during sandbox initialization. Select one in Sandboxes.'),sandboxes:_t('沙箱决定 SOP 节点在什么隔离环境里执行，由 Dockerfile 和安装脚本组合而成。建好后在流程设置里选用；也可以直接用「共享」里的现成配置。','Sandboxes define the isolated execution environment for SOP nodes, combining a Dockerfile and install script. Select one in workflow settings, or use a shared one.')})[state.assetType]||''}
function assetKindLabel(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return ({rules:_t('规则','Rule'),skills:_t('技能','Skill'),dockerfiles:'Dockerfile',environments:_t('环境安装脚本','Install Script'),sandboxes:_t('沙箱','Sandbox')})[state.assetType]||_t('资产','Asset')}
function assetRefKindLabel(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return ({rules:_t('角色','agent'),skills:_t('角色','agent'),dockerfiles:_t('沙箱','sandbox'),environments:_t('沙箱','sandbox'),sandboxes:_t('流程','workflow')})[state.assetType]||_t('引用','ref')}
function assetReferenceNames(a){
  if(!a?.id)return [];
  if(state.assetType==='rules')return (state.data.agents||[]).filter(x=>(x.rules||[]).includes(a.id)).map(x=>x.name||x.id);
  if(state.assetType==='skills')return (state.data.agents||[]).filter(x=>(x.skills||[]).includes(a.id)).map(x=>x.name||x.id);
  if(state.assetType==='dockerfiles')return (state.data.sandboxes||[]).filter(x=>x.dockerfileId===a.id).map(x=>x.name||x.id);
  if(state.assetType==='environments')return (state.data.sandboxes||[]).filter(x=>x.environmentId===a.id).map(x=>x.name||x.id);
  if(state.assetType==='sandboxes')return (state.data.workflows||[]).filter(x=>!catalogGeneric(x)&&x.sandboxProfileId===a.id).map(x=>x.name||x.id);
  return [];
}
function assetDeleteBlocked(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!a?.id)return _t('无法删除','Cannot delete');
  if(state.assetType==='sandboxes'&&(a.id==='local'||a.id==='generic-docker'))return _t(`内置沙箱 ${a.id} 不能删除`,`Built-in sandbox ${a.id} cannot be deleted`);
  if(state.assetType==='dockerfiles'&&a.id==='generic-backend')return _t('内置 Dockerfile generic-backend 不能删除','Built-in Dockerfile generic-backend cannot be deleted');
  if(a.shared)return _t(`共享状态的${assetKindLabel()}不能删除，请先取消共享`,`Shared ${assetKindLabel()} cannot be deleted; unshare it first`);
  const refs=assetReferenceNames(a);
  if(refs.length)return _t(`${assetKindLabel()}仍被 ${refs.length} 个${assetRefKindLabel()}引用（${refs.join('、')}），请先解除引用`,`${assetKindLabel()} is still referenced by ${refs.length} ${assetRefKindLabel()}(s) (${refs.join(', ')}); remove references first`);
  return '';
}
async function deleteAsset(id){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const item=(state.data[state.assetType]||[]).find(x=>x.id===id);
  if(!item)return toast(_t('资产不存在或已删除','Asset does not exist or was deleted'));
  if(!catalogOwned(item.projectId))return toast(_t('只能删除本项目的资产','Only assets in this project can be deleted'));
  const blocked=assetDeleteBlocked(item);
  if(blocked)return toast(blocked);
  const label=assetKindLabel();
  if(!await afConfirm({title:_t(`删除${label}确认`,`Delete ${label}`),message:_t(`确认删除${label}「${item.name}」？此操作不可恢复。`,`Delete ${label} "${item.name}"? This action cannot be undone.`),confirmText:_t('确认删除','Delete'),danger:true}))return;
  try{
    await api(`/api/${state.assetType}?id=${encodeURIComponent(id)}`,{method:'DELETE'});
    state.data[state.assetType]=(state.data[state.assetType]||[]).filter(x=>x.id!==id);
    if(state.selectedAsset===id)await closeAssetDetail({force:true});
    else renderAssets();
    toast(_t(`${label}已删除`,`${label} deleted`));
  }catch(e){toast(e.message||_t('删除失败','Delete failed'))}
}
function assetKind(){return assetKindLabel()}
function ruleGlobalFields(a){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const on=!!a.global;return `<div class="rule-global-block"><label class="rule-global-row"><span><b>${_t('作为全局规则','Global Rule')}</b><small>${_t('开启后选择要生效的 SOP。该 SOP 的每个节点执行时都会带上这条规则。','When enabled, select SOPs where this rule applies to every node execution.')}</small></span><input name="global" type="checkbox" class="rule-global-input" role="switch" ${on?'checked':''}></label><div id="ruleSOPPickerWrap" class="rule-global-sops" ${on?'':'hidden'}><label>${_t('应用到 SOP','Apply to SOPs')}</label><div id="ruleSOPPicker" class="repo-picker"></div><div class="json-help">${_t('从下拉框添加，点击标签移除。选中的 SOP 在运行时，其全部节点都会注入本规则。','Add from dropdown; click a tag to remove. All nodes in selected SOPs will receive this rule at runtime.')}</div></div></div>`}
function ruleSOPChoices(){return runnableWorkflowOptions()}
function selectedRuleWorkflowIds(){try{const ids=JSON.parse($('#ruleSOPPicker')?.dataset.ids||'[]');return Array.isArray(ids)?ids:[]}catch{return []}}
function setRuleWorkflowIds(ids){const host=$('#ruleSOPPicker');if(!host)return;const known=new Set(ruleSOPChoices().map(w=>w.id));host.dataset.ids=JSON.stringify([...new Set((ids||[]).map(id=>String(id||'').trim()).filter(id=>id&&known.has(id)))]);renderRuleSOPPicker();markAssetDirty()}
function renderRuleSOPPicker(){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const host=$('#ruleSOPPicker');if(!host)return;const sops=ruleSOPChoices();const selected=selectedRuleWorkflowIds();const chosen=new Set(selected);const leftover=sops.filter(w=>!chosen.has(w.id));const tags=selected.map(id=>{const sop=sops.find(w=>w.id===id);const name=sop?.name||id;const nodes=sop?.nodes?.length||0;const label=nodes?_t(`${name} · ${nodes} 个节点`,`${name} · ${nodes} nodes`):name;return `<button type="button" class="repo-picker-tag" data-remove-rule-sop="${escapeHTML(id)}" title="${_t('点击移除','Click to remove')}">${escapeHTML(label)}<span aria-hidden="true">×</span></button>`}).join('');const options=leftover.map(w=>`<option value="${escapeHTML(w.id)}">${escapeHTML(w.name)}${w.nodes?.length?_t(` · ${w.nodes.length} 个节点`,` · ${w.nodes.length} nodes`):''}</option>`).join('');const placeholder=!sops.length?_t('暂无可选 SOP','No available SOPs'):(!leftover.length?_t('已全部选择','All selected'):_t('＋ 添加 SOP…','+ Add SOP…'));host.innerHTML=`<div class="repo-picker-field">${tags}<select class="repo-picker-select"${leftover.length?'':' disabled'}><option value="">${placeholder}</option>${options}</select></div>`;host.querySelectorAll('[data-remove-rule-sop]').forEach(b=>b.onclick=()=>setRuleWorkflowIds(selected.filter(id=>id!==b.dataset.removeRuleSop)));const sel=host.querySelector('select');if(sel)sel.onchange=()=>{if(!sel.value)return;setRuleWorkflowIds([...selected,sel.value])}}
function bindRuleGlobalPicker(a){const host=$('#ruleSOPPicker');if(!host)return;const known=new Set(ruleSOPChoices().map(w=>w.id));host.dataset.ids=JSON.stringify((Array.isArray(a.workflowIds)?a.workflowIds:[]).filter(id=>known.has(id)));const toggle=document.querySelector('#assetForm [name="global"]');const wrap=$('#ruleSOPPickerWrap');const sync=()=>{if(wrap)wrap.hidden=!(toggle&&toggle.checked)};if(toggle)toggle.onchange=sync;sync();renderRuleSOPPicker()}
function dockerfileOptions(selected){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const items=(state.data.dockerfiles||[]).filter(x=>catalogVisible(x.projectId,x.shared));if(!items.length)return `<option value="">${_t('请先创建 Dockerfile','Create a Dockerfile first')}</option>`;return `<option value="">${_t('选择 Dockerfile','Select Dockerfile')}</option>`+items.map(x=>`<option value="${escapeHTML(x.id)}" ${x.id===selected?'selected':''}>${escapeHTML(x.name||x.id)}${catalogForeign(x.projectId)?_t(' · 共享',' · Shared'):''}</option>`).join('')}
function environmentOptions(selected){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const items=(state.data.environments||[]).filter(x=>catalogVisible(x.projectId,x.shared));return `<option value="">${_t('不选择（可用 workspace 的 agentflow-environment）','None (can use workspace agentflow-environment)')}</option>`+items.map(x=>`<option value="${escapeHTML(x.id)}" ${x.id===selected?'selected':''}>${escapeHTML(x.name||x.id)}${catalogForeign(x.projectId)?_t(' · 共享',' · Shared'):''}</option>`).join('')}
// seatbelt / bwrap are the per-OS forms of native; rows saved before the merge still carry them.
function sandboxDriverOption(driver){return ['seatbelt','bwrap','native'].includes(driver)?'native':driver==='docker'?'docker':'local'}
function syncSandboxDriverFields(select){const driver=select?.value||'local';select?.form?.querySelectorAll('[data-sandbox-drivers]').forEach(el=>{el.hidden=!el.dataset.sandboxDrivers.split(' ').includes(driver)})}
function resolveAssetSaveIdentity(items,selectedID,requestedID){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;if(selectedID!=='__new__'){const existing=(items||[]).find(item=>item.id===selectedID);return existing?{id:existing.id,existing,created:false}:{error:_t('选中的资产已不存在，请刷新后重试','Selected asset no longer exists; please refresh and retry')}}if((items||[]).some(item=>item.id===requestedID))return {error:_t('该标识已存在，请换一个标识，或回到列表打开已有资产修改','ID already exists; choose another ID or open the existing asset from the list')};return {id:requestedID,existing:null,created:true}}
function assetPaneTabs(type=state.assetType){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return ({rules:[['edit',_t('编辑','Edit')],['preview',_t('预览','Preview')]],skills:[['files',_t('文件','Files')]],dockerfiles:[['content','Dockerfile'],['files',_t('构建上下文','Build Context')]],environments:[['script','install.sh'],['vars',_t('环境变量','Env Vars')],['path','PATH']],sandboxes:[['env',_t('环境变量','Env Vars')]]})[type]||[['edit',_t('编辑','Edit')]]}
function assetPaneHint(type=state.assetType){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;return ({rules:_t('支持 Markdown','Markdown supported'),skills:_t('每次上传都会完整替换现有文件','Each upload completely replaces existing files'),dockerfiles:_t('沙箱初始化时用库里这份 docker build','Used for docker build during sandbox initialization'),environments:_t('脚本把工具装进 $PREFIX','Script installs tools into $PREFIX'),sandboxes:_t('驱动与执行环境在右侧设置，不要在这里保存凭证','Configure driver and environment on the right; do not store credentials here')})[type]||''}
function assetMainPanesHTML(a,{creating,readonly}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const pane=(key,body)=>`<div class="asset-tabpanel" data-asset-pane="${key}" role="tabpanel">${body}</div>`;
  if(state.assetType==='rules')return pane('edit',`<textarea name="content" class="asset-editor" rows="18" placeholder="${_t('写入必须遵守的行为和约束','Write required behaviors and constraints')}">${escapeHTML(a.content||'')}</textarea>`)+pane('preview',`<div class="asset-md markdown-body" data-asset-preview></div>`);
  if(state.assetType==='skills'){
    if(creating)return pane('files',`<div class="asset-empty is-inline"><b>${_t('先创建技能，再上传文件','Create the skill first, then upload files')}</b><p>${_t('支持文件夹、.zip 压缩包或单独的 SKILL.md。','Supports folders, .zip archives, or a standalone SKILL.md.')}</p></div>`);
    const src=assetSkillSource(a),locked=readonly||!!src;
    return pane('files',`<div class="skill-upload-block">
    ${src?`<div class="asset-source-note">${huiIcon('lock')}<span>${_t(`文件来自 SkillHub v${escapeHTML(src.version)}，只读；如需新版本请点更新。`,`Files from SkillHub v${escapeHTML(src.version)} (read-only); click Update for a newer version.`)}</span></div>`:''}
    <div class="skill-upload-actions"${locked?' hidden':''}>
      <input type="file" id="skillFolderPick" webkitdirectory multiple style="display:none">
      <input type="file" id="skillZipPick" accept=".zip,application/zip,application/x-zip-compressed" style="display:none">
      <input type="file" id="skillMdPick" accept=".md,.markdown,text/markdown" style="display:none">
      <button type="button" class="button skill-upload-btn" id="skillFolderBtn">${huiIcon('folder')}${_t('选择文件夹','Select Folder')}</button>
      <button type="button" class="button skill-upload-btn" id="skillZipBtn">${huiIcon('download')}${_t('上传 .zip 压缩包','Upload .zip')}</button>
      <button type="button" class="button skill-upload-btn skill-upload-btn-overwrite" id="skillMdBtn">${huiIcon('doc')}${_t('上传 SKILL.md','Upload SKILL.md')}</button>
    </div>
    <div id="skillUploadStatus" class="skill-upload-status">${state.skillUploadStatus||''}</div>
    ${skillFileRowsHTML(a)}
    ${locked?'':`<div class="json-help">${_t('每次上传都是<b>完全替换</b>：文件夹 / zip 替换为整批文件；单独上传 SKILL.md 会先弹出确认，然后该技能<b>只保留这一份 SKILL.md</b>。单文件 ≤1MB，最多 500 个，单技能 ≤64MB。<b>zip 自动解包并保留可执行位</b>；markdown / 代码 / 图片可直接预览。','Every upload is a <b>full replacement</b>: folder/zip replaces all files; uploading a standalone SKILL.md asks for confirmation and <b>keeps only that SKILL.md</b>. Max 1MB/file, 500 files, 64MB/skill. <b>Zip files are extracted automatically with executable bits preserved</b>; markdown, code, and images can be previewed.')}</div>`}
  </div>`);
  }
  if(state.assetType==='dockerfiles')return pane('content',`<textarea name="content" class="asset-editor" rows="18" placeholder="FROM node:22-bookworm-slim">${escapeHTML(a.content||'')}</textarea><div class="json-help">${_t('正文和附加文件保存在这条 Dockerfile 资产里，写入数据库，和 <code>install.sh</code> 一样。不要指向仓库目录或现成镜像名。沙箱初始化时用库里这份 <code>docker build</code> 出一次性镜像。','Content and extra files are stored in the database with this Dockerfile asset (like <code>install.sh</code>). Do not reference repo directories or prebuilt image names; sandboxes run <code>docker build</code> on it to create a disposable image.')}</div>`)+pane('files',`<label class="asset-field-label">${_t('构建上下文文件 JSON','Build Context Files JSON')}</label><textarea name="files" class="asset-editor is-short" rows="8" placeholder='{"packages.txt":"git\\ncurl"}'>${escapeHTML(JSON.stringify(a.files||{},null,2))}</textarea><div class="json-help">${_t('键是构建上下文里的相对路径，值是文件内容；与 Dockerfile 一起保存。','Keys are relative paths in the build context, and values are file contents; saved with the Dockerfile.')}</div>`);
  if(state.assetType==='environments')return pane('script',`<textarea name="installScript" class="asset-editor" rows="18" placeholder="#!/bin/sh&#10;set -e&#10;mkdir -p &quot;$PREFIX/bin&quot;&#10;curl -fsSL https://mirror.example/php.tgz | tar -xz -C &quot;$PREFIX&quot;">${escapeHTML(a.installScript||'')}</textarea><div class="json-help">${_t('脚本保存在环境资产里。Studio 保存即写库；下次沙箱初始化会按库里这份执行，把工具装进 <code>$PREFIX</code>。不要往宿主机写。脚本内容变化后会重新安装。','Script is stored in the database. Next sandbox initialization runs it to install tools into <code>$PREFIX</code> without writing to the host. Reinstalls when script content changes.')}</div>`)+pane('vars',`<label class="asset-field-label">${_t('环境变量 JSON','Environment Variables JSON')}</label><textarea name="variables" class="asset-editor is-short" rows="8" placeholder='{"PHP_VERSION":"7.4.33"}'>${escapeHTML(JSON.stringify(a.variables||{},null,2))}</textarea>`)+pane('path',`<label class="asset-field-label">${_t('PATH 条目 <small>相对 $PREFIX，每行一个，默认 bin</small>','PATH Entries <small>Relative to $PREFIX, one per line, default bin</small>')}</label><textarea name="pathEntries" class="asset-editor is-short" rows="6" placeholder="bin">${escapeHTML((a.pathEntries||[]).join('\n'))}</textarea>`);
  if(state.assetType==='sandboxes')return pane('env',`<label class="asset-field-label">${_t('环境变量 JSON','Environment Variables JSON')}</label><textarea name="environment" class="asset-editor is-short" rows="10" placeholder='{"NAME":"value"}'>${escapeHTML(JSON.stringify(a.environment||{},null,2))}</textarea><div class="json-help">${_t('叠加到沙箱基础环境并随资产持久化；不要在这里保存凭证。平台凭证、HOME/TMPDIR 和遥测变量拥有更高优先级。','Merged into the sandbox base environment and persisted with the asset; do not store credentials here. Platform credentials, HOME/TMPDIR, and telemetry variables take precedence.')}</div>`);
  return '';
}
function assetBasicFieldsHTML(a,{creating}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const kind=assetKindLabel();
  let html=`<label class="asset-field-label" for="assetFieldName">${_t('名称','Name')}</label><input id="assetFieldName" name="name" class="asset-input" value="${escapeHTML(a.name||'')}" required placeholder="${_t(`给${escapeHTML(kind)}起个名字`,`Name this ${escapeHTML(kind)}`)}"><label class="asset-field-label" for="assetFieldId">${_t('标识','ID')}</label><input id="assetFieldId" name="id" class="asset-input is-mono" value="${escapeHTML(a.id||'')}" required ${creating?`placeholder="${_t('如 loopforge-core','e.g. loopforge-core')}"`:'readonly aria-readonly="true"'}><div class="asset-field-hint">${creating?_t('创建后不可修改，用于资产引用。','Cannot be changed after creation; used for asset references.'):_t('标识用于资产引用，创建后不可修改。','Used for asset references; cannot be changed after creation.')}</div><label class="asset-field-label" for="assetFieldDesc">${_t('描述','Description')}</label><input id="assetFieldDesc" name="description" class="asset-input" value="${escapeHTML(a.description||'')}" placeholder="${_t('一句话说明用途','Brief description of purpose')}">`;
  if(state.assetType==='rules')html+=`<label class="asset-field-label" for="assetFieldPriority">${_t('优先级','Priority')}</label><input id="assetFieldPriority" name="priority" class="asset-input" type="number" value="${a.priority||100}"><div class="asset-field-hint">${_t('数值越大越先注入。','Higher values are injected first.')}</div>${ruleGlobalFields(a)}`;
  if(state.assetType==='sandboxes')html+=`<label class="asset-field-label">${_t('隔离方式','Isolation Driver')}</label><select name="driver" class="asset-select" aria-label="${_t('隔离方式','Isolation Driver')}"><option value="local" ${sandboxDriverOption(a.driver)==='local'?'selected':''}>${_t('local（本机直接执行）','local (direct host execution)')}</option><option value="native" ${sandboxDriverOption(a.driver)==='native'?'selected':''}>${_t('native（系统轻量隔离）','native (lightweight OS isolation)')}</option><option value="docker" ${sandboxDriverOption(a.driver)==='docker'?'selected':''}>${_t('docker（OCI 容器）','docker (OCI container)')}</option></select><div data-sandbox-drivers="local" class="json-help">${_t('直接在本机 workspace 执行，并继承受控的宿主进程环境。','Executes directly in the local workspace with a controlled host environment.')}</div><div data-sandbox-drivers="native" class="json-help">${_t('按执行机器的系统自动选择：macOS 用 seatbelt，Linux 用 bwrap。','Automatically selected by host OS: seatbelt on macOS, bwrap on Linux.')}</div><div data-sandbox-drivers="native"><label class="asset-field-label">${_t('执行环境','Environment')}</label><select name="environmentId" class="asset-select" aria-label="${_t('执行环境','Environment')}">${environmentOptions(a.environmentId)}</select><div class="json-help">${_t('选中后沙箱会执行该环境的 <code>install.sh</code>，把工具装进隔离的 <code>$PREFIX</code>，再用 PATH 切换。未选择时，若 workspace 存在 <code>agentflow-environment/</code> 也会自动启用。','When selected, the sandbox runs its <code>install.sh</code> to install tools into an isolated <code>$PREFIX</code> and updates PATH. If unset, <code>agentflow-environment/</code> in the workspace is used automatically if present.')}</div></div><div data-sandbox-drivers="docker"><label class="asset-field-label">Dockerfile</label><select name="dockerfileId" class="asset-select" aria-label="Dockerfile">${dockerfileOptions(a.dockerfileId)}</select><div class="json-help">${_t('沙箱只引用这条目录资产；初始化时用库里的内容构建临时镜像，结束后删除容器和镜像。','References this Dockerfile asset; builds a temporary image at initialization and removes the container and image afterward.')}</div>
    <div class="asset-switch-row">
      <label for="assetReadOnlyRootFS">
        <b>${_t('容器根文件系统只读','Read-only Root Filesystem')}</b>
        <small>${_t('开启后，/usr、/etc 等系统目录只读，/tmp 使用临时内存盘。默认建议关闭。','When enabled, /usr, /etc, and other system directories are read-only and /tmp uses tmpfs. Recommended off by default.')}</small>
      </label>
      <span class="asset-switch-controls">
        <input id="assetReadOnlyRootFS" name="readOnlyRootFS" type="checkbox" class="asset-switch" role="switch" ${a.readOnlyRootFS?'checked':''}>
        <button id="assetReadOnlyRootFSHelp" type="button" class="field-help" aria-label="${_t('容器根文件系统只读说明','Read-only root filesystem help')}" title="${_t('开启后，缺少的 CLI 无法在容器内自动安装。工作区 /workspace 仍可写。','When enabled, missing CLIs cannot be auto-installed inside the container. /workspace remains writable.')}">?</button>
      </span>
    </div></div>`;
  return html;
}
function assetAsideHTML(a,{creating}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return `<section class="asset-side-card"><h4>${_t('基本信息','Basic Info')}</h4>${assetBasicFieldsHTML(a,{creating})}</section>${creating?'':`<section class="asset-side-card" data-asset-refs>${assetRefsCardHTML(a)}</section><section class="asset-side-card" data-asset-overview>${assetOverviewCardHTML(a)}</section>`}`;
}
function setAssetTab(key){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#assetForm');if(!f)return;
  const tabs=assetPaneTabs();if(!tabs.some(([k])=>k===key))key=tabs[0][0];
  state.assetTab=key;
  f.querySelectorAll('[data-asset-tab]').forEach(b=>{const on=b.dataset.assetTab===key;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
  f.querySelectorAll('[data-asset-pane]').forEach(p=>p.hidden=p.dataset.assetPane!==key);
  if(key==='preview'){const host=f.querySelector('[data-asset-preview]');const text=f.elements.content?.value||'';if(host)host.innerHTML=text.trim()?renderMarkdown(text):`<p class="asset-md-empty">${_t('还没有内容','No content yet')}</p>`}
}
function renderAssetForm(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const f=$('#assetForm');if(!f||!a)return;
  const creating=state.selectedAsset==='__new__',readonly=!creating&&!catalogOwned(a.projectId);
  const tabs=assetPaneTabs(),kind=assetKindLabel();
  const summary=state.assetType==='skills'&&!creating?`<span data-skill-summary>${skillFileSummary(a)}</span>`:'';
  const save=readonly?'':`<div class="asset-panel-foot"><button type="submit" class="button primary">${creating?`${huiIcon('plus')}${_t(`创建${escapeHTML(kind)}`,`Create ${escapeHTML(kind)}`)}`:`${huiIcon('save')}${_t('保存修改','Save Changes')}`}</button></div>`;
  f.innerHTML=`<section class="asset-panel asset-main"><div class="asset-panel-head"><div class="asset-pane-tabs" role="tablist" aria-label="${_t(`${escapeHTML(kind)}内容`,`${escapeHTML(kind)} content`)}">${tabs.map(([k,label])=>`<button type="button" role="tab" data-asset-tab="${k}">${escapeHTML(label)}</button>`).join('')}</div><span class="asset-panel-hint">${summary||escapeHTML(assetPaneHint())}</span></div><div class="asset-stage">${assetMainPanesHTML(a,{creating,readonly})}</div>${save}</section><aside class="asset-aside">${assetAsideHTML(a,{creating})}</aside>`;
  f.querySelectorAll('[data-asset-tab]').forEach(b=>b.onclick=()=>setAssetTab(b.dataset.assetTab));
  setAssetTab(state.assetTab||tabs[0][0]);
  if(state.assetType==='rules')bindRuleGlobalPicker(a);
  if(state.assetType==='sandboxes'){
    f.elements.driver.onchange=()=>syncSandboxDriverFields(f.elements.driver);
    syncSandboxDriverFields(f.elements.driver);
    f.querySelector('#assetReadOnlyRootFSHelp')?.addEventListener('click',event=>{
      window.HuiTooltip?.show(event.currentTarget);
    });
  }
  f.querySelectorAll('select.asset-select').forEach(sel=>window.enhanceSelect?.(sel));
  if(readonly)f.querySelectorAll('input,textarea,select,.repo-picker-tag').forEach(el=>{if(el.type!=='file')el.disabled=true});
  if(state.assetType==='skills'&&!creating){skillUploadButtons(readonly||!!assetSkillSource(a));bindAssetSourceActions(a)}
}
function fmtBytes(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';return (n/1024/1024).toFixed(1)+' MB'}
function skillFileSummary(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const refs=a.fileRefs||[];
  const total=refs.reduce((s,r)=>s+(r.size||0),0);
  return `<span class="chip">${_t(`${refs.length} 个文件`,`${refs.length} files`)} · ${fmtBytes(total)}</span>`;
}
function skillFileIcon(path){
  const ext=path.toLowerCase().split('.').pop()||'';
  if(['md','markdown'].includes(ext))return 'MD';
  if(['png','jpg','jpeg','gif','webp','svg'].includes(ext))return 'IMG';
  if(['json','yaml','yml','toml','xml'].includes(ext))return '{}';
  if(['sh','bash','py','js','ts','go','rs','css','html','sql','lua','rb','java','c','cpp','h'].includes(ext))return '<>';
  if(['zip','tar','gz','tgz','bz2','xz'].includes(ext))return 'ZIP';
  return '📄';
}
function skillFilePreviewable(path){
  const ext=path.toLowerCase().split('.').pop()||'';
  return ['md','markdown','txt','log','json','yaml','yml','xml','sh','bash','py','js','ts','go','rs','css','html','sql','lua','rb','java','c','cpp','h','png','jpg','jpeg','gif','webp','svg'].includes(ext);
}
function skillFileLang(path){
  const ext=path.toLowerCase().split('.').pop()||'';
  const m={sh:'bash',bash:'bash',py:'python',js:'javascript',ts:'typescript',go:'go',rs:'rust',rb:'ruby',lua:'lua',java:'java',c:'c',cpp:'cpp',h:'c',yaml:'yaml',yml:'yaml',toml:'toml',xml:'xml',json:'json',sql:'sql',md:'markdown',markdown:'markdown',html:'html',css:'css',svg:'xml'};
  return m[ext]||'TEXT';
}
function selectedSkill(){return (state.data.skills||[]).find(x=>x.id===state.selectedAsset)||null}
function skillWriteBlocked(){const skill=selectedSkill();return !skill||catalogForeign(skill.projectId)||!!assetSkillSource(skill)}
function refreshSkillFileTree(){
  const skill=selectedSkill();
  const host=$('#skillFileTree')||$('#assetForm .skill-upload-block > .empty-inline');
  if(!host||!skill)return;
  host.outerHTML=skillFileRowsHTML(skill);
}
function skillFileRowsHTML(a){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const refs=a.fileRefs||[];
  if(!refs.length)return `<p class="empty-inline">${_t('还没有文件。选择文件夹或 zip 后自动上传。','No files yet. Select a folder or zip to upload automatically.')}</p>`;
  const base=`/api/skills/${encodeURIComponent(a.id)}/files`;
  const readonly=catalogForeign(a.projectId)||!!assetSkillSource(a);
  if(!(state.skillTreeCollapsed instanceof Set))state.skillTreeCollapsed=new Set();
  // 构建 VS Code 风格文件树：目录可折叠，文件带预览/下载；本项目技能才显示删除
  const root={dirs:{},files:[]};
  refs.forEach(r=>{
    const segs=r.path.split('/');
    let node=root;
    for(let i=0;i<segs.length-1;i++){
      const seg=segs[i];
      if(!node.dirs[seg])node.dirs[seg]={dirs:{},files:[]};
      node=node.dirs[seg];
    }
    node.files.push(r);
  });
  const countFiles=node=>{
    let n=node.files.length;
    Object.values(node.dirs).forEach(d=>n+=countFiles(d));
    return n;
  };
  const html=[];
  (function render(node,depth,prefix){
    Object.keys(node.dirs).sort((x,y)=>x.localeCompare(y)).forEach(d=>{
      const child=node.dirs[d];
      const full=prefix+d;
      const collapsed=state.skillTreeCollapsed.has(full);
      html.push(`<div class="skill-tree-row" data-tree-toggle="${escapeHTML(full)}" style="padding-left:${depth*14+4}px"><span class="skill-tree-caret">${collapsed?'▸':'▾'}</span><span class="skill-file-icon">📁</span><code class="skill-tree-dirname">${escapeHTML(d)}/</code><span class="chip">${countFiles(child)}</span></div>`);
      if(!collapsed){
        html.push('<div class="skill-tree-children">');
        render(child,depth+1,full+'/');
        html.push('</div>');
      }
    });
    node.files.sort((x,y)=>x.path.localeCompare(y.path)).forEach(r=>{
      const name=r.path.split('/').pop();
      const url=`${base}/${r.path.split('/').map(encodeURIComponent).join('/')}`;
      const canPreview=skillFilePreviewable(r.path);
      html.push(`<div class="skill-file-row" style="padding-left:${depth*14+18}px" title="${escapeHTML(r.path)}"><span class="skill-file-icon">${skillFileIcon(r.path)}</span><code class="skill-file-path">${escapeHTML(name)}</code><span class="chip">${fmtBytes(r.size)}</span>${(r.mode&0o111)?`<span class="chip">${_t('可执行','Executable')}</span>`:''}<button type="button" class="skill-file-preview" data-skill-file-preview="${escapeHTML(r.path)}" title="${_t('预览','Preview')}" ${canPreview?'':'disabled'}>${_t('预览','Preview')}</button><a href="${url}" download title="${_t('下载','Download')}">${_t('下载','Download')}</a>${readonly?'':`<button type="button" class="skill-file-del" data-skill-file-del="${escapeHTML(r.path)}" title="${_t('删除','Delete')}">×</button>`}</div>`);
    });
  })(root,0,'');
  return `<div id="skillFileTree" class="skill-file-list skill-file-tree">${html.join('')}</div>`;
}
function setSkillUploadStatus(html){
  state.skillUploadStatus=html||'';
  const el=$('#skillUploadStatus');
  if(el)el.innerHTML=state.skillUploadStatus;
}
function skillUploadButtons(disabled){
  ['skillFolderBtn','skillZipBtn','skillMdBtn','skillFolderPick','skillZipPick','skillMdPick'].forEach(id=>{
    const el=$('#'+id); if(el)el.disabled=!!disabled;
  });
}
let skillUploadLastStart=0;
async function uploadSkillFiles(input){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const now=Date.now();
  if(now-skillUploadLastStart<800)return; // change + 轮询双触发去重
  skillUploadLastStart=now;
  const files=[...(input.files||[])];
  if(input)input.value='';
  if(!files.length)return toast(_t('没有读取到任何文件，请重新选择','No files read; please select again'));
  const id=state.selectedAsset;
  if(state.selectedAsset==='__new__')return toast(_t('先保存技能，再上传文件','Save the skill first, then upload files'));
  if(skillWriteBlocked())return toast(_t('共享资产只读','Shared assets are read-only'));
  const totalBytes=files.reduce((s,f)=>s+f.size,0);
  const totalLabel=fmtBytes(totalBytes);
  skillUploadButtons(true);

  // 取消控制：读文件阶段用标志位，fetch 阶段用 AbortController
  let cancelled=false;
  const ctrl=new AbortController();
  const cancelBtnHTML=`<button type="button" class="skill-upload-cancel">${_t('取消','Cancel')}</button>`;
  const renderRow=(label,pct)=>`<div class="skill-upload-progress"><span>${label}</span><div class="skill-upload-bar ${pct<0?'indeterminate':''}"><i style="width:${Math.max(0,pct<0?30:pct)}%"></i></div><b class="skill-upload-pct">${pct<0?'···':`${pct}%`}</b>${cancelBtnHTML}</div>`;
  const bindCancel=()=>{const b=$('#skillUploadStatus .skill-upload-cancel');if(b)b.onclick=()=>{cancelled=true;ctrl.abort();toast(_t('已取消上传','Upload cancelled'))}};
  const setStatusRow=(label,pct)=>{setSkillUploadStatus(renderRow(label,pct));bindCancel()};

  const buildFd=parts=>{
    const fd=new FormData();
    // 相对路径走并行 paths 字段：multipart 的 filename 会被服务端只保留 basename。
    parts.forEach(p=>{fd.append('paths',p.path);fd.append('files',p.blob,p.path.split('/').pop())});
    return fd;
  };
  const finishOk=data=>{
    const i=(state.data.skills||[]).findIndex(x=>x.id===id);
    if(i>=0)state.data.skills[i]=data;else state.data.skills.push(data);
    setSkillUploadStatus(`<div class="skill-upload-ok">${_t(`✓ 已替换为 ${files.length} 个文件 · ${totalLabel}（${new Date().toLocaleTimeString()}）`,`✓ Replaced with ${files.length} file(s) · ${totalLabel} (${new Date().toLocaleTimeString()})`)}</div>`);
    renderAssets();renderProperties();
    toast(_t(`已替换为 ${files.length} 个文件`,`Replaced with ${files.length} file(s)`),'ok');
  };
  const showFail=err=>{
    setSkillUploadStatus(`<div class="skill-upload-err">${_t(`✕ ${escapeHTML(err.message)}。现有文件未改动。`,`✕ ${escapeHTML(err.message)}. Existing files are unchanged.`)}</div>`);
    toast(err.message,'err',8000);
  };

  // ===== 方式 A：先逐文件读入内存（8 并发，单文件 3s 超时） =====
  const parts=new Array(files.length);
  let done=0, readBytes=0, readErr=null;
  const queue=files.map((_,idx)=>idx);
  setStatusRow(_t(`正在读取 0/${files.length} 个文件`,`Reading 0/${files.length} files`),-1);
  const readWithTimeout=async(f,ms)=>{
    let timer;
    const timeoutP=new Promise((_,rej)=>{timer=setTimeout(()=>rej(new Error('__read_timeout__')),ms)});
    const buf=await Promise.race([f.arrayBuffer(),timeoutP]).finally(()=>clearTimeout(timer));
    return buf;
  };
  const workers=Array.from({length:Math.min(8,files.length)},async()=>{
    while(queue.length&&!cancelled&&!readErr){
      const idx=queue.shift();
      const f=files[idx];
      const rel=f.webkitRelativePath||f.name;
      let buf;
      try{
                buf=await readWithTimeout(f,3000);
      }catch(err){
        if(err.message==='__read_timeout__'){
          readErr=new Error(_t(`读取文件超时：${rel}。浏览器读取文件内容被系统/安全软件阻断，将尝试流式直传。`,`Timed out reading ${rel}. Browser file access may be blocked by security software; trying streaming upload.`));
        }else{
          readErr=new Error(_t(`读取文件失败：${rel}（${err.message}）`,`Failed to read ${rel} (${err.message})`));
        }
        return;
      }
      parts[idx]={path:rel,blob:new Blob([buf])};
      done++;readBytes+=buf.byteLength;

      setStatusRow(_t(`正在读取 ${done}/${files.length} 个文件 · 已读取 ${fmtBytes(readBytes)}`,`Reading ${done}/${files.length} files · ${fmtBytes(readBytes)}`),-1);
    }
  });
  try{await Promise.all(workers)}
  catch(err){if(!readErr)readErr=new Error(_t(`读取过程异常：${err.message}`,`Read error: ${err.message}`))}
  if(cancelled){
    setSkillUploadStatus(`<div class="skill-upload-err">${_t('已取消上传，现有文件未改动。','Upload cancelled; existing files are unchanged.')}</div>`);
    skillUploadButtons(false);
    return;
  }

  let fetchP=null;
  if(!readErr){
    const fd=buildFd(parts);
    fetchP=fetch(`/api/skills/${encodeURIComponent(id)}/files`,{method:'POST',body:fd,signal:ctrl.signal});
  }else{
    // ===== 方式 B（降级）：流式直传原始 File，由浏览器网络进程读取 =====
    setStatusRow(_t(`读取受阻，正在尝试流式直传 ${files.length} 个文件…`,`Read blocked; trying streaming upload for ${files.length} file(s)…`),-1);
    const fd=buildFd(files.map(f=>({path:f.webkitRelativePath||f.name,blob:f})));
    fetchP=fetch(`/api/skills/${encodeURIComponent(id)}/files`,{method:'POST',body:fd,signal:ctrl.signal});
  }

  // ===== 上传等待：模拟进度 + 看门狗 15s 必给结论 =====
  let fakePct=8;
  const ticker=setInterval(()=>{
    fakePct=Math.min(88,fakePct+Math.random()*10+4);
    setStatusRow(_t(`上传中 ${Math.round(fakePct)}% · ${files.length} 个文件 · ${totalLabel}`,`Uploading ${Math.round(fakePct)}% · ${files.length} file(s) · ${totalLabel}`),Math.round(fakePct));
  },220);
  const watchdog=setTimeout(()=>{
    ctrl.abort();
    setSkillUploadStatus(`<div class="skill-upload-err">${_t('✕ 上传超过 15 秒未完成，已中止。浏览器读取/发送文件被环境阻断（常见于安全管控软件）。现有文件未改动。','✕ Upload timed out after 15s and was aborted. Browser file access/sending may be blocked by security software. Existing files are unchanged.')}</div>`);
  },15000);
  try{
    const res=await fetchP;
    clearTimeout(watchdog);clearInterval(ticker);

    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
    finishOk(data);
  }catch(err){
    clearTimeout(watchdog);clearInterval(ticker);
    if(cancelled||err.name==='AbortError'){
      if(!cancelled)setSkillUploadStatus(`<div class="skill-upload-err">${_t('✕ 上传超过 15 秒未完成，已中止。浏览器读取/发送文件被环境阻断（常见于安全管控软件）。现有文件未改动。','✕ Upload timed out after 15s and was aborted. Browser file access/sending may be blocked by security software. Existing files are unchanged.')}</div>`);
      else setSkillUploadStatus(`<div class="skill-upload-err">${_t('已取消上传，现有文件未改动。','Upload cancelled; existing files are unchanged.')}</div>`);
    }else{
      showFail(err);
    }
  }finally{
    skillUploadButtons(false);
  }
}
let skillMdUploadLastStart=0;
async function uploadSkillMd(input){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const now=Date.now();
  if(now-skillMdUploadLastStart<800)return;
  skillMdUploadLastStart=now;
  const files=[...(input.files||[])];
  if(input)input.value='';
  if(!files.length)return toast(_t('没有读取到任何文件，请重新选择','No files read; please select again'));
  const file=files[0];
  const lower=(file.name||'').toLowerCase();
  if(!lower.endsWith('.md')&&!lower.endsWith('.markdown'))return toast(_t('请选择 SKILL.md 或 .md 文件','Please select SKILL.md or a .md file'));
  if(file.size>1024*1024)return toast(_t('SKILL.md 超过 1MB 限制','SKILL.md exceeds the 1MB limit'),'err');
  const id=state.selectedAsset;
  if(!id||id==='__new__')return toast(_t('先保存技能，再上传文件','Save the skill first, then upload files'));
  if(skillWriteBlocked())return toast(_t('共享资产只读','Shared assets are read-only'));
  const skill=(state.data.skills||[]).find(x=>x.id===id)||{};
  const extra=(skill.fileRefs||[]).length;
  const ok=await afConfirm({
    title:_t('覆盖性更改','Overwrite Confirmation'),
    message:extra
      ?_t(`这是覆盖性更改：上传后该技能将只保留 SKILL.md，现有的 ${extra} 个文件（含 scripts、文档和其他资源）全部删除。此操作不可撤销。`,`This will overwrite existing files: only SKILL.md will be kept, and all ${extra} existing file(s) (including scripts, docs, and other resources) will be deleted. This cannot be undone.`)
      :_t('这是覆盖性更改：上传后该技能将只保留这一份 SKILL.md。此操作不可撤销。','This will overwrite existing files: only this SKILL.md will be kept. This cannot be undone.'),
    confirmText:_t('确认覆盖','Overwrite'),
    cancelText:_t('取消','Cancel'),
    danger:true
  });
  if(!ok)return;
  skillUploadButtons(true);
  setSkillUploadStatus(`<div class="skill-upload-progress"><span>${_t('正在覆盖为仅 SKILL.md…','Overwriting with SKILL.md only…')}</span><div class="skill-upload-bar indeterminate"><i></i></div><b class="skill-upload-pct">···</b></div>`);
  try{
    const fd=new FormData();
    fd.append('paths','SKILL.md');
    fd.append('files',file,'SKILL.md');
    const res=await fetch(`/api/skills/${encodeURIComponent(id)}/files`,{method:'POST',body:fd});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
    const i=(state.data.skills||[]).findIndex(x=>x.id===id);
    if(i>=0)state.data.skills[i]=data;else state.data.skills.push(data);
    setSkillUploadStatus(`<div class="skill-upload-ok">${_t(`✓ 已覆盖为仅 SKILL.md · ${fmtBytes(file.size)}（${new Date().toLocaleTimeString()}）`,`✓ Overwritten with SKILL.md only · ${fmtBytes(file.size)} (${new Date().toLocaleTimeString()})`)}</div>`);
    renderAssets();renderProperties();
    toast(_t('已覆盖为仅 SKILL.md','Overwritten with SKILL.md only'),'ok');
  }catch(err){
    setSkillUploadStatus(`<div class="skill-upload-err">${_t(`✕ ${escapeHTML(err.message)}。现有文件未改动。`,`✕ ${escapeHTML(err.message)}. Existing files are unchanged.`)}</div>`);
    toast(err.message,'err',8000);
  }finally{
    skillUploadButtons(false);
  }
}
async function deleteSkillFile(path){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!path)return;
  if(!await afConfirm({title:_t('删除文件','Delete File'),message:_t(`确定删除 ${path} 吗？此操作不可恢复。`,`Delete ${path}? This action cannot be undone.`),confirmText:_t('确认删除','Delete'),danger:true}))return;
  const id=state.selectedAsset;
  try{
    const res=await fetch(`/api/skills/${encodeURIComponent(id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
    const i=(state.data.skills||[]).findIndex(x=>x.id===id);
    if(i>=0)state.data.skills[i]=data;
    renderAssets();renderProperties();
    toast(_t('文件已删除','File deleted'),'ok');
  }catch(err){toast(err.message,'err')}
}
async function openSkillFilePreview(skill, path){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!path)return toast(_t('无法预览：缺少文件路径','Cannot preview: missing file path'),'err');
  if(!skill)return toast(_t('无法预览：未选中技能','Cannot preview: no skill selected'),'err');
  const ref=(skill.fileRefs||[]).find(r=>r.path===path)||{};
  const url=`/api/skills/${encodeURIComponent(skill.id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
  const host=$('#artifactPreview');
  if(!host)return toast(_t('预览窗口不可用','Preview window unavailable'),'err');
  host.innerHTML=`<div class="artifact-loading">${_t('正在加载文件…','Loading file…')}</div>`;
  $('#artifactModal').classList.add('open');
  try{
    const res=await fetch(url);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const blob=await res.blob();
    const ext=(path.split('.').pop()||'').toLowerCase();
    const isImg=['png','jpg','jpeg','gif','webp','svg'].includes(ext);
    const isMd=['md','markdown'].includes(ext);
    let viewMode=isMd?'preview':'source';
    const objectURL=URL.createObjectURL(blob);
    const text=isImg?'':await blob.text();
    const lang=skillFileLang(path);
    function renderModal(){
      const body=isImg
        ? `<div class="artifact-body"><img src="${objectURL}" alt="${escapeHTML(path)}" style="max-width:100%"></div>`
        : viewMode==='preview'
          ? `<div class="artifact-body"><div class="markdown-body">${renderMarkdown(text)}</div></div>`
          : `<div class="artifact-body"><pre class="artifact-content">${highlightCode(text, lang)}</pre></div>`;
      host.innerHTML=`<div class="artifact-preview-head"><div class="artifact-preview-head-left"><span class="artifact-preview-icon">${skillFileIcon(path)}</span><div class="artifact-preview-titles"><h2>${escapeHTML(path.split('/').pop())}</h2><div class="artifact-preview-sub"><span>${escapeHTML(path)}</span></div></div></div><div class="artifact-preview-head-actions"><a class="button ghost small" href="${url}" download>${_t('下载','Download')}</a></div></div><div class="artifact-preview-toolbar"><div class="artifact-toolbar-left">${isMd?`<div class="artifact-view-mode"><button type="button" class="artifact-mode-btn ${viewMode==='preview'?'active':''}" data-mode="preview">${_t('渲染预览','Preview')}</button><button type="button" class="artifact-mode-btn ${viewMode==='source'?'active':''}" data-mode="source">${_t('源码','Source')}</button></div>`:''}<div class="artifact-evidence-badges"><span>SHA-256: <code>${escapeHTML((ref.sha256||'—').slice(0,16))}${(ref.sha256||'').length>16?'…':''}</code></span><span>${fmtBytes(ref.size||blob.size||0)}</span></div></div></div>${body}`;
      host.querySelectorAll('.artifact-mode-btn').forEach(btn=>btn.onclick=()=>{viewMode=btn.dataset.mode;renderModal()});
    }
    renderModal();
  }catch(err){
    host.innerHTML=`<div class="artifact-loading">${_t('预览失败：','Preview failed: ')}${escapeHTML(err.message)}</div>`;
    toast(err.message,'err');
  }
}
async function saveAsset(e){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;e.preventDefault();const f=e.currentTarget,items=state.data[state.assetType]||[],projectScoped=isProjectSharedAsset(state.assetType),identity=resolveAssetSaveIdentity(items,state.selectedAsset,f.elements.id.value.trim());if(identity.error)return toast(identity.error);const existing=identity.existing;if(existing&&projectScoped&&catalogForeign(existing.projectId))return toast(_t('共享资产只读','Shared assets are read-only'));let value={id:identity.id,name:f.elements.name.value.trim(),description:f.elements.description.value,projectId:existing?(existing.projectId||''):(state.projectFilter||''),shared:projectScoped&&!!existing?.shared};if(!value.id||!value.name)return toast(_t('标识和名称不能为空','ID and name are required'));try{
  if(state.assetType==='rules'){const global=!!f.elements.global?.checked;Object.assign(value,{priority:Number(f.elements.priority.value),content:f.elements.content.value,global,workflowIds:global?selectedRuleWorkflowIds():[]})}
  if(state.assetType==='skills'){/* 文件经独立上传接口承载；此处只提交元数据。服务端会强制保留 Content/Files/FileRefs。 */}
  if(state.assetType==='dockerfiles')Object.assign(value,{content:f.elements.content.value,files:JSON.parse(f.elements.files.value||'{}')});
  if(state.assetType==='environments')Object.assign(value,{variables:JSON.parse(f.elements.variables.value||'{}'),pathEntries:lines(f.elements.pathEntries.value),installScript:f.elements.installScript.value});
  if(state.assetType==='sandboxes'){const driver=f.elements.driver.value,sandbox={driver,environment:JSON.parse(f.elements.environment.value||'{}')};if(driver==='docker')Object.assign(sandbox,{dockerfileId:f.elements.dockerfileId.value,readOnlyRootFS:f.elements.readOnlyRootFS.checked});if(driver==='native')Object.assign(sandbox,{environmentId:f.elements.environmentId.value});Object.assign(value,sandbox)}
  const endpoints={rules:'rules',skills:'skills',dockerfiles:'dockerfiles',environments:'environments',sandboxes:'sandboxes'};await api(`/api/${endpoints[state.assetType]}`,{method:'PUT',body:JSON.stringify(value)});const i=items.findIndex(x=>x.id===value.id);if(state.assetType==='skills'&&existing)value={...existing,...value,fileRefs:existing.fileRefs||[],content:existing.content||'',files:existing.files||{}};if(i>=0)items[i]=value;else items.push(value);state.selectedAsset=value.id;state.assetDirty=false;
  if(identity.created){history.replaceState(history.state,'',assetViewHash(state.assetType,value.id));state.assetDetailKey='';renderAssets()}
  else{renderAssetDetailHead(value);refreshAssetAside(value)}
  renderWorkflowMeta();renderProperties();toast(identity.created?_t('资产已创建','Asset created'):_t('资产修改已保存','Asset changes saved'));
  }catch(err){toast(err.message)}
}
