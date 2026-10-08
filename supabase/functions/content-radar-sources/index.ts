function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  if (origin === "https://zarzad-radar.vercel.app" || origin === "https://zarzad-radar-apka-firmus.vercel.app") return true;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith("-apka-firmus.vercel.app") && u.hostname.startsWith("zarzad-radar-");
  } catch { return false; }
}

function cors(origin: string | null) {
  const allow = isAllowedOrigin(origin) ? origin! : "https://zarzad-radar.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status=200, origin:string|null=null){
  return new Response(JSON.stringify(body),{status,headers:cors(origin)});
}

function getSecretKey(): string {
  const current=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(current){
    const parsed=JSON.parse(current);
    if(parsed?.default)return parsed.default;
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  throw new Error("NO_SUPABASE_SECRET");
}

function adminHeaders(secret:string, prefer?:string){
  const h:Record<string,string>={
    apikey:secret,
    "Content-Type":"application/json",
    Accept:"application/json"
  };
  if(prefer)h.Prefer=prefer;
  if(!secret.startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;
  return h;
}

function cleanUrl(value:unknown){
  const raw=String(value||"").trim();
  if(!raw)return null;
  const u=new URL(raw);
  if(u.protocol!=="http:"&&u.protocol!=="https:")throw new Error("INVALID_URL");
  return u.toString();
}

function cleanProfile(value:unknown){
  const p=String(value||"").trim();
  return p==="bizgenerator"||p==="accounting"?p:null;
}

function cleanProfiles(value:unknown){
  const arr=Array.isArray(value)?value.map(String):[];
  return [...new Set(arr.filter(x=>x==="bizgenerator"||x==="accounting"))];
}

async function parseResponse(r:Response, label:string){
  const text=await r.text();
  if(!r.ok)throw new Error(`${label}_${r.status}:${text.slice(0,240)}`);
  return text?JSON.parse(text):[];
}

Deno.serve(async(req)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(!isAllowedOrigin(origin))return json({ok:false,error:"ORIGIN_NOT_ALLOWED"},403,origin);

  try{
    const base=Deno.env.get("SUPABASE_URL");
    if(!base)throw new Error("NO_SUPABASE_URL");
    const secret=getSecretKey();
    const sourcesEndpoint=`${base}/rest/v1/content_radar_sources`;
    const profilesEndpoint=`${base}/rest/v1/content_radar_profile_sources`;

    const fetchCatalog=async()=>{
      const r=await fetch(
        `${sourcesEndpoint}?select=id,name,url,category,source_type,priority,active,notes,profile_keys,created_at,updated_at&order=category.asc,priority.desc,name.asc`,
        {headers:adminHeaders(secret)}
      );
      return await parseResponse(r,"GET_SOURCES");
    };

    const fetchAssignments=async(profileKey?:string)=>{
      const filter=profileKey?`&profile_key=eq.${encodeURIComponent(profileKey)}`:"";
      const r=await fetch(
        `${profilesEndpoint}?select=id,source_id,profile_key,active,priority,notes,created_at,updated_at${filter}`,
        {headers:adminHeaders(secret)}
      );
      return await parseResponse(r,"GET_PROFILE_SOURCES");
    };

    const fetchCoverage=async()=> {
      const r=await fetch(
        `${base}/rest/v1/content_radar_source_coverage?select=source_id,collector_enabled,adapter,last_attempted_at,latest_status,latest_scanned_at,last_success_at&limit=200`,
        {headers:adminHeaders(secret)}
      );
      return await parseResponse(r,"GET_COLLECTOR_COVERAGE");
    };

    const syncLegacy=async(sourceId:string)=>{
      const r=await fetch(
        `${profilesEndpoint}?select=profile_key,active,priority&source_id=eq.${encodeURIComponent(sourceId)}`,
        {headers:adminHeaders(secret)}
      );
      const rows=await parseResponse(r,"SYNC_READ");
      const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
      if(rows.length){
        patch.profile_keys=rows.map((x:any)=>x.profile_key).sort();
        patch.active=rows.some((x:any)=>!!x.active);
        patch.priority=Math.max(...rows.map((x:any)=>Number(x.priority)||1));
      }else{
        patch.profile_keys=[];
        patch.active=false;
      }
      const p=await fetch(
        `${sourcesEndpoint}?id=eq.${encodeURIComponent(sourceId)}`,
        {method:"PATCH",headers:adminHeaders(secret,"return=minimal"),body:JSON.stringify(patch)}
      );
      if(!p.ok)throw new Error(`SYNC_PATCH_${p.status}:${(await p.text()).slice(0,180)}`);
    };

    const mergedSource=async(sourceId:string,profileKey:string)=>{
      const [catalog,assignments]=await Promise.all([fetchCatalog(),fetchAssignments()]);
      const s=catalog.find((x:any)=>x.id===sourceId);
      const a=assignments.find((x:any)=>x.source_id===sourceId&&x.profile_key===profileKey);
      if(!s||!a)return null;
      const assigned_profiles=assignments.filter((x:any)=>x.source_id===sourceId).map((x:any)=>x.profile_key);
      return {
        ...s,
        catalog_active:s.active,
        catalog_priority:s.priority,
        active:a.active,
        priority:a.priority,
        profile_notes:a.notes,
        profile_key:profileKey,
        assigned_profiles
      };
    };

    if(req.method==="GET"){
      const u=new URL(req.url);
      const profileKey=cleanProfile(u.searchParams.get("profile_key"));
      const catalog=await fetchCatalog();

      // Backward-compatible catalog response for older frontend versions.
      if(!profileKey)return json({ok:true,sources:catalog},200,origin);

      const [assignments,coverage]=await Promise.all([fetchAssignments(),fetchCoverage()]);
      const coverageById=new Map(coverage.map((x:any)=>[x.source_id,x]));
      const current=assignments.filter((x:any)=>x.profile_key===profileKey);
      const byId=new Map(catalog.map((x:any)=>[x.id,x]));
      const sources=current
        .map((a:any)=>{
          const s:any=byId.get(a.source_id);
          if(!s)return null;
          return {
            ...s,
            catalog_active:s.active,
            catalog_priority:s.priority,
            active:a.active,
            priority:a.priority,
            profile_notes:a.notes,
            profile_key:profileKey,
            assigned_profiles:assignments.filter((x:any)=>x.source_id===a.source_id).map((x:any)=>x.profile_key),
            collector:coverageById.get(a.source_id)||{collector_enabled:false,latest_status:"NOT_SCANNED"}
          };
        })
        .filter(Boolean)
        .sort((a:any,b:any)=>
          String(a.category).localeCompare(String(b.category),"pl") ||
          Number(b.priority)-Number(a.priority) ||
          String(a.name).localeCompare(String(b.name),"pl")
        );

      return json({ok:true,profile_key:profileKey,sources},200,origin);
    }

    const body=await req.json();

    if(req.method==="POST"){
      const explicitProfile=cleanProfile(body?.profile_key);
      const legacyProfiles=cleanProfiles(body?.profile_keys);
      const profiles=explicitProfile?[explicitProfile]:(legacyProfiles.length?legacyProfiles:["bizgenerator"]);

      const name=String(body?.name||"").trim().slice(0,180);
      if(name.length<2)return json({ok:false,error:"NAME_REQUIRED"},400,origin);

      let url=null;
      try{url=cleanUrl(body?.url)}catch{return json({ok:false,error:"INVALID_URL"},400,origin)}

      const category=String(body?.category||"Inne").trim().slice(0,120)||"Inne";
      const source_type=String(body?.source_type||"website").trim().slice(0,40)||"website";
      const priority=Math.max(1,Math.min(5,Number(body?.priority||3)||3));
      const notes=String(body?.notes||"").trim().slice(0,1000)||null;

      const existingReq=await fetch(
        `${sourcesEndpoint}?select=id,name,url,category,source_type,priority,active,notes,profile_keys,created_at,updated_at&name=eq.${encodeURIComponent(name)}&limit=1`,
        {headers:adminHeaders(secret)}
      );
      const existing=await parseResponse(existingReq,"FIND_SOURCE");
      let source=existing[0]||null;

      if(source){
        if(url && source.url && String(source.url)!==String(url)){
          return json({ok:false,error:"DUPLICATE_SOURCE_NAME"},409,origin);
        }
        const metaPatch:Record<string,unknown>={updated_at:new Date().toISOString()};
        if(!source.url&&url)metaPatch.url=url;
        if(!source.notes&&notes)metaPatch.notes=notes;
        if(Object.keys(metaPatch).length>1){
          const pr=await fetch(
            `${sourcesEndpoint}?id=eq.${encodeURIComponent(source.id)}`,
            {method:"PATCH",headers:adminHeaders(secret,"return=representation"),body:JSON.stringify(metaPatch)}
          );
          const rows=await parseResponse(pr,"PATCH_SOURCE_META");
          source=rows[0]||source;
        }
      }else{
        const payload={
          name,url,category,source_type,priority,notes,
          profile_keys:profiles,
          active:true,
          updated_at:new Date().toISOString()
        };
        const cr=await fetch(
          sourcesEndpoint,
          {method:"POST",headers:adminHeaders(secret,"return=representation"),body:JSON.stringify(payload)}
        );
        const rows=await parseResponse(cr,"CREATE_SOURCE");
        source=rows[0];
      }

      for(const profileKey of profiles){
        const assignment={
          source_id:source.id,
          profile_key:profileKey,
          active:true,
          priority,
          updated_at:new Date().toISOString()
        };
        const ar=await fetch(
          `${profilesEndpoint}?on_conflict=source_id,profile_key`,
          {
            method:"POST",
            headers:adminHeaders(secret,"resolution=merge-duplicates,return=representation"),
            body:JSON.stringify(assignment)
          }
        );
        await parseResponse(ar,"UPSERT_PROFILE_SOURCE");
      }

      await syncLegacy(source.id);
      const responseProfile=explicitProfile||profiles[0];
      return json({ok:true,source:await mergedSource(source.id,responseProfile)},201,origin);
    }

    if(req.method==="PATCH"){
      const id=String(body?.id||body?.source_id||"").trim();
      if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,error:"INVALID_ID"},400,origin);

      const profileKey=cleanProfile(body?.profile_key);
      if(profileKey){
        const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
        if(typeof body.active==="boolean")patch.active=body.active;
        if(body.priority!=null)patch.priority=Math.max(1,Math.min(5,Number(body.priority)||3));
        if(body.profile_notes!==undefined)patch.notes=String(body.profile_notes||"").trim().slice(0,1000)||null;

        const rr=await fetch(
          `${profilesEndpoint}?source_id=eq.${encodeURIComponent(id)}&profile_key=eq.${encodeURIComponent(profileKey)}`,
          {method:"PATCH",headers:adminHeaders(secret,"return=representation"),body:JSON.stringify(patch)}
        );
        let rows=await parseResponse(rr,"PATCH_PROFILE_SOURCE");
        if(!rows.length){
          const payload={
            source_id:id,
            profile_key:profileKey,
            active:typeof body.active==="boolean"?body.active:true,
            priority:body.priority!=null?Math.max(1,Math.min(5,Number(body.priority)||3)):3
          };
          const ir=await fetch(
            profilesEndpoint,
            {method:"POST",headers:adminHeaders(secret,"return=representation"),body:JSON.stringify(payload)}
          );
          rows=await parseResponse(ir,"CREATE_PROFILE_SOURCE");
        }

        const sourcePatch:Record<string,unknown>={updated_at:new Date().toISOString()};
        if(body.url!==undefined){try{sourcePatch.url=cleanUrl(body.url)}catch{return json({ok:false,error:"INVALID_URL"},400,origin)}}
        if(body.category!==undefined)sourcePatch.category=String(body.category||"Inne").trim().slice(0,120)||"Inne";
        if(body.source_type!==undefined)sourcePatch.source_type=String(body.source_type||"website").trim().slice(0,40)||"website";
        if(body.notes!==undefined)sourcePatch.notes=String(body.notes||"").trim().slice(0,1000)||null;
        if(body.name!==undefined){
          const nextName=String(body.name||"").trim().slice(0,180);
          if(nextName.length<2)return json({ok:false,error:"NAME_REQUIRED"},400,origin);
          sourcePatch.name=nextName;
        }
        if(Object.keys(sourcePatch).length>1){
          const sr=await fetch(
            `${sourcesEndpoint}?id=eq.${encodeURIComponent(id)}`,
            {method:"PATCH",headers:adminHeaders(secret,"return=minimal"),body:JSON.stringify(sourcePatch)}
          );
          if(!sr.ok)throw new Error(`PATCH_SOURCE_${sr.status}:${(await sr.text()).slice(0,180)}`);
        }

        await syncLegacy(id);
        return json({ok:true,source:await mergedSource(id,profileKey)},200,origin);
      }

      // Backward-compatible legacy PATCH.
      const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
      if(typeof body.active==="boolean")patch.active=body.active;
      if(body.priority!=null)patch.priority=Math.max(1,Math.min(5,Number(body.priority)||3));
      if(body.category!=null)patch.category=String(body.category).trim().slice(0,120)||"Inne";
      if(body.notes!=null)patch.notes=String(body.notes).trim().slice(0,1000)||null;
      if(body.url!==undefined){try{patch.url=cleanUrl(body.url)}catch{return json({ok:false,error:"INVALID_URL"},400,origin)}}
      const desired=body.profile_keys!==undefined?cleanProfiles(body.profile_keys):null;
      if(desired&&desired.length)patch.profile_keys=desired;

      const pr=await fetch(
        `${sourcesEndpoint}?id=eq.${encodeURIComponent(id)}`,
        {method:"PATCH",headers:adminHeaders(secret,"return=representation"),body:JSON.stringify(patch)}
      );
      const rows=await parseResponse(pr,"PATCH_LEGACY_SOURCE");

      if(desired&&desired.length){
        const current=await fetchAssignments();
        const currentProfiles=current.filter((x:any)=>x.source_id===id).map((x:any)=>x.profile_key);
        for(const p of desired.filter((x:string)=>!currentProfiles.includes(x))){
          const ir=await fetch(
            profilesEndpoint,
            {method:"POST",headers:adminHeaders(secret,"return=minimal"),body:JSON.stringify({source_id:id,profile_key:p,active:true,priority:Number(body.priority)||Number(rows[0]?.priority)||3})}
          );
          if(!ir.ok)throw new Error(`LEGACY_ASSIGN_${ir.status}`);
        }
        for(const p of currentProfiles.filter((x:string)=>!desired.includes(x))){
          const dr=await fetch(
            `${profilesEndpoint}?source_id=eq.${encodeURIComponent(id)}&profile_key=eq.${encodeURIComponent(p)}`,
            {method:"DELETE",headers:adminHeaders(secret,"return=minimal")}
          );
          if(!dr.ok)throw new Error(`LEGACY_UNASSIGN_${dr.status}`);
        }
        await syncLegacy(id);
      }

      return json({ok:true,source:rows[0]||null},200,origin);
    }

    if(req.method==="DELETE"){
      const id=String(body?.id||body?.source_id||"").trim();
      const profileKey=cleanProfile(body?.profile_key);
      if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,error:"INVALID_ID"},400,origin);
      if(!profileKey)return json({ok:false,error:"PROFILE_REQUIRED"},400,origin);

      const dr=await fetch(
        `${profilesEndpoint}?source_id=eq.${encodeURIComponent(id)}&profile_key=eq.${encodeURIComponent(profileKey)}`,
        {method:"DELETE",headers:adminHeaders(secret,"return=minimal")}
      );
      if(!dr.ok)throw new Error(`DELETE_PROFILE_SOURCE_${dr.status}:${(await dr.text()).slice(0,180)}`);
      await syncLegacy(id);
      return json({ok:true,removed_from_profile:profileKey,source_id:id},200,origin);
    }

    return json({ok:false,error:"METHOD_NOT_ALLOWED"},405,origin);
  }catch(e){
    console.error(e);
    return json({ok:false,error:"INTERNAL_ERROR"},500,origin);
  }
});
