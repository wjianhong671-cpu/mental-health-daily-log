Page({
  data: {
    summaryText: '',
    imgPath: '',
    canvasWidth: 0,
    canvasHeight: 0
  },

  onLoad() {
    const ec = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (ec) {
      ec.on('summaryText', (payload) => {
        const text = (payload && payload.summaryText) ? String(payload.summaryText) : ''
        this.setData({ summaryText: text })
      })
    }
  },

  // —— 逐字换行（中文必须逐字测宽）——
  wrapLine(ctx, text, maxWidth) {
    const lines = []
    let cur = ''

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const test = cur + ch
      const w = ctx.measureText(test).width
      if (w > maxWidth && cur) {
        lines.push(cur)
        cur = ch
      } else {
        cur = test
      }
    }
    if (cur) lines.push(cur)
    return lines
  },

  buildLines(ctx, text, maxWidth) {
    const paragraphs = String(text || '').split('\n')
    const out = []
    paragraphs.forEach(p => {
      const s = String(p || '')
      if (!s.trim()) {
        out.push('')
      } else {
        out.push(...this.wrapLine(ctx, s, maxWidth))
      }
    })
    return out
  },

  onGenerate() {
    const summaryText = (this.data.summaryText || '').trim()
    if (!summaryText) {
      wx.showToast({ title: '没有可导出的内容', icon: 'none' })
      return
    }

    wx.showLoading({ title: '生成中...' })

    try {
      const sys = wx.getSystemInfoSync()

      // ✅ 关键：全部使用 px，不要 rpx，不要 scale
      const canvasWidth = sys.windowWidth

      const paddingLeft = 18
      const paddingRight = 18
      const paddingTop = 18
      const paddingBottom = 18
      const maxWidth = canvasWidth - paddingLeft - paddingRight

      // 字体与行距（医生材料）
      const titleFont = 20
      const titleLH = 32
      const subFont = 13
      const subLH = 20
      const bodyFont = 15
      const bodyLH = 26

      const header1 = '复诊摘要（近7天）'
      const header2 = '基于患者自填记录，仅供门诊沟通参考'

      const now = new Date()
      const timeText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const footerText = `生成时间：${timeText}\n仅供门诊沟通参考`

      const ctx = wx.createCanvasContext('exportCanvas', this)

      // —— 先用对应字体测宽并 wrap（非常重要：测宽前要 setFontSize）——
      ctx.setFontSize(titleFont)
      const titleLines = this.buildLines(ctx, header1, maxWidth)

      ctx.setFontSize(subFont)
      const subLines = this.buildLines(ctx, header2, maxWidth)

      ctx.setFontSize(bodyFont)
      const bodyLines = this.buildLines(ctx, summaryText, maxWidth)

      ctx.setFontSize(subFont)
      const footerLines = this.buildLines(ctx, footerText, maxWidth)

      // ✅ 高度按 wrap 后行数计算
      const canvasHeight =
        paddingTop +
        titleLines.length * titleLH +
        8 +
        subLines.length * subLH +
        12 +
        bodyLines.length * bodyLH +
        12 +
        footerLines.length * subLH +
        paddingBottom

      this.setData({ canvasWidth, canvasHeight })

      // ✅ 每次生成先清空（防止叠字）
      ctx.clearRect(0, 0, canvasWidth, canvasHeight)

      // 白底
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      let y = paddingTop

      // 标题
      ctx.setFillStyle('#000000')
      ctx.setTextBaseline('top')
      ctx.setFontSize(titleFont)
      titleLines.forEach(line => {
        ctx.fillText(line, paddingLeft, y)
        y += titleLH
      })

      // 副标题
      y += 6
      ctx.setFillStyle('rgba(0,0,0,0.55)')
      ctx.setFontSize(subFont)
      subLines.forEach(line => {
        ctx.fillText(line, paddingLeft, y)
        y += subLH
      })

      // 分隔线
      y += 8
      ctx.setFillStyle('rgba(0,0,0,0.18)')
      ctx.fillRect(paddingLeft, y, maxWidth, 1)
      y += 12

      // 正文
      ctx.setFillStyle('#000000')
      ctx.setFontSize(bodyFont)
      bodyLines.forEach(line => {
        ctx.fillText(line, paddingLeft, y)
        y += bodyLH
      })

      // 页脚
      y += 8
      ctx.setFillStyle('rgba(0,0,0,0.55)')
      ctx.setFontSize(subFont)
      footerLines.forEach(line => {
        ctx.fillText(line, paddingLeft, y)
        y += subLH
      })

      // ✅ draw 完再导出
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'exportCanvas',
          fileType: 'png',
          quality: 1,
          success: (res) => {
            wx.hideLoading()
            this.setData({ imgPath: res.tempFilePath })
            wx.showToast({ title: '已生成预览图', icon: 'success' })
          },
          fail: (err) => {
            wx.hideLoading()
            console.error('canvasToTempFilePath fail:', err)
            wx.showToast({ title: '生成失败', icon: 'none' })
          }
        }, this)
      })

    } catch (e) {
      wx.hideLoading()
      console.error(e)
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  onSave() {
    const path = this.data.imgPath
    if (!path) return

    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        console.error('saveImage fail:', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    })
  }
})