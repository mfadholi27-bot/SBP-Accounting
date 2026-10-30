/* SBP Accounting V19 — browser-only accounting core.
   Local persistence: IndexedDB. DBF export reuses a real source DBF schema as a safety requirement. */
const DB_NAME='sbp-accounting-v19', STORE='app', STATE_KEY='main';
const emptyState=()=>({accounts:[],journals:[],nptrans:[],openingBalances:[],npTemplate:null,meta:{version:19}});
let state=emptyState(), editingId=null, editingAccountCode=null, pendingNpImport=null;
const $=id=>document.getElementById(id);
const money=n=>'Rp '+Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}
function requireImportPassword(action){const value=prompt('Masukkan password PKS untuk '+action+':');if(value===null)return false;if(value!=='PKS123'){toast('Password salah. Proses import dibatalkan.');return false}return true}
function setMessage(id,msg,type=''){const el=$(id);el.textContent=msg;el.className='inline-message'+(type?' '+type:'')}
function dbOpen(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window)){reject(new Error('IndexedDB tidak tersedia di browser ini'));return}const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function loadState(){try{const db=await dbOpen();const value=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(STATE_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();state=value||emptyState()}catch(e){console.warn(e);try{state=JSON.parse(localStorage.getItem(DB_NAME))||emptyState()}catch{state=emptyState()}toast('Penyimpanan IndexedDB tidak tersedia; mode cadangan browser aktif.')} }
async function persist(){try{const db=await dbOpen();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,STATE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){localStorage.setItem(DB_NAME,JSON.stringify(state));console.warn('Fallback localStorage',e)}}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const labels={dashboard:'Dashboard',journal:'Input Jurnal','journal-list':'Daftar Jurnal',accounts:'Master Akun','opening-balances':'Saldo Awal ACC & Program',ledger:'Buku Besar per Akun',nptrans:'NPTRANS / DBF',reports:'Laporan',backup:'Backup & Restore'};$('page-title').textContent=labels[page]||page;if(page==='dashboard')renderDashboard();if(page==='journal-list')renderJournals();if(page==='accounts')renderAccounts();if(page==='opening-balances')renderOpeningBalances();if(page==='nptrans')renderNptrans();if(page==='reports')renderTrialBalance();if(page==='ledger')renderLedger()}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('.list-toggle').forEach(b=>b.addEventListener('click',()=>{const panel=$(b.dataset.target);if(!panel)return;const opening=panel.hidden;panel.hidden=!opening;b.setAttribute('aria-expanded',String(opening));const labels={'account-list-content':opening?'− Sembunyikan daftar akun':'＋ Tampilkan '+state.accounts.length+' akun','journal-list-content':opening?'− Sembunyikan daftar jurnal':'＋ Tampilkan daftar jurnal','np-list-content':opening?'− Sembunyikan data NPTRANS':'＋ Tampilkan data NPTRANS','trial-balance-content':opening?'− Sembunyikan neraca saldo':'＋ Tampilkan neraca saldo'};b.textContent=labels[b.dataset.target]||'Tampilkan / sembunyikan';}));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('quick-journal').onclick=()=>{resetJournalForm();go('journal')};

function fmtDate(d){if(!d)return '';const x=new Date(d+'T00:00:00');return Number.isNaN(x.getTime())?d:x.toLocaleDateString('id-ID')}
function renderDashboard(){const posted=state.journals.filter(j=>j.status==='posted'||(!j.status&&j.status!=='draft'));const lines=posted.flatMap(j=>j.lines||[]),debit=lines.reduce((a,l)=>a+Number(l.debit||0),0),credit=lines.reduce((a,l)=>a+Number(l.credit||0),0);$('stat-debit').textContent=money(debit);$('stat-credit').textContent=money(credit);$('stat-journals').textContent=posted.length.toLocaleString('id-ID');const recent=posted.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent-journals').innerHTML=recent.length?journalTable(recent,false):'<div class="empty">Belum ada jurnal tersimpan.</div>'}
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
 const errors=[],groups=new Map(),known=new Set(state.accounts.map(a=>String(a.code)));
 rows.forEach(r=>{
  if(!r.date)errors.push('Baris '+r.row+': tanggal tidak valid.');
  if(!r.number)errors.push('Baris '+r.row+': nomor bukti kosong.');
  if(!r.description)errors.push('Baris '+r.row+': keterangan jurnal kosong.');
  if(!r.code)errors.push('Baris '+r.row+': SANDI kosong.');else if(!known.has(r.code))errors.push('Baris '+r.row+': SANDI '+r.code+' belum ada di Master Akun.');
  if(!Number.isFinite(r.debit)||!Number.isFinite(r.credit)||r.debit<0||r.credit<0)errors.push('Baris '+r.row+': nilai debit/kredit tidak valid.');
  else if((r.debit>0)===(r.credit>0))errors.push('Baris '+r.row+': isi tepat satu sisi, debit atau kredit.');
  const key=r.date+'|'+r.number;if(!groups.has(key))groups.set(key,{date:r.date,number:r.number,description:r.description,lines:[],debit:0,credit:0});
  const g=groups.get(key);if(g.description!==r.description)errors.push('Nomor '+r.number+': keterangan berbeda dalam satu nomor bukti.');
  g.lines.push({code:r.code,note:r.note,debit:r.debit,credit:r.credit});g.debit+=Number.isFinite(r.debit)?r.debit:0;g.credit+=Number.isFinite(r.credit)?r.credit:0;
 });
 const prepared=[];for(const g of groups.values()){if(Math.abs(g.debit-g.credit)>.005)errors.push(g.number+': jurnal tidak seimbang (debit '+money(g.debit)+'; kredit '+money(g.credit)+').');if(g.lines.length<2)errors.push(g.number+': minimal dua baris akun.');if(state.journals.some(j=>j.number===g.number))errors.push(g.number+': nomor bukti sudah ada di Daftar Jurnal.');prepared.push({...g,id:crypto.randomUUID(),status:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}
 return {prepared,errors};
}
function showBulkPreview(rows){
 const result=validateBulkJournals(rows);pendingBulkJournals=result.errors.length?[]:result.prepared;
 $('bulk-journal-summary').textContent=rows.length+' baris · '+result.prepared.length+' nomor bukti';
 $('bulk-journal-detail').textContent=result.errors.length?'Ditemukan '+result.errors.length+' masalah. Perbaiki file sebelum menyimpan.':'Semua jurnal lolos validasi. Debit dan kredit seimbang; siap disimpan.';
 $('bulk-journal-errors').hidden=!result.errors.length;$('bulk-journal-errors').innerHTML=result.errors.length?'<b>Perlu diperbaiki:</b><ul>'+result.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>':'';
 $('bulk-journal-preview-rows').innerHTML=rows.slice(0,100).map(r=>'<tr><td>'+esc(r.date||'—')+'</td><td>'+esc(r.number)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.code)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td></tr>').join('');
 $('bulk-journal-save').disabled=!!result.errors.length;$('bulk-journal-review').hidden=false;
 setMessage('bulk-journal-message',result.errors.length?'Validasi gagal. Tidak ada data yang disimpan.':'Validasi berhasil. Jurnal akan disimpan sebagai Draft dan dapat diperiksa sebelum diposting.',result.errors.length?'bad':'good');
}
$('bulk-journal-file').onchange=e=>{const f=e.target.files?.[0];$('bulk-journal-file-name').textContent=f?f.name:'Belum ada file dipilih.';$('bulk-journal-preview').disabled=!f;pendingBulkJournals=[];$('bulk-journal-review').hidden=true};
$('bulk-journal-preview').onclick=async()=>{const f=$('bulk-journal-file').files?.[0];if(!f)return;try{let rows;if(/\.xlsx?$/i.test(f.name)){if(!window.XLSX)throw Error('Mesin Excel lokal belum siap.');const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:false});let found=null;for(const name of wb.SheetNames){const data=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true});try{parseBulkJournalRows(data);found=data;break}catch{}}if(!found)throw Error('Format kolom jurnal tidak ditemukan pada sheet Excel.');rows=parseBulkJournalRows(found)}else rows=parseBulkJournalRows(parseCSV(await f.text()));showBulkPreview(rows)}catch(err){pendingBulkJournals=[];$('bulk-journal-review').hidden=true;setMessage('bulk-journal-message','Gagal membaca file: '+err.message,'bad')}};
$('bulk-journal-save').onclick=async()=>{if(!pendingBulkJournals.length)return;if(!requireImportPassword('Import Jurnal Massal'))return;const existing=new Set(state.journals.map(j=>j.number));if(pendingBulkJournals.some(j=>existing.has(j.number))){setMessage('bulk-journal-message','Ada nomor bukti yang sudah tersimpan. Periksa kembali file.','bad');return}try{state.journals.push(...pendingBulkJournals);await persist();const count=pendingBulkJournals.length;pendingBulkJournals=[];$('bulk-journal-review').hidden=true;$('bulk-journal-file').value='';$('bulk-journal-file-name').textContent='Belum ada file dipilih.';$('bulk-journal-preview').disabled=true;renderDashboard();renderJournals();setMessage('bulk-journal-message',count+' jurnal berhasil disimpan dan siap dilihat di Daftar Jurnal.','good');toast(count+' jurnal massal berhasil disimpan.');go('journal-list');const toggle=document.querySelector('[data-target="journal-list-content"]');if(toggle&&$('journal-list-content').hidden)toggle.click()}catch(err){setMessage('bulk-journal-message','Penyimpanan gagal: '+err.message,'bad')}};
$('bulk-journal-cancel').onclick=()=>{$('bulk-journal-review').hidden=true;pendingBulkJournals=[]};
$('bulk-journal-template').onclick=()=>exportXlsxSheet('Format-Import-Jurnal-Massal-SBP.xlsx','Input Jurnal',[['TANGGAL','NOBUKTI','KETERANGAN','STATUS','SANDI','KETERANGAN BARIS','DEBIT','KREDIT'],['2026-10-01','JU/001/2026','Contoh transaksi','POSTED','111.100','Kas bertambah',100000,0],['2026-10-01','JU/001/2026','Contoh transaksi','POSTED','311.100','Modal disetor',0,100000]]);

$('add-line').onclick=()=>addJournalLine();$('clear-journal').onclick=resetJournalForm;
async function saveJournal(targetStatus){
 const date=$('j-date').value,number=$('j-number').value.trim(),description=$('j-description').value.trim();
 const rows=[...document.querySelectorAll('.entry-row')].map(r=>({code:r.querySelector('.line-code').value,note:r.querySelector('.line-note').value.trim(),debit:Number(r.querySelector('.line-debit').value||0),credit:Number(r.querySelector('.line-credit').value||0)}));
 if(!date||!number||!description){setMessage('journal-message','Tanggal, nomor bukti, dan keterangan wajib diisi.','bad');return}
 if(state.journals.some(j=>j.number===number&&j.id!==editingId)){setMessage('journal-message','Nomor bukti sudah digunakan.','bad');return}
 if(targetStatus==='posted'){
  if(rows.length<2||rows.some(x=>!x.code||!Number.isFinite(x.debit)||!Number.isFinite(x.credit)||(!x.debit&&!x.credit)||(x.debit&&x.credit)||x.debit<0||x.credit<0)){setMessage('journal-message','Untuk posting, setiap baris wajib memiliki akun dan hanya satu nilai debit/kredit yang valid.','bad');return}
  const debit=rows.reduce((s,x)=>s+x.debit,0),credit=rows.reduce((s,x)=>s+x.credit,0);
  if(Math.abs(debit-credit)>.005){setMessage('journal-message','Jurnal belum seimbang. Selisih: '+money(Math.abs(debit-credit)),'bad');return}
 }else if(rows.some(x=>x.debit<0||x.credit<0||!Number.isFinite(x.debit)||!Number.isFinite(x.credit))){setMessage('journal-message','Nilai debit/kredit tidak boleh negatif atau tidak valid.','bad');return}
 const old=state.journals.find(j=>j.id===editingId);
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
 document.querySelectorAll('.delete-journal').forEach(b=>b.onclick=async()=>{const j=state.journals.find(x=>x.id===b.dataset.id);if(!j||j.status!=='draft')return;if(confirm('Hapus Draft '+j.number+'?')){state.journals=state.journals.filter(x=>x.id!==b.dataset.id);await persist();renderJournals();renderDashboard();toast('Draft dihapus.')}});
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
 const ids=new Set(bulkPostCandidates.map(j=>j.id));if(!ids.size)return;
 const count=ids.size;
 if(!confirm('Konfirmasi posting '+count+' jurnal Draft yang sudah lolos validasi? Jurnal yang tidak valid tetap menjadi Draft.'))return;
 const now=new Date().toISOString();
 state.journals.forEach(j=>{if(ids.has(j.id)){j.status='posted';j.updatedAt=now;j.postedAt=now}});
 await persist();bulkPostCandidates=[];$('bulk-post-confirm').disabled=true;$('bulk-post-result').innerHTML='<p class="balance-ok"><b>'+count+' jurnal berhasil diposting.</b> Draft yang tidak lolos validasi tetap berstatus Draft.</p>';$('bulk-post-result').hidden=false;
 renderJournals();renderDashboard();renderTrialBalance();toast(count+' jurnal berhasil diposting secara kolektif.');
});
$('journal-search').addEventListener('input',()=>{journalPage=0;renderJournals()});$('journal-status-filter').addEventListener('change',()=>{journalPage=0;renderJournals()});$('journal-page-size').addEventListener('change',()=>{journalPage=0;renderJournals()});$('journal-prev').onclick=()=>{journalPage=Math.max(0,journalPage-1);renderJournals()};$('journal-next').onclick=()=>{journalPage++;renderJournals()};$('export-journals-xlsx').onclick=exportJournalsXlsx;

function accountActual(a){return Number(a.ptdacost||0)+Number(a.mutasiDebit||0)-Number(a.mutasiKredit||0)}
function syncNptransSandis(){
 const map=new Map(state.accounts.map(a=>[String(a.code),a]));let added=0;
 for(const row of state.nptrans){const code=String(row.sandi||'').trim();if(!code||map.has(code))continue;const blank={code,name:'',ptdacost:0,mutasiDebit:0,mutasiKredit:0};map.set(code,blank);added++}
 if(added)state.accounts=[...map.values()];
 return added;
}
function accountAmountInput(id,value){$(id).value=Number(value||0)}
function updateAccountActualPreview(){const v=Number($('a-ptdacost').value||0)+Number($('a-mutasi-debit').value||0)-Number($('a-mutasi-kredit').value||0);$('a-actual-balance').value=money(v)}
function renderAccounts(){
 const q=($('account-search')?.value||'').trim().toLowerCase();
 const items=state.accounts.filter(a=>(a.code+' '+a.name).toLowerCase().includes(q)).sort((a,b)=>a.code.localeCompare(b.code));
 $('account-count').textContent=state.accounts.length.toLocaleString('id-ID')+' AKUN';
 $('account-rows').innerHTML=items.length?items.map((a,index)=>'<tr><td>'+(index+1)+'</td><td><b>'+esc(a.code)+'</b></td><td>'+esc(a.name)+'</td><td class="account-number">'+money(a.ptdacost)+'</td><td class="account-number">'+money(a.mutasiDebit)+'</td><td class="account-number">'+money(a.mutasiKredit)+'</td><td class="account-number account-balance">'+money(accountActual(a))+'</td><td><button class="btn edit-account" data-code="'+esc(a.code)+'">Edit</button> <button class="icon-btn delete-account" data-code="'+esc(a.code)+'">Hapus</button></td></tr>').join(''):'<tr><td colspan="7" class="empty">Tidak ada akun yang cocok.</td></tr>';
 document.querySelectorAll('.edit-account').forEach(b=>b.onclick=()=>editAccount(b.dataset.code));
 document.querySelectorAll('.delete-account').forEach(b=>b.onclick=async()=>{
  const code=b.dataset.code,usedOpening=(state.openingBalances||[]).some(x=>x.accountCode===code),usedJournal=state.journals.some(j=>(j.lines||[]).some(l=>l.code===code)),usedNp=state.nptrans.some(r=>r.sandi===code);if(usedOpening){toast('Akun tidak dapat dihapus karena masih memiliki saldo awal. Hapus saldo awal terkait terlebih dahulu.');return}
  const warning=usedJournal||usedNp?'\\n\\nKode ini masih dipakai pada '+(usedJournal?'jurnal ':'')+(usedJournal&&usedNp?'dan ':'')+(usedNp?'transaksi NPTRANS':'')+'. Jika dihapus, data tersebut tetap ada tetapi akan berstatus akun tidak cocok.':'';
  if(confirm('Hapus akun '+code+'?'+warning)){state.accounts=state.accounts.filter(a=>a.code!==code);if(editingAccountCode===code)resetAccountForm();await persist();renderAccounts();renderNptrans();toast('Akun dihapus.')}
 });
}
function resetAccountForm(){editingAccountCode=null;$('a-code').value='';$('a-code').disabled=false;$('a-name').value='';accountAmountInput('a-ptdacost',0);accountAmountInput('a-mutasi-debit',0);accountAmountInput('a-mutasi-kredit',0);updateAccountActualPreview();$('save-account').textContent='＋ Tambah akun';$('cancel-account-edit').hidden=true}
function editAccount(code){const a=state.accounts.find(x=>x.code===code);if(!a)return;editingAccountCode=code;$('a-code').value=a.code;$('a-code').disabled=true;$('a-name').value=a.name;accountAmountInput('a-ptdacost',a.ptdacost);accountAmountInput('a-mutasi-debit',a.mutasiDebit);accountAmountInput('a-mutasi-kredit',a.mutasiKredit);updateAccountActualPreview();$('save-account').textContent='Simpan perubahan';$('cancel-account-edit').hidden=false;$('a-name').focus()}
$('cancel-account-edit').onclick=resetAccountForm;
['a-ptdacost','a-mutasi-debit','a-mutasi-kredit'].forEach(id=>$(id).addEventListener('input',updateAccountActualPreview));
$('account-search').addEventListener('input',renderAccounts);
$('save-account').onclick=async()=>{
 const code=$('a-code').value.trim(),name=$('a-name').value.trim(),ptdacost=Number($('a-ptdacost').value||0),mutasiDebit=Number($('a-mutasi-debit').value||0),mutasiKredit=Number($('a-mutasi-kredit').value||0);
 if(!code||!name){toast('Isi kode dan nama akun.');return}
 if([ptdacost,mutasiDebit,mutasiKredit].some(v=>!Number.isFinite(v))){toast('Nilai saldo dan mutasi harus berupa angka.');return}
 if(editingAccountCode){const a=state.accounts.find(x=>x.code===editingAccountCode);if(!a)return;Object.assign(a,{name,ptdacost,mutasiDebit,mutasiKredit})}
 else {if(state.accounts.some(a=>a.code===code)){toast('Kode akun sudah ada. Gunakan tombol Edit.');return}state.accounts.push({code,name,ptdacost,mutasiDebit,mutasiKredit})}
 const wasEditing=!!editingAccountCode;await persist();resetAccountForm();renderAccounts();renderNptrans();toast(wasEditing?'Akun diperbarui.':'Akun baru ditambahkan.')
};
function accountRowsAoa(){return [['SANDI','NAMA','PTDACOST','MUTASIDB','MUTASIKR'],...state.accounts.map(a=>[a.code,a.name,a.ptdacost||0,a.mutasiDebit||0,a.mutasiKredit||0])]}
function exportAccountsCsv(){const rows=[['SANDI','NAMA','PTDACOST','MUTASIDB','MUTASIKR'],...state.accounts.map(a=>[a.code,a.name,a.ptdacost||0,a.mutasiDebit||0,a.mutasiKredit||0])];downloadBlob(new Blob(['\\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\\r\\n')],{type:'text/csv;charset=utf-8'}),'Master-Akun-SBP.csv')}
function exportAccountsXlsx(){exportXlsxSheet('Master-Akun-SBP.xlsx','Master Akun',accountRowsAoa())}
$('export-accounts').onclick=exportAccountsCsv;$('export-accounts-xlsx').onclick=exportAccountsXlsx;
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'&&quoted&&next==='"'){cell+='"';i++}else if(ch==='"'){quoted=!quoted}else if(ch===','&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);return rows}
function norm(s){return String(s||'').replace(new RegExp('^'+String.fromCharCode(65279)),'').trim().toUpperCase().replace(/[ _-]/g,'')}
function mapHeaders(header){const aliases={SANDI:['SANDI','KODE','KODEAKUN','ACCOUNT'],TANGGAL:['TANGGAL','DATE'],NOBUKTI:['NOBUKTI','NOMORBUKTI','BUKTI'],NOURUT:['NOURUT','URUT','NO'],KET:['KET','KETERANGAN','URAIAN'],JUMLAH:['JUMLAH','NILAI','AMOUNT']};const out={};header.forEach((h,i)=>{for(const [key,vals] of Object.entries(aliases))if(vals.includes(norm(h)))out[key]=i});return out}
function normalizeDate(v){v=String(v||'').trim();if(/^\d{8}$/.test(v))return v.slice(6,8)+'/'+v.slice(4,6)+'/'+v.slice(0,4);if(/^\d{4}-\d\d-\d\d$/.test(v)){const [y,m,d]=v.split('-');return d+'/'+m+'/'+y}return v}
function parseAmount(v){if(v===null||v===undefined||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:NaN;let s=String(v).trim().replace(/[\\s\\u00a0]/g,'').replace(/^Rp/i,'');if(!s)return 0;s=s.replace(/[^0-9,.-]/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(',')){const parts=s.split(',');s=parts.length===2&&parts[1].length<=2?s.replace(',','.'):s.replace(/,/g,'')}const n=Number(s);return Number.isFinite(n)?n:NaN}
function csvToNp(text){const rows=parseCSV(text);if(rows.length<2)throw Error('CSV kosong atau hanya memiliki header.');const h=mapHeaders(rows[0]);const missing=['SANDI','TANGGAL','NOBUKTI','NOURUT','KET','JUMLAH'].filter(k=>h[k]===undefined);if(missing.length)throw Error('Kolom wajib tidak ditemukan: '+missing.join(', '));return rows.slice(1).map((r,i)=>({sandi:(r[h.SANDI]||'').trim(),tanggal:normalizeDate(r[h.TANGGAL]),nobukti:(r[h.NOBUKTI]||'').trim(),nourut:(r[h.NOURUT]||'').trim(),ket:(r[h.KET]||'').trim(),jumlah:parseAmount(r[h.JUMLAH]),_row:i+2}))}
function csvToAccounts(text){const rows=parseCSV(text);if(rows.length<2)throw Error('CSV master akun kosong.');const aliases={code:['SANDI','KODE','KODEAKUN','ACCOUNTCODE'],name:['NAMA','NAMAAKUN','DES','KETERANGAN','URAIAN'],pt:['PTDACOST','SALDOAWAL'],db:['MUTASIDB','MUTASIDEBIT'],kr:['MUTASIKR','MUTASIKREDIT']};let headerIndex=-1,cols=null;for(let i=0;i<Math.min(rows.length,30);i++){const h=rows[i].map(norm),find=names=>h.findIndex(x=>names.includes(x));const ci=find(aliases.code);if(ci>=0){headerIndex=i;cols={ci,ni:find(aliases.name),pi:find(aliases.pt),di:find(aliases.db),ki:find(aliases.kr)};break}}if(headerIndex<0)throw Error('Kolom SANDI tidak ditemukan. Pastikan baris judul tabel memuat kolom SANDI.');const data=rows.slice(headerIndex+1).filter(r=>r[cols.ci]&&String(r[cols.ci]).trim());if(!data.length)throw Error('Header SANDI ditemukan, tetapi tidak ada baris akun di bawahnya.');return data.map(r=>({code:String(r[cols.ci]).trim(),name:cols.ni>=0?String(r[cols.ni]||'').trim():'',ptdacost:cols.pi>=0?parseAmount(r[cols.pi]):0,mutasiDebit:cols.di>=0?parseAmount(r[cols.di]):0,mutasiKredit:cols.ki>=0?parseAmount(r[cols.ki]):0}))}

function xlsxFirstSheetToCsv(buffer){if(!window.XLSX)throw Error('Mesin Excel lokal belum termuat. Muat ulang aplikasi.');const wb=XLSX.read(buffer,{type:'array',cellDates:false});const name=wb.SheetNames[0];if(!name)throw Error('Workbook tidak memiliki lembar kerja.');return XLSX.utils.sheet_to_csv(wb.Sheets[name],{FS:',',RS:'\n'})}
function xlsxToAccounts(buffer){
 if(!window.XLSX)throw Error('Mesin Excel lokal belum termuat. Muat ulang aplikasi.');
 const wb=XLSX.read(buffer,{type:'array',cellDates:false});
 const aliases={code:['SANDI','KODE','KODEAKUN','ACCOUNTCODE'],name:['NAMA','NAMAAKUN','DES','KETERANGAN','URAIAN'],pt:['PTDACOST','SALDOAWAL'],db:['MUTASIDB','MUTASIDEBIT'],kr:['MUTASIKR','MUTASIKREDIT']};
 const errors=[];
 for(const name of wb.SheetNames){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false});
  for(let i=0;i<Math.min(rows.length,50);i++){
   const h=rows[i].map(norm),find=names=>h.findIndex(x=>names.includes(x));
   const ci=find(aliases.code);
   if(ci<0)continue;
   const cols={ci,ni:find(aliases.name),pi:find(aliases.pt),di:find(aliases.db),ki:find(aliases.kr)};
   const data=rows.slice(i+1).filter(r=>String(r[ci]??'').trim()!=='');
   if(!data.length){errors.push(name+': header SANDI ada tetapi baris akun kosong');continue}
   return data.map(r=>({code:String(r[ci]).trim(),name:cols.ni>=0?String(r[cols.ni]??'').trim():'',ptdacost:cols.pi>=0?parseAmount(r[cols.pi]):0,mutasiDebit:cols.di>=0?parseAmount(r[cols.di]):0,mutasiKredit:cols.ki>=0?parseAmount(r[cols.ki]):0}));
  }
  errors.push(name+': header SANDI tidak ditemukan pada 50 baris pertama');
 }
 throw Error('Kolom SANDI tidak ditemukan. '+errors.join(' | '));
}
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
  const date=key.split('|')[0],sourceNo=key.slice(date.length+1);
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
 const batch=pendingNpImport;
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
function accountTemplateRows(){return [['SANDI','NAMA','PTDACOST','MUTASIDB','MUTASIKR'],['114.130.2','Persediaan Barang',1000000,250000,50000],['114.140.2','Persediaan Bahan Baku',2000000,500000,100000],['716.100.','Biaya Operasional',0,1500000,250000]]}
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
    return {code,name:String(o.DES??o.NAMA??o.NAMAAKUN??o.KET??'').trim(),ptdacost:parseAmount(o.PTDACOST??0),mutasiDebit:parseAmount(o.MUTASIDB??0),mutasiKredit:parseAmount(o.MUTASIKR??0),_row:index+1};
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
 const openingMap=new Map((state.openingBalances||[]).filter(x=>x.period===period).map(x=>[String(x.accountCode),{debit:Number(x.debit||0),credit:Number(x.credit||0)}]));
 const movement=new Map();
 state.journals.filter(j=>(j.status==='posted'||(!j.status&&j.status!=='draft'))&&String(j.date||'').slice(0,7)===period).forEach(j=>(j.lines||[]).forEach(l=>{const v=movement.get(String(l.code))||{debit:0,credit:0};v.debit+=Number(l.debit||0);v.credit+=Number(l.credit||0);movement.set(String(l.code),v)}));
 const codes=new Set([...state.accounts.map(a=>String(a.code)),...openingMap.keys(),...movement.keys()]);
 return [...codes].sort((a,b)=>a.localeCompare(b)).map(code=>{
  const account=state.accounts.find(a=>String(a.code)===code),explicit=openingMap.get(code);
  // Prioritas: saldo awal periode yang diinput pada modul; jika belum ada, gunakan saldo legacy Master Akun.
  const legacy=account?accountActual(account):0,netOpening=explicit?(explicit.debit-explicit.credit):legacy;
  const openingDebit=Math.max(netOpening,0),openingCredit=Math.max(-netOpening,0),move=movement.get(code)||{debit:0,credit:0};
  const net=netOpening+move.debit-move.credit;
  return {code,name:account?.name||'(Akun tidak ditemukan)',openingDebit,openingCredit,debit:move.debit,credit:move.credit,endingDebit:Math.max(net,0),endingCredit:Math.max(-net,0),balance:net};
 });
}

function ledgerOpeningNet(period,account){
 const record=(state.openingBalances||[]).find(x=>x.period===period&&String(x.accountCode)===String(account.code));
 return record?Number(record.debit||0)-Number(record.credit||0):accountActual(account);
}
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
function renderTrialBalance(){const period=$('report-period').value,rows=getTrialBalanceRows(period);const td=rows.reduce((n,r)=>n+r.openingDebit+r.debit,0),tc=rows.reduce((n,r)=>n+r.openingCredit+r.credit,0),ed=rows.reduce((n,r)=>n+r.endingDebit,0),ec=rows.reduce((n,r)=>n+r.endingCredit,0);$('trial-balance').innerHTML=rows.length?'<div class="trial-period-note">Periode '+esc(period)+' · Saldo awal dari Saldo Awal ACC & Program; jika belum tersedia, menggunakan saldo legacy Master Akun. Mutasi hanya dari jurnal terposting pada periode ini.</div><div class="table-wrap"><table><thead><tr><th>SANDI</th><th>Nama akun</th><th>Saldo awal D</th><th>Saldo awal K</th><th>Mutasi D</th><th>Mutasi K</th><th>Saldo akhir D</th><th>Saldo akhir K</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td>'+money(r.openingDebit)+'</td><td>'+money(r.openingCredit)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td><td>'+money(r.endingDebit)+'</td><td>'+money(r.endingCredit)+'</td></tr>').join('')+'<tr><th colspan="2">TOTAL</th><th>'+money(rows.reduce((n,r)=>n+r.openingDebit,0))+'</th><th>'+money(rows.reduce((n,r)=>n+r.openingCredit,0))+'</th><th>'+money(rows.reduce((n,r)=>n+r.debit,0))+'</th><th>'+money(rows.reduce((n,r)=>n+r.credit,0))+'</th><th>'+money(ed)+'</th><th>'+money(ec)+'</th></tr></tbody></table></div><p class="trial-balance-check">Selisih saldo akhir: <b class="'+(Math.abs(ed-ec)<.005?'balance-ok':'balance-warn')+'">'+money(ed-ec)+'</b></p>':'<div class="empty">Belum ada saldo awal atau jurnal untuk periode ini.</div>'}
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
 if(!matches.length){toast('Tidak ada jurnal pada periode tersebut.');return}
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
 document.querySelectorAll('.opening-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Hapus saldo awal akun '+b.dataset.code+' untuk periode '+period+'?'))return;state.openingBalances=state.openingBalances.filter(x=>!(x.period===period&&x.accountCode===b.dataset.code));await persist();renderOpeningBalances();toast('Saldo awal dihapus.')});
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

/* PRINT ENGINE V1 — independent report renderer; does not mutate accounting records. */
const PRINT_CONFIG={paper:'F4',orientation:'auto',header:'simple',signatures:true,summary:true,pageNumbers:true};
function printMoney(v){return money(Number(v||0))}
function printTable(headers,rows,foot=''){return '<table class="sbp-print-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody>'+(foot?'<tfoot>'+foot+'</tfoot>':'')+'</table>'}
function printSummary(items){return PRINT_CONFIG.summary?'<section class="sbp-print-summary">'+items.map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+'</section>':''}
function printSignatures(){return PRINT_CONFIG.signatures?'<section class="sbp-print-signatures"><div><span>Disiapkan oleh,</span><b></b><small>(........................................)</small></div><div><span>Diperiksa oleh,</span><b></b><small>(........................................)</small></div><div><span>Disetujui oleh,</span><b></b><small>(........................................)</small></div></section>':''}
function printDocument(title,subtitle,body,orientation='portrait'){
 let root=document.getElementById('sbp-print-root');if(!root){root=document.createElement('div');root.id='sbp-print-root';document.body.appendChild(root)}
 const now=new Date(),printed=now.toLocaleString('id-ID',{dateStyle:'long',timeStyle:'short'});
 root.innerHTML='<div class="sbp-print-sheet"><header class="sbp-print-header"><div class="sbp-print-brand">SBP ACCOUNTING <small>SISTEM INFORMASI AKUNTANSI · V19</small></div><div class="sbp-print-heading"><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div></header><div class="sbp-print-meta"><span>Dicetak: '+esc(printed)+'</span><span>Dokumen internal</span></div>'+body+printSignatures()+'<footer class="sbp-print-footer">SBP Accounting V19 · Dokumen hasil cetak sistem</footer></div>';
 document.body.classList.add('sbp-printing');document.documentElement.dataset.printOrientation=orientation;let pageRule=document.getElementById('sbp-print-page-rule');if(!pageRule){pageRule=document.createElement('style');pageRule.id='sbp-print-page-rule';document.head.appendChild(pageRule)}pageRule.textContent='@page{size: '+(orientation==='landscape'?'330mm 215mm':'215mm 330mm')+';margin: '+(orientation==='landscape'?'10mm':'13mm 12mm 16mm')+'}';document.title='SBP Accounting - '+title;
 const cleanup=()=>{document.body.classList.remove('sbp-printing');delete document.documentElement.dataset.printOrientation;document.title='SBP Accounting V19';root.innerHTML='';pageRule.remove();window.removeEventListener('afterprint',cleanup)};
 window.addEventListener('afterprint',cleanup,{once:true});
 requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
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
function printAccounts(){
 const q=($('account-search')?.value||'').trim().toLowerCase(),items=state.accounts.filter(a=>(a.code+' '+a.name).toLowerCase().includes(q)).sort((a,b)=>a.code.localeCompare(b.code));
 const d=items.reduce((n,a)=>n+Math.max(accountActual(a),0),0),c=items.reduce((n,a)=>n+Math.max(-accountActual(a),0),0);
 const body=printSummary([['Jumlah akun',String(items.length)],['Total saldo debit',printMoney(d)],['Total saldo kredit',printMoney(c)]])+printTable(['NO','KODE / SANDI','NAMA AKUN','SALDO AWAL','MUTASI DEBIT','MUTASI KREDIT','SALDO AKTUAL'],items.map((a,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(a.code)+'</td><td>'+esc(a.name)+'</td><td class="num">'+printMoney(a.ptdacost)+'</td><td class="num">'+printMoney(a.mutasiDebit)+'</td><td class="num">'+printMoney(a.mutasiKredit)+'</td><td class="num">'+printMoney(accountActual(a))+'</td></tr>'));
 printDocument('DAFTAR MASTER AKUN','Seluruh akun sesuai filter pencarian aktif',body,'landscape');
}
function printJournalList(){
 const q=($('journal-search')?.value||'').toLowerCase().trim(),status=$('journal-status-filter')?.value||'all',items=state.journals.filter(j=>(j.number+' '+j.description+' '+(j.date||'')).toLowerCase().includes(q)&&(status==='all'||(status==='draft'?j.status==='draft':j.status!=='draft'))).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const d=items.reduce((n,j)=>n+(j.lines||[]).reduce((s,l)=>s+Number(l.debit||0),0),0),c=items.reduce((n,j)=>n+(j.lines||[]).reduce((s,l)=>s+Number(l.credit||0),0),0);
 const body=printSummary([['Jumlah jurnal',String(items.length)],['Status',status==='all'?'Semua':status==='draft'?'Draft':'Terposting'],['Total debit',printMoney(d)],['Total kredit',printMoney(c)],['Selisih',printMoney(d-c)]])+printTable(['TANGGAL','NO. BUKTI','KETERANGAN','STATUS','JUMLAH BARIS','DEBIT','KREDIT'],items.map(j=>{const jd=(j.lines||[]).reduce((n,l)=>n+Number(l.debit||0),0),jc=(j.lines||[]).reduce((n,l)=>n+Number(l.credit||0),0);return '<tr><td>'+esc(fmtDate(j.date))+'</td><td>'+esc(j.number)+'</td><td>'+esc(j.description)+'</td><td>'+(j.status==='draft'?'DRAFT':'TERPOSTING')+'</td><td class="num">'+(j.lines||[]).length+'</td><td class="num">'+printMoney(jd)+'</td><td class="num">'+printMoney(jc)+'</td></tr>'}));
 printDocument('DAFTAR JURNAL','Daftar sesuai filter pencarian dan status aktif',body,'landscape');
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
$('print-current-page').onclick=printCurrentPage;
$('print-journal-list').onclick=printJournalList;
$('print-accounts').onclick=printAccounts;
$('print-report').onclick=printTrialBalance;
$('opening-print').onclick=printOpeningBalances;
$('ledger-print').onclick=printLedger;
$('export-trial-xlsx').onclick=exportTrialBalanceXlsx;

$('backup-download').onclick=()=>{const safeState=JSON.parse(JSON.stringify(state));if(safeState.npTemplate?.fields)safeState.npTemplate.fields.forEach(f=>{if(f.raw&&typeof f.raw==='object')f.raw=Array.from(f.raw)});const payload={app:'SBP Accounting',version:19,exportedAt:new Date().toISOString(),state:safeState};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'SBP-Accounting-V19-backup.json');setMessage('backup-message','Backup JSON berhasil disiapkan. Simpan di lokasi aman.','good')};
$('backup-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!requireImportPassword('Pemulihan / Import Backup')){e.target.value='';return}try{const parsed=JSON.parse(await f.text()),candidate=parsed.state||parsed;if(!Array.isArray(candidate.accounts)||!Array.isArray(candidate.journals)||!Array.isArray(candidate.nptrans))throw Error('Struktur backup tidak dikenali.');if(!confirm('Pulihkan backup? Data lokal saat ini akan digantikan.'))return;state={...emptyState(),...candidate};if(state.npTemplate?.fields)state.npTemplate.fields.forEach(f=>{if(Array.isArray(f.raw))f.raw=new Uint8Array(f.raw)});await persist();renderDashboard();setMessage('backup-message','Backup berhasil dipulihkan.','good');toast('Pemulihan selesai.')}catch(err){setMessage('backup-message','Pemulihan gagal: '+err.message,'bad')}e.target.value=''};

async function init(){await loadState();state.accounts=state.accounts.map(a=>({...a,ptdacost:Number(a.ptdacost||0),mutasiDebit:Number(a.mutasiDebit||0),mutasiKredit:Number(a.mutasiKredit||0)}));syncNptransSandis();await persist();resetAccountForm();resetJournalForm();renderDashboard();renderAccounts();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn)}
init();