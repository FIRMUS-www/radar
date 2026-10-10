const SUPABASE_URL='https://oxpvuxxcskqggfqgefzg.supabase.co';
const SUPABASE_KEY='sb_publishable_DpiuTMhpgVFfiY4O9mm0nw_HNhxmfqV';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
  try{
    const select='id,title,url,published_at,first_seen_at,profile_keys,excerpt';
    const url=SUPABASE_URL+'/rest/v1/content_radar_news_feed?select='+encodeURIComponent(select)+'&order=first_seen_at.desc&limit=1000';
    const r=await fetch(url,{headers:{apikey:SUPABASE_KEY},cache:'no-store'});
    if(!r.ok)throw new Error('Supabase HTTP '+r.status);
    const news=await r.json();
    if(!Array.isArray(news))throw new Error('INVALID_RESPONSE');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json(news);
  }catch(error){
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(502).json({error:'CONTENT_RADAR_NEWS_READ_FAILED'});
  }
}
