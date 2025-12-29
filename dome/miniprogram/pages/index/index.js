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
  saveRecord() {
    if (this.data.mood === null) {
      wx.showToast({ title: '请先选择心情', icon: 'none' })
      return
    }
    if (this.data.sleepQuality === null) {
      wx.showToast({ title: '请先选择睡眠质量', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const db = wx.cloud.database()
    const now = new Date()
    const dateStr = this.data.todayDate
    const timeText = now.toLocaleString()

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
      .where({ date: dateStr })
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []
        if (list.length) {
          return db.collection('daily_records').doc(list[0]._id).update({
            data: { ...payload, updatedAt: now, updatedTimeText: timeText }
          })
        }
        return db.collection('daily_records').add({
          data: { ...payload, date: dateStr, createdAt: now, timeText }
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
  },

  // -------- 读取用药方案 --------
  loadPlan() {
    const db = wx.cloud.database()
    return db.collection('med_plan')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []
        if (list.length === 0) {
          this.setData({
            hasPlan: false,
            plan: null,
            requiredTimes: [],
            requiredTimesMap: { morning: false, noon: false, night: false },
            requiredTimesText: '未设置方案'
          })
          return
        }

        const plan = list[0]
        const meds = Array.isArray(plan.meds) ? plan.meds : []
        const requiredTimes = []
        const requiredTimesMap = { morning: false, noon: false, night: false }

        meds.forEach(med => {
          if (Array.isArray(med.times)) {
            med.times.forEach(time => {
              if (time === 'morning' || time === 'noon' || time === 'night') {
                if (!requiredTimes.includes(time)) {
                  requiredTimes.push(time)
                }
                requiredTimesMap[time] = true
              }
            })
          }
        })

        let requiredTimesText = '未设置方案'
        if (requiredTimes.length > 0) {
          const map = { morning: '早', noon: '中', night: '晚' }
          requiredTimesText = requiredTimes.map(t => map[t]).join('、')
        }

        this.setData({
          hasPlan: true,
          plan: plan,
          requiredTimes: requiredTimes,
          requiredTimesMap: requiredTimesMap,
          requiredTimesText: requiredTimesText
        })
      })
      .catch(err => {
        console.error('loadPlan error:', err)
        this.setData({
          hasPlan: false,
          plan: null,
          requiredTimes: [],
          requiredTimesMap: { morning: false, noon: false, night: false },
          requiredTimesText: '未设置方案'
        })
      })
  },

  // -------- 读取记录 --------
  loadRecords() {
    const db = wx.cloud.database()
    db.collection('daily_records')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
      .then(res => {
        this.setData({ records: res.data || [] })
      })
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
  }
})