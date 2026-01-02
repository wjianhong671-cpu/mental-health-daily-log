// miniprogram/pages/timeline/timeline.js
Page({
  data: {
    filter: 'all',   // all | daily | lab
    items: []
  },

  onLoad() {
    this.loadTimeline()
  },

  onShow() {
    // 每次回到时间轴刷新，确保最新
    this.loadTimeline()
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ filter }, () => {
      this.loadTimeline()
    })
  },

  // 返回首页：优先 navigateTo（你目前不是 tabbar）
  goIndex() {
    wx.navigateTo({ url: '/pages/index/index' })
  },
  goReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },
  // 去新增检查 / 复查页面
  goAddLab() {
    wx.navigateTo({ url: '/pages/lab/lab' })
  },

  // =============== 核心：读取 daily_records + lab_results 合并成时间轴 ===============
  async loadTimeline() {
    try {
      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      // openid 为空时直接返回
      if (!openid) {
        console.warn('loadTimeline: openid not ready, skip')
        this.setData({ items: [] })
        return
      }
      
      wx.showLoading({ title: '加载中...' })
      const db = wx.cloud.database()

      const filter = this.data.filter
      const needDaily = (filter === 'all' || filter === 'daily')
      const needLab = (filter === 'all' || filter === 'lab')

      const dailyPromise = needDaily
        ? db.collection('daily_records')
            .where({
              _openid: openid
            })
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get()
        : Promise.resolve({ data: [] })

    // 你现在可能还没建 lab_results 集合，所以这里做容错：查不到就当空数组
    const labPromise = needLab
      ? db.collection('lab_results')
          .where({
            _openid: openid
          })
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get()
          .catch(err => {
            console.warn('lab_results not ready:', err)
            return { data: [] }
          })
      : Promise.resolve({ data: [] })

    Promise.all([dailyPromise, labPromise])
      .then(([dailyRes, labRes]) => {
        const daily = (dailyRes.data || []).map(d => this._mapDaily(d))
        const lab = (labRes.data || []).map(l => this._mapLab(l))

        const merged = daily.concat(lab)

        // 按时间倒序：优先使用 createdAt/updatedAt，否则用 date 字符串兜底
        merged.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))

        this.setData({ items: merged })
        wx.hideLoading()
      })
      .catch(err => {
        wx.hideLoading()
        console.error('loadTimeline error:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
    } catch (err) {
      wx.hideLoading()
      console.error('loadTimeline error:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ===================== mapping helpers：把原始数据翻译成人话 =====================

  _mapDaily(d) {
    const moodMap = { 1: '很低落', 3: '一般', 5: '很好' }
    const sleepMap = { 1: '很差', 2: '一般', 3: '还可以', 4: '不错', 5: '很好' }
    const severityMap = { 0: '不明显', 1: '轻度', 2: '中度', 3: '重度' }
  
    const moodText =
      moodMap[d.mood] ||
      (d.mood === 0 ? '0' : (d.mood ? String(d.mood) : '未填写'))
  
    const sleepText =
      sleepMap[d.sleepQuality] ||
      (d.sleepQuality ? String(d.sleepQuality) : '未填写')
  
    // ✅ 睡眠时长（小时）
    const sleepDurationHour = d.sleepDurationHour
    const sleepDurationText =
      (sleepDurationHour === null || sleepDurationHour === undefined)
        ? '未填写'
        : (sleepDurationHour + ' 小时')
  
    const sleepIssuesText = this._sleepIssuesToText(d.sleepIssues || [])
  
    const sideEffectsText = this._sideEffectsToText(d.sideEffects || [])
    const sideEffectSeverityText =
      (d.sideEffectSeverity === null || d.sideEffectSeverity === undefined)
        ? '未选择'
        : (severityMap[d.sideEffectSeverity] || String(d.sideEffectSeverity))
  
    const takeMedText = d.takeMedText || '未填写'
    const planText = this._planSnapshotToText(d.planSnapshot)
  
    const sortTime = this._getSortTime(d.createdAt || d.updatedAt, d.date)
  
    return {
      key: `daily_${d._id}`,
      type: 'daily',
  
      date: d.date || '',
      timeText: d.timeText || d.updatedTimeText || '',
      sortTime,
  
      // 核心展示字段
      moodText,
      sleepText,
      sleepDurationText,   // ⭐ 新增
      sleepIssuesText,
  
      planText,
      takeMedText,
  
      sideEffectsText,
      sideEffectSeverityText,
      sideEffectNote: d.sideEffectNote || '',
  
      raw: d
    }
  },

  _mapLab(l) {
    const sortTime = this._getSortTime(l.createdAt || l.updatedAt, l.date)
    return {
      key: `lab_${l._id}`,
      type: 'lab',

      date: l.date || '',
      timeText: l.timeText || l.updatedTimeText || '',
      sortTime,

      labType: l.type || l.labType || '',
      hospital: l.hospital || '',
      note: l.note || '',
      images: l.images || [],

      raw: l
    }
  },

  _getSortTime(cloudDate, dateStr) {
    // cloudDate 可能是 Date / 云对象；dateStr 是 'YYYY-MM-DD'
    try {
      if (cloudDate instanceof Date) return cloudDate.getTime()

      // 有些环境会把 Date 序列化成对象，这里尽量兜底
      if (cloudDate && typeof cloudDate === 'object') {
        // 常见：{ $date: "..." }
        if (cloudDate.$date) return new Date(cloudDate.$date).getTime()
        // 也可能：{ seconds: ..., nanoseconds: ... }（不同实现）
        if (cloudDate.seconds) return cloudDate.seconds * 1000
      }

      if (typeof dateStr === 'string' && dateStr.length >= 10) {
        return new Date(dateStr + 'T00:00:00').getTime()
      }
    } catch (e) {}
    return 0
  },

  _timesToText(times) {
    const map = { morning: '早', noon: '中', night: '晚' }
    const arr = Array.isArray(times) ? times : []
    return arr.length ? arr.map(t => map[t] || t).join('、') : '未填写'
  },

  _sleepIssuesToText(arr) {
    const map = {
      insomnia: '入睡困难',
      early_wake: '早醒',
      dreams: '多梦/噩梦',
      daytime_sleepy: '白天嗜睡',
      none: '无'
    }
    const a = Array.isArray(arr) ? arr : []
    if (!a.length) return '未填写'
    if (a.includes('none')) return '无'
    return a.map(x => map[x] || x).join('、')
  },

  _sideEffectsToText(arr) {
    const map = {
      sleepy: '嗜睡/发困',
      dizzy: '头晕',
      nausea: '恶心/胃不适',
      anxiety: '焦虑/坐立不安',
      tremor: '手抖',
      palpitation: '心悸/心跳快',
      rash: '皮疹/瘙痒',
      appetite: '食欲增加',
      constipation: '便秘',
      other: '其他',
      none: '没有'
    }
    const a = Array.isArray(arr) ? arr : []
    if (!a.length) return '未填写'
    if (a.includes('none')) return '没有'
    return a.map(x => map[x] || x).join('、')
  },

  _planSnapshotToText(planSnapshot) {
    // 兼容你现在 daily_records 里的 planSnapshot 可能为 null
    if (!planSnapshot) return '未设置方案'

    // 你之前的结构里出现过 planSnapshot.meds（数组）
    if (Array.isArray(planSnapshot.meds) && planSnapshot.meds.length > 0) {
      // 把每个药变成：药名 剂量mg/天（早、中、晚）
      const parts = planSnapshot.meds.map(m => {
        const name = m.medName || m.name || '药物'
        const dose = (m.doseMg || m.dose || '') ? `${m.doseMg || m.dose}mg/天` : ''
        const timesText = this._timesToText(m.times || [])
        return `${name}${dose ? ' ' + dose : ''}${timesText ? '（' + timesText + '）' : ''}`.trim()
      })
      return parts.join('；')
    }

    // 兼容 planSnapshot 直接存单药字段
    if (planSnapshot.medName || planSnapshot.doseMg || planSnapshot.timesText) {
      const name = planSnapshot.medName || '药物'
      const dose = planSnapshot.doseMg ? `${planSnapshot.doseMg}mg/天` : ''
      const times = planSnapshot.timesText ? `（${planSnapshot.timesText}）` : ''
      return `${name} ${dose}${times}`.trim()
    }

    return '未设置方案'
  }
})