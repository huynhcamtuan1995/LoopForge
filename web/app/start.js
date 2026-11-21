const renderSOPCatalogBase=renderSOPCatalog;
renderSOPCatalog=function(){
  const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;
  renderSOPCatalogBase();
  const success=document.querySelector('.overview-metric.success span');if(success)success.textContent=_t('成功完成的运行','Succeeded runs');
  const successSmall=document.querySelector('.overview-metric.success small');if(successSmall)successSmall.textContent=_t('累计成功次数','Total succeeded runs');
};
boot().catch(e=>{finishBootLoader();const _t=(z,e)=>typeof lfT==='function'?lfT(z,e):z;document.body.innerHTML=`<pre style="padding:30px">${_t(`启动失败：${escapeHTML(e.message)}`,`Startup failed: ${escapeHTML(e.message)}`)}</pre>`});
