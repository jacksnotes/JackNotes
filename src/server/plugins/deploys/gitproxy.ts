import { IApplicationDb } from '../../interfaces/application'

const { HttpProxyAgent, HttpsProxyAgent } = require('hpagent')
const get = require('simple-get')

export default class GitProxy {
  db: IApplicationDb

  constructor(appInstance: any) {
    this.db = appInstance.db
    // console.log('instance git proxy',this.db.setting)
  }

  public async request({
    url,
    method,
    headers,
    body,
  }: {
    url: any;
    method: any;
    headers: any;
    body: any;
  }) {
    const { setting } = this.db
    body = await this.mergeBuffers(body)
    const proxy = url.startsWith('https:')
      ? { Agent: HttpsProxyAgent }
      : { Agent: HttpProxyAgent }

    let agent: any
    // 如果是API部署模式，不使用代理
    if (setting.useDeployApi) {
      agent = undefined
    } else {
      // Direct Deploy：完全不使用代理，让系统自动检测IP和路由
      // 中国用户会因为GFW而失败，然后选择API部署模式
      agent = undefined
    }

    return {
      url,
      method,
      body: [],
      headers,
      *[Symbol.asyncIterator]() {
        const chunks: Buffer[] = []
        let resolve: (value: any) => void
        let reject: (error: any) => void
        
        const req = get(
          {
            url,
            method,
            agent,
            headers,
            body,
            timeout: 30000,
          },
          (err: any, res: any) => {
            if (err) {
              reject(err)
              return
            }
            
            res.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
            })
            
            res.on('end', () => {
              const data = Buffer.concat(chunks)
              resolve({
                url: res.url,
                method: res.method,
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                body: [data],
                headers: res.headers,
              })
            })
            
            res.on('error', (error: any) => {
              reject(error)
            })
          }
        )
        
        req.on('error', (error: any) => {
          reject(error)
        })

        return new Promise((res, rej) => {
          resolve = res
          reject = rej
        })
      }
    }
  }

  private async mergeBuffers(data: any[] | Uint8Array) {
    if (!Array.isArray(data)) return data
    if (data.length === 1 && data[0] instanceof Buffer) return data[0]
    const buffers = []
    let offset = 0
    let size = 0
    for await (const chunk of data) {
      buffers.push(chunk)
      size += chunk.byteLength
    }
    data = new Uint8Array(size)
    for (const buffer of buffers) {
      data.set(buffer, offset)
      offset += buffer.byteLength
    }
    return Buffer.from(data.buffer)
  }

  public async requestApi({
    url,
    method,
    headers,
    body,
  }: {
    url: any;
    method: any;
    headers: any;
    body: any;
  }) {
    const { setting } = this.db
    body = await this.mergeBuffers(body)
    
    // API调用不使用代理，直接连接
    const agent = undefined

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const req = get(
        {
          url,
          method,
          agent,
          headers,
          body,
          timeout: 30000,
        },
        (err: any, res: any) => {
          if (err) {
            reject(err)
            return
          }
          
          res.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
          })
          
          res.on('end', () => {
            const data = Buffer.concat(chunks)
            resolve({
              url: res.url,
              method: res.method,
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              data,
            })
          })
          
          res.on('error', (error: any) => {
            reject(error)
          })
        }
      )
      
      req.on('error', (error: any) => {
        reject(error)
      })
    })
  }
}
