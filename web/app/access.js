// 访问密钥：访问密钥 的创建、撤销，以及创建后复制 MCP 接入提示词。
function accessMcpClientSpec(client,base,token){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const json=JSON.stringify({mcpServers:{agentflow:{url:`${base}/mcp`,headers:{Authorization:`Bearer ${token}`}}}},null,2);
  const specs={
    cursor:{label:'Cursor',location:'~/.cursor/mcp.json',codeTitle:'mcp.json',code:json,verify:_t('在 Cursor 设置的 MCP 列表中确认 agentflow 已连接','Confirm agentflow is connected in Cursor MCP settings')},
    claude:{label:'Claude Code',location:_t('Claude CLI（用户级配置写入 ~/.claude.json）','Claude CLI (user-level config ~/.claude.json)'),codeTitle:'Shell',code:`claude mcp add --transport http --scope user agentflow ${base}/mcp \\\n  --header "Authorization: Bearer ${token}"`,verify:'claude mcp get agentflow && claude mcp list'},
    codebuddy:{label:'CodeBuddy',location:_t('CodeBuddy 用户级 MCP 配置','CodeBuddy user-level MCP config'),codeTitle:'mcp.json',code:json,verify:_t('在 CodeBuddy 的 MCP 管理页确认 agentflow 已连接','Confirm agentflow is connected in CodeBuddy MCP settings')},
    codex:{label:'Codex',location:'~/.codex/config.toml',codeTitle:'config.toml',code:`[mcp_servers.agentflow]\nurl = "${base}/mcp"\nhttp_headers = { Authorization = "Bearer ${token}" }`,verify:'codex mcp list'}
  };
  return specs[client]||specs.cursor;
}
function accessMcpAgentPrompt(spec,base,token){
  if(!token||token==='<YOUR_PERSONAL_TOKEN>')return '';
  const guide = `${base}/mcp-setup.txt`;
  const instructions = window.lfT(
    `请为 ${spec.label} 接入 LoopForge 平台 MCP。使用 curl 下载 ${guide}（禁止使用 fetch），按指南中 ${spec.label} 的步骤配置，最后用 tools/list 验证连接。`,
    `Connect ${spec.label} to the LoopForge platform MCP server. Download ${guide} with curl, follow the steps for ${spec.label}, then verify the connection with tools/list.`
  );
  return `${instructions}\n\nAPI_TOKEN = ${token}\nENDPOINT = ${base}/mcp`;
}
// 对外展示的固定接入地址：优先使用部署下发的 APP_DOMAIN，避免硬编码固定域名。
function getPublicBaseURL(){
  const configured = (typeof window !== 'undefined' && (window.__AGENTFLOW_APP_DOMAIN__ || window.__AGENTFLOW_PUBLIC_BASE_URL__))
    || (typeof state !== 'undefined' && state?.appDomain ? state.appDomain : '');
  return accessPublicBaseURL(configured, typeof window !== 'undefined' ? window.location : null);
}
// 接入片段会携带 Bearer Token：配置里显式的协议优先，否则跟随当前页面；
// HTTPS 页面生成的地址不降级为 http://。只有配置显式写了 http:// 和非 443 端口时
// 保留 http，因为把只提供 HTTP 的端口改成 https:// 会指向一个没有 TLS 的端口。
function accessPublicBaseURL(configured, page){
  const secure = page?.protocol === 'https:';
  const fallback = (secure ? 'https:' : 'http:') + '//' + (page?.host || 'loopforge.example.com');
  const raw = String(configured || '').trim();
  if(!raw) return fallback;
  const explicitScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let url;
  try{ url = new URL(explicitScheme ? raw : (secure ? 'https://' : 'http://') + raw) }catch(_){ return fallback }
  if(!['http:','https:'].includes(url.protocol) || !url.host) return fallback;
  const explicitHTTPPort = explicitScheme && url.protocol === 'http:' && url.port && url.port !== '443';
  if(secure && !explicitHTTPPort) url.protocol = 'https:';
  return url.protocol + '//' + url.host + url.pathname.replace(/\/+$/, '');
}
function accessViewActive(){return !!$('#guideView')?.classList.contains('active')}
let credentialFocusRequest=0;
function gotoCredential(name,sshRemote){
  const request=++credentialFocusRequest;
  if(!CREDENTIAL_FIELDS[name]){switchView('settings');return}
  if(name==='gitSshKey')return openGitSSHKeys(sshRemote);
  if(name==='gitHttpCredentials')return openGitHTTPCredentials();
  switchView('settings');
  const requestedRoute=settingsRouteTransition;
  const focusAfter=performance.now()+150;
  const focusCredential=()=>{
    const transition=settingsRouteTransition;
    if(request!==credentialFocusRequest||(transition&&transition!==requestedRoute))return;
    if(transition&&transition.target!=='settings')return;
    if(activeViewName()!=='settings'){
      // The outgoing workspace drawer closes before settings is mounted.
      // A different route cancels this request instead of stealing focus later.
      if(transition===requestedRoute&&transition?.phase==='closing')requestAnimationFrame(focusCredential);
      return;
    }
    if(performance.now()<focusAfter){requestAnimationFrame(focusCredential);return}
    const panel=document.querySelector('#personalSettingsContent #credentialPanel'),row=panel?.querySelector(`[data-credential-row="${name}"]`);
    if(!row||!panel.getClientRects().length)return;
    // Missing credentials open the wizard on its fill-in step; configured ones expand in place.
    if(row.classList.contains('is-configured'))revealCredentialRow(name);
    else openCredentialWizard(name);
  };
  requestAnimationFrame(focusCredential);
}
// Personal credential fields and the errors they cause. Keep the rules in
// sync with chatbot/src/credentials.js.
const CREDENTIAL_FIELDS={codeBuddyApiKey:'CodeBuddy API Key',codexApiKey:'Codex API Key',claudeCodeApiKey:'Claude Code API Key',gitToken:'GitHub Git Token',gitSshKey:'Git SSH 密钥',gitHttpCredentials:'Git 访问令牌'};
const CREDENTIAL_RULES=[
  ['codexApiKey',/Codex[^。\n]{0,16}API Key/i],
  ['claudeCodeApiKey',/Claude Code[^。\n]{0,16}API Key/i],
  ['codeBuddyApiKey',/CodeBuddy[^。\n]{0,20}(API Key|Key|凭据)|拒绝了你的 API Key/i],
  ['gitSshKey',/Git SSH (?:密钥|私钥)/i],
  ['gitToken',/Git Token|工蜂[^。\n]{0,12}令牌|could not read Username|Authentication failed|HTTP Basic: Access denied|terminal prompts disabled|requested URL returned error: 40[13]/i],
];
function credentialHint(text){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const message=String(text||'');
  if(!message)return null;
  const rule=CREDENTIAL_RULES.find(([,re])=>re.test(message));
  if(!rule)return null;
  const field=rule[0];
  const label=field==='gitSshKey'?_t('Git SSH 密钥','Git SSH keys'):field==='gitHttpCredentials'?_t('Git 访问令牌','Git access tokens'):CREDENTIAL_FIELDS[field];
  return {field,label,owner:/责任人|Owner|该账号/i.test(message)};
}
function credentialActionHTML(text){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const hint=credentialHint(text);
  if(!hint)return '';
  return `<div class="credential-action"><button type="button" class="button ghost small" data-goto-credential="${hint.field}">${_t(`去配置 ${escapeHTML(hint.label)} →`,`Configure ${escapeHTML(hint.label)} →`)}</button>${hint.owner?`<small>${_t('需由责任人本人在个人配置中配置','Must be configured by the assignee in Personal Settings')}</small>`:''}</div>`;
}
document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-goto-credential]');
  if(button)gotoCredential(button.dataset.gotoCredential);
});
// renderAll() repaints every page, so only the active 访问密钥 page may fetch
// the token list; Bearer sessions get 401 there and would poison the state.
function renderGuide(openCreate=false){if($('#accessBody')&&accessViewActive())renderAccessTokens(openCreate)}
// loadAccessTokens always settles accessTokensStatus, and only repaints when the
// user is still on 访问密钥, so a slow or failing request can never leave the
// loading placeholder on top of another page.
async function loadAccessTokens(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  state.accessTokensStatus='loading';state.accessTokensError='';
  try{
    const list=await api('/api/auth/tokens',{silent:true});
    state.accessTokens=Array.isArray(list)?list:[];
    state.accessTokensStatus='ready';
  }catch(e){
    state.accessTokens=[];state.accessTokensStatus='error';state.accessTokensError=e.message||_t('加载失败','Failed to load');
  }
  if(accessViewActive())renderAccessTokens();
}
function accessTokenSetupHTML(token){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const clients = [['cursor','Cursor'], ['claude','Claude Code'], ['codebuddy','CodeBuddy'], ['codex','Codex']];
  return `<section class="token-reveal" aria-labelledby="token-setup-title">
    <div class="token-setup-layout">
      <div class="token-setup-intro">
        <div class="token-created">${huiIcon('check')}${_t('访问密钥已创建','Access token created')}</div>
        <h2 id="token-setup-title" tabindex="-1">${_t('连接 LoopForge 平台 MCP','Connect to LoopForge Platform MCP')}</h2>
        <p>${_t('接入后，可以在 AI 对话里查询项目、需求和运行进度。','Once connected, your AI assistant can query projects, requirements, and run progress.')}</p>
        <fieldset class="token-client-picker">
          <legend>${_t('选择 AI 客户端','Select AI client')}</legend>
          <div class="token-client-options">
            ${clients.map(([id,label]) => `<label class="token-client-choice">
              <input type="radio" name="token-client" data-native data-revealed-client="${id}" value="${id}">
              <span class="token-client-tile">
                <img class="token-client-icon" data-client="${id}" src="/images/credentials/${id}.svg" width="20" height="20" alt="">
                <span>${label}</span>
                <span class="token-client-indicator" aria-hidden="true"></span>
              </span>
            </label>`).join('')}
          </div>
        </fieldset>
      </div>
      <div class="token-setup-action">
        <div class="token-connection" aria-hidden="true">
          <span class="token-connection-mark"><img src="/images/loopforge-logo.png" width="28" height="28" alt=""></span>
          <span class="token-connection-link">${huiIcon('connector')}</span>
          <span class="token-connection-mark"><img id="token-connection-client" class="token-client-icon" width="23" height="23" alt=""></span>
        </div>
        <div class="token-paste" aria-live="polite">
          <h3 id="token-paste-title"></h3>
          <p id="token-paste-hint"></p>
        </div>
        <button type="button" class="button primary" data-copy-revealed-prompt>${huiIcon('copy')}${_t('复制 MCP 接入提示词','Copy MCP setup prompt')}</button>
        <p class="token-copy-note">${huiIcon('lock')}${_t('已包含接入地址和访问密钥','Includes server URL and access token')}</p>
      </div>
    </div>
    <div class="token-reveal-footer">
      <details class="token-key-info">
        <summary>
          ${huiIcon('key')}<span>${_t('查看或复制访问密钥','View or copy access token')}</span>${huiIcon('chevron-down','token-key-chevron')}
          <small>${_t('仅显示一次','Shown once only')}</small>
        </summary>
        <div class="token-key-controls">
          <code>${escapeHTML(token)}</code>
          <button type="button" class="button ghost small" data-copy-revealed>${_t('仅复制密钥','Copy token only')}</button>
          <p>${_t('手动配置 MCP 或调用 REST API 时可使用此密钥。','Use this token when configuring MCP manually or calling the REST API.')}</p>
        </div>
      </details>
      <button type="button" class="button ghost small" data-close-revealed>${_t('完成','Done')}</button>
    </div>
  </section>`;
}
function bindAccessTokenSetup(panel,token){
  const base = getPublicBaseURL();
  const clients = [...panel.querySelectorAll('[data-revealed-client]')];
  const copyPrompt = panel.querySelector('[data-copy-revealed-prompt]');
  const clientIcon = panel.querySelector('#token-connection-client');
  const title = panel.querySelector('#token-paste-title');
  const hint = panel.querySelector('#token-paste-hint');
  function selectClient(choice){
    const id = choice.value;
    choice.checked = true;
    state.accessClient = id;
    const spec = accessMcpClientSpec(id,base,token);
    clientIcon.src = choice.closest('label').querySelector('img').src;
    clientIcon.dataset.client = id;
    title.textContent = window.lfT(`在 ${spec.label} 中配置`, `Set up in ${spec.label}`);
    hint.textContent = window.lfT(
      `将提示词粘贴到你自己的 ${spec.label} 对话中并发送，助手会配置并验证连接。`,
      `Paste the prompt into your own ${spec.label} chat and send it. Your assistant will set up and verify the connection.`
    );
    copyPrompt.onclick = () => copyText(accessMcpAgentPrompt(spec,base,token),window.lfT(
      `已复制，请粘贴到 ${spec.label} 对话中并发送`,
      `Prompt copied. Paste it into your ${spec.label} chat and send it.`
    ));
  }
  clients.forEach(choice => choice.onchange = () => selectClient(choice));
  selectClient(clients.find(choice => choice.value === state.accessClient) || clients[0]);
  panel.querySelector('[data-copy-revealed]').onclick = () => copyText(token,(typeof lfT==='function'?lfT:z=>z)('访问密钥已复制','Access token copied'));
  panel.querySelector('[data-close-revealed]').onclick = () => {
    state.revealedToken = '';
    renderAccessTokens();
    $('#accessTokenForm input')?.focus();
  };
}
function renderAccessTokens(openCreate=false){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const body=$('#accessBody'),user=state.currentUser,isGuest=!user||user.isGuest,tokens=Array.isArray(state.accessTokens)?state.accessTokens:[];
  if(isGuest){
    body.innerHTML=`<div class="access-card access-tokens"><div class="token-empty"><b>${_t('请先登录','Sign in required')}</b><p>${_t('访问密钥必须绑定到登录用户。','Access tokens must be bound to a signed-in user.')}</p><button type="button" class="button primary" data-access-login>${_t('登录后申请','Sign in to create')}</button></div></div>`;
    body.querySelector('[data-access-login]').onclick=()=>{if(state.loginUrl)location.href=state.loginUrl};
    return;
  }
  if(state.accessTokensStatus==='idle'){loadAccessTokens()}
  if(state.accessTokensStatus==='loading'){body.innerHTML=`<div class="access-card access-tokens"><div class="token-empty">${_t('正在加载访问密钥…','Loading access tokens…')}</div></div>`;return}
  if(state.accessTokensStatus==='error'){
    body.innerHTML=`<div class="access-card access-tokens"><div class="token-empty"><b>${_t('访问密钥列表加载失败','Failed to load access tokens')}</b><p>${escapeHTML(state.accessTokensError)}</p><div style="display:flex;gap:8px;justify-content:center"><button type="button" class="button primary small" data-retry-tokens>${_t('重试','Retry')}</button><button type="button" class="button ghost small" data-access-login>${_t('重新登录','Sign in again')}</button></div></div></div>`;
    body.querySelector('[data-retry-tokens]').onclick=()=>{state.accessTokensStatus='idle';renderAccessTokens()};
    body.querySelector('[data-access-login]').onclick=()=>{if(state.loginUrl)location.href=state.loginUrl};
    return;
  }
  const reveal = state.revealedToken ? accessTokenSetupHTML(state.revealedToken) : '';
  const now = Date.now();
  const rows = tokens.map(t => {
    const revoked = !!t.revokedAt;
    const expired = t.expiresAt && Date.parse(t.expiresAt) <= now;
    const expiry = t.expiresAt ? _t(`有效至 ${new Date(t.expiresAt).toLocaleDateString()}`, `Expires ${new Date(t.expiresAt).toLocaleDateString()}`) : _t('长期有效','Does not expire');
    return `<div class="token-row${revoked || expired ? ' revoked' : ''}">
      <span class="token-row-icon">${huiIcon('key')}</span>
      <div class="token-row-main"><b>${escapeHTML(t.name)}</b><code>${escapeHTML(t.prefix)}••••••••</code></div>
      <div class="token-meta">${_t(`创建 ${relativeTime(t.createdAt)}`,`Created ${relativeTime(t.createdAt)}`)} · ${t.lastUsedAt ? _t(`最近使用 ${relativeTime(t.lastUsedAt)}`,`Last used ${relativeTime(t.lastUsedAt)}`) : _t('尚未使用','Never used')} · ${revoked ? _t('已撤销','Revoked') : expired ? _t('已过期','Expired') : expiry}</div>
      ${revoked || expired ? '' : `<button type="button" class="button danger-outline small" data-revoke-token="${escapeHTML(t.id)}">${_t('撤销','Revoke')}</button>`}
    </div>`;
  }).join('');
  const activeCount = tokens.filter(t => !t.revokedAt && (!t.expiresAt || Date.parse(t.expiresAt) > now)).length;
  const form = `<form id="accessTokenForm" class="token-create-form">
    <label>${_t('密钥名称','Token name')}<input class="input" name="name" required maxlength="128" placeholder="${_t('例如：我的 Cursor','e.g. My Cursor')}"></label>
    <label>${_t('有效期','Expiration')}<select class="select" name="expiresInDays">
      <option value="30">${_t('30 天','30 days')}</option><option value="90" selected>${_t('90 天','90 days')}</option>
      <option value="180">${_t('180 天','180 days')}</option><option value="365">${_t('365 天','365 days')}</option>
    </select></label>
    <button type="submit" class="button ${reveal ? 'ghost' : 'primary'}">${_t('创建访问密钥','Create access token')}</button>
  </form>`;
  body.innerHTML = `${reveal}
    <section class="token-manager" aria-labelledby="token-list-title">
      ${reveal ? '' : form}
      <div class="token-list-heading">
        <h2 id="token-list-title">${_t('我的访问密钥','My access tokens')}</h2>
        <span>${_t(`${activeCount} 个可用`,`${activeCount} active`)}</span>
      </div>
      <div class="token-list">${rows || `<div class="token-empty">${_t('还没有访问密钥，创建后即可接入 REST API 和 MCP。','No access tokens yet. Create one to connect via REST API or MCP.')}</div>`}</div>
      ${reveal ? `<details class="token-create-more"><summary class="button ghost small">${huiIcon('plus')}${_t('创建新密钥','Create another token')}</summary>${form}</details>` : ''}
    </section>`;
  if(reveal) bindAccessTokenSetup(body.querySelector('.token-reveal'),state.revealedToken);
  body.querySelector('#accessTokenForm')?.addEventListener('submit',createPersonalToken);
  body.querySelectorAll('[data-revoke-token]').forEach(b=>b.onclick=()=>revokePersonalToken(b.dataset.revokeToken));
  window.AgentFlowHarnessIcons?.hydrate(body);
}
async function createPersonalToken(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  e.preventDefault();const form=e.currentTarget;
  try{
    const result = await api('/api/auth/tokens',{method:'POST',body:JSON.stringify({name:form.elements.name.value.trim(),expiresInDays:Number(form.elements.expiresInDays.value)})});
    state.revealedToken = result.token;
    await loadAccessTokens();
    if(accessViewActive()) $('#token-setup-title')?.focus();
    toast(_t('访问密钥已创建','Access token created'),'ok');
  }catch(err){toast(err.message,'err')}
}
async function revokePersonalToken(id){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!(await afConfirm({title:_t('撤销访问密钥','Revoke access token'),message:_t('撤销后，正在使用这个访问密钥的 API 和 MCP 客户端会立即失效。确定撤销？','API and MCP clients using this token will lose access immediately. Revoke anyway?'),danger:true,confirmText:_t('确定撤销','Revoke')})))return;
  try{await api(`/api/auth/tokens/${encodeURIComponent(id)}`,{method:'DELETE'});await loadAccessTokens();toast(_t('访问密钥已撤销','Access token revoked'),'ok')}catch(err){toast(err.message,'err')}
}


let commandMatches=[],commandSelectedIndex=0;
function commandCatalog(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const pages=[
    ['collaboration',_t('AI 工作台','AI Workspace'),_t('和 AI 对话，派发与跟进任务','Chat with AI, dispatch and track tasks')],
    ['issues',_t('需求列表','Requirements'),_t('查看进度，触发或重试','Track progress, trigger or retry')],
    ['approvals',_t('待我确认','Approvals'),_t('批准或退回卡住的需求','Approve or reject paused requirements')],
    ['observability',_t('统计','Analytics'),_t('用量分析 · Token 与质量','Usage analytics · Tokens & quality')],
    ['settings',_t('个人配置','Personal Settings'),_t('账号、模型与执行凭据','Account, models & credentials')],
    ['projects',_t('项目配置','Projects'),_t('项目、成员和仓库','Projects, members & repositories')],
    ['bots',_t('通道管理','Bot Channels'),_t('企业微信单聊或群聊通知通道','WeCom DM and group notification channels')],
    ['sops',_t('流程模板','SOPs'),_t('Issue 修复与需求开发','Issue fixes and feature delivery')],
    ['runs',_t('运行记录','Runs'),_t('查看节点日志和产物','Inspect node logs and outputs')],
    ['aiSchedules',_t('定时任务','Scheduled Tasks'),_t('提示词任务、SOP 触发与共享任务','Prompt tasks, SOP triggers & shared tasks')],
    ['agents',_t('角色定义','Roles'),_t('管理角色和能力资产','Manage Roles and capability assets')],
    ['mcp',_t('能力资产 · MCP','Assets · MCP'),_t('添加项目级或个人 MCP','Add project or personal MCP servers')],
    ['rules',_t('能力资产 · 规则','Assets · Rules'),_t('当前项目的行为与执行约束','Behavior and execution rules for this project')],
    ['skills',_t('能力资产 · 技能','Assets · Skills'),_t('当前项目的技能和附加文件','Skills and attached files for this project')],
    ['runners',_t('执行机器','Runners'),_t('用自己的电脑或 CVM 跑任务','Run tasks on your own machine or CVM')],
    ['dockerfiles',_t('环境资产 · Dockerfile','Environments · Dockerfile'),_t('管理项目容器构建定义','Manage container build definitions')],
    ['environments',_t('环境资产 · 安装脚本','Environments · Setup Scripts'),_t('管理隔离环境的工具安装脚本','Manage setup scripts for isolated environments')],
    ['sandboxes',_t('环境资产 · 沙箱','Environments · Sandboxes'),_t('管理项目运行隔离策略','Manage project execution isolation policies')],
    ['guide',_t('访问密钥','Access Tokens'),_t('创建和撤销访问密钥','Create and revoke access tokens')]
  ].map(([view,title,meta])=>({kind:_t('页面','Page'),title,meta,action:()=>switchView(view)}));
  const issues=(state.data.issues||[]).map(i=>({kind:_t('需求','Issue'),title:i.title,meta:`${i.priority||'—'} · ${issueStatusLabel(i.status)}`,action:()=>openIssueDetail(i.id)}));
  const runs=sopRuns(state.data.runs).map(r=>({kind:_t('运行','Run'),title:runIssueTitle(r),meta:`${runDisplayStatus(r)} · ${r.workflowSnapshot?.name||r.workflowId}`,action:()=>openRunFromId(r.id)}));
  const sops=catalogWorkflows().map(w=>({kind:'SOP',title:w.name,meta:`${w.status==='published'?_t('已发布','Published'):_t('草稿','Draft')} · ${_t(`${w.nodes?.length||0} 个节点`,`${w.nodes?.length||0} steps`)}`,action:()=>{state.workflow=clone(w);state.selectedNode=null;switchView('flow')}}));
  const agents=(state.data.agents||[]).map(a=>({kind:'Agent',title:a.name,meta:a.description||a.id,action:()=>{switchView('agents');openAgentWizard(a)}}));
  const actions=[{kind:_t('操作','Action'),title:_t('新建 SOP','New SOP'),meta:_t('创建流程草稿','Create an SOP draft'),action:openSOPWizard}];
  return [...actions,...pages,...issues,...runs,...sops,...agents];
}
function openCommandPalette(){const host=$('#commandPalette');host.hidden=false;$('#commandSearch').value='';renderCommandResults();requestAnimationFrame(()=>$('#commandSearch').focus())}
function closeCommandPalette(){$('#commandPalette').hidden=true}
function moveCommandSelection(delta){
  if(!commandMatches.length)return;
  commandSelectedIndex=(commandSelectedIndex+delta+commandMatches.length)%commandMatches.length;
  highlightCommandSelection();
}
function highlightCommandSelection(){
  $$('#commandResults [data-command-index]').forEach((el,i)=>{
    el.classList.toggle('selected',i===commandSelectedIndex);
    if(i===commandSelectedIndex)el.scrollIntoView({block:'nearest'});
  });
}
function renderCommandResults(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const q=$('#commandSearch').value.trim().toLowerCase();
  commandMatches=commandCatalog().filter(x=>!q||`${x.kind} ${x.title} ${x.meta}`.toLowerCase().includes(q)).slice(0,12);
  commandSelectedIndex=0;
  $('#commandResults').innerHTML=commandMatches.length
    ?commandMatches.map((x,i)=>`<button data-command-index="${i}" class="${i===0?'selected':''}"><span class="command-kind">${escapeHTML(x.kind)}</span><span><b>${escapeHTML(x.title)}</b><small>${escapeHTML(x.meta||'')}</small></span><em>↵</em></button>`).join('')
    :`<div class="command-empty"><b>${_t('没有匹配结果','No matching results')}</b><span>${_t('换一个标题、编号或页面名称试试','Try another title, ID, or page name')}</span></div>`;
}
function executeCommand(index){const item=commandMatches[index];if(!item)return;closeCommandPalette();item.action()}
