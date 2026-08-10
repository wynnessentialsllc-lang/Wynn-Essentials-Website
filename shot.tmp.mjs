import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-Wynn-Essentials-Website/4c8f939a-8212-5561-b6cd-ada442b2a49b/scratchpad/shots";
const WIDTHS=[["375",375],["430",430],["tablet",834],["desktop",1440]];
const b=await chromium.launch();
const report=[];
for (const state of ["one-match","multi-match","zero-match"]) {
  for (const [label,w] of WIDTHS) {
    const p=await b.newPage({viewport:{width:w,height:1000},deviceScaleFactor:2});
    await p.goto(`file://${OUT}/${state}.html`);
    await p.waitForTimeout(120);
    const overflow=await p.evaluate(()=>({
      docW: document.documentElement.scrollWidth, winW: window.innerWidth,
      offenders: [...document.querySelectorAll("*")].filter(e=>e.scrollWidth>document.documentElement.clientWidth+1)
        .slice(0,4).map(e=>e.className||e.tagName),
    }));
    report.push({state,label,w,overflowPx:Math.max(0,overflow.docW-overflow.winW),offenders:overflow.offenders});
    await p.screenshot({path:`${OUT}/${state}-${label}.png`, fullPage: label==="375"||label==="desktop"});
    await p.close();
  }
}
await b.close();
console.table(report.map(r=>({state:r.state,width:r.w,horizOverflowPx:r.overflowPx,offenders:r.offenders.join(",")||"none"})));
