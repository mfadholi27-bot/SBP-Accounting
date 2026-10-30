/* SBP Accounting V19 — browser-only accounting core.
   Local persistence: IndexedDB. DBF export reuses a real source DBF schema as a safety requirement. */
const DB_NAME='sbp-accounting-v19', STORE='app', STATE_KEY='main';
const emptyState=()=>({accounts:[],journals:[],nptrans:[],openingBalances:[],auditLogs:[],npTemplate:null,meta:{version:19}});
let state=emptyState(), editingId=null, editingAccountCode=null, pendingNpImport=null, auditBaseline=null;
const $=id=>document.getElementById(id);
const money=n=>'Rp '+Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}
function requireImportPassword(action){const value=prompt('Masukkan password PKS untuk '+action+':');if(value===null)return false;if(value!=='PKS123'){toast('Password salah. Proses import dibatalkan.');return false}return true}
function setMessage(id,msg,type=''){const el=$(id);el.textContent=msg;el.className='inline-message'+(type?' '+type:'')}
function dbOpen(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window)){reject(new Error('IndexedDB tidak tersedia di browser ini'));return}const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function loadState(){try{const db=await dbOpen();const value=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(STATE_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();state=value||emptyState()}catch(e){console.warn(e);try{state=JSON.parse(localStorage.getItem(DB_NAME))||emptyState()}catch{state=emptyState()}toast('Penyimpanan IndexedDB tidak tersedia; mode cadangan browser aktif.')} }
function auditClone(v){try{return JSON.parse(JSON.stringify(v))}catch{return String(v)}}
function auditKey(type,row,index){if(type==='accounts')return String(row.code??index);if(type==='journals')return String(row.id??row.number??index);if(type==='openingBalances')return String(row.period??'')+'|'+String(row.accountCode??index);if(type==='nptrans')return String(row.id??[row.tanggal,row.nobukti,row.nourut,row.sandi,index].join('|'));return String(index)}
function collectAuditChanges(){if(!auditBaseline){auditBaseline=auditClone({accounts:state.accounts,journals:state.journals,nptrans:state.nptrans,openingBalances:state.openingBalances});return}const labels={accounts:'Master Akun',journals:'Jurnal',nptrans:'NPTRANS',openingBalances:'Saldo Awal'};for(const type of Object.keys(labels)){const before=Array.isArray(auditBaseline[type])?auditBaseline[type]:[],after=Array.isArray(state[type])?state[type]:[],oldMap=new Map(before.map((x,i)=>[auditKey(type,x,i),x])),newMap=new Map(after.map((x,i)=>[auditKey(type,x,i),x]));for(const [key,row] of newMap){const old=oldMap.get(key);if(!old){state.auditLogs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action:'TAMBAH',entity:labels[type],entityId:key,summary:labels[type]+' ditambahkan: '+key,before:null,after:auditClone(row)});continue}if(JSON.stringify(old)!==JSON.stringify(row))state.auditLogs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action:'UBAH',entity:labels[type],entityId:key,summary:labels[type]+' diubah: '+key,before:auditClone(old),after:auditClone(row)})}for(const [key,row] of oldMap){if(!newMap.has(key))state.auditLogs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action:'HAPUS',entity:labels[type],entityId:key,summary:labels[type]+' dihapus: '+key,before:auditClone(row),after:null})}}if(state.auditLogs.length>10000)state.auditLogs.length=10000;auditBaseline=auditClone({accounts:state.accounts,journals:state.journals,nptrans:state.nptrans,openingBalances:state.openingBalances})}
async function persist(){collectAuditChanges();try{const db=await dbOpen();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,STATE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();queueAutoBackup()}catch(e){localStorage.setItem(DB_NAME,JSON.stringify(state));console.warn('Fallback localStorage',e);queueAutoBackup()}}
let backupDirectoryHandle=null,backupTimer=null,backupBusy=false,lastAutoBackupAt=0;
function makeBackupPayload(){const safeState=JSON.parse(JSON.stringify(state));if(safeState.npTemplate?.fields)safeState.npTemplate.fields.forEach(f=>{if(f.raw&&typeof f.raw==='object')f.raw=Array.from(f.raw)});return {app:'SBP Accounting',version:19,exportedAt:new Date().toISOString(),backupType:'automatic-or-manual',state:safeState}}
function backupFileName(date=new Date()){const p=n=>String(n).padStart(2,'0');return 'SBP-V19-'+date.getFullYear()+p(date.getMonth()+1)+p(date.getDate())+'-'+p(date.getHours())+p(date.getMinutes())+p(date.getSeconds())+'.json'}
async function writeBackupFile(dir,name,payload){const file=await dir.getFileHandle(name,{create:true});const writable=await file.createWritable();await writable.write(JSON.stringify(payload,null,2));await writable.close()}
async function saveDirectoryHandle(handle){const db=await dbOpen();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(handle,'backupDirectoryHandle');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function loadDirectoryHandle(){try{const db=await dbOpen();const handle=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get('backupDirectoryHandle');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});db.close();backupDirectoryHandle=handle}catch(e){console.warn('Tidak dapat memuat folder backup',e)}}
async function directoryPermission(handle,request=false){if(!handle)return 'denied';try{let p=await handle.queryPermission({mode:'readwrite'});if(p!=='granted'&&request)p=await handle.requestPermission({mode:'readwrite'});return p}catch{return 'denied'}}
async function runAutomaticBackup(reason='perubahan data'){if(!backupDirectoryHandle||backupBusy)return false;const permission=await directoryPermission(backupDirectoryHandle,false);if(permission!=='granted'){setMessage('backup-message','Izin folder backup belum aktif. Tekan “Hubungkan Folder Server” untuk mengaktifkannya kembali.','bad');return false}backupBusy=true;try{const payload=makeBackupPayload(),daily=await backupDirectoryHandle.getDirectoryHandle('BACKUP_HARIAN',{create:true}),latest=await backupDirectoryHandle.getDirectoryHandle('BACKUP_TERBARU',{create:true}),today=new Date(),dayName=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');const dailyDir=await daily.getDirectoryHandle(dayName,{create:true});await writeBackupFile(latest,'SBP-Accounting-V19-TERBARU.json',payload);await writeBackupFile(dailyDir,backupFileName(today),payload);lastAutoBackupAt=Date.now();setMessage('backup-message','Backup otomatis berhasil: '+today.toLocaleString('id-ID')+'. Pemicu: '+reason+'.','good');return true}catch(e){console.warn('Backup otomatis gagal',e);setMessage('backup-message','Backup otomatis gagal: '+e.message+'. Data utama tetap tersimpan di laptop; periksa koneksi/izin folder server.','bad');return false}finally{backupBusy=false}}
function queueAutoBackup(){if(!backupDirectoryHandle)return;clearTimeout(backupTimer);backupTimer=setTimeout(()=>runAutomaticBackup('perubahan data'),1800)}
async function connectBackupFolder(){if(!('showDirectoryPicker'in window)){setMessage('backup-message','Browser ini belum mendukung pemilihan folder otomatis. Gunakan Chrome atau Edge versi desktop terbaru.','bad');return}try{const handle=await window.showDirectoryPicker({id:'sbp-accounting-backup',mode:'readwrite'});const permission=await directoryPermission(handle,true);if(permission!=='granted')throw Error('Izin tulis ke folder tidak diberikan.');backupDirectoryHandle=handle;await saveDirectoryHandle(handle);setMessage('backup-message','Folder backup berhasil dihubungkan. Sedang membuat backup pertama…','good');await runAutomaticBackup('hubungkan folder pertama kali')}catch(e){if(e.name!=='AbortError')setMessage('backup-message','Folder belum terhubung: '+e.message,'bad')}}
async function reconnectBackupFolder(){if(!backupDirectoryHandle){await connectBackupFolder();return}const permission=await directoryPermission(backupDirectoryHandle,true);if(permission==='granted'){setMessage('backup-message','Izin folder server aktif kembali. Membuat backup…','good');await runAutomaticBackup('izin folder diaktifkan kembali')}else await connectBackupFolder()}

let archiveReadState=null,archiveReadName='';
function archiveReadMoney(v){return money(Number(v||0))}
function archiveReadAccount(code){return archiveReadState?.accounts?.find(x=>String(x.code)===String(code))||{code,name:'(Akun tidak ditemukan)'}}
function archiveReadJournals(){
 const q=($('archive-read-search').value||'').toLowerCase().trim(),period=$('archive-read-period').value;
 const rows=(archiveReadState.journals||[]).filter(j=>(!period||String(j.date||'').slice(0,7)===period)&&[j.number,j.description,j.date,j.status].join(' ').toLowerCase().includes(q)).sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));
 $('archive-read-summary').textContent=rows.length+' jurnal ditemukan dalam arsip · '+archiveReadName;
 $('archive-read-table').innerHTML=rows.length?'<table><thead><tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan</th><th>Status</th><th>Baris</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>'+rows.map(j=>{const d=(j.lines||[]).reduce((n,l)=>n+Number(l.debit||0),0),c=(j.lines||[]).reduce((n,l)=>n+Number(l.credit||0),0);return '<tr><td>'+esc(j.date||'')+'</td><td><b>'+esc(j.number||'')+'</b></td><td>'+esc(j.description||'')+'</td><td>'+esc(j.status||'TERPOSTING')+'</td><td>'+((j.lines||[]).length)+'</td><td>'+archiveReadMoney(d)+'</td><td>'+archiveReadMoney(c)+'</td></tr><tr><td colspan="7"><details><summary>Lihat rincian akun</summary><table><thead><tr><th>SANDI</th><th>Nama akun</th><th>Keterangan</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>'+(j.lines||[]).map(l=>'<tr><td>'+esc(l.code)+'</td><td>'+esc(archiveReadAccount(l.code).name)+'</td><td>'+esc(l.note||'')+'</td><td>'+archiveReadMoney(l.debit)+'</td><td>'+archiveReadMoney(l.credit)+'</td></tr>').join('')+'</tbody></table></details></td></tr>'}).join('')+'</tbody></table>':'<div class="empty">Tidak ada jurnal yang cocok.</div>';
}
function archiveReadNptrans(){
 const q=($('archive-read-search').value||'').toLowerCase().trim(),rows=(archiveReadState.nptrans||[]).filter(r=>[r.sandi,r.tanggal,r.nobukti,r.nourut,r.ket,String(r.jumlah)].join(' ').toLowerCase().includes(q));
 const total=rows.reduce((n,r)=>n+Number(r.jumlah||0),0);$('archive-read-summary').textContent=rows.length.toLocaleString('id-ID')+' baris NPTRANS · Total nilai '+archiveReadMoney(total);
 $('archive-read-table').innerHTML=rows.length?'<table><thead><tr><th>SANDI</th><th>Tanggal</th><th>No. Bukti</th><th>No. Urut</th><th>Keterangan</th><th>Jumlah</th><th>Nama Akun</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.sandi||'')+'</td><td>'+esc(r.tanggal||'')+'</td><td>'+esc(r.nobukti||'')+'</td><td>'+esc(r.nourut||'')+'</td><td>'+esc(r.ket||'')+'</td><td>'+archiveReadMoney(r.jumlah)+'</td><td>'+esc(archiveReadAccount(r.sandi).name)+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Tidak ada data NPTRANS yang cocok.</div>';
}
function archiveReadLedger(){
 const period=$('archive-read-period').value,code=$('archive-read-account').value;
 if(!period||!code){$('archive-read-summary').textContent='Pilih bulan dan akun untuk melihat Buku Besar.';$('archive-read-table').innerHTML='<div class="empty">Periode dan akun diperlukan.</div>';return}
 const acc=archiveReadAccount(code),opening=(archiveReadState.openingBalances||[]).find(x=>x.period===period&&String(x.accountCode)===String(code)),netOpen=opening?Number(opening.debit||0)-Number(opening.credit||0):0;
 const rows=[{date:period+'-01',number:'SALDO AWAL',description:'Saldo awal periode',debit:Math.max(netOpen,0),credit:Math.max(-netOpen,0),kind:'opening'}];
 (archiveReadState.journals||[]).filter(j=>(j.status==='posted'||(!j.status&&j.status!=='draft'))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).filter(l=>String(l.code)===String(code)).forEach(l=>rows.push({date:String(j.date||''),number:String(j.number||''),description:String(j.description||'')+(l.note?' · '+l.note:''),debit:Number(l.debit||0),credit:Number(l.credit||0),kind:'movement'})));
 rows.sort((x,y)=>x.date.localeCompare(y.date)||(x.kind==='opening'?-1:y.kind==='opening'?1:0)||x.number.localeCompare(y.number));
 let balance=0;rows.forEach(r=>{balance+=r.debit-r.credit;r.bd=Math.max(balance,0);r.bc=Math.max(-balance,0)});
 const debit=rows.filter(x=>x.kind==='movement').reduce((n,x)=>n+x.debit,0),credit=rows.filter(x=>x.kind==='movement').reduce((n,x)=>n+x.credit,0);
 $('archive-read-summary').textContent=acc.code+' · '+acc.name+' | Saldo awal '+archiveReadMoney(netOpen)+' | Mutasi D '+archiveReadMoney(debit)+' | Mutasi K '+archiveReadMoney(credit)+' | Saldo akhir '+archiveReadMoney(balance);
 $('archive-read-table').innerHTML='<table><thead><tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo Debit</th><th>Saldo Kredit</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.number)+'</td><td>'+esc(r.description)+'</td><td>'+archiveReadMoney(r.debit)+'</td><td>'+archiveReadMoney(r.credit)+'</td><td>'+archiveReadMoney(r.bd)+'</td><td>'+archiveReadMoney(r.bc)+'</td></tr>').join('')+'</tbody></table>';
}
function archiveReadTrialBalance(){
 const period=$('archive-read-period').value;if(!period){$('archive-read-summary').textContent='Pilih bulan laporan.';$('archive-read-table').innerHTML='<div class="empty">Periode diperlukan.</div>';return}
 const opening=new Map((archiveReadState.openingBalances||[]).filter(x=>x.period===period).map(x=>[String(x.accountCode),{debit:Number(x.debit||0),credit:Number(x.credit||0)}])),movement=new Map();
 (archiveReadState.journals||[]).filter(j=>(j.status==='posted'||(!j.status&&j.status!=='draft'))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).forEach(l=>{const v=movement.get(String(l.code))||{debit:0,credit:0};v.debit+=Number(l.debit||0);v.credit+=Number(l.credit||0);movement.set(String(l.code),v)}));
 const codes=new Set([...(archiveReadState.accounts||[]).map(x=>String(x.code)),...opening.keys(),...movement.keys()]);
 const rows=[...codes].sort().map(code=>{const op=opening.get(code)||{debit:0,credit:0},mv=movement.get(code)||{debit:0,credit:0},net=op.debit-op.credit+mv.debit-mv.credit,acc=archiveReadAccount(code);return {code,name:acc.name,od:Math.max(op.debit-op.credit,0),oc:Math.max(op.credit-op.debit,0),debit:mv.debit,credit:mv.credit,ed:Math.max(net,0),ec:Math.max(-net,0)}});
 const sum=k=>rows.reduce((n,r)=>n+r[k],0);$('archive-read-summary').textContent='Neraca percobaan '+period+' · '+rows.length+' akun · Selisih saldo akhir '+archiveReadMoney(sum('ed')-sum('ec'));
 $('archive-read-table').innerHTML='<table><thead><tr><th>SANDI</th><th>Nama akun</th><th>Saldo awal D</th><th>Saldo awal K</th><th>Mutasi D</th><th>Mutasi K</th><th>Saldo akhir D</th><th>Saldo akhir K</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td>'+archiveReadMoney(r.od)+'</td><td>'+archiveReadMoney(r.oc)+'</td><td>'+archiveReadMoney(r.debit)+'</td><td>'+archiveReadMoney(r.credit)+'</td><td>'+archiveReadMoney(r.ed)+'</td><td>'+archiveReadMoney(r.ec)+'</td></tr>').join('')+'<tr><th colspan="2">TOTAL</th>'+['od','oc','debit','credit','ed','ec'].map(k=>'<th>'+archiveReadMoney(sum(k))+'</th>').join('')+'</tr></tbody></table>';
}
function renderArchiveReader(){
 if(!archiveReadState){$('archive-read-summary').textContent='Belum ada arsip yang dibuka.';$('archive-read-table').innerHTML='<div class="empty">Pilih file arsip JSON yang dibuat melalui menu Arsip 5 Tahunan.</div>';return}
 const mode=$('archive-read-mode').value;$('archive-read-search').hidden=mode==='ledger'||mode==='trial';$('archive-read-account-wrap').hidden=mode!=='ledger';
 if(mode==='journals')archiveReadJournals();else if(mode==='nptrans')archiveReadNptrans();else if(mode==='ledger')archiveReadLedger();else archiveReadTrialBalance();
}
async function loadArchiveReaderFile(file){
 if(!file)return;try{const parsed=JSON.parse(await file.text()),candidate=parsed.state;if(parsed.archiveType!=='FIVE_YEAR_FULL_DATABASE_SNAPSHOT'||!candidate||!Array.isArray(candidate.accounts)||!Array.isArray(candidate.journals)||!Array.isArray(candidate.nptrans)||!Array.isArray(candidate.openingBalances))throw Error('File bukan arsip SBP lima tahunan yang valid.');archiveReadState=candidate;archiveReadName=file.name;$('archive-read-period').value='';$('archive-read-account').innerHTML='<option value="">Pilih akun</option>'+candidate.accounts.slice().sort((x,y)=>String(x.code).localeCompare(String(y.code))).map(x=>'<option value="'+esc(x.code)+'">'+esc(x.code)+' · '+esc(x.name||'(Tanpa nama)')+'</option>').join('');$('archive-read-summary').textContent='Arsip '+(parsed.period?.startYear||'?')+'–'+(parsed.period?.endYear||'?')+' berhasil dibuka dalam mode baca saja. Tidak ada data yang diimpor ke database aktif.';$('archive-read-status').textContent='ARSIP TERBUKA · '+file.name+' · '+(candidate.journals.length||0)+' jurnal · '+(candidate.nptrans.length||0)+' baris NPTRANS';renderArchiveReader()}catch(e){archiveReadState=null;$('archive-read-status').textContent='Gagal membuka arsip';$('archive-read-summary').textContent=e.message;$('archive-read-table').innerHTML='<div class="empty">Arsip tidak dapat dibaca.</div>'}
}

async function sha256Hex(textValue){const bytes=new TextEncoder().encode(textValue);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function createFiveYearArchive(){
 const start=Number($('archive-start-year').value),end=Number($('archive-end-year').value);
 if(!Number.isInteger(start)||!Number.isInteger(end)||end-start!==4){setMessage('archive-message','Masukkan rentang tepat lima tahun, misalnya 2026 sampai 2030.','bad');return}
 if(!backupDirectoryHandle){setMessage('archive-message','Hubungkan folder server pada menu Backup & Restore terlebih dahulu.','bad');return}
 if(await directoryPermission(backupDirectoryHandle,false)!=='granted'){setMessage('archive-message','Izin folder server belum aktif. Buka menu Backup & Restore lalu aktifkan kembali folder.','bad');return}
 const name='SBP-ARSIP-'+start+'-'+end+'.json',manifestName=name+'.sha256.json';
 try{
  const archiveRoot=await backupDirectoryHandle.getDirectoryHandle('ARSIP_5_TAHUNAN',{create:true});
  try{await archiveRoot.getFileHandle(name,{create:false});setMessage('archive-message','Arsip '+start+'–'+end+' sudah ada. Arsip lama tidak ditimpa.','bad');return}catch(e){if(e.name!=='NotFoundError')throw e}
  const createdAt=new Date().toISOString();
  const payload={app:'SBP Accounting',version:19,archiveType:'FIVE_YEAR_FULL_DATABASE_SNAPSHOT',period:{startYear:start,endYear:end},createdAt,scope:'SNAPSHOT LENGKAP DATABASE PADA SAAT PENGARSIPAN',note:'Arsip ini menyimpan salinan lengkap database saat dibuat. Data aktif tidak dipindahkan atau dihapus. Rentang tahun adalah label periode penutupan, bukan filter data.',state:JSON.parse(JSON.stringify(state))};
  if(payload.state.npTemplate?.fields)payload.state.npTemplate.fields.forEach(f=>{if(f.raw&&typeof f.raw==='object')f.raw=Array.from(f.raw)});
  const body=JSON.stringify(payload),digest=await sha256Hex(body);
  const file=await archiveRoot.getFileHandle(name,{create:true}),w=await file.createWritable();await w.write(body);await w.close();
  const check=await (await file.getFile()).text();if(await sha256Hex(check)!==digest)throw Error('Checksum arsip tidak cocok setelah penulisan.');
  const manifest={file:name,sha256:digest,bytes:new Blob([body]).size,createdAt,period:payload.period,verified:true};
  const mf=await archiveRoot.getFileHandle(manifestName,{create:true}),mw=await mf.createWritable();await mw.write(JSON.stringify(manifest,null,2));await mw.close();
  $('archive-result').textContent='Berhasil: '+name+' · '+(manifest.bytes/1024/1024).toFixed(2)+' MB · SHA-256 terverifikasi.';
  setMessage('archive-message','Arsip berhasil dibuat dan checksum telah diverifikasi. Database aktif tidak diubah. Salin arsip ke media kedua.','good');
 }catch(e){console.warn('Pembuatan arsip gagal',e);setMessage('archive-message','Pembuatan arsip gagal: '+e.message+'. Data aktif tidak dihapus.','bad')}
}
async function verifyFiveYearArchive(){
 if(!backupDirectoryHandle||await directoryPermission(backupDirectoryHandle,false)!=='granted'){setMessage('archive-message','Hubungkan dan aktifkan folder server terlebih dahulu.','bad');return}
 const start=Number($('archive-start-year').value),end=Number($('archive-end-year').value),name='SBP-ARSIP-'+start+'-'+end+'.json';
 try{const root=await backupDirectoryHandle.getDirectoryHandle('ARSIP_5_TAHUNAN',{create:false}),file=await root.getFileHandle(name,{create:false}),body=await(await file.getFile()).text(),manifest=JSON.parse(await(await(await root.getFileHandle(name+'.sha256.json',{create:false})).getFile()).text()),actual=await sha256Hex(body);if(actual!==manifest.sha256)throw Error('Checksum tidak cocok. Arsip mungkin berubah atau rusak.');const parsed=JSON.parse(body);if(!parsed.state||!Array.isArray(parsed.state.journals)||!Array.isArray(parsed.state.accounts))throw Error('Struktur arsip tidak lengkap.');setMessage('archive-message','Verifikasi berhasil: checksum cocok dan struktur data utama dapat dibaca.','good');$('archive-result').textContent='Valid · '+name+' · '+(manifest.bytes/1024/1024).toFixed(2)+' MB.'}catch(e){setMessage('archive-message','Verifikasi gagal: '+e.message,'bad')}
}

function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const labels={dashboard:'Dashboard','archive-reader':'Pembaca Arsip',archive:'Arsip 5 Tahunan',journal:'Input Jurnal','journal-list':'Daftar Jurnal',accounts:'Master Akun','opening-balances':'Saldo Awal ACC & Program',ledger:'Buku Besar per Akun',nptrans:'NPTRANS / DBF',reports:'Laporan',backup:'Backup & Restore',audit:'Riwayat Aktivitas'};$('page-title').textContent=labels[page]||page;if(page==='dashboard')renderDashboard();if(page==='journal-list')renderJournals();if(page==='accounts')renderAccounts();if(page==='opening-balances')renderOpeningBalances();if(page==='nptrans')renderNptrans();if(page==='reports')renderTrialBalance();if(page==='ledger')renderLedger();if(page==='audit')renderAuditLogs()}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('.list-toggle').forEach(b=>b.addEventListener('click',()=>{const panel=$(b.dataset.target);if(!panel)return;const opening=panel.hidden;panel.hidden=!opening;b.setAttribute('aria-expanded',String(opening));const labels={'account-list-content':opening?'− Sembunyikan daftar akun':'＋ Tampilkan '+state.accounts.length+' akun','journal-list-content':opening?'− Sembunyikan daftar jurnal':'＋ Tampilkan daftar jurnal','np-list-content':opening?'− Sembunyikan data NPTRANS':'＋ Tampilkan data NPTRANS','trial-balance-content':opening?'− Sembunyikan neraca saldo':'＋ Tampilkan neraca saldo'};b.textContent=labels[b.dataset.target]||'Tampilkan / sembunyikan';}));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('quick-journal').onclick=()=>{resetJournalForm();go('journal')};

function fmtDate(d){if(!d)return '';const x=new Date(d+'T00:00:00');return Number.isNaN(x.getTime())?d:x.toLocaleDateString('id-ID')}
function renderDashboard(){const posted=state.journals.filter(j=>j.status==='posted'||(!j.status&&j.status!=='draft'));const lines=posted.flatMap(j=>j.lines||[]),debit=lines.reduce((a,l)=>a+Number(l.debit||0),0),credit=lines.reduce((a,l)=>a+Number(l.credit||0),0);$('stat-debit').textContent=money(debit);$('stat-credit').textContent=money(credit);$('stat-journals').textContent=posted.length.toLocaleString('id-ID');const recent=posted.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent-journals').innerHTML=recent.length?journalTable(recent,false):'<div class="empty"><div class="empty-state"><span class="empty-state-icon"><i data-lucide="list"></i></span><strong>Belum ada jurnal tersimpan</strong><p>Transaksi terbaru akan muncul di sini setelah jurnal dibuat.</p></div></div>';window.lucide?.createIcons($('recent-journals'))}
function accountOptions(selected=''){return '<option value="">Pilih akun</option>'+state.accounts.map(a=>'<option value="'+esc(a.code)+'" '+(a.code===selected?'selected':'')+'>'+esc(a.code)+' — '+esc(a.name)+'</option>').join('')}
function addJournalLine(line={}){const tr=document.createElement('tr');tr.className='entry-row';tr.innerHTML='<td><select class="line-code">'+accountOptions(line.code||'')+'</select></td><td class="line-account-name">'+esc((state.accounts.find(a=>a.code===line.code)||{}).name||'—')+'</td><td><input class="line-note" placeholder="Keterangan baris" value="'+esc(line.note||'')+'"></td><td><input class="amount line-debit" type="number" min="0" step="0.01" value="'+(line.debit||'')+'"></td><td><input class="amount line-credit" type="number" min="0" step="0.01" value="'+(line.credit||'')+'"></td><td><button class="icon-btn remove-line" type="button">×</button></td>';tr.querySelector('.line-code').onchange=()=>{const a=state.accounts.find(x=>x.code===tr.querySelector('.line-code').value);tr.querySelector('.line-account-name').textContent=a?a.name:'—'};tr.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateJournalTotals));tr.querySelector('.remove-line').onclick=()=>{if($('journal-lines').children.length>2){tr.remove();updateJournalTotals()}else toast('Minimal dua baris akun diperlukan.')};$('journal-lines').appendChild(tr);updateJournalTotals()}
function resetJournalForm(){editingId=null;$('j-date').value=new Date().toISOString().slice(0,10);$('j-number').value='';$('j-description').value='';$('journal-lines').innerHTML='';addJournalLine();addJournalLine();$('save-journal').textContent='Simpan sebagai Draft';$('post-journal').textContent='Posting Jurnal';$('post-journal').disabled=false;setMessage('journal-message','Simpan sebagai Draft untuk dilanjutkan nanti, atau Posting Jurnal setelah debit dan kredit seimbang.')}
function updateJournalTotals(){const rows=[...document.querySelectorAll('.entry-row')];let d=0,c=0;rows.forEach(r=>{d+=Number(r.querySelector('.line-debit').value||0);c+=Number(r.querySelector('.line-credit').value||0)});$('sum-debit').textContent=money(d);$('sum-credit').textContent=money(c);$('sum-diff').textContent=money(Math.abs(d-c));$('sum-diff').style.color=Math.abs(d-c)<.005?'#176c45':'#b34444'}

let pendingBulkJournals=[];
function bulkDate(value){
 const s=String(value??'').trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
 if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 const n=Number(s);if(Number.isFinite(n)&&n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toISOString().slice(0,10)}
 return '';
}
function parseBulkJournalRows(rows){
 if(!rows.length)throw Error('File tidak memiliki data.');
 let hi=-1,cols={};
 const aliases={date:['TANGGAL','DATE'],number:['NOBUKTI','NOMORBUKTI','BUKTI'],desc:['KETERANGAN','URAIAN','DESKRIPSI'],code:['SANDI','KODE','KODEAKUN','ACCOUNTCODE'],note:['KETERANGANBARIS','CATATANBARIS','URAIANBARIS'],debit:['DEBIT','MUTASIDB'],credit:['KREDIT','MUTASIKR']};
 for(let i=0;i<Math.min(rows.length,30);i++){const h=rows[i].map(norm),f={};for(const [k,n] of Object.entries(aliases))f[k]=h.findIndex(x=>n.includes(x));if(f.date>=0&&f.number>=0&&f.code>=0&&f.debit>=0&&f.credit>=0){hi=i;cols=f;break}}
 if(hi<0)throw Error('Header wajib tidak lengkap. Wajib ada TANGGAL, NOBUKTI, SANDI, DEBIT, dan KREDIT.');
 const parsed=[];rows.slice(hi+1).forEach((r,i)=>{if(!r.some(v=>String(v??'').trim()))return;parsed.push({date:bulkDate(r[cols.date]),number:String(r[cols.number]??'').trim(),description:String(cols.desc>=0?r[cols.desc]??'':'').trim(),code:String(r[cols.code]??'').trim(),note:String(cols.note>=0?r[cols.note]??'':'').trim(),debit:parseAmount(r[cols.debit]),credit:parseAmount(r[cols.credit]),row:hi+i+2})});
 if(!parsed.length)throw Error('Header ditemukan, tetapi tidak ada baris transaksi.');return parsed;
}
function validateBulkJournals(rows){
 const errors=[],warnings=[],groups=new Map(),known=new Set(state.accounts.map(a=>String(a.code)));
 rows.forEach(r=>{
  if(!r.date)errors.push('Baris '+r.row+': tanggal tidak valid.');
  if(!r.number)errors.push('Baris '+r.row+': nomor bukti kosong.');
  if(!r.description)errors.push('Baris '+r.row+': keterangan jurnal kosong.');
  if(!r.code)errors.push('Baris '+r.row+': SANDI kosong.');
  else if(!known.has(r.code))warnings.push('SANDI '+r.code+' belum ada di Master Akun; tambahkan setelah import untuk penyesuaian.');
  if(!Number.isFinite(r.debit)||!Number.isFinite(r.credit)||r.debit<0||r.credit<0)errors.push('Baris '+r.row+': nilai debit/kredit tidak valid.');
  const key=r.date+'|'+r.number;if(!groups.has(key))groups.set(key,{date:r.date,number:r.number,description:r.description,lines:[],debit:0,credit:0});
  const g=groups.get(key);if(g.description!==r.description)errors.push('Nomor '+r.number+': keterangan berbeda dalam satu nomor bukti.');
  g.lines.push({code:r.code,note:r.note,debit:r.debit,credit:r.credit});g.debit+=Number.isFinite(r.debit)?r.debit:0;g.credit+=Number.isFinite(r.credit)?r.credit:0;
 });
 const prepared=[];for(const g of groups.values()){
  if(Math.abs(g.debit-g.credit)>.005)warnings.push(g.number+': belum seimbang (debit '+money(g.debit)+'; kredit '+money(g.credit)+'). Tetap disimpan sebagai Draft.');
  if(!g.lines.length)errors.push(g.number+': tidak memiliki baris transaksi.');
  if(state.journals.some(j=>j.number===g.number))errors.push(g.number+': nomor bukti sudah ada di Daftar Jurnal.');
  prepared.push({...g,id:crypto.randomUUID(),status:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 }
 return {prepared,errors,warnings:[...new Set(warnings)]};
}
function showBulkPreview(rows){
 const result=validateBulkJournals(rows);pendingBulkJournals=result.errors.length?[]:result.prepared;
 $('bulk-journal-summary').textContent=rows.length+' baris · '+result.prepared.length+' nomor bukti';
 $('bulk-journal-detail').textContent=result.errors.length?'Ditemukan '+result.errors.length+' kesalahan. Perbaiki file sebelum menyimpan.':(result.warnings.length?'Data dapat diimpor sebagai Draft dengan '+result.warnings.length+' catatan penyesuaian.':'Semua data lolos pemeriksaan.');
 const notes=[...result.errors.map(e=>'KESALAHAN: '+e),...result.warnings.map(w=>'CATATAN: '+w)];
 $('bulk-journal-errors').hidden=!notes.length;$('bulk-journal-errors').innerHTML=notes.length?'<b>Hasil pemeriksaan:</b><ul>'+notes.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>':'';
 $('bulk-journal-preview-rows').innerHTML=rows.slice(0,100).map(r=>'<tr><td>'+esc(r.date||'—')+'</td><td>'+esc(r.number)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.code)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td></tr>').join('');
 $('bulk-journal-save').disabled=!!result.errors.length;$('bulk-journal-review').hidden=false;
 setMessage('bulk-journal-message',result.errors.length?'Validasi gagal. Tidak ada data yang disimpan.':(result.warnings.length?'Bisa diimpor sebagai Draft. Periksa SANDI dan keseimbangan sebelum melakukan posting.':'Validasi berhasil. Data siap disimpan sebagai Draft.'),result.errors.length?'bad':(result.warnings.length?'':'good'));
}
$('bulk-journal-file').onchange=e=>{const f=e.target.files?.[0];$('bulk-journal-file-name').textContent=f?f.name:'Belum ada file dipilih.';$('bulk-journal-preview').disabled=!f;pendingBulkJournals=[];$('bulk-journal-review').hidden=true};
$('bulk-journal-preview').onclick=async()=>{const f=$('bulk-journal-file').files?.[0];if(!f)return;try{let rows;if(/\.xlsx?$/i.test(f.name)){if(!window.XLSX)throw Error('Mesin Excel lokal belum siap.');const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:false});let found=null;for(const name of wb.SheetNames){const data=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true});try{parseBulkJournalRows(data);found=data;break}catch{}}if(!found)throw Error('Format kolom jurnal tidak ditemukan pada sheet Excel.');rows=parseBulkJournalRows(found)}else rows=parseBulkJournalRows(parseCSV(await f.text()));showBulkPreview(rows)}catch(err){pendingBulkJournals=[];$('bulk-journal-review').hidden=true;setMessage('bulk-journal-message','Gagal membaca file: '+err.message,'bad')}};
$('bulk-journal-save').onclick=async()=>{if(!pendingBulkJournals.length)return;if(pendingBulkJournals.some(j=>isPeriodLocked(String(j.date||'').slice(0,7)))){setMessage('bulk-journal-message','Import diblokir: file berisi tanggal pada periode yang sudah ditutup.','bad');return}if(!requireImportPassword('Import Jurnal Massal'))return;const existing=new Set(state.journals.map(j=>j.number));if(pendingBulkJournals.some(j=>existing.has(j.number))){setMessage('bulk-journal-message','Ada nomor bukti yang sudah tersimpan. Periksa kembali file.','bad');return}try{state.journals.push(...pendingBulkJournals);await persist();const count=pendingBulkJournals.length;pendingBulkJournals=[];$('bulk-journal-review').hidden=true;$('bulk-journal-file').value='';$('bulk-journal-file-name').textContent='Belum ada file dipilih.';$('bulk-journal-preview').disabled=true;renderDashboard();renderJournals();setMessage('bulk-journal-message',count+' jurnal berhasil disimpan dan siap dilihat di Daftar Jurnal.','good');toast(count+' jurnal massal berhasil disimpan.');go('journal-list');const toggle=document.querySelector('[data-target="journal-list-content"]');if(toggle&&$('journal-list-content').hidden)toggle.click()}catch(err){setMessage('bulk-journal-message','Penyimpanan gagal: '+err.message,'bad')}};
$('bulk-journal-cancel').onclick=()=>{$('bulk-journal-review').hidden=true;pendingBulkJournals=[]};
$('bulk-journal-template').onclick=()=>exportXlsxSheet('Format-Import-Jurnal-Massal-SBP.xlsx','Input Jurnal',[['TANGGAL','NOBUKTI','KETERANGAN','STATUS','SANDI','KETERANGAN BARIS','DEBIT','KREDIT'],['2026-10-01','JU/001/2026','Contoh transaksi','POSTED','111.100','Kas bertambah',100000,0],['2026-10-01','JU/001/2026','Contoh transaksi','POSTED','311.100','Modal disetor',0,100000]]);

$('add-line').onclick=()=>addJournalLine();$('clear-journal').onclick=resetJournalForm;
async function saveJournal(targetStatus){
 const date=$('j-date').value,number=$('j-number').value.trim(),description=$('j-description').value.trim();
 const rows=[...document.querySelectorAll('.entry-row')].map(r=>({code:r.querySelector('.line-code').value,note:r.querySelector('.line-note').value.trim(),debit:Number(r.querySelector('.line-debit').value||0),credit:Number(r.querySelector('.line-credit').value||0)}));
 if(!date||!number||!description){setMessage('journal-message','Tanggal, nomor bukti, dan keterangan wajib diisi.','bad');return}
 if(!periodGuard(date.slice(0,7),'menyimpan atau memposting jurnal'))return;\n if(state.journals.some(j=>j.number===number&&j.id!==editingId)){setMessage('journal-message','Nomor bukti sudah digunakan.','bad');return}
 if(targetStatus==='posted'){
  if(rows.length<2||rows.some(x=>!x.code||!Number.isFinite(x.debit)||!Number.isFinite(x.credit)||(!x.debit&&!x.credit)||(x.debit&&x.credit)||x.debit<0||x.credit<0)){setMessage('journal-message','Untuk posting, setiap baris wajib memiliki akun dan hanya satu nilai debit/kredit yang valid.','bad');return}
  const debit=rows.reduce((s,x)=>s+x.debit,0),credit=rows.reduce((s,x)=>s+x.credit,0);
  if(Math.abs(debit-credit)>.005){setMessage('journal-message','Jurnal belum seimbang. Selisih: '+money(Math.abs(debit-credit)),'bad');return}
 }else if(rows.some(x=>x.debit<0||x.credit<0||!Number.isFinite(x.debit)||!Number.isFinite(x.credit))){setMessage('journal-message','Nilai debit/kredit tidak boleh negatif atau tidak valid.','bad');return}
 const old=state.journals.find(j=>j.id===editingId);
 if(old&&!periodGuard(String(old.date||'').slice(0,7),'mengubah jurnal lama'))return;\n  if(old&&old.status!=='draft'){setMessage('journal-message','Jurnal terposting tidak dapat diedit. Buat jurnal koreksi/pembalik.','bad');return}
 const now=new Date().toISOString(),item={...(old||{}),id:editingId||crypto.randomUUID(),date,number,description,lines:rows,status:targetStatus,updatedAt:now};
 if(!old)item.createdAt=now;
 if(old)state.journals=state.journals.map(j=>j.id===editingId?item:j);else state.journals.push(item);
 await persist();toast(targetStatus==='posted'?'Jurnal berhasil diposting.':'Draft jurnal berhasil disimpan.');resetJournalForm();go('journal-list');renderDashboard();
}
$('save-journal').onclick=()=>saveJournal('draft');
$('post-journal').onclick=()=>saveJournal('posted');
function exportJournalsXlsx(){const rows=[['TANGGAL','NOBUKTI','KETERANGAN','STATUS','SANDI','KETERANGAN BARIS','DEBIT','KREDIT'],...state.journals.flatMap(j=>(j.lines||[]).map(l=>[j.date,j.number,j.description,j.status==='draft'?'DRAFT':'POSTED',l.code,l.note,l.debit||0,l.credit||0]))];exportXlsxSheet('Daftar-Jurnal.xlsx','Daftar Jurnal',rows)}
function journalTable(items,actions=true){
 const totals=items.reduce((t,j)=>{for(const l of (j.lines||[])){t.debit+=Number(l.debit||0);t.credit+=Number(l.credit||0)}return t},{debit:0,credit:0});
 totals.balance=totals.debit-totals.credit;
 const rows=items.map(j=>{
  const d=(j.lines||[]).reduce((s,x)=>s+Number(x.debit||0),0),c=(j.lines||[]).reduce((s,x)=>s+Number(x.credit||0),0),bal=d-c;
  const details=(j.lines||[]).map(l=>'<tr><td>'+esc(l.code)+'</td><td>'+esc((state.accounts.find(a=>a.code===l.code)||{}).name||'—')+'</td><td>'+esc(l.note||'')+'</td><td class="num">'+money(l.debit)+'</td><td class="num">'+money(l.credit)+'</td></tr>').join('');
  return '<tr class="journal-main-row"><td>'+esc(fmtDate(j.date))+'</td><td><b>'+esc(j.number)+'</b></td><td class="journal-description">'+esc(j.description)+'</td><td><span class="tag '+(j.status==='draft'?'np-warn':'np-ok')+'">'+(j.status==='draft'?'DRAFT':'TERPOSTING')+'</span></td><td class="num">'+(j.lines||[]).length+'</td><td class="num">'+money(d)+'</td><td class="num">'+money(c)+'</td><td class="num '+(bal===0?'balance-ok':'balance-warn')+'">'+money(bal)+'</td>'+(actions?'<td class="journal-actions"><button class="journal-icon-btn detail-journal" data-id="'+esc(j.id)+'" title="Lihat detail" aria-label="Lihat detail">⌄</button>'+(j.status==='draft'?'<button class="journal-icon-btn edit-journal" data-id="'+esc(j.id)+'" title="Edit Draft" aria-label="Edit Draft">✎</button><button class="journal-icon-btn danger delete-journal" data-id="'+esc(j.id)+'" title="Hapus Draft" aria-label="Hapus Draft">×</button>':(j.status==='posted'&&!j.reversedBy?'<button class="journal-icon-btn reverse-journal" data-id="'+esc(j.id)+'" title="Buat jurnal pembalik" aria-label="Buat jurnal pembalik">↶</button>':''))+'</td>':'')+'</tr>'+(actions?'<tr class="journal-detail-row" data-detail="'+esc(j.id)+'" hidden><td colspan="9"><div class="journal-detail-box"><b>Rincian akun · '+esc(j.number)+'</b><div class="table-wrap"><table class="journal-lines-table"><thead><tr><th>SANDI</th><th>Nama akun</th><th>Keterangan baris</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>'+details+'</tbody></table></div></div></td></tr>':'');
 }).join('');
 const summary='<div class="journal-totals"><div><span>Total debit</span><b>'+money(totals.debit)+'</b></div><div><span>Total kredit</span><b>'+money(totals.credit)+'</b></div><div><span>Balance (Debit − Kredit)</span><b class="'+(totals.balance===0?'balance-ok':'balance-warn')+'">'+money(totals.balance)+'</b></div></div>';
 return summary+'<div class="table-wrap journal-table-wrap"><table class="journal-list-table"><thead><tr><th>Tanggal</th><th>No. bukti</th><th>Keterangan</th><th>Status</th><th>Baris</th><th>Total debit</th><th>Total kredit</th><th>Balance</th>'+(actions?'<th>Aksi</th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderJournals(){
 const q=($('journal-search').value||'').toLowerCase().trim(),status=$('journal-status-filter')?.value||'all',size=Number($('journal-page-size')?.value||10);
 const items=state.journals.filter(j=>(j.number+' '+j.description+' '+(j.date||'')).toLowerCase().includes(q)&&(status==='all'||(status==='draft'?j.status==='draft':j.status!=='draft'))).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const pages=Math.max(1,Math.ceil(items.length/size));journalPage=Math.min(journalPage,pages-1);
 const shown=items.slice(journalPage*size,(journalPage+1)*size);
 $('journal-table').innerHTML=shown.length?journalTable(shown):'<div class="empty">Tidak ada jurnal yang cocok.</div>';
 $('journal-page-info').textContent=items.length?('Menampilkan '+(journalPage*size+1)+'–'+Math.min((journalPage+1)*size,items.length)+' dari '+items.length+' jurnal'):'0 jurnal';
 $('journal-page-current').textContent=(journalPage+1)+' / '+pages;
 $('journal-prev').disabled=journalPage===0;$('journal-next').disabled=journalPage>=pages-1;
 document.querySelectorAll('.edit-journal').forEach(b=>b.onclick=()=>editJournal(b.dataset.id));
 document.querySelectorAll('.detail-journal').forEach(b=>b.onclick=()=>{const row=document.querySelector('[data-detail="'+CSS.escape(b.dataset.id)+'"]');if(row){row.hidden=!row.hidden;b.textContent=row.hidden?'⌄':'⌃'}});
 document.querySelectorAll('.delete-journal').forEach(b=>b.onclick=async()=>{const j=state.journals.find(x=>x.id===b.dataset.id);if(!j||j.status!=='draft')return;if(!periodGuard(String(j.date||'').slice(0,7),'menghapus Draft'))return;if(confirm('Hapus Draft '+j.number+'?')){state.journals=state.journals.filter(x=>x.id!==b.dataset.id);await persist();renderJournals();renderDashboard();toast('Draft dihapus.')}});
 document.querySelectorAll('.reverse-journal').forEach(b=>b.onclick=async()=>{const j=state.journals.find(x=>x.id===b.dataset.id);if(!j||j.status!=='posted'||j.reversedBy)return;const number=prompt('Nomor bukti jurnal pembalik:',j.number+'-K');if(!number)return;if(state.journals.some(x=>x.number===number)){alert('Nomor bukti sudah digunakan.');return}const date=prompt('Tanggal jurnal pembalik (YYYY-MM-DD):',new Date().toISOString().slice(0,10));if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;const reversal={id:crypto.randomUUID(),date,number,description:'Pembalikan atas '+j.number+' — '+j.description,lines:(j.lines||[]).map(l=>({...l,debit:Number(l.credit||0),credit:Number(l.debit||0)})),status:'posted',reversalOf:j.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};j.reversedBy=reversal.id;state.journals.push(reversal);await persist();renderJournals();renderDashboard();toast('Jurnal pembalik berhasil diposting.');});
}
let journalPage=0;
function editJournal(id){const j=state.journals.find(x=>x.id===id);if(!j||j.status!=='draft'){toast('Hanya Draft yang dapat diedit.');return}editingId=id;$('j-date').value=j.date;$('j-number').value=j.number;$('j-description').value=j.description;$('journal-lines').innerHTML='';j.lines.forEach(l=>addJournalLine(l));$('save-journal').textContent='Simpan perubahan Draft';$('post-journal').textContent='Posting Jurnal';go('journal')}
let bulkPostCandidates=[];
function updateBulkPostMode(){
 const mode=$('bulk-post-mode').value;
 $('bulk-post-date-wrap').hidden=mode!=='date';
 $('bulk-post-month-wrap').hidden=mode!=='month';
 $('bulk-post-from-wrap').hidden=mode!=='range';
 $('bulk-post-to-wrap').hidden=mode!=='range';
 $('bulk-post-result').hidden=true;$('bulk-post-confirm').disabled=true;bulkPostCandidates=[];
}
function validateBulkPostJournal(j){
 const lines=j.lines||[];
 if(lines.length<2)return 'Minimal harus memiliki 2 baris akun.';
 let debit=0,credit=0;
 for(let i=0;i<lines.length;i++){
  const l=lines[i],d=Number(l.debit||0),c=Number(l.credit||0);
  if(!l.code||!state.accounts.some(a=>String(a.code)===String(l.code)))return 'Baris '+(i+1)+': akun tidak ditemukan di Master Akun.';
  if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0)return 'Baris '+(i+1)+': nilai debit/kredit tidak valid.';
  if(!((d>0&&c===0)||(c>0&&d===0)))return 'Baris '+(i+1)+': isi tepat satu sisi debit atau kredit.';
  debit+=d;credit+=c;
 }
 if(Math.abs(debit-credit)>0.000001)return 'Tidak seimbang. Debit '+money(debit)+' dan kredit '+money(credit)+'.';
 return '';
}
function previewBulkPosting(){
 const mode=$('bulk-post-mode').value;let from='',to='';
 if(mode==='date'){from=to=$('bulk-post-date').value}
 else if(mode==='month'){const m=$('bulk-post-month').value;if(m){from=m+'-01';const [y,mm]=m.split('-').map(Number);const lastDay=new Date(y,mm,0).getDate();to=m+'-'+String(lastDay).padStart(2,'0')}}
 else {from=$('bulk-post-from').value;to=$('bulk-post-to').value}
 if(!from||!to||from>to){toast('Periode tanggal belum benar.');return}
 const drafts=state.journals.filter(j=>j.status==='draft'&&String(j.date||'')>=from&&String(j.date||'')<=to);
 const valid=[],invalid=[];
 drafts.forEach(j=>{const reason=validateBulkPostJournal(j);(reason?invalid:valid).push({journal:j,reason})});
 bulkPostCandidates=valid.map(x=>x.journal);
 const totalDebit=valid.reduce((s,j)=>s+(j.lines||[]).reduce((n,l)=>n+Number(l.debit||0),0),0);
 const totalCredit=valid.reduce((s,j)=>s+(j.lines||[]).reduce((n,l)=>n+Number(l.credit||0),0),0);
 const invalidHtml=invalid.length?'<div class="bulk-post-invalid"><b>Draft tidak dapat diposting ('+invalid.length+')</b><ul>'+invalid.map(x=>'<li><b>'+esc(x.journal.number)+'</b> · '+esc(x.reason)+'</li>').join('')+'</ul></div>':'<p class="balance-ok">Semua Draft dalam periode lolos validasi.</p>';
 $('bulk-post-result').innerHTML='<div class="bulk-post-stats"><div><span>Periode</span><b>'+esc(fmtDate(from))+' – '+esc(fmtDate(to))+'</b></div><div><span>Draft ditemukan</span><b>'+drafts.length+'</b></div><div><span>Siap diposting</span><b>'+valid.length+'</b></div><div><span>Total debit / kredit valid</span><b>'+money(totalDebit)+' / '+money(totalCredit)+'</b></div></div>'+invalidHtml;
 $('bulk-post-result').hidden=false;$('bulk-post-confirm').disabled=valid.length===0;
}
$('bulk-post-mode').addEventListener('change',updateBulkPostMode);
$('bulk-post-preview').addEventListener('click',previewBulkPosting);
$('bulk-post-confirm').addEventListener('click',async()=>{
 const ids=new Set(bulkPostCandidates.map(j=>j.id));if(!ids.size)return;if(bulkPostCandidates.some(j=>isPeriodLocked(String(j.date||'').slice(0,7)))){toast('Posting diblokir: ada Draft dari periode yang sudah ditutup.');return}
 const count=ids.size;
 if(!confirm('Konfirmasi posting '+count+' jurnal Draft yang sudah lolos validasi? Jurnal yang tidak valid tetap menjadi Draft.'))return;
 const now=new Date().toISOString();
 state.journals.forEach(j=>{if(ids.has(j.id)){j.status='posted';j.updatedAt=now;j.postedAt=now}});
 await persist();bulkPostCandidates=[];$('bulk-post-confirm').disabled=true;$('bulk-post-result').innerHTML='<p class="balance-ok"><b>'+count+' jurnal berhasil diposting.</b> Draft yang tidak lolos validasi tetap berstatus Draft.</p>';$('bulk-post-result').hidden=false;
 renderJournals();renderDashboard();renderTrialBalance();toast(count+' jurnal berhasil diposting secara kolektif.');
});
$('journal-search').addEventListener('input',()=>{journalPage=0;renderJournals()});$('journal-status-filter').addEventListener('change',()=>{journalPage=0;renderJournals()});$('journal-page-size').addEventListener('change',()=>{journalPage=0;renderJournals()});$('journal-prev').onclick=()=>{journalPage=Math.max(0,journalPage-1);renderJournals()};$('journal-next').onclick=()=>{journalPage++;renderJournals()};$('export-journals-xlsx').onclick=exportJournalsXlsx;

function syncNptransSandis(){const map=new Map(state.accounts.map(a=>[String(a.code),a]));let added=0;for(const row of state.nptrans){const code=String(row.sandi||'').trim();if(code&&!map.has(code)){map.set(code,{code,name:''});added++}}if(added)state.accounts=[...map.values()];return added}
function renderAccounts(){const q=($('account-search')?.value||'').trim().toLowerCase(),items=state.accounts.filter(a=>(a.code+' '+a.name).toLowerCase().includes(q)).sort((a,b)=>a.code.localeCompare(b.code));$('account-count').textContent=state.accounts.length.toLocaleString('id-ID')+' AKUN';$('account-rows').innerHTML=items.length?items.map((a,index)=>'<tr><td>'+(index+1)+'</td><td><b>'+esc(a.code)+'</b></td><td>'+esc(a.name)+'</td><td><button class="btn edit-account" data-code="'+esc(a.code)+'">Edit</button> <button class="icon-btn delete-account" data-code="'+esc(a.code)+'">Hapus</button></td></tr>').join(''):'<tr><td colspan="4" class="empty">Tidak ada akun yang cocok.</td></tr>';document.querySelectorAll('.edit-account').forEach(b=>b.onclick=()=>editAccount(b.dataset.code));document.querySelectorAll('.delete-account').forEach(b=>b.onclick=async()=>{const code=b.dataset.code,usedOpening=(state.openingBalances||[]).some(x=>x.accountCode===code),usedJournal=state.journals.some(j=>(j.lines||[]).some(l=>l.code===code)),usedNp=state.nptrans.some(r=>r.sandi===code);if(usedOpening){toast('Akun tidak dapat dihapus karena masih memiliki saldo awal. Hapus saldo awal terkait terlebih dahulu.');return}const warning=usedJournal||usedNp?'\n\nKode ini masih dipakai pada transaksi. Jika dihapus, data tetap ada tetapi akun menjadi tidak cocok.':'';if(confirm('Hapus akun '+code+'?'+warning)){state.accounts=state.accounts.filter(x=>x.code!==code);if(editingAccountCode===code)resetAccountForm();await persist();renderAccounts();renderNptrans();toast('Akun dihapus.')}})}
function resetAccountForm(){editingAccountCode=null;$('a-code').value='';$('a-code').disabled=false;$('a-name').value='';$('save-account').textContent='＋ Tambah akun';$('cancel-account-edit').hidden=true}
function editAccount(code){const a=state.accounts.find(x=>x.code===code);if(!a)return;editingAccountCode=code;$('a-code').value=a.code;$('a-code').disabled=true;$('a-name').value=a.name;$('save-account').textContent='Simpan perubahan';$('cancel-account-edit').hidden=false;$('a-name').focus()}
$('cancel-account-edit').onclick=resetAccountForm;$('account-search').addEventListener('input',renderAccounts);
$('save-account').onclick=async()=>{const code=$('a-code').value.trim(),name=$('a-name').value.trim();if(!code||!name){toast('Isi kode dan nama akun.');return}if(editingAccountCode){const a=state.accounts.find(x=>x.code===editingAccountCode);if(!a)return;a.name=name}else{if(state.accounts.some(a=>a.code===code)){toast('Kode akun sudah ada. Gunakan tombol Edit.');return}state.accounts.push({code,name})}const wasEditing=!!editingAccountCode;await persist();resetAccountForm();renderAccounts();renderNptrans();toast(wasEditing?'Akun diperbarui.':'Akun baru ditambahkan.')};
function accountRowsAoa(){return [['SANDI','NAMA'],...state.accounts.map(a=>[a.code,a.name])]}
function exportAccountsCsv(){const rows=accountRowsAoa();downloadBlob(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'Master-Akun-SBP.csv')}
function exportAccountsXlsx(){exportXlsxSheet('Master-Akun-SBP.xlsx','Master Akun',accountRowsAoa())}
$('export-accounts').onclick=exportAccountsCsv;$('export-accounts-xlsx').onclick=exportAccountsXlsx;
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'&&quoted&&next==='"'){cell+='"';i++}else if(ch==='"'){quoted=!quoted}else if(ch===','&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);return rows}
function norm(s){return String(s||'').replace(new RegExp('^'+String.fromCharCode(65279)),'').trim().toUpperCase().replace(/[ _-]/g,'')}
function mapHeaders(header){const aliases={SANDI:['SANDI','KODE','KODEAKUN','ACCOUNT'],TANGGAL:['TANGGAL','DATE'],NOBUKTI:['NOBUKTI','NOMORBUKTI','BUKTI'],NOURUT:['NOURUT','URUT','NO'],KET:['KET','KETERANGAN','URAIAN'],JUMLAH:['JUMLAH','NILAI','AMOUNT']};const out={};header.forEach((h,i)=>{for(const [key,vals] of Object.entries(aliases))if(vals.includes(norm(h)))out[key]=i});return out}
function normalizeDate(v){v=String(v||'').trim();if(/^\d{8}$/.test(v))return v.slice(6,8)+'/'+v.slice(4,6)+'/'+v.slice(0,4);if(/^\d{4}-\d\d-\d\d$/.test(v)){const [y,m,d]=v.split('-');return d+'/'+m+'/'+y}return v}
function parseAmount(v){if(v===null||v===undefined||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:NaN;let s=String(v).trim().replace(/[\\s\\u00a0]/g,'').replace(/^Rp/i,'');if(!s)return 0;s=s.replace(/[^0-9,.-]/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(',')){const parts=s.split(',');s=parts.length===2&&parts[1].length<=2?s.replace(',','.'):s.replace(/,/g,'')}const n=Number(s);return Number.isFinite(n)?n:NaN}
function csvToNp(text){const rows=parseCSV(text);if(rows.length<2)throw Error('CSV kosong atau hanya memiliki header.');const h=mapHeaders(rows[0]);const missing=['SANDI','TANGGAL','NOBUKTI','NOURUT','KET','JUMLAH'].filter(k=>h[k]===undefined);if(missing.length)throw Error('Kolom wajib tidak ditemukan: '+missing.join(', '));return rows.slice(1).map((r,i)=>({sandi:(r[h.SANDI]||'').trim(),tanggal:normalizeDate(r[h.TANGGAL]),nobukti:(r[h.NOBUKTI]||'').trim(),nourut:(r[h.NOURUT]||'').trim(),ket:(r[h.KET]||'').trim(),jumlah:parseAmount(r[h.JUMLAH]),_row:i+2}))}
function csvToAccounts(text){const rows=parseCSV(text);if(rows.length<2)throw Error('CSV master akun kosong.');const aliases={code:['SANDI','KODE','KODEAKUN','ACCOUNTCODE'],name:['NAMA','NAMAAKUN','DES','KETERANGAN','URAIAN']};let cols=null,header=-1;for(let i=0;i<Math.min(rows.length,30);i++){const h=rows[i].map(norm),find=names=>h.findIndex(x=>names.includes(x)),ci=find(aliases.code);if(ci>=0){cols={ci,ni:find(aliases.name)};header=i;break}}if(!cols)throw Error('Kolom SANDI tidak ditemukan. Pastikan baris judul tabel memuat kolom SANDI.');const data=rows.slice(header+1).filter(r=>r[cols.ci]&&String(r[cols.ci]).trim());if(!data.length)throw Error('Header SANDI ditemukan, tetapi tidak ada baris akun di bawahnya.');return data.map(r=>({code:String(r[cols.ci]).trim(),name:cols.ni>=0?String(r[cols.ni]||'').trim():''}))}

function xlsxFirstSheetToCsv(buffer){if(!window.XLSX)throw Error('Mesin Excel lokal belum termuat. Muat ulang aplikasi.');const wb=XLSX.read(buffer,{type:'array',cellDates:false});const name=wb.SheetNames[0];if(!name)throw Error('Workbook tidak memiliki lembar kerja.');return XLSX.utils.sheet_to_csv(wb.Sheets[name],{FS:',',RS:'\n'})}
function xlsxToAccounts(buffer){if(!window.XLSX)throw Error('Mesin Excel lokal belum termuat. Muat ulang aplikasi.');const wb=XLSX.read(buffer,{type:'array',cellDates:false}),aliases={code:['SANDI','KODE','KODEAKUN','ACCOUNTCODE'],name:['NAMA','NAMAAKUN','DES','KETERANGAN','URAIAN']};for(const sheetName of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:false});for(let i=0;i<Math.min(rows.length,50);i++){const h=rows[i].map(norm),find=names=>h.findIndex(x=>names.includes(x)),ci=find(aliases.code);if(ci<0)continue;const ni=find(aliases.name),data=rows.slice(i+1).filter(r=>String(r[ci]??'').trim()!=='');if(data.length)return data.map(r=>({code:String(r[ci]).trim(),name:ni>=0?String(r[ni]??'').trim():''}));}}throw Error('Kolom SANDI tidak ditemukan atau tidak ada data akun.')}
function exportXlsxSheet(filename,sheetName,rows){if(!window.XLSX){toast('Mesin Excel belum siap.');return}const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,sheetName);const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});downloadBlob(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename)}
function parseDBF(buffer){
 const b=new Uint8Array(buffer),v=new DataView(buffer);
 if(b.length<33)throw Error('File terlalu kecil untuk DBF.');
 const count=v.getUint32(4,true),headerLen=v.getUint16(8,true),recordLen=v.getUint16(10,true);
 if(headerLen<33||recordLen<2||headerLen>b.length)throw Error('Header DBF tidak valid.');
 const fields=[];let fieldBytes=0;
 for(let p=32;p<headerLen-1&&b[p]!==0x0d;p+=32){
  if(p+32>headerLen)throw Error('Deskripsi field DBF terpotong.');
  let end=p;while(end<p+11&&b[end])end++;
  const name=new TextDecoder('ascii').decode(b.slice(p,end));
  const field={name,type:String.fromCharCode(b[p+11]),length:b[p+16],decimals:b[p+17],raw:b.slice(p,p+32)};
  if(!field.name||!field.length)throw Error('Deskripsi kolom DBF tidak lengkap.');
  fields.push(field);fieldBytes+=field.length;
 }
 if(!fields.length||fieldBytes+1>recordLen)throw Error('Struktur kolom tidak sesuai panjang record DBF.');
 const available=Math.floor((b.length-headerLen)/recordLen);
 if(count>available)throw Error('Jumlah record pada header melebihi isi file.');
 const records=[],decoder=new TextDecoder('windows-1252');
 for(let i=0,p=headerLen;i<count&&p+recordLen<=b.length;i++,p+=recordLen){
  if(b[p]===0x2a)continue;
  let q=p+1,obj={};
  for(const f of fields){
   // File NPTRANS lama memakai byte NUL sebagai padding pada field numerik.
   const raw=decoder.decode(b.slice(q,q+f.length)).replace(/\u0000/g,'').trim();q+=f.length;
   let val=raw;
   if(f.type==='N'||f.type==='F'){
    if(raw==='')val=0;
    else {const n=Number(raw);val=Number.isFinite(n)?n:NaN}
   }else if(f.type==='D'&&/^\d{8}$/.test(raw))val=raw;
   else if(f.type==='L')val=/^(T|Y)$/i.test(raw);
   obj[f.name]=val;
  }
  records.push(obj);
 }
 return {fields,records,recordCount:count,activeCount:records.length,deletedCount:count-records.length,headerLen,recordLen,version:b[0]};
}
function dbfToNp(parsed){return parsed.records.map((r,i)=>{const o={};for(const k of Object.keys(r))o[norm(k)]=r[k];return {sandi:String(o.SANDI??''),tanggal:normalizeDate(o.TANGGAL),nobukti:String(o.NOBUKTI??''),nourut:String(o.NOURUT??''),ket:String(o.KET??''),jumlah:typeof o.JUMLAH==='number'?o.JUMLAH:parseAmount(o.JUMLAH),_row:i+1}})}
function downloadBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function csvCell(v){const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function npRowsAoa(){return [['SANDI','TANGGAL','NOBUKTI','NOURUT','KET','JUMLAH'],...state.nptrans.map(r=>[r.sandi,r.tanggal,r.nobukti,r.nourut,r.ket,r.jumlah])]}
function exportNpCsv(){const rows=[['SANDI','TANGGAL','NOBUKTI','NOURUT','KET','JUMLAH'],...state.nptrans.map(r=>[r.sandi,r.tanggal,r.nobukti,r.nourut,r.ket,r.jumlah])];downloadBlob(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'NPTRANS-export.csv')}
function exportNpXlsx(){exportXlsxSheet('NPTRANS-export.xlsx','NPTRANS',npRowsAoa())}
function fieldValue(row,field){const name=norm(field.name);let value='';if(name==='SANDI')value=row.sandi;else if(name==='TANGGAL')value=row.tanggal;else if(name==='NOBUKTI')value=row.nobukti;else if(name==='NOURUT')value=row.nourut;else if(name==='KET')value=row.ket;else if(name==='JUMLAH')value=row.jumlah;return value}
function exportDbf(){if(!state.npTemplate?.fields?.length){setMessage('np-message','Ekspor DBF belum tersedia: unggah file NPTRANS.DBF asli terlebih dahulu agar struktur field tidak ditebak.','bad');return}const fields=state.npTemplate.fields,headerLen=32+fields.length*32+1,recordLen=1+fields.reduce((s,f)=>s+f.length,0),count=state.nptrans.length,buffer=new ArrayBuffer(headerLen+recordLen*count+1),b=new Uint8Array(buffer),v=new DataView(buffer);b[0]=state.npTemplate.version||0x03;const now=new Date();b[1]=now.getFullYear()-1900;b[2]=now.getMonth()+1;b[3]=now.getDate();v.setUint32(4,count,true);v.setUint16(8,headerLen,true);v.setUint16(10,recordLen,true);let p=32;for(const f of fields){const name=new TextEncoder().encode(f.name);b.set(name.slice(0,11),p);b[p+11]=f.type.charCodeAt(0);b[p+16]=f.length;b[p+17]=f.decimals||0;b.set(f.raw.slice(18,32),p+18);p+=32}b[p]=0x0d;p++;const enc=new TextEncoder();for(const row of state.nptrans){b[p]=0x20;p++;for(const f of fields){let val=fieldValue(row,f),out='';if(f.type==='C'){out=String(val??'').slice(0,f.length).padEnd(f.length,' ')}else if(f.type==='N'||f.type==='F'){const n=Number(val||0);out=Number.isFinite(n)?(f.decimals? n.toFixed(f.decimals):String(Math.trunc(n))):'';out=out.slice(-f.length).padStart(f.length,' ')}else if(f.type==='D'){let s=String(val||'').trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const [dd,mm,yyyy]=s.split('/');s=yyyy+mm+dd}else if(/^\d{4}-\d\d-\d\d$/.test(s))s=s.replace(/-/g,'');else s=s.replace(/[^0-9]/g,'');out=(s.length===8?s:'        ').padEnd(f.length,' ')}else if(f.type==='L'){out=val?'T':'F'}else{out=''.padEnd(f.length,' ')}const bytes=enc.encode(out);b.set(bytes.slice(0,f.length),p);if(bytes.length<f.length){for(let k=bytes.length;k<f.length;k++)b[p+k]=0x20}p+=f.length}}b[p]=0x1a;downloadBlob(new Blob([buffer],{type:'application/octet-stream'}),'NPTRANS.DBF');setMessage('np-message','File NPTRANS.DBF berhasil dibuat berdasarkan struktur template yang diunggah. Tetap uji pada salinan program NPTRANS lama.','good')}
let npPage=1;const NP_PAGE_SIZE=100;
function renderNptrans(){
 const q=($('np-search')?.value||'').trim().toLowerCase();
 const filtered=state.nptrans.filter(r=>[r.sandi,r.tanggal,r.nobukti,r.nourut,r.ket,String(r.jumlah)].join(' ').toLowerCase().includes(q));
 const missing=filtered.filter(r=>!state.accounts.some(a=>a.code===r.sandi)).length;
 const bad=filtered.filter(r=>!r.sandi||!r.nobukti||!Number.isFinite(Number(r.jumlah))).length;
 const total=state.nptrans.reduce((s,r)=>s+(Number(r.jumlah)||0),0);
 $('np-summary').textContent=state.nptrans.length.toLocaleString('id-ID')+' baris tersimpan · '+missing.toLocaleString('id-ID')+' kode akun belum cocok pada hasil filter · '+bad+' baris perlu diperiksa';
 if($('np-total'))$('np-total').textContent=money(total);
 const pages=Math.max(1,Math.ceil(filtered.length/NP_PAGE_SIZE));npPage=Math.min(npPage,pages);
 const slice=filtered.slice((npPage-1)*NP_PAGE_SIZE,npPage*NP_PAGE_SIZE);
 $('np-rows').innerHTML=slice.length?slice.map(r=>{const ok=state.accounts.some(a=>a.code===r.sandi);return '<tr><td>'+esc(r.sandi)+'</td><td>'+esc(r.tanggal)+'</td><td>'+esc(r.nobukti)+'</td><td>'+esc(r.nourut)+'</td><td class="np-ket">'+esc(r.ket)+'</td><td class="np-amount">'+money(r.jumlah)+'</td><td><span class="tag '+(ok?'np-ok':'np-warn')+'">'+(ok?'AKUN COCOK':'CEK AKUN')+'</span></td></tr>'}).join(''):'<tr><td colspan="7" class="empty">Tidak ada data yang cocok dengan pencarian.</td></tr>';
 if($('np-page-info'))$('np-page-info').textContent=filtered.length?('Menampilkan '+((npPage-1)*NP_PAGE_SIZE+1)+'–'+Math.min(npPage*NP_PAGE_SIZE,filtered.length)+' dari '+filtered.length.toLocaleString('id-ID')+' baris'):'0 baris';
 if($('np-prev'))$('np-prev').disabled=npPage<=1;
 if($('np-next'))$('np-next').disabled=npPage>=pages;
 $('template-status').textContent=state.npTemplate?'Template tersimpan: '+state.npTemplate.fields.map(f=>f.name).join(', '):'Belum ada template DBF.';
}
function isoNpDate(value){const s=String(value||'').trim();let m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m)return m[3]+'-'+m[2]+'-'+m[1];if(/^\d{4}-\d\d-\d\d$/.test(s))return s;return new Date().toISOString().slice(0,10)}
function nextNpJournalNumber(date){const stamp=String(date||'').replace(/-/g,'');let n=1;while(state.journals.some(j=>j.number==='NP-'+stamp+'-'+String(n).padStart(3,'0')))n++;return 'NP-'+stamp+'-'+String(n).padStart(3,'0')}
function createNpDraftJournals(rows){
 const groups=new Map();
 for(const row of rows){
  if(row._journalId)continue;
  const date=isoNpDate(row.tanggal),sourceNo=String(row.nobukti||'').trim();
  const key=date+'|'+sourceNo;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 let created=0,linked=0;
 for(const [key,items] of groups){
  const date=key.split('|')[0],sourceNo=key.slice(date.length+1);if(!periodGuard(date.slice(0,7),'membentuk Draft dari NPTRANS'))continue;
  // If an earlier import already created this source draft, link legacy rows to it instead of duplicating it.
  let journal=state.journals.find(j=>j.status==='draft'&&j.source==='NPTRANS'&&j.date===date&&String(j.sourceVoucher||'')===sourceNo);
  if(journal){
   items.forEach(r=>r._journalId=journal.id);
   linked+=items.length;
   continue;
  }
  const id=crypto.randomUUID();
  journal={id,date,number:nextNpJournalNumber(date),description:'Import NPTRANS · '+(sourceNo||'Tanpa nomor bukti'),status:'draft',source:'NPTRANS',sourceVoucher:sourceNo,lines:items.map(r=>({code:String(r.sandi||'').trim(),note:String(r.ket||'')+' | JUMLAH sumber: '+money(r.jumlah)+' | Urut: '+String(r.nourut||''),debit:0,credit:0})),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.journals.push(journal);
  items.forEach(r=>r._journalId=id);
  created++;
 }
 return {created,linked};
}
function npKey(r){return [r.sandi,r.tanggal,r.nobukti,r.nourut,r.ket,Number(r.jumlah).toFixed(2)].map(v=>String(v??'').trim().toUpperCase()).join('|')}
function cancelNpImport(){pendingNpImport=null;$('np-import-review').hidden=true;$('np-file').value='';setMessage('np-message','Pratinjau impor dibatalkan. Data yang sudah tersimpan tidak berubah.')}
$('np-import-cancel').onclick=cancelNpImport;
$('np-file').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  let rows,p=null;
  if(f.name.toLowerCase().endsWith('.dbf')){p=parseDBF(await f.arrayBuffer());rows=dbfToNp(p)}
  else if(/\.xlsx?$/i.test(f.name))rows=csvToNp(xlsxFirstSheetToCsv(await f.arrayBuffer()));
  else rows=csvToNp(await f.text());
  const valid=rows.filter(r=>r.sandi&&r.nobukti&&Number.isFinite(Number(r.jumlah))),rejected=rows.length-valid.length;
  const mode=$('np-import-mode').value;
  const existing=new Set(state.nptrans.map(npKey)),incoming=new Set();let duplicates=0;
  if(mode==='merge'){for(const row of valid){const k=npKey(row);if(existing.has(k)||incoming.has(k))duplicates++;else incoming.add(k)}}
  pendingNpImport={fileName:f.name,rows:valid,parsed:p,rejected,mode,duplicates,totalRead:rows.length};
  const modeName={merge:'Gabungkan tanpa duplikat',append:'Tambah semua baris',replace:'Ganti seluruh data NPTRANS'}[mode];
  $('np-import-review-title').textContent='Pratinjau: '+f.name;
  $('np-import-review-detail').textContent='Mode: '+modeName+' · Dibaca '+rows.length+' record · Valid '+valid.length+' · Duplikat yang akan dilewati '+(mode==='merge'?duplicates:0)+' · Ditolak '+rejected+'. Belum ada data yang disimpan.';
  $('np-import-review').hidden=false;
  setMessage('np-message','File berhasil dibaca. Periksa ringkasan di bawah, lalu tekan “Setujui & masukkan data” untuk melanjutkan.','good');
 }catch(err){pendingNpImport=null;$('np-import-review').hidden=true;setMessage('np-message','Pembacaan file gagal: '+err.message,'bad')}finally{$('np-file').value=''}
};
$('np-import-confirm').onclick=async()=>{
 if(!pendingNpImport){setMessage('np-message','Tidak ada file yang menunggu persetujuan.','bad');return}
 if(!requireImportPassword('Import Data NPTRANS'))return;
 const batch=pendingNpImport;if(batch.rows.some(r=>isPeriodLocked(String(isoNpDate(r.tanggal)).slice(0,7)))){setMessage('np-message','Import diblokir: data berisi tanggal pada periode yang sudah ditutup.','bad');return}
 try{
  let added=0,skipped=0,importedRows=[];
  if(batch.mode==='replace'){
   if(!confirm('PERINGATAN: Ganti seluruh '+state.nptrans.length+' baris NPTRANS yang tersimpan dengan '+batch.rows.length+' baris dari '+batch.fileName+'?'))return;
   state.nptrans=batch.rows.slice();importedRows=state.nptrans.slice();added=batch.rows.length;
  }else if(batch.mode==='append'){state.nptrans.push(...batch.rows);importedRows=batch.rows.slice();added=batch.rows.length}
  else{
   const seen=new Set(state.nptrans.map(npKey));
   for(const row of batch.rows){const k=npKey(row);if(seen.has(k)){skipped++;continue}seen.add(k);state.nptrans.push(row);importedRows.push(row);added++}
  }
  if(batch.parsed)state.npTemplate={fields:batch.parsed.fields,version:batch.parsed.version};
  const missingAccounts=syncNptransSandis();const draftResult=createNpDraftJournals(importedRows);const draftCreated=draftResult.created;await persist();pendingNpImport=null;$('np-import-review').hidden=true;npPage=1;renderAccounts();renderNptrans();renderJournals();
  setMessage('np-message','Persetujuan berhasil. File '+batch.fileName+' · dibaca '+batch.totalRead+' · ditambahkan '+added+' · duplikat dilewati '+skipped+' · ditolak '+batch.rejected+' · total tersimpan '+state.nptrans.length+' · SANDI baru ditambahkan ke master akun dengan nama kosong: '+missingAccounts+' · draft jurnal otomatis dibuat: '+draftCreated+'. Buka Daftar Jurnal, pilih Edit, lalu tentukan debit/kredit sebelum posting.','good');
  toast('Impor massal disetujui: '+added+' baris ditambahkan.');if(draftCreated>0){go('journal-list');toast(draftCreated+' draft jurnal siap dilengkapi debit/kredit.')}
 }catch(err){setMessage('np-message','Penyimpanan impor gagal: '+err.message,'bad')}
};
$('np-template').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!requireImportPassword('Memuat Template DBF NPTRANS')){e.target.value='';return}try{const p=parseDBF(await f.arrayBuffer());state.npTemplate={fields:p.fields,version:p.version};await persist();renderNptrans();setMessage('np-message','Struktur template DBF berhasil dibaca: '+p.fields.map(x=>x.name+'('+x.type+','+x.length+')').join(' · '),'good')}catch(err){setMessage('np-message','Template gagal dibaca: '+err.message,'bad')}e.target.value=''};
function accountTemplateRows(){return [['SANDI','NAMA'],['114.130.2','Persediaan Barang'],['114.140.2','Persediaan Bahan Baku'],['716.100.','Biaya Operasional']]}
function exportAccountTemplateCsv(){const rows=accountTemplateRows();downloadBlob(new Blob(['\\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\\r\\n')],{type:'text/csv;charset=utf-8'}),'Format-Import-Master-Akun-SBP.csv')}
function exportAccountTemplateXlsx(){exportXlsxSheet('Format-Import-Master-Akun-SBP.xlsx','Master Akun',accountTemplateRows())}
$('download-account-template-csv').onclick=exportAccountTemplateCsv;
$('download-account-template-xlsx').onclick=exportAccountTemplateXlsx;
let selectedAccountFile=null;
$('account-file').onchange=e=>{
 selectedAccountFile=e.target.files?.[0]||null;
 $('import-account-button').disabled=!selectedAccountFile;
 $('account-import-status').textContent=selectedAccountFile?'File dipilih: '+selectedAccountFile.name+'. Tekan tombol Import Master Akun untuk memproses.':'Belum ada file master akun dipilih.';
};
$('import-account-button').onclick=async()=>{
 const f=selectedAccountFile;if(!f)return;
 if(!requireImportPassword('Import Master Akun'))return;
 const status=$('account-import-status');
 $('import-account-button').disabled=true;
 if(status)status.textContent='Membaca '+f.name+'...';
 try{
  let accounts=[];
  if(f.name.toLowerCase().endsWith('.dbf')){
   const p=parseDBF(await f.arrayBuffer());
   const fields=p.fields.map(x=>norm(x.name));
   if(!fields.includes('SANDI'))throw Error('Kolom SANDI tidak ditemukan pada DBF. Kolom terbaca: '+fields.join(', '));
   accounts=p.records.map((r,index)=>{
    const o={};Object.keys(r).forEach(k=>o[norm(k)]=r[k]);
    const code=String(o.SANDI??o.KODE??'').trim();
    return {code,name:String(o.DES??o.NAMA??o.NAMAAKUN??o.KET??'').trim(),_row:index+1};
   }).filter(a=>a.code);
  }else{
   accounts=/\.xlsx?$/i.test(f.name)?xlsxToAccounts(await f.arrayBuffer()):csvToAccounts(await f.text());
  }
  if(!accounts.length)throw Error('File terbaca tetapi tidak ditemukan akun dengan SANDI yang terisi.');
  const map=new Map(state.accounts.map(a=>[String(a.code),a]));let added=0,updated=0;
  accounts.forEach(a=>{
   if(!a.code) return;
   if(map.has(a.code)){const current=map.get(a.code);Object.assign(current,a);updated++}
   else{delete a._row;map.set(a.code,a);added++}
  });
  state.accounts=[...map.values()];
  await persist();renderAccounts();renderNptrans();
  const msg='Master akun berhasil diimpor: '+accounts.length+' record terbaca, '+added+' akun baru, '+updated+' akun diperbarui. Semua akun dalam file diproses, tidak harus sudah digunakan NPTRANS.';
  if(status)status.textContent=msg;
  toast('Import master akun berhasil.');
 }catch(err){
  const msg='Import master akun gagal: '+err.message;
  if(status)status.textContent=msg;
  toast(msg);
 }finally{$('account-file').value='';selectedAccountFile=null;$('import-account-button').disabled=true}
};
$('clear-np-data').onclick=async()=>{
 const count=state.nptrans.length;
 const linkedDrafts=state.journals.filter(j=>j.status==='draft'&&j.source==='NPTRANS').length;
 if(!count&&!linkedDrafts){setMessage('np-message','Tidak ada data NPTRANS yang perlu dibersihkan.','');return}
 const ok=confirm('BERSIHKAN DATA NPTRANS?\\n\\nData transaksi NPTRANS ('+count+' baris) dan draft jurnal hasil impor NPTRANS ('+linkedDrafts+' jurnal) akan dihapus.\\n\\nMaster akun, jurnal manual/terposting, dan template DBF tidak akan dihapus. Tindakan ini tidak dapat dibatalkan. Lanjutkan?');
 if(!ok)return;
 state.nptrans=[];
 state.journals=state.journals.filter(j=>!(j.status==='draft'&&j.source==='NPTRANS'));
 pendingNpImport=null;
 $('np-import-review').hidden=true;
 $('np-file').value='';
 npPage=1;
 await persist();
 renderNptrans();
 renderJournals();
 renderDashboard();
 setMessage('np-message','Data NPTRANS berhasil dibersihkan. '+count+' baris transaksi dan '+linkedDrafts+' draft jurnal NPTRANS dihapus. Master akun, jurnal manual/terposting, dan template DBF tetap dipertahankan.','good');
 toast('Data NPTRANS berhasil dibersihkan.');
};
$('np-search').addEventListener('input',()=>{npPage=1;renderNptrans()});$('np-prev').onclick=()=>{npPage=Math.max(1,npPage-1);renderNptrans()};$('np-next').onclick=()=>{npPage++;renderNptrans()};$('export-np-csv').onclick=exportNpCsv;$('export-np-xlsx').onclick=exportNpXlsx;$('export-np-dbf').onclick=exportDbf;

function getTrialBalanceRows(period){
 const openingMap=new Map((state.openingBalances||[]).filter(x=>x.period===period).map(x=>[String(x.accountCode),{debit:Number(x.debit||0),credit:Number(x.credit||0)}])),movement=new Map();
 state.journals.filter(j=>(j.status==='posted'||(!j.status&&j.status!=='draft'))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).forEach(l=>{const v=movement.get(String(l.code))||{debit:0,credit:0};v.debit+=Number(l.debit||0);v.credit+=Number(l.credit||0);movement.set(String(l.code),v)}));
 const codes=new Set([...state.accounts.map(a=>String(a.code)),...openingMap.keys(),...movement.keys()]);
 return [...codes].sort((a,b)=>a.localeCompare(b)).map(code=>{const account=state.accounts.find(a=>String(a.code)===code),opening=openingMap.get(code)||{debit:0,credit:0},netOpening=opening.debit-opening.credit,move=movement.get(code)||{debit:0,credit:0},net=netOpening+move.debit-move.credit;return {code,name:account?.name||'(Akun tidak ditemukan)',openingDebit:Math.max(netOpening,0),openingCredit:Math.max(-netOpening,0),debit:move.debit,credit:move.credit,endingDebit:Math.max(net,0),endingCredit:Math.max(-net,0),balance:net}});
}
function ledgerOpeningNet(period,account){const record=(state.openingBalances||[]).find(x=>x.period===period&&String(x.accountCode)===String(account.code));return record?Number(record.debit||0)-Number(record.credit||0):0}
function getLedgerTransactions(period,code){
 const account=state.accounts.find(a=>String(a.code)===String(code));if(!account)return null;
 const openingNet=ledgerOpeningNet(period,account),rows=[{date:period+'-01',number:'SALDO AWAL',description:'Saldo awal periode',debit:Math.max(openingNet,0),credit:Math.max(-openingNet,0),kind:'opening'}];
 state.journals.filter(j=>(j.status==='posted'||(!j.status&&j.status!=='draft'))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).filter(l=>String(l.code)===String(code)).forEach(l=>rows.push({date:String(j.date||''),number:String(j.number||''),description:String(j.description||'')+(l.note?' · '+l.note:''),debit:Number(l.debit||0),credit:Number(l.credit||0),kind:'movement'})));
 rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.kind==='opening'?-1:b.kind==='opening'?1:0)||a.number.localeCompare(b.number));
 let balance=0;rows.forEach(r=>{balance+=r.debit-r.credit;r.balance=balance;r.balanceDebit=Math.max(balance,0);r.balanceCredit=Math.max(-balance,0)});return {account,rows,openingNet,endingNet:balance};
}
function renderLedger(){
 const period=$('ledger-period').value,select=$('ledger-account'),current=select.value;
 select.innerHTML='<option value="">Pilih akun</option>'+state.accounts.slice().sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=>'<option value="'+esc(a.code)+'">'+esc(a.code)+' · '+esc(a.name||'(Tanpa nama)')+'</option>').join('');
 if(current)select.value=current;
 const code=select.value;if(!period||!code){$('ledger-summary').innerHTML='';$('ledger-content').innerHTML='<div class="empty">Pilih periode dan akun untuk menampilkan buku besar.</div>';return}
 const result=getLedgerTransactions(period,code);if(!result)return;
 const movements=result.rows.filter(r=>r.kind==='movement'),debit=movements.reduce((n,r)=>n+r.debit,0),credit=movements.reduce((n,r)=>n+r.credit,0);
 $('ledger-summary').innerHTML='<div><span>Akun</span><b>'+esc(result.account.code)+' · '+esc(result.account.name)+'</b></div><div><span>Saldo awal</span><b>'+money(result.openingNet)+'</b></div><div><span>Mutasi debit</span><b>'+money(debit)+'</b></div><div><span>Mutasi kredit</span><b>'+money(credit)+'</b></div><div><span>Saldo akhir</span><b>'+money(result.endingNet)+'</b></div>';
 $('ledger-content').innerHTML='<table><thead><tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo Debit</th><th>Saldo Kredit</th></tr></thead><tbody>'+result.rows.map(r=>'<tr><td>'+esc(r.kind==='opening'?'Awal periode':fmtDate(r.date))+'</td><td><b>'+esc(r.number)+'</b></td><td>'+esc(r.description)+'</td><td class="num">'+(r.debit?money(r.debit):'—')+'</td><td class="num">'+(r.credit?money(r.credit):'—')+'</td><td class="num">'+(r.balanceDebit?money(r.balanceDebit):'—')+'</td><td class="num">'+(r.balanceCredit?money(r.balanceCredit):'—')+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="3">TOTAL MUTASI</th><th>'+money(debit)+'</th><th>'+money(credit)+'</th><th colspan="2">Saldo akhir: '+money(result.endingNet)+'</th></tr></tfoot></table>';
}
function exportLedgerXlsx(){
 const period=$('ledger-period').value,code=$('ledger-account').value,result=getLedgerTransactions(period,code);if(!result){toast('Pilih akun dan periode terlebih dahulu.');return}
 const rows=[['BUKU BESAR',result.account.code,result.account.name],['PERIODE',period],[],['TANGGAL','NO BUKTI','KETERANGAN','DEBIT','KREDIT','SALDO DEBIT','SALDO KREDIT'],...result.rows.map(r=>[r.kind==='opening'?'SALDO AWAL':r.date,r.number,r.description,r.debit,r.credit,r.balanceDebit,r.balanceCredit])];
 exportXlsxSheet('Buku-Besar-'+code+'-'+period+'.xlsx','Buku Besar',rows);
}
$('ledger-period').value=new Date().toISOString().slice(0,7);
$('ledger-period').addEventListener('change',renderLedger);
$('ledger-account').addEventListener('change',renderLedger);
$('ledger-refresh').onclick=renderLedger;
$('ledger-print').onclick=()=>{go('ledger');window.print()};
$('ledger-export').onclick=exportLedgerXlsx;

function exportTrialBalanceXlsx(){const period=$('report-period').value,rows=getTrialBalanceRows(period);const data=[['PERIODE',period],[],['SANDI','NAMA AKUN','SALDO AWAL DEBIT','SALDO AWAL KREDIT','MUTASI DEBIT','MUTASI KREDIT','SALDO AKHIR DEBIT','SALDO AKHIR KREDIT','SALDO BERSIH D/(K)'],...rows.map(r=>[r.code,r.name,r.openingDebit,r.openingCredit,r.debit,r.credit,r.endingDebit,r.endingCredit,r.balance])];exportXlsxSheet('Neraca-Percobaan-'+period+'.xlsx','Neraca Percobaan',data)}
function renderTrialBalance(){const period=$('report-period').value,rows=getTrialBalanceRows(period);const td=rows.reduce((n,r)=>n+r.openingDebit+r.debit,0),tc=rows.reduce((n,r)=>n+r.openingCredit+r.credit,0),ed=rows.reduce((n,r)=>n+r.endingDebit,0),ec=rows.reduce((n,r)=>n+r.endingCredit,0);$('trial-balance').innerHTML=rows.length?'<div class="trial-period-note">Periode '+esc(period)+' · Saldo awal hanya dari Daftar Saldo Awal ACC & Program. Mutasi hanya dari jurnal berstatus Posted pada periode ini.</div><div class="table-wrap"><table><thead><tr><th>SANDI</th><th>Nama akun</th><th>Saldo awal D</th><th>Saldo awal K</th><th>Mutasi D</th><th>Mutasi K</th><th>Saldo akhir D</th><th>Saldo akhir K</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td>'+money(r.openingDebit)+'</td><td>'+money(r.openingCredit)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td><td>'+money(r.endingDebit)+'</td><td>'+money(r.endingCredit)+'</td></tr>').join('')+'<tr><th colspan="2">TOTAL</th><th>'+money(rows.reduce((n,r)=>n+r.openingDebit,0))+'</th><th>'+money(rows.reduce((n,r)=>n+r.openingCredit,0))+'</th><th>'+money(rows.reduce((n,r)=>n+r.debit,0))+'</th><th>'+money(rows.reduce((n,r)=>n+r.credit,0))+'</th><th>'+money(ed)+'</th><th>'+money(ec)+'</th></tr></tbody></table></div><p class="trial-balance-check">Selisih saldo akhir: <b class="'+(Math.abs(ed-ec)<.005?'balance-ok':'balance-warn')+'">'+money(ed-ec)+'</b></p>':'<div class="empty">Belum ada saldo awal atau jurnal untuk periode ini.</div>'}
$('report-period').value=new Date().toISOString().slice(0,7);
$('report-period').addEventListener('change',renderTrialBalance);

$('force-delete-mode').addEventListener('change',()=>{const mode=$('force-delete-mode').value,input=$('force-delete-value'),label=$('force-delete-value-label');input.type=mode==='date'?'date':mode==='month'?'month':'number';if(mode==='year'){input.min='1900';input.max='2200';input.step='1';input.placeholder='YYYY';input.value=''}else{input.removeAttribute('min');input.removeAttribute('max');input.removeAttribute('step');input.value=''}label.firstChild.textContent=mode==='date'?'Tanggal':mode==='month'?'Bulan':'Tahun'});
function journalDeleteMatches(mode,value){
 return state.journals.filter(j=>{const d=String(j.date||'');if(mode==='date')return d===value;if(mode==='month')return d.slice(0,7)===value;return d.slice(0,4)===value});
}
$('force-delete-period').onclick=async()=>{
 const mode=$('force-delete-mode').value,value=$('force-delete-value').value;
 if(!value){toast('Pilih tanggal, bulan, atau tahun yang akan dihapus.');return}
 if(mode==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value)){toast('Format tanggal tidak valid.');return}
 if(mode==='month'&&!/^\d{4}-\d{2}$/.test(value)){toast('Format bulan tidak valid.');return}
 if(mode==='year'&&!/^\d{4}$/.test(value)){toast('Format tahun tidak valid.');return}
 const matches=journalDeleteMatches(mode,value);
 if(!matches.length){toast('Tidak ada jurnal pada periode tersebut.');return}if(matches.some(j=>isPeriodLocked(String(j.date||'').slice(0,7)))){toast('Hapus paksa diblokir: rentang ini mencakup periode yang sudah ditutup. Buka kembali periode dengan otorisasi terlebih dahulu.');return}
 const lines=matches.flatMap(j=>j.lines||[]),debit=lines.reduce((n,l)=>n+Number(l.debit||0),0),credit=lines.reduce((n,l)=>n+Number(l.credit||0),0);
 const password=prompt('Masukkan password untuk menghapus jurnal secara paksa:');
 if(password===null)return;
 if(password!=='PKS123'){toast('Password salah. Jurnal tidak dihapus.');return}
 const detail='HAPUS PAKSA JURNAL\\nRentang: '+value+' ('+mode+')\\nJumlah jurnal: '+matches.length+'\\nBaris transaksi: '+lines.length+'\\nTotal debit: '+money(debit)+'\\nTotal kredit: '+money(credit)+'\\n\\nTindakan ini permanen dan tidak dapat dibatalkan dari aplikasi. Lanjutkan?';
 if(!confirm(detail))return;
 const ids=new Set(matches.map(j=>j.id));state.journals=state.journals.filter(j=>!ids.has(j.id));
 await persist();renderDashboard();renderJournals();renderTrialBalance();
 $('force-delete-result').textContent=matches.length+' jurnal berhasil dihapus untuk '+value+'. Total debit '+money(debit)+'; kredit '+money(credit)+'.';
 toast(matches.length+' jurnal dihapus.');
};

function renderOpeningBalances(){
 const period=$('opening-period').value;const items=(state.openingBalances||[]).filter(x=>x.period===period).sort((a,b)=>String(a.accountCode).localeCompare(String(b.accountCode)));
 const select=$('opening-account');const current=select.value;select.innerHTML='<option value="">Pilih akun</option>'+state.accounts.slice().sort((a,b)=>a.code.localeCompare(b.code)).map(a=>'<option value="'+esc(a.code)+'">'+esc(a.code)+' · '+esc(a.name||'(Tanpa nama)')+'</option>').join('');if(current)select.value=current;
 const debit=items.reduce((n,x)=>n+Number(x.debit||0),0),credit=items.reduce((n,x)=>n+Number(x.credit||0),0);
 $('opening-summary').innerHTML='<div><span>Jumlah akun</span><b>'+items.length+'</b></div><div><span>Total debit awal</span><b>'+money(debit)+'</b></div><div><span>Total kredit awal</span><b>'+money(credit)+'</b></div><div><span>Selisih</span><b class="'+(Math.abs(debit-credit)<0.005?'balance-ok':'balance-warn')+'">'+money(debit-credit)+'</b></div>';
 $('opening-rows').innerHTML=items.length?items.map((x,i)=>'<tr><td>'+(i+1)+'</td><td><b>'+esc(x.accountCode)+'</b></td><td>'+esc(state.accounts.find(a=>a.code===x.accountCode)?.name||'(Akun tidak ditemukan)')+'</td><td>'+esc(x.note||'')+'</td><td class="num">'+money(x.debit)+'</td><td class="num">'+money(x.credit)+'</td><td><button class="btn opening-edit" data-code="'+esc(x.accountCode)+'">Edit</button> <button class="btn opening-delete" data-code="'+esc(x.accountCode)+'">Hapus</button></td></tr>').join(''):'<tr><td colspan="7" class="empty">Belum ada saldo awal pada periode ini.</td></tr>';
 $('opening-foot').innerHTML='<tr><th colspan="4">TOTAL</th><th>'+money(debit)+'</th><th>'+money(credit)+'</th><th></th></tr>';
 document.querySelectorAll('.opening-edit').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.accountCode===b.dataset.code);if(!x)return;select.value=x.accountCode;$('opening-side').value=Number(x.debit)>0?'debit':'credit';$('opening-amount').value=Number(x.debit)||Number(x.credit)||0;$('opening-note').value=x.note||'';$('opening-save').dataset.edit=b.dataset.code;$('opening-save').textContent='Perbarui Saldo Awal'});
 document.querySelectorAll('.opening-delete').forEach(b=>b.onclick=async()=>{if(!periodGuard(period,'menghapus saldo awal'))return;if(!confirm('Hapus saldo awal akun '+b.dataset.code+' untuk periode '+period+'?'))return;state.openingBalances=state.openingBalances.filter(x=>!(x.period===period&&x.accountCode===b.dataset.code));await persist();renderOpeningBalances();toast('Saldo awal dihapus.')});
}
$('opening-period').value=new Date().toISOString().slice(0,7);
$('opening-period').addEventListener('change',()=>{delete $('opening-save').dataset.edit;$('opening-save').textContent='Simpan Saldo Awal';renderOpeningBalances()});
$('opening-save').addEventListener('click',async()=>{
 const period=$('opening-period').value,code=$('opening-account').value,amount=Number($('opening-amount').value),side=$('opening-side').value,note=$('opening-note').value.trim(),editing=$('opening-save').dataset.edit;
 if(!/^\d{4}-\d{2}$/.test(period)||!code||!state.accounts.some(a=>a.code===code)||!Number.isFinite(amount)||amount<0||(!amount)){toast('Periksa periode, akun, dan nominal saldo awal.');return}
 const existing=(state.openingBalances||[]).find(x=>x.period===period&&x.accountCode===code);
 if(existing&&!editing){toast('Saldo awal akun ini sudah ada pada periode tersebut. Gunakan Edit.');return}
 if(editing&&editing!==code){toast('Untuk mengganti akun, hapus saldo lama lalu tambahkan akun yang benar.');return}
 if(!state.openingBalances)state.openingBalances=[];
 const record={period,accountCode:code,debit:side==='debit'?amount:0,credit:side==='credit'?amount:0,note,updatedAt:new Date().toISOString()};
 if(existing)Object.assign(existing,record);else state.openingBalances.push(record);
 await persist();delete $('opening-save').dataset.edit;$('opening-save').textContent='Simpan Saldo Awal';$('opening-amount').value='';$('opening-note').value='';renderOpeningBalances();toast('Saldo awal berhasil disimpan.');
});
$('opening-print').onclick=()=>window.print();
$('opening-export').onclick=()=>{const p=$('opening-period').value,items=(state.openingBalances||[]).filter(x=>x.period===p);if(!window.XLSX){toast('Modul Excel belum tersedia.');return}const rows=[['Periode',p],[],['SANDI','NAMA AKUN','KETERANGAN','DEBIT AWAL','KREDIT AWAL'],...items.map(x=>[x.accountCode,state.accounts.find(a=>a.code===x.accountCode)?.name||'',x.note||'',Number(x.debit||0),Number(x.credit||0)])];const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Saldo Awal');XLSX.writeFile(wb,'Saldo-Awal-'+p+'.xlsx')};


/* ACCOUNTING PERIOD CONTROL V1 — synchronized with the existing IndexedDB state. */
function currentMonthKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function ensurePeriodControl(){
 if(!state.periodControl||typeof state.periodControl!=='object')state.periodControl={activePeriod:currentMonthKey(),periods:{}};
 if(!state.periodControl.periods||typeof state.periodControl.periods!=='object')state.periodControl.periods={};
 if(!/^\\d{4}-\\d{2}$/.test(String(state.periodControl.activePeriod||'')))state.periodControl.activePeriod=currentMonthKey();
}
function periodRecord(period){ensurePeriodControl();return state.periodControl.periods[period]||{status:'open'}}
function isPeriodLocked(period){return periodRecord(period).status==='closed'}
function periodGuard(period,action='mengubah data'){
 if(!/^\\d{4}-\\d{2}$/.test(String(period||''))){toast('Tanggal/periode tidak valid.');return false}
 if(isPeriodLocked(period)){toast('Periode '+period+' sudah ditutup. Tidak dapat '+action+'. Buka kembali periode dengan otorisasi administrator jika memang diperlukan.');return false}
 return true
}
function periodTotals(period){
 const rows=getTrialBalanceRows(period);
 const debit=rows.reduce((n,r)=>n+Number(r.endingDebit||0),0);
 const credit=rows.reduce((n,r)=>n+Number(r.endingCredit||0),0);
 const drafts=state.journals.filter(j=>String(j.date||'').slice(0,7)===period&&j.status==='draft').length;
 const posted=state.journals.filter(j=>String(j.date||'').slice(0,7)===period&&(j.status==='posted'||(!j.status&&j.status!=='draft'))).length;
 const openings=(state.openingBalances||[]).filter(x=>x.period===period).length;
 return {rows,debit,credit,difference:debit-credit,drafts,posted,openings};
}
function periodLabel(p){const [y,m]=p.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}
function renderPeriodControl(){
 ensurePeriodControl();
 const active=state.periodControl.activePeriod,rec=periodRecord(active),closed=rec.status==='closed';
 $('period-active').value=active;$('period-close-month').value=active;
 $('period-active-badge').textContent=closed?'DITUTUP':'TERBUKA';
 $('period-active-badge').className=closed?'period-closed':'period-open';
 $('period-active-help').textContent=closed?'Periode ini terkunci. Pilih bulan terbuka untuk melanjutkan pembukuan.':'Jurnal dan saldo awal dapat dicatat selama periode belum ditutup.';
 const t=periodTotals(active);
 const checks=[
  ['Saldo akhir debit dan kredit seimbang',Math.abs(t.difference)<0.005,money(t.difference)],
  ['Tidak ada jurnal Draft tersisa',t.drafts===0,t.drafts+' Draft'],
  ['Jurnal terposting',true,t.posted+' jurnal'],
  ['Saldo awal terdaftar',true,t.openings+' saldo awal']
 ];
 $('period-close-checklist').innerHTML='<h4>Pemeriksaan periode '+esc(periodLabel(active))+'</h4><div class="period-check-items">'+checks.map(x=>'<div class="period-check '+(x[1]?'ok':'warn')+'"><span>'+(x[1]?'✓':'!')+'</span><b>'+esc(x[0])+'</b><small>'+esc(x[2])+'</small></div>').join('')+'</div><p class="footnote">Penutupan diblokir jika neraca percobaan tidak seimbang atau masih ada jurnal Draft. Pemeriksaan ini tidak membuat jurnal penutup laba/rugi.</p>';
 const periods=Object.entries(state.periodControl.periods).sort((a,b)=>b[0].localeCompare(a[0]));
 $('period-history-rows').innerHTML=periods.length?periods.map(([p,r])=>'<tr><td><b>'+esc(periodLabel(p))+'</b></td><td><span class="tag '+(r.status==='closed'?'np-warn':'np-ok')+'">'+(r.status==='closed'?'DITUTUP':'TERBUKA')+'</span></td><td>'+esc(r.closedAt?new Date(r.closedAt).toLocaleString('id-ID'):(r.reopenedAt?new Date(r.reopenedAt).toLocaleString('id-ID'):'—'))+'</td><td>'+esc(r.note||r.reopenReason||'—')+'</td><td>'+(r.status==='closed'?'<button class="btn period-reopen" data-period="'+esc(p)+'" type="button">Buka Kembali</button>':'<button class="btn period-activate" data-period="'+esc(p)+'" type="button">Jadikan Aktif</button>')+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">Belum ada periode yang ditutup. Semua periode historis tetap terbuka sampai ditutup secara manual.</td></tr>';
 document.querySelectorAll('.period-activate').forEach(b=>b.onclick=()=>{$('period-active').value=b.dataset.period;setActivePeriod()});
 document.querySelectorAll('.period-reopen').forEach(b=>b.onclick=()=>reopenAccountingPeriod(b.dataset.period));
}
async function setActivePeriod(){
 const p=$('period-active').value;
 if(!/^\\d{4}-\\d{2}$/.test(p)){toast('Pilih periode kerja yang benar.');return}
 if(isPeriodLocked(p)){toast('Periode '+p+' sudah ditutup. Buka kembali terlebih dahulu.');return}
 state.periodControl.activePeriod=p;
 await persist();
 for(const id of ['ledger-period','report-period','opening-period'])if($(id))$(id).value=p;
 renderPeriodControl();
 toast('Periode aktif disinkronkan ke Buku Besar, Neraca Percobaan, dan Saldo Awal: '+periodLabel(p)+'.');
}
async function closeAccountingPeriod(){
 ensurePeriodControl();
 const p=$('period-close-month').value,note=$('period-close-note').value.trim();
 if(!/^\\d{4}-\\d{2}$/.test(p)){toast('Pilih bulan yang akan ditutup.');return}
 if(isPeriodLocked(p)){toast('Periode tersebut sudah ditutup.');return}
 const t=periodTotals(p);
 if(t.drafts){setMessage('period-message','Penutupan diblokir: masih ada '+t.drafts+' jurnal Draft pada periode '+p+'. Posting atau selesaikan Draft terlebih dahulu.','bad');return}
 if(Math.abs(t.difference)>=0.005){setMessage('period-message','Penutupan diblokir: Neraca Percobaan belum seimbang. Selisih '+money(t.difference)+'. Periksa saldo awal dan jurnal terposting.','bad');return}
 if(!confirm('TUTUP BUKU '+periodLabel(p)+'? Data periode akan dikunci dari input, edit, posting, import, dan penghapusan. Laporan tetap dapat dibaca. Pastikan backup sudah diunduh/tersimpan.'))return;
 const password=prompt('Masukkan password administrator untuk menutup buku:');
 if(password===null)return;
 if(password!=='PKS123'){setMessage('period-message','Password salah. Periode tidak ditutup.','bad');return}
 const backup=makeBackupPayload();backup.backupType='pre-period-close';backup.periodBeingClosed=p;
 downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),'SBP-V19-PRE-CLOSE-'+p+'.json');
 const now=new Date().toISOString();
 state.periodControl.periods[p]={status:'closed',closedAt:now,closedBy:'Administrator lokal',note:note||'Tutup buku bulanan',totals:{debit:t.debit,credit:t.credit,difference:t.difference,journals:t.posted,openingRecords:t.openings}};
 state.auditLogs.unshift({id:crypto.randomUUID(),at:now,action:'TUTUP PERIODE',entity:'Periode Akuntansi',entityId:p,summary:'Tutup buku '+p+'; jurnal posted '+t.posted+'; debit '+money(t.debit)+'; kredit '+money(t.credit),before:{status:'open'},after:auditClone(state.periodControl.periods[p])});
 if(state.periodControl.activePeriod===p){const next=new Date(Number(p.slice(0,4)),Number(p.slice(5,7)),1);state.periodControl.activePeriod=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')}
 await persist();renderPeriodControl();setMessage('period-message','Periode '+periodLabel(p)+' berhasil ditutup dan dikunci. Backup sebelum penutupan diunduh; simpan file tersebut di folder backup perusahaan.','good');
}
async function reopenAccountingPeriod(p){
 const reason=prompt('Alasan pembukaan kembali periode '+p+':');
 if(reason===null)return;
 if(!reason.trim()){toast('Alasan wajib diisi.');return}
 const password=prompt('Masukkan password administrator untuk membuka kembali periode:');
 if(password===null)return;
 if(password!=='PKS123'){toast('Password salah. Periode tetap terkunci.');return}
 const old=periodRecord(p),now=new Date().toISOString();
 state.periodControl.periods[p]={...old,status:'open',reopenedAt:now,reopenReason:reason.trim()};
 state.auditLogs.unshift({id:crypto.randomUUID(),at:now,action:'BUKA KEMBALI PERIODE',entity:'Periode Akuntansi',entityId:p,summary:'Periode '+p+' dibuka kembali. Alasan: '+reason.trim(),before:auditClone(old),after:auditClone(state.periodControl.periods[p])});
 await persist();renderPeriodControl();setMessage('period-message','Periode '+periodLabel(p)+' dibuka kembali. Aktivitas ini tercatat di Riwayat Aktivitas.','good');
}
$('period-set-active').addEventListener('click',setActivePeriod);
$('period-close-button').addEventListener('click',closeAccountingPeriod);
$('period-active').addEventListener('change',()=>{const p=$('period-active').value;if(isPeriodLocked(p))toast('Periode tersebut telah ditutup.')});

/* PRINT ENGINE V1 — independent report renderer; does not mutate accounting records. */
const PRINT_SETTINGS_KEY='sbp-print-settings-v1';
const PRINT_DEFAULTS={paper:'F4',orientation:'auto',margin:10,fontSize:8,rowPadding:1.4,brand:true,printedAt:true,footer:true,summary:true,signatures:true,tableLines:true,headerColor:'#eaf2ed'};
let PRINT_CONFIG={...PRINT_DEFAULTS,...(()=>{try{return JSON.parse(localStorage.getItem(PRINT_SETTINGS_KEY)||'{}')}catch{return {}}})()};
function savePrintSettings(){const get=id=>$(id);PRINT_CONFIG={paper:get('print-paper').value,orientation:get('print-orientation').value,margin:Number(get('print-margin').value),fontSize:Number(get('print-font-size').value),rowPadding:Number(get('print-row-padding').value),brand:get('print-brand').checked,printedAt:get('print-date').checked,footer:get('print-footer').checked,summary:get('print-summary').checked,signatures:get('print-signatures').checked,tableLines:get('print-lines').checked,headerColor:get('print-header-color').value};localStorage.setItem(PRINT_SETTINGS_KEY,JSON.stringify(PRINT_CONFIG));toast('Pengaturan template cetak disimpan dan berlaku untuk seluruh laporan.')}
function loadPrintSettings(){const map={'print-paper':'paper','print-orientation':'orientation','print-margin':'margin','print-font-size':'fontSize','print-row-padding':'rowPadding','print-brand':'brand','print-date':'printedAt','print-footer':'footer','print-summary':'summary','print-signatures':'signatures','print-lines':'tableLines','print-header-color':'headerColor'};for(const [id,key] of Object.entries(map)){const el=$(id);if(!el)continue;if(el.type==='checkbox')el.checked=!!PRINT_CONFIG[key];else el.value=PRINT_CONFIG[key]??PRINT_DEFAULTS[key]}}
function resetPrintSettings(){PRINT_CONFIG={...PRINT_DEFAULTS};localStorage.setItem(PRINT_SETTINGS_KEY,JSON.stringify(PRINT_CONFIG));loadPrintSettings();toast('Pengaturan template cetak dikembalikan ke standar.')}
function printMoney(v){return money(Number(v||0))}
function printTable(headers,rows,foot=''){return '<table class="sbp-print-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody>'+(foot?'<tfoot>'+foot+'</tfoot>':'')+'</table>'}
function printSummary(items){return PRINT_CONFIG.summary?'<section class="sbp-print-summary">'+items.map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+'</section>':''}
function printSignatures(){return PRINT_CONFIG.signatures?'<section class="sbp-print-signatures"><div><span>Disiapkan oleh,</span><b></b><small>(........................................)</small></div><div><span>Diperiksa oleh,</span><b></b><small>(........................................)</small></div><div><span>Disetujui oleh,</span><b></b><small>(........................................)</small></div></section>':''}
function printDocument(title,subtitle,body,orientation='portrait'){
 const old=document.getElementById('sbp-print-frame');if(old)old.remove();
 const frame=document.createElement('iframe');frame.id='sbp-print-frame';frame.title='Pratinjau cetak '+title;
 frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';document.body.appendChild(frame);
 const paperMap={A4:'210mm 297mm',F4:'215mm 330mm',Letter:'8.5in 11in',Legal:'8.5in 14in'};
 const pageOrientation=PRINT_CONFIG.orientation==='auto'?orientation:PRINT_CONFIG.orientation;
 const paper=paperMap[PRINT_CONFIG.paper]||paperMap.A4, pageSize=pageOrientation==='landscape'?paper.split(' ').reverse().join(' '):paper;
 const margin=Math.max(5,Math.min(25,Number(PRINT_CONFIG.margin)||10))+'mm';
 const printed=new Date().toLocaleString('id-ID',{dateStyle:'long',timeStyle:'short'});
 const style='@page{size:'+pageSize+';margin:'+margin+'}'+
 '.journal-line-notes{min-width:38mm;white-space:normal;line-height:1.35}.journal-line-note{margin:0 0 1mm;break-inside:avoid}.journal-line-note b{white-space:nowrap}.muted{color:#64748b;font-style:italic}'+ '@page{@bottom-right{content:"Halaman "+counter(page);font:8pt Arial;color:#64748b}}'+
 '*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#17212b;font:'+Number(PRINT_CONFIG.fontSize||8)+'pt Arial,Helvetica,sans-serif}'+
 '.sheet{width:100%}.header{border-bottom:2px solid #176b4a;padding:0 0 5mm;margin-bottom:3mm}'+
 '.brand{font-size:15pt;font-weight:800;letter-spacing:.5px;color:#145c40}.brand small{display:block;font-size:7.5pt;font-weight:500;letter-spacing:1px;color:#64748b;margin-top:1mm}'+
 '.heading{text-align:center;margin-top:3mm}.heading h1{font-size:14pt;margin:0 0 2mm}.heading p{font-size:9pt;margin:0;color:#475569}'+
 '.meta{display:flex;justify-content:space-between;color:#64748b;font-size:8pt;margin:0 0 3mm;padding-bottom:2mm;border-bottom:1px solid #cbd5e1}'+
 '.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2mm;margin:0 0 3mm}.summary>div{border:1px solid #cbd5e1;border-radius:1mm;padding:2mm}'+
 '.summary span{display:block;color:#64748b;font-size:7.5pt;margin-bottom:1mm}.summary b{font-size:9pt}'+
 'table{width:100%;border-collapse:collapse;table-layout:auto;font-size:inherit}thead{display:table-header-group}th{background:'+PRINT_CONFIG.headerColor+'!important;color:#173c2d!important;font-weight:700;text-align:center}'+
 'th,td{'+(PRINT_CONFIG.tableLines?'border:1px solid #aebbb4;':'border:0;')+'padding:'+Math.max(.5,Math.min(4,Number(PRINT_CONFIG.rowPadding)||1.4))+'mm 1.2mm;vertical-align:top}td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}tbody tr{break-inside:avoid;page-break-inside:avoid}tfoot{display:table-row-group;font-weight:700}'+
 '.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;margin:12mm 0 0;text-align:center;break-inside:avoid;page-break-inside:avoid}.signatures span,.signatures small{display:block;font-size:8pt}.signatures b{display:block;height:20mm}'+
 '.footer{border-top:1px solid #cbd5e1;margin-top:6mm;padding-top:2mm;color:#64748b;font-size:7pt;text-align:center}';
 const brand=PRINT_CONFIG.brand?'<div class="brand">SBP ACCOUNTING <small>SISTEM INFORMASI AKUNTANSI · V19</small></div>':'';
 const meta=PRINT_CONFIG.printedAt?'<div class="meta"><span>Dicetak: '+esc(printed)+'</span><span>Dokumen internal</span></div>':'';
 const signatures=PRINT_CONFIG.signatures?'<section class="signatures"><div><span>Disiapkan oleh,</span><b></b><small>(........................................)</small></div><div><span>Diperiksa oleh,</span><b></b><small>(........................................)</small></div><div><span>Disetujui oleh,</span><b></b><small>(........................................)</small></div></section>':'';
 const footer=PRINT_CONFIG.footer?'<footer class="footer">SBP Accounting V19 · Dokumen hasil cetak sistem</footer>':'';
 const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+style+'</style></head><body><main class="sheet"><header class="header">'+brand+'<div class="heading"><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div></header>'+meta+body+signatures+footer+'</main></body></html>');doc.close();
 const cleanup=()=>{frame.remove();window.removeEventListener('afterprint',cleanup)};
 frame.onload=()=>{setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(err){toast('Gagal membuka cetak: '+err.message)}},150)};
 window.addEventListener('afterprint',cleanup,{once:true});
}
function printTrialBalance(){
 const period=$('report-period').value,rows=getTrialBalanceRows(period),d=rows.reduce((n,r)=>n+r.endingDebit,0),c=rows.reduce((n,r)=>n+r.endingCredit,0);
 const body=printSummary([['Periode',period],['Jumlah akun',String(rows.length)],['Total saldo akhir debit',printMoney(d)],['Total saldo akhir kredit',printMoney(c)],['Selisih',printMoney(d-c)]])+printTable(['SANDI','NAMA AKUN','SALDO AWAL D','SALDO AWAL K','MUTASI D','MUTASI K','SALDO AKHIR D','SALDO AKHIR K'],rows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td class="num">'+printMoney(r.openingDebit)+'</td><td class="num">'+printMoney(r.openingCredit)+'</td><td class="num">'+printMoney(r.debit)+'</td><td class="num">'+printMoney(r.credit)+'</td><td class="num">'+printMoney(r.endingDebit)+'</td><td class="num">'+printMoney(r.endingCredit)+'</td></tr>'),'<tr><th colspan="2">TOTAL</th><th class="num">'+printMoney(rows.reduce((n,r)=>n+r.openingDebit,0))+'</th><th class="num">'+printMoney(rows.reduce((n,r)=>n+r.openingCredit,0))+'</th><th class="num">'+printMoney(rows.reduce((n,r)=>n+r.debit,0))+'</th><th class="num">'+printMoney(rows.reduce((n,r)=>n+r.credit,0))+'</th><th class="num">'+printMoney(d)+'</th><th class="num">'+printMoney(c)+'</th></tr>');
 printDocument('NERACA PERCOBAAN','Periode '+period,body,'landscape');
}
function printLedger(){
 const period=$('ledger-period').value,code=$('ledger-account').value,result=getLedgerTransactions(period,code);if(!result){toast('Pilih periode dan akun terlebih dahulu.');return}
 const moves=result.rows.filter(r=>r.kind==='movement'),d=moves.reduce((n,r)=>n+r.debit,0),c=moves.reduce((n,r)=>n+r.credit,0);
 const body=printSummary([['Periode',period],['Akun',result.account.code+' · '+result.account.name],['Saldo awal',printMoney(result.openingNet)],['Mutasi debit',printMoney(d)],['Mutasi kredit',printMoney(c)],['Saldo akhir',printMoney(result.endingNet)]])+printTable(['TANGGAL','NO. BUKTI','KETERANGAN','DEBIT','KREDIT','SALDO DEBIT','SALDO KREDIT'],result.rows.map(r=>'<tr><td>'+esc(r.kind==='opening'?'Awal periode':fmtDate(r.date))+'</td><td>'+esc(r.number)+'</td><td>'+esc(r.description)+'</td><td class="num">'+printMoney(r.debit)+'</td><td class="num">'+printMoney(r.credit)+'</td><td class="num">'+printMoney(r.balanceDebit)+'</td><td class="num">'+printMoney(r.balanceCredit)+'</td></tr>'));
 printDocument('BUKU BESAR PER AKUN','Periode '+period,body,'portrait');
}
function printOpeningBalances(){
 const period=$('opening-period').value,items=(state.openingBalances||[]).filter(x=>x.period===period).sort((a,b)=>String(a.accountCode).localeCompare(String(b.accountCode))),d=items.reduce((n,x)=>n+Number(x.debit||0),0),c=items.reduce((n,x)=>n+Number(x.credit||0),0);
 const body=printSummary([['Periode',period],['Jumlah akun',String(items.length)],['Total debit awal',printMoney(d)],['Total kredit awal',printMoney(c)],['Selisih',printMoney(d-c)]])+printTable(['NO','SANDI','NAMA AKUN','KETERANGAN','DEBIT AWAL','KREDIT AWAL'],items.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.accountCode)+'</td><td>'+esc(state.accounts.find(a=>a.code===x.accountCode)?.name||'(Akun tidak ditemukan)')+'</td><td>'+esc(x.note||'')+'</td><td class="num">'+printMoney(x.debit)+'</td><td class="num">'+printMoney(x.credit)+'</td></tr>'),'<tr><th colspan="4">TOTAL</th><th class="num">'+printMoney(d)+'</th><th class="num">'+printMoney(c)+'</th></tr>');
 printDocument('DAFTAR SALDO AWAL ACC & PROGRAM','Periode '+period,body,'landscape');
}
function printAccounts(){const q=($('account-search')?.value||'').trim().toLowerCase(),items=state.accounts.filter(a=>(a.code+' '+a.name).toLowerCase().includes(q)).sort((a,b)=>a.code.localeCompare(b.code));const body=printSummary([['Jumlah akun',String(items.length)]])+printTable(['NO','KODE / SANDI','NAMA AKUN'],items.map((a,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(a.code)+'</td><td>'+esc(a.name)+'</td></tr>'));printDocument('DAFTAR MASTER AKUN','Daftar kode dan nama akun sesuai filter pencarian aktif',body,'portrait')}
function printJournalList(){
 const q=($('journal-search')?.value||'').toLowerCase().trim(),status=$('journal-status-filter')?.value||'all',items=state.journals.filter(j=>(j.number+' '+j.description+' '+(j.date||'')+' '+(j.lines||[]).map(l=>l.note||'').join(' ')).toLowerCase().includes(q)&&(status==='all'||(status==='draft'?j.status==='draft':j.status!=='draft'))).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const d=items.reduce((n,j)=>n+(j.lines||[]).reduce((s,l)=>s+Number(l.debit||0),0),0),c=items.reduce((n,j)=>n+(j.lines||[]).reduce((s,l)=>s+Number(l.credit||0),0),0);
 const body=printSummary([['Jumlah jurnal',String(items.length)],['Status',status==='all'?'Semua':status==='draft'?'Draft':'Terposting'],['Total debit',printMoney(d)],['Total kredit',printMoney(c)],['Selisih',printMoney(d-c)]])+printTable(['TANGGAL','NO. BUKTI','KETERANGAN','KETERANGAN BARIS','STATUS','JUMLAH BARIS','DEBIT','KREDIT'],items.map(j=>{
  const lines=j.lines||[],jd=lines.reduce((n,l)=>n+Number(l.debit||0),0),jc=lines.reduce((n,l)=>n+Number(l.credit||0),0);
  const lineNotes=lines.map((l,i)=>'<div class="journal-line-note"><b>'+String(i+1)+'. '+esc(l.code||'')+'</b> — '+(String(l.note||'').trim()?esc(l.note):'<span class="muted">Tidak ada keterangan</span>')+'</div>').join('');
  return '<tr><td>'+esc(fmtDate(j.date))+'</td><td>'+esc(j.number)+'</td><td>'+esc(j.description)+'</td><td class="journal-line-notes">'+(lineNotes||'—')+'</td><td>'+(j.status==='draft'?'DRAFT':'TERPOSTING')+'</td><td class="num">'+lines.length+'</td><td class="num">'+printMoney(jd)+'</td><td class="num">'+printMoney(jc)+'</td></tr>';
 }));
 printDocument('DAFTAR JURNAL','Daftar sesuai filter pencarian dan status aktif; keterangan baris ditampilkan per akun',body,'landscape');
}
function printCurrentPage(){
 const active=document.querySelector('.page.active');if(!active){toast('Tidak ada halaman aktif untuk dicetak.');return}
 const id=active.id;
 if(id==='page-reports')return printTrialBalance();
 if(id==='page-ledger')return printLedger();
 if(id==='page-opening-balances')return printOpeningBalances();
 if(id==='page-accounts')return printAccounts();
 if(id==='page-journal-list')return printJournalList();
 toast('Cetak profesional tersedia untuk Daftar Jurnal, Master Akun, Saldo Awal, Buku Besar, dan Neraca Percobaan.');
}
$('print-settings-save').onclick=savePrintSettings;$('print-settings-reset').onclick=resetPrintSettings;$('print-settings-preview').onclick=()=>printDocument('CONTOH TEMPLATE CETAK','Pratinjau pengaturan global',printTable(['TANGGAL','NO. BUKTI','KETERANGAN','DEBIT','KREDIT'],['<tr><td>31/10/2026</td><td>CONTOH/001</td><td>Contoh tampilan dokumen</td><td class="num">Rp 100.000</td><td class="num">Rp 100.000</td></tr>']),'landscape');loadPrintSettings();
$('print-current-page').onclick=printCurrentPage;
$('print-journal-list').onclick=printJournalList;
$('print-accounts').onclick=printAccounts;
$('print-report').onclick=printTrialBalance;
$('opening-print').onclick=printOpeningBalances;
$('ledger-print').onclick=printLedger;
$('export-trial-xlsx').onclick=exportTrialBalanceXlsx;

function renderAuditLogs(){const q=($('audit-search')?.value||'').trim().toLowerCase(),filter=$('audit-action-filter')?.value||'all',items=(state.auditLogs||[]).filter(x=>(x.summary+' '+x.entity+' '+x.entityId+' '+x.action).toLowerCase().includes(q)&&(filter==='all'||x.action===filter)).sort((x,y)=>String(y.at).localeCompare(String(x.at)));$('audit-count').textContent=items.length.toLocaleString('id-ID')+' aktivitas';$('audit-rows').innerHTML=items.length?items.slice(0,500).map(x=>'<tr><td>'+esc(new Date(x.at).toLocaleString('id-ID'))+'</td><td><b>'+esc(x.action)+'</b></td><td>'+esc(x.entity)+'</td><td>'+esc(x.entityId)+'</td><td>'+esc(x.summary)+'</td><td><details><summary>Lihat perubahan</summary><pre class="audit-json">'+esc(JSON.stringify({sebelum:x.before,sesudah:x.after},null,2))+'</pre></details></td></tr>').join(''):'<tr><td colspan="6" class="empty">Belum ada aktivitas yang tercatat.</td></tr>'}
function exportAuditCsv(){const rows=[['WAKTU','AKSI','MODUL','ID DATA','RINGKASAN','SEBELUM','SESUDAH'],...(state.auditLogs||[]).map(x=>[x.at,x.action,x.entity,x.entityId,x.summary,JSON.stringify(x.before??''),JSON.stringify(x.after??'')])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\\r\\n');downloadBlob(new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'SBP-Audit-Log.csv')}
$('audit-search').oninput=renderAuditLogs;$('audit-action-filter').onchange=renderAuditLogs;$('audit-export').onclick=exportAuditCsv;
$('archive-read-file').onchange=e=>loadArchiveReaderFile(e.target.files?.[0]);$('archive-read-mode').onchange=renderArchiveReader;$('archive-read-search').oninput=renderArchiveReader;$('archive-read-period').onchange=renderArchiveReader;$('archive-read-account').onchange=renderArchiveReader;
$('archive-create').onclick=createFiveYearArchive;$('archive-verify').onclick=verifyFiveYearArchive;
$('backup-connect-folder').onclick=connectBackupFolder;$('backup-reconnect-folder').onclick=reconnectBackupFolder;$('backup-now').onclick=()=>runAutomaticBackup('backup manual');$('backup-download').onclick=()=>{const payload=makeBackupPayload();downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'SBP-Accounting-V19-backup.json');setMessage('backup-message','Backup JSON berhasil diunduh. Simpan juga salinannya di media lain.','good')};
$('backup-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!requireImportPassword('Pemulihan / Import Backup')){e.target.value='';return}try{const parsed=JSON.parse(await f.text()),candidate=parsed.state||parsed;if(!Array.isArray(candidate.accounts)||!Array.isArray(candidate.journals)||!Array.isArray(candidate.nptrans))throw Error('Struktur backup tidak dikenali.');if(!confirm('Pulihkan backup? Data lokal saat ini akan digantikan.'))return;const priorAudit=Array.isArray(state.auditLogs)?state.auditLogs:[];state={...emptyState(),...candidate};state.auditLogs=[...new Map([...priorAudit,...(Array.isArray(candidate.auditLogs)?candidate.auditLogs:[])].map(x=>[x.id||JSON.stringify(x),x])).values()].sort((x,y)=>String(y.at).localeCompare(String(x.at)));if(state.npTemplate?.fields)state.npTemplate.fields.forEach(f=>{if(Array.isArray(f.raw))f.raw=new Uint8Array(f.raw)});await persist();renderDashboard();setMessage('backup-message','Backup berhasil dipulihkan.','good');toast('Pemulihan selesai.')}catch(err){setMessage('backup-message','Pemulihan gagal: '+err.message,'bad')}e.target.value=''};

async function init(){await loadState();state.auditLogs=Array.isArray(state.auditLogs)?state.auditLogs:[];ensurePeriodControl();await loadDirectoryHandle();state.accounts=state.accounts.map(a=>({code:String(a.code??'').trim(),name:String(a.name??'')}));syncNptransSandis();auditBaseline=auditClone({accounts:state.accounts,journals:state.journals,nptrans:state.nptrans,openingBalances:state.openingBalances});await persist();resetAccountForm();resetJournalForm();renderDashboard();renderAccounts();renderPeriodControl();if(backupDirectoryHandle){const permission=await directoryPermission(backupDirectoryHandle,false);setMessage('backup-message',permission==='granted'?'Folder backup server terhubung. Backup otomatis aktif setiap ada perubahan data.':'Folder backup pernah dihubungkan, tetapi izinnya perlu diaktifkan kembali. Tekan tombol Hubungkan / Aktifkan Ulang.',''+(permission==='granted'?'good':'bad'))}if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn);setInterval(()=>{if(backupDirectoryHandle&&Date.now()-lastAutoBackupAt>=30*60*1000)runAutomaticBackup('jadwal berkala 30 menit')},60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&backupDirectoryHandle&&Date.now()-lastAutoBackupAt>=30*60*1000)runAutomaticBackup('aplikasi aktif kembali')})}
init();