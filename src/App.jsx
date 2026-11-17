import {useEffect,useMemo,useState,useCallback} from 'react'
import {supabase} from './supabase'

const STORAGE_KEY = 'csk2027_participant'
const kind = r => /wicket/i.test(r) ? 'Wicketkeeper' : /all/i.test(r) ? 'All-rounder' : /bowl/i.test(r) ? 'Bowler' : 'Batter'
const FILTERS = ['All','Batter','Wicketkeeper','All-rounder','Bowler']
const btn = 'rounded-lg px-4 py-2.5 font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 disabled:active:scale-100'

function loadIdentity(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) }catch{ return null } }
function saveIdentity(v){ localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) }

function PlayerPhoto({url,name}){
 const [loaded,setLoaded] = useState(false)
 const [errored,setErrored] = useState(false)
 if(!url || errored) return (
  <div className="aspect-square w-full rounded-lg bg-deep grid place-items-center">
   <span className="text-3xl font-extrabold text-csk">{name[0]}</span>
  </div>)
 return (
  <div className="aspect-square w-full rounded-lg bg-deep relative overflow-hidden">
   {!loaded && <div className="absolute inset-0 animate-pulse bg-deep/70"/>}
   <img src={url} alt={name} loading="lazy" onLoad={()=>setLoaded(true)} onError={()=>setErrored(true)}
    className={'h-full w-full object-contain p-2 transition-opacity duration-300 '+(loaded?'opacity-100':'opacity-0')}/>
  </div>)
}

function NameModal({onCancel,onSaved,toast}){
 const [name,setName] = useState(''), [busy,setBusy] = useState(false), [err,setErr] = useState('')
 const go = async () => {
  const n = name.trim()
  if(!n){ setErr('Enter a name.'); return }
  setBusy(true); setErr('')
  const {data,error} = await supabase.rpc('create_participant',{p_display_name:n})
  setBusy(false)
  if(error){ setErr(error.message); return }
  const identity = {id:data, name:n}
  saveIdentity(identity)
  onSaved(identity)
 }
 return (
  <div className="fixed inset-0 bg-black/70 grid place-items-end sm:place-items-center p-0 sm:p-4 z-50">
   <div className="bg-card rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full space-y-3 animate-[slideup_.2s_ease-out]">
    <h3 className="text-xl font-extrabold">What should we call you?</h3>
    <p className="text-muted text-sm">This name appears on the leaderboard. No account, no password.</p>
    <input autoFocus value={name} onChange={e=>setName(e.target.value)} maxLength={40}
     onKeyDown={e=>e.key==='Enter'&&go()}
     placeholder="Your name" className="w-full rounded-lg bg-navy border border-deep px-3 py-3 text-base"/>
    {err && <p className="text-red-400 text-sm">{err}</p>}
    <div className="flex gap-2 pt-1">
     <button className={btn+' flex-1 bg-deep'} onClick={onCancel}>Cancel</button>
     <button className={btn+' flex-1 bg-csk text-navy'} disabled={busy} onClick={go}>{busy?'Saving…':'Continue'}</button>
    </div>
   </div>
  </div>)
}

function Predict({identity,setIdentity,settings,toast}){
 const [players,setPlayers] = useState(null)
 const [picks,setPicks] = useState({})
 const [q,setQ] = useState(''), [f,setF] = useState('All')
 const [mine,setMine] = useState(null) // existing submitted prediction, if any
 const [checking,setChecking] = useState(true)
 const [showName,setShowName] = useState(false)
 const [confirm,setConfirm] = useState(false)
 const [busy,setBusy] = useState(false)

 useEffect(()=>{
  supabase.from('players').select('*').eq('is_active',true).order('name').then(({data,error})=>error?toast(error.message):setPlayers(data))
 },[])

 useEffect(()=>{
  if(!identity){ setChecking(false); return }
  supabase.rpc('get_my_prediction',{p_participant_id:identity.id}).then(({data,error})=>{
   setChecking(false)
   if(!error && data && data.length) setMine(data)
  })
 },[identity])

 const closed = settings && (!settings.submissions_open || new Date() >= new Date(settings.deadline))
 const list = useMemo(()=> (players||[]).filter(p => (f==='All'||kind(p.role)===f) && p.name.toLowerCase().includes(q.toLowerCase())), [players,q,f])

 if(!players || checking) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><div key={i} className="rounded-xl bg-card p-4 h-56 animate-pulse"/>)}</div>

 if(mine){
  const retained = mine.filter(m=>m.decision==='retain'), released = mine.filter(m=>m.decision==='release')
  return (
   <div className="bg-card rounded-xl p-6 space-y-3">
    <h3 className="text-xl font-extrabold">Thanks, {identity.name} — you're in.</h3>
    <p className="text-muted">Your prediction is locked in. You predicted <span className="text-csk font-semibold">{retained.length} retained</span> and <span className="text-red-400 font-semibold">{released.length} released</span>. Check the leaderboard once results are out.</p>
   </div>)
 }
 if(closed) return <p className="bg-card rounded-xl p-6">Submissions are closed.</p>

 const cnt = d => Object.values(picks).filter(x=>x===d).length
 const left = players.length - Object.keys(picks).length
 const set = (id,d) => setPicks(p => p[id]===d ? (({[id]:_,...r})=>r)(p) : {...p,[id]:d})

 const doSubmit = async (pid) => {
  setBusy(true)
  const {error} = await supabase.rpc('submit_prediction',{p_participant_id:pid, items:Object.entries(picks).map(([player_id,decision])=>({player_id,decision}))})
  setBusy(false)
  if(error){ toast(error.message); return }
  setConfirm(false)
  setMine(Object.entries(picks).map(([player_id,decision])=>({player_id,decision,player_name:players.find(p=>p.id===player_id)?.name})))
  toast('Prediction submitted')
 }

 return (
  <div className="space-y-4 pb-28">
   <div className="flex flex-wrap gap-2">
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search players"
     className="flex-1 min-w-[10rem] rounded-lg bg-card border border-deep px-3 py-2.5 text-base"/>
    <div className="flex gap-2 overflow-x-auto w-full sm:w-auto">
     {FILTERS.map(x => <button key={x} onClick={()=>setF(x)} className={btn+' shrink-0 '+(f===x?'bg-csk text-navy':'bg-card text-muted')}>{x}</button>)}
    </div>
   </div>

   <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
    {list.map(p => { const d = picks[p.id]; return (
     <div key={p.id} className={'rounded-xl bg-card p-3 border-2 transition-colors duration-150 '+(d==='retain'?'border-csk':d==='release'?'border-red-400':'border-transparent')}>
      <PlayerPhoto url={p.photo_url} name={p.name}/>
      <div className="mt-2 min-w-0">
       <p className="font-semibold truncate text-sm sm:text-base">{p.name}</p>
       <p className="text-xs sm:text-sm text-muted truncate">{p.role}{p.nationality?` · ${p.nationality}`:''}</p>
      </div>
      {p.is_replacement && <span className="inline-block mt-1.5 rounded bg-csk text-navy text-[11px] font-extrabold px-1.5 py-0.5">Replacement</span>}
      <div className="grid grid-cols-2 gap-1.5 mt-2">
       <button onClick={()=>set(p.id,'retain')} className={btn+' px-2 py-2 text-sm '+(d==='retain'?'bg-csk text-navy':'bg-deep hover:brightness-125')}>Retain</button>
       <button onClick={()=>set(p.id,'release')} className={btn+' px-2 py-2 text-sm '+(d==='release'?'bg-red-500':'bg-deep hover:brightness-125')}>Release</button>
      </div>
     </div>)})}
    {!list.length && <p className="text-muted col-span-full">No players match your filters.</p>}
   </div>

   <div className="fixed bottom-0 inset-x-0 bg-card border-t border-deep p-3 flex items-center justify-between gap-2 z-40" style={{paddingBottom:'calc(0.75rem + env(safe-area-inset-bottom,0px))'}}>
    <p className="text-sm truncate">Retain {cnt('retain')} · Release {cnt('release')} · Left {left}</p>
    <div className="flex gap-2 shrink-0">
     <button className={btn+' bg-deep'} onClick={()=>setPicks({})}>Reset</button>
     <button className={btn+' bg-csk text-navy'} disabled={left>0} onClick={()=> identity ? setConfirm(true) : setShowName(true)}>Review</button>
    </div>
   </div>

   {showName && <NameModal toast={toast} onCancel={()=>setShowName(false)} onSaved={(idn)=>{ setIdentity(idn); setShowName(false); setConfirm(true) }}/>}

   {confirm && identity && (
    <div className="fixed inset-0 bg-black/70 grid place-items-end sm:place-items-center p-0 sm:p-4 z-50">
     <div className="bg-card rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full space-y-3 max-h-[85vh] overflow-y-auto">
      <h3 className="text-xl font-extrabold">Confirm your prediction</h3>
      <p>Submitting as <span className="text-csk font-semibold">{identity.name}</span>.</p>
      <p className="text-muted">{players.length} players: {cnt('retain')} retained, {cnt('release')} released. You can't change this after submitting.</p>
      <div className="flex gap-2 pt-1">
       <button className={btn+' flex-1 bg-deep'} onClick={()=>setConfirm(false)}>Back</button>
       <button className={btn+' flex-1 bg-csk text-navy'} disabled={busy} onClick={()=>doSubmit(identity.id)}>{busy?'Submitting…':'Submit prediction'}</button>
      </div>
     </div>
    </div>)}
  </div>)
}

function Board(){
 const [rows,setRows] = useState(null), [n,setN] = useState(20)
 const load = useCallback(()=> supabase.from('leaderboard').select('*').order('rank').limit(n).then(({data})=>setRows(data||[])), [n])
 useEffect(()=>{
  load()
  const ch = supabase.channel('lb').on('postgres_changes',{event:'*',schema:'public',table:'scores'},load).subscribe()
  return ()=>supabase.removeChannel(ch)
 },[load])

 if(!rows) return <div className="space-y-2">{Array.from({length:5}).map((_,i)=><div key={i} className="h-12 rounded-lg bg-card animate-pulse"/>)}</div>
 if(!rows.length) return <p className="bg-card rounded-xl p-6 text-muted">No scores yet. Scores appear once official results are published.</p>

 return (
  <div className="bg-card rounded-xl overflow-x-auto">
   <table className="w-full text-left min-w-[480px]">
    <thead className="text-muted text-sm"><tr><th className="p-3">Rank</th><th>Fan</th><th>Points</th><th>Correct</th><th>Accuracy</th></tr></thead>
    <tbody>
     {rows.map(r => (
      <tr key={r.name+r.rank} className="border-t border-deep">
       <td className="p-3 font-extrabold text-csk">{r.rank}</td>
       <td className="truncate max-w-[10rem]">{r.name}</td>
       <td>{r.points}</td>
       <td>{r.correct}/{r.total}</td>
       <td>{r.accuracy}%</td>
      </tr>))}
    </tbody>
   </table>
   {rows.length >= n && <button className={btn+' m-3 bg-deep'} onClick={()=>setN(n+20)}>Load more</button>}
  </div>)
}

export default function App(){
 const [tab,setTab] = useState('predict')
 const [identity,setIdentity] = useState(null)
 const [settings,setSettings] = useState(null)
 const [msg,setMsg] = useState('')
 const toast = m => { setMsg(m); setTimeout(()=>setMsg(''),3500) }

 useEffect(()=>{
  setIdentity(loadIdentity())
  supabase.from('competition_settings').select('*').single().then(({data})=>setSettings(data))
 },[])

 return (
  <div className="min-h-screen font-sans">
   <header className="bg-card border-b border-deep sticky top-0 z-30">
    <div className="max-w-5xl mx-auto p-3 sm:p-4 flex flex-wrap items-center gap-2 justify-between">
     <h1 className="font-extrabold text-csk text-base sm:text-lg">CSK Retention Predictor 2027</h1>
     <nav className="flex gap-1.5 sm:gap-2 ml-auto">
      {[['predict','Predict'],['board','Leaderboard']].map(([k,l]) =>
       <button key={k} onClick={()=>setTab(k)} className={btn+' px-3 py-2 text-sm '+(tab===k?'bg-csk text-navy':'text-muted')}>{l}</button>)}
     </nav>
    </div>
   </header>

   <main className="max-w-5xl mx-auto p-3 sm:p-4 space-y-4">
    <p className="text-muted text-sm sm:text-base">
     Think you know what CSK will do? Prove it. Fan-made, not an official CSK or IPL product.
     {settings && ` Deadline: ${new Date(settings.deadline).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} IST.`}
     {identity && ` Playing as ${identity.name}.`}
    </p>
    {tab==='predict' && <Predict identity={identity} setIdentity={setIdentity} settings={settings} toast={toast}/>}
    {tab==='board' && <Board/>}
   </main>

   {msg && <div className="fixed top-4 right-4 left-4 sm:left-auto bg-csk text-navy font-semibold rounded-lg px-4 py-2.5 z-50 shadow-lg">{msg}</div>}
  </div>)
}
