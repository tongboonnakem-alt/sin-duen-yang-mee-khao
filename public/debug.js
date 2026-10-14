async function inspect(path, prefix) {
  const start=performance.now();
  try {
    const response=await fetch(path);const data=await response.json();
    document.getElementById(prefix+'-status').textContent=`HTTP ${response.status} · ${Math.round(performance.now()-start)} ms`;
    document.getElementById(prefix+'-output').textContent=JSON.stringify(data,null,2);
  } catch(error) {
    document.getElementById(prefix+'-status').textContent='ตรวจสอบไม่สำเร็จ';
    document.getElementById(prefix+'-output').textContent=error.message;
  }
}
async function refresh() {
  document.getElementById('refresh-debug').disabled=true;
  await Promise.all([inspect('/api/health','health'),inspect('/api/restaurants','data')]);
  document.getElementById('debug-time').textContent='ตรวจสอบเมื่อ '+new Date().toLocaleString('th-TH');
  document.getElementById('refresh-debug').disabled=false;
}
document.getElementById('refresh-debug').addEventListener('click',refresh);refresh();
