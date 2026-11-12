const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  });
});

(async()=>{
 let browser;
 try {
  await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  page.on('pageerror',err=>console.error('[browser pageerror]',err.message));
  await page.addInitScript(()=>{
    const append=Node.prototype.appendChild;
    Node.prototype.appendChild=function(node){
      const result=append.call(this,node);
      if(node&&node.id==='sbp-print-frame'){
        try{node.contentWindow.print=()=>node.contentWindow.dispatchEvent(new Event('afterprint'))}catch(e){}
      }
      return result;
    };
  });
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof go==='function'&&document.getElementById('ledger-mode'));
  await page.evaluate(async()=>{
    const fixture={
      accounts:[{code:'1000',name:'Kas'},{code:'2000',name:'Piutang Usaha'}],
      journals:[
        {id:1,date:'2026-01-05',number:'J-001',description:'Saldo kas Januari',status:'posted',lines:[{code:'1000',debit:50,credit:0}]},
        {id:2,date:'2026-02-10',number:'J-002',description:'Penerimaan kas Februari',status:'posted',lines:[{code:'1000',debit:20,credit:5}]},
        {id:3,date:'2026-02-15',number:'J-003',description:'Draft tidak boleh masuk',status:'draft',lines:[{code:'1000',debit:900,credit:0}]},
        {id:4,date:'2026-02-18',number:'J-004',description:'Jurnal batal tidak boleh masuk',status:'cancelled',lines:[{code:'1000',debit:700,credit:0}]},
        {id:5,date:'2026-02-20',number:'J-005',description:'Penerimaan piutang',status:'posted',lines:[{code:'2000',debit:300,credit:0}] }
      ],
      openingBalances:[{period:'2026-01',accountCode:'1000',debit:1000,credit:0},{period:'2026-01',accountCode:'2000',debit:500,credit:0}],
      nptrans:[],debitNotes:[],annualBudgets:[],auditLogs:[],npTemplate:null,meta:{version:19}
    };
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('sbp-accounting-v19',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('app'))req.result.createObjectStore('app')};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('app','readwrite');tx.objectStore('app').put(fixture,'main');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.accounts.some(a=>String(a.code)==='1000'));
  await page.evaluate(()=>{
    document.getElementById('startup-continue')?.click();
    go('ledger');
    Array.from(document.getElementById('ledger-account').options).forEach(o=>{o.selected=['1000','2000'].includes(o.value)});
    document.getElementById('ledger-mode').value='month';
    document.getElementById('ledger-period').value='2026-02';
    updateLedgerPeriodMode();renderLedger();
  });
  const month=await page.locator('#ledger-summary').innerText();
  if(!month.includes('2026-02'))throw new Error('Monthly period not rendered');
  await page.evaluate(()=>{
    document.getElementById('ledger-mode').value='year';
    document.getElementById('ledger-year').value='2026';
    updateLedgerPeriodMode();renderLedger();
  });
  if(!(await page.locator('#ledger-summary').innerText()).includes('2026'))throw new Error('Annual period not rendered');
  await page.evaluate(()=>{
    document.getElementById('ledger-mode').value='range';
    document.getElementById('ledger-from').value='2026-01-10';
    document.getElementById('ledger-to').value='2026-02-28';
    updateLedgerPeriodMode();renderLedger();
  });
  const table=await page.locator('#ledger-content').innerText();
  if(!table.includes('J-002')||!table.includes('J-005')||table.includes('J-003')||table.includes('J-004'))throw new Error('Multi-account range journal filtering failed');
  if((await page.locator('#ledger-content .ledger-account-result').count())!==2)throw new Error('Expected two selected account ledgers to render');
  if(!(await page.locator('#ledger-selected-count').innerText()).includes('2 akun'))throw new Error('Selected-account counter failed');
  if(!table.includes('1.065'))throw new Error('Expected ending balance Rp 1.065 not found in ledger');
  const before=await page.evaluate(async()=>JSON.stringify(await readPersistedAccountingState()));
  await page.locator('#ledger-print').click();
  await page.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Validasi lulus'),{timeout:10000});
  const after=await page.evaluate(async()=>JSON.stringify(await readPersistedAccountingState()));
  if(before!==after)throw new Error('IndexedDB state changed after print');
  const preview=await browser.newPage();
  let previewResponse=null,lastPreviewError=null;
  for(let attempt=0;attempt<12;attempt++){
    try{
      previewResponse=await preview.goto('https://mfadholi27-bot.github.io/SBP-Accounting/v19-dev/',{waitUntil:'domcontentloaded',timeout:20000});
      if(previewResponse&&previewResponse.status()===200)break;
      lastPreviewError=new Error('GitHub Pages returned HTTP '+(previewResponse?.status()??'no response'));
    }catch(err){lastPreviewError=err}
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
  if(!previewResponse||previewResponse.status()!==200)throw new Error('GitHub Pages preview did not return HTTP 200: '+(lastPreviewError?.message||'unknown error'));
  await preview.waitForFunction(()=>typeof go==='function'&&document.getElementById('ledger-mode'),{timeout:20000});
  const previewCheck=await preview.evaluate(async()=>{
    const response=await fetch('./app.js?v=110',{cache:'no-store'});
    const js=await response.text();
    return {scriptStatus:response.status,rangeEngine:js.includes('function getLedgerTransactionsRange('),afterPrintGuard:js.includes('async function readPersistedAccountingState('),buildStamp:document.getElementById('build-stamp')?.innerText.includes('SBP-V19-LEDGER-MULTI-ACCOUNT-005')};
  });
  if(previewCheck.scriptStatus!==200||!previewCheck.rangeEngine||!previewCheck.afterPrintGuard||!previewCheck.buildStamp)throw new Error('GitHub Pages preview loaded, but the expected ledger build assets are incomplete: '+JSON.stringify(previewCheck));
  console.log('PASS: actual browser IndexedDB, multi-account selection/rendering, monthly/year/range periods, posted-only filtering, print callback, exact persisted-state equality, and live GitHub Pages preview assets.');
 } catch(err) {
  console.error(err);process.exitCode=1;
 } finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})();
