// 平台 MCP 目录（/api/mcp-market）不再作为独立「市场」页展示，但它仍是
// 通用模板角色的可选 MCP、市场 ID/别名映射和 SOP 依赖预检的数据来源，
// 所以启动后和进入相关页面时都要保证加载过一次；失败时允许下次重试。
let mcpMarketCatalogRequest=null;
function ensureMCPMarketCatalog(){
  if((state.mcpMarket||[]).length)return Promise.resolve(state.mcpMarket);
  if(!mcpMarketCatalogRequest){
    mcpMarketCatalogRequest=api('/api/mcp-market',{silent:true})
      .then(result=>{state.mcpMarket=Array.isArray(result?.items)?result.items:[];return state.mcpMarket})
      .catch(()=>{mcpMarketCatalogRequest=null;return state.mcpMarket||[]});
  }
  return mcpMarketCatalogRequest;
}
async function loadMCPMarket(){
  try{
    const [,servers]=await Promise.all([ensureMCPMarketCatalog(),api('/api/mcp-servers',{silent:true})]);
    state.data.mcpServers=servers;
    renderMCPManagement();
  }catch(e){toast(e.message)}
}
// mcpMarketMatches mirrors the server's sameMarketItem: an installed row
// belongs to a catalog entry by its market ID or any of the entry's aliases.
function mcpMarketMatches(marketId,item){
  const id=String(marketId||'').toLowerCase();
  if(!id||!item)return false;
  return String(item.id||'').toLowerCase()===id||(item.aliases||[]).some(alias=>String(alias).toLowerCase()===id);
}
function mcpMarketAdded(item,installed){
  return (installed||[]).some(row=>mcpMarketMatches(row.marketId,item));
}
// Catalog entries not yet added to the project. Generic templates bind MCPs
// by these aliases, so they stay installable without a separate market tab.
function mcpCatalogSuggestionsHTML(installed,query){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const items=(state.mcpMarket||[]).filter(item=>!mcpMarketAdded(item,installed)&&mcpMatchesQuery(item,query));
  if(!items.length)return '';
  return `<section class="mcp-catalog-suggest" aria-label="${_t('平台目录','Platform catalog')}"><div><b>${_t('平台目录','Platform catalog')}</b><span>${_t('通用模板按名称绑定这些 MCP，添加到本项目后即可使用。','Generic templates reference these MCPs by name; add to this project to enable.')}</span></div><div class="mcp-catalog-actions">${items.map(item=>`<button class="button ghost small" type="button" data-mcp-install="${escapeHTML(item.id)}">＋ ${escapeHTML(item.name)}</button>`).join('')}</div></section>`;
}
async function installMarketMCP(marketId,button){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!state.projectFilter)return toast(_t('请先选择项目','Select a project first'));
  button.disabled=true;const label=button.textContent;button.textContent=_t('添加中…','Adding…');
  try{
    const saved=await api('/api/mcp-market/install',{method:'POST',body:JSON.stringify({marketId,scope:'project',projectId:state.projectFilter})});
    state.data.mcpServers=[...(state.data.mcpServers||[]).filter(item=>item.id!==saved.id),saved];
    renderMCPManagement();renderAgents();toast(_t('已添加到当前项目','Added to project'),'ok');
  }catch(e){toast(e.message,'err');button.disabled=false;button.textContent=label}
}
function scopedMCPInstallations(){
  const uid=state.currentUser&&!state.currentUser.isGuest?Number(state.currentUser.id):0;
  return (state.data?.mcpServers||[]).filter(item=>state.mcpScope==='personal'?item.scope==='personal'&&!item.marketId&&Number(item.ownerUserId)===uid:item.scope==='project'&&item.projectId===state.projectFilter);
}
function mcpSearchHaystack(item){
  return [item.id,item.name,item.description,item.category,item.url,item.marketId,...(item.tags||[]),...(item.aliases||[])].join(' ').toLowerCase();
}
function mcpMatchesQuery(item,query){
  if(!query)return true;
  const hay=mcpSearchHaystack(item);
  return query.split(/\s+/).every(part=>part&&hay.includes(part));
}
function mcpMarketLogo(item){
  const src=item.marketId||item.official?safeURL(item.iconUrl||''):'#';
  const fallback=`<span class="mcp-logo-fallback">${escapeHTML((item.name||'M')[0])}</span>`;
  return src==='#'?fallback:`<img src="${escapeHTML(src)}" alt="">${fallback}`;
}
function bindMCPLogoFallbacks(root){
  root.querySelectorAll('.mcp-card-logo img').forEach(img=>{
    const fallback=()=>img.parentElement?.classList.add('logo-load-failed');
    img.addEventListener('error',fallback,{once:true});
    if(img.complete&&img.naturalWidth===0)fallback();
  });
}
function mcpImportPlainObject(value){return value&&typeof value==='object'&&!Array.isArray(value)}
function mcpImportStringMap(value,field){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(value==null)return {};
  if(!mcpImportPlainObject(value))throw new Error(_t(`${field} 必须是 JSON 对象`,`${field} must be a JSON object`));
  const out={};for(const [key,item] of Object.entries(value)){if(item==null)continue;if(typeof item==='object')throw new Error(_t(`${field}.${key} 必须是字符串`,`${field}.${key} must be a string`));out[key]=String(item)}return out;
}
function mcpImportStringList(value,field){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(value==null)return [];
  if(!Array.isArray(value))throw new Error(_t(`${field} 必须是 JSON 数组`,`${field} must be a JSON array`));
  return value.map((item,index)=>{if(typeof item!=='string')throw new Error(_t(`${field}[${index}] 必须是字符串`,`${field}[${index}] must be a string`));return item});
}
function mcpImportedURL(value){
  const text=String(value||'').trim(),markdown=text.match(/^\[[^\]]+\]\((https?:\/\/[^)\s]+)\)$/i);return markdown?markdown[1]:text;
}
function mcpNormalizeImportedServer(raw,key=''){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!mcpImportPlainObject(raw))throw new Error(_t('MCP server 配置必须是 JSON 对象','MCP server config must be a JSON object'));
  const nested=mcpImportPlainObject(raw.stdio)?raw.stdio:(mcpImportPlainObject(raw.http)?raw.http:{}),value={...raw,...nested};
  let transport=String(value.transport||value.type||'').trim().toLowerCase();
  if(['streamable-http','streamable_http','sse'].includes(transport))transport='http';
  if(!transport)transport=value.url?'http':'stdio';
  if(!['http','stdio'].includes(transport))throw new Error(_t(`不支持的 MCP transport：${transport}`,`Unsupported MCP transport: ${transport}`));
  const id=String(value.id||key||'').trim(),name=String(value.name||id||'').trim();
  if(!id)throw new Error(_t('mcp.json 中的 server 缺少标识','Server in mcp.json is missing an ID'));
  const args=value.args==null?[]:value.args;if(!Array.isArray(args))throw new Error(_t(`${id}.args 必须是数组`,`${id}.args must be an array`));
  const timeout=Number(value.timeoutSec??value.toolTimeoutSec??60);
  if(!Number.isFinite(timeout)||timeout<0||timeout>600)throw new Error(_t(`${id}.timeoutSec 需在 0–600 之间`,`${id}.timeoutSec must be between 0 and 600`));
  const server={id,name:name||id,description:String(value.description||''),transport,timeoutSec:timeout,url:mcpImportedURL(value.url),authType:String(value.authType||''),headers:mcpImportStringMap(value.headers,'headers'),command:String(value.command||''),args:args.map(item=>String(item)),installScript:String(value.installScript||''),workingDirectory:String(value.workingDirectory??value.cwd??''),pathEntries:mcpImportStringList(value.pathEntries,'pathEntries'),environment:mcpImportStringMap(value.environment??value.env,'env')};
  if(transport==='http'&&!server.url)throw new Error(_t(`${id} 缺少 HTTP URL`,`${id} is missing an HTTP URL`));
  if(transport==='stdio'&&!server.command)throw new Error(_t(`${id} 缺少 command`,`${id} is missing a command`));
  return server;
}
function mcpImportCandidates(payload){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!mcpImportPlainObject(payload)&&!Array.isArray(payload))throw new Error(_t('mcp.json 顶层必须是对象或数组','Top-level mcp.json must be an object or array'));
  const root=mcpImportPlainObject(payload)?(payload.mcpServers??payload.servers??payload):payload;
  if(Array.isArray(root)){if(!root.length)throw new Error(_t('mcp.json 中没有 server','No servers found in mcp.json'));return root.map((item,index)=>mcpNormalizeImportedServer(item,item?.id||`server-${index+1}`))}
  if(!mcpImportPlainObject(root))throw new Error(_t('mcpServers / servers 必须是对象或数组','mcpServers / servers must be an object or array'));
  if(root.command||root.url||root.stdio||root.http)return [mcpNormalizeImportedServer(root,root.id||'mcp-server')];
  const entries=Object.entries(root).filter(([,item])=>mcpImportPlainObject(item));
  if(!entries.length)throw new Error(_t('mcp.json 中没有可识别的 server','No recognizable servers found in mcp.json'));
  return entries.map(([key,item])=>mcpNormalizeImportedServer(item,key));
}
function mcpParseJSONText(raw){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  let text=String(raw||'').replace(/\u00a0/g,' ').trim();if(!text)throw new Error(_t('请先粘贴 mcp.json 配置','Paste mcp.json configuration first'));
  const fence=text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fence)text=fence[1].trim();
  try{return JSON.parse(text)}catch{}
  const fragment=text.replace(/;\s*$/,'').replace(/,\s*$/,'');
  try{return JSON.parse(`{${fragment}}`)}catch{throw new Error(_t('无法解析配置：请检查 JSON 引号、逗号和括号','Cannot parse config: check JSON quotes, commas, and braces'))}
}
function mcpApplyImportedServer(server){
  const form=$('#customMcpForm');if(!form)return;
  if(!state.editingMCPId)form.elements.id.value=server.id;
  form.elements.name.value=server.name;form.elements.description.value=server.description;form.elements.transport.value=server.transport;form.elements.timeoutSecHttp.value=server.timeoutSec;form.elements.timeoutSecStdio.value=server.timeoutSec;form.elements.url.value=server.url;form.elements.authType.value=server.authType;form.elements.command.value=server.command;form.elements.args.value=server.args.join('\n');form.elements.installScript.value=server.installScript;form.elements.workingDirectory.value=server.workingDirectory;form.elements.pathEntries.value=server.pathEntries.join('\n');
  mcpRenderKV('headers',server.headers);mcpRenderKV('environment',server.environment);mcpSetTransport(server.transport);
}
async function importMCPJSONText(text){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const candidates=mcpImportCandidates(mcpParseJSONText(text));let selected=candidates[0];
  if(candidates.length>1){
    const listing=candidates.map((item,index)=>`${index+1}. ${item.id} (${item.transport})`).join('; ');
    const choice=await afPrompt({title:_t('选择要导入的 MCP','Select MCP to import'),message:_t(`粘贴内容包含 ${candidates.length} 个 server：${listing}`,`Pasted config contains ${candidates.length} servers: ${listing}`),label:_t('输入序号或标识','Enter index or ID'),defaultValue:'1'});
    if(choice==null)return;
    const trimmed=choice.trim(),index=/^\d+$/.test(trimmed)?Number(trimmed)-1:-1;selected=index>=0?candidates[index]:candidates.find(item=>item.id===trimmed);
    if(!selected)throw new Error(_t('没有找到指定的 MCP server','Specified MCP server not found'));
  }
  mcpApplyImportedServer(selected);toast(_t(`已从 mcp.json 填入 ${selected.name}`,`Populated ${selected.name} from mcp.json`),'ok');
}
function openCustomMCPModal(item=null){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const form=$('#customMcpForm'),editing=Boolean(item?.id);state.editingMCPId=editing?item.id:'';form.reset();
  const jsonImport=$('#mcpJsonImport');if(jsonImport)jsonImport.open=false;
  form.elements.scope.value=editing?item.scope:state.mcpScope;form.elements.id.value=editing?item.id:'';form.elements.name.value=editing?item.name||'':'';form.elements.transport.value=editing?item.transport||'http':'http';form.elements.description.value=editing?item.description||'':'';form.elements.authType.value=editing?item.authType||'':'';form.elements.timeoutSecHttp.value=editing?item.timeoutSec||60:60;form.elements.timeoutSecStdio.value=editing?item.timeoutSec||60:60;form.elements.url.value=editing?item.url||'':'';form.elements.command.value=editing?item.command||'':'';form.elements.args.value=editing?(item.args||[]).join('\n'):'';form.elements.installScript.value=editing?item.installScript||'':'';form.elements.workingDirectory.value=editing?item.workingDirectory||'':'';form.elements.pathEntries.value=editing?(item.pathEntries||[]).join('\n'):'';
  mcpRenderKV('environment',editing?item.environment||{}:{});mcpRenderKV('headers',editing?item.headers||{}:{});mcpSetTransport(form.elements.transport.value);mcpUpdateFileSummary(null,editing?item.fileRefs||[]:[]);
  form.elements.scope.disabled=editing;form.elements.id.disabled=editing;$('#customMcpTitle').textContent=editing?_t('修改自定义 MCP','Edit custom MCP'):_t('添加自定义 MCP','Add custom MCP');$('#customMcpSubmit').textContent=editing?_t('保存修改','Save changes'):_t('添加 MCP','Add MCP');$('#customMcpModal').classList.add('open');setTimeout(()=>form.elements.name.focus(),0)
}
function mcpSetTransport(value){
  $$('[data-mcp-http]').forEach(el=>el.hidden=value!=='http');$$('[data-mcp-stdio]').forEach(el=>el.hidden=value!=='stdio');
  const form=$('#customMcpForm');if(!form)return;form.elements.url.required=value==='http';form.elements.command.required=value==='stdio';
}
function mcpEditor(kind){return $(kind==='headers'?'#mcpHeadersEditor':'#mcpEnvironmentEditor')}
function prepareMCPFormHints(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const form=$('#customMcpForm'),args=form?.elements?.args,cwd=form?.elements?.workingDirectory,advanced=form?.querySelector('[data-mcp-stdio] details.mcp-advanced');if(!form||!args||!cwd||!advanced)return;
  const addHelp=(label,title)=>{if(label?.querySelector('.field-help'))return;const help=document.createElement('span');help.className='field-help';help.tabIndex=0;help.textContent='?';help.title=title;help.setAttribute('aria-label',title);label.append(' ',help)};
  args.placeholder='server.py\n--stdio';addHelp(args.previousElementSibling,_t('文件路径相对于上传内容根目录。例如上传根目录中有 server.py，这里填写 server.py。','File path relative to uploaded content root, e.g. server.py.'));
  const cwdLabel=cwd.previousElementSibling;cwd.placeholder=_t('通常留空；例如 packages/my-mcp','Usually empty; e.g. packages/my-mcp');addHelp(cwdLabel,_t('通常留空。上传 MCP 时相对于上传内容根目录，仅在入口程序依赖子目录作为当前目录时填写。','Usually empty. Path relative to uploaded root; only needed if the entrypoint expects a subdirectory.'));
  const envLabel=Array.from(advanced.children).find(el=>el.tagName==='LABEL'&&(el.textContent.includes('Environment Variables')));if(!envLabel)return;
  advanced.insertBefore(cwdLabel,envLabel);advanced.insertBefore(cwd,envLabel);let hint=advanced.querySelector('[data-mcp-cwd-hint]');if(!hint){hint=document.createElement('div');hint.className='json-help';hint.dataset.mcpCwdHint='';hint.textContent=_t('上传文件时默认以内容根目录启动；这里填写的目录也相对于该根目录。','Uploaded bundles start at the content root by default; paths here are relative to it.');advanced.insertBefore(hint,envLabel)}
  if(!form.elements.pathEntries){const label=document.createElement('label');label.textContent=_t('额外 PATH 目录 ','Extra PATH directories ');const small=document.createElement('small');small.textContent=_t('每行一个，相对 $PREFIX','One per line, relative to $PREFIX');label.appendChild(small);const input=document.createElement('textarea');input.name='pathEntries';input.rows=3;input.placeholder=_t('通常留空，例如 tools/bin','Usually empty, e.g. tools/bin');const help=document.createElement('div');help.className='json-help';help.textContent=_t('npm、pip、Go、Cargo、Composer、Ruby 等常见目录已由平台自动加入 PATH；只有自定义安装目录才需要填写。','Common runtime directories (npm, pip, Go, Cargo, Composer, Ruby) are already added to PATH; only specify custom tool dirs.');advanced.insertBefore(label,envLabel);advanced.insertBefore(input,envLabel);advanced.insertBefore(help,envLabel)}
}
function mcpRenderKV(kind,values){const root=mcpEditor(kind);if(!root)return;root.innerHTML='';Object.entries(values||{}).forEach(([key,value])=>mcpAddKVRow(kind,key,value));}
function mcpAddKVRow(kind,key='',value=''){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const root=mcpEditor(kind);if(!root)return;const row=document.createElement('div');row.className='kv-editor-row';row.innerHTML=`<input data-kv-key placeholder="KEY" value="${escapeHTML(key)}"><input data-kv-value placeholder="VALUE" value="${escapeHTML(value)}"><button type="button" class="button ghost small" data-mcp-kv-del>${_t('删除','Remove')}</button>`;root.appendChild(row);}
function mcpCollectKV(kind){const out={};mcpEditor(kind)?.querySelectorAll('.kv-editor-row').forEach(row=>{const key=row.querySelector('[data-kv-key]')?.value.trim()||'';if(key)out[key]=row.querySelector('[data-kv-value]')?.value||''});return out}
function mcpUpdateFileSummary(files,refs=[]){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;const count=files?.length||refs.length;const el=$('#mcpFileSummary');if(el)el.textContent=count?_t(`${count} 个文件${files?.length?'待上传':'已保存'}`,`${count} file(s) ${files?.length?'queued':'saved'}`):_t('未上传文件','No files uploaded');}
async function uploadMCPSelection(id){
  const folder=$('#mcpFolderPick'),zip=$('#mcpZipPick'),files=folder?.files?.length?folder.files:zip?.files;if(!files?.length)return null;
  const body=new FormData();for(const file of files){body.append('files',file,file.name);body.append('paths',file.webkitRelativePath||file.name)}
  return api(`/api/mcp-servers/${encodeURIComponent(id)}/files`,{method:'POST',body});
}
async function saveCustomMCP(e){
	const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
	e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),wasEditing=Boolean(state.editingMCPId);button.disabled=true;button.textContent=wasEditing?_t('保存中…','Saving…'):_t('添加中…','Adding…');
  try{
    const transport=form.elements.transport.value,server={id:form.elements.id.value.trim(),name:form.elements.name.value.trim(),description:form.elements.description.value.trim(),transport,timeoutSec:Number((transport==='http'?form.elements.timeoutSecHttp:form.elements.timeoutSecStdio).value||60)};
    if(transport==='http')Object.assign(server,{authType:form.elements.authType.value,url:form.elements.url.value.trim(),headers:mcpCollectKV('headers')});
    else Object.assign(server,{command:form.elements.command.value.trim(),args:lines(form.elements.args.value),installScript:form.elements.installScript.value,workingDirectory:form.elements.workingDirectory.value.trim(),pathEntries:lines(form.elements.pathEntries.value),environment:mcpCollectKV('environment')});
    const editing=state.editingMCPId&&state.data.mcpServers.find(item=>item.id===state.editingMCPId);
    let saved;
    if(editing){Object.assign(server,{id:editing.id,scope:editing.scope,projectId:editing.projectId||'',ownerUserId:editing.ownerUserId||0,marketId:'',iconUrl:''});saved=await api('/api/mcp-servers',{method:'PUT',body:JSON.stringify(server)});toast(_t('自定义 MCP 已更新','Custom MCP updated'),'ok')}
    else{const scope=form.elements.scope.value;saved=await api('/api/mcp-servers/custom',{method:'POST',body:JSON.stringify({server,scope,projectId:scope==='project'?state.projectFilter:''})});state.mcpScope=scope;state.mcpTab='installed';toast(_t('自定义 MCP 已添加','Custom MCP added'),'ok')}
    if(transport==='stdio'){const uploaded=await uploadMCPSelection(saved.id);if(uploaded)saved=uploaded}
    const index=state.data.mcpServers.findIndex(item=>item.id===saved.id);if(index>=0)state.data.mcpServers[index]=saved;else state.data.mcpServers.push(saved);
    state.editingMCPId='';$('#customMcpModal').classList.remove('open');renderMCPManagement();renderAgents()
	}catch(err){toast(err.message,'err')}finally{button.disabled=false;button.textContent=wasEditing?_t('保存修改','Save changes'):_t('添加 MCP','Add MCP')}
}
function renderMCPManagement(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const grid=$('#mcpMarketGrid'),hint=$('#mcpScopeHint');if(!grid||!hint)return;
  state.mcpTab='installed';
  const personal=state.mcpScope==='personal';
  const scopeSelect=$('#mcpScopeSelect');if(scopeSelect&&scopeSelect.value!==state.mcpScope)scopeSelect.value=state.mcpScope;
  const project=currentProject(),installed=scopedMCPInstallations(),query=state.mcpQuery;
  const matchedInstalled=installed.filter(item=>mcpMatchesQuery(item,query));
  const installedCount=$('#mcpInstalledCount');
  if(installedCount)installedCount.textContent=String(matchedInstalled.length);
  hint.innerHTML=personal?`<b>${_t('个人 MCP','Personal MCP')}</b><span>${_t(`仅 ${escapeHTML(userDisplay(state.currentUser)||'当前用户')} 可见。`,`Visible only to ${escapeHTML(userDisplay(state.currentUser)||'current user')}.`)}</span>`:`<b>${_t('项目 MCP','Project MCP')}</b><span>${_t(`添加到「${escapeHTML(project?.name||'未选择项目')}」，不会出现在其他项目中。`,`Added to "${escapeHTML(project?.name||'No project selected')}"; not shared with other projects.`)}</span>`;
  if(personal&&(!state.currentUser||state.currentUser.isGuest)){grid.innerHTML=`<div class="mcp-market-empty"><b>${_t('登录后才能管理个人 MCP','Sign in to manage personal MCPs')}</b><p>${_t('项目级 MCP 仍可在当前项目中管理。','Project MCPs can still be managed inside the current project.')}</p></div>`;return}
  const pagedMCP=paginateList('mcp',matchedInstalled);
  const catalog=personal?'':mcpCatalogSuggestionsHTML(installed,query);
  const cards=pagedMCP.items.map(item=>`<article class="mcp-market-card is-installed"><div class="mcp-card-head"><span class="mcp-card-logo">${mcpMarketLogo(item)}</span><div><h3>${escapeHTML(item.name)}</h3><small>${personal?_t('个人专属','Personal'):escapeHTML(project?.name||item.projectId)}</small></div><span class="mcp-installed-badge ${item.marketId?'is-market':'is-custom'}">${item.marketId?_t('市场','Catalog'):_t('自定义','Custom')}</span></div><p>${escapeHTML(item.description||_t('暂无说明','No description'))}</p><div class="mcp-card-meta">${item.authType==='github-token'?`<span>${_t('GitHub 令牌认证','GitHub token auth')}</span>`:`<span>${_t('自定义认证','Custom auth')}</span>`}<span>${escapeHTML(item.transport||'http')}</span></div><div class="mcp-card-actions"><div class="mcp-action-buttons">${item.marketId?'':`<button class="button ghost small" type="button" data-mcp-edit="${escapeHTML(item.id)}">${_t('修改','Edit')}</button>`}<button class="button ghost small danger" type="button" data-mcp-remove="${escapeHTML(item.id)}">${_t('移除','Remove')}</button></div></div></article>`).join('');
  grid.innerHTML=catalog+(cards||(query?`<div class="mcp-market-empty"><b>${_t('没有匹配的 MCP','No matching MCPs')}</b><p>${_t('换个关键词试试。','Try another keyword.')}</p></div>`:`<div class="mcp-market-empty"><b>${_t('当前范围还没有 MCP','No MCPs in this scope yet')}</b><p>${_t(`点击右上角「添加 MCP」，${personal?'创建个人专属配置':'为本项目接入工具'}。`,`Click "Add MCP" in the top right to ${personal?'create a personal MCP':'connect tools for this project'}.`)}</p></div>`));
  if(cards)grid.insertAdjacentHTML('beforeend',pagerHTML('mcp',pagedMCP));
  bindMCPLogoFallbacks(grid);
  grid.querySelectorAll('[data-mcp-install]').forEach(button=>button.onclick=()=>installMarketMCP(button.dataset.mcpInstall,button));
  grid.querySelectorAll('[data-mcp-edit]').forEach(button=>button.onclick=()=>openCustomMCPModal(state.data.mcpServers.find(item=>item.id===button.dataset.mcpEdit)));
  grid.querySelectorAll('[data-mcp-remove]').forEach(button=>button.onclick=()=>removeInstalledMCP(button.dataset.mcpRemove,button));
  bindPager(grid);
}
async function removeInstalledMCP(id,button){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!await afConfirm({title:_t('移除 MCP 确认','Confirm remove MCP'),message:_t('移除后，引用这个 MCP 的角色将无法再调用它。确定移除？','Roles referencing this MCP will no longer be able to call it. Remove anyway?'),confirmText:_t('确认移除','Remove'),isDanger:true}))return;
  button.disabled=true;
  try{await api(`/api/mcp-servers?id=${encodeURIComponent(id)}`,{method:'DELETE'});state.data.mcpServers=state.data.mcpServers.filter(item=>item.id!==id);renderMCPManagement();renderAgents();toast(_t('MCP 已移除','MCP removed'),'ok')}catch(e){toast(e.message,'err');button.disabled=false}
}
