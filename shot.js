const p=require('/workspace/tools/node_modules/puppeteer-core');
(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'});
const dir=__dirname+'/screenshots/';require('fs').mkdirSync(dir,{recursive:true});
async function go(name,vp,fn,full){const pg=await b.newPage();await pg.setViewport(vp);await pg.goto('file://'+__dirname+'/index.html');await pg.evaluate(()=>localStorage.clear());await pg.reload();if(fn)await fn(pg);await new Promise(r=>setTimeout(r,400));await pg.screenshot({path:dir+name,fullPage:!!full});await pg.close();}
const D={width:1440,height:900},M={width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2};
const sample=async pg=>{await pg.click('#btnSample');};
await go('desktop-clean.png',D,sample);
await go('desktop-diff.png',D,async pg=>{await sample(pg);await pg.click('[data-view=diff]');});
await go('desktop-convert.png',D,async pg=>{await pg.click('[data-tab=convert]');await pg.click('#cvSample');});
await go('desktop-pro.png',D,async pg=>{await pg.click('#proBtn');});
await go('mobile-clean.png',M,sample,true);
await go('mobile-convert.png',M,async pg=>{await pg.click('[data-tab=convert]');await pg.click('#cvSample');},true);
await go('mobile-diff.png',M,async pg=>{await sample(pg);await pg.click('[data-view=diff]');});
await b.close();})();
