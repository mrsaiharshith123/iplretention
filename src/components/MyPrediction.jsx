import {useEffect,useMemo,useRef,useState} from 'react'
import {supabase} from '../supabase'
import {renderCard,fileName,downloadBlob,shareBlob,FORMATS} from '../lib/shareCard'

const btn = 'rounded-lg px-4 py-2.5 font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 disabled:active:scale-100'

function Photo({url,name,accent}){
 const [bad,setBad] = useState(false)
 if(!url || bad) return <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg bg-deep grid place-items-center"><span className={'text-2xl font-extrabold '+accent}>{name[0]}</span></div>
 return <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg bg-deep overflow-hidden"><img src={url} alt={name} loading="lazy" onError={()=>setBad(true)} className="h-full w-full object-contain p-1"/></div>
}

function PlayerRow({p,tone,verdict}){
 const retain = tone==='retain'
 return (
  <li className={'flex items-center gap-3 rounded-xl bg-card p-2.5 border-l-4 '+(retain?'border-csk':'border-red-400')}>
   <Photo url={p.photo_url} name={p.name} accent={retain?'text-csk':'text-red-400'}/>
   <div className="min-w-0 flex-1">
    <p className="font-extrabold leading-tight break-words">{p.name}</p>
    <p className="text-sm text-muted">{p.role}{p.is_replacement && !/replacement/i.test(p.role)?' · Replacement':''}</p>
   </div>
   {verdict && <span className={'shrink-0 text-xs font-extrabold rounded px-2 py-1 '+(verdict==='correct'?'bg-green-500/20 text-green-300':'bg-red-500/20 text-red-300')}>{verdict==='correct'?'✓ Correct':'✗ Incorrect'}</span>}
  </li>)
}

function Section({title,emoji,tone,items,verdicts}){
 const retain = tone==='retain'
 return (
  <section className={'rounded-2xl p-3 sm:p-4 '+(retain?'bg-csk/5 border border-csk/40':'bg-red-500/5 border border-red-400/30')}>
   <h3 className={'flex items-center justify-between text-lg sm:text-xl font-extrabold tracking-wide mb-3 '+(retain?'text-csk':'text-red-400')}>
    <span>{title} {emoji}</span><span>{items.length}</span>
   </h3>
   {items.length
    ? <ul className="space-y-2">{items.map(p=><PlayerRow key={p.id} p={p} tone={tone} verdict={verdicts?.[p.id]}/>)}</ul>
    : <p className="text-muted text-sm">No players in this group.</p>}
  </section>)
}

function ShareModal({data,onClose,toast}){
 const [fmt,setFmt] = useState('landscape')
 const [blobs,setBlobs] = useState({}), [urls,setUrls] = useState({}), [err,setErr] = useState('')
 const [busy,setBusy] = useState(false)
 const made = useRef(false)

 useEffect(()=>{
  if(made.current) return; made.current = true
  let dead = false, created = []
  ;(async()=>{
   try{
    const out = {}, u = {}
    for(const k of Object.keys(FORMATS)){ out[k] = await renderCard(k,data); u[k] = URL.createObjectURL(out[k]); created.push(u[k]) }
    if(!dead){ setBlobs(out); setUrls(u) }
   }catch(e){ if(!dead) setErr(e.message||'Could not generate the image') }
  })()
  return ()=>{ dead = true }
 },[])
 useEffect(()=>()=>Object.values(urls).forEach(URL.revokeObjectURL),[urls])

 const ready = blobs.landscape && blobs.story
 const dl = k => downloadBlob(blobs[k], fileName(k,data.name))
 const share = async () => {
  setBusy(true)
  const r = await shareBlob(blobs[fmt], fileName(fmt,data.name))
  setBusy(false)
  if(r==='downloaded') toast('Sharing isn’t supported here — image downloaded instead')
 }
 const canNativeShare = typeof navigator!=='undefined' && !!navigator.share

 return (
  <div className="fixed inset-0 bg-black/80 z-50 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={onClose}>
   <div className="bg-card rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-4" onClick={e=>e.stopPropagation()}>
    <div className="flex items-center justify-between">
     <h3 className="text-xl font-extrabold">Share your prediction</h3>
     <button className={btn+' bg-deep px-3 py-1.5'} onClick={onClose}>Close</button>
    </div>
    <div className="flex gap-2">
     {[['landscape','4:3 Landscape'],['story','Instagram Story']].map(([k,l])=>
      <button key={k} onClick={()=>setFmt(k)} className={btn+' flex-1 '+(fmt===k?'bg-csk text-navy':'bg-deep')}>{l}</button>)}
    </div>
    <div className={'mx-auto rounded-lg bg-navy overflow-hidden grid place-items-center '+(fmt==='story'?'max-w-[16rem]':'w-full')} style={{aspectRatio:fmt==='story'?'9/16':'4/3'}}>
     {err ? <p className="text-red-400 text-sm p-4 text-center">{err}</p>
      : urls[fmt] ? <img src={urls[fmt]} alt="Your prediction card" className="w-full h-full object-contain"/>
      : <p className="text-muted animate-pulse text-sm">Generating your card…</p>}
    </div>
    {err && <button className={btn+' w-full bg-deep'} onClick={()=>{made.current=false;setErr('');onClose()}}>Try again</button>}
    <div className="grid gap-2 sm:grid-cols-2">
     <button className={btn+' bg-deep'} disabled={!ready} onClick={()=>dl('landscape')}>Download 4:3 Image</button>
     <button className={btn+' bg-deep'} disabled={!ready} onClick={()=>dl('story')}>Download Instagram Story</button>
     <button className={btn+' bg-csk text-navy sm:col-span-2'} disabled={!ready||busy} onClick={share}>{busy?'Opening…':canNativeShare?'Share to Instagram / Share Image':'Share Image (downloads on this device)'}</button>
    </div>
    <p className="text-muted text-xs">On mobile, “Share” opens your share sheet — pick Instagram, WhatsApp or any app. On desktop the image downloads.</p>
   </div>
  </div>)
}

export default function MyPrediction({identity,settings,toast,justSubmitted}){
 const [state,setState] = useState({status:'loading'})
 const [share,setShare] = useState(false)

 const load = async () => {
  setState({status:'loading'})
  try{
   const {data:items,error} = await supabase.rpc('get_my_prediction',{p_participant_id:identity.id})
   if(error) throw error
   if(!items?.length){ setState({status:'empty'}); return }
   const ids = items.map(i=>i.player_id)
   const [pl,pt] = await Promise.all([
    supabase.from('players').select('id,name,role,photo_url,is_replacement').in('id',ids),
    supabase.from('participants').select('display_name').eq('id',identity.id).maybeSingle(),
   ])
   if(pl.error) throw pl.error
   const byId = Object.fromEntries(pl.data.map(p=>[p.id,p]))
   let official = null
   if(settings?.results_published){
    const {data:res} = await supabase.from('official_results').select('player_id,decision')
    if(res?.length) official = Object.fromEntries(res.map(r=>[r.player_id,r.decision]))
   }
   const rows = items.map(i=>({id:i.player_id,decision:i.decision,...(byId[i.player_id]||{name:i.player_name,role:''})}))
   rows.sort((a,b)=>a.name.localeCompare(b.name))
   setState({status:'ok',name:pt.data?.display_name||identity.name,submittedAt:items[0].submitted_at,
    retained:rows.filter(r=>r.decision==='retain'),released:rows.filter(r=>r.decision==='release'),official})
  }catch(e){ setState({status:'error',message:e.message||'Could not load your prediction'}) }
 }
 useEffect(()=>{ load() },[identity.id,settings?.results_published])

 const verdicts = useMemo(()=>{
  if(state.status!=='ok'||!state.official) return null
  const v = {}; [...state.retained,...state.released].forEach(p=>{ if(state.official[p.id]) v[p.id] = state.official[p.id]===p.decision?'correct':'incorrect' })
  return v
 },[state])

 if(state.status==='loading') return <div className="space-y-3">{Array.from({length:5}).map((_,i)=><div key={i} className="h-20 rounded-xl bg-card animate-pulse"/>)}</div>
 if(state.status==='error') return <div className="bg-card rounded-xl p-6 space-y-3"><p className="text-red-400">{state.message}</p><button className={btn+' bg-csk text-navy'} onClick={load}>Retry</button></div>
 if(state.status==='empty') return <p className="bg-card rounded-xl p-6 text-muted">No submitted prediction found for this device yet.</p>

 const {name,submittedAt,retained,released} = state
 const total = retained.length+released.length, pct = total?Math.round(100*retained.length/total):0
 const when = new Date(submittedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST'

 return (
  <div className="space-y-5 animate-[slideup_.25s_ease-out]">
   <div className="rounded-2xl bg-card border border-deep p-5 sm:p-6 text-center space-y-1">
    <p className="text-csk font-extrabold tracking-[.2em] text-xs sm:text-sm">CSK RETENTION PREDICTOR 2027</p>
    <h2 className="text-3xl sm:text-5xl font-extrabold">MY PREDICTION</h2>
    {justSubmitted && <p className="text-csk font-semibold">Locked in! Your prediction is saved.</p>}
    <p className="text-xl font-extrabold break-words">{name}</p>
    <p className="text-muted text-sm">Submitted {when}</p>
   </div>

   <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
    <div className="rounded-xl bg-card p-3"><p className="text-2xl sm:text-4xl font-extrabold text-csk">{retained.length}</p><p className="text-[11px] sm:text-xs text-muted font-bold tracking-wider">RETAINED</p></div>
    <div className="rounded-xl bg-card p-3"><p className="text-2xl sm:text-4xl font-extrabold text-red-400">{released.length}</p><p className="text-[11px] sm:text-xs text-muted font-bold tracking-wider">RELEASED</p></div>
    <div className="rounded-xl bg-card p-3"><p className="text-2xl sm:text-4xl font-extrabold">{total}</p><p className="text-[11px] sm:text-xs text-muted font-bold tracking-wider">TOTAL PLAYERS</p></div>
   </div>
   <div className="h-3 w-full rounded-full bg-red-400/70 overflow-hidden" role="img" aria-label={`${retained.length} retained, ${released.length} released`}>
    <div className="h-full bg-csk" style={{width:pct+'%'}}/>
   </div>

   <button className={btn+' w-full bg-csk text-navy text-lg py-3.5 font-extrabold tracking-wide'} onClick={()=>setShare(true)}>SHARE MY PREDICTION</button>

   {verdicts && <p className="text-sm text-muted">Official results are in — your original picks are marked below.</p>}

   <div className="grid gap-4 lg:grid-cols-2 items-start">
    <Section title="RETAINED PLAYERS" emoji="🟡" tone="retain" items={retained} verdicts={verdicts}/>
    <Section title="RELEASED PLAYERS" emoji="🔴" tone="release" items={released} verdicts={verdicts}/>
   </div>

   <button className={btn+' w-full bg-csk text-navy'} onClick={()=>setShare(true)}>SHARE MY PREDICTION</button>
   {share && <ShareModal toast={toast} onClose={()=>setShare(false)} data={{name,retained,released}}/>}
  </div>)
}
