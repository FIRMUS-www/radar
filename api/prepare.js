const SUPABASE_URL='https://oxpvuxxcskqggfqgefzg.supabase.co';
const SUPABASE_KEY='sb_publishable_DpiuTMhpgVFfiY4O9mm0nw_HNhxmfqV';

function createCR(id,iso){
  const date=new Date(iso);
  if(!Number.isFinite(date.getTime()))throw new Error('INVALID_DATE');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Warsaw',year:'2-digit',month:'2-digit',day:'2-digit'
  }).formatToParts(date).map(p=>[p.type,p.value]));
  return 'CR-'+parts.year+parts.month+parts.day+'-'+id;
}

function describeArticle(text){
  const paragraphs=String(text||'').replace(/\u00a0/g,' ').replace(/\r/g,'\n')
    .split(/\n+/).map(s=>s.replace(/\s+/g,' ').trim())
    .filter(s=>s.length>=55&&!/^REKLAMA\b/i.test(s)&&!/^Źródł[oa]:?$/i.test(s));
  const sentences=[];
  for(const paragraph of paragraphs){
    const safe=paragraph.replace(/\b(proc|tys|mln|mld|np|ok|art|ust|pkt)\./giu,'$1§');
    const parts=safe.split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„"0-9])/u)
      .map(s=>s.replaceAll('§','.'));
    for(const value of parts){
      const sentence=value.trim();
      if(sentence.length>=55&&sentence.length<=450&&!/^(REKLAMA|ZOBACZ|CZYTAJ|POLECAMY)\b/i.test(sentence)){
        sentences.push(sentence);
      }
    }
  }
  if(!sentences.length)return '';
  const candidates=sentences.map((sentence,index)=>({
    index,sentence,
    score:(index===0?12:index===1?8:index===2?3:0)
      +(/\d/.test(sentence)?3:0)
      +(/\b(?:według|wynika|dotycz|oznacza|zmian|limit|podatek|ZUS|VAT|KSeF|firma|przedsiębiorc|ustaw|decyzj|sąd|urząd|koszt|złot|proc)\w*/i.test(sentence)?2:0)
  }));
  const picked=candidates.slice(0,1);
  const rest=candidates.slice(1).sort((a,b)=>b.score-a.score||a.index-b.index);
  for(const item of rest){
    if(picked.length>=4)break;
    if(picked.reduce((n,x)=>n+x.sentence.length+1,0)+item.sentence.length>860)continue;
    picked.push(item);
  }
  return picked.sort((a,b)=>a.index-b.index).map(x=>x.sentence).join(' ').slice(0,1000);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store,max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
  const raw=typeof req.query?.id==='string'?req.query.id:'';
  if(!/^[1-9]\d{0,9}$/.test(raw))return res.status(400).json({error:'INVALID_ID'});
  try{
    const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/content_radar_article_for_prepare',{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_id:Number(raw)}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw new Error('DATABASE_READ_FAILED');
    const rows=await response.json();
    const doc=Array.isArray(rows)?rows[0]:null;
    if(!doc||String(doc.discovery_id)!==raw)return res.status(422).json({error:'SOURCE_TEXT_UNAVAILABLE'});
    const source=new URL(doc.source_url);
    if(source.protocol!=='https:')return res.status(422).json({error:'INVALID_SOURCE_URL'});
    const description=describeArticle(doc.source_text);
    if(description.length<130)return res.status(422).json({error:'SOURCE_TEXT_INSUFFICIENT'});
    return res.status(200).json({
      discovery_id:doc.discovery_id,
      cr:createCR(doc.discovery_id,doc.discovered_at),
      title:doc.title,
      description,
      source_url:source.href,
      method:'source_text_extract_v1'
    });
  }catch(e){
    return res.status(502).json({error:'SOURCE_PREPARATION_FAILED'});
  }
}
