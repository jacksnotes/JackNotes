export interface ISetting {
  platform: 'github' | 'coding' | 'sftp' | 'gitee' | 'netlify' | 'vercel' | 'wordpress'
  domain: string
  repository: string
  branch: string
  username: string
  email: string
  tokenUsername: string
  token: string
  cname: string
  port: string
  server: string
  password: string
  privateKey: string
  remotePath: string
  proxyPath: string
  proxyPort: string
  netlifyAccessToken: string
  netlifySiteId: string
  vercelToken: string
  vercelProjectId: string
  vercelProjectName: string
  useDeployApi: boolean
  deployApiUrl: string
  wordpressUrl?: string
  wordpressUsername?: string
  wordpressPassword?: string
  wordpressAppPassword?: string
  [index: string]: string | boolean | undefined
}

export interface IDisqusSetting {
  api: string
  apikey: string
  shortname: string
}
export interface IGitalkSetting {
  clientId: string
  clientSecret: string
  repository: string
  owner: string
}

export interface ICommentSetting {
  commentPlatform: string
  showComment: boolean
  disqusSetting: IDisqusSetting
  gitalkSetting: IGitalkSetting
}
