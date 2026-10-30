/* SBP Accounting V19 — browser-only accounting core.
   Local persistence: IndexedDB. DBF export reuses a real source DBF schema as a safety requirement. */
const DB_NAME='sbp-accounting-v19', STORE='app', STATE_KEY='main';
const emptyState=()=>({accounts:[],journals:[],nptrans:[],npTemplate:null,meta:{version:19}});
let state=emptyState(), editingId=null, editingAccountCode=null, pendingNpImport=null;
const $=id=>document.getElementById(id);
const money=n=>'Rp '+Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}
function setMessage(id,msg,type=''){const el=$(id);el.textContent=msg;el.className='inline-message'+(type?' '+type:'')}
function dbOpen(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window)){reject(new Error('IndexedDB tidak tersedia di browser ini'));return}const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function loadState(){try{const db=await dbOpen();const value=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(STATE_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();state=value||emptyState()}catch(e){console.warn(e);try{state=JSON.parse(localStorage.getItem(DB_NAME))||emptyState()}catch{state=emptyState()}toast('Penyimpanan IndexedDB tidak tersedia; mode cadangan browser aktif.')} }
async function persist(){try{const db=await dbOpen();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,STATE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){localStorage.setItem(DB_NAME,JSON.stringify(state));console.warn('Fallback localStorage',e)}}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const labels={dashboard:'Dashboard',journal:'Input Jurnal','journal-list':'Daftar Jurnal',accounts:'Master Akun',nptrans:'NPTRANS / DBF',reports:'Laporan',backup:'Backup & Restore'};$('page-title').textContent=labels[page]||page;if(page==='dashboard')renderDashboard();if(page==='journal-list')renderJournals();if(page==='accounts')renderAccounts();if(page==='nptrans')renderNptrans();if(page==='reports')renderTrialBalance()}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('.list-toggle').forEach(b=>b.addEventListener('click',()=>{const panel=$(b.dataset.target);if(!panel)return;const opening=panel.hidden;panel.hidden=!opening;b.setAttribute('aria-expanded',String(opening));const labels={'account-list-content':opening?'− Sembunyikan daftar akun':'＋ Tampilkan '+state.accounts.length+' akun','journal-list-content':opening?'− Sembunyikan daftar jurnal':'＋ Tampilkan daftar jurnal','np-list-content':opening?'− Sembunyikan data NPTRANS':'＋ Tampilkan data NPTRANS','trial-balance-content':opening?'− Sembunyikan neraca saldo':'＋ Tampilkan neraca saldo'};b.textContent=labels[b.dataset.target]||'Tampilkan / sembunyikan';}));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('quick-journal').onclick=()=>{resetJournalForm();go('journal')};

function fmtDate(d){if(!d)return '';const x=new Date(d+'T00:00:00');return Number.isNaN(x.getTime())?d:x.toLocaleDateString('id-ID')}
function renderDashboard(){const posted=state.journals.filter(j=>j.status!=='draft');const lines=posted.flatMap(j=>j.lines||[]),debit=lines.reduce((a,l)=>a+Number(l.debit||0),0),credit=lines.reduce((a,l)=>a+Number(l.credit||0),0);$('stat-debit').textContent=money(debit);$('stat-credit').textContent=money(credit);$('stat-journals').textContent=posted.length.toLocaleString('id-ID');$('stat-nptrans').textContent=state.nptrans.length.toLocaleString('id-ID');const recent=posted.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent-journals').innerHTML=recent.length?journalTable(recent,false):'<div class="empty">Belum ada jurnal tersimpan.</div>'}
function accountOptions(selected=''){return '<option value="">Pilih akun</option>'+state.accounts.map(a=>'<option value="'+esc(a.code)+'" '+(a.code===selected?'selected':'')+'>'+esc(a.code)+' — '+esc(a.name)+'</option>').join('')}
function addJournalLine(line={}){const tr=document.createElement('tr');tr.className='entry-row';tr.innerHTML='<td><select class="line-code">'+accountOptions(line.code||'')+'</select></td><td class="line-account-name">'+esc((state.accounts.find(a=>a.code===line.code)||{}).name||'—')+'</td><td><input class="line-note" placeholder="Keterangan baris" value="'+esc(line.note||'')+'"></td><td><input class="amount line-debit" type="number" min="0" step="0.01" value="'+(line.debit||'')+'"></td><td><input class="amount line-credit" type="number" min="0" step="0.01" value="'+(line.credit||'')+'"></td><td><button class="icon-btn remove-line" type="button">×</button></td>';tr.querySelector('.line-code').onchange=()=>{const a=state.accounts.find(x=>x.code===tr.querySelector('.line-code').value);tr.querySelector('.line-account-name').textContent=a?a.name:'—'};tr.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateJournalTotals));tr.querySelector('.remove-line').onclick=()=>{if($('journal-lines').children.length>2){tr.remove();updateJournalTotals()}else toast('Minimal dua baris akun diperlukan.')};$('journal-lines').appendChild(tr);updateJournalTotals()}
function resetJournalForm(){editingId=null;$('j-date').value=new Date().toISOString().slice(0,10);$('j-number').value='';$('j-description').value='';$('journal-lines').innerHTML='';addJournalLine();addJournalLine();$('save-journal').textContent='Simpan jurnal';setMessage('journal-message','Jurnal hanya dapat disimpan jika debit dan kredit seimbang.')}
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
 const prepared=[];for(const g of groups.values()){if(Math.abs(g.debit-g.credit)>.005)errors.push(g.number+': jurnal tidak seimbang (debit '+money(g.debit)+'; kredit '+money(g.credit)+').');if(g.lines.length<2)errors.push(g.number+': minimal dua baris akun.');if(state.journals.some(j=>j.number===g.number))errors.push(g.number+': nomor bukti sudah ada di Daftar Jurnal.');prepared.push({...g,id:crypto.randomUUID(),status:'posted',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}
 return {prepared,errors};
}
function showBulkPreview(rows){
 const result=validateBulkJournals(rows);pendingBulkJournals=result.errors.length?[]:result.prepared;
 $('bulk-journal-summary').textContent=rows.length+' baris · '+result.prepared.length+' nomor bukti';
 $('bulk-journal-detail').textContent=result.errors.length?'Ditemukan '+result.errors.length+' masalah. Perbaiki file sebelum menyimpan.':'Semua jurnal lolos validasi. Debit dan kredit seimbang; siap disimpan.';
 $('bulk-journal-errors').hidden=!result.errors.length;$('bulk-journal-errors').innerHTML=result.errors.length?'<b>Perlu diperbaiki:</b><ul>'+result.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>':'';
 $('bulk-journal-preview-rows').innerHTML=rows.slice(0,100).map(r=>'<tr><td>'+esc(r.date||'—')+'</td><td>'+esc(r.number)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.code)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td></tr>').join('');
 $('bulk-journal-save').disabled=!!result.errors.length;$('bulk-journal-review').hidden=false;
 setMessage('bulk-journal-message',result.errors.length?'Validasi gagal. Tidak ada data yang disimpan.':'Validasi berhasil. Tekan Simpan Jurnal Massal untuk menyimpan.',result.errors.length?'bad':'good');
}
$('bulk-journal-file').onchange=e=>{const f=e.target.files?.[0];$('bulk-journal-file-name').textContent=f?f.name:'Belum ada file dipilih.';$('bulk-journal-preview').disabled=!f;pendingBulkJournals=[];$('bulk-journal-review').hidden=true};
$('bulk-journal-preview').onclick=async()=>{const f=$('bulk-journal-file').files?.[0];if(!f)return;try{let rows;if(/\.xlsx?$/i.test(f.name)){if(!window.XLSX)throw Error('Mesin Excel lokal belum siap.');const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:false});let found=null;for(const name of wb.SheetNames){const data=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true});try{parseBulkJournalRows(data);found=data;break}catch{}}if(!found)throw Error('Format kolom jurnal tidak ditemukan pada sheet Excel.');rows=parseBulkJournalRows(found)}else rows=parseBulkJournalRows(parseCSV(await f.text()));showBulkPreview(rows)}catch(err){pendingBulkJournals=[];$('bulk-journal-review').hidden=true;setMessage('bulk-journal-message','Gagal membaca file: '+err.message,'bad')}};
$('bulk-journal-save').onclick=async()=>{if(!pendingBulkJournals.length)return;const existing=new Set(state.journals.map(j=>j.number));if(pendingBulkJournals.some(j=>existing.has(j.number))){setMessage('bulk-journal-message','Ada nomor bukti yang sudah tersimpan. Periksa kembali file.','bad');return}try{state.journals.push(...pendingBulkJournals);await persist();const count=pendingBulkJournals.length;pendingBulkJournals=[];$('bulk-journal-review').hidden=true;$('bulk-journal-file').value='';$('bulk-journal-file-name').textContent='Belum ada file dipilih.';$('bulk-journal-preview').disabled=true;renderDashboard();renderJournals();setMessage('bulk-journal-message',count+' jurnal berhasil disimpan dan siap dilihat di Daftar Jurnal.','good');toast(count+' jurnal massal berhasil disimpan.');go('journal-list');const toggle=document.querySelector('[data-target="journal-list-content"]');if(toggle&&$('journal-list-content').hidden)toggle.click()}catch(err){setMessage('bulk-journal-message','Penyimpanan gagal: '+err.message,'bad')}};
$('bulk-journal-cancel').onclick=()=>{$('bulk-journal-review').hidden=true;pendingBulkJournals=[]};
$('bulk-journal-template').onclick=()=>exportXlsxSheet('Format-Import-Jurnal-Massal-SBP.xlsx','Input Jurnal',[['TANGGAL','NOBUKTI','KETERANGAN','STATUS','SANDI','KETERANGAN BARIS','DEBIT','KREDIT'],['2026-10-01','JU/001/2026','Contoh transaksi','POSTED','111.100','Kas bertambah',100000,0],['2026-10-01','JU/001/2026','Contoh transaksi','POSTED','311.100','Modal disetor',0,100000]]);

$('add-line').onclick=()=>addJournalLine();$('clear-journal').onclick=resetJournalForm;
$('save-journal').onclick=async()=>{const date=$('j-date').value,number=$('j-number').value.trim(),description=$('j-description').value.trim(),rows=[...document.querySelectorAll('.entry-row')].map(r=>({code:r.querySelector('.line-code').value,note:r.querySelector('.line-note').value.trim(),debit:Number(r.querySelector('.line-debit').value||0),credit:Number(r.querySelector('.line-credit').value||0)}));const debit=rows.reduce((s,x)=>s+x.debit,0),credit=rows.reduce((s,x)=>s+x.credit,0);if(!date||!number||!description){setMessage('journal-message','Tanggal, nomor bukti, dan keterangan wajib diisi.','bad');return}if(rows.some(x=>!x.code||(!x.debit&&!x.credit)||(x.debit&&x.credit)||x.debit<0||x.credit<0)){setMessage('journal-message','Periksa kode akun dan nilai debit/kredit pada setiap baris.','bad');return}if(Math.abs(debit-credit)>.005){setMessage('journal-message','Jurnal belum seimbang. Selisih: '+money(Math.abs(debit-credit)), 'bad');return}if(state.journals.some(j=>j.number===number&&j.id!==editingId)){setMessage('journal-message','Nomor bukti sudah digunakan.','bad');return}const item={...(state.journals.find(j=>j.id===editingId)||{}),id:editingId||crypto.randomUUID(),date,number,description,lines:rows,status:'posted',updatedAt:new Date().toISOString()};if(editingId){state.journals=state.journals.map(j=>j.id===editingId?item:j)}else{item.createdAt=item.updatedAt;state.journals.push(item)}await persist();toast(editingId?'Jurnal diperbarui.':'Jurnal tersimpan.');resetJournalForm();go('journal-list')};
function exportJournalsXlsx(){const rows=[['TANGGAL','NOBUKTI','KETERANGAN','STATUS','SANDI','KETERANGAN BARIS','DEBIT','KREDIT'],...state.journals.flatMap(j=>(j.lines||[]).map(l=>[j.date,j.number,j.description,j.status==='draft'?'DRAFT':'POSTED',l.code,l.note,l.debit||0,l.credit||0]))];exportXlsxSheet('Daftar-Jurnal.xlsx','Daftar Jurnal',rows)}
function journalTable(items,actions=true){
 const rows=items.map(j=>{
  const d=(j.lines||[]).reduce((s,x)=>s+Number(x.debit||0),0),c=(j.lines||[]).reduce((s,x)=>s+Number(x.credit||0),0);
  const details=(j.lines||[]).map(l=>'<tr><td>'+esc(l.code)+'</td><td>'+esc((state.accounts.find(a=>a.code===l.code)||{}).name||'—')+'</td><td>'+esc(l.note||'')+'</td><td class="num">'+money(l.debit)+'</td><td class="num">'+money(l.credit)+'</td></tr>').join('');
  return '<tr class="journal-main-row"><td>'+esc(fmtDate(j.date))+'</td><td><b>'+esc(j.number)+'</b></td><td class="journal-description">'+esc(j.description)+'</td><td><span class="tag '+(j.status==='draft'?'np-warn':'np-ok')+'">'+(j.status==='draft'?'DRAFT':'TERPOSTING')+'</span></td><td class="num">'+(j.lines||[]).length+'</td><td class="num">'+money(d)+'</td><td class="num">'+money(c)+'</td>'+(actions?'<td class="journal-actions"><button class="journal-icon-btn detail-journal" data-id="'+esc(j.id)+'" title="Lihat detail" aria-label="Lihat detail">⌄</button><button class="journal-icon-btn edit-journal" data-id="'+esc(j.id)+'" title="Edit jurnal" aria-label="Edit jurnal">✎</button><button class="journal-icon-btn danger delete-journal" data-id="'+esc(j.id)+'" title="Hapus jurnal" aria-label="Hapus jurnal">×</button></td>':'')+'</tr>'+(actions?'<tr class="journal-detail-row" data-detail="'+esc(j.id)+'" hidden><td colspan="8"><div class="journal-detail-box"><b>Rincian akun · '+esc(j.number)+'</b><div class="table-wrap"><table class="journal-lines-table"><thead><tr><th>SANDI</th><th>Nama akun</th><th>Keterangan baris</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>'+details+'</tbody></table></div></div></td></tr>':'');
 }).join('');
 return '<div class="table-wrap journal-table-wrap"><table class="journal-list-table"><thead><tr><th>Tanggal</th><th>No. bukti</th><th>Keterangan</th><th>Status</th><th>Baris</th><th>Total debit</th><th>Total kredit</th>'+(actions?'<th>Aksi</th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
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
 document.querySelectorAll('.delete-journal').forEach(b=>b.onclick=async()=>{const j=state.journals.find(x=>x.id===b.dataset.id);if(j&&confirm('Hapus jurnal '+j.number+'? Tindakan ini tidak dapat dibatalkan.')){state.journals=state.journals.filter(x=>x.id!==b.dataset.id);await persist();renderJournals();renderDashboard();toast('Jurnal dihapus.')}});
}
let journalPage=0;
function editJournal(id){const j=state.journals.find(x=>x.id===id);if(!j)return;editingId=id;$('j-date').value=j.date;$('j-number').value=j.number;$('j-description').value=j.description;$('journal-lines').innerHTML='';j.lines.forEach(l=>addJournalLine(l));$('save-journal').textContent=j.status==='draft'?'Lengkapi & posting jurnal':'Simpan perubahan';go('journal')}
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
  const code=b.dataset.code,usedJournal=state.journals.some(j=>(j.lines||[]).some(l=>l.code===code)),usedNp=state.nptrans.some(r=>r.sandi===code);
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
$('np-template').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const p=parseDBF(await f.arrayBuffer());state.npTemplate={fields:p.fields,version:p.version};await persist();renderNptrans();setMessage('np-message','Struktur template DBF berhasil dibaca: '+p.fields.map(x=>x.name+'('+x.type+','+x.length+')').join(' · '),'good')}catch(err){setMessage('np-message','Template gagal dibaca: '+err.message,'bad')}e.target.value=''};
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

function exportTrialBalanceXlsx(){const map=new Map();state.journals.filter(j=>j.status!=='draft').forEach(j=>(j.lines||[]).forEach(l=>{const v=map.get(l.code)||{debit:0,credit:0};v.debit+=Number(l.debit||0);v.credit+=Number(l.credit||0);map.set(l.code,v)}));const rows=[['SANDI','NAMA AKUN','TOTAL DEBIT','TOTAL KREDIT','SALDO BERSIH D/(K)'],...[...map].map(([code,v])=>[code,state.accounts.find(a=>a.code===code)?.name||'(Akun tidak ditemukan)',v.debit,v.credit,v.debit-v.credit])];exportXlsxSheet('Neraca-Saldo.xlsx','Neraca Saldo',rows)}
function renderTrialBalance(){const postedJournals=state.journals.filter(j=>j.status!=='draft');if(!postedJournals.length){$('trial-balance').innerHTML='<div class="empty">Belum ada data jurnal.</div>';return}const map=new Map();postedJournals.forEach(j=>j.lines.forEach(l=>{const a=map.get(l.code)||{debit:0,credit:0};a.debit+=Number(l.debit||0);a.credit+=Number(l.credit||0);map.set(l.code,a)}));const rows=[...map.entries()].map(([code,v])=>({code,name:state.accounts.find(a=>a.code===code)?.name||'(Akun tidak ditemukan)',debit:v.debit,credit:v.credit,balance:v.debit-v.credit}));const td=rows.reduce((s,r)=>s+r.debit,0),tc=rows.reduce((s,r)=>s+r.credit,0);$('trial-balance').innerHTML='<div class="table-wrap"><table><thead><tr><th>Kode</th><th>Nama akun</th><th>Total debit</th><th>Total kredit</th><th>Saldo bersih D/(K)</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td>'+money(r.debit)+'</td><td>'+money(r.credit)+'</td><td>'+money(r.balance)+'</td></tr>').join('')+'<tr><th colspan="2">TOTAL</th><th>'+money(td)+'</th><th>'+money(tc)+'</th><th>'+money(td-tc)+'</th></tr></tbody></table></div>'}
$('print-report').onclick=()=>window.print();$('export-trial-xlsx').onclick=exportTrialBalanceXlsx;

$('backup-download').onclick=()=>{const safeState=JSON.parse(JSON.stringify(state));if(safeState.npTemplate?.fields)safeState.npTemplate.fields.forEach(f=>{if(f.raw&&typeof f.raw==='object')f.raw=Array.from(f.raw)});const payload={app:'SBP Accounting',version:19,exportedAt:new Date().toISOString(),state:safeState};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'SBP-Accounting-V19-backup.json');setMessage('backup-message','Backup JSON berhasil disiapkan. Simpan di lokasi aman.','good')};
$('backup-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const parsed=JSON.parse(await f.text()),candidate=parsed.state||parsed;if(!Array.isArray(candidate.accounts)||!Array.isArray(candidate.journals)||!Array.isArray(candidate.nptrans))throw Error('Struktur backup tidak dikenali.');if(!confirm('Pulihkan backup? Data lokal saat ini akan digantikan.'))return;state={...emptyState(),...candidate};if(state.npTemplate?.fields)state.npTemplate.fields.forEach(f=>{if(Array.isArray(f.raw))f.raw=new Uint8Array(f.raw)});await persist();renderDashboard();setMessage('backup-message','Backup berhasil dipulihkan.','good');toast('Pemulihan selesai.')}catch(err){setMessage('backup-message','Pemulihan gagal: '+err.message,'bad')}e.target.value=''};

async function init(){await loadState();state.accounts=state.accounts.map(a=>({...a,ptdacost:Number(a.ptdacost||0),mutasiDebit:Number(a.mutasiDebit||0),mutasiKredit:Number(a.mutasiKredit||0)}));syncNptransSandis();const migratedDrafts=createNpDraftJournals(state.nptrans);await persist();if(migratedDrafts.created)console.info('Migrasi NPTRANS lama: '+migratedDrafts.created+' draft jurnal dibuat.');resetAccountForm();resetJournalForm();renderDashboard();renderAccounts();renderNptrans();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn)}
init();