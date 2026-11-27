import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { shell, net } from 'electron'

const providers = {
  gmail: { host: 'imap.gmail.com', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://mail.google.com/' },
  outlook: { host: 'outlook.office365.com', authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All' }
}
export type MailProvider = keyof typeof providers
export interface MailGrant {provider:MailProvider;user:string;client:string;clientSecret:string;refresh:string;access:string;expires:number}
async function exchange(provider:MailProvider, fields:Record<string,string>) {
  const r=await net.fetch(providers[provider].token,{method:'POST',body:new URLSearchParams(fields).toString(),headers:{'Content-Type':'application/x-www-form-urlencoded'}})
  const t=await r.json()
  if(!r.ok||typeof t.access_token!=='string')throw Error('Provider rejected the authorization. Check the desktop client settings or sign in again.')
  return {access:t.access_token as string,refresh:typeof t.refresh_token==='string'?t.refresh_token:'',expires:Date.now()+(Number(t.expires_in)||3600)*1000}
}
export async function authorizeMail(provider:MailProvider,user:string,client:string,clientSecret:string):Promise<MailGrant>{
  if(!Object.hasOwn(providers,provider)||!user.trim()||!client.trim())throw Error('Enter the email address and desktop client ID.')
  const {code,redirect,verifier}=await browserCode(providers[provider].authorize,{client_id:client,response_type:'code',scope:providers[provider].scope,login_hint:user,...(provider==='gmail'?{access_type:'offline',prompt:'consent'}:{})})
    const tokens=await exchange(provider,{grant_type:'authorization_code',code,client_id:client,...(clientSecret?{client_secret:clientSecret}:{}),code_verifier:verifier,redirect_uri:redirect})
    if(!tokens.refresh)throw Error('Offline access was not granted. Sign in again.')
    return {provider,user,client,clientSecret,...tokens}
}
export async function browserCode(endpoint:string,parameters:Record<string,string>,port=0,pkce=true){
  const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url')
  const server=createServer()
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
    const address=server.address();if(!address||typeof address==='string')throw Error('Could not start local sign-in')
    const redirect='http://127.0.0.1:'+address.port+'/'
    const u=new URL(endpoint)
    u.search=new URLSearchParams({...parameters,redirect_uri:redirect,state,...(pkce?{code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}:{})}).toString()
    const code=await new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Sign-in timed out. Try again.')),180000)
      server.once('close',()=>clearTimeout(timer))
      server.on('request',(req,res)=>{
        if(req.method!=='GET'||!URL.canParse(req.url||'/',redirect)){res.writeHead(400);res.end();return}
        const url=new URL(req.url||'/',redirect)
        if(url.pathname!=='/'||url.searchParams.get('state')!==state){res.writeHead(404);res.end();return}
        const code=url.searchParams.get('code')
        res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Return to Deskbase to finish signing in.')
        if(code)resolve(code);else reject(Error('Sign-in cancelled by provider'))
      })
      void shell.openExternal(u.href).catch(reject)
    })
    return {code,redirect,verifier}
  }finally{server.close()}
}
export async function renewMail(g:MailGrant):Promise<MailGrant>{
  const t=await exchange(g.provider,{grant_type:'refresh_token',client_id:g.client,...(g.clientSecret?{client_secret:g.clientSecret}:{}),refresh_token:g.refresh})
  return {...g,...t,refresh:t.refresh||g.refresh}
}
export function matchesMail(g:MailGrant,host:string,user:string):boolean{
  return providers[g.provider]?.host===host.toLowerCase()&&user.toLowerCase()===g.user.toLowerCase()
}
