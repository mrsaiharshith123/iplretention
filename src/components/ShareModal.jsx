import {useEffect,useRef,useState} from 'react'
import {fileName,downloadBlob,shareBlob,FORMATS} from '../lib/shareCard'

const btn = 'rounded-lg px-4 py-2.5 font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 disabled:active:scale-100'

export default function ShareModal({make,title,fileBase,alt,onClose,toast}){
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
    for(const k of Object.keys(FORMATS)){ out[k] = await make(k); u[k] = URL.createObjectURL(out[k]); created.push(u[k]) }
    if(!dead){ setBlobs(out); setUrls(u) }
   }catch(e){ if(!dead) setErr(e.message||'Could not generate the image') }
  })()
  return ()=>{ dead = true }
 },[])
 useEffect(()=>()=>Object.values(urls).forEach(URL.revokeObjectURL),[urls])

 const ready = blobs.landscape && blobs.story
 const dl = k => downloadBlob(blobs[k], fileName(k,fileBase))
 const share = async () => {
  setBusy(true)
  const r = await shareBlob(blobs[fmt], fileName(fmt,fileBase))
  setBusy(false)
  if(r==='downloaded') toast('Sharing isn’t supported here — image downloaded instead')
 }
 const canNativeShare = typeof navigator!=='undefined' && !!navigator.share

 return (
  <div className="fixed inset-0 bg-black/80 z-50 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={onClose}>
   <div className="bg-card rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-4" onClick={e=>e.stopPropagation()}>
    <div className="flex items-center justify-between">
     <h3 className="text-xl font-extrabold">{title}</h3>
     <button className={btn+' bg-deep px-3 py-1.5'} onClick={onClose}>Close</button>
    </div>
    <div className="flex gap-2">
     {[['landscape','4:3 Landscape'],['story','Instagram Story']].map(([k,l])=>
      <button key={k} onClick={()=>setFmt(k)} className={btn+' flex-1 '+(fmt===k?'bg-csk text-navy':'bg-deep')}>{l}</button>)}
    </div>
    <div className={'mx-auto rounded-lg bg-navy overflow-hidden grid place-items-center '+(fmt==='story'?'max-w-[16rem]':'w-full')} style={{aspectRatio:fmt==='story'?'9/16':'4/3'}}>
     {err ? <p className="text-red-400 text-sm p-4 text-center">{err}</p>
      : urls[fmt] ? <img src={urls[fmt]} alt={alt} className="w-full h-full object-contain"/>
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

