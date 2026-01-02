// miniprogram/pages/review/review.js
Page({
  data: {
    days: 14,

    // ====== 阈值（后面你要按医学标准调整，就改这里）======
    // 睡眠不足：< 6 小时
    // 正常：6–9 小时
    // 偏多：> 9 小时
    sleepShortLt: 6,
    sleepNormalLe: 9,

    // ====== 统计结果 ======
    countWindow: 0,         // 近 N 天窗口内记录条数（含未填写时长的记录）
    countTotal: 0,          // 近 N 天有效记录数（有 sleepDurationHour 数字的）
    unknownCount: 0,        // 未填写/非数字（用于口径解释）

    lowCount: 0,            // < 6h
    normalCount: 0,         // 6-9h
    highCount: 0,           // > 9h

    avgHours: 0,            // 平均睡眠时长（小时）
    summaryText: '加载中...',

    // 原始记录（调试用：只放有效记录）
    records: []
  },

  onLoad() {
    this.loadSleepSummary()
  },

  onShow() {
    this.loadSleepSummary()
  },

  // ===== 主入口：加载并统计 =====
  async loadSleepSummary() {
    try {
      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      // openid 为空时直接返回
      if (!openid) {
        console.warn('loadSleepSummary: openid not ready, skip')
        this.setData({ summaryText: '加载失败，请稍后重试。' })
        return
      }
      
      wx.showLoading({ title: '加载中...' })

      const db = wx.cloud.database()
      const days = this.data.days
      
      // 计算起始时间戳（N 天前），使用 createdAt 作为主过滤条件
      const startTs = Date.now() - (days - 1) * 24 * 60 * 60 * 1000

      // 取近N天记录（不强制必须有 sleepDurationHour，因为我们要算 unknownCount）
      db.collection('daily_records')
        .where({
          createdAt: db.command.gte(startTs),
          _openid: openid
        })
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
      .then(res => {
        const list = res.data || []
        const countWindow = list.length

        // 只保留 sleepDurationHour 是数字的记录（用于计算平均值和分档）
        const valid = list.filter(r => typeof r.sleepDurationHour === 'number')
        const unknownCount = countWindow - valid.length

        const stats = this._calcSleepStats(valid)
        const summaryText = this._makeSummaryText({
          ...stats,
          countWindow,
          unknownCount
        })

        this.setData({
          records: valid,

          countWindow,
          unknownCount,

          countTotal: stats.countTotal,
          lowCount: stats.lowCount,
          normalCount: stats.normalCount,
          highCount: stats.highCount,
          avgHours: stats.avgHours,

          summaryText
        })

        wx.hideLoading()
      })
      .catch(err => {
        wx.hideLoading()
        console.error('loadSleepSummary error:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ summaryText: '加载失败，请稍后重试。' })
      })
    } catch (err) {
      wx.hideLoading()
      console.error('loadSleepSummary error:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ summaryText: '加载失败，请稍后重试。' })
    }
  },

  // ===== 统计逻辑 =====
  _calcSleepStats(records) {
    let low = 0
    let normal = 0
    let high = 0
    let sum = 0

    const shortLt = Number(this.data.sleepShortLt) // 默认 6
    const normalLe = Number(this.data.sleepNormalLe) // 默认 9

    ;(records || []).forEach(r => {
      const h = Number(r.sleepDurationHour)
      if (!h && h !== 0) return

      sum += h

      if (h < shortLt) low += 1
      else if (h <= normalLe) normal += 1
      else high += 1
    })

    const countTotal = records.length
    const avgHours = countTotal ? Number((sum / countTotal).toFixed(1)) : 0

    return {
      countTotal,
      lowCount: low,
      normalCount: normal,
      highCount: high,
      avgHours
    }
  },

  // ===== 文本总结（克制、过审友好）=====
  _makeSummaryText(stats) {
    const {
      countWindow,
      countTotal,
      unknownCount,
      lowCount,
      normalCount,
      highCount,
      avgHours
    } = stats

    // 口径说明（很重要：避免误解）
    const baseTip =
      unknownCount > 0
        ? `（近 ${this.data.days} 天共有 ${countWindow} 条记录，其中 ${unknownCount} 天未填写睡眠时长）`
        : `（近 ${this.data.days} 天共有 ${countWindow} 条记录）`

    if (!countTotal) {
      return `近 ${this.data.days} 天暂无可用的“睡眠时长”记录。${baseTip} 你可以从首页先补充几天，复诊会更省力。`
    }

    // 找主导类别（用于一句话概述）
    let main = '正常'
    let max = normalCount
    if (lowCount > max) { max = lowCount; main = '偏少' }
    if (highCount > max) { max = highCount; main = '偏多' }

    let hint = `近 ${this.data.days} 天睡眠时长以「${main}」为主，平均约 ${avgHours} 小时/晚。${baseTip}`

    // 提示语：不做诊断，只提示“复诊可沟通”
    if (lowCount >= 5) {
      hint += ' 其中“睡眠偏少”的天数相对较多，复诊时可重点与医生沟通。'
    }
    if (highCount >= 5) {
      hint += ' “睡眠偏多”的天数相对较多，复诊时也可一并说明。'
    }

    return hint
  },

  // ===== 工具：获取 N 天前日期（YYYY-MM-DD）=====
  _getDateNDaysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  },

  // ===== 导航方法 =====
  goDoctor() {
    wx.navigateTo({ url: '/pages/doctor/doctor' })
  },

  goExport() {
    wx.navigateTo({ url: '/pages/export_summary/export_summary' })
  }
})