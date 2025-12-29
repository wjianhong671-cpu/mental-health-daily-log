Page({
  data: {
    summaryText: ''
  },

  onLoad(options) {
    if (options.text) {
      const text = decodeURIComponent(options.text)
      this.setData({ summaryText: text })
    }
  },

  copySummary() {
    const text = this.data.summaryText
    if (!text) {
      wx.showToast({ title: '暂无内容', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制，可粘贴给医生', icon: 'success' })
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      }
    })
  },

  exportSummary() {
    const text = this.data.summaryText
    if (!text) {
      wx.showToast({ title: '暂无内容', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/export_summary/export_summary?text=' + encodeURIComponent(text)
    })
  }
})

