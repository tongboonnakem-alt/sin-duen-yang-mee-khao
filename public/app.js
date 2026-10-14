const $ = (selector) => document.querySelector(selector);
const categories = ['อาหารตามสั่ง', 'ก๋วยเตี๋ยว', 'ข้าวจานเดียว', 'อีสาน', 'มังสวิรัติ', 'อื่น ๆ'];
const pictures = {'อาหารตามสั่ง':['🍳',''], 'ก๋วยเตี๋ยว':['🍜','noodle'], 'ข้าวจานเดียว':['🍛','rice'], 'อีสาน':['🥗','isaan'], 'มังสวิรัติ':['🥬','veg'], 'อื่น ๆ':['🍽️','']};
const state = {category:'', restaurants:[], request:0, pendingDelete:null};
const money = (value) => Number(value).toLocaleString('th-TH', {maximumFractionDigits:2});
const escape = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let toastTimer;
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
async function api(path, options) {
  const response = await fetch(path, options);
  let data;
  try { data=await response.json(); } catch { throw new Error('อ่านข้อมูลจากเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'); }
  if (!response.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
  return data;
}
function query() {
  if (!$('#budget').checkValidity()) throw new Error('กรุณาใส่งบ 0–10,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง');
  const params = new URLSearchParams();
  if ($('#budget').value !== '') params.set('budget',$('#budget').value);
  if (state.category) params.set('category',state.category);
  if ($('#search').value.trim()) params.set('q',$('#search').value.trim());
  return params;
}
function drawCategories() {
  $('#categories').innerHTML=['',...categories].map(category=>`<button data-category="${escape(category)}" class="${category===state.category?'active':''}" aria-pressed="${category===state.category}">${category || 'ทั้งหมด'}</button>`).join('');
}
function card(row) {
  const [emoji, style] = pictures[row.category] || pictures['อื่น ๆ'];
  return `<article class="food-card"><div class="card-visual ${style}"><span class="card-label">${row.is_demo?'ข้อมูลสาธิต':'ร้านของฉัน'}</span><span class="food-emoji" aria-hidden="true">${emoji}</span><span class="price-tag"><strong>${money(row.price)}</strong> ฿</span></div><div class="card-body"><div class="card-heading"><h3>${escape(row.name)}</h3><span class="rating-badge" aria-label="คะแนน ${row.rating} จาก 5">★ ${row.rating}/5</span></div><p class="location">⌖ ${escape(row.location)}</p><p class="menu-name">${escape(row.menu)}</p><p class="review">${row.review ? `“${escape(row.review)}”` : 'ยังไม่มีข้อความรีวิว ลองจดความอร่อยไว้สักหน่อย'}</p><div class="card-bottom"><span class="category-label">${escape(row.category)}</span><div class="card-actions"><button data-edit="${row.id}" aria-label="แก้ไขหรือรีวิว ${escape(row.name)}">✎ แก้ไข / รีวิว</button><button class="delete" data-delete="${row.id}" aria-label="ลบ ${escape(row.name)}">ลบ</button></div></div></div></article>`;
}
async function loadRestaurants() {
  const request = ++state.request;
  $('#budget-error').textContent='';
  $('#random-result').hidden=true;
  try {
    const params=query();
    $('#filter-summary').textContent='กำลังเปิดสมุดร้านอร่อย…';
    const data=await api('/api/restaurants?'+params);
    if (request !== state.request) return;
    state.restaurants=data.restaurants;
    $('#count').textContent=`${data.restaurants.length} ร้าน`;
    $('#filter-summary').textContent=`พบ ${data.restaurants.length} ร้าน${params.has('budget') ? ` · งบไม่เกิน ${money(params.get('budget'))} บาท` : ' · ทุกงบ'}${state.category?' · '+state.category:''}`;
    $('#cards').innerHTML=data.restaurants.length ? data.restaurants.map(card).join('') : '<div class="empty"><div>🍽️</div><h3>มื้อนี้ยังไม่มีร้านที่ตรงใจ</h3><p>ลองเพิ่มงบ เปลี่ยนประเภทอาหาร หรือล้างคำค้น<br>ถ้ารู้จักร้านอร่อย เพิ่มไว้ในสมุดได้เลย</p><button class="button secondary" data-empty-add>＋ เพิ่มร้านอร่อย</button></div>';
  } catch(error) {
    if (request !== state.request) return;
    state.restaurants=[];
    $('#budget-error').textContent=error.message;
    $('#count').textContent='—';
    $('#filter-summary').textContent='โหลดข้อมูลไม่สำเร็จ';
    $('#cards').innerHTML='<div class="empty"><h3>ยังเปิดสมุดไม่ได้</h3><p>ตรวจสอบงบและการเชื่อมต่อ แล้วลองอีกครั้ง</p><button class="button secondary" data-retry>ลองอีกครั้ง</button></div>';
  }
}
function updateQuickBudgets() { document.querySelectorAll('[data-budget]').forEach(button=>{ const active=button.dataset.budget===$('#budget').value; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); }); }
let filterTimer;
function scheduleLoad() { clearTimeout(filterTimer); state.request++; $('#random-result').hidden=true; filterTimer=setTimeout(loadRestaurants,200); }
$('#budget').addEventListener('input',()=>{updateQuickBudgets();scheduleLoad();});
$('#search').addEventListener('input',scheduleLoad);
document.querySelectorAll('[data-budget]').forEach(button=>button.addEventListener('click',()=>{clearTimeout(filterTimer);$('#budget').value=button.dataset.budget;updateQuickBudgets();loadRestaurants();}));
$('#categories').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;state.category=button.dataset.category;drawCategories();clearTimeout(filterTimer);loadRestaurants();});
$('#reset-filters').addEventListener('click',()=>{clearTimeout(filterTimer);$('#budget').value='';$('#search').value='';state.category='';drawCategories();updateQuickBudgets();loadRestaurants();});
$('#random-button').addEventListener('click',async()=>{
  const button=$('#random-button'); button.disabled=true; $('#budget-error').textContent='';
  // ใช้ตัวกรองล่าสุดให้เสร็จก่อนสุ่ม ป้องกัน debounce ล้างผลที่เพิ่งแสดง
  clearTimeout(filterTimer);
  await loadRestaurants();
  try {
    const params=query(); const snapshot=params.toString();
    const {restaurant:row,matched}=await api('/api/restaurants/random?'+params);
    if (query().toString() !== snapshot) return;
    const [emoji]=pictures[row.category] || pictures['อื่น ๆ'];
    const remaining=params.has('budget') ? `<p class="remaining">เหลืองบอีก ${money(Math.max(0,Number(params.get('budget'))-row.price))} บาท ✦</p>` : '';
    $('#random-result').innerHTML=`<span class="result-icon" aria-hidden="true">${emoji}</span><div class="result-copy"><p class="eyebrow">มื้อนี้ ลองร้านนี้เลย! · สุ่มจาก ${matched} ร้าน${row.is_demo?' · ข้อมูลสาธิต':''}</p><h3>${escape(row.name)} <span class="orange">${money(row.price)} ฿</span></h3><p>${escape(row.menu)} · ★ ${row.rating}/5 · ${escape(row.location)}</p><p>${escape(row.review)}</p>${remaining}</div><button class="result-close" aria-label="ปิดผลการสุ่ม">×</button>`;
    $('#random-result').hidden=false;
  } catch(error) { $('#random-result').hidden=true; $('#budget-error').textContent=error.message; }
  finally { button.disabled=false; }
});
$('#random-result').addEventListener('click',event=>{if(event.target.closest('.result-close'))$('#random-result').hidden=true;});
const form=$('#restaurant-form');
$('#category-select').innerHTML=categories.map(category=>`<option>${category}</option>`).join('');
$('#rating-options').innerHTML=[1,2,3,4,5].map(value=>`<label><input type="radio" name="rating" value="${value}" ${value===4?'checked':''} required><span>${value} ★</span></label>`).join('');
function openEditor(row) {
  form.reset(); $('#form-error').textContent=''; form.elements.id.value=row?.id || '';
  $('#editor-title').textContent=row?'แก้ไขร้าน / เขียนรีวิว':'เพิ่มร้านอร่อย';
  if (row) for (const key of ['name','location','menu','price','category','rating','review']) form.elements[key].value=row[key];
  $('#editor').showModal(); form.elements.name.focus();
}
$('#add-top').addEventListener('click',()=>openEditor());
for(const id of ['close-editor','cancel-editor']) $('#'+id).addEventListener('click',()=>$('#editor').close());
$('#cards').addEventListener('click',event=>{
  if(event.target.closest('[data-retry]')) return loadRestaurants();
  if(event.target.closest('[data-empty-add]')) return openEditor();
  const edit=event.target.closest('[data-edit]'); const remove=event.target.closest('[data-delete]');
  if(edit) openEditor(state.restaurants.find(row=>row.id===Number(edit.dataset.edit)));
  if(remove) { const row=state.restaurants.find(item=>item.id===Number(remove.dataset.delete));state.pendingDelete=row.id;$('#delete-description').textContent=row.name;$('#delete-error').textContent='';$('#delete-dialog').showModal();$('#cancel-delete').focus(); }
});
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form)); const id=data.id; delete data.id;
  data.price=Number(data.price);data.rating=Number(data.rating);
  $('#save-button').disabled=true; $('#form-error').textContent='';
  try {
    await api('/api/restaurants'+(id?'/'+id:''),{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    $('#editor').close(); await loadRestaurants(); toast(id?'บันทึกร้านและรีวิวแล้ว':'เพิ่มร้านแล้ว หากไม่เห็นร้าน ลองล้างตัวกรอง');
  } catch(error) { $('#form-error').textContent=error.message; }
  finally { $('#save-button').disabled=false; }
});
$('#cancel-delete').addEventListener('click',()=>$('#delete-dialog').close());
$('#confirm-delete').addEventListener('click',async()=>{
  $('#confirm-delete').disabled=true;
  try {await api('/api/restaurants/'+state.pendingDelete,{method:'DELETE'});$('#delete-dialog').close();await loadRestaurants();toast('ลบร้านจากสมุดแล้ว');}
  catch(error){$('#delete-error').textContent=error.message;}
  finally{$('#confirm-delete').disabled=false;}
});
drawCategories(); updateQuickBudgets(); loadRestaurants();
