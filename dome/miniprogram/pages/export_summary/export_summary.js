// miniprogram/pages/export_summary/export_summary.js
const doctorHelper = require('../../utils/doctor-helper.js')

Page({
  data: {
    loading: false,
    exporting: false,
    summaryText: '',
    canvasWidth: 750,
    canvasHeight: 1200
  },

  onLoad() {
    this.loadSummary()
  },

  // ===== 加载摘要数据 =====
  async loadSummary() {
    try {
      this.setData({ loading: true })

      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      if (!openid) {
        console.warn('loadSummary: openid not ready')
        this.setData({ 
          summaryText: '登录态未就绪，请稍后重试',
          loading: false 
        })
        return
      }

      const db = wx.cloud.database()
      const rangeDays = 7
      
      // 计算起始时间戳（近 7 天）
      const startTs = Date.now() - (rangeDays - 1) * 86400000

      // 查询近 7 天记录
      const res = await db.collection('daily_records')
        .where({
          _openid: openid,
          createdAt: db.command.gte(startTs)
        })
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()

      const rawRecords = res.data || []
      const validRecords = doctorHelper.getValidRecords(rawRecords)

      if (validRecords.length === 0) {
        this.setData({
          summaryText: '近 7 天暂无记录，请先添加记录后再导出',
          loading: false
        })
        return
      }

      // 使用 doctor-helper 生成摘要
      const summary = doctorHelper.buildDoctorSummary(validRecords, {
        rangeDays
      })
      
      const formattedText = doctorHelper.formatDoctorText(summary)

      this.setData({
        summaryText: formattedText,
        loading: false
      })
    } catch (err) {
      console.error('loadSummary error:', err)
      this.setData({
        summaryText: '加载失败，请稍后重试',
        loading: false
      })
    }
  },

  // ===== 导出长图 =====
  exportImage() {
    // 防止重复点击
    if (this.data.exporting) {
      return
    }

    try {
      this.setData({ exporting: true })
      wx.showLoading({ title: '生成中...' })

      const ctx = wx.createCanvasContext('exportCanvas', this)
      const { canvasWidth, canvasHeight, summaryText } = this.data

      // 设置背景色
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // 标题
      const title = '复诊摘要'
      ctx.setFontSize(48)
      ctx.setFillStyle('#2e7d32')
      ctx.setTextAlign('center')
      const titleWidth = ctx.measureText(title).width
      ctx.fillText(title, canvasWidth / 2, 60)

      // 日期范围
      const dateRange = '统计范围：近 7 天'
      ctx.setFontSize(28)
      ctx.setFillStyle('#666666')
      const dateWidth = ctx.measureText(dateRange).width
      ctx.fillText(dateRange, canvasWidth / 2, 140)

      // 摘要内容
      ctx.setFontSize(32)
      ctx.setFillStyle('#000000')
      ctx.setTextAlign('left')
      const lines = summaryText.split('\n')
      const lineHeight = 50
      const startY = 220
      const padding = 60
      const maxWidth = canvasWidth - padding * 2

      lines.forEach((line, index) => {
        if (!line.trim()) return
        
        let y = startY + index * lineHeight
        if (y + lineHeight > canvasHeight - 100) {
          return
        }

        // 简单文本换行处理
        const textWidth = ctx.measureText(line).width
        if (textWidth > maxWidth) {
          // 简单处理：截断
          const truncated = line.substring(0, Math.floor(line.length * maxWidth / textWidth))
          ctx.fillText(truncated, padding, y)
        } else {
          ctx.fillText(line, padding, y)
        }
      })

      // 底部提示
      const footer = '以上为个人记录汇总，仅供参考'
      ctx.setFontSize(24)
      ctx.setFillStyle('#999999')
      ctx.setTextAlign('center')
      const footerWidth = ctx.measureText(footer).width
      ctx.fillText(footer, canvasWidth / 2, canvasHeight - 80)

      // 绘制到画布（使用 try-catch 包裹回调）
      try {
        ctx.draw(false, () => {
          try {
            setTimeout(() => {
              try {
                // 导出图片
                wx.canvasToTempFilePath({
                  canvasId: 'exportCanvas',
                  success: (res) => {
                    try {
                      wx.hideLoading()
                      
                      // 保存图片到相册
                      wx.saveImageToPhotosAlbum({
                        filePath: res.tempFilePath,
                        success: () => {
                          this.setData({ exporting: false })
                          wx.showToast({ 
                            title: '已保存到相册', 
                            icon: 'success' 
                          })
                        },
                        fail: (err) => {
                          this.setData({ exporting: false })
                          console.error('saveImageToPhotosAlbum error:', err)
                          wx.showModal({
                            title: '保存失败',
                            content: '保存失败，请尝试直接截图保存',
                            showCancel: false
                          })
                        }
                      })
                    } catch (err) {
                      this._handleExportError(err, '保存图片时')
                    }
                  },
                  fail: (err) => {
                    this._handleExportError(err, '生成图片时')
                  }
                }, this)
              } catch (err) {
                this._handleExportError(err, '导出图片时')
              }
            }, 500)
          } catch (err) {
            this._handleExportError(err, '延迟执行时')
          }
        })
      } catch (err) {
        this._handleExportError(err, '绘制画布时')
      }
    } catch (err) {
      this._handleExportError(err, '初始化导出时')
    }
  },

  // ===== 统一错误处理 =====
  _handleExportError(err, context) {
    wx.hideLoading()
    this.setData({ exporting: false })
    console.error(`exportImage error (${context}):`, err)
    wx.showModal({
      title: '生成失败',
      content: '生成失败，请尝试直接截图保存',
      showCancel: false
    })
  }
})

