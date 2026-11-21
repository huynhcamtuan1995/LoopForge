const GIT_HTTP_PLATFORMS = [['github', 'GitHub / GitHub Enterprise'], ['gitlab', 'GitLab'], ['other', '其他平台']];

// Mirrors gitwork.HTTPSHostScope closely enough to prefill the form; the server
// remains the authority on what a host scope is.
function gitHTTPHostScope(raw) {
  let host = String(raw || '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '');
  if (host.endsWith(':443')) host = host.slice(0, -4);
  return host;
}

function gitHTTPDefaultUsername(platform) {
  return platform === 'gitlab' ? 'oauth2' : 'x-access-token';
}

function openGitHTTPCredentials() {
  const _t = (z, e) => (typeof lfT === 'function' ? lfT(z, e) : z);
  const pLabel = l => l === '其他平台' ? _t('其他平台', 'Other platform') : l;
  const user = state.currentUser;
  if (!user?.id || user.isGuest) return;

  const previous = $('#gitHTTPCredentialDialog');
  if (previous?.open) return;
  const opener = document.activeElement;
  const endpoint = `/api/users/${encodeURIComponent(user.id)}/git-http-credentials`;
  let creds = [];
  let editing = null;
  let deleting = '';
  let busy = false;

  const dialog = document.createElement('dialog');
  dialog.id = 'gitHTTPCredentialDialog';
  dialog.className = 'git-ssh-dialog git-http-dialog';
  dialog.setAttribute('aria-labelledby', 'gitHTTPCredentialTitle');
  dialog.innerHTML = `
    <header class="git-ssh-dialog-head">
      <h2 id="gitHTTPCredentialTitle">${_t('Git 访问令牌（按主机）', 'Git access tokens (by host)')}</h2>
      <button type="button" class="credential-btn ghost icon" data-http-cred-close aria-label="${_t('关闭', 'Close')}">${credentialGlyph('close', 16)}</button>
    </header>
    <p class="git-ssh-description">${_t('每个 HTTPS 主机配置一个个人访问令牌。平台与工作区访问该主机时，使用本轮责任人或发言人的凭据。', 'Configure one personal access token per HTTPS host. Platform and workspace requests use the current assignee or speaker credentials.')}</p>
    <p class="git-ssh-status" role="status">${_t('正在读取凭据…', 'Loading credentials…')}</p>
    <div class="git-ssh-key-list"></div>
    <button type="button" class="credential-btn primary" data-http-cred-add disabled>${_t('添加令牌', 'Add token')}</button>
    <form class="git-ssh-key-form" hidden>
      <h3></h3>
      ${credentialFieldHTML({label:_t('HTTPS 主机', 'HTTPS host'), name:'host', type:'text', placeholder:_t('github.com 或 gitlab.example.org:8443', 'github.com or gitlab.example.org:8443'), hint:_t('只填主机名，可附带端口；令牌只提供给这台主机。', 'Hostname only (with optional port); the token is sent only to this host.')})}
      <label class="credential-field">
        <span>${_t('平台', 'Platform')}</span>
        <div class="credential-input is-plain">
          <select name="platform" class="git-http-select" aria-label="${_t('平台', 'Platform')}" aria-describedby="gitHTTPCredentialPlatformHint">
            ${GIT_HTTP_PLATFORMS.map(([value, label]) => `<option value="${value}">${escapeHTML(pLabel(label))}</option>`).join('')}
          </select>
        </div>
        <small id="gitHTTPCredentialPlatformHint">${_t('GitHub 和 GitLab 支持 gh / glab 认证和 PR/MR 合并状态同步。其他平台也可由 Agent 创建 PR/MR，合并状态请到托管平台查看。', 'GitHub and GitLab support gh / glab authentication and PR/MR merge status sync. Agents can still create PRs/MRs on other hosts; check merge status there.')}</small>
      </label>
      ${credentialFieldHTML({label:_t('名称', 'Name'), name:'name', type:'text', placeholder:_t('例如 公司 GitLab', 'e.g. Company GitLab'), hint:null})}
      ${credentialFieldHTML({label:_t('Git 认证用户名', 'Git auth username'), name:'username', type:'text', placeholder:'x-access-token', hint:_t('按托管平台要求填写；这是 HTTPS 认证用户名，不是提交作者名，通常无法从 Token 推导。', 'Enter the HTTPS auth username required by your host (not the Git commit author name, which usually cannot be inferred from the token).')})}
      ${credentialFieldHTML({label:_t('个人访问令牌', 'Personal access token'), name:'token', placeholder:_t('粘贴个人访问令牌', 'Paste personal access token'), hint:_t('保存后不再显示；编辑时留空保留现有令牌。', 'Not shown again after saving; leave blank when editing to keep the existing token.')})}
      <footer class="git-ssh-form-actions">
        <button type="button" class="credential-btn secondary" data-http-cred-cancel>${_t('取消', 'Cancel')}</button>
        <button type="submit" class="credential-btn primary">${_t('保存令牌', 'Save token')}</button>
      </footer>
    </form>`;

  const list = dialog.querySelector('.git-ssh-key-list');
  const status = dialog.querySelector('.git-ssh-status');
  const add = dialog.querySelector('[data-http-cred-add]');
  const form = dialog.querySelector('form');
  const field = key => form.elements.namedItem(key);
  const [host, platform, name, username, token] = ['host', 'platform', 'name', 'username', 'token'].map(field);
  host.maxLength = 255;
  name.maxLength = 80;
  username.maxLength = 128;
  token.maxLength = 4096;
  host.required = name.required = true;

  function setStatus(message = '', error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
    status.hidden = !message;
  }

  function credentialSummary(cred) {
    const platformLabel = pLabel((GIT_HTTP_PLATFORMS.find(([value]) => value === cred.platform) || [, cred.platform])[1]);
    const tags = [platformLabel, cred.managed ? _t('平台托管', 'Platform-managed') : ''].filter(Boolean);
    return `<div class="git-ssh-key-summary"><b>${escapeHTML(cred.name)}</b><small><code>${escapeHTML(cred.host)}</code> · ${tags.map(escapeHTML).join(' · ')}</small></div>`;
  }

  function renderList() {
    list.innerHTML = creds.map(cred => {
      const id = escapeHTML(cred.id);
      const verify = cred.platform !== 'other' || cred.managed ? `<button type="button" class="credential-btn ghost" data-http-cred-verify="${id}">${_t('校验令牌', 'Verify')}</button>` : '';
      const actions = cred.managed
        ? verify
        : deleting === cred.id
          ? `<span>${_t('删除这条令牌？', 'Delete this token?')}</span><button type="button" class="credential-btn ghost" data-http-cred-keep>${_t('取消', 'Cancel')}</button><button type="button" class="credential-btn danger-solid" data-http-cred-remove="${id}">${_t('确认删除', 'Delete')}</button>`
          : `${verify}<button type="button" class="credential-btn ghost" data-http-cred-edit="${id}">${_t('编辑', 'Edit')}</button><button type="button" class="credential-btn ghost" data-http-cred-delete="${id}">${_t('删除', 'Delete')}</button>`;
      return `<div class="git-ssh-key-row">${credentialSummary(cred)}${actions}</div>`;
    }).join('');
  }

  function openForm(cred) {
    editing = cred;
    deleting = '';
    renderList();
    form.reset();
    form.hidden = false;
    add.hidden = true;
    form.querySelector('h3').textContent = cred ? _t('编辑令牌', 'Edit token') : _t('添加令牌', 'Add token');
    host.value = cred?.host || '';
    host.readOnly = !!cred;
    platform.value = cred?.platform || 'github';
    name.value = cred?.name || '';
    username.value = cred?.username || '';
    username.placeholder = gitHTTPDefaultUsername(platform.value);
    token.required = !cred;
    token.placeholder = cred ? _t('留空保留现有令牌', 'Leave blank to keep existing token') : _t('粘贴个人访问令牌', 'Paste personal access token');
    (cred ? name : host).focus();
  }

  function closeForm() {
    form.reset();
    form.hidden = true;
    add.hidden = false;
    editing = null;
    add.focus();
  }

  function setBusy(on) {
    busy = on;
    dialog.toggleAttribute('aria-busy', on);
    form.querySelector('button[type="submit"]').disabled = on;
  }

  async function request(method, body, id) {
    if (busy) return;
    setBusy(true);
    setStatus(method === 'PUT' ? _t('正在保存…', 'Saving…') : _t('正在删除…', 'Deleting…'));
    try {
      creds = await api(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, {
        method, silent:true, ...(body ? {body:JSON.stringify(body)} : {}),
      });
      storeCredentialUser({...credentialUser(), id:user.id, gitHttpCredentialsConfigured:creds.length > 0, gitHubCredentialConfigured:creds.some(credential=>credential.host==='github.com')});
      renderCredentialPanel();
      notifyCredentialsChanged();
      deleting = '';
      renderList();
      if (method === 'PUT') closeForm();
      setStatus(method === 'PUT' ? _t('令牌已保存', 'Token saved') : _t('令牌已删除', 'Token deleted'));
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function verify(id) {
    if (busy) return;
    setBusy(true);
    setStatus(_t('正在校验…', 'Verifying…'));
    try {
      const result = await api(`${endpoint}/${encodeURIComponent(id)}/verify`, {method:'POST', silent:true});
      if (result?.valid) setStatus(result.login ? _t(`令牌有效，账号 ${result.login}`, `Token valid for ${result.login}`) : _t('令牌有效', 'Token valid'));
      else setStatus(result?.error || _t('令牌校验未通过', 'Token verification failed'), true);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  dialog.onclick = event => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    const action = button.dataset;
    if ('httpCredClose' in action) return dialog.close();
    if ('httpCredCancel' in action) return closeForm();
    if ('httpCredAdd' in action) return openForm(null);
    if (action.httpCredVerify) return verify(action.httpCredVerify);
    if (action.httpCredEdit) return openForm(creds.find(cred => cred.id === action.httpCredEdit));
    if (action.httpCredRemove) return request('DELETE', null, action.httpCredRemove);
    if (action.httpCredDelete || 'httpCredKeep' in action) {
      deleting = action.httpCredDelete || '';
      renderList();
      (list.querySelector('[data-http-cred-remove]') || add).focus();
    }
  };
  host.addEventListener('change', () => {
    if (editing) return;
    const scope = gitHTTPHostScope(host.value);
    if (scope === 'github.com') platform.value = 'github';
    else if (/(^|\.)gitlab\./.test(scope)) platform.value = 'gitlab';
    username.placeholder = gitHTTPDefaultUsername(platform.value);
    if (!name.value.trim()) name.value = scope;
  });
  platform.addEventListener('change', () => { username.placeholder = gitHTTPDefaultUsername(platform.value); });
  form.onsubmit = event => {
    event.preventDefault();
    const body = {
      host:host.value, platform:platform.value, name:name.value,
      username:username.value.trim() || gitHTTPDefaultUsername(platform.value),
      token:token.value,
    };
    if (editing) body.id = editing.id;
    return request('PUT', body);
  };
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.metaKey || event.ctrlKey) event.stopPropagation();
  });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    form.reset();
    dialog.remove();
    if (opener?.isConnected) opener.focus({preventScroll:true});
    else $('#credentialPanel [data-credential-row="gitHttpCredentials"] [data-credential-act="setup"]')?.focus({preventScroll:true});
  });
  document.body.append(dialog);
  dialog.showModal();
  hydrateCredentialIcons(dialog);
  api(endpoint, {silent:true}).then(items => {
    if (!dialog.open) return;
    creds = Array.isArray(items) ? items : [];
    add.disabled = false;
    setStatus(creds.length ? '' : '还没有配置 Git 访问令牌');
    renderList();
  }).catch(error => setStatus(error.message, true));
}
