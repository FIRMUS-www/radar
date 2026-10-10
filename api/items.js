const SUPABASE_URL='https://oxpvuxxcskqggfqgefzg.supabase.co';
const SUPABASE_KEY='sb_publishable_DpiuTMhpgVFfiY4O9mm0nw_HNhxmfqV';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
  try{
    const select='id,title,url,published_at,first_seen_at,profile_keys,excerpt';
    const news=[];
    const pageSize=1000;
    for(let offset=0;;offset+=pageSize){
      const url=SUPABASE_URL+'/rest/v1/content_radar_news_feed?select='+encodeURIComponent(select)+'&order=first_seen_at.desc,id.desc&limit='+pageSize+'&offset='+offset;
      const r=await fetch(url,{headers:{apikey:SUPABASE_KEY},cache:'no-store'});
      if(!r.ok)throw new Error('Supabase HTTP '+r.status);
      const page=await r.json();
      if(!Array.isArray(page))throw new Error('INVALID_RESPONSE');
      news.push(...page);
      if(page.length<pageSize)break;
    }
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json(news);
  }catch(error){
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(502).json({error:'CONTENT_RADAR_NEWS_READ_FAILED'});
  }
}
