// Content Radar deterministic source ingestion. Apify adapter is reserved but disabled by default.
// Runtime: Supabase Edge Functions (Deno). CR candidate scoring remains in the existing editor.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API = SUPABASE_URL + "/rest/v1/";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
type Row = Record<string, any>;
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { try { return String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1),16) : parseInt(n,10)); } catch { return ""; } })
  .replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|hellip|rsquo|ldquo|rdquo);/gi, (_, v) =>
    ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",ndash:"–",mdash:"—",hellip:"…",rsquo:"’",ldquo:"“",rdquo:"”"} as Row)[v.toLowerCase()] ?? " ");
function stripHtml(s: string) {
  return decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|h[1-6]|li|div|section|article|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n").trim());
}
function xml(block: string, key: string) { const m = block.match(new RegExp("<(?:[\\w-]+:)?" + key + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?" + key + ">","i")); return m ? stripHtml(m[1]) : ""; }
function absolute(url: string, base: string): string | null {
  try { const u = new URL(decode(url.trim()), base); if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = ""; u.searchParams.delete("utm_source");u.searchParams.delete("utm_medium");u.searchParams.delete("utm_campaign");
    return u.toString(); } catch { return null; }
}
function sameOrigin(u: string, base: string) { try { return new URL(u).hostname.replace(/^www\./,"") === new URL(base).hostname.replace(/^www\./,""); } catch { return false; } }
function parseDate(value: string | null | undefined) { if (!value) return null; const d = new Date(value); return Number.isFinite(d.valueOf()) ? d.toISOString() : null; }
type Article = {url:string,title:string,published_at:string|null,excerpt:string};
function rssEntries(feed: string, base: string): Article[] {
  const blocks = [...feed.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  const isAtom = !blocks.length;
  const rows = isAtom ? [...feed.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)] : blocks;
  return rows.map(m => {
    const b = m[1];
    const atomLink = b.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/i)?.[1];
    const u = absolute(isAtom ? (atomLink||xml(b,"id")) : (xml(b,"link")||xml(b,"guid")), base);
    return { url:u||"", title:xml(b,"title"),published_at:parseDate(xml(b,"pubDate")||xml(b,"published")||xml(b,"updated")||xml(b,"date")),
      excerpt:(xml(b,"description")||xml(b,"summary")||xml(b,"encoded")).slice(0,1300) };
  }).filter(x => x.url && x.title && sameOrigin(x.url,base));
}
function htmlEntries(html: string, base: string, path: string): Article[] {
  const found = new Map<string,Article>();
  const anchors = html.matchAll(/<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi);
  for (const m of anchors) {
    const url = absolute(m[2],base);if (!url || !sameOrigin(url,base)) continue;
    const p = new URL(url).pathname;
    if (!p.startsWith(path) || p === path.replace(/\/$/,"") || p.length < path.length+12 || /\.(xml|rss|jpg|png|svg|webp|pdf)$/i.test(p)) continue;
    let title = stripHtml(m[4]).replace(/\s+/g," ").trim();
    if (title.length < 12) title = decodeURIComponent(p.split("/").filter(Boolean).pop()??"").replace(/[-_]/g," ");
    if (title.length < 12 || title.length>250) continue;
    found.set(url,{url,title,published_at:null,excerpt:""});
  }
  return [...found.values()];
}
async function db(path: string, method = "GET", body?: unknown): Promise<any> {
  const r = await fetch(API + path,{method,headers:{apikey:SERVICE_KEY,authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation,resolution=merge-duplicates"},body:body===undefined?undefined:JSON.stringify(body)});
  const s=await r.text();if(!r.ok)throw new Error("database "+method+" "+r.status+" "+s.slice(0,350));
  return s ? JSON.parse(s) : null;
}
async function page(url: string) {
  const r = await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(14000),headers:{"User-Agent":"ContentRadarSourceReader/1.0","Accept":"text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5"}});
  if(!r.ok)throw new Error("source HTTP "+r.status+" "+new URL(url).hostname);
  const c=(r.headers.get("content-type")||"").toLowerCase();if(c && !/html|xml|rss|atom|text\/plain/.test(c))throw new Error("unsupported content type "+c);
  const text=await r.text();if(text.length>2_000_000)throw new Error("source response too large");
  return text;
}
function articleBody(html: string, titleHint = "", host = "") {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
  const page = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const articleText = stripHtml(article);
  const mainText = stripHtml(main);
  let body = (articleText.length>=450 ? articleText : mainText.length>=450 ? mainText : stripHtml(page)).slice(0,20000);
  // Liferay/ZUS includes massive navigation before the article. Use the LAST occurrence
  // of the verified feed headline and never mark menu text as an article body.
  if (host==="www.zus.pl" || host==="zus.pl") {
    const full=stripHtml(html);
    const needle=titleHint.replace(/\s+/g," ").trim();
    let at=full.lastIndexOf(needle);
    if(at<0 && needle.length>45)at=full.lastIndexOf(needle.slice(0,45));
    if(at<0)throw new Error("ZUS headline not found in source page body");
    body=full.slice(at,at+15000).split(/Powrót do listy|Ukryty\s+Zamówienia publiczne|Polityka cookies/)[0].trim();
    if(body.length<300 || body.startsWith("Przejdź do treści"))
      throw new Error("ZUS article body extraction rejected");
  }
  if(host==="izbapodatkowa.pl" || host==="www.izbapodatkowa.pl") {
    const related=body.indexOf("Najnowsze filmy z tej tematyki");
    if(related>=0 && related<800)throw new Error("Video listing is not a full article");
  }
  const title=stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"").replace(/\s+/g," ").slice(0,240);
  const published = html.match(/(?:article:published_time|datePublished)["'][^>]*content\s*=\s*["']([^"']+)/i)?.[1]
    || html.match(/(?:Data publikacji|Opublikowano)[:\\s]*(20\\d{2}-\\d\\d-\\d\\d)/i)?.[1]
    || html.match(/(?:datePublished|published|datetime)[^>]{0,160}["'](20\\d{2}-\\d{2}-\\d{2})/i)?.[1];
  return {body,title,published_at:parseDate(published)};
}
Deno.serve(async (req:Request) => {
  if(req.method!=="POST")return json({error:"POST required"},405);
  if(!SUPABASE_URL || !SERVICE_KEY)return json({error:"service environment unavailable"},500);
  const token=req.headers.get("x-cr-cron")||"";
  if(token.length<64)return json({error:"not authorized"},401);
  try {
    const authorized = await db("rpc/content_radar_verify_collector","POST",{run_token:token});
    if(authorized !== true)return json({error:"not authorized"},401);
  } catch(e) { return json({error:"authorization backend unavailable",detail:String(e).slice(0,150)},503); }
  const started=Date.now();
  const run=await db("content_radar_collection_runs","POST",{status:"STARTED"});
  const runId=run[0].run_id;
  const stats={run_id:runId,status:"COMPLETED",sources_attempted:0,sources_readable:0,items_seen:0,items_read:0,new_discoveries:0,errors:[] as string[]};
  try{
    const payload=await req.json().catch(()=>({}));
    const repairExisting = payload?.repair===true;
    const probeIds: string[]=Array.isArray(payload?.probe_source_ids)?payload.probe_source_ids.filter((id:unknown)=>typeof id==="string" && /^[0-9a-f-]{36}$/.test(id)).slice(0,12):[];
    const probing=probeIds.length>0;
    const [configs,sources,assignments] = await Promise.all([
      db("content_radar_collector_sources?select=*"+(probing?"&source_id=in.("+probeIds.join(",")+")":"&enabled=eq.true")),
      db("content_radar_sources?select=id,name,source_type,url"),
      db("content_radar_profile_sources?active=eq.true&select=source_id,profile_key,priority") ]);
    const sourceMap=new Map(sources.map((s:Row)=>[s.id,s]));
    const ordered=configs.sort((a:Row,b:Row)=>String(a.last_attempted_at||"").localeCompare(String(b.last_attempted_at||"")));
    for(const conf of ordered.slice(0,12)){
      const src:Row=sourceMap.get(conf.source_id)??{};const profiles=assignments.filter((a:Row)=>a.source_id===conf.source_id);
      let status="ERROR",seen=0,read=0,latest:string|null=null,explanation="";
      stats.sources_attempted++;
      try{
        if(conf.adapter==="apify")throw new Error("Apify adapter reserved; integration disabled until explicitly configured");
        const raw=await page(conf.endpoint);
        const all:Article[]=conf.adapter==="rss"?rssEntries(raw,conf.endpoint):htmlEntries(raw,conf.endpoint,conf.options?.allowed_path||"/");
        const unique=[...new Map(all.map(x=>[x.url,x])).values()].slice(0,Math.min(Math.max(Number(conf.options?.limit)||8,1),15));
        seen=unique.length;stats.items_seen+=seen;
        if(!seen)throw new Error("no article links parsed; source not counted as checked");
        status="NO_NEW_CONTENT";stats.sources_readable++;
        const known=await db("content_radar_discoveries?select=canonical_url&source_id=eq."+encodeURIComponent(conf.source_id)+"&limit=5000");
        const knownUrls=new Set(known.map((r:Row)=>r.canonical_url));
        const knownInitially = new Set(knownUrls);
        for(const x of unique){
          const existing=knownUrls.has(x.url); if(existing && !repairExisting) continue;
          try{
            const html=await page(x.url);const a=articleBody(html,x.title,new URL(x.url).hostname);
            if(a.body.length<300)throw new Error("article body shorter than 300 characters");
            const tokenize=(z:string)=>z.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/g," ").split(/\s+/).filter(w=>w.length>3);
            const expected=tokenize(x.title),actual=tokenize(a.title);
            if(expected.length>0 && actual.length>0) {
              const overlap=expected.filter(w=>actual.includes(w)).length;
              if(overlap<Math.max(1,Math.ceil(expected.length*0.4)))
                throw new Error("Article headline mismatch (fallback/navigation detected)");
            }
            if(!actual.length && !a.body.slice(0,1500).toLowerCase().includes(x.title.slice(0,25).toLowerCase()))
              throw new Error("Missing article headline on target page");
            read++;stats.items_read++;
            const published=x.published_at||a.published_at||
              parseDate(a.body.match(/Data publikacji:\s*(20\d{2}-\d{2}-\d{2})/i)?.[1]);
            if(published && (!latest||published>latest))latest=published;
            const age=published?(Date.now()-new Date(published).valueOf())/86400000:0;
            const baseline=!published || age>21;
            const record={
              source_id:conf.source_id,canonical_url:x.url,title:(a.title||x.title).slice(0,250),
              excerpt:(x.excerpt||a.body.slice(0,700)).slice(0,1300),published_at:published,
              body_text:a.body,read_at:new Date().toISOString(),profile_keys:profiles.map((p:Row)=>p.profile_key),
              status:baseline?"REVIEWED":"NEW",metadata:{adapter:conf.adapter,baseline,verified_full_text:true}
            };
            await db("content_radar_discoveries?on_conflict=source_id,canonical_url","POST",record);
            if(!existing)stats.new_discoveries++;knownUrls.add(x.url);
          }catch(e){ stats.errors.push(src.name+" / "+x.url+": "+String(e).slice(0,170)); }
        }
        if(read>0)status="READABLE";
        else if (unique.every((x)=>knownInitially.has(x.url))) status="NO_NEW_CONTENT";
        else {
          status="ERROR"; stats.sources_readable--;
          stats.errors.push((src.name||conf.source_id)+": listing found new links but no valid article body could be read");
        }
        explanation="Listing parsed: "+seen+"; new full articles read: "+read+".";
      }catch(e){explanation=String(e);stats.errors.push((src.name||conf.source_id)+": "+explanation);status="ERROR";}
      for(const p of profiles){
        try{
          await db("content_radar_source_scans","POST",{
            run_id:"collector-"+runId,profile_key:p.profile_key,source_id:conf.source_id,source_name:src.name||"Unknown",
            source_url:conf.endpoint,source_type:src.source_type||conf.adapter,platform:conf.adapter,
            priority:String(p.priority),access_status:status,items_seen:seen,items_read:read,newest_content_at:latest,
            notes:explanation.slice(0,500),candidates_created:0
          });
        }catch(e){stats.errors.push("scan-log: "+String(e).slice(0,150));}
      }
      try{await db("content_radar_collector_sources?source_id=eq."+conf.source_id,"PATCH",{last_attempted_at:new Date().toISOString()});}
      catch(e){stats.errors.push("source rotation state: "+String(e).slice(0,140));}
      if(Date.now()-started>90000){stats.errors.push("Execution budget reached; remaining sources deferred");break;}
    }
  }catch(e){stats.errors.push("collector fatal: "+String(e));}
  if(stats.sources_readable===0)stats.status="ERROR";
  else if(stats.errors.length)stats.status="PARTIAL";
  await db("content_radar_collection_runs?run_id=eq."+runId,"PATCH",{
    completed_at:new Date().toISOString(),status:stats.status,
    sources_attempted:stats.sources_attempted,sources_readable:stats.sources_readable,
    items_seen:stats.items_seen,items_read:stats.items_read,new_discoveries:stats.new_discoveries,errors:stats.errors
  });
  return json({...stats,duration_ms:Date.now()-started});
});