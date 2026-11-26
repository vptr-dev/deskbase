import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const signature=Buffer.from('DBVAULT1')
let key:Buffer|null=null
const marker=(dir:string):string=>path.join(dir,'vault-settings.json')
export const protectedData=(dir:string):boolean=>fs.existsSync(marker(dir))
export const lockedData=(dir:string):boolean=>protectedData(dir)&&!key

function sealed(bytes:Buffer):boolean{return bytes.subarray(0,signature.length).equals(signature)}
function encrypt(bytes:Buffer,secret:Buffer):Buffer {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',secret,iv)
  const body=Buffer.concat([cipher.update(bytes),cipher.final()])
  return Buffer.concat([signature,iv,cipher.getAuthTag(),body])
}
function decrypt(bytes:Buffer,secret:Buffer):Buffer {
  const start=signature.length
  const decipher=createDecipheriv('aes-256-gcm',secret,bytes.subarray(start,start+12))
  decipher.setAuthTag(bytes.subarray(start+12,start+28))
  return Buffer.concat([decipher.update(bytes.subarray(start+28)),decipher.final()])
}
export function atomicBytes(file:string,bytes:Buffer):void{
  const tmp=file+'.writing'
  fs.writeFileSync(tmp,bytes,{flush:true});fs.renameSync(tmp,file)
}
export function readStored(dir:string,file:string):string{
  if(lockedData(dir))throw Error('Workspace is locked')
  const bytes=fs.readFileSync(file)
  if(sealed(bytes)&&!key)throw Error('Password required')
  return (sealed(bytes)?decrypt(bytes,key!):bytes).toString('utf8')
}
export function writeStored(dir:string,file:string,text:string):void{
  if(lockedData(dir))throw Error('Workspace is locked')
  const b=Buffer.from(text)
  atomicBytes(file,key?encrypt(b,key):b)
}
function convert(dir:string,root:string,enabled:boolean,secret:Buffer):void {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name)
    if(file===marker(root)||entry.isSymbolicLink())continue
    if(entry.isDirectory()){convert(file,root,enabled,secret);continue}
    if(!entry.isFile())continue
    const bytes=fs.readFileSync(file)
    if(enabled!==sealed(bytes))atomicBytes(file,enabled?encrypt(bytes,secret):decrypt(bytes,secret))
  }
}
function verify(dir:string,password:string):Buffer{
  const {salt,check}=JSON.parse(fs.readFileSync(marker(dir),'utf8'))
  const secret=scryptSync(password,Buffer.from(salt,'base64'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024})
  try{if(decrypt(Buffer.from(check,'base64'),secret).toString()!=='Deskbase')throw Error()}catch{secret.fill(0);throw Error('Incorrect password or damaged password settings')}
  return secret
}
export function setProtection(dir:string,password:string,action:'enable'|'unlock'|'disable'):void {
  if(action==='enable'){
    if(protectedData(dir)||password.length<10)throw Error('Use at least ten characters')
    const salt=randomBytes(16),secret=scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})
    atomicBytes(marker(dir),Buffer.from(JSON.stringify({salt:salt.toString('base64'),check:encrypt(Buffer.from('Deskbase'),secret).toString('base64'),pending:true})))
    key=secret
  }else if(action==='unlock'||action==='disable'){key=verify(dir,password)}
  else throw Error('Unknown password action')
  const state=JSON.parse(fs.readFileSync(marker(dir),'utf8'))
  if(action==='disable'){
    state.pending=true
    atomicBytes(marker(dir),Buffer.from(JSON.stringify(state)))
    convert(dir,dir,false,key!)
    fs.unlinkSync(marker(dir));key!.fill(0);key=null
  }else if(state.pending){
    convert(dir,dir,true,key!);state.pending=false
    atomicBytes(marker(dir),Buffer.from(JSON.stringify(state)))
  }
}
