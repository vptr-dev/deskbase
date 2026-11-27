export interface ProviderAuth { authorize:string; token:string; scope?:string; basic?:boolean; json?:boolean; extra?:Record<string,string> }
export const AUTH_PROVIDERS:Record<string,ProviderAuth>={
 github:{authorize:'https://github.com/login/oauth/authorize',token:'https://github.com/login/oauth/access_token',scope:'read:user'},
 gitlab:{authorize:'https://gitlab.com/oauth/authorize',token:'https://gitlab.com/oauth/token',scope:'read_api'},
 asana:{authorize:'https://app.asana.com/-/oauth_authorize',token:'https://app.asana.com/-/oauth_token',scope:'tasks:read projects:read'},
 clickup:{authorize:'https://app.clickup.com/api',token:'https://api.clickup.com/api/v2/oauth/token',json:true},
 linear:{authorize:'https://linear.app/oauth/authorize',token:'https://api.linear.app/oauth/token',scope:'read'},
 monday:{authorize:'https://auth.monday.com/oauth2/authorize',token:'https://auth.monday.com/oauth2/token',scope:'boards:read'},
 airtable:{authorize:'https://airtable.com/oauth2/v1/authorize',token:'https://airtable.com/oauth2/v1/token',scope:'data.records:read',basic:true},
 figma:{authorize:'https://www.figma.com/oauth',token:'https://api.figma.com/v1/oauth/token',scope:'projects:read',basic:true},
 slack:{authorize:'https://slack.com/oauth/v2/authorize',token:'https://slack.com/api/oauth.v2.access',scope:'channels:history,groups:history'},
 raindrop:{authorize:'https://raindrop.io/oauth/authorize',token:'https://raindrop.io/oauth/access_token',json:true},
 dropbox:{authorize:'https://www.dropbox.com/oauth2/authorize',token:'https://api.dropboxapi.com/oauth2/token',scope:'files.metadata.read',extra:{token_access_type:'offline'}},
 box:{authorize:'https://account.box.com/api/oauth2/authorize',token:'https://api.box.com/oauth2/token'},
 bitbucket:{authorize:'https://bitbucket.org/site/oauth2/authorize',token:'https://bitbucket.org/site/oauth2/access_token',basic:true},
 notion:{authorize:'https://api.notion.com/v1/oauth/authorize',token:'https://api.notion.com/v1/oauth/token',basic:true,json:true,extra:{owner:'user'}},
 todoist:{authorize:'https://todoist.com/oauth/authorize',token:'https://todoist.com/oauth/access_token',scope:'data:read_write'}
}
export const supportsBrowserSignIn=(kind:string):boolean=>Object.hasOwn(AUTH_PROVIDERS,kind)
export const PROVIDER_REDIRECT='http://127.0.0.1:48937/'
