// AI 定时任务「执行记录」看板：最近 7 天概览、组合筛选、可展开的分页表格。
// 每次执行一条记录，失败可直接复制 Trace ID 去日志里检索。
// 筛选、计数、分页和概览都在服务端完成（/api/schedule-job-executions/dashboard），
// 这里只持有当前一页，结果不受一次能拉多少条的限制。
let scheduleExecutions=[];
let scheduleExecTotal=0;
let scheduleExecOverview=null;
let scheduleExecRecords=0;
let scheduleExecRecentFailed=0;
let scheduleExecProject=null;
let scheduleExecLoading=false;
let scheduleExecError='';
let scheduleExecRequest=0;
let scheduleExecSearchTimer=0;
let scheduleExecStatusFilter='';
let scheduleExecJobFilter='';
let scheduleExecRangeFilter='';
let scheduleExecQuery='';
let scheduleExecPage=1;
let scheduleExecPageSize=10;
const scheduleExecExpanded=new Set();
const SCHEDULE_EXEC_DAY=86400000;
const SCHEDULE_EXEC_PAGE_SIZES=[10,20,50];
const SCHEDULE_EXEC_SEARCH_DELAY=250;
const SCHEDULE_EXEC_STATUS={
  running:{label:'进行中',en:'Running',tone:'info',icon:''},
  success:{label:'成功',en:'Succeeded',tone:'success',icon:'check'},
  failed:{label:'失败',en:'Failed',tone:'error',icon:'alert'},
  waiting:{label:'待对齐基线',en:'Awaiting baseline',tone:'warn',icon:'clock'}
};
// Overridable clock so the time-range filters are testable.
function scheduleExecNow(){return Date.now()}
function scheduleExecStatusInfo(status){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const item=SCHEDULE_EXEC_STATUS[status];
  return item?{...item,label:_t(item.label,item.en)}:{label:status||_t('未知','Unknown'),tone:'neutral',icon:'circle'};
}
function scheduleExecIcon(name,size=14){return `<svg class="agent-icon harness-icon" data-icon="${name}" width="${size}" height="${size}" aria-hidden="true" focusable="false"></svg>`}
function scheduleExecBadgeHTML(e){
  const info=scheduleExecStatusInfo(e?.status);
  const mark=info.icon?`<span class="hui-badge-glyph" aria-hidden="true">${scheduleExecIcon(info.icon,12)}</span>`:'<span class="hui-lamp" aria-hidden="true"><i></i></span>';
  return `<span class="hui-badge" data-size="sm" data-tone="${info.tone}" data-status="${escapeHTML(e?.status||'')}">${mark}<span class="hui-badge-label">${escapeHTML(info.label)}</span></span>`;
}
function scheduleExecTriggerLabel(origin){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return origin==='manual_run'?_t('手动运行','Manual run'):origin==='timer'?_t('定时触发','Scheduled'):(origin||_t('定时触发','Scheduled'));
}
function scheduleExecDurationLabel(ms){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const n=Number(ms)||0;
  if(n<=0)return '—';
  if(n<1000)return _t('<1 秒','<1s');
  const s=Math.round(n/1000);
  if(s<60)return _t(`${s} 秒`,`${s}s`);
  if(s<3600)return _t(`${Math.floor(s/60)} 分 ${s%60} 秒`,`${Math.floor(s/60)}m ${s%60}s`);
  return _t(`${Math.floor(s/3600)} 小时 ${Math.floor(s%3600/60)} 分`,`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`);
}
function scheduleExecShortTrace(trace){return String(trace||'').slice(-8)}
function scheduleExecTokenNumber(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.floor(n):0}
function scheduleExecTokenLabel(value){return scheduleExecTokenNumber(value).toLocaleString('zh-CN')}
function scheduleExecUsageTotal(e){return e?.usage?scheduleExecTokenNumber(e.usage.totalTokens)||scheduleExecTokenNumber(e.usage.inputTokens)+scheduleExecTokenNumber(e.usage.outputTokens):null}
function scheduleExecTokenCellHTML(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const total=scheduleExecUsageTotal(e);
  if(total===null)return `<span class="muted">${e.jobKind==='assistant'?(e.status==='running'?_t('待统计','Pending'):_t('未上报','Not reported')):'—'}</span>`;
  const u=e.usage;
  const parts=[
    _t(`输入 ${scheduleExecTokenLabel(u.inputTokens)}`,`Input ${scheduleExecTokenLabel(u.inputTokens)}`),
    _t(`输出 ${scheduleExecTokenLabel(u.outputTokens)}`,`Output ${scheduleExecTokenLabel(u.outputTokens)}`),
    _t(`缓存读 ${scheduleExecTokenLabel(u.cacheReadTokens)}`,`Cache read ${scheduleExecTokenLabel(u.cacheReadTokens)}`),
    _t(`缓存写 ${scheduleExecTokenLabel(u.cacheWriteTokens)}`,`Cache write ${scheduleExecTokenLabel(u.cacheWriteTokens)}`)
  ];
  return `<span title="${escapeHTML(parts.join(' · '))}">${scheduleExecTokenLabel(total)}</span>`;
}
function scheduleExecUsageDetailHTML(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!e.usage)return '';
  const u=e.usage;
  const field=(label,value)=>`<div><dt>${label}</dt><dd>${scheduleExecTokenLabel(value)}</dd></div>`;
  return `<div><dt>${_t('模型','Model')}</dt><dd>${escapeHTML(e.model||_t('未上报','Not reported'))}</dd></div>${field(_t('Token 总量','Total tokens'),scheduleExecUsageTotal(e))}${field(_t('输入 Token','Input tokens'),u.inputTokens)}${field(_t('输出 Token','Output tokens'),u.outputTokens)}${field(_t('缓存读 Token','Cache read tokens'),u.cacheReadTokens)}${field(_t('缓存写 Token','Cache write tokens'),u.cacheWriteTokens)}`;
}
function scheduleExecTimeLabel(value){
  const d=knownTime(value);if(!d)return '—';
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function scheduleExecDayStart(ms){const d=new Date(ms);d.setHours(0,0,0,0);return d.getTime()}
// The server counts windows; this only turns one into the four metrics.
function scheduleExecWindow(w){
  const finished=Number(w?.finished)||0,success=Number(w?.success)||0;
  return {total:Number(w?.total)||0,success,failed:Number(w?.failed)||0,running:Number(w?.running)||0,rate:finished?Math.round(success/finished*100):null,avgMs:Number(w?.avgMs)||0,metered:Number(w?.metered)||0,tokens:scheduleExecTokenNumber(w?.tokens?.total)};
}
// "today" starts at local midnight; 7d/30d count back from now.
function scheduleExecSince(range,now=scheduleExecNow()){
  if(range==='today')return new Date(scheduleExecDayStart(now)).toISOString();
  const days={'7d':7,'30d':30}[range];
  return days?new Date(now-days*SCHEDULE_EXEC_DAY).toISOString():'';
}
function scheduleExecDashboardPath(projectId){
  const p=new URLSearchParams({projectId});
  if(scheduleExecJobFilter)p.set('jobId',scheduleExecJobFilter);
  if(scheduleExecStatusFilter)p.set('status',scheduleExecStatusFilter);
  const since=scheduleExecSince(scheduleExecRangeFilter);if(since)p.set('since',since);
  const q=scheduleExecQuery.trim();if(q)p.set('q',q);
  p.set('offset',String((scheduleExecPage-1)*scheduleExecPageSize));
  p.set('limit',String(scheduleExecPageSize));
  return `/api/schedule-job-executions/dashboard?${p}`;
}
async function refreshScheduleExecutions(){
  clearTimeout(scheduleExecSearchTimer);
  const projectId=state.projectFilter||'';
  const request=++scheduleExecRequest;
  if(scheduleExecProject!==projectId){
    scheduleExecExpanded.clear();scheduleExecPage=1;
    scheduleExecutions=[];scheduleExecTotal=0;scheduleExecOverview=null;scheduleExecRecords=0;scheduleExecRecentFailed=0;
  }
  scheduleExecProject=projectId;
  if(!projectId){scheduleExecError='';scheduleExecLoading=false;renderScheduleExecutions();return scheduleExecutions}
  scheduleExecLoading=true;scheduleExecError='';
  renderScheduleExecutions();
  try{
    let page=await api(scheduleExecDashboardPath(projectId),{silent:true});
    // The list shrank under the current page: show its last page instead.
    const pages=Math.max(1,Math.ceil((Number(page?.total)||0)/scheduleExecPageSize));
    if(request===scheduleExecRequest&&scheduleExecPage>pages){scheduleExecPage=pages;page=await api(scheduleExecDashboardPath(projectId),{silent:true})}
    if(request!==scheduleExecRequest)return scheduleExecutions;
    scheduleExecutions=Array.isArray(page?.items)?page.items:[];
    scheduleExecTotal=Number(page?.total)||0;
    scheduleExecOverview=page?.overview||null;
    scheduleExecRecords=Number(page?.records)||0;
    scheduleExecRecentFailed=Number(page?.recentFailed)||0;
  }catch(err){
    if(request===scheduleExecRequest)scheduleExecError=err.message;
  }finally{
    if(request===scheduleExecRequest){scheduleExecLoading=false;renderScheduleExecutions()}
  }
  return scheduleExecutions;
}
// A delta is good or bad by metric: fewer failures and shorter runs are good.
function scheduleExecDeltaHTML(cur,prev,{unit='%',lowerIsBetter=false}={}){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(cur===null||prev===null||cur===undefined||prev===undefined)return `<small class="sched-exec-delta" data-trend="flat">${_t('上周无数据','No data last week')}</small>`;
  let diff;
  if(unit==='pp')diff=cur-prev;
  else{if(!prev)return `<small class="sched-exec-delta" data-trend="flat">${cur?_t('上周无数据','No data last week'):_t('与上周持平','Same as last week')}</small>`;diff=Math.round((cur-prev)/prev*100)}
  if(!diff)return `<small class="sched-exec-delta" data-trend="flat">${_t('与上周持平','Same as last week')}</small>`;
  const up=diff>0,good=up!==lowerIsBetter;
  return `<small class="sched-exec-delta" data-trend="${up?'up':'down'}" data-good="${good}">${_t('较上周','vs last week')} <b>${up?'+':'−'}${Math.abs(diff)}${unit}</b>${scheduleExecIcon(up?'arrow-up':'arrow-down',12)}</small>`;
}
function scheduleExecMetricsHTML(overview){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const c=scheduleExecWindow(overview?.current),p=scheduleExecWindow(overview?.previous);
  const cell=(tone,icon,label,value,delta)=>`<div class="sched-exec-metric" data-tone="${tone}"><span class="sched-exec-metric-icon" aria-hidden="true">${scheduleExecIcon(icon,18)}</span><div class="sched-exec-metric-body"><span>${label}</span><b>${value}</b>${delta}</div></div>`;
  return cell('accent','layers',_t('执行次数','Executions'),c.total,c.total||p.total?scheduleExecDeltaHTML(c.total,p.total):`<small class="sched-exec-delta" data-trend="flat">${_t('最近 7 天无执行','No executions in last 7 days')}</small>`)
    +cell('success','check',_t('成功率','Success rate'),c.rate===null?'—':`${c.rate}%`,`<small class="sched-exec-outcomes"><span>${_t(`成功 ${c.success} 次`,`${c.success} succeeded`)}</span><span${c.failed>0?' class="has-failures"':''}>${_t(`失败 ${c.failed} 次`,`${c.failed} failed`)}</span></small>`)
    +cell('info','priority-bolt',_t('平均耗时','Avg duration'),c.avgMs?scheduleExecDurationLabel(c.avgMs):'—',c.avgMs&&p.avgMs?scheduleExecDeltaHTML(Math.round(c.avgMs),Math.round(p.avgMs),{lowerIsBetter:true}):`<small class="sched-exec-delta" data-trend="flat">${_t('已结束的执行','Finished executions')}</small>`)
    +cell('accent','layers',_t('Token 总消耗','Total tokens'),c.metered?scheduleExecTokenLabel(c.tokens):'—',`<small class="sched-exec-delta" data-trend="flat">${_t(`${c.metered} 次已上报 · 最近 7 天`,`${c.metered} metered · Last 7 days`)}</small>`);
}
// Same link shape as issueConversationURL: the Studio frame opens chatSession.
function scheduleExecConversationURL(e){
  const url=new URL('/',location.origin);
  if(e.projectId)url.searchParams.set('projectId',e.projectId);
  url.searchParams.set('chatSession',e.sessionId);
  url.hash='/collaboration';
  return url.href;
}
function scheduleExecSummaryLine(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const error=String(e.error||'').trim();
  if(error)return `<p class="sched-exec-error${e.status==='waiting'?' is-warn':''}">${escapeHTML(error)}</p>`;
  if(e.jobKind==='assistant')return e.assistantMessage?`<p class="sched-exec-message">${escapeHTML(e.assistantMessage)}</p>`:'';
  const runs=(e.runs||[]).filter(r=>r.runId).map(r=>r.issueTitle||r.issueId||r.runId);
  return `<p class="sched-exec-message">${_t(`候选 ${Number(e.pulled)||0} · 启动 ${Number(e.dispatched)||0}`,`Candidates ${Number(e.pulled)||0} · Started ${Number(e.dispatched)||0}`)}${runs.length?` · ${escapeHTML(runs.join(_t('、',', ')))}`:''}</p>`;
}
function scheduleExecRowMenuHTML(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const id=escapeHTML(e.id),job=(state.data.scheduleJobs||[]).find(j=>j.id===e.jobId);
  const item=(attr,value,label,icon)=>`<button type="button" role="menuitem" tabindex="-1" class="schedule-row-menu-item" ${attr}="${escapeHTML(value)}"><svg class="agent-icon harness-icon" data-icon="${icon}" width="16" height="16" aria-hidden="true" focusable="false"></svg><span>${label}</span></button>`;
  const items=[
    e.traceId?item('data-copy-trace',e.traceId,_t('复制排障信息','Copy diagnostics'),'copy'):'',
    scheduleExecJobFilter===e.jobId?'':item('data-exec-only-job',e.jobId,_t('只看该任务','Filter by this job'),'filter'),
    job?item('data-exec-edit-job',e.jobId,_t('编辑任务','Edit job'),'edit'):''
  ].join('');
  if(!items)return '';
  return `<span class="schedule-row-more"><button type="button" class="button ghost small schedule-row-more-btn" data-schedule-menu="${id}" aria-label="${_t(`更多操作：${escapeHTML(e.jobName||e.jobId)} ${escapeHTML(scheduleExecTimeLabel(e.startedAt))}`,`More actions: ${escapeHTML(e.jobName||e.jobId)} ${escapeHTML(scheduleExecTimeLabel(e.startedAt))}`)}" aria-haspopup="menu" aria-expanded="false">${scheduleExecIcon('more-horizontal',16)}</button><span class="schedule-row-menu" role="menu" hidden>${items}</span></span>`;
}
function scheduleExecDetailHTML(e,detailId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const assistant=e.jobKind==='assistant';
  const field=(label,value)=>value?`<div><dt>${label}</dt><dd>${value}</dd></div>`:'';
  const error=String(e.error||'').trim();
  const runs=(e.runs||[]).filter(r=>r.runId);
  const runLinks=runs.length?`<div class="sched-exec-runs">${runs.map(r=>`<button type="button" class="sched-exec-run" data-open-exec-run="${escapeHTML(r.runId)}" title="${_t(`打开运行 ${escapeHTML(r.runId)}`,`Open run ${escapeHTML(r.runId)}`)}">${scheduleExecIcon('workflow',12)}${escapeHTML(r.issueTitle||r.issueId||r.runId)}</button>`).join('')}</div>`:'';
  const finished=knownTime(e.finishedAt);
  return `<tr class="sched-exec-detail" id="${detailId}" ${scheduleExecExpanded.has(e.id)?'':'hidden'}><td colspan="8"><div class="sched-exec-detail-body"><dl class="sched-exec-fields">${field(_t('触发方式','Trigger'),escapeHTML(scheduleExecTriggerLabel(e.triggerOrigin)))}${field(_t('开始时间','Started'),escapeHTML(scheduleExecTimeLabel(e.startedAt)))}${field(_t('结束时间','Finished'),finished?escapeHTML(scheduleExecTimeLabel(e.finishedAt)):'')}${field(_t('耗时','Duration'),e.status==='running'?_t('进行中','Running'):escapeHTML(scheduleExecDurationLabel(e.durationMs)))}${field('Trace ID',e.traceId?`<code>${escapeHTML(e.traceId)}</code>`:'')}${assistant?'':field(_t('候选 / 启动','Candidates / Started'),`${Number(e.pulled)||0} / ${Number(e.dispatched)||0}`)}${scheduleExecUsageDetailHTML(e)}</dl>${error?`<div class="sched-exec-detail-text is-error"><b>${_t('错误','Error')}</b><pre>${escapeHTML(error)}</pre></div>`:''}${!error&&assistant&&e.assistantMessage?`<div class="sched-exec-detail-text"><b>${_t('AI 回复','AI reply')}</b><pre>${escapeHTML(e.assistantMessage)}</pre></div>`:''}${runLinks?`<div class="sched-exec-detail-text"><b>${_t('派发运行','Dispatched runs')}</b>${runLinks}</div>`:''}</div></td></tr>`;
}
// Every row has the same two action slots, so ⋯ lines up down the column:
// the primary slot says why there is nothing to open instead of vanishing.
function scheduleExecPrimaryActionHTML(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(e.jobKind==='assistant'){
    if(e.sessionId&&e.sessionGone)return `<span class="sched-exec-action is-unavailable" title="${_t('这次执行的会话已被清理（超出任务的保留会话数或保留期限，或被手动删除），无法再打开；AI 回复仍可在详情里查看','This execution\'s session has been cleaned up (exceeded retention count/period or manually deleted) and can no longer be opened; the AI reply can still be viewed in details')}">${scheduleExecIcon('preview-expand')}<span>${_t('会话已清理','Session cleaned up')}</span></span>`;
    if(e.sessionId)return `<a class="sched-exec-action sched-exec-chat" data-open-exec-chat="${escapeHTML(e.sessionId)}" href="${escapeHTML(scheduleExecConversationURL(e))}" target="_blank" rel="noopener" title="${_t('在新标签页打开本次执行的对话','Open this execution\'s conversation in a new tab')}">${scheduleExecIcon('preview-expand')}<span>${_t('打开会话','Open session')}</span></a>`;
    const why=e.status==='running'?_t('会话创建后即可打开','Session can be opened once created'):_t('这次执行在创建会话之前就结束了（例如缺少 Key），没有对话可打开','This execution ended before creating a session (e.g. missing key); no conversation to open');
    return `<span class="sched-exec-action is-unavailable" title="${why}">${scheduleExecIcon('preview-expand')}<span>${e.status==='running'?_t('准备中','Preparing'):_t('无会话','No session')}</span></span>`;
  }
  const firstRun=(e.runs||[]).find(r=>r.runId);
  if(firstRun)return `<button type="button" class="sched-exec-action" data-open-exec-first-run="${escapeHTML(firstRun.runId)}" title="${_t(`打开运行 ${escapeHTML(firstRun.runId)}`,`Open run ${escapeHTML(firstRun.runId)}`)}">${scheduleExecIcon('workflow')}<span>${_t('查看运行','View run')}</span></button>`;
  return `<span class="sched-exec-action is-unavailable" title="${_t('这次没有派发需求，没有运行可查看','No issues were dispatched in this execution; no run to view')}">${scheduleExecIcon('workflow')}<span>${_t('未派发','Not dispatched')}</span></span>`;
}
function scheduleExecRowHTML(e){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const assistant=e.jobKind==='assistant',open=scheduleExecExpanded.has(e.id);
  const detailId=`sched-exec-detail-${String(e.id).replace(/[^A-Za-z0-9_-]/g,'')}`;
  const trace=e.traceId?`<button type="button" class="sched-exec-copy sched-exec-trace" data-copy-trace="${escapeHTML(e.traceId)}" aria-label="${_t(`复制 Trace ID 与排障信息：${escapeHTML(e.traceId)}`,`Copy Trace ID & diagnostics: ${escapeHTML(e.traceId)}`)}" title="${_t(`复制 Trace ID 与排障信息（${escapeHTML(e.traceId)}），可直接发给 AI 助手排查`,`Copy Trace ID & diagnostics (${escapeHTML(e.traceId)}) to share with AI assistant for troubleshooting`)}"><code>${escapeHTML(scheduleExecShortTrace(e.traceId))}</code>${scheduleExecIcon('copy',13)}</button>`:'<span class="muted">—</span>';
  return `<tr class="sched-exec-row${open?' is-open':''}" data-status="${escapeHTML(e.status||'')}" data-exec-id="${escapeHTML(e.id)}"><td class="sched-exec-toggle-cell"><button type="button" class="sched-exec-toggle" data-exec-toggle="${escapeHTML(e.id)}" aria-expanded="${open}" aria-controls="${detailId}" aria-label="${open?_t('收起详情','Collapse details'):_t('展开详情','Expand details')}">${scheduleExecIcon('chevron-right')}</button></td><td>${scheduleExecBadgeHTML(e)}</td><td class="sched-exec-main"><b><span class="schedule-kind-tag ${assistant?'is-assistant':'is-dispatch'}">${assistant?'AI':_t('触发','Trigger')}</span><span class="sched-exec-name" title="${escapeHTML(e.jobName||e.jobId)}">${escapeHTML(e.jobName||e.jobId)}</span></b>${scheduleExecSummaryLine(e)}</td><td class="sched-exec-time" title="${escapeHTML(scheduleExecTriggerLabel(e.triggerOrigin))}">${escapeHTML(scheduleExecTimeLabel(e.startedAt))}</td><td class="sched-exec-duration">${e.status==='running'?_t('进行中','Running'):escapeHTML(scheduleExecDurationLabel(e.durationMs))}</td><td class="sched-exec-tokens">${scheduleExecTokenCellHTML(e)}</td><td class="sched-exec-trace-cell">${trace}</td><td class="sched-exec-actions"><div class="sched-exec-action-slots">${scheduleExecPrimaryActionHTML(e)}${scheduleExecRowMenuHTML(e)||'<span class="sched-exec-more-slot" aria-hidden="true"></span>'}</div></td></tr>${scheduleExecDetailHTML(e,detailId)}`;
}
function scheduleExecTableHTML(rows){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return `<table class="sched-exec-table"><thead><tr><th scope="col" class="sched-exec-toggle-cell" aria-label="${_t('展开详情','Expand details')}"></th><th scope="col">${_t('状态','Status')}</th><th scope="col">${_t('任务名称','Job')}</th><th scope="col">${_t('触发时间','Triggered')}</th><th scope="col"><span class="sched-exec-th-hint" title="${_t('从开始到结束的时长；进行中的执行不计','Duration from start to finish; running executions excluded')}">${_t('耗时','Duration')}${scheduleExecIcon('info',12)}</span></th><th scope="col"><span class="sched-exec-th-hint" title="${_t('本次 AI 调用上报的总量，包含重试；不含下游 SOP，缓存明细不重复计入','Total reported for this AI call including retries; excludes downstream SOPs; cache details not double-counted')}">Token${scheduleExecIcon('info',12)}</span></th><th scope="col">Trace ID</th><th scope="col" class="sched-exec-actions">${_t('操作','Actions')}</th></tr></thead><tbody>${rows.map(scheduleExecRowHTML).join('')}</tbody></table>`;
}
// Page buttons: first, last, and the current page ±1, with gaps as "…".
function scheduleExecPageList(page,pages){
  const keep=new Set([1,pages,page-1,page,page+1].filter(n=>n>=1&&n<=pages));
  const out=[];let prev=0;
  for(const n of [...keep].sort((a,b)=>a-b)){if(n-prev>1)out.push('…');out.push(n);prev=n}
  return out;
}
function scheduleExecPagerHTML(total){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const pages=Math.max(1,Math.ceil(total/scheduleExecPageSize));
  const nav=(page,label,icon,disabled)=>`<button type="button" class="sched-exec-page" data-exec-page="${page}" aria-label="${label}" ${disabled?'disabled':''}>${scheduleExecIcon(icon)}</button>`;
  return `<label class="sched-exec-page-size">${_t('每页','Per page')}<select id="scheduleExecPageSize" class="select" aria-label="${_t('每页条数','Items per page')}">${SCHEDULE_EXEC_PAGE_SIZES.map(n=>`<option value="${n}" ${n===scheduleExecPageSize?'selected':''}>${_t(`${n} 条`,`${n}`)}</option>`).join('')}</select></label><nav class="sched-exec-pages" aria-label="${_t('执行记录分页','Execution history pagination')}">${nav(scheduleExecPage-1,_t('上一页','Previous page'),'chevron-left',scheduleExecPage<=1)}${scheduleExecPageList(scheduleExecPage,pages).map(n=>n==='…'?'<span class="sched-exec-page-gap" aria-hidden="true">…</span>':`<button type="button" class="sched-exec-page${n===scheduleExecPage?' is-current':''}" data-exec-page="${n}" ${n===scheduleExecPage?'aria-current="page"':''} aria-label="${_t(`第 ${n} 页`,`Page ${n}`)}">${n}</button>`).join('')}<span class="sched-exec-page-total">${_t(`共 ${pages} 页`,`${pages} pages total`)}</span>${nav(scheduleExecPage+1,_t('下一页','Next page'),'chevron-right',scheduleExecPage>=pages)}</nav>`;
}
function scheduleExecJobOptions(){
  const jobs=new Map();
  for(const j of scheduleJobsInView(state.data.scheduleJobs,state.projectFilter))jobs.set(j.id,j.name||j.id);
  for(const e of scheduleExecutions)if(!jobs.has(e.jobId))jobs.set(e.jobId,e.jobName||e.jobId);
  // A deleted job keeps its option while filtered, so the select matches the query.
  if(scheduleExecJobFilter&&!jobs.has(scheduleExecJobFilter))jobs.set(scheduleExecJobFilter,scheduleExecJobFilter);
  return [...jobs].sort((a,b)=>a[1].localeCompare(b[1],'zh'));
}
function renderScheduleExecutionCount(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const count=$('#aiScheduleExecCount');
  if(!count)return;
  const mine=scheduleExecProject===(state.projectFilter||'');
  const records=mine?scheduleExecRecords:0,failed=mine?scheduleExecRecentFailed:0;
  count.textContent=records?String(records):'';
  count.hidden=!records;
  count.classList.toggle('is-danger',failed>0);
  count.title=records?_t(`共 ${records} 条执行记录${failed?`，最近 7 天失败 ${failed} 次`:''}`,`${records} execution records${failed?`, ${failed} failed in last 7 days`:''}`):'';
}
function scheduleExecFiltersActive(){return !!(scheduleExecStatusFilter||scheduleExecJobFilter||scheduleExecRangeFilter||scheduleExecQuery.trim())}
function renderScheduleExecutions(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  renderScheduleExecutionCount();
  const panel=$('#aiScheduleExecPanel');
  if(!panel||panel.hidden)return;
  if(scheduleExecProject!==(state.projectFilter||'')&&!scheduleExecLoading){refreshScheduleExecutions();return}
  const jobSelect=$('#scheduleExecJob'),statusSelect=$('#scheduleExecStatus'),rangeSelect=$('#scheduleExecRange'),search=$('#scheduleExecSearch');
  const options=scheduleExecJobOptions();
  if(jobSelect){
    jobSelect.replaceChildren(new Option(_t('全部任务','All jobs'),''),...options.map(([id,name])=>new Option(name,id)));
    jobSelect.value=scheduleExecJobFilter;
  }
  if(statusSelect)statusSelect.value=scheduleExecStatusFilter;
  if(rangeSelect)rangeSelect.value=scheduleExecRangeFilter;
  if(search&&search.value!==scheduleExecQuery)search.value=scheduleExecQuery;
  const reset=$('#scheduleExecReset');if(reset)reset.disabled=!scheduleExecFiltersActive();
  // The overview follows the job filter only: it always covers the last 7 days.
  const jobName=scheduleExecJobFilter?options.find(([id])=>id===scheduleExecJobFilter)?.[1]:'';
  const scope=$('#scheduleExecOverviewScope');if(scope)scope.textContent=jobName?_t(`（最近 7 天 · ${jobName}）`,`(Last 7 days · ${jobName})`):_t('（最近 7 天）','(Last 7 days)');
  $('#scheduleExecMetrics').innerHTML=scheduleExecMetricsHTML(scheduleExecOverview);
  const list=$('#scheduleExecList');
  const focused=document.activeElement;
  const focusKey=list.contains(focused)?['copyTrace','execToggle','execPage','scheduleMenu','openExecFirstRun'].find(k=>focused.dataset?.[k]!==undefined&&!focused.closest('.schedule-row-menu')):'';
  const focusValue=focusKey?focused.dataset[focusKey]:'';
  const rows=scheduleExecutions,total=scheduleExecTotal;
  list.setAttribute('aria-busy',String(scheduleExecLoading));
  let empty='';
  if(!state.projectFilter)empty=_t('请先在顶栏选择项目，再查看执行记录。','Select a project in the top bar first to view execution history.');
  else if(scheduleExecError)empty=`${_t(`读取执行记录失败：${escapeHTML(scheduleExecError)}`,`Failed to load execution history: ${escapeHTML(scheduleExecError)}`)} <button type="button" class="button ghost small" data-retry-exec>${_t('重试','Retry')}</button>`;
  else if(scheduleExecLoading&&!rows.length)empty=_t('正在读取执行记录…','Loading execution history…');
  else if(!scheduleExecRecords&&!rows.length)empty=_t('还没有执行记录。任务每次运行后，这里会记录结果、耗时和 Trace ID。','No execution records yet. Results, duration, and Trace IDs will appear here after each job run.');
  else if(!rows.length)empty=`${_t('没有符合筛选条件的执行记录。','No execution records match the current filters.')}<button type="button" class="button ghost small" data-reset-exec>${_t('清除筛选','Clear filters')}</button>`;
  list.innerHTML=empty?`<div class="sync-empty">${empty}</div>`:scheduleExecTableHTML(rows);
  $('#scheduleExecTotal').textContent=!empty&&total?_t(`（共 ${total} 条）`,`(${total} total)`):'';
  const pager=$('#scheduleExecPager');
  pager.hidden=!!empty||!total;
  pager.innerHTML=pager.hidden?'':scheduleExecPagerHTML(total);
  list.querySelector('[data-retry-exec]')?.addEventListener('click',()=>refreshScheduleExecutions());
  list.querySelector('[data-reset-exec]')?.addEventListener('click',resetScheduleExecFilters);
  bindScheduleExecList(list);
  bindScheduleExecPager(pager);
  $('#scheduleExecFootnote').textContent=empty?'':_t('列表保留每个任务最近 200 次执行；概览按全部执行统计，不受保留条数限制。Token 只计本次 AI 调用（含重试），不含下游 SOP；缓存明细不重复计入总量。','List keeps the last 200 executions per job; overview counts all executions. Tokens include only this AI call (with retries), excluding downstream SOPs; cache details are not double-counted.');
  window.AgentFlowHarnessIcons?.hydrate(panel);
  if(focusKey){
    const host=focusKey==='execPage'?pager:list;
    [...host.querySelectorAll(`[data-${focusKey.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`)}]`)].find(el=>el.dataset[focusKey]===focusValue&&!el.disabled&&!el.closest('.schedule-row-menu'))?.focus();
  }
}
function toggleScheduleExecDetail(id){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(scheduleExecExpanded.has(id))scheduleExecExpanded.delete(id);else scheduleExecExpanded.add(id);
  const row=[...$('#scheduleExecList').querySelectorAll('.sched-exec-row')].find(r=>r.dataset.execId===id);
  if(!row)return;
  const open=scheduleExecExpanded.has(id),toggle=row.querySelector('[data-exec-toggle]');
  row.classList.toggle('is-open',open);
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?_t('收起详情','Collapse details'):_t('展开详情','Expand details'));
  const detail=row.nextElementSibling;
  if(detail?.classList.contains('sched-exec-detail'))detail.hidden=!open;
}
function bindScheduleExecList(list){
  bindScheduleTraceButtons(list);
  list.querySelectorAll('[data-exec-toggle]').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleScheduleExecDetail(b.dataset.execToggle)});
  // Clicking the row body expands it too; links, buttons and menus keep their own clicks.
  list.querySelectorAll('.sched-exec-row').forEach(r=>r.onclick=e=>{
    if(e.target.closest('a,button,select,input,.schedule-row-more')||String(getSelection?.()||''))return;
    toggleScheduleExecDetail(r.dataset.execId);
  });
  list.querySelectorAll('[data-open-exec-run]').forEach(b=>b.onclick=()=>openRunFromId(b.dataset.openExecRun,{forceRuns:true}));
  list.querySelectorAll('[data-open-exec-first-run]').forEach(b=>b.onclick=()=>openRunFromId(b.dataset.openExecFirstRun,{forceRuns:true}));
  list.querySelectorAll('[data-exec-only-job]').forEach(b=>b.onclick=()=>{scheduleExecJobFilter=b.dataset.execOnlyJob;reloadScheduleExecutions()});
  list.querySelectorAll('[data-exec-edit-job]').forEach(b=>b.onclick=()=>{
    const job=(state.data.scheduleJobs||[]).find(j=>j.id===b.dataset.execEditJob);
    if(!job)return;
    if(job.skipDispatch)openScheduleJobModal('assistant',job);
    else openScheduleJobModal('dispatch',job);
  });
  if(typeof bindScheduleRowMenus==='function')bindScheduleRowMenus(list);
}
function bindScheduleExecPager(pager){
  pager.querySelectorAll('[data-exec-page]').forEach(b=>b.onclick=()=>reloadScheduleExecutions({page:Number(b.dataset.execPage)||1}));
  const size=pager.querySelector('#scheduleExecPageSize');
  if(size)size.onchange=async()=>{scheduleExecPageSize=Number(size.value)||10;await reloadScheduleExecutions();$('#scheduleExecPageSize')?.focus()};
}
// Filters, pages and page sizes are applied by the server: each change refetches.
function reloadScheduleExecutions({page=1}={}){
  scheduleExecPage=page;
  return refreshScheduleExecutions().catch(()=>{});
}
function resetScheduleExecFilters(){
  scheduleExecStatusFilter='';scheduleExecJobFilter='';scheduleExecRangeFilter='';scheduleExecQuery='';
  reloadScheduleExecutions();
  $('#scheduleExecSearch')?.focus();
}
// The copied notes start with the Trace ID on its own line (greppable as
// trace=<id> in scheduler logs) and carry enough context to paste into a chat.
function scheduleTraceSource(traceId){
  const exec=scheduleExecutions.find(e=>e.traceId===traceId);
  if(exec)return exec;
  const job=(state.data.scheduleJobs||[]).find(j=>j.lastTraceId===traceId);
  if(!job)return {traceId};
  return {traceId,jobId:job.id,jobName:job.name,jobKind:job.skipDispatch?'assistant':'trigger',projectId:job.projectId,status:job.lastStatus,error:job.lastError,assistantMessage:job.lastAssistantMessage,pulled:job.lastPulled,dispatched:job.lastDispatched,startedAt:job.lastRunAt};
}
function scheduleTraceDiagnostics(traceId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const e=scheduleTraceSource(traceId);
  const project=(state.data.projects||[]).find(p=>p.id===e.projectId);
  const started=knownTime(e.startedAt);
  const oneLine=v=>String(v??'').replace(/\s+/g,' ').trim();
  const rows=[
    ['Trace ID',traceId],
    [_t('任务','Job'),e.jobName||e.jobId?`${oneLine(e.jobName||e.jobId)}${e.jobId&&e.jobName?` (${e.jobId})`:''}`:''],
    [_t('类型','Type'),e.jobKind==='assistant'?_t('AI 提示词任务','AI prompt job'):e.jobKind==='trigger'?_t('SOP 触发','SOP trigger'):''],
    [_t('项目','Project'),e.projectId?`${oneLine(project?.name||e.projectId)}${project?.name&&project.name!==e.projectId?` (${e.projectId})`:''}`:''],
    [_t('触发方式','Trigger'),e.triggerOrigin?scheduleExecTriggerLabel(e.triggerOrigin):''],
    [_t('状态','Status'),e.status?scheduleExecStatusInfo(e.status).label:''],
    [_t('开始时间','Started'),started?`${started.toLocaleString()} (${started.toISOString()})`:''],
    [_t('耗时','Duration'),Number(e.durationMs)>0?scheduleExecDurationLabel(e.durationMs):''],
    [_t('候选 / 启动','Candidates / Started'),e.jobKind==='trigger'?`${Number(e.pulled)||0} / ${Number(e.dispatched)||0}`:''],
    [_t('错误','Error'),oneLine(e.error).slice(0,1000)],
    [_t('AI 回复摘要','AI reply summary'),e.error?'':oneLine(e.assistantMessage).slice(0,300)],
    [_t('派发运行','Dispatched runs'),(e.runs||[]).filter(r=>r.runId).map(r=>`${r.runId}${r.issueTitle||r.issueId?` (${oneLine(r.issueTitle||r.issueId)})`:''}`).join('; ')],
    [_t('页面','Page'),location.href],
    [_t('复制时间','Copied at'),new Date().toISOString()]
  ].filter(([,v])=>String(v||'').trim());
  return [_t('定时任务执行排障信息','Scheduled Job Execution Diagnostics'),...rows.map(([k,v])=>`${k}: ${v}`)].join('\n');
}
function copyScheduleTrace(traceId){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  if(!traceId)return;
  copyText(scheduleTraceDiagnostics(traceId),_t('已复制 Trace ID 与排障信息','Copied Trace ID and diagnostics'));
}
function bindScheduleTraceButtons(host){
  host?.querySelectorAll('[data-copy-trace]').forEach(b=>b.onclick=e=>{e.stopPropagation();copyScheduleTrace(b.dataset.copyTrace)});
}
// Job rows: a failed run gets a direct copy button; every row links to its history.
function scheduleJobTraceCopyHTML(job){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  return job?.lastStatus==='failed'&&job.lastTraceId?`<button type="button" class="button ghost small sched-exec-copy" data-copy-trace="${escapeHTML(job.lastTraceId)}" aria-label="${_t('复制最近一次失败的 Trace ID 与排障信息','Copy latest failed Trace ID and diagnostics')}" title="${_t(`复制 Trace ID 与排障信息（${escapeHTML(job.lastTraceId)}），可直接发给 AI 助手排查`,`Copy Trace ID & diagnostics (${escapeHTML(job.lastTraceId)}) to share with AI assistant for troubleshooting`)}"><svg class="agent-icon harness-icon" data-icon="copy" width="14" height="14" aria-hidden="true" focusable="false"></svg><span>Trace</span></button>`:'';
}
function scheduleJobTraceActionsHTML(job){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  const copy=scheduleJobTraceCopyHTML(job);
  return `${copy}<button type="button" class="button ghost small" data-schedule-history="${escapeHTML(job.id)}">${_t('执行记录','Executions')}</button>`;
}
function bindScheduleJobTraceActions(list){
  bindScheduleTraceButtons(list);
  list?.querySelectorAll('[data-schedule-history]').forEach(b=>b.onclick=()=>openScheduleExecutions(b.dataset.scheduleHistory));
  window.AgentFlowHarnessIcons?.hydrate(list);
}
function openScheduleExecutions(jobId=''){
  scheduleExecJobFilter=jobId||'';
  scheduleExecStatusFilter='';scheduleExecRangeFilter='';scheduleExecQuery='';scheduleExecPage=1;
  if($('#scheduleModal')?.classList.contains('open'))closeScheduleJobModal();
  if(state.currentView!=='aiSchedules'&&typeof switchView==='function')switchView('aiSchedules');
  selectAIScheduleTab('executions');
  $('#aiScheduleExecTab')?.focus();
}
function bindScheduleExecutionUI(){
  const status=$('#scheduleExecStatus'),job=$('#scheduleExecJob'),range=$('#scheduleExecRange'),search=$('#scheduleExecSearch'),reset=$('#scheduleExecReset');
  const refilter=()=>reloadScheduleExecutions();
  if(status)status.onchange=()=>{scheduleExecStatusFilter=status.value;refilter()};
  if(job)job.onchange=()=>{scheduleExecJobFilter=job.value;refilter()};
  if(range)range.onchange=()=>{scheduleExecRangeFilter=range.value;refilter()};
  // Typing waits for a pause before asking the server.
  if(search)search.oninput=()=>{
    scheduleExecQuery=search.value;
    const reset=$('#scheduleExecReset');if(reset)reset.disabled=!scheduleExecFiltersActive();
    clearTimeout(scheduleExecSearchTimer);
    scheduleExecSearchTimer=setTimeout(refilter,SCHEDULE_EXEC_SEARCH_DELAY);
  };
  if(reset)reset.onclick=resetScheduleExecFilters;
}
