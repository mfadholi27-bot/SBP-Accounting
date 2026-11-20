/* Local Lucide-style icon subset for offline SBP Accounting V19.
   SVG path data follows the Lucide icon family conventions. */
(function(){
 const paths={
 'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
 'plus':'<path d="M12 5v14M5 12h14"/>',
 'list':'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 'wallet':'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h.01M7 5V3h10v2"/>',
 'book-open':'<path d="M12 7v14M3 18V5a2 2 0 0 1 2-2h2a5 5 0 0 1 5 5 5 5 0 0 1 5-5h2a2 2 0 0 1 2 2v13h-4a5 5 0 0 0-5 3 5 5 0 0 0-5-3H3Z"/>',
 'chart-no-axes-combined':'<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/>',
 'settings':'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/>',
 'history':'<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
 'archive':'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
 'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
 'download':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
 'printer':'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>' ,
 'alert-triangle':'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
 'arrow-right':'<path d="M5 12h14M12 5l7 7-7 7"/>',
 'building-2':'<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M4 22h16M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01M11 22v-4h2v4"/>',
 'calendar-check':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18m-13 5 2 2 4-4"/>',
 'circle-help':'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01"/>',
 'clipboard-list':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3"/>',
 'database-zap':'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3m9-9v5M3 11v6c0 1.7 4 3 9 3m3-5 3-5v4h3l-4 6v-4h-3"/>',
 'file-spreadsheet':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 12v6"/>',
 'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
 'folder-cog':'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v4M3 7v11a2 2 0 0 0 2 2h7"/><circle cx="18" cy="18" r="3"/><path d="m18 13 1 .7.9-.2.6 1-.5.8.3.9-.8.7-.9-.3-.8.4-.9-.6.1-.9-.6-.7.4-1 .9-.1Z"/>',
 'landmark':'<path d="m3 10 9-7 9 7M4 10h16M5 10v9m4-9v9m6-9v9m4-9v9M3 22h18M2 19h20"/>',
 'plus-circle':'<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
 'refresh-cw':'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
 'shield-alert':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="M12 8v4m0 4h.01"/>',
 'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
 'wallet-cards':'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M7 5V3h10v2m-3 8h4"/>',
 'x':'<path d="m18 6-12 12M6 6l12 12"/>'
 };
 function svg(name,cls){return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-'+name+(cls?' '+cls:'')+'" aria-hidden="true">'+(paths[name]||paths.list)+'</svg>'}
 function createIcons(root){(root||document).querySelectorAll('[data-lucide]').forEach(el=>{const name=el.getAttribute('data-lucide');el.innerHTML=svg(name);el.setAttribute('data-lucide-rendered','true')})}
 window.lucide={createIcons,icon:svg};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>createIcons());else createIcons();
})();