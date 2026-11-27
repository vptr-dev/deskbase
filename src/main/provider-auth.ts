import {net} from 'electron'
import {AUTH_PROVIDERS,supportsBrowserSignIn} from '../shared/provider-auth'
import {browserCode} from './mail-auth'

export interface Grant {kind:string;client:string;clientSecret:string;access:string;refresh:string;expires:number}
async function exchange(kind:string,client:string,clientSecret:string,fields:Record<string,string>){
 const p=AUTH_PROVIDERS[kind]
 const headers:Record<string,string>={Accept:'application/json','Content-Type':p.json?'application/json':'application/x-www-form-urlencoded'}
 if(p.basic&&clientSecret)headers.Authorization='Basic '+Buffer.from(client+':'+clientSecret).toString('base64')
 else{fields.client_id=client;if(clientSecret)fields.client_secret=clientSecret}
 if(kind==='notion')headers['Notion-Version']='2022-06-28'
 const response=await net.fetch(p.token,{method:'POST',headers,body:p.json?JSON.stringify(fields):new URLSearchParams(fields).toString()})
 const data=await response.json()
 if(!response.ok||typeof data.access_token!=='string')throw Error('Sign-in was rejected. Check the registered redirect address and client credentials.')
 return {access:String(data.access_token),refresh:String(data.refresh_token||''),expires:data.expires_in?Date.now()+Number(data.expires_in)*1000:0}
}
export async function connectProvider(kind:string,client:string,clientSecret:string):Promise<Grant>{
 if(!supportsBrowserSignIn(kind)||!client.trim())throw Error('Missing supported provider or client ID')
 const p=AUTH_PROVIDERS[kind]
 const pkce=['github','gitlab','linear','airtable','dropbox','asana','figma'].includes(kind)
 const {code,redirect,verifier}=await browserCode(p.authorize,{client_id:client,response_type:'code',...(p.scope?{scope:p.scope}:{}),...p.extra},48937,pkce)
 const fields:Record<string,string>={grant_type:'authorization_code',code,redirect_uri:redirect,...(pkce?{code_verifier:verifier}:{})}
 return {kind,client,clientSecret,...await exchange(kind,client,clientSecret,fields)}
}
export async function renewProvider(g:Grant):Promise<Grant>{
 if(!g.refresh)throw Error('This authorization expired. Sign in again.')
 const t=await exchange(g.kind,g.client,g.clientSecret,{grant_type:'refresh_token',refresh_token:g.refresh})
 return {...g,...t,refresh:t.refresh||g.refresh}
}
