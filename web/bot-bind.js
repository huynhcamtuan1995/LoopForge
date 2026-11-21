(() => {
 const _t=(zh,en)=>typeof lfT==='function'?lfT(zh,en):zh;
 const content=document.getElementById('content');
 const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token=new URLSearchParams(location.hash.slice(1)).get('request')||sessionStorage.getItem('wecomBindingToken')||'';
 if(token){sessionStorage.setItem('wecomBindingToken',token);history.replaceState(null,'',location.pathname);}
 async function request(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||_t('请求未完成','Request failed'));return data;}
 function failure(error){content.innerHTML=`<p class="error">${escape(error.message)}</p><p>${_t('请回到企业微信，向 Bot 发送“绑定账号”获取新链接。','Please return to WeCom and send "Bind account" to the Bot to get a new link.')}</p>`;}
 async function start(){
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error(_t('绑定链接无效','Invalid binding link'));
  const auth=await request('/api/auth/current?return_url='+encodeURIComponent(location.origin+location.pathname));
  if(!auth.user||auth.user.isGuest){
   content.innerHTML=`<p>${_t('请登录你自己的平台账号。登录后仍需由原企微发送者确认，绑定才会生效。','Please sign in with your own platform account. After signing in, the original WeCom sender must confirm before the binding takes effect.')}</p><button id="login">${_t('登录平台','Sign in to platform')}</button><button class="secondary" id="local" hidden>${_t('本地验收登录','Local acceptance sign in')}</button>`;
   document.getElementById('login').onclick=()=>{if(auth.loginUrl)location.href=auth.loginUrl;else failure(new Error(_t('登录入口不可用','Sign-in URL unavailable')));};
   const local=await request('/api/auth/local').catch(()=>({enabled:false}));
   if(local.enabled){const button=document.getElementById('local');button.hidden=false;button.onclick=()=>request('/api/auth/local',{}).then(start).catch(failure);}
   return;
  }
  const data=await request('/api/bot-bindings/status',{token});
  if(data.status==='confirmed'){complete(data.loginName);return;}
  content.innerHTML=`<p>${_t('当前平台账号','Current platform account')}</p><p id="account">${escape(auth.user.chineseName)} · ${escape(data.loginName)}</p><p>${_t('绑定后，Bot 会使用此账号的个人凭据和项目权限执行你的指令。请确认这是你本人使用的账号。','Once bound, the Bot will run your commands using this account\'s personal credentials and project permissions. Confirm this is your own account.')}</p><button id="claim">${_t('确认平台账号','Confirm platform account')}</button><p><small>${_t('群里的其他人点击链接不会直接完成绑定。','Other people in the group clicking this link will not complete binding.')}</small></p>`;
  document.getElementById('claim').onclick=async()=>{const button=document.getElementById('claim');button.disabled=true;try{const result=await request('/api/bot-bindings/claim',{token});if(result.status==='confirmed'){complete(result.loginName);return;}content.innerHTML=`<p>${_t('最后一步：由原企微发送者确认','Final step: confirm by the original WeCom sender')}</p><p>${_t('复制下面的指令，发回提供绑定链接的 Bot。群聊请 @Bot，也可以在同一 Bot 的单聊里发送。','Copy the command below and send it back to the Bot that provided the binding link. Mention @Bot in group chats or send directly in a DM.')}</p><code id="command">${escape(result.command)}</code><p><button id="copy">${_t('复制确认指令','Copy confirmation command')}</button></p><p>${_t('将关联到','Will bind to')} <strong>${escape(result.loginName)}</strong>${_t('。请勿转发确认码。','. Do not forward the verification code.')}</p><small>${_t('等待企业微信确认，页面会自动更新…','Waiting for WeCom confirmation; this page updates automatically…')}</small>`;document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(result.command).then(()=>{document.getElementById('copy').textContent=_t('已复制','Copied');}).catch(()=>{document.getElementById('copy').textContent=_t('请选中上方指令复制','Please select the command above to copy');});poll(result.loginName);}catch(error){failure(error);}};
 }
 function complete(login){sessionStorage.removeItem('wecomBindingToken');content.innerHTML=`<h2>${_t('已完成关联','Binding complete')}</h2><p>${_t('当前企微账号已关联到','This WeCom account is now bound to')} <strong>${escape(login)}</strong>${_t('。','.')}</p><p>${_t('请回到 Bot 重新发送刚才的请求。可在平台个人配置中解除绑定。','Return to the Bot and resend your request. You can unbind in Personal settings.')}</p><a class="button" href="/#/settings">${_t('查看个人配置','Open Personal settings')}</a>`;}
 function poll(login){const timer=setInterval(async()=>{try{const data=await request('/api/bot-bindings/status',{token});if(data.status==='confirmed'){clearInterval(timer);complete(login);}}catch(error){clearInterval(timer);failure(error);}},2500);}
 start().catch(failure);
})();
