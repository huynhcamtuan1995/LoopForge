function githubConnectHTML(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return `<div class="github-connect" data-github-connect><p class="github-connect-intro">${_t('在 GitHub 确认授权后，即可选择你的仓库。无需复制令牌。','Authorize on GitHub to pick your repositories without copying tokens.')}</p><button type="button" class="credential-btn primary" data-github-start disabled>${_t('连接 GitHub','Connect GitHub')}</button><div class="github-connect-status" role="status" aria-live="polite" data-github-status>${_t('正在检查授权服务…','Checking authorization service…')}</div></div>`;
}

async function hydrateGitHubConnections(root=document){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const hosts=[...(root.matches?.('[data-github-connect]')?[root]:[]),...root.querySelectorAll('[data-github-connect]')];
  if(!hosts.length)return;
  try{
    const capability=await api('/api/auth/github',{silent:true});
    for(const host of hosts){
      if(!host.isConnected||host.dataset.busy==='true')continue;
      host.dataset.enabled=String(!!capability.enabled);
      const button=host.querySelector('[data-github-start]'),status=host.querySelector('[data-github-status]');
      button.hidden=!capability.enabled;button.disabled=!capability.enabled;
      button.textContent=_t('连接 GitHub','Connect GitHub');
      status.textContent=capability.enabled?_t('授权仅用于当前账号，可随时撤销。','Authorization applies only to this account and can be revoked anytime.'):_t('此实例已停用 GitHub 授权，可使用「访问令牌」连接仓库。','GitHub OAuth is disabled on this instance; connect via Personal Access Token instead.');
    }
  }catch(error){
    for(const host of hosts){host.querySelector('[data-github-status]').textContent=_t('暂时无法检查授权服务，请稍后重试。','Unable to check authorization service; please try again later.');const button=host.querySelector('[data-github-start]');button.hidden=false;button.disabled=false;button.textContent=_t('重新检查','Retry');host.dataset.enabled='false'}
  }
}

// The async Clipboard API only exists in secure contexts, so installs opened as
// http://SERVER_IP fall back to copying from a hidden field inside the dialog.
async function copyGitHubDeviceCode(value,trigger){
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(value);return true}catch{}}
  const field=document.createElement('textarea');
  field.value=value;field.readOnly=true;field.tabIndex=-1;field.setAttribute('aria-hidden','true');
  field.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0';
  (trigger?.parentNode||document.body).append(field);
  field.focus({preventScroll:true});field.select();
  let copied=false;
  try{copied=document.execCommand('copy')}catch{copied=false}
  field.remove();
  trigger?.focus?.({preventScroll:true});
  return copied;
}

function selectGitHubDeviceCode(code){
  const range=document.createRange();range.selectNodeContents(code);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}

async function startGitHubConnect(host){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(host.dataset.busy==='true')return;
  if(host.dataset.enabled!=='true'){await hydrateGitHubConnections(host);return}
  const button=host.querySelector('[data-github-start]'),status=host.querySelector('[data-github-status]');
  const actor=Number(state.currentUser?.id);
  host.dataset.busy='true';button.disabled=true;
  let timer,flow,deadline,active=true;
  const finish=()=>{active=false;clearTimeout(timer);host.dataset.busy='false';button.disabled=false};
  const fail=error=>{status.textContent=error.message;finish()};
  const poll=async()=>{
    if(!active)return;
    if(!host.isConnected||Number(state.currentUser?.id)!==actor){finish();return}
    if(Date.now()>=deadline){fail(new Error(_t('授权已过期，请重新连接','Authorization expired, please reconnect')));return}
    try{
      const result=await api('/api/auth/github/poll',{method:'POST',body:JSON.stringify({flowId:flow.flowId})});
      if(!active)return;
      if(!host.isConnected||Number(state.currentUser?.id)!==actor){finish();return}
      if(result.status==='connected'){
        if(typeof storeCredentialUser==='function')storeCredentialUser(result.user);
        if(typeof notifyCredentialsChanged==='function')notifyCredentialsChanged();
        state.gitTokenVerify=null;
        status.textContent=_t(`已连接 GitHub · ${result.login}`,`Connected GitHub · ${result.login}`);
        finish();
        host.dispatchEvent(new CustomEvent('github-connected',{bubbles:true}));
        if(typeof credentialWizard!=='undefined'&&credentialWizard?.kind==='gitToken')closeCredentialWizard(true);
        if(document.querySelector('#credentialPanel')&&typeof renderCredentialPanel==='function')renderCredentialPanel();
        toast(_t(`GitHub 授权已保存 · ${result.login}`,`GitHub authorization saved · ${result.login}`),'ok');
        return;
      }
      timer=setTimeout(poll,Math.max(5,result.interval||5)*1000);
    }catch(error){fail(error)}
  };
  try{
    status.textContent=_t('正在获取 GitHub 授权码…','Fetching GitHub authorization code…');
    flow=await api('/api/auth/github/device',{method:'POST',body:'{}'});
    if(!host.isConnected||Number(state.currentUser?.id)!==actor){finish();return}
    deadline=Date.now()+flow.expiresIn*1000;
    status.replaceChildren();
    const instruction=document.createElement('p');instruction.textContent=_t('复制授权码，然后在 GitHub 确认：','Copy this code and authorize on GitHub:');
    const code=document.createElement('strong');code.className='github-device-code';code.textContent=flow.userCode;instruction.append(code);
    const copy=document.createElement('button');copy.type='button';copy.className='button ghost small';copy.textContent=_t('复制授权码','Copy code');
    const copyCode=async trigger=>{
      if(await copyGitHubDeviceCode(flow.userCode,trigger)){copy.textContent=_t('已复制','Copied');return}
      selectGitHubDeviceCode(code);copy.textContent=_t('已选中，按 Ctrl/⌘+C 复制','Selected, press Ctrl/⌘+C to copy');
    };
    copy.onclick=()=>copyCode(copy);
    const link=document.createElement('a');link.href='https://github.com/login/device';link.target='_blank';link.rel='noopener noreferrer';link.className='button primary small';link.textContent=_t('复制并前往 GitHub 授权','Copy and open GitHub');link.onclick=()=>{void copyCode(link)};
    const cancel=document.createElement('button');cancel.type='button';cancel.className='button ghost small';cancel.textContent=_t('取消','Cancel');cancel.onclick=()=>{finish();status.replaceChildren()};
    status.append(instruction,copy,link,cancel);
    timer=setTimeout(poll,Math.max(5,flow.interval)*1000);
  }catch(error){fail(error)}
}

function mountGitHubRepoPicker(host,onSelect){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!host)return;
  const connected=!!userById(state.currentUser?.id)?.gitHubCredentialConfigured;
  host.innerHTML=(connected?'':githubConnectHTML())+`<button type="button" class="button ghost small" data-github-load${connected?'':' hidden'}>${_t('选择我的 GitHub 仓库','Choose my GitHub repo')}</button><p data-github-repo-hint${connected?' hidden':''}>${_t('连接后可选择自己的仓库；公开仓库也可直接填写地址。访问令牌可在个人配置中设置。','Connect to pick from your repositories, or paste a public URL directly. Access tokens can be configured in Personal Settings.')}</p><div data-github-repo-list></div>`;
  hydrateGitHubConnections(host);
  const load=host.querySelector('[data-github-load]'),list=host.querySelector('[data-github-repo-list]');
  let repositories=[],page=1,busy=false;
  const paint=hasMore=>{
    list.innerHTML=`<label class="pa-field"><span>${_t('搜索已加载的仓库','Search loaded repos')}</span><input class="pa-input" type="search" data-github-search placeholder="${_t('仓库名 / 组织名','Repo / org name')}"></label><label class="pa-field"><span>${_t('选择仓库','Select repository')}</span><select class="pa-input" data-github-repo aria-label="${_t('我的 GitHub 仓库','My GitHub repositories')}"><option value="">${_t('请选择仓库','Select repository')}</option></select></label><p data-github-repo-empty hidden>${_t('未找到仓库，可手动填写地址；组织仓库可能需要管理员批准授权。','No repos found; you can enter the URL manually. Org repos may require admin approval.')}</p>`+(hasMore?`<button type="button" class="button ghost small" data-github-more>${_t('加载更多仓库','Load more repos')}</button>`:'');
    const select=list.querySelector('[data-github-repo]'),search=list.querySelector('[data-github-search]'),empty=list.querySelector('[data-github-repo-empty]');
    const filter=()=>{
      select.replaceChildren(new Option(_t('请选择仓库','Select repository'),''));
      const visible=repositories.filter(repo=>repo.full_name.toLowerCase().includes(search.value.toLowerCase()));
      for(const repository of visible){const option=document.createElement('option');option.value=repository.full_name;option.textContent=repository.full_name+(repository.private?_t(' · 私有',' · Private'):'');select.append(option)}
      empty.hidden=visible.length>0;
    };
    search.oninput=filter;
    select.onchange=()=>{const repository=repositories.find(repo=>repo.full_name===select.value);if(repository)onSelect(repository)};
    const more=list.querySelector('[data-github-more]');if(more)more.onclick=()=>fetchPage(page+1);
    filter();
  };
  const fetchPage=async requested=>{
    if(busy)return;
    busy=true;load.disabled=true;
    const actor=Number(state.currentUser?.id);
    const more=list.querySelector('[data-github-more]');if(more)more.disabled=true;
    try{
      const result=await api('/api/auth/github/repositories?page='+requested);
      if(!host.isConnected||Number(state.currentUser?.id)!==actor)return;
      page=requested;repositories=requested===1?result.repositories:repositories.concat(result.repositories);
      paint(result.hasMore);
    }catch(error){list.textContent=error.message}
    finally{busy=false;load.disabled=false;if(more)more.disabled=false}
  };
  load.onclick=()=>fetchPage(1);
  host.addEventListener('github-connected',()=>{
    host.querySelector('[data-github-connect]')?.remove();
    host.querySelector('[data-github-repo-hint]').hidden=true;
    load.hidden=false;
    fetchPage(1);
  });
}

document.addEventListener('click',event=>{
  const start=event.target.closest('[data-github-start]');
  if(start)startGitHubConnect(start.closest('[data-github-connect]'));
});
