import {createHash} from 'node:crypto';

const SUPABASE_URL='https://oxpvuxxcskqggfqgefzg.supabase.co';
const SUPABASE_KEY='sb_publishable_DpiuTMhpgVFfiY4O9mm0nw_HNhxmfqV';
const TABLE=SUPABASE_URL+'/rest/v1/content_radar_sync_state';
const TOKEN=/^[0-9a-f]{64}$/;
const ID=/^[1-9][0-9]{0,11}$/;
function cleanIds(values){
  if(!Array.isArray(values)||values.length>10000)throw new Error('INVALID_IDS');
  if(values.some(v=>typeof v!=='string'||!ID.test(v)))throw new Error('INVALID_IDS');
  return [...new Set(values)];
}
function status(res,code,body){
  res.setHeader('Cache-Control','no-store');
  return res.status(code).json(body);
}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return status(res,405,{error:'METHOD_NOT_ALLOWED'});}
  try{
    const input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const {op,token}=input;
    if(!TOKEN.test(token||''))return status(res,400,{error:'INVALID_SYNC_KEY'});
    if(!['join','get','change'].includes(op))return status(res,400,{error:'INVALID_ACTION'});
    const hash=createHash('sha256').update(token).digest('hex');
    const headers={
      apikey:SUPABASE_KEY,'x-cr-sync-token':token,
      'Content-Type':'application/json','Accept':'application/json',
      'Prefer':'return=representation'
    };
    const path=TABLE+'?token_hash=eq.'+hash+'&select=token_hash,hidden_ids,saved_ids,version';
    const fetchRows=async()=>{
      const r=await fetch(path,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw new Error('SUPABASE_READ');
      const rows=await r.json();
      if(!Array.isArray(rows))throw new Error('INVALID_STORAGE');
      return rows;
    };
    let localHidden=[],localSaved=[];
    if(op==='join'){
      localHidden=cleanIds(input.hidden);
      localSaved=cleanIds(input.saved);
    }
    let targetKind,targetId,targetEnabled;
    if(op==='change'){
      targetKind=input.kind;
      targetId=String(input.id||'');
      targetEnabled=input.enabled;
      if(!['hidden','saved'].includes(targetKind)||!ID.test(targetId)||typeof targetEnabled!=='boolean')
        return status(res,400,{error:'INVALID_CHANGE'});
    }
    for(let attempt=0;attempt<6;attempt++){
      const rows=await fetchRows();
      const state=rows[0];
      if(!state){
        if(op!=='join')return status(res,404,{error:'SYNC_NOT_FOUND'});
        const created=await fetch(TABLE,{
          method:'POST',headers,signal:AbortSignal.timeout(10000),
          body:JSON.stringify({token_hash:hash,hidden_ids:localHidden,saved_ids:localSaved,version:1})
        });
        if(created.status===409)continue;
        if(!created.ok)throw new Error('SUPABASE_CREATE');
        const data=await created.json();
        const row=Array.isArray(data)?data[0]:null;
        if(!row)throw new Error('INVALID_STORAGE');
        return status(res,200,{hidden:row.hidden_ids,saved:row.saved_ids,version:row.version});
      }
      const remoteHidden=cleanIds(state.hidden_ids),remoteSaved=cleanIds(state.saved_ids);
      if(op==='get')return status(res,200,{hidden:remoteHidden,saved:remoteSaved,version:state.version});
      const h=new Set(remoteHidden),s=new Set(remoteSaved);
      if(op==='join'){
        for(const id of localHidden)h.add(id);
        for(const id of localSaved)s.add(id);
      }else{
        const dest=targetKind==='hidden'?h:s;
        if(targetEnabled)dest.add(targetId);else dest.delete(targetId);
      }
      if([...h].length>10000||[...s].length>10000)return status(res,413,{error:'TOO_MANY_ITEMS'});
      const version=Number(state.version);
      if(!Number.isSafeInteger(version)||version<1)throw new Error('INVALID_VERSION');
      if(op==='join'&&h.size===remoteHidden.length&&s.size===remoteSaved.length)
        return status(res,200,{hidden:remoteHidden,saved:remoteSaved,version});
      const changeUrl=TABLE+'?token_hash=eq.'+hash+'&version=eq.'+version+'&select=token_hash,hidden_ids,saved_ids,version';
      const updated=await fetch(changeUrl,{
        method:'PATCH',headers,signal:AbortSignal.timeout(10000),
        body:JSON.stringify({hidden_ids:[...h],saved_ids:[...s],version:version+1,updated_at:new Date().toISOString()})
      });
      if(!updated.ok)throw new Error('SUPABASE_WRITE');
      const out=await updated.json();
      if(Array.isArray(out)&&out.length===1)
        return status(res,200,{hidden:out[0].hidden_ids,saved:out[0].saved_ids,version:out[0].version});
    }
    return status(res,409,{error:'SYNC_CONFLICT_RETRY'});
  }catch(error){
    if(error?.message==='INVALID_IDS')return status(res,400,{error:'INVALID_ITEMS'});
    return status(res,502,{error:'SYNC_UNAVAILABLE'});
  }
}
