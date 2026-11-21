function percent(n){return `${Number(n||0).toFixed(0)}%`}
function formatTimestamp(value){
  if(!value)return '';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())||d.getFullYear()<1970)return '';
  return d.toLocaleString();
}
function duration(ms){ms=Number(ms||0);if(!ms)return '—';if(ms<1000)return `${ms}ms`;if(ms<60000)return `${(ms/1000).toFixed(1)}s`;if(ms<3600000)return `${(ms/60000).toFixed(1)}m`;return `${(ms/3600000).toFixed(1)}h`}
function metricsIssueSource(issue){return String(issue?.source||issue?.externalRef?.source||'').toLowerCase()}
function metricHealth(m, liveCount=0){const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;if(liveCount)return {key:'active',label:_t('运行中','Running'),hint:_t(`${liveCount} 个实例执行中`,`${liveCount} instances running`)};if(!m?.totalRuns)return {key:'never',label:_t('从未运行','Never run'),hint:_t('需要首次验证','Needs initial run')};if(m.waitingRuns)return {key:'active',label:_t('待审批','Awaiting approval'),hint:_t(`${m.waitingRuns} 个实例等待门禁`,`${m.waitingRuns} instances awaiting gate`)};if(m.failedRuns&&m.lastRunStatus==='failed')return {key:'blocked',label:_t('有阻塞','Blocked'),hint:_t('最近运行失败','Latest run failed')};if(m.succeededRuns)return {key:'closed',label:_t('已闭环','Closed'),hint:_t(`${percent(m.closureRate)} 闭环率`,`${percent(m.closureRate)} closure rate`)};return {key:'blocked',label:_t('未闭环','Open'),hint:_t('尚无成功运行','No succeeded runs yet')}}
