import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

let child, base, temp, database;
async function start() {
  child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'0',DB_PATH:database},stdio:['ignore','pipe','pipe']});
  base=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server did not start')),10000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(match[0]);}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code));});
  });
}
async function stop() { if(child && child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;} }
before(async()=>{temp=await mkdtemp(join(tmpdir(),'student-food-test-'));database=join(temp,'test.sqlite');await start();});
after(async()=>{await stop();await rm(temp,{recursive:true,force:true});});
async function request(path,method='GET',data) {
  const response=await fetch(base+path,{method,...(data===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
  return {status:response.status,body:await response.json()};
}
const restaurant={name:'ร้านทดสอบ',location:'จุดทดสอบ',menu:'ข้าวทดสอบ',price:37.5,category:'อาหารตามสั่ง',rating:4,review:'ข้อความสำหรับทดสอบ'};

test('หน้าเว็บและไฟล์ frontend เสิร์ฟได้จริง',async()=>{
  for(const path of ['/','/styles.css','/app.js','/favicon.svg']) assert.equal((await fetch(base+path)).status,200);
  assert.match(await (await fetch(base)).text(),/สิ้นเดือนยังมีข้าว/);
  const result=await request('/api/health');assert.equal(result.body.database,'SQLite');assert.equal(result.body.restaurants,8);
});
test('ค้นหาและกรองงบ/ประเภทพร้อมกัน รวมราคาที่เท่ากับงบ',async()=>{
  const result=await request('/api/restaurants?budget=40&category='+encodeURIComponent('ก๋วยเตี๋ยว')+'&q='+encodeURIComponent('น้ำใส'));
  assert.equal(result.status,200);assert.equal(result.body.restaurants.length,1);assert.equal(result.body.restaurants[0].price,40);
  assert.equal((await request('/api/restaurants?budget=0')).body.restaurants.length,0);
});
test('สุ่มได้เฉพาะร้านในงบและตรงประเภท',async()=>{
  for(let i=0;i<20;i++){
    const result=await request('/api/restaurants/random?budget=40&category='+encodeURIComponent('ก๋วยเตี๋ยว'));
    assert.equal(result.status,200);assert.ok(result.body.restaurant.price<=40);assert.equal(result.body.restaurant.category,'ก๋วยเตี๋ยว');
  }
  assert.equal((await request('/api/restaurants/random?budget=10')).status,404);
});
test('ปฏิเสธราคา คะแนน ฟิลด์ และ query ที่ไม่ถูกต้อง',async()=>{
  for(const patch of [{price:-1},{price:1.123},{price:'40'},{rating:6},{rating:2.5},{name:' '},{category:'ผิดประเภท'},{review:'x'.repeat(1001)}])assert.equal((await request('/api/restaurants','POST',{...restaurant,...patch})).status,400);
  assert.equal((await request('/api/restaurants?budget=abc')).status,400);
  assert.equal((await request('/api/restaurants?budget=-1')).status,400);
  const malformed=await fetch(base+'/api/restaurants',{method:'POST',headers:{'Content-Type':'application/json'},body:'{oops'});assert.equal(malformed.status,400);
  const wrongType=await fetch(base+'/api/restaurants',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(wrongType.status,415);
  assert.equal((await request('/api/restaurants/999999')).status,404);
});
test('เพิ่ม → อ่าน → แก้ไขรีวิว → ตรวจ SQLite → restart → ลบ',async()=>{
  const added=await request('/api/restaurants','POST',restaurant);assert.equal(added.status,201);
  const id=added.body.restaurant.id;assert.equal(added.body.restaurant.is_demo,0);
  assert.equal((await request('/api/restaurants/'+id)).body.restaurant.name,restaurant.name);
  const updated={...restaurant,rating:5,review:'รีวิวที่แก้ไขแล้ว <script> ไม่ควรทำงาน'};
  assert.equal((await request('/api/restaurants/'+id,'PUT',updated)).status,200);
  const connection=new DatabaseSync(database,{readOnly:true});
  assert.equal(connection.prepare('SELECT review FROM restaurants WHERE id=?').get(id).review,updated.review);connection.close();
  await stop();await start();
  const persisted=await request('/api/restaurants/'+id);assert.equal(persisted.body.restaurant.rating,5);assert.equal(persisted.body.restaurant.review,updated.review);
  assert.equal((await request('/api/restaurants/'+id,'DELETE')).status,200);
  assert.equal((await request('/api/restaurants/'+id)).status,404);
});
test('ลบร้านทั้งหมดแล้ว restart จะไม่เติมข้อมูลสาธิตกลับ',async()=>{
  const list=await request('/api/restaurants');for(const row of list.body.restaurants)assert.equal((await request('/api/restaurants/'+row.id,'DELETE')).status,200);
  await stop();await start();assert.equal((await request('/api/restaurants')).body.restaurants.length,0);
});
