Page({
  data: {
    // -------- 基础 --------
    mood: null,
    records: [],
    todayDate: '',
    hasTodayRecord: false,

    // -------- D1 风险（医生端）--------
    riskSuicidal: 0,        // 0 无 / 1 闪念 / 2 明确
    riskImpulse: 0,         // 0 无 / 1 增加
    sleepReduced: false,    // 睡眠明显减少或 ≤4h
    energyIncreased: false, // 精力更高/停不下来

    // -------- 睡眠 --------
    sleepDurationHour: null, // 昨晚睡眠时长（小时）
    sleepQuality: null,
    sleepIssues: [],
    sleepIssuesMap: {
      insomnia: false,
      early_wake: false,
      dreams: false,
      daytime_sleepy: false,
      none: false
    },

    // -------- 用药方案（来自 med_plan）--------
    hasPlan: false,
    plan: null,
    requiredTimes: [],
    requiredTimesMap: { morning: false, noon: false, night: false },
    requiredTimesText: '未设置方案',

    // -------- 今天用药情况 --------
    takeMedMap: { morning: false, noon: false, night: false },

    // -------- 不适/副作用 --------
    sideEffects: [],
    sideEffectsMap: {
      sleepy: false,
      dizzy: false,
      nausea: false,
      anxiety: false,
      tremor: false,
      palpitation: false,
      rash: false,
      appetite: false,
      constipation: false,
      other: false,
      none: false
    },
    sideEffectSeverity: null,
    sideEffectNote: ''
  },

  onLoad() {
    const todayDate = new Date().toISOString().slice(0, 10)
    this.setData({ todayDate })

    if (typeof this.loadPlan === 'function') {
      this.loadPlan().finally(() => {
        this.loadRecords()
      })
    } else {
      this.loadRecords()
    }
  },

  onShow() {
    if (typeof this.loadPlan === 'function') {
      this.loadPlan().catch(() => {})
    }
  },

  goPlan() {
    wx.navigateTo({ url: '/pages/plan/plan' })
  },

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' })
  },

  goDoctor() {
    wx.navigateTo({ url: '/pages/doctor/doctor' })
  },

  goExport() {
    wx.navigateTo({ url: '/pages/export_summary/export_summary' })
  },


  // -------- 加载用药方案 --------
  async loadPlan() {
    try {
      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      // openid 为空时直接返回，不抛错
      if (!openid) {
        console.warn('loadPlan: openid not ready, skip')
        this.setData({
          hasPlan: false,
          plan: null,
          requiredTimes: [],
          requiredTimesMap: { morning: false, noon: false, night: false },
          requiredTimesText: '未设置方案'
        })
        return
      }
      
      const db = wx.cloud.database()
      let plan = null
      
      // 先尝试查询 is_active: true 的方案
      try {
        const activeQuery = db.collection('med_plan')
          .where({
            _openid: openid,
            is_active: true
          })
          .orderBy('updatedAt', 'desc')
          .limit(1)
        
        const activeRes = await activeQuery.get()
        plan = (activeRes.data || [])[0]
      } catch (err) {
        // 如果查询 is_active 失败（可能是字段不存在），继续查询所有记录
        console.warn('loadPlan: query is_active failed, fallback to all records')
      }
      
      // 如果没有 is_active 字段或没有激活方案，则取最近一条
      if (!plan) {
        const allQuery = db.collection('med_plan')
          .where({
            _openid: openid
          })
          .orderBy('updatedAt', 'desc')
          .limit(1)
        
        const allRes = await allQuery.get()
        plan = (allRes.data || [])[0]
      }
      
      if (plan) {
        // 处理 requiredTimes：从 plan.meds 中提取所有用药时间
        const allTimes = new Set()
        if (Array.isArray(plan.meds)) {
          plan.meds.forEach(med => {
            if (Array.isArray(med.times)) {
              med.times.forEach(time => allTimes.add(time))
            }
          })
        }
        const requiredTimes = Array.from(allTimes)
        const requiredTimesMap = {
          morning: requiredTimes.includes('morning'),
          noon: requiredTimes.includes('noon'),
          night: requiredTimes.includes('night')
        }
        const requiredTimesText = this._timesToText(requiredTimes)
        
        this.setData({
          hasPlan: true,
          plan,
          requiredTimes,
          requiredTimesMap,
          requiredTimesText
        })
      } else {
        this.setData({
          hasPlan: false,
          plan: null,
          requiredTimes: [],
          requiredTimesMap: { morning: false, noon: false, night: false },
          requiredTimesText: '未设置方案'
        })
      }
    } catch (err) {
      console.warn('loadPlan error:', err)
      this.setData({
        hasPlan: false,
        plan: null,
        requiredTimes: [],
        requiredTimesMap: { morning: false, noon: false, night: false },
        requiredTimesText: '未设置方案'
      })
    }
  },

  // -------- 情绪 / 睡眠 --------
  selectMood(e) {
    this.setData({ mood: Number(e.currentTarget.dataset.mood) })
  },

  onSleepDurationChange(e) {
    this.setData({ sleepDurationHour: Number(e.detail.value) })
  },

  onSleepQualityChange(e) {
    this.setData({ sleepQuality: Number(e.detail.value) })
  },

  onSleepIssuesChange(e) {
    const values = e.detail.value || []
    let finalValues = values

    if (values.includes('none') && values.length > 1) {
      finalValues = ['none']
    }

    const map = {
      insomnia: finalValues.includes('insomnia'),
      early_wake: finalValues.includes('early_wake'),
      dreams: finalValues.includes('dreams'),
      daytime_sleepy: finalValues.includes('daytime_sleepy'),
      none: finalValues.includes('none')
    }

    this.setData({
      sleepIssues: finalValues,
      sleepIssuesMap: map
    })
  },

  // -------- 用药 --------
  onTakeMedChange(e) {
    const values = e.detail.value || []
    this.setData({
      takeMedMap: {
        morning: values.includes('morning'),
        noon: values.includes('noon'),
        night: values.includes('night')
      }
    })
  },

  // -------- 副作用 --------
  onSideEffectsChange(e) {
    const values = e.detail.value || []
    let finalValues = values

    if (values.includes('none') && values.length > 1) {
      finalValues = ['none']
    }

    const map = {
      sleepy: finalValues.includes('sleepy'),
      dizzy: finalValues.includes('dizzy'),
      nausea: finalValues.includes('nausea'),
      anxiety: finalValues.includes('anxiety'),
      tremor: finalValues.includes('tremor'),
      palpitation: finalValues.includes('palpitation'),
      rash: finalValues.includes('rash'),
      appetite: finalValues.includes('appetite'),
      constipation: finalValues.includes('constipation'),
      other: finalValues.includes('other'),
      none: finalValues.includes('none')
    }

    const next = { sideEffects: finalValues, sideEffectsMap: map }
    if (finalValues.includes('none')) {
      next.sideEffectSeverity = null
      next.sideEffectNote = ''
    }
    this.setData(next)
  },

  onSideEffectSeverityChange(e) {
    this.setData({ sideEffectSeverity: Number(e.detail.value) })
  },

  onSideEffectNoteInput(e) {
    this.setData({ sideEffectNote: e.detail.value || '' })
  },

  // -------- 保存每日记录 --------
  async saveRecord() {
    try {
      if (this.data.mood === null) {
        wx.showToast({ title: '请先选择心情', icon: 'none' })
        return
      }
      if (this.data.sleepQuality === null) {
        wx.showToast({ title: '请先选择睡眠质量', icon: 'none' })
        return
      }

      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      // openid 为空时提示并返回
      if (!openid) {
        wx.showToast({ title: '登录态未就绪，请稍后重试', icon: 'none' })
        return
      }

      wx.showLoading({ title: '保存中...' })

      const db = wx.cloud.database()
      const now = Date.now()
      const dateStr = this.data.todayDate
      const timeText = new Date(now).toLocaleString()

    const takeMedText = this._takeMedToText(
      this.data.takeMedMap,
      this.data.requiredTimesMap,
      this.data.hasPlan
    )

    const planSnapshot = (this.data.hasPlan && this.data.plan)
      ? this._makePlanSnapshot(this.data.plan)
      : {}

    const payload = {
      mood: this.data.mood,

      // D1 风险
      riskSuicidal: this.data.riskSuicidal,
      riskImpulse: this.data.riskImpulse,
      sleepReduced: this.data.sleepReduced,
      energyIncreased: this.data.energyIncreased,

      // 睡眠
      sleepDurationHour: this.data.sleepDurationHour,
      sleepQuality: this.data.sleepQuality,
      sleepIssues: this.data.sleepIssues,

      // 用药
      takeMedMap: this.data.takeMedMap,
      takeMedText,

      // 副作用
      sideEffects: this.data.sideEffects,
      sideEffectSeverity: this.data.sideEffectSeverity,
      sideEffectNote: this.data.sideEffectNote,

      // 方案快照
      planSnapshot
    }

    db.collection('daily_records')
      .where({
        date: dateStr,
        _openid: openid
      })
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []
        if (list.length) {
          // 使用 where + _openid 确保只更新当前用户的记录
          return db.collection('daily_records')
            .where({
              _id: list[0]._id,
              _openid: openid
            })
            .update({
              data: { ...payload, updatedAt: now, updatedTimeText: timeText }
            })
        }
        return db.collection('daily_records').add({
          data: { ...payload, date: dateStr, createdAt: now, updatedAt: now, timeText }
        })
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '保存成功', icon: 'success' })

        this.setData({
          mood: null,

          // D1 复位
          riskSuicidal: 0,
          riskImpulse: 0,
          sleepReduced: false,
          energyIncreased: false,

          // 睡眠
          sleepDurationHour: null,
          sleepQuality: null,
          sleepIssues: [],
          sleepIssuesMap: {
            insomnia: false,
            early_wake: false,
            dreams: false,
            daytime_sleepy: false,
            none: false
          },

          // 用药
          takeMedMap: { morning: false, noon: false, night: false },

          // 副作用
          sideEffects: [],
          sideEffectsMap: {
            sleepy: false,
            dizzy: false,
            nausea: false,
            anxiety: false,
            tremor: false,
            palpitation: false,
            rash: false,
            appetite: false,
            constipation: false,
            other: false,
            none: false
          },
          sideEffectSeverity: null,
          sideEffectNote: ''
        })

        this.loadRecords()
      })
      .catch(err => {
        wx.hideLoading()
        console.error(err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
    } catch (err) {
      wx.hideLoading()
      console.error('saveRecord error:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // -------- 读取记录 --------
  async loadRecords() {
    try {
      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      // openid 为空时直接返回，不抛错
      if (!openid) {
        console.warn('loadRecords: openid not ready, skip')
        this.setData({ records: [] })
        return
      }
      
      const db = wx.cloud.database()
      db.collection('daily_records')
        .where({
          _openid: openid
        })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
        .then(res => {
          this.setData({ records: res.data || [] })
        })
        .catch(err => {
          console.error('loadRecords error:', err)
        })
    } catch (err) {
      console.error('loadRecords error:', err)
      this.setData({ records: [] })
    }
  },

  // -------- helpers --------
  _takeMedToText(takeMedMap, requiredTimesMap, hasPlan) {
    const map = { morning: '早', noon: '中', night: '晚' }
    return ['morning', 'noon', 'night']
      .map(k => `${map[k]}${takeMedMap[k] ? '✓' : '✗'}`)
      .join(' ')
  },

  _makePlanSnapshot(plan) {
    const meds = Array.isArray(plan.meds) ? plan.meds : []
    return {
      meds: meds.map(m => ({
        name: m.name || '',
        doseMgPerDay: m.doseMgPerDay || '',
        times: Array.isArray(m.times) ? m.times : []
      }))
    }
  },

  _timesToText(times) {
    const map = { morning: '早', noon: '中', night: '晚' }
    const arr = Array.isArray(times) ? times : []
    if (!arr.length) return '未设置方案'
    return arr.map(t => map[t] || t).join('、')
  }
})