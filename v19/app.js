/* BUILD V85 — Debit Note module and linked journal workflow */
/* SBP Accounting V19 — browser-only accounting core.
   Local persistence: IndexedDB. DBF export reuses a real source DBF schema as a safety requirement. */
const DB_NAME='sbp-accounting-v19', STORE='app', STATE_KEY='main';
const emptyState=()=>({accounts:[],journals:[],nptrans:[],openingBalances:[],debitNotes:[],auditLogs:[],npTemplate:null,meta:{version:19}});
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
function collectAuditChanges(){if(!auditBaseline){auditBaseline=auditClone({accounts:state.accounts,journals:state.journals,nptrans:state.nptrans,openingBalances:state.openingBalances,debitNotes:state.debitNotes});return}const labels={accounts:'Master Akun',journals:'Jurnal',nptrans:'NPTRANS',openingBalances:'Saldo Awal',debitNotes:'Nota Debet'};for(const type of Object.keys(labels)){const before=Array.isArray(auditBaseline[type])?auditBaseline[type]:[],after=Array.isArray(state[type])?state[type]:[],oldMap=new Map(before.map((x,i)=>[auditKey(type,x,i),x])),newMap=new Map(after.map((x,i)=>[auditKey(type,x,i),x]));for(const [key,row] of newMap){const old=oldMap.get(key);if(!old){state.auditLogs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action:'TAMBAH',entity:labels[type],entityId:key,summary:labels[type]+' ditambahkan: '+key,before:null,after:auditClone(row)});continue}if(JSON.stringify(old)!==JSON.stringify(row))state.auditLogs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action:'UBAH',entity:labels[type],entityId:key,summary:labels[type]+' diubah: '+key,before:auditClone(old),after:auditClone(row)})}for(const [key,row] of oldMap){if(!newMap.has(key))state.auditLogs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action:'HAPUS',entity:labels[type],entityId:key,summary:labels[type]+' dihapus: '+key,before:auditClone(row),after:null})}}if(state.auditLogs.length>10000)state.auditLogs.length=10000;auditBaseline=auditClone({accounts:state.accounts,journals:state.journals,nptrans:state.nptrans,openingBalances:state.openingBalances,debitNotes:state.debitNotes})}
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
 (archiveReadState.journals||[]).filter(j=>(isPostedJournal(j))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).filter(l=>String(l.code)===String(code)).forEach(l=>rows.push({date:String(j.date||''),number:String(j.number||''),description:String(j.description||'')+(l.note?' · '+l.note:''),debit:Number(l.debit||0),credit:Number(l.credit||0),kind:'movement'})));
 rows.sort((x,y)=>x.date.localeCompare(y.date)||(x.kind==='opening'?-1:y.kind==='opening'?1:0)||x.number.localeCompare(y.number));
 let balance=0;rows.forEach(r=>{balance+=r.debit-r.credit;r.bd=Math.max(balance,0);r.bc=Math.max(-balance,0)});
 const debit=rows.filter(x=>x.kind==='movement').reduce((n,x)=>n+x.debit,0),credit=rows.filter(x=>x.kind==='movement').reduce((n,x)=>n+x.credit,0);
 $('archive-read-summary').textContent=acc.code+' · '+acc.name+' | Saldo awal '+archiveReadMoney(netOpen)+' | Mutasi D '+archiveReadMoney(debit)+' | Mutasi K '+archiveReadMoney(credit)+' | Saldo akhir '+archiveReadMoney(balance);
 $('archive-read-table').innerHTML='<table><thead><tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo Debit</th><th>Saldo Kredit</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.number)+'</td><td>'+esc(r.description)+'</td><td>'+archiveReadMoney(r.debit)+'</td><td>'+archiveReadMoney(r.credit)+'</td><td>'+archiveReadMoney(r.bd)+'</td><td>'+archiveReadMoney(r.bc)+'</td></tr>').join('')+'</tbody></table>';
}
function archiveReadTrialBalance(){
 const period=$('archive-read-period').value;if(!period){$('archive-read-summary').textContent='Pilih bulan laporan.';$('archive-read-table').innerHTML='<div class="empty">Periode diperlukan.</div>';return}
 const opening=new Map((archiveReadState.openingBalances||[]).filter(x=>x.period===period).map(x=>[String(x.accountCode),{debit:Number(x.debit||0),credit:Number(x.credit||0)}])),movement=new Map();
 (archiveReadState.journals||[]).filter(j=>(isPostedJournal(j))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).forEach(l=>{const v=movement.get(String(l.code))||{debit:0,credit:0};v.debit+=Number(l.debit||0);v.credit+=Number(l.credit||0);movement.set(String(l.code),v)}));
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

document.querySelectorAll('[data-import-launch]').forEach(button=>button.addEventListener('click',()=>{
 const routes={accounts:{page:'import-center',input:'account-file'},journal:{page:'import-center',input:'bulk-journal-file'},nptrans:{page:'nptrans',input:'np-file'},opening:{page:'import-center',input:'opening-import-file'},backup:{page:'backup',input:'backup-file'}};
 const route=routes[button.dataset.importLaunch];if(!route)return;go(route.page);
 const input=$(route.input);if(input)setTimeout(()=>input.click(),80);
}));

let editingDebitNoteId=null;
function debitNoteNextNumber(date=$('dn-date')?.value||new Date().toISOString().slice(0,10)){const year=String(date).slice(0,4);const nums=(state.debitNotes||[]).map(n=>String(n.number||'')).filter(n=>n.startsWith('ND-'+year+'-')).map(n=>Number(n.split('-').pop())||0);let seq=1;while(nums.includes(seq))seq++;return 'ND-'+year+'-'+String(seq).padStart(5,'0')}

let debitNoteSelectedSources=[];
function debitNoteGroupOptions(){
 const groups=[...new Set(state.accounts.map(a=>String(a.code||'').match(/^(\\d{3})\\.\\d{3}$/)?.[1]).filter(Boolean))].sort();
 $('dn-source-group').innerHTML=groups.map(g=>'<option value="'+g+'.000">'+g+'.000 s.d. '+g+'.800</option>').join('');
 if(groups.includes('719'))$('dn-source-group').value='719.000';
}
function debitNoteSourceMatches(){
 const base=$('dn-source-group').value, prefix=base.split('.')[0];
 const rows=[];
 (state.journals||[]).filter(j=>j.status==='posted').forEach(j=>(j.lines||[]).forEach((l,index)=>{
  const code=String(l.code||''),m=code.match(/^\\d{3}\\.(\\d{3})$/);
  if(!m||code.split('.')[0]!==prefix||Number(m[1])>800)return;
  const account=state.accounts.find(a=>a.code===code)||{};
  rows.push({key:j.id+'::'+index,journalId:j.id,lineIndex:index,journalNumber:j.number||'',date:j.date||'',accountCode:code,accountName:account.name||'',description:j.description||'',note:l.note||'',debit:Number(l.debit)||0,credit:Number(l.credit)||0});
 }));
 return rows.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(a.journalNumber||'').localeCompare(b.journalNumber||''));
}
function searchDebitNoteSources(){
 const rows=debitNoteSourceMatches();
 $('dn-source-rows').innerHTML=rows.length?rows.map((r)=>'<tr><td><input type="checkbox" class="dn-source-check" data-key="'+esc(r.key)+'"></td><td>'+esc(r.date)+'</td><td>'+esc(r.journalNumber)+'</td><td><b>'+esc(r.accountCode)+'</b></td><td>'+esc(r.accountName)+'</td><td>'+esc(r.note||r.description)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td></tr>').join(''):'<tr><td colspan="8" class="empty">Tidak ditemukan transaksi POSTED pada kelompok SANDI '+esc($('dn-source-group').value)+'.</td></tr>';
 setMessage('dn-source-message',rows.length+' baris transaksi POSTED ditemukan pada kelompok '+$('dn-source-group').value+' sampai '+$('dn-source-group').value.split('.')[0]+'.800.','');
}
function addSelectedDebitNoteSources(){
 const selected=[...document.querySelectorAll('.dn-source-check:checked')].map(c=>c.dataset.key),all=debitNoteSourceMatches();
 let added=0;
 selected.forEach(key=>{const row=all.find(x=>x.key===key);if(row&&!debitNoteSelectedSources.some(x=>x.key===key)){debitNoteSelectedSources.push(row);added++}});
 renderDebitNoteSelectedSources();
 setMessage('dn-source-message',added+' transaksi ditambahkan sebagai referensi Nota Debet.','');
}
function renderDebitNoteSelectedSources(){
 $('dn-source-selected').innerHTML=debitNoteSelectedSources.length?debitNoteSelectedSources.map((r,i)=>'<div class="dn-selected-item"><span><b>'+esc(r.journalNumber)+'</b> · '+esc(r.date)+' · '+esc(r.accountCode)+' — '+esc(r.accountName)+'<small>'+esc(r.note||r.description)+' | D '+money(r.debit)+' / K '+money(r.credit)+'</small></span><button type="button" class="icon-btn dn-source-remove" data-index="'+i+'">×</button></div>').join(''):'<span class="empty">Belum ada transaksi yang dipilih.</span>';
 document.querySelectorAll('.dn-source-remove').forEach(b=>b.onclick=()=>{debitNoteSelectedSources.splice(Number(b.dataset.index),1);renderDebitNoteSelectedSources()});
}

function debitNoteAddLine(line={}){const tr=document.createElement('tr');tr.className='dn-entry-row';tr.innerHTML='<td><select class="dn-code">'+accountOptions(line.code||'')+'</select></td><td class="dn-account-name">'+esc((state.accounts.find(a=>a.code===line.code)||{}).name||'')+'</td><td><input class="dn-note" value="'+esc(line.note||'')+'" placeholder="Keterangan baris"></td><td><input class="dn-debit amount" type="number" min="0" step="0.01" value="'+(Number(line.debit)||'')+'" placeholder="0"></td><td><input class="dn-credit amount" type="number" min="0" step="0.01" value="'+(Number(line.credit)||'')+'" placeholder="0"></td><td><button class="icon-btn dn-remove" type="button">×</button></td>';$('dn-lines').appendChild(tr);tr.querySelector('.dn-code').onchange=()=>{tr.querySelector('.dn-account-name').textContent=(state.accounts.find(a=>a.code===tr.querySelector('.dn-code').value)||{}).name||''};tr.querySelectorAll('.dn-debit,.dn-credit').forEach(x=>x.oninput=debitNoteTotals);tr.querySelector('.dn-remove').onclick=()=>{tr.remove();debitNoteTotals()}}
function debitNoteTotals(){const rows=[...document.querySelectorAll('.dn-entry-row')],debit=rows.reduce((s,r)=>s+Number(r.querySelector('.dn-debit').value||0),0),credit=rows.reduce((s,r)=>s+Number(r.querySelector('.dn-credit').value||0),0);$('dn-debit-total').textContent=money(debit);$('dn-credit-total').textContent=money(credit);$('dn-difference').textContent=money(Math.abs(debit-credit));return {rows,debit,credit,diff:Math.abs(debit-credit)}}
function resetDebitNoteForm(){editingDebitNoteId=null;debitNoteSelectedSources=[];renderDebitNoteSelectedSources();$('dn-number').value=debitNoteNextNumber();$('dn-date').value=new Date().toISOString().slice(0,10);$('dn-direction').value='issued';$('dn-kind').value='pembelian_tbs';$('dn-partner').value='';$('dn-reference').value='';$('dn-description').value='';$('dn-lines').innerHTML='';debitNoteAddLine();debitNoteAddLine();debitNoteTotals();$('dn-save').textContent='Simpan Draft';$('dn-post').disabled=false;setMessage('dn-message','Nota Debet siap diisi. Tentukan akun berdasarkan substansi transaksi.','')}
function debitNotePayload(){const tot=debitNoteTotals();return {date:$('dn-date').value,number:$('dn-number').value.trim(),direction:$('dn-direction').value,kind:$('dn-kind').value,partner:$('dn-partner').value.trim(),reference:$('dn-reference').value.trim(),description:$('dn-description').value.trim(),sourceTransactions:debitNoteSelectedSources.map(x=>({...x})),lines:tot.rows.map(r=>({code:r.querySelector('.dn-code').value,note:r.querySelector('.dn-note').value.trim(),debit:Number(r.querySelector('.dn-debit').value||0),credit:Number(r.querySelector('.dn-credit').value||0)}))}}
function renderDebitNotes(){const q=($('dn-search')?.value||'').toLowerCase().trim(),status=$('dn-status')?.value||'all',rows=(state.debitNotes||[]).filter(n=>(status==='all'||n.status===status)&&[n.number,n.partner,n.reference,n.description,n.kind].join(' ').toLowerCase().includes(q)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('dn-rows').innerHTML=rows.length?rows.map((n,i)=>{const total=(n.lines||[]).reduce((s,l)=>s+Math.max(Number(l.debit)||0,Number(l.credit)||0),0),kind={pembelian_tbs:'Pembelian TBS',pembelian_lain:'Pembelian lainnya',penjualan:'Penjualan',biaya:'Biaya',umum:'Umum'}[n.kind]||n.kind;return '<tr><td>'+(i+1)+'</td><td>'+esc(n.date||'')+'</td><td><b>'+esc(n.number)+'</b></td><td>'+esc(kind)+'<br><small>'+(n.direction==='received'?'Diterima':'Diterbitkan')+'</small></td><td>'+esc(n.partner||'')+'</td><td>'+esc(n.reference||'—')+'</td><td>'+money(total)+'</td><td><span class="tag">'+(n.status==='posted'?'POSTED':n.status==='cancelled'?'BATAL':'DRAFT')+'</span></td><td>'+(n.status==='draft'?'<button class="btn dn-edit" data-id="'+esc(n.id)+'">Edit</button> <button class="btn dn-post-row" data-id="'+esc(n.id)+'">Posting</button> <button class="icon-btn dn-cancel-row" data-id="'+esc(n.id)+'">Batal</button>':'<button class="btn dn-view" data-id="'+esc(n.id)+'">Lihat</button>')+'</td></tr>'}).join(''):'<tr><td colspan="9" class="empty">Belum ada Nota Debet.</td></tr>';document.querySelectorAll('.dn-edit').forEach(b=>b.onclick=()=>editDebitNote(b.dataset.id));document.querySelectorAll('.dn-post-row').forEach(b=>b.onclick=()=>postDebitNote(b.dataset.id));document.querySelectorAll('.dn-cancel-row').forEach(b=>b.onclick=()=>cancelDebitNote(b.dataset.id));document.querySelectorAll('.dn-view').forEach(b=>b.onclick=()=>viewDebitNote(b.dataset.id))}
function editDebitNote(id){const n=(state.debitNotes||[]).find(x=>x.id===id);if(!n||n.status!=='draft')return;editingDebitNoteId=id;debitNoteSelectedSources=(n.sourceTransactions||[]).map(x=>({...x}));renderDebitNoteSelectedSources();$('dn-number').value=n.number;$('dn-date').value=n.date;$('dn-direction').value=n.direction;$('dn-kind').value=n.kind;$('dn-partner').value=n.partner;$('dn-reference').value=n.reference;$('dn-description').value=n.description;$('dn-lines').innerHTML='';(n.lines||[]).forEach(l=>debitNoteAddLine(l));if(!n.lines?.length){debitNoteAddLine();debitNoteAddLine()}debitNoteTotals();$('dn-save').textContent='Simpan Perubahan Draft';setMessage('dn-message','Mengedit '+n.number+'.','');window.scrollTo({top:0,behavior:'smooth'})}
async function saveDebitNote(){const p=debitNotePayload();if(!p.date||!p.partner||!p.description){setMessage('dn-message','Tanggal, nama pihak, dan keterangan wajib diisi.','bad');return}if(!periodGuard(p.date.slice(0,7),'menyimpan Nota Debet'))return;const old=(state.debitNotes||[]).find(n=>n.id===editingDebitNoteId);if(old&&old.status!=='draft')return;if(state.debitNotes.some(n=>n.number===p.number&&n.id!==editingDebitNoteId)){setMessage('dn-message','Nomor Nota Debet sudah digunakan.','bad');return}if(p.lines.some(l=>l.debit<0||l.credit<0)){setMessage('dn-message','Nominal tidak boleh negatif.','bad');return}const now=new Date().toISOString(),item={...(old||{}),...p,id:editingDebitNoteId||crypto.randomUUID(),status:'draft',updatedAt:now};if(!old)item.createdAt=now;if(old)state.debitNotes=state.debitNotes.map(n=>n.id===old.id?item:n);else state.debitNotes.push(item);await persist();renderDebitNotes();resetDebitNoteForm();toast('Draft Nota Debet tersimpan.')}
async function postDebitNote(id=editingDebitNoteId){let n=(state.debitNotes||[]).find(x=>x.id===id);if(id===editingDebitNoteId){const p=debitNotePayload();n={...(n||{}),...p}}if(!n||n.status!=='draft')return;if(!periodGuard(String(n.date||'').slice(0,7),'memposting Nota Debet'))return;const lines=n.lines||[],debit=lines.reduce((s,l)=>s+Number(l.debit||0),0),credit=lines.reduce((s,l)=>s+Number(l.credit||0),0);if(!n.partner||!n.description||lines.length<2||lines.some(l=>!l.code||!state.accounts.some(a=>a.code===l.code)||!Number.isFinite(l.debit)||!Number.isFinite(l.credit)||l.debit<0||l.credit<0||(!l.debit&&!l.credit)||(l.debit&&l.credit))){setMessage('dn-message','Periksa pihak, keterangan, akun, dan nominal. Setiap baris harus berisi satu sisi debit atau kredit.','bad');return}if(Math.abs(debit-credit)>.005){setMessage('dn-message','Nota belum seimbang. Selisih '+money(Math.abs(debit-credit))+'.','bad');return}if(!confirm('Posting '+n.number+' dan buat satu jurnal POSTED dengan nomor '+n.number+'? Dokumen dan jurnal saling terhubung.'))return;if(state.journals.some(j=>j.number===n.number)){setMessage('dn-message','Nomor jurnal sudah digunakan.','bad');return}const now=new Date().toISOString(),journal={id:crypto.randomUUID(),date:n.date,number:n.number,description:'Nota Debet '+n.number+' · '+n.description,lines:lines.map(l=>({...l})),status:'posted',source:'DEBIT_NOTE',sourceId:n.id,createdAt:now,updatedAt:now,postedAt:now};state.journals.push(journal);state.debitNotes=state.debitNotes.map(x=>x.id===n.id?{...x,status:'posted',journalId:journal.id,postedAt:now,updatedAt:now}:x);await persist();renderDebitNotes();renderJournals();renderDashboard();renderTrialBalance();resetDebitNoteForm();toast('Nota Debet diposting dan jurnal '+n.number+' dibuat.')}
async function cancelDebitNote(id){const n=state.debitNotes.find(x=>x.id===id);if(!n||n.status!=='draft')return;const reason=prompt('Alasan pembatalan Nota Debet '+n.number+':');if(reason===null)return;if(!reason.trim()){toast('Alasan pembatalan wajib diisi.');return}n.status='cancelled';n.cancelReason=reason.trim();n.cancelledAt=new Date().toISOString();await persist();renderDebitNotes();toast('Nota Debet dibatalkan.')}
function viewDebitNote(id){const n=state.debitNotes.find(x=>x.id===id);if(!n)return;const lines=(n.lines||[]).map(l=>{const a=state.accounts.find(x=>x.code===l.code)||{};return l.code+' '+(a.name||'')+' | D '+money(l.debit)+' | K '+money(l.credit)}).join('\n');alert('NOTA DEBET '+n.number+'\nTanggal: '+n.date+'\nPihak: '+n.partner+'\nReferensi: '+(n.reference||'-')+'\nKeterangan: '+n.description+'\n\n'+lines+'\nStatus: '+n.status.toUpperCase()+'\nJurnal: '+(n.journalId||'-'))}
$('dn-add-line').onclick=()=>debitNoteAddLine();$('dn-source-search').onclick=searchDebitNoteSources;$('dn-source-add').onclick=addSelectedDebitNoteSources;$('dn-source-group').onchange=()=>{$('dn-source-rows').innerHTML='<tr><td colspan="8" class="empty">Tekan Cari Transaksi untuk memuat data.</td></tr>';};$('dn-reset').onclick=resetDebitNoteForm;$('dn-save').onclick=saveDebitNote;$('dn-post').onclick=()=>postDebitNote(editingDebitNoteId);$('dn-search').oninput=renderDebitNotes;$('dn-status').onchange=renderDebitNotes;$('dn-date').onchange=()=>{if(!editingDebitNoteId)$('dn-number').value=debitNoteNextNumber()};

function go(page){
 const target='page-'+page;
 document.querySelectorAll('section.page').forEach(p=>{
  const isTarget=p.id===target;
  p.classList.toggle('active',isTarget);
  p.hidden=!isTarget;
  if(isTarget)p.removeAttribute('hidden');
 });
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const labels={'import-center':'Pusat Import Data','journal-admin':'Administrasi Jurnal',periods:'Periode Akuntansi',dashboard:'Dashboard','archive-reader':'Pembaca Arsip',archive:'Arsip 5 Tahunan',journal:'Input Jurnal','journal-list':'Daftar jurnal',accounts:'Master Akun','opening-balances':'Saldo Awal ACC & Program','debit-notes':'Nota Debet',ledger:'Buku Besar per Akun',nptrans:'NPTRANS / DBF',reports:'Laporan',backup:'Backup & Restore',audit:'Riwayat Aktivitas',validation:'Validasi & Integritas Data','print-settings':'Pengaturan Cetak'};
 $('page-title').textContent=labels[page]||page;
 if(page==='periods')renderPeriodControl();
 if(page==='dashboard')renderDashboard();
 if(page==='journal-list')renderJournals();
 if(page==='debit-notes')renderDebitNotes();
 if(page==='accounts')renderAccounts();
 if(page==='opening-balances')renderOpeningBalances();
 if(page==='nptrans')renderNptrans();
 if(page==='reports')renderTrialBalance();
 if(page==='ledger')renderLedger();
 if(page==='audit')renderAuditLogs();
 if(page==='validation')renderValidation();
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('.list-toggle').forEach(b=>b.addEventListener('click',()=>{const panel=$(b.dataset.target);if(!panel)return;const opening=panel.hidden;panel.hidden=!opening;b.setAttribute('aria-expanded',String(opening));const labels={'account-list-content':opening?'− Sembunyikan daftar akun':'＋ Tampilkan '+state.accounts.length+' akun','journal-list-content':opening?'− Sembunyikan daftar jurnal':'＋ Tampilkan daftar jurnal','np-list-content':opening?'− Sembunyikan data NPTRANS':'＋ Tampilkan data NPTRANS','trial-balance-content':opening?'− Sembunyikan neraca saldo':'＋ Tampilkan neraca saldo'};b.textContent=labels[b.dataset.target]||'Tampilkan / sembunyikan';}));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('quick-journal').onclick=()=>{resetJournalForm();go('journal')};

function fmtDate(d){if(!d)return '';const x=new Date(d+'T00:00:00');return Number.isNaN(x.getTime())?d:x.toLocaleDateString('id-ID')}
function renderDashboard(){const posted=state.journals.filter(j=>isPostedJournal(j));const lines=posted.flatMap(j=>j.lines||[]),debit=lines.reduce((a,l)=>a+Number(l.debit||0),0),credit=lines.reduce((a,l)=>a+Number(l.credit||0),0);$('stat-debit').textContent=money(debit);$('stat-credit').textContent=money(credit);$('stat-journals').textContent=posted.length.toLocaleString('id-ID');const recent=posted.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent-journals').innerHTML=recent.length?journalTable(recent,false):'<div class="empty"><div class="empty-state"><span class="empty-state-icon"><i data-lucide="list"></i></span><strong>Belum ada jurnal tersimpan</strong><p>Transaksi terbaru akan muncul di sini setelah jurnal dibuat.</p></div></div>';window.lucide?.createIcons($('recent-journals'))}
function accountOptions(selected=''){return '<option value="">Pilih akun</option>'+state.accounts.map(a=>'<option value="'+esc(a.code)+'" '+(a.code===selected?'selected':'')+'>'+esc(a.code)+' — '+esc(a.name)+'</option>').join('')}
function addJournalLine(line={}){const tr=document.createElement('tr');tr.className='entry-row';tr.innerHTML='<td><select class="line-code">'+accountOptions(line.code||'')+'</select></td><td class="line-account-name">'+esc((state.accounts.find(a=>a.code===line.code)||{}).name||'—')+'</td><td><input class="line-note" placeholder="Keterangan baris" value="'+esc(line.note||'')+'"></td><td><input class="amount line-debit" type="number" min="0" step="0.01" value="'+(line.debit||'')+'"></td><td><input class="amount line-credit" type="number" min="0" step="0.01" value="'+(line.credit||'')+'"></td><td><button class="icon-btn remove-line" type="button">×</button></td>';tr.querySelector('.line-code').onchange=()=>{const a=state.accounts.find(x=>x.code===tr.querySelector('.line-code').value);tr.querySelector('.line-account-name').textContent=a?a.name:'—'};tr.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateJournalTotals));tr.querySelector('.remove-line').onclick=()=>{if($('journal-lines').children.length>2){tr.remove();updateJournalTotals()}else toast('Minimal dua baris akun diperlukan.')};$('journal-lines').appendChild(tr);updateJournalTotals()}
function resetJournalForm(){editingId=null;ensurePeriodControl();$('j-date').value=state.periodControl.activePeriod+'-01';$('j-number').value='';$('j-description').value='';$('journal-lines').innerHTML='';addJournalLine();addJournalLine();$('save-journal').textContent='Simpan sebagai Draft';$('post-journal').textContent='Posting Jurnal';$('post-journal').disabled=false;setMessage('journal-message','Simpan sebagai Draft untuk dilanjutkan nanti, atau Posting Jurnal setelah debit dan kredit seimbang.')}
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
 if(!periodGuard(date.slice(0,7),'menyimpan atau memposting jurnal'))return;
 if(state.journals.some(j=>j.number===number&&j.id!==editingId)){setMessage('journal-message','Nomor bukti sudah digunakan.','bad');return}
 if(targetStatus==='posted'){
  if(rows.length<2||rows.some(x=>!x.code||!Number.isFinite(x.debit)||!Number.isFinite(x.credit)||(!x.debit&&!x.credit)||(x.debit&&x.credit)||x.debit<0||x.credit<0)){setMessage('journal-message','Untuk posting, setiap baris wajib memiliki akun dan hanya satu nilai debit/kredit yang valid.','bad');return}
  const debit=rows.reduce((s,x)=>s+x.debit,0),credit=rows.reduce((s,x)=>s+x.credit,0);
  if(Math.abs(debit-credit)>.005){setMessage('journal-message','Jurnal belum seimbang. Selisih: '+money(Math.abs(debit-credit)),'bad');return}
 }else if(rows.some(x=>x.debit<0||x.credit<0||!Number.isFinite(x.debit)||!Number.isFinite(x.credit))){setMessage('journal-message','Nilai debit/kredit tidak boleh negatif atau tidak valid.','bad');return}
 const old=state.journals.find(j=>j.id===editingId);
 if(old&&!periodGuard(String(old.date||'').slice(0,7),'mengubah jurnal lama'))return;
  if(old&&old.status!=='draft'){setMessage('journal-message','Jurnal terposting tidak dapat diedit. Buat jurnal koreksi/pembalik.','bad');return}
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
let selectedAccountFile=null,pendingAccountImport=null;
 $('account-file').onchange=e=>{selectedAccountFile=e.target.files?.[0]||null;pendingAccountImport=null;$('account-import-review').hidden=true;$('import-account-button').disabled=!selectedAccountFile;$('account-import-status').textContent=selectedAccountFile?'File dipilih: '+selectedAccountFile.name+'. Tekan Periksa & Pratinjau.':'Belum ada file master akun dipilih.'};
 $('import-account-button').onclick=async()=>{const f=selectedAccountFile;if(!f)return;$('import-account-button').disabled=true;try{let accounts=[];
  if(f.name.toLowerCase().endsWith('.dbf')){const p=parseDBF(await f.arrayBuffer());const fields=p.fields.map(x=>norm(x.name));if(!fields.includes('SANDI'))throw Error('Kolom SANDI tidak ditemukan pada DBF.');accounts=p.records.map((r,index)=>{const o={};Object.keys(r).forEach(k=>o[norm(k)]=r[k]);return{code:String(o.SANDI??o.KODE??'').trim(),name:String(o.DES??o.NAMA??o.NAMAAKUN??o.KET??'').trim(),_row:index+1}}).filter(x=>x.code)}
  else accounts=/\.xlsx?$/i.test(f.name)?xlsxToAccounts(await f.arrayBuffer()):csvToAccounts(await f.text());
  if(!accounts.length)throw Error('Tidak ditemukan akun dengan SANDI terisi.');
  const seen=new Set(),errors=[],known=new Map(state.accounts.map(x=>[String(x.code),x]));accounts.forEach((x,i)=>{if(!x.code)errors.push('Baris '+(x._row||i+2)+': SANDI kosong.');if(seen.has(x.code))errors.push('Baris '+(x._row||i+2)+': SANDI duplikat '+x.code+'.');seen.add(x.code)});
  const added=accounts.filter(x=>!known.has(x.code)).length,updated=accounts.length-added;pendingAccountImport={fileName:f.name,accounts,errors};
  $('account-import-summary').textContent=accounts.length+' akun dibaca · '+added+' baru · '+updated+' diperbarui';$('account-import-detail').textContent=errors.length?errors.length+' kesalahan. Perbaiki file sebelum menyimpan.':'Periksa isi file. Belum ada data yang disimpan.';
  $('account-import-errors').hidden=!errors.length;$('account-import-errors').innerHTML=errors.length?'<b>Hasil pemeriksaan:</b><ul>'+errors.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';
  $('account-import-rows').innerHTML=accounts.slice(0,300).map(x=>'<tr><td>'+(x._row||'—')+'</td><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td>'+(known.has(x.code)?'PERBARUI':'TAMBAH')+'</td></tr>').join('');
  $('account-import-confirm').disabled=!!errors.length;$('account-import-review').hidden=false;$('account-import-status').textContent='Pratinjau siap: '+f.name;
 }catch(err){pendingAccountImport=null;$('account-import-status').textContent='Gagal membaca file: '+err.message;toast('Import akun gagal: '+err.message)}finally{$('import-account-button').disabled=!selectedAccountFile}};
 $('account-import-confirm').onclick=async()=>{const b=pendingAccountImport;if(!b||b.errors.length)return;if(!requireImportPassword('Import Master Akun'))return;if(!confirm('Simpan '+b.accounts.length+' akun dari '+b.fileName+'? SANDI yang sudah ada akan diperbarui.'))return;try{const map=new Map(state.accounts.map(x=>[String(x.code),x]));let added=0,updated=0;b.accounts.forEach(x=>{const v={code:x.code,name:x.name};if(map.has(x.code)){Object.assign(map.get(x.code),v);updated++}else{map.set(x.code,v);added++}});state.accounts=[...map.values()];await persist();renderAccounts();renderNptrans();const msg='Import berhasil: '+b.accounts.length+' record · '+added+' akun baru · '+updated+' akun diperbarui.';$('account-import-status').textContent=msg;toast(msg);pendingAccountImport=null;$('account-import-review').hidden=true;$('account-file').value='';selectedAccountFile=null;$('import-account-button').disabled=true}catch(err){$('account-import-status').textContent='Penyimpanan gagal: '+err.message}};
 $('account-import-cancel').onclick=()=>{pendingAccountImport=null;$('account-import-review').hidden=true;$('account-file').value='';selectedAccountFile=null;$('import-account-button').disabled=true;$('account-import-status').textContent='Pratinjau dibatalkan. Data tidak berubah.'};
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

function isPostedJournal(j){return String(j?.status??'').trim().toLowerCase()==='posted'}
function getTrialBalanceRows(period){
 const openingMap=new Map(),movement=new Map();
 (Array.isArray(state.openingBalances)?state.openingBalances:[]).filter(x=>String(x.period||'')===String(period)).forEach(x=>{
  const code=String(x.accountCode??'').trim();if(!code)return;
  const v=openingMap.get(code)||{debit:0,credit:0};
  v.debit+=Number(x.debit||0);v.credit+=Number(x.credit||0);openingMap.set(code,v);
 });
 (Array.isArray(state.journals)?state.journals:[]).filter(j=>isPostedJournal(j)&&String(j.date||'').slice(0,7)===String(period)).forEach(j=>(Array.isArray(j.lines)?j.lines:[]).forEach(l=>{
  const code=String(l.code??'').trim();if(!code)return;
  const v=movement.get(code)||{debit:0,credit:0};
  v.debit+=Number(l.debit||0);v.credit+=Number(l.credit||0);movement.set(code,v);
 }));
 const codes=new Set([...(state.accounts||[]).map(a=>String(a.code)),...openingMap.keys(),...movement.keys()]);
 return [...codes].sort((a,b)=>a.localeCompare(b)).map(code=>{
  const account=(state.accounts||[]).find(a=>String(a.code)===code),opening=openingMap.get(code)||{debit:0,credit:0},netOpening=opening.debit-opening.credit,move=movement.get(code)||{debit:0,credit:0},net=netOpening+move.debit-move.credit;
  return {code,name:account?.name||'(Akun tidak ditemukan)',openingDebit:Math.max(netOpening,0),openingCredit:Math.max(-netOpening,0),debit:move.debit,credit:move.credit,endingDebit:Math.max(net,0),endingCredit:Math.max(-net,0),balance:net};
 });
}
function ledgerOpeningNet(period,account){const record=(state.openingBalances||[]).find(x=>x.period===period&&String(x.accountCode)===String(account.code));return record?Number(record.debit||0)-Number(record.credit||0):0}
function getLedgerTransactions(period,code){
 const account=state.accounts.find(a=>String(a.code)===String(code));if(!account)return null;
 const openingNet=ledgerOpeningNet(period,account),rows=[{date:period+'-01',number:'SALDO AWAL',description:'Saldo awal periode',debit:Math.max(openingNet,0),credit:Math.max(-openingNet,0),kind:'opening'}];
 state.journals.filter(j=>(isPostedJournal(j))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).filter(l=>String(l.code)===String(code)).forEach(l=>rows.push({date:String(j.date||''),number:String(j.number||''),description:String(j.description||'')+(l.note?' · '+l.note:''),debit:Number(l.debit||0),credit:Number(l.credit||0),kind:'movement'})));
 rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.kind==='opening'?-1:b.kind==='opening'?1:0)||a.number.localeCompare(b.number));
 let balance=0;rows.forEach(r=>{balance+=r.debit-r.credit;r.balance=balance;r.balanceDebit=Math.max(balance,0);r.balanceCredit=Math.max(-balance,0)});return {account,rows,openingNet,endingNet:balance};
}
function getAccountJournalStatus(period,code){
 const rows=[];
 (Array.isArray(state.journals)?state.journals:[]).filter(j=>String(j.date||'').slice(0,7)===String(period)).forEach(j=>{
  (Array.isArray(j.lines)?j.lines:[]).filter(l=>String(l.code)===String(code)).forEach(l=>{
   const raw=String(j.status||'').trim().toLowerCase(),status=['cancelled','canceled','void','dibatalkan','batal'].includes(raw)?'cancelled':raw==='draft'?'draft':raw==='posted'?'posted':'unknown';
   rows.push({date:String(j.date||''),number:String(j.number||''),description:String(j.description||''),note:String(l.note||''),status,rawStatus:String(j.status||'TANPA STATUS'),debit:Number(l.debit||0),credit:Number(l.credit||0),id:j.id});
  });
 });
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.number.localeCompare(b.number));
}
function renderAccountJournalStatus(period,code){
 const host=$('ledger-status-content'),summary=$('ledger-status-summary');if(!period||!code){summary.innerHTML='';host.innerHTML='<div class="empty">Pilih periode dan akun untuk melihat status transaksi.</div>';return}
 const all=getAccountJournalStatus(period,code),filter=$('ledger-status-filter')?.value||'all',rows=all.filter(r=>filter==='all'||r.status===filter);
 const groups={posted:all.filter(r=>r.status==='posted'),draft:all.filter(r=>r.status==='draft'),cancelled:all.filter(r=>r.status==='cancelled'),unknown:all.filter(r=>r.status==='unknown')};
 const total=(items,key)=>items.reduce((n,r)=>n+r[key],0),card=(label,items)=>'<div><span>'+label+' · '+items.length+' baris akun</span><b>D '+money(total(items,'debit'))+' / K '+money(total(items,'credit'))+'</b></div>';
 summary.innerHTML='<div class="journal-totals">'+card('POSTED',groups.posted)+card('DRAFT',groups.draft)+card('DIBATALKAN',groups.cancelled)+card('STATUS LAIN / KOSONG',groups.unknown)+'</div><p class="footnote">Jumlah transaksi dihitung per baris akun. Satu nomor bukti dapat muncul lebih dari sekali jika SANDI yang sama digunakan pada beberapa baris.</p>';
 host.innerHTML=rows.length?'<table><thead><tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan jurnal</th><th>Keterangan baris</th><th>Status</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(fmtDate(r.date))+'</td><td><b>'+esc(r.number)+'</b></td><td>'+esc(r.description)+'</td><td>'+esc(r.note)+'</td><td><span class="tag '+(r.status==='posted'?'np-ok':r.status==='draft'?'np-warn':'')+'">'+esc(r.rawStatus)+'</span></td><td class="num">'+money(r.debit)+'</td><td class="num">'+money(r.credit)+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="5">TOTAL BARIS TERPILIH</th><th>'+money(total(rows,'debit'))+'</th><th>'+money(total(rows,'credit'))+'</th></tr></tfoot></table>':'<div class="empty">Tidak ada transaksi untuk filter status ini.</div>';
}
function renderLedger(){
 const period=$('ledger-period').value,select=$('ledger-account'),current=select.value;
 select.innerHTML='<option value="">Pilih akun</option>'+state.accounts.slice().sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=>'<option value="'+esc(a.code)+'">'+esc(a.code)+' · '+esc(a.name||'(Tanpa nama)')+'</option>').join('');
 if(current)select.value=current;
 const code=select.value;if(!period||!code){$('ledger-summary').innerHTML='';$('ledger-content').innerHTML='<div class="empty">Pilih periode dan akun untuk menampilkan buku besar.</div>';renderAccountJournalStatus(period,code);return}renderAccountJournalStatus(period,code);
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
$('ledger-status-filter').addEventListener('change',()=>renderAccountJournalStatus($('ledger-period').value,$('ledger-account').value));
$('ledger-refresh').onclick=renderLedger;
$('ledger-print').onclick=()=>{go('ledger');window.print()};
$('ledger-export').onclick=exportLedgerXlsx;

function exportTrialBalanceXlsx(){const period=$('report-period').value,rows=getTrialBalanceRows(period);const data=[['PERIODE',period],[],['SANDI','NAMA AKUN','SALDO AWAL DEBIT','SALDO AWAL KREDIT','MUTASI DEBIT','MUTASI KREDIT','SALDO AKHIR DEBIT','SALDO AKHIR KREDIT','SALDO BERSIH D/(K)'],...rows.map(r=>[r.code,r.name,r.openingDebit,r.openingCredit,r.debit,r.credit,r.endingDebit,r.endingCredit,r.balance])];exportXlsxSheet('Neraca-Percobaan-'+period+'.xlsx','Neraca Percobaan',data)}
function renderTrialBalance(){
 const period=$('report-period').value,rows=getTrialBalanceRows(period),sum=k=>rows.reduce((n,r)=>n+Number(r[k]||0),0),ed=sum('endingDebit'),ec=sum('endingCredit'),difference=ed-ec,balanced=Math.abs(difference)<.005;
 $('trial-balance').innerHTML=rows.length?'<div class="trial-period-note">Periode '+esc(period)+' · Saldo awal dari Daftar Saldo Awal ACC & Program. Mutasi hanya dari jurnal POSTED pada periode ini; DRAFT dan jurnal tanpa status tidak dihitung.</div><div class="table-wrap"><table><thead><tr><th>SANDI</th><th>Nama akun</th><th>Saldo awal D</th><th>Saldo awal K</th><th>Mutasi D</th><th>Mutasi K</th><th>Saldo akhir D</th><th>Saldo akhir K</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td>'+money(r.openingDebit)+'</td><td>'+money(r.openingCredit)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td><td>'+money(r.endingDebit)+'</td><td>'+money(r.endingCredit)+'</td></tr>').join('')+'<tr><th colspan="2">TOTAL</th><th>'+money(sum('openingDebit'))+'</th><th>'+money(sum('openingCredit'))+'</th><th>'+money(sum('debit'))+'</th><th>'+money(sum('credit'))+'</th><th>'+money(ed)+'</th><th>'+money(ec)+'</th></tr></tbody></table></div><p class="trial-balance-check">Total saldo akhir Debit: <b>'+money(ed)+'</b> · Kredit: <b>'+money(ec)+'</b> · Selisih: <b class="'+(balanced?'balance-ok':'balance-warn')+'">'+money(difference)+'</b> · <b class="'+(balanced?'balance-ok':'balance-warn')+'">'+(balanced?'SEIMBANG':'BELUM SEIMBANG — PERIKSA SALDO AWAL / JURNAL POSTED')+'</b></p>':'<div class="empty">Belum ada saldo awal atau jurnal POSTED untuk periode ini.</div>';
}
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


// IMPORT SALDO AWAL — preview first, skip duplicates, never overwrite existing balances.
let pendingOpeningImport=null;
function openingPeriodKey(v){const s=String(v??'').trim();if(/^\d{4}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[\/-](\d{4})$/);return m?m[2]+'-'+m[1].padStart(2,'0'):''}
function parseOpeningImportRows(rows){
 if(!rows.length)throw Error('File kosong.');
 const aliases={period:['PERIODE','BULAN','PERIOD'],code:['SANDI','KODE','KODEAKUN','ACCOUNTCODE'],debit:['DEBITAWAL','SALDOAWALDEBIT','DEBIT'],credit:['KREDITAWAL','SALDOAWALKREDIT','KREDIT'],side:['SALDONORMAL','POSISISALDO','SISI'],amount:['NOMINAL','JUMLAH','SALDO'],note:['KETERANGAN','CATATAN','URAIAN']};
 let header=-1,col={};
 for(let i=0;i<Math.min(rows.length,25);i++){const h=rows[i].map(norm),m={};for(const [k,a] of Object.entries(aliases))m[k]=h.findIndex(x=>a.includes(x));if(m.period>=0&&m.code>=0&&(m.debit>=0||m.credit>=0||(m.side>=0&&m.amount>=0))){header=i;col=m;break}}
 if(header<0)throw Error('Header tidak dikenali. Wajib PERIODE, SANDI, dan DEBIT AWAL/KREDIT AWAL atau SALDO NORMAL/NOMINAL.');
 const parsed=[];rows.slice(header+1).forEach((r,i)=>{if(!r.some(v=>String(v??'').trim()))return;const period=openingPeriodKey(r[col.period]),accountCode=String(r[col.code]??'').trim();let debit=col.debit>=0?parseAmount(r[col.debit]):0,credit=col.credit>=0?parseAmount(r[col.credit]):0;if(col.debit<0&&col.credit<0){const side=String(r[col.side]??'').trim().toLowerCase();const amount=parseAmount(r[col.amount]);if(['debit','d','dr'].includes(side))debit=amount;else if(['kredit','credit','k','cr'].includes(side))credit=amount;else{debit=NaN;credit=NaN}}parsed.push({period,accountCode,debit,credit,note:String(col.note>=0?r[col.note]??'':'').trim(),row:header+i+2})});
 if(!parsed.length)throw Error('Tidak ada baris saldo awal.');return parsed;
}
function showOpeningImportPreview(rows,fileName){
 const errors=[],warnings=[],seen=new Set(),existing=new Set((state.openingBalances||[]).map(x=>x.period+'|'+x.accountCode)),known=new Map(state.accounts.map(a=>[String(a.code),a]));
 const items=rows.map(r=>{let status='SIAP';if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period))errors.push('Baris '+r.row+': periode tidak valid.');if(!r.accountCode||!known.has(r.accountCode))errors.push('Baris '+r.row+': SANDI kosong atau tidak ditemukan di Master Akun.');if(!Number.isFinite(r.debit)||!Number.isFinite(r.credit)||r.debit<0||r.credit<0||((r.debit>0)&&(r.credit>0))||(!(r.debit>0)&&!(r.credit>0)))errors.push('Baris '+r.row+': isi satu nominal positif pada debit atau kredit.');if(r.period&&isPeriodLocked(r.period))errors.push('Baris '+r.row+': periode '+r.period+' sudah ditutup.');const key=r.period+'|'+r.accountCode;if(seen.has(key))errors.push('Baris '+r.row+': SANDI ganda dalam file untuk periode yang sama.');seen.add(key);if(existing.has(key)){status='DILEWATI · SUDAH ADA';warnings.push('Baris '+r.row+': saldo awal '+key+' sudah ada dan tidak akan ditimpa.')}return {...r,status,name:known.get(r.accountCode)?.name||''}});
 pendingOpeningImport={fileName,items,valid:items.filter(x=>x.status==='SIAP'&&!errors.some(e=>e.startsWith('Baris '+x.row+':')))};
 $('opening-import-summary').textContent=items.length+' baris dibaca · '+pendingOpeningImport.valid.length+' siap diimpor · '+items.filter(x=>x.status.startsWith('DILEWATI')).length+' duplikat dilewati';
 $('opening-import-detail').textContent=errors.length+' kesalahan · '+warnings.length+' peringatan. Kesalahan harus diperbaiki pada file sumber sebelum import.';
 $('opening-import-errors').hidden=!errors.length;$('opening-import-errors').innerHTML=errors.length?'<b>Kesalahan:</b><ul>'+errors.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';
 $('opening-import-rows').innerHTML=items.map(x=>'<tr><td>'+esc(x.period)+'</td><td>'+esc(x.accountCode)+'</td><td>'+esc(x.name)+'</td><td class="num">'+money(x.debit)+'</td><td class="num">'+money(x.credit)+'</td><td>'+esc(x.note)+'</td><td>'+esc(x.status)+'</td></tr>').join('');
 $('opening-import-review').hidden=false;$('opening-import-confirm').disabled=!pendingOpeningImport.valid.length||errors.length>0;
 $('opening-import-status').textContent=fileName+' · '+items.length+' baris diperiksa.';
}
$('opening-import-template').onclick=()=>{const rows=[['PERIODE','SANDI','DEBIT AWAL','KREDIT AWAL','KETERANGAN'],['2026-01','111.100',1000000,0,'Saldo awal kas'],['2026-01','211.100',0,1000000,'Saldo awal utang']];const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Saldo Awal');XLSX.writeFile(wb,'Format-Import-Saldo-Awal-SBP.xlsx')};
$('opening-import-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{let rows;if(/\.xlsx?$/i.test(f.name)){if(!window.XLSX)throw Error('Mesin Excel lokal belum siap.');const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});rows=null;for(const n of wb.SheetNames){const data=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:true});try{parseOpeningImportRows(data);rows=data;break}catch{}}if(!rows)throw Error('Header saldo awal tidak ditemukan di sheet Excel.')}else rows=parseCSV(await f.text());showOpeningImportPreview(parseOpeningImportRows(rows),f.name)}catch(err){pendingOpeningImport=null;$('opening-import-review').hidden=true;$('opening-import-status').textContent='Gagal membaca file: '+err.message}finally{e.target.value=''}};
$('opening-import-cancel').onclick=()=>{pendingOpeningImport=null;$('opening-import-review').hidden=true;$('opening-import-status').textContent='Pratinjau dibatalkan; data belum berubah.'};
$('opening-import-confirm').onclick=async()=>{const batch=pendingOpeningImport;if(!batch||!batch.valid.length)return;if(!requireImportPassword('Import Saldo Awal'))return;const valid=batch.valid;if(valid.some(x=>isPeriodLocked(x.period))){toast('Import dibatalkan: ada periode yang sudah ditutup.');return}if(!confirm('Import '+valid.length+' saldo awal baru dari '+batch.fileName+'? Data yang sudah ada tidak akan ditimpa.'))return;const now=new Date().toISOString();if(!Array.isArray(state.openingBalances))state.openingBalances=[];valid.forEach(x=>state.openingBalances.push({period:x.period,accountCode:x.accountCode,debit:x.debit,credit:x.credit,note:x.note,updatedAt:now}));await persist();pendingOpeningImport=null;$('opening-import-review').hidden=true;renderOpeningBalances();toast(valid.length+' saldo awal berhasil diimpor.');$('opening-import-status').textContent=valid.length+' saldo awal berhasil diimpor.'};

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
  if(!periodGuard(period,'menambah atau mengubah saldo awal'))return;
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
 const posted=state.journals.filter(j=>String(j.date||'').slice(0,7)===period&&(isPostedJournal(j))).length;
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
 for(const id of ['ledger-period','report-period','opening-period'])if($(id))$(id).value=p;if(!editingId&&$('j-date'))$('j-date').value=p+'-01';
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
 if(state.periodControl.activePeriod===p){let next=new Date(Number(p.slice(0,4)),Number(p.slice(5,7)),1),candidate='';for(let i=0;i<24;i++){candidate=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0');if(!isPeriodLocked(candidate))break;next.setMonth(next.getMonth()+1)}state.periodControl.activePeriod=candidate||currentMonthKey()}
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
function journalPrintStatus(j){const s=String(j?.status??'').trim().toLowerCase();if(s==='posted')return 'posted';if(s==='draft')return 'draft';if(['cancelled','canceled','void','dibatalkan','batal'].includes(s))return 'cancelled';return 'unknown'}
function openJournalPrintSettings(){const modal=$('journal-print-modal');if(!modal)return;const account=$('jprint-account');account.innerHTML='<option value="all">Semua akun</option>'+state.accounts.slice().sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=>'<option value="'+esc(a.code)+'">'+esc(a.code+' · '+a.name)+'</option>').join('');const now=new Date(),month=String(now.getMonth()+1).padStart(2,'0');$('jprint-month').value=now.getFullYear()+'-'+month;$('jprint-year').value=String(now.getFullYear());$('jprint-search').value=$('journal-search')?.value||'';$('jprint-status').value='all';$('jprint-account').value='all';$('jprint-mode').value='month';updateJournalPrintMode();$('jprint-validation').textContent='Pilih periode. Semua baris akun dalam jurnal terpilih akan dicetak agar debit dan kredit tetap utuh.';modal.hidden=false}
function updateJournalPrintMode(){const mode=$('jprint-mode').value;for(const [id,show] of [['jprint-date-wrap',mode==='date'],['jprint-month-wrap',mode==='month'],['jprint-year-wrap',mode==='year'],['jprint-from-wrap',mode==='range'],['jprint-to-wrap',mode==='range']])$(id).hidden=!show}
function closeJournalPrintSettings(){$('journal-print-modal').hidden=true}
function printJournalList(){openJournalPrintSettings()}
function confirmJournalPrint(){const mode=$('jprint-mode').value;let from='',to='',period='Seluruh data';if(mode==='date'){from=to=$('jprint-date').value;if(!from)return toast('Pilih tanggal jurnal terlebih dahulu.');period='Tanggal '+from}else if(mode==='month'){const v=$('jprint-month').value;if(!/^\\d{4}-\\d{2}$/.test(v))return toast('Pilih bulan dan tahun terlebih dahulu.');const [y,m]=v.split('-').map(Number);from=v+'-01';to=v+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');period=v}else if(mode==='year'){const y=Number($('jprint-year').value);if(!Number.isInteger(y)||y<1900||y>2200)return toast('Masukkan tahun yang benar.');from=y+'-01-01';to=y+'-12-31';period=String(y)}else if(mode==='range'){from=$('jprint-from').value;to=$('jprint-to').value;if(!from||!to)return toast('Lengkapi tanggal mulai dan tanggal akhir.');if(from>to)return toast('Tanggal mulai tidak boleh melewati tanggal akhir.');period=from+' s.d. '+to}
 const status=$('jprint-status').value,account=$('jprint-account').value,q=$('jprint-search').value.trim().toLowerCase(),sort=$('jprint-sort').value;
 const items=state.journals.filter(j=>{const date=String(j.date||'').slice(0,10);if(from&&(!date||date<from||date>to))return false;if(status!=='all'&&journalPrintStatus(j)!==status)return false;if(account!=='all'&&!(j.lines||[]).some(l=>String(l.code||l.accountCode||'')===account))return false;const hay=(j.number+' '+j.description+' '+date+' '+(j.lines||[]).map(l=>(l.note||'')+' '+(l.code||'')).join(' ')).toLowerCase();return !q||hay.includes(q)}).sort((a,b)=>sort==='asc'?String(a.date||'').localeCompare(String(b.date||'')):String(b.date||'').localeCompare(String(a.date||'')));
 if(!items.length)return toast('Tidak ada jurnal yang cocok dengan pengaturan cetak.');
 const d=items.reduce((n,j)=>n+(j.lines||[]).reduce((s,l)=>s+Number(l.debit||0),0),0),c=items.reduce((n,j)=>n+(j.lines||[]).reduce((s,l)=>s+Number(l.credit||0),0),0),statusLabel={all:'Semua status',posted:'Posted',draft:'Draft',cancelled:'Dibatalkan',unknown:'Status tidak dikenal/kosong'}[status],accountLabel=account==='all'?'Semua akun':account;
 const body=printSummary([['Periode',period],['Jumlah jurnal',String(items.length)],['Status',statusLabel],['Akun / SANDI',accountLabel],['Total debit',printMoney(d)],['Total kredit',printMoney(c)],['Selisih',printMoney(d-c)]])+printTable(['TANGGAL','NO. BUKTI','KETERANGAN','KETERANGAN BARIS','STATUS','JUMLAH BARIS','DEBIT','KREDIT'],items.map(j=>{const lines=j.lines||[],jd=lines.reduce((n,l)=>n+Number(l.debit||0),0),jc=lines.reduce((n,l)=>n+Number(l.credit||0),0),lineNotes=lines.map((l,i)=>'<div class="journal-line-note"><b>'+String(i+1)+'. '+esc(l.code||l.accountCode||'')+'</b> — '+(String(l.note||'').trim()?esc(l.note):'<span class="muted">Tidak ada keterangan</span>')+'</div>').join(''),st=journalPrintStatus(j);return '<tr><td>'+esc(fmtDate(j.date))+'</td><td>'+esc(j.number)+'</td><td>'+esc(j.description)+'</td><td class="journal-line-notes">'+(lineNotes||'—')+'</td><td>'+({posted:'POSTED',draft:'DRAFT',cancelled:'DIBATALKAN',unknown:'TIDAK DIKETAHUI'}[st])+'</td><td class="num">'+lines.length+'</td><td class="num">'+printMoney(jd)+'</td><td class="num">'+printMoney(jc)+'</td></tr>'}));
 closeJournalPrintSettings();printDocument('DAFTAR JURNAL','Periode '+period+' · Status '+statusLabel+' · Akun '+accountLabel+' · Rincian akun ditampilkan utuh per jurnal',body,'landscape');
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
$('print-journal-list').onclick=printJournalList;$('journal-print-close').onclick=closeJournalPrintSettings;$('journal-print-cancel').onclick=closeJournalPrintSettings;$('jprint-mode').addEventListener('change',updateJournalPrintMode);$('journal-print-confirm').onclick=confirmJournalPrint;$('journal-print-modal').addEventListener('click',e=>{if(e.target===$('journal-print-modal'))closeJournalPrintSettings()});
$('print-accounts').onclick=printAccounts;
$('print-report').onclick=printTrialBalance;
$('opening-print').onclick=printOpeningBalances;
$('ledger-print').onclick=printLedger;
$('export-trial-xlsx').onclick=exportTrialBalanceXlsx;


/* BUILD V66 — read-only validation and data integrity checks. */
function runDataValidation(){
 const issues=[],accounts=Array.isArray(state.accounts)?state.accounts:[],journals=Array.isArray(state.journals)?state.journals:[],openings=Array.isArray(state.openingBalances)?state.openingBalances:[],npRows=Array.isArray(state.nptrans)?state.nptrans:[];
 const accountCodes=new Set(accounts.map(a=>String(a.code??'').trim()).filter(Boolean));
 const add=(level,category,location,detail,action)=>issues.push({level,category,location,detail,action});
 const accountCount=new Map();
 accounts.forEach(a=>{const code=String(a.code??'').trim();if(code)accountCount.set(code,(accountCount.get(code)||0)+1);if(!code)add('GAGAL','Master Akun','Baris akun','Kode/SANDI akun kosong.','Lengkapi kode akun atau periksa data sumber.');if(!String(a.name??'').trim())add('PERINGATAN','Master Akun','Akun '+(code||'(tanpa kode)'),'Nama akun kosong.','Lengkapi nama akun setelah memastikan kode akun benar.')});
 for(const [code,count] of accountCount)if(count>1)add('GAGAL','Master Akun','Kode '+code,'Kode akun muncul '+count+' kali.','Tentukan satu kode akun yang benar dan tinjau transaksi yang menggunakannya.');
 const journalNumbers=new Map();
 journals.forEach((j,index)=>{
  const no=String(j.number??'').trim(),date=String(j.date??''),loc='Jurnal '+(no||('#'+(index+1)));
  if(no){const key=no.toLowerCase();if(!journalNumbers.has(key))journalNumbers.set(key,[]);journalNumbers.get(key).push(loc)}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))add('GAGAL','Jurnal',loc,'Tanggal tidak valid atau kosong.','Periksa tanggal pada jurnal sumber.');
  if(!no)add('GAGAL','Jurnal',loc,'Nomor bukti kosong.','Periksa dan lengkapi nomor bukti.');
  if(!String(j.description??'').trim())add('PERINGATAN','Jurnal',loc,'Keterangan jurnal kosong.','Tambahkan uraian transaksi yang dapat ditelusuri.');
  const period=date.slice(0,7),lines=Array.isArray(j.lines)?j.lines:[];
  if(period&&isPeriodLocked(period))add('GAGAL','Periode',loc,'Transaksi ditemukan pada periode yang berstatus ditutup ('+period+').','Verifikasi riwayat tutup/buka periode dan sumber transaksi; jangan mengubah status secara langsung.');
  if(!lines.length)add(j.status==='draft'?'PERINGATAN':'GAGAL','Jurnal',loc,'Jurnal tidak memiliki baris akun.','Periksa detail jurnal dan lengkapi melalui prosedur koreksi yang berlaku.');
  let debit=0,credit=0;
  lines.forEach((line,i)=>{
   const code=String(line.code??'').trim(),d=Number(line.debit||0),c=Number(line.credit||0),where=loc+' · baris '+(i+1);
   if(!code)add('GAGAL','Jurnal',where,'Kode akun kosong.','Pilih akun yang benar dari Master Akun.');
   else if(!accountCodes.has(code))add('GAGAL','Jurnal',where,'Kode akun '+code+' tidak ditemukan di Master Akun.','Verifikasi kode terhadap dokumen sumber dan Master Akun.');
   if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0)add('GAGAL','Jurnal',where,'Nilai debit/kredit tidak valid atau negatif.','Periksa nilai nominal pada baris jurnal.');
   if(d>0&&c>0)add('GAGAL','Jurnal',where,'Satu baris berisi debit dan kredit sekaligus.','Pisahkan sisi debit dan kredit sesuai dokumen sumber.');
   if(d===0&&c===0)add('PERINGATAN','Jurnal',where,'Baris tidak memiliki nilai debit maupun kredit.','Pastikan baris kosong memang diperlukan.');
   if(Number.isFinite(d)&&d>0)debit+=d;if(Number.isFinite(c)&&c>0)credit+=c;
  });
  if(lines.length&&Math.abs(debit-credit)>.005)add(j.status==='draft'?'PERINGATAN':'GAGAL','Keseimbangan Jurnal',loc,'Debit '+money(debit)+' dan kredit '+money(credit)+'; selisih '+money(debit-credit)+'.','Telusuri baris jurnal dan dokumen sumber sebelum membuat jurnal koreksi.');
 });
 for(const [no,locations] of journalNumbers)if(locations.length>1)add('PERINGATAN','Nomor Bukti','Nomor '+no,'Nomor bukti digunakan oleh '+locations.length+' jurnal.','Pastikan nomor bukti memang boleh berulang menurut kebijakan penomoran; jika tidak, koreksi dengan prosedur resmi.');
 const openingKeys=new Map(),openingTotals=new Map();
 openings.forEach((o,i)=>{
  const period=String(o.period??''),code=String(o.accountCode??'').trim(),d=Number(o.debit||0),c=Number(o.credit||0),loc='Saldo awal '+(period||'(tanpa periode)')+' / '+(code||'baris '+(i+1));
  if(!/^\d{4}-\d{2}$/.test(period))add('GAGAL','Saldo Awal',loc,'Periode saldo awal tidak valid.','Periksa periode pada data saldo awal.');
  if(!code)add('GAGAL','Saldo Awal',loc,'Kode akun kosong.','Pilih kode akun yang benar.');
  else if(!accountCodes.has(code))add('GAGAL','Saldo Awal',loc,'Kode akun '+code+' tidak ditemukan di Master Akun.','Cocokkan saldo awal dengan Master Akun.');
  if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0)add('GAGAL','Saldo Awal',loc,'Nilai debit/kredit tidak valid atau negatif.','Periksa nominal saldo awal.');
  const key=period+'|'+code;openingKeys.set(key,(openingKeys.get(key)||0)+1);
  const t=openingTotals.get(period)||{debit:0,credit:0};if(Number.isFinite(d)&&d>0)t.debit+=d;if(Number.isFinite(c)&&c>0)t.credit+=c;openingTotals.set(period,t);
 });
 for(const [key,count] of openingKeys)if(count>1)add('PERINGATAN','Saldo Awal',key,'Terdapat '+count+' baris saldo awal untuk akun dan periode yang sama.','Periksa apakah baris tersebut memang disengaja atau merupakan duplikasi.');
 for(const [period,t] of openingTotals)if(Math.abs(t.debit-t.credit)>.005)add('GAGAL','Keseimbangan Saldo Awal',period,'Total debit '+money(t.debit)+' tidak sama dengan kredit '+money(t.credit)+'.','Rekonsiliasi saldo awal berdasarkan neraca saldo pembukaan yang disetujui.');
 const npKeys=new Map();
 npRows.forEach((r,i)=>{
  const key=[r.tanggal,r.nobukti,r.nourut,r.sandi].map(v=>String(v??'').trim().toLowerCase()).join('|');
  npKeys.set(key,(npKeys.get(key)||0)+1);
  if(!String(r.sandi??'').trim())add('PERINGATAN','NPTRANS','Baris '+(i+1),'SANDI kosong.','Periksa record NPTRANS sumber.');
  if(!String(r.nobukti??'').trim())add('PERINGATAN','NPTRANS','Baris '+(i+1),'Nomor bukti kosong.','Periksa record NPTRANS sumber.');
  if(!Number.isFinite(Number(r.jumlah)))add('GAGAL','NPTRANS','Baris '+(i+1),'Nilai JUMLAH bukan angka yang valid.','Periksa nilai pada file sumber.');
 });
 for(const [key,count] of npKeys)if(count>1)add('PERINGATAN','NPTRANS','Kunci '+key,'Kombinasi tanggal, nomor bukti, nomor urut, dan SANDI muncul '+count+' kali.','Bandingkan dengan file NPTRANS asli sebelum memutuskan apakah record duplikat.');
 return {issues,checkedAt:new Date(),counts:{accounts:accounts.length,journals:journals.length,openings:openings.length,nptrans:npRows.length}};
}
function renderValidation(){
 const result=runDataValidation(),filter=$('validation-filter')?.value||'all',errors=result.issues.filter(x=>x.level==='GAGAL').length,warnings=result.issues.length-errors;
 $('validation-total').textContent=result.issues.length.toLocaleString('id-ID');$('validation-errors').textContent=errors.toLocaleString('id-ID');$('validation-warnings').textContent=warnings.toLocaleString('id-ID');
 const status=$('validation-status');status.textContent=errors?'PERLU PERBAIKAN':warnings?'ADA PERINGATAN':'VALID';status.className=errors?'validation-bad':warnings?'validation-warn':'validation-good';
 $('validation-meta').textContent='Diperiksa '+result.checkedAt.toLocaleString('id-ID')+' · '+result.counts.accounts+' akun · '+result.counts.journals+' jurnal · '+result.counts.openings+' saldo awal · '+result.counts.nptrans+' baris NPTRANS.';
 const shown=result.issues.filter(x=>filter==='all'||x.level===filter);
 $('validation-results').innerHTML=shown.length?'<div class="table-wrap"><table class="validation-table"><thead><tr><th>Status</th><th>Kategori</th><th>Lokasi data</th><th>Temuan</th><th>Saran pemeriksaan</th></tr></thead><tbody>'+shown.map(x=>'<tr><td><span class="validation-badge '+(x.level==='GAGAL'?'bad':'warn')+'">'+x.level+'</span></td><td>'+esc(x.category)+'</td><td>'+esc(x.location)+'</td><td>'+esc(x.detail)+'</td><td>'+esc(x.action)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="validation-clear"><i data-lucide="check-circle-2"></i><b>'+(result.issues.length?'Tidak ada temuan pada filter ini.':'Tidak ditemukan masalah pada pemeriksaan yang tersedia.')+'</b><span>Hasil pemeriksaan hanya mencakup aturan validasi BUILD V66.</span></div>';
 if(window.lucide?.createIcons)window.lucide.createIcons();
}
$('validation-run').onclick=renderValidation;$('validation-filter').onchange=renderValidation;

function renderAuditLogs(){const q=($('audit-search')?.value||'').trim().toLowerCase(),filter=$('audit-action-filter')?.value||'all',items=(state.auditLogs||[]).filter(x=>(x.summary+' '+x.entity+' '+x.entityId+' '+x.action).toLowerCase().includes(q)&&(filter==='all'||x.action===filter)).sort((x,y)=>String(y.at).localeCompare(String(x.at)));$('audit-count').textContent=items.length.toLocaleString('id-ID')+' aktivitas';$('audit-rows').innerHTML=items.length?items.slice(0,500).map(x=>'<tr><td>'+esc(new Date(x.at).toLocaleString('id-ID'))+'</td><td><b>'+esc(x.action)+'</b></td><td>'+esc(x.entity)+'</td><td>'+esc(x.entityId)+'</td><td>'+esc(x.summary)+'</td><td><details><summary>Lihat perubahan</summary><pre class="audit-json">'+esc(JSON.stringify({sebelum:x.before,sesudah:x.after},null,2))+'</pre></details></td></tr>').join(''):'<tr><td colspan="6" class="empty">Belum ada aktivitas yang tercatat.</td></tr>'}
function exportAuditCsv(){const rows=[['WAKTU','AKSI','MODUL','ID DATA','RINGKASAN','SEBELUM','SESUDAH'],...(state.auditLogs||[]).map(x=>[x.at,x.action,x.entity,x.entityId,x.summary,JSON.stringify(x.before??''),JSON.stringify(x.after??'')])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\\r\\n');downloadBlob(new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'SBP-Audit-Log.csv')}
$('audit-search').oninput=renderAuditLogs;$('audit-action-filter').onchange=renderAuditLogs;$('audit-export').onclick=exportAuditCsv;
$('archive-read-file').onchange=e=>loadArchiveReaderFile(e.target.files?.[0]);$('archive-read-mode').onchange=renderArchiveReader;$('archive-read-search').oninput=renderArchiveReader;$('archive-read-period').onchange=renderArchiveReader;$('archive-read-account').onchange=renderArchiveReader;
$('archive-create').onclick=createFiveYearArchive;$('archive-verify').onclick=verifyFiveYearArchive;
$('backup-connect-folder').onclick=connectBackupFolder;$('backup-reconnect-folder').onclick=reconnectBackupFolder;$('backup-now').onclick=()=>runAutomaticBackup('backup manual');$('backup-download').onclick=()=>{const payload=makeBackupPayload();downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'SBP-Accounting-V19-backup.json');setMessage('backup-message','Backup JSON berhasil diunduh. Simpan juga salinannya di media lain.','good')};
let pendingBackupRestore=null;
 $('backup-file').onchange=async e=>{const f=e.target.files?.[0];pendingBackupRestore=null;$('backup-import-review').hidden=true;if(!f)return;try{const parsed=JSON.parse(await f.text()),candidate=parsed.state||parsed;if(!Array.isArray(candidate.accounts)||!Array.isArray(candidate.journals)||!Array.isArray(candidate.nptrans))throw Error('Struktur backup tidak dikenali atau tidak lengkap.');pendingBackupRestore={fileName:f.name,candidate};$('backup-import-summary').textContent='Backup valid · '+f.name;$('backup-import-detail').textContent='Akun: '+candidate.accounts.length+' · Jurnal: '+candidate.journals.length+' · NPTRANS: '+candidate.nptrans.length+' · Saldo awal: '+(candidate.openingBalances||[]).length+'. Pemulihan mengganti seluruh database lokal.';$('backup-import-review').hidden=false;setMessage('backup-message','File berhasil dibaca. Periksa ringkasan dan setujui pemulihan. Database belum berubah.','good')}catch(err){setMessage('backup-message','Validasi backup gagal: '+err.message,'bad');$('backup-file').value=''}};
 $('backup-import-cancel').onclick=()=>{pendingBackupRestore=null;$('backup-import-review').hidden=true;$('backup-file').value='';setMessage('backup-message','Pemulihan dibatalkan. Database aktif tidak berubah.','good')};
 $('backup-import-confirm').onclick=async()=>{const b=pendingBackupRestore;if(!b)return;if(!requireImportPassword('Pemulihan / Import Backup'))return;if(!confirm('PERINGATAN AKHIR: Ganti seluruh database lokal dengan backup '+b.fileName+'?'))return;try{const candidate=b.candidate,prior=Array.isArray(state.auditLogs)?state.auditLogs:[];state={...emptyState(),...candidate};state.auditLogs=[...new Map([...prior,...(Array.isArray(candidate.auditLogs)?candidate.auditLogs:[])].map(x=>[x.id||JSON.stringify(x),x])).values()].sort((x,y)=>String(y.at).localeCompare(String(x.at)));if(state.npTemplate?.fields)state.npTemplate.fields.forEach(f=>{if(Array.isArray(f.raw))f.raw=new Uint8Array(f.raw)});await persist();pendingBackupRestore=null;$('backup-import-review').hidden=true;$('backup-file').value='';renderDashboard();renderAccounts();renderNptrans();renderJournals();renderOpeningBalances();renderPeriodControl();setMessage('backup-message','Backup '+b.fileName+' berhasil dipulihkan. Database aktif telah diganti.','good');toast('Pemulihan selesai.')}catch(err){setMessage('backup-message','Pemulihan gagal: '+err.message,'bad')}};


async function init(){await loadState();state.auditLogs=Array.isArray(state.auditLogs)?state.auditLogs:[];state.debitNotes=Array.isArray(state.debitNotes)?state.debitNotes:[];ensurePeriodControl();for(const id of ['ledger-period','report-period','opening-period'])if($(id))$(id).value=state.periodControl.activePeriod;await loadDirectoryHandle();state.accounts=state.accounts.map(a=>({code:String(a.code??'').trim(),name:String(a.name??'')}));syncNptransSandis();auditBaseline=auditClone({accounts:state.accounts,journals:state.journals,nptrans:state.nptrans,openingBalances:state.openingBalances,debitNotes:state.debitNotes});await persist();resetAccountForm();resetJournalForm();renderDashboard();renderAccounts();renderPeriodControl();resetDebitNoteForm();debitNoteGroupOptions();renderDebitNoteSelectedSources();renderDebitNotes();if(backupDirectoryHandle){const permission=await directoryPermission(backupDirectoryHandle,false);setMessage('backup-message',permission==='granted'?'Folder backup server terhubung. Backup otomatis aktif setiap ada perubahan data.':'Folder backup pernah dihubungkan, tetapi izinnya perlu diaktifkan kembali. Tekan tombol Hubungkan / Aktifkan Ulang.',''+(permission==='granted'?'good':'bad'))}if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn);setInterval(()=>{if(backupDirectoryHandle&&Date.now()-lastAutoBackupAt>=30*60*1000)runAutomaticBackup('jadwal berkala 30 menit')},60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&backupDirectoryHandle&&Date.now()-lastAutoBackupAt>=30*60*1000)runAutomaticBackup('aplikasi aktif kembali')})}
init();