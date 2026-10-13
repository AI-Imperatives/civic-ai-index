import fs from "node:fs";
const d = JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const deps = d.states.flatMap(s=>s.evidence.deployments).filter(x=>x.activity_type!=="policy_guidance");
const n = deps.length, conf={}, gen={};
let singleHost=0, selfOnly=0;
for (const dep of deps){
  conf[dep.confidence]=(conf[dep.confidence]||0)+1;
  const ev=dep.evidence||[];
  for (const e of ev) gen[e.genai_evidence]=(gen[e.genai_evidence]||0)+1;
  const hosts=new Set(ev.map(e=>e.source_host).filter(Boolean));
  if (hosts.size<=1) singleHost++;
  if (hosts.size && ev.filter(e=>e.source_host).every(e=>e.institutional)) selfOnly++;
}
console.log("adoption deployments:", n);
console.log("confidence:", conf);
console.log("genai_evidence:", gen);
console.log("single-source %:", Math.round(100*singleHost/n), " self-sourced-only %:", Math.round(100*selfOnly/n));
