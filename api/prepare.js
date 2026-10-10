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
  let body=String(text||'').replace(/\u00a0/g,' ').replace(/\r/g,'\n');
  const footer=/(?:^|\n)\s*(?:Ładowanie\s*\.{2,}|O autorze(?:\s|:|$)|O autorce(?:\s|:|$)|Tagi\s*:|Nota o autorze(?:\s|:|$))/gim;
  for(const match of body.matchAll(footer)){
    if(match.index>body.length*.35){body=body.slice(0,match.index);break;}
  }
  const lines=body.split(/\n+/).map(s=>s.replace(/\s+/g,' ').trim());
  const paragraphs=[];let skipRelated=false;
  for(const line of lines){
    if(!line)continue;
    if(/^REKLAMA(?:\s|$)/i.test(line)){skipRelated=false;continue;}
    if(/^(?:Więcej wiadomości(?:\s+o\b)?|Czytaj także|Zobacz także|Polecamy także|Przeczytaj także|Zobacz również|Powiązane artykuły)\b/i.test(line)){skipRelated=true;continue;}
    if(skipRelated){if(line.length>400)skipRelated=false;else continue;}
    if(/^(?:Tagi\s*:|Autor(?:ka)?\s*:|Redaktor(?:ka)?(?:\s|$)|Redakcja(?:\s|$)|Udostępnij|Obserwuj|Subskrybuj|Spis treści|Fot\.|Źródło\s*:)/i.test(line))continue;
    if(/\b(?:jest redaktorem|jest dziennikarzem|jako dziennikarz|tematyką ekonomiczną zajmuje się|wcześniej współtworzył|w redakcji pracuje|pisze o biznesie|pracował w redakcji|absolwent dziennikarstwa)\b/i.test(line))continue;
    if(line.length<65)continue;
    paragraphs.push(line.replace(/\s+([,.!?;:])/g,'$1').replace(/([\p{L}\p{N}])\s+-\s*(\p{Ll}{1,2})\b/gu,'$1-$2'));
  }
  const sentences=[];
  for(let p=0;p<paragraphs.length;p++){
    const protectedText=paragraphs[p].replace(/\b(proc|tys|mln|mld|np|ok|art|ust|pkt|dr|prof)\./giu,'$1§');
    const parts=protectedText.split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„"0-9])/u).map(s=>s.replaceAll('§','.').trim());
    for(const sentence of parts){
      if(sentence.length<54||sentence.length>510||!/[.!?][”"'»)]?$/.test(sentence))continue;
      if(/^(?:Określają|Ona|Oni|To właśnie)(?:\s|$)/iu.test(sentence))continue;
      if(/^(?:Zobacz|Czytaj|Udostępnij|Fot\.|REKLAMA|Wideo|O autorze)\b/i.test(sentence))continue;
      sentences.push({sentence,paragraph:p,index:sentences.length});
    }
  }
  if(!sentences.length)return '';
  const maxLength=1900,maxItems=11;
  const chosen=[];
  for(const lead of sentences.filter(s=>s.paragraph===sentences[0].paragraph).slice(0,3)){
    if(chosen.reduce((n,c)=>n+c.sentence.length+1,0)+lead.sentence.length>680)break;
    chosen.push(lead);
  }
  if(!chosen.length)chosen.push(sentences[0]);
  const ranked=sentences.slice(1).map(item=>{
    const s=item.sentence;
    const score=
      (/\b(?:jeśli|gdy|kiedy|dopiero|warunk|wtedy|wyjąt|obowiąz|powinn|musi|muszą|trzeba|nie trzeba|nie musi|wymaga|konieczn|może więc|można więc)\w*/i.test(s)?7:0)
      +(/\b(?:wynika|potwierdził|wyjaśnił|uznał|przyznał|oznacza|w praktyce|dla przedsiębiorców|dla firm|to znaczy|w efekcie|w rezultacie|zatem|podsumowując)\b/i.test(s)?6:0)
      +(/\b\d+(?:[,.]\d+)?\s*(?:proc\.|%|zł|tys\.|mln|mld|euro)/i.test(s)?4:0)
      +(/\b(?:jeśli|gdy|zażąda|zażądał|termin|warun|przypad|wyjątk|w ciągu)\w*/i.test(s)?5:0)
      +(/\b(?:posłużyć|dokument|dowod|nota|notą|rozlicz|zestawien|udokumentow)\w*/i.test(s)?3:0)
      +(/[0-9]/.test(s)?1:0)
      +(item.index<7?4:item.index<16?2:1)
      +(item.paragraph!==sentences[0].paragraph?2:0);
    return {...item,score};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const tokens=s=>new Set((s.toLowerCase().match(/\p{L}{4,}/gu)||[])
    .filter(t=>!/^(?:oraz|który|która|które|których|przez|swoje|jednak|także|tylko|tego|taka|tych|takim|takiej|taki|przy|więc|jako|można|może|jest|został|została|będzie|gdyby|musi|firmy)$/.test(t)));
  const similarity=(a,b)=>{
    const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;
    let shared=0;for(const t of A)if(B.has(t))shared++;
    return shared/Math.min(A.size,B.size);
  };
  const remaining=[...ranked].filter(x=>!chosen.some(c=>c.index===x.index));
  while(remaining.length&&chosen.length<maxItems){
    const possible=remaining.filter(item=>
      chosen.reduce((n,c)=>n+c.sentence.length+1,0)+item.sentence.length<=maxLength
      &&chosen.every(c=>similarity(c.sentence,item.sentence)<.72));
    if(!possible.length)break;
    possible.sort((a,b)=>{
      const score=item=>item.score
        -chosen.filter(c=>c.paragraph===item.paragraph).length*6
        +(chosen.every(c=>c.paragraph!==item.paragraph)?3:0);
      return score(b)-score(a)||a.index-b.index;
    });
    const pick=possible[0];
    chosen.push(pick);
    remaining.splice(remaining.findIndex(x=>x.index===pick.index),1);
  }
  return chosen.sort((a,b)=>a.index-b.index).map(x=>x.sentence).join(' ');
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
      method:'source_text_extract_v2'
    });
  }catch(e){
    return res.status(502).json({error:'SOURCE_PREPARATION_FAILED'});
  }
}

export {createCR,describeArticle};
