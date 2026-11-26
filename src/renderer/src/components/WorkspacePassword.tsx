import {useState} from 'react'
import {api} from '../lib/api'
export function WorkspacePassword({mode,onDone}:{mode:'unlock'|'enable'|'disable';onDone:()=>void}):JSX.Element{
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 return <form className="form" onSubmit={async e=>{e.preventDefault();if(busy)return
 setBusy(true);setError('');try{await api.vaultChange(password,mode);setPassword('');setConfirm('');onDone()}catch(e){setError(e instanceof Error?e.message:'Could not update password')}finally{setBusy(false)}
 }}><label>Password<input className="input" required type="password" autoComplete={mode==='enable'?'new-password':'current-password'} minLength={mode==='enable'?10:1} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {mode==='enable'&&<label>Confirm password<input required className="input" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
 {error&&<span role="alert">{error}</span>}<button className="btn btn-sm btn-primary" disabled={busy||!password||(mode==='enable'&&confirm!==password)}>{mode==='unlock'?'Unlock workspace':mode==='enable'?'Encrypt workspace':'Remove password'}</button></form>
}
