import fs from 'fs'
import path from 'path'
import axios from 'axios'
import normalizePath from 'normalize-path'
import crypto from 'crypto'
// @ts-ignore
import { promisify } from 'util'
import Model from '../../model'
import { IApplication } from '../../interfaces/application'

const asyncReadFile = promisify(fs.readFile)

export default class VercelDeploy extends Model {
  private apiUrl: string
  private accessToken: string
  private projectId: string
  private projectName: string
  private inputDir: string

  constructor(appInstance: IApplication) {
    super(appInstance)
    this.apiUrl = 'https://api.vercel.com/'
    this.accessToken = appInstance.db.setting.vercelToken
    this.projectId = (appInstance.db.setting.vercelProjectId || '').toString().trim()
    this.projectName = (appInstance.db.setting.vercelProjectName || '').toString().trim()
    this.inputDir = appInstance.buildDir
  }

  async request(method: 'GET' | 'PUT' | 'POST', endpoint: string, data?: any) {
    const endpointUrl = this.apiUrl + endpoint

    return axios(
      endpointUrl,
      {
        method,
        headers: {
          'User-Agent': 'JackNotes',
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        data,
        proxy: false, // 强制禁用代理
        timeout: 30000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false,
          keepAlive: false,
        }),
      },
    )
  }

  async remoteDetect() {
    const result = {
      success: true,
      message: '检测成功',
    }

    try {
      // 检查项目是否存在
      const response = await this.request('GET', `v9/projects/${this.projectId}`)
      
      if (response.data) {
        result.message = `项目 "${response.data.name}" 检测成功`
      }
    } catch (error) {
      result.success = false
      const err = error as any
      if (err.response) {
        if (err.response.status === 404) {
          result.message = '项目未找到。请检查项目ID是否正确'
        } else if (err.response.status === 401) {
          result.message = 'API Token无效或权限不足'
        } else {
          result.message = `检测失败: ${err.response.status}`
        }
      } else {
        result.message = err.message || '检测失败'
      }
    }

    return result
  }

  async prepareLocalFilesList() {
    const files: { [key: string]: Buffer } = {}
    const traverse = async (dir: string, relativePath: string = '') => {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          await traverse(fullPath, path.join(relativePath, item))
        } else {
          const fileContent = fs.readFileSync(fullPath)
          const normalizedPath = normalizePath(path.join(relativePath, item))
          files[normalizedPath] = fileContent
        }
      }
    }
    await traverse(this.inputDir)
    return files
  }

  async publish() {
    const result = {
      success: true,
      message: '同步成功',
      data: null,
    }

    try {
      const localFilesList = await this.prepareLocalFilesList()

      // 准备文件数据 - 所有文件都转换为base64
      const files: { [key: string]: string } = {}
      for (const [filePath, fileBuffer] of Object.entries(localFilesList)) {
        files[filePath] = fileBuffer.toString('base64')
      }

      // 部署到现有项目
      const deployData = await this.request('POST', `v13/deployments?projectId=${encodeURIComponent(this.projectId)}&skipAutoDetectionConfirmation=1`, {
        name: this.projectName || 'jacknotes-site',
        files: Object.keys(files).map(filePath => ({
          file: filePath,
          data: files[filePath],
          encoding: 'base64'
        })),
        projectSettings: {
          framework: null,
          buildCommand: null,
          devCommand: null,
          installCommand: null,
          outputDirectory: null
        },
        target: 'production'
      })

      if (deployData.data) {
        result.data = deployData.data
        console.log('Vercel deployment created:', deployData.data.id || deployData.data.url)
        
        // 获取部署详情
        if (deployData.data.id) {
          try {
            const deploymentDetails = await this.request('GET', `v13/deployments/${deployData.data.id}`)
            console.log('Deployment details:', deploymentDetails.data)
            if (deploymentDetails.data && deploymentDetails.data.url) {
              result.message = `同步成功！部署URL: https://${deploymentDetails.data.url}`
            }
          } catch (detailError) {
            console.log('Failed to get deployment details:', (detailError as any).message)
          }
        }
      } else {
        result.success = false
        result.message = '部署失败'
      }
    } catch (e) {
      console.error('Vercel publish error:', e)
      const error = e as any
      result.success = false
      if (error.response) {
        console.error('Response status:', error.response.status)
        console.error('Response data:', error.response.data)
        if (error.response.status === 404) {
          result.message = '项目未找到。请检查项目ID是否正确，或先创建一个Vercel项目。'
        } else if (error.response.status === 401) {
          result.message = 'API Token无效或权限不足。请检查API Token是否正确配置了Vercel权限'
        } else if (error.response.status === 403) {
          result.message = 'API Token没有部署权限'
        } else {
          result.message = error.response.data && error.response.data.error ? error.response.data.error.message : `HTTP ${error.response.status}: ${error.response.statusText}`
        }
      } else {
        result.message = (error && error.message) ? error.message : String(e)
      }
    }

    return result
  }
}