import fs from 'fs'
import path from 'path'
import moment from 'moment'
// @ts-ignore
import Model from './model'
import GitProxy from './plugins/deploys/gitproxy'

const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')

export default class Deploy extends Model {
  outputDir: string = this.buildDir

  remoteUrl = ''

  platformAddress = ''

  http = new GitProxy(this)

  constructor(appInstance: any) {
    super(appInstance)
    const { setting } = this.db
    this.platformAddress = ({
      github: 'github.com',
      coding: 'e.coding.net',
      gitee: 'gitee.com',
    } as any)[setting.platform || 'github']

    const preUrl = ({
      github: `${setting.username}:${setting.token}`,
      coding: `${setting.tokenUsername}:${setting.token}`,
      gitee: `${setting.username}:${setting.token}`,
    } as any)[setting.platform || 'github']

    this.remoteUrl = `https://${preUrl}@${this.platformAddress}/${setting.username}/${setting.repository}.git`
  }

  /**
   * Check whether the remote connection is normal
   */
  async remoteDetect() {
    const { setting } = this.db

    // 如果是API部署模式，直接返回成功（因为API服务会处理连接）
    if (setting.useDeployApi) {
      return {
        success: true,
        message: ['API部署模式：连接检测通过'],
      }
    }

    const result = {
      success: true,
      message: [''],
    }
    try {
      let isRepo = false
      try {
        await git.currentBranch({ fs, dir: this.outputDir })
        isRepo = true
      } catch (e) {
        console.log('Not a repo', (e as any).message)
      }

      if (!setting.username || !setting.repository || !setting.token) {
        return {
          success: false,
          message: 'Username、repository、token is required',
        }
      }
      if (!isRepo) {
        await git.init({ fs, dir: this.outputDir })
        await git.setConfig({
          fs,
          dir: this.outputDir,
          path: 'user.name',
          value: setting.username,
        })
        await git.setConfig({
          fs,
          dir: this.outputDir,
          path: 'user.email',
          value: setting.email,
        })
      }

      await git.addRemote({
        fs, dir: this.outputDir, remote: 'origin', url: this.remoteUrl, force: true,
      })
      const info = await git.getRemoteInfo({
        http,
        url: this.remoteUrl,
      })
      console.log('info', info)
      result.message = info.capabilities
    } catch (e) {
      console.log('Test Remote Error: ', e)
      result.success = false
      // Provide more detailed error messages
      if ((e as any).message.includes('Authentication failed')) {
        result.message = ['认证失败：请检查用户名、token 或密码是否正确。']
      } else if ((e as any).message.includes('Repository not found')) {
        result.message = ['仓库未找到：请检查仓库名称和平台设置。']
      } else if ((e as any).message.includes('Network')) {
        result.message = ['网络错误：请检查网络连接或代理设置。']
      } else {
        result.message = [`连接远程仓库失败：${(e as any).message}`]
      }
    }
    return result
  }

  async publish() {
    // 检查是否使用中间API
    if (this.db.setting.useDeployApi) {
      return this.deployViaApi()
    }

    // 原有的直接部署逻辑
    await this.remoteDetect()
    this.db.themeConfig.domain = this.db.setting.domain
    let result = {
      success: true,
      message: '',
      localBranchs: {},
    }
    let isRepo = false
    try {
      await git.currentBranch({ fs, dir: this.outputDir })
      isRepo = true
    } catch (e) {
      console.log('Not a repo', (e as any).message)
    }
    if (isRepo) {
      result = await this.commonPush()
    } else {
      // result = await this.firstPush()
    }
    return result
  }

  async deployViaApi() {
    try {
      // 使用预设的中间API地址
      const apiUrl = 'https://api.jacknotes.dev'
      console.log('Deploying via API:', apiUrl)

      // 准备文件数据
      const files: { [key: string]: string } = await this.prepareFilesForApi()

      // 调用中间API
      const response: any = await this.http.requestApi({
        url: `${apiUrl}/deploy/${this.db.setting.platform}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: files,
          config: {
            ...this.db.setting,
            // 确保必要的字段不为undefined
            username: this.db.setting.username || '',
            repository: this.db.setting.repository || '',
            token: this.db.setting.token || '',
            branch: this.db.setting.branch || '',
            email: this.db.setting.email || '',
          },
        }),
      })

      const result = JSON.parse(response.data.toString())
      return {
        success: result.success,
        message: result.message,
        data: result,
      }
    } catch (error) {
      console.error('API deploy error:', error)
      return {
        success: false,
        message: `API部署失败: ${(error as any).message}`,
      }
    }
  }

  async prepareFilesForApi(): Promise<{ [key: string]: string }> {
    const files: { [key: string]: string } = {}
    const { outputDir } = this

    // 递归读取所有文件
    const readDirRecursive = (dir: string, relativePath = '') => {
      const items = fs.readdirSync(dir)

      for (const item of items) {
        const fullPath = path.join(dir, item)
        const relPath = path.join(relativePath, item).replace(/\\/g, '/')

        if (fs.statSync(fullPath).isDirectory()) {
          // 递归处理子目录
          readDirRecursive(fullPath, relPath)
        } else {
          // 读取文件内容并转换为base64
          const content = fs.readFileSync(fullPath)
          files[relPath] = content.toString('base64')
        }
      }
    }

    readDirRecursive(outputDir)
    return files
  }

  async commonPush() {
    console.log('common push')
    const { setting } = this.db
    const localBranchs = {}
    try {
      const statusSummary = await git.status({ fs, dir: this.outputDir, filepath: '.' })
      console.log('statusSummary', statusSummary)
      await git.addRemote({
        fs, dir: this.outputDir, remote: 'origin', url: this.remoteUrl, force: true,
      })

      if (statusSummary !== 'unmodified') {
        await git.add({ fs, dir: this.outputDir, filepath: '.' })
        await git.commit({
          fs,
          dir: this.outputDir,
          message: `Deploy from JackNotes: ${moment().format('YYYY-MM-DD HH:mm:ss')}`,
        })
      }

      await this.checkCurrentBranch()

      // Retry push up to 3 times
      const maxRetries = 3
      let pushRes
      // eslint-disable-next-line no-await-in-loop
      for (let pushAttempts = 0; pushAttempts < maxRetries; pushAttempts++) {
        try {
          // eslint-disable-next-line no-await-in-loop
          pushRes = await git.push({
            fs,
            http,
            dir: this.outputDir,
            remote: 'origin',
            ref: setting.branch,
            force: true,
          })
          break // Success, exit loop
        } catch (pushError) {
          console.log(`Push attempt ${pushAttempts + 1} failed: ${(pushError as any).message}`)
          if (pushAttempts === maxRetries - 1) {
            throw pushError
          }
          // Wait 1 second before retry
          // eslint-disable-next-line no-await-in-loop
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      console.log('pushRes', pushRes)
      return {
        success: true,
        data: pushRes,
        message: '',
        localBranchs,
      }
    } catch (e) {
      console.log(e)
      return {
        success: false,
        message: (e as any).message,
        data: localBranchs,
        localBranchs,
      }
    }
  }

  /**
   * Check whether the branch needs to be switched,
   * FIXME: if branch is change, then the fist push is not work. so need to push again.
   */
  async checkCurrentBranch() {
    const { setting } = this.db
    const currentBranch = await git.currentBranch({ fs, dir: this.outputDir, fullname: false })
    const localBranches = await git.listBranches({ fs, dir: this.outputDir })

    if (currentBranch !== setting.branch) {
      if (!localBranches.includes(setting.branch)) {
        await git.branch({ fs, dir: this.outputDir, ref: setting.branch })
      }

      await git.checkout({ fs, dir: this.outputDir, ref: setting.branch })
    }
  }
}
