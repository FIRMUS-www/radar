import {createCR,describeArticle} from './prepare.js';

const SUPABASE_URL='https://oxpvuxxcskqggfqgefzg.supabase.co';
const SUPABASE_KEY='sb_publishable_DpiuTMhpgVFfiY4O9mm0nw_HNhxmfqV';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  const cr=typeof req.query?.ref==='string'?req.query.ref.trim().toUpperCase():'';
  const match=/^CR-(\d{6})-([1-9]\d{0,9})$/.exec(cr);
  if(!match)return res.status(400).json({error:'INVALID_CR_REFERENCE'});
  const discoveryId=Number(match[2]);
  if(!Number.isSafeInteger(discoveryId))return res.status(400).json({error:'INVALID_CR_REFERENCE'});
  try{
    const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/content_radar_article_for_prepare',{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_id:discoveryId}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw new Error('DATABASE_READ_FAILED');
    const data=await response.json();
    const article=Array.isArray(data)?data[0]:null;
    if(!article||Number(article.discovery_id)!==discoveryId)
      return res.status(404).json({error:'CR_REFERENCE_NOT_FOUND'});
    if(createCR(discoveryId,article.discovered_at)!==cr)
      return res.status(404).json({error:'CR_REFERENCE_NOT_FOUND'});
    const url=new URL(article.source_url);
    if(url.protocol!=='https:')throw new Error('BAD_SOURCE');
    const description=describeArticle(article.source_text);
    if(description.length<130)return res.status(422).json({error:'SOURCE_TEXT_INSUFFICIENT'});
    return res.status(200).json({
      cr,discovery_id:discoveryId,
      title:article.title,description,source_url:url.href,
      origin:'content_radar_discoveries',
      description_method:'source_text_extract_v2',
      editorial_status:'User-selectable source extract, no AI assessment'
    });
  }catch(e){
    return res.status(502).json({error:'CR_REFERENCE_LOOKUP_FAILED'});
  }
}
