const SUPABASE_URL='https://oxpvuxxcskqggfqgefzg.supabase.co';
const SUPABASE_KEY='sb_publishable_DpiuTMhpgVFfiY4O9mm0nw_HNhxmfqV';
export default async function handler(req,res){
  try{
    const select='number,title,cr,recommendation,status,created_at,what,why,angle,risk,source,hook,ready,audit_status,fact_check_status,content_score,fit_score,final_score,score_version,content_features';
    const url=`${SUPABASE_URL}/rest/v1/content_radar_items?select=${encodeURIComponent(select)}&order=created_at.desc`;
    const r=await fetch(url,{headers:{apikey:SUPABASE_KEY}});
    if(!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
    const items=await r.json();
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.status(200).json(items);
  }catch(error){
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.status(500).json({error:'CONTENT_RADAR_READ_FAILED'});
  }
}
