/* SBP Accounting V19 — Build 084 measured ledger pagination engine.
   Local-only, read-only presentation layer. Measures rendered table rows in a hidden
   same-origin document; never estimates row height from description character counts. */
(function(global){
 'use strict';
 const MM_TO_PX=96/25.4;
 const PAPER_MM={A4:[297,210],F4:[330,215],Letter:[279.4,215.9],Legal:[355.6,215.9]};
 const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function paginate(options){
  const o=options||{},results=Array.isArray(o.results)?o.results:[];
  if(!results.length)return {html:'',pageCount:0};
  const paper=PAPER_MM[o.paper]||PAPER_MM.F4;
  const landscape=o.orientation!=='portrait';
  const pageWidth=landscape?Math.max(...paper):Math.min(...paper);
  const pageHeight=landscape?Math.min(...paper):Math.max(...paper);
  const margin=Math.max(5,Math.min(25,Number(o.margin)||10));
  const fontSize=Math.max(6,Math.min(12,Number(o.fontSize)||8));
  const rowPadding=Math.max(.5,Math.min(3,Number(o.rowPadding)||1.2));
  const contentWidth=(pageWidth-2*(margin+5))*MM_TO_PX;
  const pageHeightPx=(pageHeight-2*(margin+5))*MM_TO_PX;
  const topReserve=38*MM_TO_PX,bottomReserve=9*MM_TO_PX;
  const pageBudget=Math.max(180,pageHeightPx-topReserve-bottomReserve);
  const tableStyle='width:'+contentWidth+'px;table-layout:fixed;border-collapse:collapse;font:'+fontSize+'pt Arial,Helvetica,sans-serif;color:#17212b';
  const cellStyle='border:'+(o.tableLines?'1px solid #aebbb4':'0')+';padding:'+rowPadding+'mm 1mm;vertical-align:middle;overflow-wrap:anywhere;line-height:1.25';
  const header='<tr><th>TANGGAL</th><th>NO. BUKTI</th><th>KETERANGAN</th><th>DEBIT</th><th>KREDIT</th><th>SALDO</th></tr>';
  const colgroup='<colgroup><col style="width:12%"><col style="width:14%"><col style="width:34%"><col style="width:13.33%"><col style="width:13.33%"><col style="width:13.34%"></colgroup>';
  const measurementFrame=document.createElement('iframe');
  measurementFrame.setAttribute('aria-hidden','true');
  measurementFrame.style.cssText='position:fixed;left:-20000px;top:0;width:'+contentWidth+'px;height:1000px;border:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(measurementFrame);
  const doc=measurementFrame.contentDocument;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:'+contentWidth+'px;font-family:Arial,Helvetica,sans-serif}.measure{'+tableStyle+'}.measure th,.measure td{'+cellStyle+'}.measure th{background:#e4eee8;color:#173c2d;text-align:center;font-weight:700}.measure td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.measure .ledger-account-heading td{background:#e4eee8;font-weight:800;padding:1.4mm}.measure .ledger-account-summary td{background:#f7faf8;font-size:7pt}.measure .ledger-carry-row td{background:#fff8e6;font-weight:700}.measure .ledger-page-subtotal td{background:#edf3ef;font-weight:700;font-size:7pt}.measure .ledger-account-final td{background:#e5f2e9;font-weight:800}</style></head><body><table class="measure">'+colgroup+'<thead>'+header+'</thead><tbody id="measure-rows"></tbody></table></body></html>');
  doc.close();
  const measureBody=doc.getElementById('measure-rows'),measureCache=new Map();
  function heightOf(html){
   if(measureCache.has(html))return measureCache.get(html);
   const holder=doc.createElement('tbody');holder.innerHTML=html;
   const row=holder.firstElementChild;if(!row)return 18;
   measureBody.appendChild(row);
   const height=Math.max(1,row.getBoundingClientRect().height||row.offsetHeight||18);
   row.remove();measureCache.set(html,height);return height;
  }
  const esc=typeof o.escape==='function'?o.escape:escapeText;
  const money=typeof o.money==='function'?o.money:(v=>String(v??0));
  const net=typeof o.net==='function'?o.net:(v=>String(v??0));
  const render=typeof o.renderMovementRow==='function'?o.renderMovementRow:(r=>'<tr><td>'+esc(r.date||'')+'</td><td>'+esc(r.number||'')+'</td><td>'+esc(r.description||'')+'</td><td class="num">'+money(r.debit)+'</td><td class="num">'+money(r.credit)+'</td><td class="num">'+net(r.balance)+'</td></tr>');
  const headingRow=(account,continuation)=>'<tr class="ledger-account-heading"><td colspan="6">'+esc(account.code)+' · '+esc(account.name)+(continuation?' — LANJUTAN':'')+'</td></tr>';
  const summaryRow=result=>'<tr class="ledger-account-summary"><td colspan="6"><span>Saldo awal: <b>'+esc(net(result.openingNet))+'</b></span></td></tr>';
  const carryRow=balance=>'<tr class="ledger-carry-row"><td colspan="5">SALDO PINDAHAN DARI HALAMAN SEBELUMNYA</td><td class="num">'+esc(net(balance))+'</td></tr>';
  const subtotalRow=(debit,credit,balance)=>'<tr class="ledger-page-subtotal"><td colspan="3">SUBTOTAL HALAMAN</td><td class="num">'+money(debit)+'</td><td class="num">'+money(credit)+'</td><td class="num">'+esc(net(balance))+'</td></tr>';
  const continueRow=()=>'<tr class="ledger-page-subtotal"><td colspan="6" style="text-align:right">BERSAMBUNG KE HALAMAN BERIKUTNYA →</td></tr>';
  const finalRow=(result,debit,credit)=>'<tr class="ledger-account-final"><td colspan="3">TOTAL AKUN · SALDO AKHIR</td><td class="num">'+money(debit)+'</td><td class="num">'+money(credit)+'</td><td class="num">'+esc(net(result.endingNet))+'</td></tr>';
  const pages=[];
  let page={html:'',used:heightOf(header),debit:0,credit:0,balance:0,hasContent:false};
  function beginPage(){page={html:'',used:heightOf(header),debit:0,credit:0,balance:0,hasContent:false}}
  function closePage(continuing){
   if(!page.hasContent)return;
   const sub=subtotalRow(page.debit,page.credit,page.balance);
   page.html+=sub;page.used+=heightOf(sub);
   if(continuing){const next=continueRow();page.html+=next;page.used+=heightOf(next)}
   pages.push(page.html);beginPage();
  }
  function add(html,height,counts){
   page.html+=html;page.used+=height;page.hasContent=true;
   if(counts){page.debit+=Number(counts.debit||0);page.credit+=Number(counts.credit||0);page.balance=Number(counts.balance||0)}
  }
  results.forEach(result=>{
   const allRows=Array.isArray(result.rows)?result.rows:[];
   const opening=allRows.find(r=>r.kind==='opening')||null;
   const movements=allRows.filter(r=>r.kind==='movement');
   let cursor=0,previousBalance=opening?Number(opening.balance||0):Number(result.openingNet||0);
   const firstHeading=headingRow(result.account,false),firstSummary=summaryRow(result);
   const openingHtml=opening?render(opening):'';
   const baseHeight=heightOf(firstHeading)+heightOf(firstSummary)+(opening?heightOf(openingHtml):0);
   const minimumFooter=heightOf(subtotalRow(0,0,previousBalance))+heightOf(finalRow(result,0,0));
   if(page.hasContent&&page.used+baseHeight+minimumFooter>pageBudget)closePage(true);
   add(firstHeading,heightOf(firstHeading));
   add(firstSummary,heightOf(firstSummary));
   if(opening)add(openingHtml,heightOf(openingHtml),{balance:previousBalance});
   while(cursor<movements.length){
    const r=movements[cursor],rowHtml=render(r),rowHeight=heightOf(rowHtml);
    const remainingAfter=movements.length-cursor-1;
    const reserve=heightOf(subtotalRow(0,0,r.balance))+(remainingAfter?heightOf(continueRow()):heightOf(finalRow(result,0,0)));
    if(page.used+rowHeight+reserve>pageBudget&&page.hasContent){
     closePage(true);
     const h=headingRow(result.account,true),c=carryRow(previousBalance);
     add(h,heightOf(h));add(c,heightOf(c));
     continue;
    }
    add(rowHtml,rowHeight,{debit:r.debit,credit:r.credit,balance:r.balance});
    previousBalance=Number(r.balance||0);cursor++;
   }
   const debit=movements.reduce((n,r)=>n+Number(r.debit||0),0),credit=movements.reduce((n,r)=>n+Number(r.credit||0),0);
   const final=finalRow(result,debit,credit),subHeight=heightOf(subtotalRow(0,0,previousBalance)),finalHeight=heightOf(final);
   if(page.used+subHeight+finalHeight>pageBudget&&page.hasContent){
    closePage(true);const h=headingRow(result.account,true),c=carryRow(previousBalance);add(h,heightOf(h));add(c,heightOf(c));
   }
   add(final,finalHeight);
  });
  if(page.hasContent)closePage(false);
  measurementFrame.remove();
  const html=pages.map((rows,i)=>'<section class="ledger-print-page'+(i<pages.length-1?' ledger-print-page-break':'')+'"><table class="sbp-print-table ledger-table ledger-master-table">'+colgroup+'<thead>'+header+'</thead><tbody>'+rows+'</tbody></table></section>').join('');
  return {html,pageCount:pages.length};
 }
 global.SBPLedgerPrintEngine={version:'084.1',paginate};
})(window);
