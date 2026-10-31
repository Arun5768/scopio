export type Signal = 'Likely included' | 'Potential addition' | 'Needs clarification';
export type Brief = {id:string; content:string; createdAt:string; approvedBy:string};
export type Feedback = {id:string; text:string; source:string; createdAt:string; briefId:string; signal:Signal; excerpt:string; reason:string; resolved?:boolean};
export type Change = {id:string; feedbackId:string; title:string; description:string; hours:number; rate:number; days:number; status:'Draft'|'Awaiting approval'|'Approved'|'Declined'; token?:string; createdAt:string; decidedAt?:string; decidedBy?:string; note?:string; briefId:string; emailRequested?:boolean; emailProvider?:string; clientEmail?:string};
export type Project = {id:string; ownerEmail?:string; revision:number; name:string; client:string; email:string; budget:number; rate:number; currency:string; sample:boolean; briefs:Brief[]; feedback:Feedback[]; changes:Change[]; events:{id:string; text:string; at:string; actor:string}[]};
const stop = new Set('a an the to of for and or is are be we i you can could please also would like our with it in on as this that should need want add include'.split(' '));
const words=(s:string)=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stop.has(w));
export function analyze(text:string, brief:string):Pick<Feedback,'signal'|'excerpt'|'reason'> {
 const lines=brief.split(/\n|(?<=[.!?])\s+/).filter(s=>s.trim()); const tokens=words(text);
 const ranked=lines.map(line=>({line,score:words(line).filter(w=>tokens.includes(w)).length})).sort((a,b)=>b.score-a.score);
 const best=ranked[0]; const excerpt=best?.score?best.line:'';
 const exclusion=/excluded|out of scope|not included|not include|no |without|separate estimate/i.test(excerpt);
 if(excerpt&&exclusion) return {signal:'Potential addition',excerpt,reason:'This request overlaps an explicit exclusion in the brief. Confirm the interpretation before estimating.'};
 if(best?.score>=2) return {signal:'Likely included',excerpt,reason:'Several terms match this agreed deliverable. Matching words do not prove equivalent effort; review the wording.'};
 if(/also|add |new |integrat|extra|google|payment|login/i.test(text)&&!excerpt) return {signal:'Potential addition',excerpt:'',reason:'This asks for an addition with no matching deliverable found. Check with the client before treating it as new scope.'};
 return {signal:'Needs clarification',excerpt,reason:excerpt?'A partial match was found, but the requested outcome is unclear.':'No clear match was found. Ask for the expected outcome and acceptance criteria.'};
}
export function totals(p:Project) {return {approved:p.changes.filter(c=>c.status==='Approved').reduce((n,c)=>n+c.hours*c.rate,0),pending:p.changes.filter(c=>c.status==='Awaiting approval').reduce((n,c)=>n+c.hours*c.rate,0),hours:p.changes.filter(c=>c.status==='Approved').reduce((n,c)=>n+c.hours,0)}}
export function money(value:number,currency='USD'){return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(value)}
export const sampleBrief='DELIVERABLES\nDesign and build a responsive marketing website with five pages: Home, About, Services, Work, and Contact.\nContact form with email notifications and spam protection.\nTwo rounds of visual design revisions, including colors, typography, and layout.\nBasic search engine metadata and social sharing previews.\n\nEXCLUSIONS\nUser accounts, authentication, Google login, and payment integrations are not included.\nAdditional pages and integrations require a separate estimate.';
