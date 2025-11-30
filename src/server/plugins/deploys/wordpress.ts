import axios from 'axios'
import Model from '../../model'

interface IWordPressPost {
  title: string
  content: string
  status: 'publish' | 'draft'
  categories?: number[]
  tags?: number[]
  featured_media?: number
  date?: string
  excerpt?: string
}

export default class WordPressDeploy extends Model {
  constructor(appInstance: any) {
    super(appInstance)
    console.log('instance wordpress deploy')
  }

  async remoteDetect() {
    const result = {
      success: true,
      message: '',
    }

    const { setting } = this.db

    if (!setting.wordpressUrl || !setting.wordpressUsername || (!setting.wordpressPassword && !setting.wordpressAppPassword)) {
      result.success = false
      result.message = 'WordPress URL、用户名和密码/应用密码是必需的'
      return result
    }

    // 规范化URL，确保包含协议
    let wordpressUrl = setting.wordpressUrl.trim()
    if (!wordpressUrl.startsWith('http://') && !wordpressUrl.startsWith('https://')) {
      wordpressUrl = `https://${wordpressUrl}`
    }

    try {
      // 测试WordPress REST API连接
      const auth = setting.wordpressAppPassword
        ? `Basic ${Buffer.from(`${setting.wordpressUsername}:${setting.wordpressAppPassword}`).toString('base64')}`
        : undefined

      const response = await axios.get(`${wordpressUrl}/wp-json/wp/v2/users/me`, {
        headers: auth ? { 'Authorization': auth } : undefined,
        auth: !auth && setting.wordpressUsername && setting.wordpressPassword ? {
          username: setting.wordpressUsername,
          password: setting.wordpressPassword
        } : undefined,
        maxRedirects: 0, // 禁用重定向
        timeout: 10000, // 10秒超时
        proxy: false, // 绕过代理，直接连接WordPress站点
      })

      if (response.status === 200) {
        result.message = 'WordPress连接成功'
      }
    } catch (e) {
      console.error('WordPress Test Remote Error: ', e)
      console.error('Error response:', (e as any).response)
      console.error('Error status:', (e as any).response ? (e as any).response.status : 'N/A')
      console.error('Error data:', (e as any).response ? (e as any).response.data : 'N/A')
      result.success = false

      // 提供更详细的错误信息
      if ((e as any).response) {
        const status = (e as any).response.status
        const statusText = (e as any).response.statusText
        const errorData = (e as any).response.data

        console.log('Processing error status:', status)

        switch (status) {
          case 400:
            // 检查是否是Cloudflare的HTTPS端口错误
            if (errorData && typeof errorData === 'string' && errorData.includes('plain HTTP request was sent to HTTPS port')) {
              result.message = 'WordPress连接失败: 网络代理问题。请尝试关闭VPN或代理，或联系网络管理员。'
            } else {
              result.message = 'WordPress连接失败: 请求参数错误。请检查用户名和密码是否正确。'
            }
            if (errorData && errorData.message) {
              result.message += ` 详细错误: ${errorData.message}`
            }
            break
          case 404:
            result.message = 'WordPress连接失败: WordPress REST API未找到。请确保：1) 这是一个WordPress站点 2) WordPress REST API已启用 3) 站点URL正确'
            break
          case 401:
            result.message = 'WordPress连接失败: 认证失败。请检查用户名和密码/应用密码。'
            break
          case 403:
            result.message = 'WordPress连接失败: 权限不足。请确保用户有发布文章的权限。'
            break
          case 404:
            result.message = 'WordPress连接失败: WordPress REST API未找到。请确保WordPress REST API已启用。'
            break
          case 500:
            result.message = 'WordPress连接失败: 服务器内部错误。请检查WordPress站点状态。'
            break
          default:
            result.message = `WordPress连接失败: ${status} ${statusText}`
        }
      } else if ((e as any).code === 'ENOTFOUND') {
        result.message = 'WordPress连接失败: 无法解析域名。请检查URL是否正确。'
      } else if ((e as any).code === 'ECONNREFUSED') {
        result.message = 'WordPress连接失败: 连接被拒绝。请检查URL和端口是否正确。'
      } else {
        result.message = `WordPress连接失败: ${(e as any).message}`
      }
    }

    return result
  }

  async publish() {
    const result = {
      success: true,
      message: '',
    }

    const { setting } = this.db

    if (!setting.wordpressUrl || !setting.wordpressUsername || (!setting.wordpressPassword && !setting.wordpressAppPassword)) {
      result.success = false
      result.message = 'WordPress URL、用户名和密码/应用密码是必需的'
      return result
    }

    // 规范化URL，确保包含协议
    let wordpressUrl = setting.wordpressUrl.trim()
    if (!wordpressUrl.startsWith('http://') && !wordpressUrl.startsWith('https://')) {
      wordpressUrl = `https://${wordpressUrl}`
    }

    try {
      const auth = setting.wordpressAppPassword
        ? `Basic ${Buffer.from(`${setting.wordpressUsername}:${setting.wordpressAppPassword}`).toString('base64')}`
        : undefined

      // 获取所有文章
      const posts = this.db.posts || []

      for (const post of posts) {
        if (post.data.published) {
          // 转换文章格式
          const wpPost: IWordPressPost = {
            title: post.data.title,
            content: this.convertMarkdownToHtml(post.content),
            status: 'publish',
            date: post.data.date,
            excerpt: (post.data as any).excerpt
          }

          // 处理分类和标签
          if ((post.data as any).categories) {
            wpPost.categories = await this.getOrCreateCategories((post.data as any).categories, auth, wordpressUrl, setting)
          }

          if (post.data.tags) {
            wpPost.tags = await this.getOrCreateTags(post.data.tags, auth, wordpressUrl, setting)
          }

          // 检查文章是否已存在
          const existingPost = await this.findExistingPost(post.data.title, auth, wordpressUrl, setting)

          if (existingPost) {
            // 更新现有文章
            await axios.post(`${wordpressUrl}/wp-json/wp/v2/posts/${existingPost.id}`, wpPost, {
              headers: auth ? { 'Authorization': auth } : undefined,
              auth: !auth && setting.wordpressUsername && setting.wordpressPassword ? {
                username: setting.wordpressUsername,
                password: setting.wordpressPassword
              } : undefined,
              maxRedirects: 0,
              timeout: 10000,
              proxy: false,
            })
            console.log(`Updated post: ${post.data.title}`)
          } else {
            // 创建新文章
            await axios.post(`${wordpressUrl}/wp-json/wp/v2/posts`, wpPost, {
              headers: auth ? { 'Authorization': auth } : undefined,
              auth: !auth && setting.wordpressUsername && setting.wordpressPassword ? {
                username: setting.wordpressUsername,
                password: setting.wordpressPassword
              } : undefined,
              maxRedirects: 0,
              timeout: 10000,
              proxy: false,
            })
            console.log(`Created post: ${post.data.title}`)
          }
        }
      }

      result.message = `成功同步 ${posts.filter((p: any) => p.data.published).length} 篇文章到WordPress`
    } catch (e) {
      console.error('WordPress Publish Error: ', (e as any).message)
      result.success = false

      // 提供更详细的错误信息
      if ((e as any).response) {
        const status = (e as any).response.status
        const statusText = (e as any).response.statusText

        switch (status) {
          case 400:
            result.message = 'WordPress发布失败: 请求参数错误。请检查文章内容格式。'
            break
          case 404:
            result.message = 'WordPress发布失败: WordPress REST API未找到。请确保WordPress REST API已启用且站点URL正确。'
            break
          case 401:
            result.message = 'WordPress发布失败: 认证失败。请检查用户名和密码/应用密码。'
            break
          case 403:
            result.message = 'WordPress发布失败: 权限不足。请确保用户有发布文章的权限。'
            break
          case 404:
            result.message = 'WordPress发布失败: WordPress REST API未找到。请确保WordPress REST API已启用。'
            break
          case 500:
            result.message = 'WordPress发布失败: 服务器内部错误。请检查WordPress站点状态。'
            break
          default:
            result.message = `WordPress发布失败: ${status} ${statusText}`
        }
      } else if ((e as any).code === 'ENOTFOUND') {
        result.message = 'WordPress发布失败: 无法解析域名。请检查URL是否正确。'
      } else if ((e as any).code === 'ECONNREFUSED') {
        result.message = 'WordPress发布失败: 连接被拒绝。请检查URL和端口是否正确。'
      } else {
        result.message = `WordPress发布失败: ${(e as any).message}`
      }
    }

    return result
  }

  private convertMarkdownToHtml(markdown: string): string {
    // 这里可以集成markdown转HTML的库
    // 暂时使用简单的替换，建议后续集成更完善的markdown处理器
    return markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/!\[([^\]]*)\]\(([^)]*)\)/gim, '<img alt="$1" src="$2" />')
      .replace(/\[([^\]]*)\]\(([^)]*)\)/gim, '<a href="$2">$1</a>')
      .replace(/\n\n/gim, '</p><p>')
      .replace(/\n/gim, '<br>')
  }

  private async getOrCreateCategories(categories: string[], auth: string | undefined, wordpressUrl: string, setting: any): Promise<number[]> {
    const categoryIds: number[] = []

    for (const categoryName of categories) {
      try {
        // 查找现有分类
        const searchResponse = await axios.get(`${wordpressUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(categoryName)}`, {
          headers: auth ? { 'Authorization': auth } : undefined,
          auth: !auth ? {
            username: setting.wordpressUsername,
            password: setting.wordpressPassword
          } : undefined,
          maxRedirects: 0,
          timeout: 10000,
          proxy: false,
        })

        if (searchResponse.data && searchResponse.data.length > 0) {
          categoryIds.push(searchResponse.data[0].id)
        } else {
          // 创建新分类
          const createResponse = await axios.post(`${wordpressUrl}/wp-json/wp/v2/categories`, {
            name: categoryName
          }, {
            headers: auth ? { 'Authorization': auth } : undefined,
            auth: !auth ? {
              username: setting.wordpressUsername,
              password: setting.wordpressPassword
            } : undefined,
            maxRedirects: 0,
            timeout: 10000,
            proxy: false,
          })
          categoryIds.push(createResponse.data.id)
        }
      } catch (e) {
        console.warn(`Failed to process category ${categoryName}:`, (e as any).message)
      }
    }

    return categoryIds
  }

  private async getOrCreateTags(tags: string[], auth: string | undefined, wordpressUrl: string, setting: any): Promise<number[]> {
    const tagIds: number[] = []

    for (const tagName of tags) {
      try {
        // 查找现有标签
        const searchResponse = await axios.get(`${wordpressUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
          headers: auth ? { 'Authorization': auth } : undefined,
          auth: !auth ? {
            username: setting.wordpressUsername,
            password: setting.wordpressPassword
          } : undefined,
          maxRedirects: 0,
          timeout: 10000,
          proxy: false,
        })

        if (searchResponse.data && searchResponse.data.length > 0) {
          tagIds.push(searchResponse.data[0].id)
        } else {
          // 创建新标签
          const createResponse = await axios.post(`${wordpressUrl}/wp-json/wp/v2/tags`, {
            name: tagName
          }, {
            headers: auth ? { 'Authorization': auth } : undefined,
            auth: !auth ? {
              username: setting.wordpressUsername,
              password: setting.wordpressPassword
            } : undefined,
            maxRedirects: 0,
            timeout: 10000,
            proxy: false,
          })
          tagIds.push(createResponse.data.id)
        }
      } catch (e) {
        console.warn(`Failed to process tag ${tagName}:`, (e as any).message)
      }
    }

    return tagIds
  }

  private async findExistingPost(title: string, auth: string | undefined, wordpressUrl: string, setting: any): Promise<any> {
    try {
      const response = await axios.get(`${wordpressUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(title)}&status=publish,draft`, {
        headers: auth ? { 'Authorization': auth } : undefined,
        auth: !auth ? {
          username: setting.wordpressUsername,
          password: setting.wordpressPassword
        } : undefined,
        maxRedirects: 0,
        timeout: 10000,
        proxy: false,
      })

      if (response.data && response.data.length > 0) {
        // 找到标题匹配的文章
        return response.data.find((post: any) => post.title.rendered === title)
      }
    } catch (e) {
      console.warn('Failed to search existing posts:', (e as any).message)
    }
    return null
  }
}